# api/consumers.py

import json
import asyncio
import time
import traceback
import re
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from collections import deque
import statistics
import math
import numpy as np

from django.conf import settings
from urllib.parse import unquote, parse_qs

from api.session_supervisor import (
    SessionSupervisor,
    get_or_create_supervisor,
    peek_supervisor,
)
from api import session_state


def _parse_client_role(scope) -> str:
    """Extract the client-declared role from a WebSocket ``scope``.

    The frontend appends ``?role=remote`` to WS URLs when the browser is in
    Observer Mode (see InstrumentContext). Anything else — including the
    absence of the query param — is treated as ``host``. Used by consumers
    that need to reject state-mutating commands from remote sockets as a
    defense-in-depth layer over the UI-level gate.
    """
    try:
        raw = (scope.get('query_string') or b'').decode('utf-8', errors='ignore')
        params = parse_qs(raw)
        role = (params.get('role') or ['host'])[0]
        return 'remote' if role == 'remote' else 'host'
    except Exception:
        return 'host'


# Commands on ``CalibrationConsumer`` that a remote observer must never be
# allowed to execute. Anything that starts a run, stops a run, or touches
# physical instrumentation lives here. Read-only operations like
# ``request_live_sync`` stay off the list so observers can still pull the
# live-state snapshot the frontend relies on for mid-run joins.
CALIBRATION_HOST_ONLY_COMMANDS = frozenset({
    'start_collection',
    'start_full_calibration',
    'start_single_stage_batch',
    'start_full_calibration_batch',
    'tvc_characterization',
    'stop_collection',
    'set_amplifier_range',
    'amplifier_confirmed',
    'operation_cancelled',
})

from npsl_tools.instruments import Instrument11713C, Instrument3458A, Instrument5730A, Instrument5790B, Instrument34420A, Instrument8100
from .models import CalibrationReadings, CalibrationResults, CalibrationSession, CalibrationSettings, TestPoint, TestPointSet
from .mock_instruments import is_mock_address, mock_isr_for_model
from .mock_calibration_instruments import resolve_calibration_instrument
from . import outbox as outbox_module


def _inst(real_cls, **kwargs):
    """Construct ``real_cls`` unless MOCK_INSTRUMENTS is on AND the ``gpib``
    address is in the mock inventory, in which case return the matching mock
    drop-in from :mod:`mock_calibration_instruments`.

    Every instrument instantiation inside ``CalibrationConsumer`` routes
    through here, which is what lets the consumer run a full calibration
    sequence against a seeded mock session without any real hardware.
    """
    address = kwargs.get('gpib')
    if getattr(settings, "MOCK_INSTRUMENTS", False) and is_mock_address(address):
        cls = resolve_calibration_instrument(real_cls, address)
    else:
        cls = real_cls
    return cls(**kwargs)

# --- Live-state helper shims ---
# Thin delegators to :mod:`api.session_state` so the existing
# CalibrationConsumer call sites (there are several) don't have to be
# rewritten. Keeping the underscore-prefixed names makes the indirection
# invisible in the hot-path code below while still routing every read/write
# through the accessor layer that Phase 5 will later swap for Redis.
def _get_live_state(session_id):
    return session_state.get_live_state(session_id)


def _peek_live_state(session_id):
    return session_state.peek_live_state(session_id)


def _clear_live_state(session_id):
    session_state.clear_live_state(session_id)


INSTRUMENT_CLASS_MAP = {
    '5730A': Instrument5730A,
    '5790B': Instrument5790B,
    '3458A': Instrument3458A,
    '34420A': Instrument34420A,
    '11713C': Instrument11713C,
    '8100': Instrument8100
}

class InstrumentStatusConsumer(AsyncWebsocketConsumer):
    instrument_instance = None
    instrument_class = None

    async def connect(self):
        self.instrument_model = self.scope['url_route']['kwargs']['instrument_model']
        # gpib_address comes in URL-encoded (visa:// addresses contain /), undo
        # that once here so downstream comparisons see the canonical value.
        self.gpib_address = unquote(self.scope['url_route']['kwargs']['gpib_address'])
        # Same role gate as CalibrationConsumer: remotes read status but must
        # not be able to trigger zero-cal or any future state-mutating op.
        self.client_role = _parse_client_role(self.scope)
        self.instrument_class = INSTRUMENT_CLASS_MAP.get(self.instrument_model)
        if not self.instrument_class:
            await self.close(code=4001)
            return

        # Mock-mode fast path: no pyvisa, no hardware. The frontend treats a
        # "Status Received" WS message as "Connected", so simply accepting the
        # socket and letting get_status_sync return a canned ISR is enough to
        # populate the entire Instrument Status page.
        self.is_mock = getattr(settings, "MOCK_INSTRUMENTS", False) and is_mock_address(self.gpib_address)
        if self.is_mock:
            await self.accept()
            await self.send(text_data=json.dumps({
                'connection_status': 'instrument_connected',
                'instrument_model': self.instrument_model,
                'gpib_address': self.gpib_address,
            }))
            return

        self.instrument_instance = await self.connect_instrument_sync()
        if self.instrument_instance:
            await self.accept()
            await self.send(text_data=json.dumps({
                'connection_status': 'instrument_connected',
                'instrument_model': self.instrument_model,
                'gpib_address': self.gpib_address,
            }))
        else:
            await self.close(code=4004)

    async def disconnect(self, close_code):
        if getattr(self, "is_mock", False):
            return
        if self.instrument_instance:
            await self.close_instrument_sync()
            self.instrument_instance = None

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')

        if command == 'get_instrument_status':
            if getattr(self, "is_mock", False):
                payload = {
                    'instrument_model': self.instrument_model,
                    'gpib_address': self.gpib_address,
                    'timestamp': time.time(),
                    'status_report': 'ok',
                    'raw_isr': mock_isr_for_model(self.instrument_model),
                }
            else:
                status_result = await self.get_status_sync()
                payload = {'instrument_model': self.instrument_model, 'gpib_address': self.gpib_address, 'timestamp': time.time(), **status_result}
            await self.send(text_data=json.dumps(payload))
        elif command == 'run_zero_cal':
            if getattr(self, 'client_role', 'host') == 'remote':
                await self.send(text_data=json.dumps({
                    'type': 'warning',
                    'message': 'Observer mode: controls are read-only.',
                }))
                return
            print(f"[StatusConsumer] Processing Zero Cal request for {self.gpib_address}...")
            # 1. Notify Frontend it started
            await self.send(text_data=json.dumps({
                'type': 'zero_cal_started', 
                'message': 'Zero Calibration started. Please wait...'
            }))

            # 2. Run the BLOCKING driver call (or simulate in mock mode)
            if getattr(self, "is_mock", False):
                # Give the UI a few seconds to show the "Zeroing..." banner
                # so the warning styling can be visually verified.
                await asyncio.sleep(2.5)
                success = True
            else:
                success = await self.run_zero_cal_sync()
            
            if success:
                print(f"[StatusConsumer] Zero Cal complete for {self.gpib_address}")
                # 3. Notify Frontend it finished
                await self.send(text_data=json.dumps({
                    'type': 'zero_cal_complete', 
                    'message': 'Zero Calibration Complete.'
                }))
            else:
                print(f"[StatusConsumer] Zero Cal FAILED for {self.gpib_address}")
                await self.send(text_data=json.dumps({
                    'type': 'error', 
                    'message_text': 'Zero Calibration Failed or Timed Out.'
                }))
            await self.send(text_data=json.dumps({'type': 'status_update', 'message': 'Zero Cal Command Sent'}))
        else:
            await self.send(text_data=json.dumps({'error': 'Unknown command'}))

    @sync_to_async(thread_sensitive=True)
    def connect_instrument_sync(self):
        try:
            if self.instrument_class in [Instrument34420A, Instrument11713C]:
                instance = self.instrument_class(gpib=self.gpib_address)
            else: # Classes that do take a 'model' argument
                instance = self.instrument_class(model=self.instrument_model, gpib=self.gpib_address)
            return instance
        except Exception as e:
            print(f"StatusConsumer: Error instantiating/connecting to {self.gpib_address}: {e}")
            return None

    @sync_to_async(thread_sensitive=True)
    def close_instrument_sync(self):
        if self.instrument_instance:
            connection = getattr(self.instrument_instance, 'resource', None) or getattr(self.instrument_instance, 'device', None)
            if connection and hasattr(connection, 'close'):
                connection.close()

    @sync_to_async(thread_sensitive=True)
    def get_status_sync(self):
        if not self.instrument_instance:
            return {'status_report': 'error', 'error_message': 'Instrument not connected.'}
        try:
            if hasattr(self.instrument_instance, 'get_instrument_status'):
                raw_status = self.instrument_instance.get_instrument_status()
                return {'status_report': 'ok', 'raw_isr': raw_status}
            else:
                return {'status_report': 'ok', 'raw_isr': 'N/A'}
        except Exception as e:
            return {'status_report': 'error', 'error_message': str(e)}

    @sync_to_async(thread_sensitive=False)
    def run_zero_cal_sync(self):
        if self.instrument_instance and hasattr(self.instrument_instance, 'run_zero_cal'):
            try:
                print(f"[StatusConsumer] Calling .run_zero_cal() on instance: {self.instrument_instance}")
                self.instrument_instance.run_zero_cal()
                return True 
                
            except Exception as e:
                print(f"[StatusConsumer] EXCEPTION during .run_zero_cal(): {e}")
                traceback.print_exc()
                return False
        return False


class CalibrationConsumer(AsyncWebsocketConsumer):
    """
    Thin WebSocket adapter in front of a per-session :class:`SessionSupervisor`.

    The consumer used to own the long-running calibration ``asyncio.Task``
    and the primitives that coordinate it (stop event, confirmation
    event, BUSY/IDLE state). That coupling meant a host losing its socket
    — tab close, network blip, browser crash — would tear down the task
    in ``disconnect`` and strand the hardware mid-stage.

    Post-Phase 2, those primitives live on the supervisor. The consumer
    is now a presence + command router:

    * ``connect`` attaches this socket (as host or observer) to the
      session's supervisor, creating the supervisor on first use.
    * ``receive`` translates client commands into supervisor method calls
      (``start_task``, ``stop_task``, ``set_confirmation``).
    * ``disconnect`` only detaches; the task keeps running. If this was
      the last host socket on an active run, the supervisor arms a grace
      window before auto-stopping.

    Proxy properties (``stop_event``, ``confirmation_event``,
    ``confirmation_status``, ``state``, ``collection_task``) forward
    reads/writes to the supervisor, letting the ~1400 lines of task
    methods below continue to reference ``self.*`` without any
    line-by-line edits.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Per-socket bookkeeping — *not* owned by the supervisor because
        # it is genuinely per-socket (one ping loop per WebSocket).
        self.heartbeat_task = None
        # Supervisor handle, set in ``connect()``. Cached on the consumer
        # so every property access is O(1) instead of a registry lookup.
        self.supervisor: SessionSupervisor | None = None

    # ------------------------------------------------------------------
    # Proxy properties: forward the "task coordination" attribute surface
    # to the supervisor. Having these as properties means existing task
    # code that reads ``self.stop_event.is_set()`` or writes
    # ``self.state = "BUSY"`` continues to work verbatim after the
    # refactor, while the underlying storage survives a socket close.
    # ------------------------------------------------------------------

    @property
    def stop_event(self) -> asyncio.Event:
        sup = self.supervisor
        # Fall back to a bound event only while ``supervisor`` is None
        # (i.e. before ``connect`` finishes). This keeps ``__init__`` and
        # the hypothetical pre-connect logging path null-safe; any real
        # task code runs strictly after ``connect``.
        if sup is None:
            sup = self._ensure_local_supervisor_stub()
        return sup.stop_event

    @property
    def confirmation_event(self) -> asyncio.Event:
        sup = self.supervisor
        if sup is None:
            sup = self._ensure_local_supervisor_stub()
        return sup.confirmation_event

    @property
    def confirmation_status(self):
        sup = self.supervisor
        if sup is None:
            return None
        return sup.confirmation_status

    @confirmation_status.setter
    def confirmation_status(self, value):
        sup = self.supervisor
        if sup is None:
            sup = self._ensure_local_supervisor_stub()
        sup.confirmation_status = value

    @property
    def state(self) -> str:
        sup = self.supervisor
        if sup is None:
            return SessionSupervisor.STATE_IDLE
        return sup.state

    @state.setter
    def state(self, value):
        sup = self.supervisor
        if sup is None:
            return
        sup.state = value

    @property
    def collection_task(self):
        """Shim for legacy task code / tests that peek at the running task."""
        sup = self.supervisor
        return None if sup is None else sup.task

    def _ensure_local_supervisor_stub(self) -> SessionSupervisor:
        """Fabricate a throwaway supervisor for pre-connect property reads.

        ``CalibrationConsumer.__init__`` runs before ``connect``, so
        ``self.session_id`` and therefore ``self.supervisor`` aren't
        available yet. This stub gives property getters something
        consistent to return without special-casing every call site. The
        stub is replaced by the real supervisor in ``connect()``.
        """
        if getattr(self, "_stub_supervisor", None) is None:
            self._stub_supervisor = SessionSupervisor(
                session_id=getattr(self, "session_id", 0) or 0,
            )
        self.supervisor = self._stub_supervisor
        return self._stub_supervisor

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.session_group_name = f'session_{self.session_id}'
        
        # --- FIX: Store the parsed string in requested_role ---
        requested_role = _parse_client_role(self.scope)
        
        await self.channel_layer.group_add(self.session_group_name, self.channel_name)
        await self.accept()

        # Attach to (or create) the session's supervisor.
        self.supervisor = await get_or_create_supervisor(self.session_id)
        
        # Pass requested_role to the supervisor, and store the actual granted role
        self.client_role = await self.supervisor.attach(self.channel_name, requested_role)

        # Tell the frontend what its official role is
        await self.send(text_data=json.dumps({
            'type': 'role_assigned',
            'role': self.client_role
        }))

        # Alert the user if the supervisor downgraded them to a remote viewer
        if requested_role == "host" and self.client_role == "remote":
            await self.send(text_data=json.dumps({
                'type': 'warning',
                'message': 'This session is actively being controlled by another user. You are now in Observer mode.'
            }))

        # Guarantee the outbox drainer is alive on the ASGI loop. Safe to call
        # on every connect — subsequent calls are no-ops.
        outbox_module.ensure_drainer_running()

        await self.send_session_sync_status()
        self.heartbeat_task = asyncio.create_task(self.send_heartbeat())

    async def send_session_sync_status(self):
        try:
            session_data = await self.get_session_sync_data(self.session_id)
            if session_data:
                await self.send(text_data=json.dumps({
                    'type': 'connection_sync',
                    'is_complete': session_data['is_complete'],
                    'message': 'Session state synchronized.'
                }))
        except Exception as e:
            print(f"Error sending sync status: {e}")
    
    async def connection_sync(self, event):
        is_complete = event.get('is_complete', False)
        message = event.get('message', 'Session state synchronized.')
        await self.send(text_data=json.dumps({
            'type': 'connection_sync',
            'is_complete': is_complete,
            'message': message
        }))

    @database_sync_to_async
    def get_session_sync_data(self, session_id):
        try:
            session = CalibrationSession.objects.get(pk=session_id)
            return {
                'is_complete': getattr(session, 'is_complete', False) 
            }
        except Exception:
            return None

    async def disconnect(self, close_code):
        # Per-socket heartbeat is still owned by this consumer and must
        # end with the socket; everything else (task, stop_event,
        # confirmation machinery) lives on the supervisor and must
        # survive across short host reconnects. ``detach`` arms the
        # grace window when appropriate — we deliberately do NOT cancel
        # the running task here any more.
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
        if self.supervisor is not None:
            try:
                await self.supervisor.detach(self.channel_name)
            except Exception:
                # detach is best-effort; a bug here should never mask a
                # real disconnect reason.
                pass
        await self.channel_layer.group_discard(self.session_group_name, self.channel_name)

    async def send_heartbeat(self):
        while True:
            try:
                await asyncio.sleep(25)
                await self.send(text_data=json.dumps({'type': 'ping'}))
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in heartbeat task: {e}")
                break

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')

        # Live chart sync for session observers (remotes on collect-readings).
        # The server itself is the source of truth for the in-flight buffer, so
        # a remote joining mid-run gets a complete snapshot directly from the
        # consumer's state — no host-browser relay required. Runs regardless of
        # self.state so late joiners can still catch up during an active run.
        if command == 'request_live_sync':
            state = _peek_live_state(self.session_id)
            await self.send(text_data=json.dumps({
                'type': 'live_state_sync',
                **state,
            }))
            return

        # Defense-in-depth: the UI disables these controls for remote viewers,
        # but a hand-crafted client could still send them directly. Drop any
        # host-only command that arrives on a remote-role socket before it
        # can touch instrumentation or flip ``self.state``.
        if getattr(self, 'client_role', 'host') == 'remote' and command in CALIBRATION_HOST_ONLY_COMMANDS:
            await self.send(text_data=json.dumps({
                'type': 'warning',
                'message': 'Observer mode: controls are read-only.',
            }))
            return

        if command in ['amplifier_confirmed', 'operation_cancelled']:
            # Route through the supervisor so the running task (which
            # may be owned by a previous socket that has since dropped)
            # observes the confirmation regardless of which consumer the
            # operator clicked from.
            if self.supervisor is not None:
                await self.supervisor.set_confirmation(
                    'confirmed' if command == 'amplifier_confirmed' else 'cancelled'
                )
            return

        if command == 'stop_collection':
            if self.supervisor is not None:
                await self.supervisor.stop_task()
            await self.broadcast(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Collection stopped by user.'}))
            return

        if self.state == "BUSY":
            await self.send(text_data=json.dumps({'type': 'error', 'message': 'A collection is already in progress.'}))
            return

        # Map command -> (kind, coroutine factory). Building the coroutine
        # up front — and handing it to the supervisor to own — keeps task
        # creation atomic: once ``start_task`` returns True the
        # supervisor has committed to running it, so a racing second
        # start from another host socket cleanly bounces off.
        task_dispatch = {
            'start_collection': ('collection', self.collect_single_reading_set),
            'start_full_calibration': ('full_calibration', self.run_full_calibration_sequence),
            'start_single_stage_batch': ('single_stage_batch', self.run_single_stage_batch),
            'start_full_calibration_batch': ('full_calibration_batch', self.run_full_calibration_batch),
            'tvc_characterization': ('tvc_characterization', self.run_tvc_characterization),
        }
        if command in task_dispatch:
            if self.supervisor is None:  # pragma: no cover — connect() always sets it
                await self.send(text_data=json.dumps({'type': 'error', 'message': 'Session supervisor missing; reconnect and try again.'}))
                return
            kind, factory = task_dispatch[command]
            started = await self.supervisor.start_task(kind, factory(data))
            if not started:
                await self.send(text_data=json.dumps({'type': 'error', 'message': 'A collection is already in progress.'}))
        elif command == 'set_amplifier_range':
            await self.set_amplifier_range(data)

    async def _handle_amplifier_confirmation(self, amplifier_instrument, amplifier_range, data):
        if data.get('bypass_amplifier_confirmation'):
            return True

        if not amplifier_instrument or not amplifier_range:
            return True

        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Setting amplifier range to {amplifier_range} A..."}))
        await sync_to_async(amplifier_instrument.set_range, thread_sensitive=True)(range_amps=float(amplifier_range))

        self.confirmation_event.clear()
        self.confirmation_status = None

        await self.broadcast(text_data=json.dumps({'type': 'awaiting_amplifier_confirmation', 'range': amplifier_range}))
        await self.confirmation_event.wait()

        if self.confirmation_status != 'confirmed':
            await self.broadcast(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Operation cancelled by user.'}))
            return False 

        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': "Amplifier range confirmed by user."}))
        return True 

    async def set_amplifier_range(self, data):
        amplifier = None
        try:
            session_details = await self.get_session_details()
            amp_address = session_details.get('amplifier_address')
            amp_range = data.get('amplifier_range')
            if amp_address and amp_range:
                amplifier = await sync_to_async(_inst, thread_sensitive=True)(Instrument8100, model='8100', gpib=amp_address)
                await sync_to_async(amplifier.set_range, thread_sensitive=True)(range_amps=float(amp_range))
                await self.broadcast(text_data=json.dumps({'type': 'amplifier_range_set', 'message': 'Amplifier range set successfully.'}))
            else:
                await self.broadcast(text_data=json.dumps({'type': 'error', 'message': 'Amplifier address or range not configured for this session.'}))
        except Exception as e:
            traceback.print_exc()
            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"Failed to set amplifier range: {e}"}))
        finally:
            if amplifier and hasattr(amplifier, 'close'):
                await sync_to_async(amplifier.close, thread_sensitive=True)()

    @sync_to_async(thread_sensitive=False)
    def _take_one_reading(self, instrument):
        return instrument.read_instrument()

    # --- Server-side live buffer helpers ---
    # Mirror the frontend's InstrumentContext live state inside the consumer so
    # any viewer joining mid-run gets an authoritative snapshot from a single
    # source of truth (see ``request_live_sync`` handler in ``receive``).

    def _buffer_set_stage(self, stage, tp_id=None, total=0):
        """Record that ``stage`` is now in flight for ``tp_id`` and reset its arrays."""
        state = _get_live_state(self.session_id)
        state['isCollecting'] = True
        state['activeCollectionDetails'] = {'stage': stage, 'tpId': tp_id, 'readingKey': stage}
        state['liveReadings'][stage] = []
        state['tiLiveReadings'][stage] = []
        state['collectionProgress'] = {'count': 0, 'total': total}

    def _buffer_set_batch_point(self, test_point):
        """Mark a new test point in a batch run: wipe per-TP live arrays and refresh focus."""
        state = _get_live_state(self.session_id)
        state['isCollecting'] = True
        state['liveReadings'] = {}
        state['tiLiveReadings'] = {}
        if test_point:
            current = test_point.get('current')
            frequency = test_point.get('frequency')
            state['focusedTPKey'] = f"{current}-{frequency}"

    def _buffer_append_sample(self, stage, std_raw, ti_raw, count, total):
        """Upsert the latest STD/TI sample into the buffer, deduped by x=count."""
        state = _get_live_state(self.session_id)

        def _to_cached(raw):
            if raw is None:
                return None
            ts = raw.get('timestamp', 0) or 0
            return {
                'x': count,
                'y': raw.get('value'),
                't': int(ts * 1000),
                'is_stable': raw.get('is_stable', True),
            }

        def _upsert(bucket, point):
            if point is None:
                return
            arr = bucket.setdefault(stage, [])
            x = point.get('x')
            for i, existing in enumerate(arr):
                if existing.get('x') == x:
                    arr[i] = point
                    return
            arr.append(point)

        _upsert(state['liveReadings'], _to_cached(std_raw))
        _upsert(state['tiLiveReadings'], _to_cached(ti_raw))
        state['collectionProgress'] = {'count': count, 'total': total}

    def _buffer_clear(self):
        _clear_live_state(self.session_id)

    @database_sync_to_async
    def get_session_details(self):
        try:
            session = CalibrationSession.objects.get(pk=self.session_id)
            return {
                'ac_source_address': session.ac_source_address,
                'dc_source_address': session.dc_source_address,
                'std_reader_address': session.standard_reader_address,
                'std_reader_model': session.standard_reader_model,
                'ti_reader_address': session.test_reader_address,
                'ti_reader_model': session.test_reader_model,
                'amplifier_address': session.amplifier_address,
                'switch_driver_address': session.switch_driver_address,
            }
        except CalibrationSession.DoesNotExist: return None

    async def _verify_initial_reading(self, instrument, instrument_name, expected_value, tolerance=0.10):
        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Taking pre-check sample from {instrument_name}..."}))
        reading = await self._take_one_reading(instrument)
        
        lower_bound = expected_value * (1 - tolerance)
        upper_bound = expected_value * (1 + tolerance)
        reading_abs = abs(reading)

        if lower_bound <= reading_abs <= upper_bound:
            await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"{instrument_name} check passed. Reading: {reading_abs:.4f}V"}))
            return True
        else:
            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"{instrument_name} pre-check failed. Reading: {reading_abs:.4f}V, Expected: ~{expected_value:.4f}V"}))
            return False

    async def _configure_sources(self, test_point_data, bypass_tvc, amplifier_range, ac_source=None, dc_source=None):
        if isinstance(test_point_data, list) and test_point_data:
            config_point = test_point_data[0]
        elif isinstance(test_point_data, dict):
            config_point = test_point_data
        else:
            print("[CONFIGURE_SOURCES] Warning: No valid test point data provided. Skipping.")
            return

        input_current = float(config_point.get('current'))
        voltage = (input_current / float(amplifier_range)) * 2

        if ac_source:
            frequency = float(config_point.get('frequency', 0))
            # Set initial voltage and frequency while in standby
            await sync_to_async(ac_source.set_output, thread_sensitive=True)(voltage=voltage, frequency=frequency)
            
            # ---> Send the XFER command immediately after configuring the AC source <---
            if hasattr(ac_source, 'set_ac_transfer'):
                await sync_to_async(ac_source.set_ac_transfer, thread_sensitive=True)(enabled=False)
        
        if dc_source:
            await sync_to_async(dc_source.set_output, thread_sensitive=True)(voltage=voltage, frequency=0)

    async def _activate_sources(self, ac_source=None, dc_source=None):
        if ac_source:
            await sync_to_async(ac_source.set_operate, thread_sensitive=True)()
        if dc_source:
            if ac_source is not dc_source:
                await sync_to_async(dc_source.set_operate, thread_sensitive=True)()

    async def _perform_warmup(self, warmup_time):
        if not warmup_time or warmup_time <= 0:
            return

        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Initial warm-up period started for {warmup_time}s..."}))
        
        try:
            await asyncio.sleep(warmup_time)
        except asyncio.CancelledError:
            raise

        if not self.stop_event.is_set():
            await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': "Warm-up complete. Starting measurement."}))
    
    async def run_tvc_characterization(self, data):
        print(f"[TVC_CHAR] Entering run_tvc_characterization with data: {data}", flush=True)
        ac_source, dc_source, std_reader, ti_reader, amplifier, switch_driver = None, None, None, None, None, None
        try:
            print("[TVC_CHAR] Fetching session details...", flush=True)
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")

            std_addr, ti_addr = session_details.get('std_reader_address'), session_details.get('ti_reader_address')
            std_model, ti_model = session_details.get('std_reader_model'), session_details.get('ti_reader_model')

            # --- Source routing driven by the "characterization_source" setting ---
            # Default is "DC" (more stable, frequency-independent shunt gain);
            # "AC" preserves the legacy per-frequency behavior for users who
            # explicitly opt in from the Characterization section of Settings.
            char_source_kind = (data.get('characterization_source') or 'DC').upper()
            if char_source_kind not in ('AC', 'DC'):
                char_source_kind = 'DC'
            print(f"[TVC_CHAR] Source kind: {char_source_kind}", flush=True)

            ac_source_address = session_details.get('ac_source_address')
            dc_source_address = session_details.get('dc_source_address')

            # Handle the common case where the same physical unit (e.g. 5730A)
            # serves as both AC and DC source.
            if ac_source_address and dc_source_address and ac_source_address == dc_source_address:
                shared_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address:
                    ac_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                if dc_source_address:
                    dc_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=dc_source_address)

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader = await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, model=ti_model, gpib=ti_addr)

            if session_details.get('switch_driver_address'):
                switch_driver = await sync_to_async(_inst, thread_sensitive=True)(Instrument11713C, gpib=session_details.get('switch_driver_address'))
                await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {char_source_kind} source for Characterization..."}))
                if char_source_kind == 'AC':
                    await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                else:
                    await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                await self.broadcast(text_data=json.dumps({'type': 'switch_status_update', 'active_source': char_source_kind}))
                await asyncio.sleep(1)

            original_tp = data.get('test_point')
            nominal_current = float(original_tp.get('current'))

            # --- EXTRACT TARGET FROM PAYLOAD ---
            target_tvc = data.get('target_tvc', 'BOTH')
            print(f"[TVC_CHAR] Targeting: {target_tvc}", flush=True)

            # ``dict.get`` only returns the default when the key is missing,
            # not when the value is present-but-``None``. Frontend payloads
            # often send ``initial_warm_up_time: null`` which would crash the
            # ``warmup_time > 0`` comparison; ``or 0`` coerces null/0/'' to 0.
            warmup_time = data.get('initial_warm_up_time') or 0

            # During warm-up, always energize/configure both AC and DC sources so
            # the timer preconditions the full source chain before calibration.
            # For no-warmup characterization runs, keep existing single-source behavior.
            if warmup_time > 0:
                await self._configure_sources(
                    original_tp,
                    data.get('bypass_tvc'),
                    data.get('amplifier_range'),
                    ac_source=ac_source,
                    dc_source=dc_source
                )
            else:
                configure_kwargs = {'ac_source': ac_source} if char_source_kind == 'AC' else {'dc_source': dc_source}
                await self._configure_sources(original_tp, data.get('bypass_tvc'), data.get('amplifier_range'), **configure_kwargs)

            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(_inst, thread_sensitive=True)(Instrument8100, model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data): return

            if warmup_time > 0:
                await self._activate_sources(ac_source=ac_source, dc_source=dc_source)
            else:
                activate_kwargs = {'ac_source': ac_source} if char_source_kind == 'AC' else {'dc_source': dc_source}
                await self._activate_sources(**activate_kwargs)

            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            settling_time, num_samples = float(data.get('settling_time', 5.0)), data.get('num_samples', 8)
            nplc_setting, measurement_params = data.get('nplc'), data.get('measurement_params')

            # === TARGETED DB CLEANUP BLOCK ===
            try:
                tp_id = original_tp.get('id')
                if tp_id:
                    readings_obj = await database_sync_to_async(CalibrationReadings.objects.get)(test_point__id=tp_id)
                    # Only wipe the arrays for the instrument we are actively characterizing
                    if target_tvc in ['STD', 'BOTH']:
                        readings_obj.std_char_plus1_readings = []
                        readings_obj.std_char_minus_readings = []
                        readings_obj.std_char_plus2_readings = []
                    if target_tvc in ['TI', 'BOTH']:
                        readings_obj.ti_char_plus1_readings = []
                        readings_obj.ti_char_minus_readings = []
                        readings_obj.ti_char_plus2_readings = []
                    await database_sync_to_async(readings_obj.save)()
                    print(f"[TVC_CHAR] Wiped previous {target_tvc} characterization data.", flush=True)
            except Exception as e:
                pass
            # === END CLEANUP ===

            tvc_sequence = [
                ('char_plus1', 1.0005),
                ('char_minus', 0.9995),
                ('char_plus2', 1.0005)
            ]

            print("[TVC_CHAR] ===== STARTING CHARACTERIZATION LOOP =====", flush=True)
            active_source = ac_source if char_source_kind == 'AC' else dc_source
            for stage, ppm_multiplier in tvc_sequence:
                if self.stop_event.is_set(): break

                ppm_shifted_tp = original_tp.copy()
                ppm_shifted_tp['current'] = nominal_current * ppm_multiplier

                # --- INJECT TARGET + SOURCE KIND INTO TEST POINT ---
                # characterization_source lets _perform_single_measurement
                # decide whether this char stage should be treated as an AC
                # or DC reading (instrument config, reader mode, etc.).
                ppm_shifted_tp['target_tvc'] = target_tvc
                ppm_shifted_tp['characterization_source'] = char_source_kind

                self._buffer_set_stage(stage, tp_id=original_tp.get('id'), total=num_samples)
                await self.broadcast(text_data=json.dumps({'type': 'calibration_stage_update', 'stage': stage, 'total': num_samples}))

                success = await self._perform_single_measurement(
                    stage, num_samples, ppm_shifted_tp, data.get('bypass_tvc'),
                    data.get('amplifier_range'), active_source, std_reader, ti_reader,
                    amplifier, settling_time, nplc_setting, measurement_params
                )
                
                if not success: 
                    if not self.stop_event.is_set():
                        await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"Characterization aborted: Stability limit reached on {stage}."}))
                    break 

            if not self.stop_event.is_set():
                print("[TVC_CHAR] Sequence completed successfully!", flush=True)

                # --- Propagate freshly-computed eta to sibling points in the session ---
                # update_related_results() in save_readings_to_db has already written
                # eta_std / eta_ti onto this TP's CalibrationResults row. For a batch
                # that only characterizes once (e.g. "Characterize Test TVC before run"),
                # every other selected point would otherwise fall back to eta=1.0
                # inside calculate_ac_dc_difference(). Backfill them now so the real
                # gain is used downstream.
                try:
                    tp_id_for_prop = (original_tp or {}).get('id')
                    if tp_id_for_prop:
                        await self._propagate_characterization_eta(
                            tp_id_for_prop, target_tvc, char_source_kind
                        )
                except Exception as prop_err:
                    # Propagation is best-effort; never block the user-visible
                    # "characterization complete" signal because of it.
                    print(f"[TVC_CHAR] Eta propagation step failed: {prop_err}", flush=True)

                await self.broadcast(text_data=json.dumps({'type': 'collection_finished', 'message': 'Sensitivity Characterization complete.'}))

        except asyncio.CancelledError:
            print(f"[TVC_CHAR] Task cancelled.", flush=True)
        except Exception as e:
            traceback.print_exc()
            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            self.state = "IDLE"
            self._buffer_clear()
            if switch_driver and hasattr(switch_driver, 'close'):
                await sync_to_async(switch_driver.close, thread_sensitive=True)()
            # Reset whichever source(s) we actually instantiated. When
            # AC and DC share the same physical unit, the set dedupes for us.
            for src in filter(None, {ac_source, dc_source}):
                await sync_to_async(src.reset, thread_sensitive=True)()
            if amplifier:
                await sync_to_async(amplifier.set_standby, thread_sensitive=True)()
            for inst in filter(None, {std_reader, ti_reader, amplifier, ac_source, dc_source}):
                if hasattr(inst, 'close'):
                    await sync_to_async(inst.close, thread_sensitive=True)()

    async def _perform_single_measurement(self, reading_type_base, num_samples, test_point_data, bypass_tvc, amplifier_range, source_instrument, std_reader_instrument, ti_reader_instrument, amplifier_instrument=None, settling_time=0, nplc_setting=None, measurement_params=None):
        """
        Refactored measurement logic: 
        1. Phase 1 (Search): Discards samples (slides window) until initial stability is found.
        2. Phase 2 (Collection): Collects num_samples while monitoring stability.
        3. Abort: Returns False if max_attempts is reached.
        """
        # Standard stages are classified purely by their name; characterization
        # stages ("char_*") defer to the caller's chosen source kind
        # (DC by default, AC only when explicitly selected in Settings).
        if 'char' in reading_type_base:
            char_source = (test_point_data.get('characterization_source') or 'DC').upper()
            is_ac_reading = (char_source == 'AC')
        else:
            is_ac_reading = 'ac' in reading_type_base
        target_tvc = test_point_data.get('target_tvc', 'BOTH')
        
        input_current = float(test_point_data.get('current'))
        voltage = (input_current / float(amplifier_range)) * 2
        if 'neg' in reading_type_base: voltage = -voltage
        
        config_voltage, frequency = abs(voltage), float(test_point_data.get('frequency', 0)) if is_ac_reading else 0
        ignore_after_lock = measurement_params.get('ignore_instability_after_lock', False)

        # Instrument Configuration (Standard and TI) - Targeted Isolation
        instruments_to_config = []
        if target_tvc in ['STD', 'BOTH'] and std_reader_instrument:
            instruments_to_config.append(std_reader_instrument)
        if target_tvc in ['TI', 'BOTH'] and ti_reader_instrument:
            instruments_to_config.append(ti_reader_instrument)

        for instrument in instruments_to_config:
            if isinstance(instrument, Instrument34420A) and nplc_setting is not None:
                await sync_to_async(instrument.set_integration, thread_sensitive=True)(setting=nplc_setting)
            if isinstance(instrument, Instrument5790B): 
                await sync_to_async(instrument.set_range, thread_sensitive=True)(value=config_voltage)
                await sync_to_async(instrument.resource.write, thread_sensitive=True)("HIRES OFF")
                await sync_to_async(instrument.resource.write, thread_sensitive=True)("DFILT FAST,COARSE")
            elif isinstance(instrument, Instrument3458A): 
                await sync_to_async(instrument.configure_measurement, thread_sensitive=True)(
                    **{'function': 'ACV' if is_ac_reading else 'DCV', 'expected_value': config_voltage, 'frequency': frequency}
                )

        await sync_to_async(source_instrument.set_output, thread_sensitive=True)(voltage=voltage, frequency=frequency)
        
        try:
            await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            raise
        
        if settling_time > 0:
            await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Settling for {settling_time}s..."}))
            await asyncio.sleep(settling_time)

        tp_id = test_point_data.get('id')
        if tp_id:
            await self.set_test_point_failed_status(tp_id, False)

        # Stability Logic Setup
        stability_method = measurement_params.get('stability_check_method', 'sliding_window')
        max_retries = measurement_params.get('max_attempts', 50)
        instability_events = 0
        window_size = measurement_params.get('window', 30)
        threshold_ppm = measurement_params.get('threshold_ppm', 10)

        # Final saved array
        final_std_readings = []
        final_ti_readings = []
        
        # Temporary buffers for search phase
        stable_candidate_std = []
        stable_candidate_ti = []

        initial_stability_achieved = False if stability_method == 'sliding_window' else True

        def calc_ppm(points):
            """Welford's Algorithm for high-precision variance calculation."""
            if len(points) < 2: return float('inf')
            mean_val = 0.0
            M2 = 0.0
            for index, p in enumerate(points):
                val = p['value']
                delta = val - mean_val
                mean_val += delta / (index + 1)
                M2 += delta * (val - mean_val)
            variance = M2 / (len(points) - 1)
            stdev_val = math.sqrt(variance)
            return (stdev_val / abs(mean_val)) * 1_000_000 if abs(mean_val) > 1e-9 else 0

        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': "Monitoring stability..."}))

        def get_target_length():
            return len(final_std_readings) if target_tvc in ['STD', 'BOTH'] else len(final_ti_readings)

        # Replaces raw final_std_readings length with the dynamic targeted check
        while get_target_length() < num_samples and not self.stop_event.is_set():
            # 1. Global Abort Check (Applies to both Search and Collection phases)
            if instability_events >= max_retries:
                tp_key = f"{test_point_data.get('current')}-{test_point_data.get('frequency')}"
                if tp_id:
                    await self.set_test_point_failed_status(tp_id, True)
                await self.broadcast(text_data=json.dumps({
                    'type': 'warning',
                    'message': f"Test point aborted: Stability limit ({max_retries}) reached.",
                    'tpKey': tp_key
                }))
                return False

            # 2. Take Readings (Targeted Instrument Querying)
            tasks = []
            if target_tvc in ['STD', 'BOTH'] and std_reader_instrument:
                tasks.append(self._take_one_reading(std_reader_instrument))
            else:
                tasks.append(asyncio.sleep(0)) # Dummy task

            if target_tvc in ['TI', 'BOTH'] and ti_reader_instrument:
                tasks.append(self._take_one_reading(ti_reader_instrument))
            else:
                tasks.append(asyncio.sleep(0)) # Dummy task

            results = await asyncio.gather(*tasks)
            
            std_reading_val = results[0] if target_tvc in ['STD', 'BOTH'] else None
            ti_reading_val = results[1] if target_tvc in ['TI', 'BOTH'] else None
            
            timestamp = time.time()
            
            # None creation protects downstream arrays from bloating with fake points
            std_point = {'value': std_reading_val, 'timestamp': timestamp, 'is_stable': True} if std_reading_val is not None else None
            ti_point = {'value': ti_reading_val, 'timestamp': timestamp, 'is_stable': True} if ti_reading_val is not None else None

            if stability_method == 'sliding_window':
                if std_point: stable_candidate_std.append(std_point)
                if ti_point: stable_candidate_ti.append(ti_point)

                # Route the window length checks and math to whichever array is actively growing
                primary_candidates = stable_candidate_std if target_tvc in ['STD', 'BOTH'] else stable_candidate_ti

                if len(primary_candidates) >= window_size:
                    # Analyze current window
                    current_window = primary_candidates[-window_size:]
                    current_ppm = calc_ppm(current_window)
                    is_currently_stable = current_ppm < threshold_ppm

                    # --- EVALUATE STABILITY & INCREMENT BEFORE SENDING ---
                    if not initial_stability_achieved:
                        if is_currently_stable:
                            initial_stability_achieved = True
                            if std_point: final_std_readings.extend(stable_candidate_std)
                            if ti_point: final_ti_readings.extend(stable_candidate_ti)
                        else:
                            # SEARCH PHASE: Unstable. Increment retry count and slide window
                            instability_events += 1
                            if std_point: stable_candidate_std.pop(0)
                            if ti_point: stable_candidate_ti.pop(0)
                    else:
                        # COLLECTION PHASE: Monitor but keep all samples
                        if not is_currently_stable and not ignore_after_lock:
                            instability_events += 1
                        if std_point: final_std_readings.append(std_point)
                        if ti_point: final_ti_readings.append(ti_point)

                    # --- NOW SEND UPDATES WITH THE ACCURATE METRICS ---
                    await self.broadcast(text_data=json.dumps({
                        'type': 'sliding_window_update',
                        'ppm': current_ppm,
                        'stdev_ppm': current_ppm,
                        'is_stable': is_currently_stable,
                        'instability_events': instability_events,
                        'max_retries': max_retries
                    }))
                    
                    await self.broadcast(text_data=json.dumps({
                        'type': 'status_update',
                        'message': f"Stdev: {current_ppm:.2f} PPM [{instability_events}/{max_retries}]"
                    }))

                    # Announce stability ONLY exactly when it is found
                    if initial_stability_achieved and is_currently_stable and get_target_length() == window_size:
                        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': "Initial stability achieved."}))

                else:
                    # Still filling initial window
                    await self.broadcast(text_data=json.dumps({
                        'type': 'status_update',
                        'message': f"Filling initial window... [{len(primary_candidates)}/{window_size}]"
                    }))
                    
                    temp_ppm = calc_ppm(primary_candidates) if len(primary_candidates) > 1 else None
                    temp_is_stable = (temp_ppm < threshold_ppm) if temp_ppm is not None else True
                    
                    await self.broadcast(text_data=json.dumps({
                        'type': 'sliding_window_update',
                        'ppm': temp_ppm,
                        'stdev_ppm': temp_ppm,
                        'is_stable': temp_is_stable,
                        'instability_events': instability_events,
                        'max_retries': max_retries
                    }))
            else:
                if std_point: final_std_readings.append(std_point)
                if ti_point: final_ti_readings.append(ti_point)

            # Update the UI with the latest points depending on targeted length
            if initial_stability_achieved:
                current_count = get_target_length()
            else:
                current_count = len(stable_candidate_std) if target_tvc in ['STD', 'BOTH'] else len(stable_candidate_ti)

            # Mirror every sample into the server-side live buffer so late-
            # joining remotes reconstruct the chart from a single source of
            # truth instead of stitching a host snapshot to DB historicals.
            self._buffer_append_sample(reading_type_base, std_point, ti_point, current_count, num_samples)

            await self.broadcast(text_data=json.dumps({
                'type': 'dual_reading_update',
                'std_reading': std_point,
                'ti_reading': ti_point,
                'count': current_count,
                'stable_count': get_target_length(),
                'total': num_samples,
                'stage': reading_type_base
            }))

            await asyncio.sleep(0.05)
        
        # Save the final (locked) sets to the database (respects skip targets)
        if not self.stop_event.is_set():
            if target_tvc in ['STD', 'BOTH'] and final_std_readings:
                await self.save_readings_to_db(f"std_{reading_type_base}", final_std_readings, test_point_data)
            if target_tvc in ['TI', 'BOTH'] and final_ti_readings:
                await self.save_readings_to_db(f"ti_{reading_type_base}", final_ti_readings, test_point_data)
            
            await self.broadcast(text_data=json.dumps({
                'type': 'connection_sync',
                'is_complete': False,
                'message': f'{reading_type_base} stage data saved.'
            }))
        
        return True
    
    async def collect_single_reading_set(self, data):
        ac_source, dc_source, std_reader_instrument, ti_reader_instrument, amplifier_instrument, switch_driver = None, None, None, None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")
            
            std_addr = session_details.get('std_reader_address')
            ti_addr = session_details.get('ti_reader_address')
            std_model = session_details.get('std_reader_model')
            ti_model = session_details.get('ti_reader_model')
            
            if session_details.get('switch_driver_address'):
                switch_driver = await sync_to_async(_inst, thread_sensitive=True)(Instrument11713C, gpib=session_details.get('switch_driver_address'))

            reading_type_base = data.get('reading_type')
            is_ac_reading = 'ac' in reading_type_base

            if switch_driver:
                required_state = 'AC' if is_ac_reading else 'DC'
                await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_state} source..."}))
                if required_state == 'AC':
                    await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                else:
                    await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                
                await self.broadcast(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_state}))
                await asyncio.sleep(1)

            ac_source_address = session_details.get('ac_source_address')
            dc_source_address = session_details.get('dc_source_address')

            if ac_source_address and ac_source_address == dc_source_address:
                shared_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: 
                    ac_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                if dc_source_address: 
                    dc_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=dc_source_address)

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader_instrument = await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, model=std_model, gpib=std_addr)
            ti_reader_instrument = await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, model=ti_model, gpib=ti_addr)
            
            await self._configure_sources(
                data.get('test_point'), 
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )

            if session_details.get('amplifier_address'):
                amplifier_instrument = await sync_to_async(_inst, thread_sensitive=True)(Instrument8100, model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier_instrument, data.get('amplifier_range'), data): return

            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)

            # ``dict.get`` only returns the default when the key is missing,
            # not when the value is present-but-``None``. Frontend payloads
            # often send ``initial_warm_up_time: null`` which would crash the
            # ``warmup_time > 0`` comparison; ``or 0`` coerces null/0/'' to 0.
            warmup_time = data.get('initial_warm_up_time') or 0
            
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            source_instrument = ac_source if is_ac_reading else dc_source
            if not source_instrument:
                raise Exception(f"Required {'AC' if is_ac_reading else 'DC'} Source is not assigned.")

            self._buffer_set_stage(
                reading_type_base,
                tp_id=(data.get('test_point') or {}).get('id'),
                total=data.get('num_samples') or 0,
            )
            await self.broadcast(text_data=json.dumps({
                'type': 'calibration_stage_update',
                'stage': reading_type_base,
                'total': data.get('num_samples')
            }))

            success = await self._perform_single_measurement(
                reading_type_base, 
                data.get('num_samples'), 
                data.get('test_point'), 
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                source_instrument, 
                std_reader_instrument, 
                ti_reader_instrument, 
                amplifier_instrument, 
                float(data.get('settling_time', 0.0)), 
                data.get('nplc'), 
                data.get('measurement_params')
            )
            
            if success and not self.stop_event.is_set():
                await self.broadcast(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))
            elif not success and not self.stop_event.is_set():
                await self.broadcast(text_data=json.dumps({'type': 'error', 'message': 'Test point aborted due to stability limit.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            self.state = "IDLE"
            self._buffer_clear()
            if switch_driver:
                await sync_to_async(switch_driver.deactivate_all, thread_sensitive=True)()
                await self.broadcast(text_data=json.dumps({'type': 'switch_status_update', 'active_source': 'AC'}))
                if hasattr(switch_driver, 'close'): await sync_to_async(switch_driver.close, thread_sensitive=True)()
            
            sources_to_shutdown = list(filter(None, {ac_source, dc_source}))
            for source in sources_to_shutdown:
                await sync_to_async(source.reset, thread_sensitive=True)()

            if amplifier_instrument: await sync_to_async(amplifier_instrument.set_standby, thread_sensitive=True)()
            
            for inst in filter(None, {std_reader_instrument, ti_reader_instrument, amplifier_instrument, ac_source, dc_source}):
                if hasattr(inst, 'close'):
                    await sync_to_async(inst.close, thread_sensitive=True)()

    async def run_full_calibration_sequence(self, data):
        ac_source, dc_source, std_reader, ti_reader, amplifier = None, None, None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")

            std_addr, ti_addr = session_details.get('std_reader_address'), session_details.get('ti_reader_address')
            std_model, ti_model = session_details.get('std_reader_model'), session_details.get('ti_reader_model')

            ac_source_address, dc_source_address = session_details.get('ac_source_address'), session_details.get('dc_source_address')
            
            if ac_source_address and ac_source_address == dc_source_address:
                shared_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: ac_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                if dc_source_address: dc_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=dc_source_address)

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader = await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, model=ti_model, gpib=ti_addr)

            await self._configure_sources(
                data.get('test_point'), 
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )
            
            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(_inst, thread_sensitive=True)(Instrument8100, model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data): return
            
            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)
            
            # ``dict.get`` only returns the default when the key is missing,
            # not when the value is present-but-``None``. Frontend payloads
            # often send ``initial_warm_up_time: null`` which would crash the
            # ``warmup_time > 0`` comparison; ``or 0`` coerces null/0/'' to 0.
            warmup_time = data.get('initial_warm_up_time') or 0
            
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            settling_time, num_samples, nplc_setting, measurement_params = float(data.get('settling_time', 5.0)), data.get('num_samples', 8), data.get('nplc'), data.get('measurement_params')

            for stage in ['ac_open', 'dc_pos', 'dc_neg', 'ac_close']:
                if self.stop_event.is_set(): break
                
                switch_driver = None
                try:
                    if session_details.get('switch_driver_address'):
                        switch_driver = await sync_to_async(_inst, thread_sensitive=True)(Instrument11713C, gpib=session_details.get('switch_driver_address'))
                        required_switch_state = 'AC' if 'ac' in stage else 'DC'
                        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_switch_state} source..."}))
                        if required_switch_state == 'AC': await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                        else: await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                        await self.broadcast(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_switch_state}))
                        await asyncio.sleep(1)

                    source_instrument = ac_source if 'ac' in stage else dc_source
                    if not source_instrument: raise Exception(f"Required {'AC' if 'ac' in stage else 'DC'} Source is not assigned.")
                    
                    self._buffer_set_stage(stage, tp_id=(data.get('test_point') or {}).get('id'), total=num_samples)
                    await self.broadcast(text_data=json.dumps({'type': 'calibration_stage_update', 'stage': stage, 'total': num_samples}))
                    
                    success = await self._perform_single_measurement(stage, num_samples, data.get('test_point'), data.get('bypass_tvc'), data.get('amplifier_range'), source_instrument, std_reader, ti_reader, amplifier, settling_time, nplc_setting, measurement_params)
                    
                    # Stop sequence if measurement fails due to instability limits
                    if not success: 
                        if not self.stop_event.is_set():
                            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"Sequence aborted: Stability limit reached on {stage}."}))
                        break 
                finally:
                    if switch_driver and hasattr(switch_driver, 'close'): await sync_to_async(switch_driver.close, thread_sensitive=True)()
            
            if not self.stop_event.is_set():
                await self.broadcast(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            self.state = "IDLE"
            self._buffer_clear()
            sources_to_shutdown = list(filter(None, {ac_source, dc_source}))
            for source in sources_to_shutdown:
                await sync_to_async(source.reset, thread_sensitive=True)()
            if amplifier: await sync_to_async(amplifier.set_standby, thread_sensitive=True)()
            
            for inst in filter(None, {std_reader, ti_reader, amplifier, ac_source, dc_source}):
                if hasattr(inst, 'close'):
                    await sync_to_async(inst.close, thread_sensitive=True)()

    async def run_full_calibration_batch(self, data):
        ac_source, dc_source, std_reader, ti_reader, amplifier, switch_driver = None, None, None, None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")

            test_points_to_run = data.get('test_points', [])
            if not test_points_to_run:
                raise Exception("No test points provided for batch run.")

            std_addr, ti_addr = session_details.get('std_reader_address'), session_details.get('ti_reader_address')
            std_model, ti_model = session_details.get('std_reader_model'), session_details.get('ti_reader_model')

            ac_source_address, dc_source_address = session_details.get('ac_source_address'), session_details.get('dc_source_address')
            if ac_source_address and ac_source_address == dc_source_address:
                shared_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: ac_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                if dc_source_address: dc_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=dc_source_address)
            
            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader = await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, model=ti_model, gpib=ti_addr)

            if session_details.get('switch_driver_address'):
                switch_driver = await sync_to_async(_inst, thread_sensitive=True)(Instrument11713C, gpib=session_details.get('switch_driver_address'))
            
            await self._configure_sources(
                test_points_to_run,
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )
            
            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(_inst, thread_sensitive=True)(Instrument8100, model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data): return
            
            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)
            
            # ``dict.get`` only returns the default when the key is missing,
            # not when the value is present-but-``None``. Frontend payloads
            # often send ``initial_warm_up_time: null`` which would crash the
            # ``warmup_time > 0`` comparison; ``or 0`` coerces null/0/'' to 0.
            warmup_time = data.get('initial_warm_up_time') or 0
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            nplc_setting, measurement_params = data.get('nplc'), data.get('measurement_params')

            for i, point_data in enumerate(test_points_to_run):
                if self.stop_event.is_set(): break
                
                current_settling_time = float(point_data.get('settling_time', data.get('settling_time', 5.0)))
                current_num_samples = int(point_data.get('num_samples', data.get('num_samples', 8)))

                self._buffer_set_batch_point(point_data)
                await self.broadcast(text_data=json.dumps({
                    'type': 'batch_progress_update',
                    'test_point': point_data,
                    'current': i + 1,
                    'total': len(test_points_to_run)
                }))

                point_aborted = False
                for stage in ['ac_open', 'dc_pos', 'dc_neg', 'ac_close']:
                    if self.stop_event.is_set(): break
                    
                    required_switch_state = 'AC' if 'ac' in stage else 'DC'
                    if switch_driver:
                        await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_switch_state} source..."}))
                        if required_switch_state == 'AC': await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                        else: await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                        await self.broadcast(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_switch_state}))
                        await asyncio.sleep(1)

                    source_instrument = ac_source if 'ac' in stage else dc_source
                    if not source_instrument: raise Exception(f"Required source for stage '{stage}' is not assigned.")
                    
                    self._buffer_set_stage(stage, tp_id=point_data.get('id'), total=current_num_samples)
                    await self.broadcast(text_data=json.dumps({
                        'type': 'calibration_stage_update', 
                        'stage': stage, 
                        'total': current_num_samples,
                        'tpId': point_data.get('id')
                    }))
                    
                    success = await self._perform_single_measurement(
                        stage, 
                        current_num_samples, 
                        point_data, 
                        data.get('bypass_tvc'), 
                        data.get('amplifier_range'), 
                        source_instrument, std_reader, ti_reader, amplifier, 
                        current_settling_time, 
                        nplc_setting, 
                        measurement_params
                    )
                    
                    if not success:
                        print(f"[DEBUG - BACKEND] Batch caught failure on {stage}. Breaking loop and moving to next point.", flush=True)
                        point_aborted = True
                        break 
                
                # Gracefully move on to the next test point if max retry limit failed
                if point_aborted: continue

            if not self.stop_event.is_set():
                await self.broadcast(text_data=json.dumps({'type': 'collection_finished', 'message': 'Batch calibration complete.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred during batch run: {e}"}))
        finally:
            self.state = "IDLE"
            self._buffer_clear()
            if switch_driver:
                await sync_to_async(switch_driver.deactivate_all, thread_sensitive=True)()
                if hasattr(switch_driver, 'close'): await sync_to_async(switch_driver.close, thread_sensitive=True)()

            sources_to_shutdown = list(filter(None, {ac_source, dc_source}))
            for source in sources_to_shutdown:
                await sync_to_async(source.reset, thread_sensitive=True)()

            if amplifier: await sync_to_async(amplifier.set_standby, thread_sensitive=True)()
            
            for inst in filter(None, {std_reader, ti_reader, amplifier, ac_source, dc_source}):
                if hasattr(inst, 'close'):
                    await sync_to_async(inst.close, thread_sensitive=True)()

    async def run_single_stage_batch(self, data):
        ac_source, dc_source, std_reader, ti_reader, amplifier = None, None, None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")

            stage = data.get('reading_type')
            test_points_to_run = data.get('test_points', [])
            if not stage or not test_points_to_run:
                raise Exception("Missing reading type or test points for batch run.")

            std_addr, ti_addr = session_details.get('std_reader_address'), session_details.get('ti_reader_address')
            std_model, ti_model = session_details.get('std_reader_model'), session_details.get('ti_reader_model')

            ac_source_address, dc_source_address = session_details.get('ac_source_address'), session_details.get('dc_source_address')
            if ac_source_address and ac_source_address == dc_source_address:
                shared_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: ac_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=ac_source_address)
                if dc_source_address: dc_source = await sync_to_async(_inst, thread_sensitive=True)(Instrument5730A, model="5730A", gpib=dc_source_address)

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader = await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(std_reader_class, model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(_inst, thread_sensitive=True)(ti_reader_class, model=ti_model, gpib=ti_addr)

            await self._configure_sources(
                test_points_to_run,
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )
            
            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(_inst, thread_sensitive=True)(Instrument8100, model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data): return
            
            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)
            
            # ``dict.get`` only returns the default when the key is missing,
            # not when the value is present-but-``None``. Frontend payloads
            # often send ``initial_warm_up_time: null`` which would crash the
            # ``warmup_time > 0`` comparison; ``or 0`` coerces null/0/'' to 0.
            warmup_time = data.get('initial_warm_up_time') or 0
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            source_instrument = ac_source if 'ac' in stage else dc_source
            if not source_instrument: raise Exception(f"Required source for stage '{stage}' is not assigned.")

            switch_driver = None
            if session_details.get('switch_driver_address'):
                switch_driver = await sync_to_async(_inst, thread_sensitive=True)(Instrument11713C, gpib=session_details.get('switch_driver_address'))
                required_switch_state = 'AC' if 'ac' in stage else 'DC'
                await self.broadcast(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_switch_state} source for batch run..."}))
                if required_switch_state == 'AC': await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                else: await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                await self.broadcast(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_switch_state}))
                await asyncio.sleep(1)

            nplc_setting, measurement_params = data.get('nplc'), data.get('measurement_params')

            for i, point_data in enumerate(test_points_to_run):
                if self.stop_event.is_set(): break

                current_settling_time = float(point_data.get('settling_time', data.get('settling_time', 5.0)))
                current_num_samples = int(point_data.get('num_samples', data.get('num_samples', 8)))

                self._buffer_set_batch_point(point_data)
                await self.broadcast(text_data=json.dumps({
                    'type': 'batch_progress_update',
                    'test_point': point_data,
                    'current': i + 1,
                    'total': len(test_points_to_run)
                }))

                self._buffer_set_stage(stage, tp_id=point_data.get('id'), total=current_num_samples)
                await self.broadcast(text_data=json.dumps({
                    'type': 'calibration_stage_update', 
                    'stage': stage, 
                    'total': current_num_samples,
                    'tpId': point_data.get('id')
                }))

                success = await self._perform_single_measurement(
                    stage, 
                    current_num_samples, 
                    point_data, 
                    data.get('bypass_tvc'), 
                    data.get('amplifier_range'), 
                    source_instrument, std_reader, ti_reader, amplifier, 
                    current_settling_time, 
                    nplc_setting, 
                    measurement_params
                )
                
                if not success: continue

            if not self.stop_event.is_set():
                await self.broadcast(text_data=json.dumps({'type': 'collection_finished', 'message': 'Batch readings complete.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.broadcast(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred during batch run: {e}"}))
        finally:
            self.state = "IDLE"
            self._buffer_clear()
            if switch_driver:
                await sync_to_async(switch_driver.deactivate_all, thread_sensitive=True)()
                if hasattr(switch_driver, 'close'): await sync_to_async(switch_driver.close, thread_sensitive=True)()

            sources_to_shutdown = list(filter(None, {ac_source, dc_source}))
            for source in sources_to_shutdown:
                await sync_to_async(source.reset, thread_sensitive=True)()

            if amplifier: await sync_to_async(amplifier.set_standby, thread_sensitive=True)()
            
            for inst in filter(None, {std_reader, ti_reader, amplifier, ac_source, dc_source}):
                if hasattr(inst, 'close'):
                    await sync_to_async(inst.close, thread_sensitive=True)()

    async def save_readings_to_db(self, reading_type_full, readings_list, test_point):
        """
        Durable stage-save path.

        Step 1: enqueue the payload to the local SQLite outbox. This is fast
        and does NOT touch MSSQL, so a down server cannot lose data here.

        Step 2: immediately try to replay the row against the default DB. If
        it works we mark the row done and the UI just sees a normal save; if
        it fails the row stays pending and the background drainer retries it
        with exponential backoff until the server is reachable again.

        This replaces the old single-attempt pattern which silently dropped
        readings on any DB exception.
        """
        print(f"[SAVE-TRACE] 1. Initiating save for {reading_type_full} with {len(readings_list)} readings.", flush=True)
        row_id = await sync_to_async(outbox_module.enqueue, thread_sensitive=True)(
            self.session_id, test_point, reading_type_full, readings_list,
        )
        if row_id is None:
            # Catastrophic: local SQLite write failed. Fall back to a direct
            # attempt and a loud log so the user at least sees the error.
            print(
                f"[OUTBOX] CRITICAL: could not enqueue stage save for "
                f"{reading_type_full}; attempting direct write as a last resort.",
                flush=True,
            )
            await sync_to_async(self._direct_save_readings_fallback, thread_sensitive=True)(
                reading_type_full, readings_list, test_point,
            )
            return

        # Try the real write now. If it fails (MSSQL down) the row stays
        # pending and the drainer picks it up later — either way the payload
        # is durable.
        print(f"[SAVE-TRACE] 3. Calling attempt_replay_row for row_id={row_id}", flush=True)
        ok = await sync_to_async(outbox_module.attempt_replay_row, thread_sensitive=True)(row_id)
        print(f"[SAVE-TRACE] 4. Replay completed. Success={ok} for row_id={row_id}", flush=True)
        if not ok:
            # Make sure the drainer is alive and will retry, and push a status
            # update so the UI's "Buffered: N" badge lights up immediately.
            print(f"[SAVE-TRACE] 5. Replay failed. Ensuring drainer is running and broadcasting DB status.", flush=True)
            outbox_module.ensure_drainer_running()
            await outbox_module.broadcast_db_status()

    def _direct_save_readings_fallback(self, reading_type_full, readings_list, test_point):
        """
        Legacy best-effort write used only when the local outbox itself
        can't accept a row (disk broken). Kept so we never silently lose the
        very first write even if the outbox fails to initialize.
        """
        try:
            session = CalibrationSession.objects.get(pk=self.session_id)
            test_point_set, _ = TestPointSet.objects.get_or_create(session=session)
            tp_id = test_point.get('id')
            if tp_id:
                test_point_obj = TestPoint.objects.get(pk=tp_id)
            else:
                current, frequency, direction = (
                    test_point.get('current'),
                    test_point.get('frequency'),
                    test_point.get('direction', 'Forward'),
                )
                test_point_obj, _ = TestPoint.objects.get_or_create(
                    test_point_set=test_point_set,
                    current=current,
                    frequency=frequency,
                    direction=direction,
                )
            readings, _ = CalibrationReadings.objects.get_or_create(test_point=test_point_obj)
            setattr(readings, f"{reading_type_full}_readings", readings_list)
            readings.save()
            readings.update_related_results()
        except Exception as e:
            print(f"[OUTBOX FALLBACK] direct save failed: {e}", flush=True)
    
    @database_sync_to_async
    def _propagate_characterization_eta(self, characterized_tp_id, target_tvc, char_source_kind):
        """
        After a successful characterization run on `characterized_tp_id`, copy the
        freshly-computed eta_std / eta_ti onto every other TestPoint in the same
        session that shares the same physical characterization context, so the
        downstream AC-DC math uses the real gain instead of silently defaulting
        to 1.0.

        Match rules:
          - Same session
          - DC characterization: same nominal current (freq-independent).
          - AC characterization: same nominal current AND same frequency
            (AC gain is frequency-dependent, so it only applies per-frequency).
          - Direction is ignored (Forward/Reverse share the same physical gain).

        Guardrail: never overwrite a sibling that has its own characterization
        readings for the targeted side - that point will compute its own eta
        from its own data, and that value must win.

        Returns the number of sibling rows updated (for logging).
        """
        try:
            source_tp = TestPoint.objects.select_related(
                'results', 'test_point_set__session'
            ).get(pk=characterized_tp_id)
        except TestPoint.DoesNotExist:
            print(f"[PROP_ETA] Source TP {characterized_tp_id} not found, nothing to propagate.", flush=True)
            return 0

        source_results = getattr(source_tp, 'results', None)
        if source_results is None:
            print("[PROP_ETA] Source TP has no results row; skipping propagation.", flush=True)
            return 0

        session = source_tp.test_point_set.session
        source_eta_std = source_results.eta_std if target_tvc in ('STD', 'BOTH') else None
        source_eta_ti = source_results.eta_ti if target_tvc in ('TI', 'BOTH') else None

        if source_eta_std is None and source_eta_ti is None:
            print("[PROP_ETA] No fresh eta values on source TP; nothing to propagate.", flush=True)
            return 0

        # Build sibling filter
        sibling_qs = TestPoint.objects.filter(
            test_point_set__session=session,
            current=source_tp.current,
        ).exclude(pk=source_tp.pk)

        if char_source_kind == 'AC':
            sibling_qs = sibling_qs.filter(frequency=source_tp.frequency)

        sibling_qs = sibling_qs.select_related('results')

        updated = 0
        for sibling in sibling_qs:
            sib_results = getattr(sibling, 'results', None)
            if sib_results is None:
                # No results row yet -> create one so eta can be pinned;
                # calculate_ac_dc_difference will early-return if avgs aren't ready.
                sib_results = CalibrationResults.objects.create(test_point=sibling)

            # Inspect the sibling's own char readings; if they've characterized
            # themselves, don't clobber their values.
            sib_readings = CalibrationReadings.objects.filter(test_point=sibling).first()

            changed_fields = []

            if source_eta_std is not None:
                sib_has_own_std_char = bool(
                    sib_readings and (
                        sib_readings.std_char_plus1_readings or
                        sib_readings.std_char_minus_readings or
                        sib_readings.std_char_plus2_readings
                    )
                )
                if not sib_has_own_std_char:
                    if sib_results.eta_std is None or abs((sib_results.eta_std or 0.0) - source_eta_std) > 1e-12:
                        sib_results.eta_std = source_eta_std
                        changed_fields.append('eta_std')

            if source_eta_ti is not None:
                sib_has_own_ti_char = bool(
                    sib_readings and (
                        sib_readings.ti_char_plus1_readings or
                        sib_readings.ti_char_minus_readings or
                        sib_readings.ti_char_plus2_readings
                    )
                )
                if not sib_has_own_ti_char:
                    if sib_results.eta_ti is None or abs((sib_results.eta_ti or 0.0) - source_eta_ti) > 1e-12:
                        sib_results.eta_ti = source_eta_ti
                        changed_fields.append('eta_ti')

            if changed_fields:
                sib_results.save(update_fields=changed_fields)
                # Recompute delta_uut_ppm with the new gain. If averages are
                # not ready yet, calculate_ac_dc_difference short-circuits.
                try:
                    sib_results.calculate_ac_dc_difference()
                except Exception as calc_err:
                    print(f"[PROP_ETA] Recalc failed for TP {sibling.pk}: {calc_err}", flush=True)
                updated += 1

        if updated:
            print(
                f"[PROP_ETA] Propagated {char_source_kind} eta ({target_tvc}) from TP "
                f"{source_tp.pk} to {updated} sibling point(s).",
                flush=True,
            )
        else:
            print(
                f"[PROP_ETA] No sibling points eligible for {char_source_kind} "
                f"eta propagation from TP {source_tp.pk}.",
                flush=True,
            )
        return updated

    @database_sync_to_async
    def set_test_point_failed_status(self, test_point_id, status: bool):
        if not test_point_id: 
            return
        try:
            tp = TestPoint.objects.get(pk=test_point_id)
            tp.is_stability_failed = status
            tp.save(update_fields=['is_stability_failed'])
        except TestPoint.DoesNotExist:
            pass
        except Exception as e:
            # Catch DB disconnection errors so they don't crash the measurement loop
            print(f"[CONSUMER] Could not update stability status for TP {test_point_id} (DB offline): {e}", flush=True)

    async def broadcast(self, text_data):
        """Intercepts the text_data and broadcasts it to ALL clients in the session."""
        await self.channel_layer.group_send(
            self.session_group_name,
            {
                'type': 'forward_to_group',
                'text_data': text_data
            }
        )

    async def forward_to_group(self, event):
        """Channels event handler that receives the group message and pushes it down the WebSocket."""
        await self.send(text_data=event['text_data'])


class SwitchDriverConsumer(AsyncWebsocketConsumer):
    instrument_instance = None
    instrument_class = None

    async def connect(self):
        self.instrument_model = self.scope['url_route']['kwargs']['instrument_model']
        self.gpib_address = self.scope['url_route']['kwargs']['gpib_address']
        self.instrument_class = INSTRUMENT_CLASS_MAP.get(self.instrument_model)

        if not self.instrument_class:
            await self.close(code=4001)
            return
            
        self.instrument_instance = await self.connect_instrument_sync()
        if self.instrument_instance:
            await self.accept()
            initial_state = await self.get_status_sync()
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'active_source': initial_state,
            }))
        else:
            await self.close(code=4004)

    async def disconnect(self, close_code):
        if self.instrument_instance:
            await self.close_instrument_sync()

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')
        
        if command == 'select_source':
            source = data.get('source')
            if source == 'AC':
                await sync_to_async(self.instrument_instance.select_ac_source, thread_sensitive=True)()
            elif source == 'DC':
                await sync_to_async(self.instrument_instance.select_dc_source, thread_sensitive=True)()
            elif source == 'Standby':
                await sync_to_async(self.instrument_instance.deactivate_all, thread_sensitive=True)()
            
            new_state = await self.get_status_sync()
            await self.send(text_data=json.dumps({'type': 'source_changed', 'active_source': new_state}))
        
        elif command == 'get_status':
            current_state = await self.get_status_sync()
            await self.send(text_data=json.dumps({'type': 'status_update', 'active_source': current_state}))

    @sync_to_async(thread_sensitive=True)
    def connect_instrument_sync(self):
        try:
            instance = self.instrument_class(gpib=self.gpib_address)
            return instance
        except Exception as e:
            print(f"SwitchDriverConsumer: Error connecting to {self.gpib_address}: {e}")
            return None

    @sync_to_async(thread_sensitive=True)
    def close_instrument_sync(self):
        if self.instrument_instance:
            connection = getattr(self.instrument_instance, 'resource', None)
            if connection and hasattr(connection, 'close'):
                connection.close()

    @sync_to_async(thread_sensitive=True)
    def get_status_sync(self):
        return self.instrument_instance.get_active_source()


class DbHealthConsumer(AsyncWebsocketConsumer):
    """
    Streams the current default-DB reachability and outbox backlog to the UI.

    Protocol (server -> client):
        {
            "type": "db_status",
            "reachable": bool,
            "pending_count": int,
            "failed_count": int,
            "timestamp": float,
        }

    The consumer:
      * pushes a snapshot immediately on connect,
      * re-probes on every periodic tick (10s) and when the drainer broadcasts,
      * forwards any ``db.status`` events from the channel-layer group.

    Protocol (client -> server), optional:
        {"command": "refresh"}   -> force a fresh probe + snapshot
        {"command": "retry_failed"} -> flip failed rows back to pending
    """

    GROUP = outbox_module.DB_STATUS_GROUP

    async def connect(self):
        layer = getattr(self, 'channel_layer', None)
        if layer is None:
            print(
                'DbHealthConsumer: channel_layer is None — check INSTALLED_APPS '
                'includes "channels" and CHANNEL_LAYERS is configured.',
                flush=True,
            )
            await self.close(code=4500)
            return
        try:
            await layer.group_add(self.GROUP, self.channel_name)
        except Exception as e:
            print(f'DbHealthConsumer: group_add failed: {e}', flush=True)
            await self.close(code=4500)
            return

        await self.accept()

        # Make sure the drainer is running now that an ASGI loop exists.
        try:
            outbox_module.ensure_drainer_running()
        except Exception as e:
            print(f'DbHealthConsumer: ensure_drainer_running failed: {e}', flush=True)

        # Initial snapshot — never fail the socket after accept(); the UI can
        # still render with a safe fallback payload.
        try:
            payload = await sync_to_async(outbox_module.current_status_payload, thread_sensitive=True)()
        except Exception as e:
            print(f'DbHealthConsumer: current_status_payload failed: {e}', flush=True)
            payload = {
                'type': 'db_status',
                'reachable': True,
                'pending_count': 0,
                'failed_count': 0,
                'timestamp': time.time(),
            }
        await self.send(text_data=json.dumps(payload))

        # Periodic heartbeat so the UI pill keeps itself honest even if the
        # drainer is idle (no new rows to broadcast).
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def disconnect(self, close_code):
        hb = getattr(self, '_heartbeat_task', None)
        if hb:
            hb.cancel()
        layer = getattr(self, 'channel_layer', None)
        if layer is not None:
            try:
                await layer.group_discard(self.GROUP, self.channel_name)
            except Exception:
                pass

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except Exception:
            return
        command = data.get('command')
        if command == 'refresh':
            payload = await sync_to_async(outbox_module.current_status_payload, thread_sensitive=True)()
            await self.send(text_data=json.dumps(payload))
        elif command == 'retry_failed':
            updated = await sync_to_async(outbox_module.retry_failed_rows_sync, thread_sensitive=True)()
            await self.send(text_data=json.dumps({
                'type': 'retry_failed_result',
                'updated': updated,
            }))

    async def _heartbeat_loop(self):
        try:
            while True:
                await asyncio.sleep(10)
                payload = await sync_to_async(outbox_module.current_status_payload, thread_sensitive=True)()
                await self.send(text_data=json.dumps(payload))
        except asyncio.CancelledError:
            return
        except Exception as e:
            print(f"DbHealthConsumer heartbeat error: {e}", flush=True)

    async def db_status(self, event):
        """Channel-layer event handler — forwards broadcasts to the client."""
        payload = event.get('payload') or {}
        if not payload:
            return
        await self.send(text_data=json.dumps(payload))

# --- Server-authoritative hardware lock registry ---
# Keyed by workstation IP. Maps to the channel_name of the host that currently
# has it selected in their UI. This prevents two hosts from clashing over the
# same physical instrumentation simultaneously.
class HostSyncConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = 'host_sync_group'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Record the socket in the presence registry immediately. Role starts
        # as ``unknown`` and is promoted to ``host`` or ``remote`` once the
        # client sends its ``identify`` message. This lets us disregard
        # ``unknown`` entries in the broadcast below — no noise while the
        # handshake is in flight.
        client = self.scope.get('client') or (None, None)
        session_state.register_viewer(
            self.channel_name,
            ip=client[0] or 'unknown',
            connected_at=time.time(),
        )

        # Always send the current host session on connect — including ``None``
        # when no host has picked a session yet. The frontend treats the
        # mere arrival of this message as "state is now authoritative", so
        # remote viewers can distinguish "waiting on host-sync WS to open"
        # from "host is not in a session" instead of showing a misleading
        # "no test points" empty state. Hosts ignore it on the client.
        #
        # The scalar ``session_id`` is the legacy single-host wire; the
        # ``active_sessions`` map is the multi-host-aware form. We always
        # send both so the two generations of clients coexist.
        await self.send(text_data=json.dumps({
            'type': 'session_changed',
            'session_id': session_state.legacy_session_id(),
            'active_sessions': session_state.host_sessions_snapshot(),
        }))

        # Push the current workstation lock state so a fresh connection
        # instantly knows which hardware IPs are currently claimed by other hosts.
        await self.send(text_data=json.dumps({
            'type': 'workstation_claims_update',
            'claims': session_state.claims_snapshot(),
        }))

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            # Channel layer may already be torn down (daphne shutdown); never
            # let that abort the rest of the cleanup below.
            import logging
            logging.getLogger(__name__).exception(
                "HostSyncConsumer: group_discard failed for %s", self.channel_name,
            )

        # Pop this socket's active-session entry and, if it had one, broadcast
        # the refreshed ``active_sessions`` map so every remaining client
        # removes the stale "(Active)" pill in the session dropdown.
        # Previously this was silent, which meant a host closing their tab
        # left every other user's UI flagging the now-dead session as live —
        # the exact bug that pushed clients into observer mode against a
        # session nobody was actually running anymore.
        had_session = session_state.get_host_session(self.channel_name) is not None
        session_state.clear_host_session(self.channel_name)
        if had_session:
            try:
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        'type': 'broadcast_session',
                        'session_id': session_state.legacy_session_id(),
                        'active_sessions': session_state.host_sessions_snapshot(),
                    },
                )
            except Exception:
                import logging
                logging.getLogger(__name__).exception(
                    "HostSyncConsumer: post-disconnect session_changed broadcast failed",
                )

        # Drop this socket from the registry and push the fresh observer list
        # so any host still connected updates its pill within a tick.
        if session_state.unregister_viewer(self.channel_name):
            try:
                await self._broadcast_viewer_presence()
            except Exception:
                import logging
                logging.getLogger(__name__).exception(
                    "HostSyncConsumer: presence rebroadcast failed",
                )

        # Self-Healing Lock Release: If this socket abruptly disconnects
        # (e.g., host closes the tab, browser crash, or network loss),
        # automatically release any workstations it had claimed so other
        # hosts aren't permanently locked out of that hardware. Now also
        # clears the mirrored ``WorkstationClaim`` DB row in the same
        # call, which is why this is wrapped in ``database_sync_to_async``.
        # Wrapped defensively because a DB hiccup during release must not
        # leak this channel's presence registry entry (handled above) or
        # abort Channels' own per-consumer teardown.
        try:
            released = await database_sync_to_async(session_state.release_claims_for)(
                self.channel_name
            )
            if released:
                await self.channel_layer.group_send(self.group_name, {
                    'type': 'broadcast_claims',
                    'claims': session_state.claims_snapshot(),
                })
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "HostSyncConsumer: workstation release/broadcast failed for %s",
                self.channel_name,
            )

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')

        if command == 'set_session':
            session_id = data.get('session_id')
            client_info = session_state.get_viewer(self.channel_name) or {}
            if client_info.get('role') != 'host':
                return

            # Record this host's current session against its channel_name.
            session_state.set_host_session(self.channel_name, session_id)

            # Broadcast the change. ``session_id`` is the legacy scalar,
            # ``host_channel`` and ``active_sessions`` are the multi-host
            # extensions; legacy remote clients read only the first field.
            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'broadcast_session',
                    'session_id': session_id,
                    'host_channel': self.channel_name,
                    'active_sessions': session_state.host_sessions_snapshot(),
                }
            )

        elif command == 'identify':
            # One-shot handshake: the client declares ``host`` or ``remote``.
            # We promote the registry entry and re-broadcast so hosts see the
            # observer list reflect the new joiner (or their own appearance).
            role = data.get('role')
            if role not in ('host', 'remote'):
                return
            if not session_state.update_viewer_role(self.channel_name, role):
                # Disconnected between connect() and here — nothing to update.
                return
            await self._broadcast_viewer_presence()

        elif command == 'request_session_state':
            # Safety net: remote viewers re-ask for the host's session after a
            # reconnect (or if the auto-send in ``connect()`` was somehow
            # missed). We unicast to just this socket so other clients don't
            # get spammed with redundant session_changed events. Include the
            # full active-sessions map for multi-host-aware clients.
            await self.send(text_data=json.dumps({
                'type': 'session_changed',
                'session_id': session_state.legacy_session_id(),
                'active_sessions': session_state.host_sessions_snapshot(),
            }))

        elif command == 'claim_workstation':
            # Workstation hardware locking. Only an active host can lock a
            # workstation, preventing two hosts from simultaneously polling
            # or driving the same physical instruments.
            ip = data.get('ip')
            client_id = data.get('client_id')
            client_info = session_state.get_viewer(self.channel_name) or {}
            role = client_info.get('role', 'unknown')

            # Enforce role-based security: Observers can't lock hardware.
            if ip and role == 'host':
                # Attach the host's current session so the admin row shows
                # which calibration run this bench is being used for, and a
                # human-readable label (client IP) so an operator can
                # identify a stuck claim without decoding channel_names.
                active_session_id = session_state.get_host_session(self.channel_name)
                owner_label = client_info.get('ip') or ''

                await database_sync_to_async(session_state.claim_workstation)(
                    ip,
                    channel_name=self.channel_name,
                    client_id=client_id,
                    role=role,
                    owner_label=owner_label,
                    active_session_id=active_session_id,
                )
                await self.channel_layer.group_send(self.group_name, {
                    'type': 'broadcast_claims',
                    'claims': session_state.claims_snapshot(),
                })

        elif command == 'release_workstation':
            ip = data.get('ip')

            # Safety check: Only the socket that owns the lock can release it.
            # ``release_workstation`` returns ``False`` if the lock either
            # doesn't exist or belongs to someone else, so we skip the
            # broadcast to avoid spamming no-op updates. Wrapped so the
            # DB mirror delete runs off the event loop thread.
            if not ip:
                return
            released = await database_sync_to_async(session_state.release_workstation)(
                ip, channel_name=self.channel_name,
            )
            if released:
                await self.channel_layer.group_send(self.group_name, {
                    'type': 'broadcast_claims',
                    'claims': session_state.claims_snapshot(),
                })

    # --- Handlers for group_send events ---

    async def broadcast_claims(self, event):
        """Channels event handler to push the claims payload down the WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'workstation_claims_update',
            'claims': event['claims']
        }))

    def _collect_observers(self):
        """Build the observer list that hosts consume.

        Returns only ``remote``-role entries so hosts never see themselves or
        half-identified ``unknown`` sockets. Deduplicates by client IP so two
        tabs on the same remote machine — or React StrictMode's dev-mode
        double-mount that briefly opens two sockets — count as a single
        observer. The earliest ``connected_at`` wins so the "connected Xm"
        timer in the UI matches when the machine first joined.
        """
        by_ip: dict[str, dict] = {}
        for entry in session_state.viewers_snapshot().values():
            if entry.get('role') != 'remote':
                continue
            ip = entry.get('ip', 'unknown')
            connected_at = entry.get('connected_at', 0)
            existing = by_ip.get(ip)
            if existing is None or connected_at < existing['connected_at']:
                by_ip[ip] = {'ip': ip, 'connected_at': connected_at}
        observers = list(by_ip.values())
        # Stable ordering makes the frontend hover list deterministic.
        observers.sort(key=lambda o: o['connected_at'])
        return observers

    async def _broadcast_viewer_presence(self):
        """Push the observer list to every host-role socket in the group.

        Remotes never receive this — they don't need to know about each
        other, and skipping them keeps the wire traffic minimal.
        """
        observers = self._collect_observers()
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'viewer_presence',
                'observers': observers,
            }
        )

    async def viewer_presence(self, event):
        # Host-only delivery: remotes silently drop the message rather than
        # surfacing presence info that would never be rendered.
        entry = session_state.get_viewer(self.channel_name)
        if entry is None or entry.get('role') != 'host':
            return
        await self.send(text_data=json.dumps({
            'type': 'viewer_presence',
            'observers': event.get('observers', []),
        }))

    async def broadcast_session(self, event):
        payload = {
            'type': 'session_changed',
            'session_id': event['session_id'],
        }
        # Multi-host extensions — legacy clients ignore unknown fields.
        if 'host_channel' in event:
            payload['host_channel'] = event['host_channel']
        if 'active_sessions' in event:
            payload['active_sessions'] = event['active_sessions']
        await self.send(text_data=json.dumps(payload))