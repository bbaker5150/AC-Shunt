"""
Durable write-outbox for calibration stage saves.

Architecture
------------
Every call to ``CalibrationConsumer.save_readings_to_db`` is now a two-step
operation:

    1. ``enqueue(...)`` appends a ``PendingReadingWrite`` row to the local
       ``outbox`` SQLite alias. This ALWAYS succeeds unless the local disk is
       broken; it is completely independent of MSSQL reachability.
    2. ``attempt_replay_row(row)`` immediately tries to push the payload to
       the ``default`` DB. On success the row is marked ``done``; on failure
       the row stays ``pending`` and the background drainer retries later.

A long-running asyncio task (``run_drainer_forever``) drains ``pending`` rows
with exponential backoff. It wakes on every new enqueue (via an ``asyncio.Event``)
and on its own backoff tick. A tiny health probe (``probe_default_reachable``)
tells the UI whether the default DB is currently reachable; a channel-layer
broadcast (``broadcast_db_status``) pushes ``{reachable, pending_count}``
updates to any subscribed WebSocket consumer.

The outbox is strictly for CalibrationReadings stage writes — see the plan for
rationale. Replay is idempotent because the target write pattern is
``get_or_create`` + ``setattr(<stage>_readings, list)`` + ``save()``, which
is an overwrite, not an append. Applying the same payload twice yields the
same DB state, so a crash between ``save()`` and ``mark_done`` is safe.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import threading
import time
from typing import Any, Optional

from asgiref.sync import async_to_sync, sync_to_async
from django.db import connections, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Retry / backoff policy
# -----------------------------------------------------------------------------
# Exponential backoff with jitter. Tuned for "extended outages" (minutes to
# hours): first few retries are quick so brief blips clear invisibly; after
# a couple of minutes we settle into a 5-minute heartbeat capped at 30 minutes
# so the outbox doesn't hammer a down server.
_BACKOFF_LADDER_SECONDS = (5, 15, 60, 300, 900, 1800)
_MAX_ATTEMPTS_BEFORE_FAILED = 20
_HEALTH_PROBE_MIN_INTERVAL = 3.0  # seconds — throttle probes so we don't flood

# Channel-layer group that the UI subscribes to for db status updates.
DB_STATUS_GROUP = 'db_health'
DB_STATUS_EVENT = 'db.status'

# -----------------------------------------------------------------------------
# Module state
# -----------------------------------------------------------------------------
_drainer_task: Optional[asyncio.Task] = None
_drainer_wake_event: Optional[asyncio.Event] = None
_drainer_loop: Optional[asyncio.AbstractEventLoop] = None
_drainer_lock = threading.Lock()

# Cached probe result so the UI can re-read it without hitting the DB on every
# request. Updated whenever a real probe runs.
_last_probe_reachable: Optional[bool] = None
_last_probe_ts: float = 0.0


# -----------------------------------------------------------------------------
# Enqueue (synchronous — safe to call from any thread)
# -----------------------------------------------------------------------------
def enqueue(
    session_id: int,
    test_point: dict,
    reading_type_full: str,
    readings_list: list,
) -> Optional[int]:
    """
    Append a pending stage-save payload to the outbox and return its row id.

    Returns ``None`` only if even the local SQLite write fails (disk broken).
    In that case the caller should log loudly and fall back to its previous
    best-effort behavior; there's nothing else we can do.
    """
    logger.info("OUTBOX [ENQUEUE 1/2]: Request received for session_id=%s, stage=%s", session_id, reading_type_full)
    try:
        from .models import PendingReadingWrite  # local import — avoids app-ready races

        lookup = {
            'current': test_point.get('current'),
            'frequency': test_point.get('frequency'),
            'direction': test_point.get('direction', 'Forward'),
        }
        row = PendingReadingWrite.objects.using('outbox').create(
            session_id=session_id,
            test_point_id=test_point.get('id'),
            test_point_lookup=lookup,
            reading_type_full=reading_type_full,
            readings_json=list(readings_list) if readings_list else [],
            status=PendingReadingWrite.STATUS_PENDING,
        )
        logger.info("OUTBOX [ENQUEUE 2/2]: SUCCESS - created PendingReadingWrite row_id=%s", row.id)
        return row.id
    except Exception as e:
        logger.exception("OUTBOX: failed to enqueue stage save (%s): %s", reading_type_full, e)
        return None


# -----------------------------------------------------------------------------
# Core replay primitive (synchronous)
# -----------------------------------------------------------------------------
def attempt_replay_row(row_id: int) -> bool:
    """
    Try to push one pending outbox row to the default DB.

    Returns True on success (row marked ``done``) and False on failure (row
    stays ``pending`` with ``attempts`` incremented and ``last_error`` set).

    This runs entirely synchronously against Django's ORM. Callers must wrap
    it in ``sync_to_async`` when invoking from an async context.
    """
    from .models import (
        CalibrationReadings,
        CalibrationSession,
        PendingReadingWrite,
        TestPoint,
        TestPointSet,
    )

    logger.info("OUTBOX [REPLAY 1/4]: attempt_replay_row() started for row_id=%s", row_id)

    # 1. Claim the row (pending -> in_flight) so concurrent drainers don't
    #    double-process. The outbox is SQLite, so this transaction is local
    #    and never touches MSSQL.
    try:
        with transaction.atomic(using='outbox'):
            try:
                row = PendingReadingWrite.objects.using('outbox').select_for_update().get(pk=row_id)
            except PendingReadingWrite.DoesNotExist:
                logger.warning("OUTBOX [REPLAY]: row_id=%s DoesNotExist during claim.", row_id)
                return False
            if row.status == PendingReadingWrite.STATUS_DONE:
                logger.info("OUTBOX [REPLAY]: row_id=%s is already DONE.", row_id)
                return True
            if row.status not in (
                PendingReadingWrite.STATUS_PENDING,
                PendingReadingWrite.STATUS_IN_FLIGHT,
            ):
                # failed rows require manual intervention
                logger.warning("OUTBOX [REPLAY]: row_id=%s is in status %s (needs manual intervention).", row_id, row.status)
                return False
            row.status = PendingReadingWrite.STATUS_IN_FLIGHT
            row.save(update_fields=['status'])
            logger.info("OUTBOX [REPLAY 2/4]: Claimed row_id=%s (IN_FLIGHT).", row_id)
    except Exception as claim_err:
        logger.warning("OUTBOX [REPLAY ERROR]: could not claim row %s: %s", row_id, claim_err)
        return False

    # 2. Attempt the real write against the default DB.
    try:
        session = CalibrationSession.objects.get(pk=row.session_id)
        test_point_set, _ = TestPointSet.objects.get_or_create(session=session)

        test_point_obj = None
        if row.test_point_id:
            try:
                test_point_obj = TestPoint.objects.get(pk=row.test_point_id)
            except TestPoint.DoesNotExist:
                test_point_obj = None

        if test_point_obj is None:
            lookup = row.test_point_lookup or {}
            current = lookup.get('current')
            frequency = lookup.get('frequency')
            direction = lookup.get('direction', 'Forward')
            if current is None or frequency is None:
                raise ValueError(
                    f"Cannot resolve target test point (id={row.test_point_id}, "
                    f"lookup={lookup})"
                )
            test_point_obj, _ = TestPoint.objects.get_or_create(
                test_point_set=test_point_set,
                current=current,
                frequency=frequency,
                direction=direction,
            )

        readings, _ = CalibrationReadings.objects.get_or_create(test_point=test_point_obj)
        setattr(readings, f"{row.reading_type_full}_readings", row.readings_json or [])
        readings.save()
        readings.update_related_results()

        logger.info("OUTBOX [REPLAY 3/4]: Successfully wrote row_id=%s to MSSQL.", row_id)

    except Exception as write_err:
        # Revert to pending and bump attempt counter. Transient errors stay
        # retryable; after _MAX_ATTEMPTS_BEFORE_FAILED we mark the row as
        # failed so the UI can surface it instead of retrying forever.
        logger.warning("OUTBOX [REPLAY FAILED]: MSSQL write failed for row_id=%s. Error: %s", row_id, write_err)
        try:
            with transaction.atomic(using='outbox'):
                row = PendingReadingWrite.objects.using('outbox').get(pk=row_id)
                row.attempts = (row.attempts or 0) + 1
                row.last_error = f"{type(write_err).__name__}: {write_err}"[:2000]
                row.last_attempt_at = timezone.now()
                if row.attempts >= _MAX_ATTEMPTS_BEFORE_FAILED:
                    row.status = PendingReadingWrite.STATUS_FAILED
                    logger.error(
                        "OUTBOX [REPLAY DEAD]: row %s exhausted retries (%s). Last error: %s",
                        row_id, row.attempts, row.last_error,
                    )
                else:
                    row.status = PendingReadingWrite.STATUS_PENDING
                row.save(update_fields=['attempts', 'last_error', 'last_attempt_at', 'status'])
                logger.info("OUTBOX [REPLAY BOOKKEEPING]: row_id=%s set to %s (Attempt %s)", row_id, row.status, row.attempts)
        except Exception as bookkeeping_err:
            logger.exception("OUTBOX [REPLAY ERROR]: bookkeeping failed for row %s: %s", row_id, bookkeeping_err)
        return False

    # 3. Mark done. If this update fails (exceedingly unlikely — it's a local
    #    SQLite write), the row stays in_flight and the next drainer pass
    #    will just re-run the (idempotent) write.
    try:
        with transaction.atomic(using='outbox'):
            row = PendingReadingWrite.objects.using('outbox').get(pk=row_id)
            row.status = PendingReadingWrite.STATUS_DONE
            row.last_attempt_at = timezone.now()
            row.last_error = ''
            row.save(update_fields=['status', 'last_attempt_at', 'last_error'])
            logger.info("OUTBOX [REPLAY 4/4]: Marked row_id=%s as DONE.", row_id)
    except Exception as mark_err:
        logger.warning("OUTBOX [REPLAY ERROR]: could not mark row %s done: %s", row_id, mark_err)

    return True


# -----------------------------------------------------------------------------
# Health probe
# -----------------------------------------------------------------------------
def probe_default_reachable(force: bool = False) -> bool:
    """
    Cheap ``SELECT 1`` against the default DB. Throttled so repeated calls
    within ``_HEALTH_PROBE_MIN_INTERVAL`` reuse the last result.
    """
    global _last_probe_reachable, _last_probe_ts
    now = time.monotonic()
    if (
        not force
        and _last_probe_reachable is not None
        and (now - _last_probe_ts) < _HEALTH_PROBE_MIN_INTERVAL
    ):
        return _last_probe_reachable

    try:
        conn = connections['default']
        # close_if_unusable_or_obsolete ensures we don't keep reusing a dead
        # pyodbc connection when MSSQL has already dropped.
        conn.close_if_unusable_or_obsolete()
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        _last_probe_reachable = True
    except Exception as e:
        _last_probe_reachable = False
        logger.debug("OUTBOX: default DB probe failed: %s", e)

    _last_probe_ts = now
    return _last_probe_reachable


def get_pending_count_sync() -> int:
    """Return the number of outbox rows still waiting to be replayed."""
    from .models import PendingReadingWrite
    try:
        return PendingReadingWrite.objects.using('outbox').filter(
            status__in=(
                PendingReadingWrite.STATUS_PENDING,
                PendingReadingWrite.STATUS_IN_FLIGHT,
            )
        ).count()
    except Exception as e:
        logger.debug("OUTBOX: get_pending_count_sync failed: %s", e)
        return 0


def get_failed_count_sync() -> int:
    from .models import PendingReadingWrite
    try:
        return PendingReadingWrite.objects.using('outbox').filter(
            status=PendingReadingWrite.STATUS_FAILED
        ).count()
    except Exception as e:
        logger.debug("OUTBOX: get_failed_count_sync failed: %s", e)
        return 0

def get_pending_details_sync() -> list:
    """Return a list of dicts describing the top 10 pending rows."""
    from .models import PendingReadingWrite
    try:
        # Fetch the oldest 10 pending rows to show in the UI tooltip
        qs = PendingReadingWrite.objects.using('outbox').filter(
            status__in=(
                PendingReadingWrite.STATUS_PENDING,
                PendingReadingWrite.STATUS_IN_FLIGHT,
            )
        ).order_by('created_at')[:10]
        
        return [
            {
                'stage': row.reading_type_full,
                'current': (row.test_point_lookup or {}).get('current', 'Unknown'),
                'frequency': (row.test_point_lookup or {}).get('frequency', 'Unknown'),
            }
            for row in qs
        ]
    except Exception as e:
        logger.debug("OUTBOX: get_pending_details_sync failed: %s", e)
        return []


# -----------------------------------------------------------------------------
# Broadcast helpers
# -----------------------------------------------------------------------------
def current_status_payload() -> dict:
    """Snapshot used by both the initial WS greeting and broadcasts."""
    return {
        'type': 'db_status',
        'reachable': probe_default_reachable(),
        'pending_count': get_pending_count_sync(),
        'failed_count': get_failed_count_sync(),
        'pending_details': get_pending_details_sync(),
        'timestamp': time.time(),
    }


async def broadcast_db_status(payload: Optional[dict] = None) -> None:
    """Push a status update to every consumer in ``DB_STATUS_GROUP``."""
    try:
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        snapshot = payload or await sync_to_async(current_status_payload, thread_sensitive=True)()
        await channel_layer.group_send(
            DB_STATUS_GROUP,
            {'type': DB_STATUS_EVENT, 'payload': snapshot},
        )
    except Exception as e:
        logger.debug("OUTBOX: broadcast failed: %s", e)


def broadcast_db_status_sync(payload: Optional[dict] = None) -> None:
    """Thread-safe wrapper usable from sync contexts."""
    try:
        async_to_sync(broadcast_db_status)(payload)
    except Exception as e:
        logger.debug("OUTBOX: sync broadcast failed: %s", e)


# -----------------------------------------------------------------------------
# Drainer
# -----------------------------------------------------------------------------
def _delay_for_attempt(attempts: int) -> float:
    """Exponential backoff with +/-20% jitter."""
    idx = min(attempts, len(_BACKOFF_LADDER_SECONDS) - 1)
    base = _BACKOFF_LADDER_SECONDS[idx]
    return base * random.uniform(0.8, 1.2)


def _pick_next_row_sync():
    """
    Pick the oldest pending row whose next-retry window has elapsed.

    Uses ``last_attempt_at`` + backoff(attempts) to decide readiness. A row
    that has never been attempted (``last_attempt_at is None``) is always
    ready.
    """
    from .models import PendingReadingWrite
    try:
        qs = PendingReadingWrite.objects.using('outbox').filter(
            status=PendingReadingWrite.STATUS_PENDING
        ).order_by('created_at', 'id')
        now = timezone.now()
        for row in qs[:200]:  # scan at most 200 oldest; prevents huge queues from starving
            if row.last_attempt_at is None:
                return row.id, row.attempts
            elapsed = (now - row.last_attempt_at).total_seconds()
            if elapsed >= _delay_for_attempt(row.attempts):
                return row.id, row.attempts
        return None, None
    except Exception as e:
        logger.debug("OUTBOX: _pick_next_row_sync failed: %s", e)
        return None, None


async def drain_once() -> int:
    """
    Drain as many ready rows as possible in a single pass.

    Stops early if the default DB becomes unreachable mid-drain (to avoid
    hammering a server that just went down). Returns the number of rows
    successfully replayed.
    """
    drained = 0
    if not await sync_to_async(probe_default_reachable, thread_sensitive=True)(force=True):
        return 0

    while True:
        row_id, _ = await sync_to_async(_pick_next_row_sync, thread_sensitive=True)()
        if row_id is None:
            break
            
        logger.info("OUTBOX [DRAINER]: Found pending row_id=%s, attempting background replay...", row_id)
        ok = await sync_to_async(attempt_replay_row, thread_sensitive=True)(row_id)
        
        if ok:
            drained += 1
            logger.info("OUTBOX [DRAINER]: Background replay SUCCESS for row_id=%s.", row_id)
            if drained % 5 == 0:
                await broadcast_db_status()
        else:
            logger.warning("OUTBOX [DRAINER]: Background replay FAILED for row_id=%s. Aborting pass.", row_id)
            if not await sync_to_async(probe_default_reachable, thread_sensitive=True)(force=True):
                break

    if drained:
        logger.info("OUTBOX [DRAINER]: Pass complete. Successfully recovered %s rows.", drained)
        await broadcast_db_status()
        
        # --- POTENTIAL FIX FOR THE SILENT DRAIN ---
        # You can force the UI to fetch the new data by broadcasting a sync event here
        # to all active sessions, or handle it via DbHealthConsumer.
        
    return drained


def wake_drainer() -> None:
    """Non-async wake signal — safe to call from any thread or sync context."""
    evt = _drainer_wake_event
    loop = _drainer_loop
    if evt is None or loop is None or loop.is_closed():
        return
    try:
        loop.call_soon_threadsafe(evt.set)
    except RuntimeError:
        pass


async def run_drainer_forever() -> None:
    """
    Long-running drain loop. Wakes on ``_drainer_wake_event`` or on a periodic
    timer (30s by default). Designed to outlive individual calibration runs
    and keep the outbox healthy across the entire app lifetime.
    """
    global _drainer_wake_event, _drainer_loop
    _drainer_loop = asyncio.get_running_loop()
    _drainer_wake_event = asyncio.Event()

    logger.info("OUTBOX: drainer started.")

    # Flush anything left over from a previous process lifetime.
    try:
        recovered = await drain_once()
        if recovered:
            logger.info("OUTBOX: recovered %s stage write(s) on boot.", recovered)
            await broadcast_db_status()
    except Exception as e:
        logger.warning("OUTBOX: boot drain failed: %s", e)

    while True:
        try:
            # Wake on new enqueues OR every 30s — whichever comes first.
            try:
                await asyncio.wait_for(_drainer_wake_event.wait(), timeout=30.0)
            except asyncio.TimeoutError:
                pass
            _drainer_wake_event.clear()

            await drain_once()
        except asyncio.CancelledError:
            logger.info("OUTBOX: drainer cancelled, exiting cleanly.")
            raise
        except Exception as e:
            # Never let a transient bug kill the drainer.
            logger.exception("OUTBOX: drainer loop error (continuing): %s", e)
            await asyncio.sleep(5.0)


# -----------------------------------------------------------------------------
# Drainer bootstrap
# -----------------------------------------------------------------------------
def start_drainer() -> None:
    """
    Spawn the drainer task on the currently-running asyncio loop.

    Idempotent — safe to call multiple times; subsequent calls are no-ops.
    If called before an event loop exists (e.g. during sync startup) we defer
    until the first consumer connects, which is guaranteed to be async.
    """
    global _drainer_task
    with _drainer_lock:
        if _drainer_task is not None and not _drainer_task.done():
            return
        try:
            loop = asyncio.get_event_loop()
            if not loop.is_running():
                # No running loop yet — the first AsyncConsumer connect will
                # call start_drainer() again from inside the running loop.
                return
            _drainer_task = loop.create_task(run_drainer_forever())
        except RuntimeError:
            # No event loop in this thread; will be bootstrapped later.
            return


def ensure_drainer_running() -> None:
    """
    Call from async contexts (e.g. consumer ``connect``) to guarantee the
    drainer is spawned on the ASGI loop. Safe to call on every connect.
    """
    global _drainer_task
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    with _drainer_lock:
        if _drainer_task is None or _drainer_task.done():
            _drainer_task = loop.create_task(run_drainer_forever())


# -----------------------------------------------------------------------------
# Admin helpers
# -----------------------------------------------------------------------------
def retry_failed_rows_sync() -> int:
    """Flip all failed rows back to pending and wake the drainer."""
    from .models import PendingReadingWrite
    updated = PendingReadingWrite.objects.using('outbox').filter(
        status=PendingReadingWrite.STATUS_FAILED
    ).update(status=PendingReadingWrite.STATUS_PENDING, attempts=0, last_error='')
    if updated:
        wake_drainer()
    return updated
