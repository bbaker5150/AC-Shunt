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

from npsl_tools.instruments import Instrument11713C, Instrument3458A, Instrument5730A, Instrument5790B, Instrument34420A, Instrument8100
from .models import CalibrationReadings, CalibrationSession, CalibrationSettings, TestPoint, TestPointSet

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
        self.gpib_address = self.scope['url_route']['kwargs']['gpib_address']
        self.instrument_class = INSTRUMENT_CLASS_MAP.get(self.instrument_model)
        if not self.instrument_class:
            await self.close(code=4001)
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
        if self.instrument_instance:
            await self.close_instrument_sync()
            self.instrument_instance = None

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')
        if command == 'get_instrument_status':
            status_result = await self.get_status_sync()
            payload = {'instrument_model': self.instrument_model, 'gpib_address': self.gpib_address, 'timestamp': time.time(), **status_result}
            await self.send(text_data=json.dumps(payload))
        elif command == 'run_zero_cal':
            print(f"[StatusConsumer] Processing Zero Cal request for {self.gpib_address}...")
            # 1. Notify Frontend it started
            await self.send(text_data=json.dumps({
                'type': 'zero_cal_started', 
                'message': 'Zero Calibration started. Please wait...'
            }))
            
            # 2. Run the BLOCKING driver call
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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.collection_task = None
        self.heartbeat_task = None
        self.stop_event = asyncio.Event()
        self.confirmation_event = asyncio.Event()
        self.confirmation_status = None
        self.state = "IDLE"

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.session_group_name = f'session_{self.session_id}'
        await self.channel_layer.group_add(self.session_group_name, self.channel_name)
        await self.accept()

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
        if self.collection_task:
            self.collection_task.cancel()
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
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
        
        if command in ['amplifier_confirmed', 'operation_cancelled']:
            self.confirmation_status = 'confirmed' if command == 'amplifier_confirmed' else 'cancelled'
            self.confirmation_event.set()
            return

        if command == 'stop_collection':
            self.stop_event.set()
            if self.collection_task:
                self.collection_task.cancel()
            
            await self.send(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Collection stopped by user.'}))
            return

        if self.state == "BUSY":
            await self.send(text_data=json.dumps({'type': 'error', 'message': 'A collection is already in progress.'}))
            return
            
        self.stop_event.clear()
        
        task_started = False
        if command in ['start_collection', 'start_full_calibration', 'start_single_stage_batch', 'start_full_calibration_batch']:
            self.state = "BUSY"
            task_started = True
            if command == 'start_collection':
                self.collection_task = asyncio.create_task(self.collect_single_reading_set(data))
            elif command == 'start_full_calibration':
                self.collection_task = asyncio.create_task(self.run_full_calibration_sequence(data))
            elif command == 'start_single_stage_batch':
                self.collection_task = asyncio.create_task(self.run_single_stage_batch(data))
            elif command == 'start_full_calibration_batch':
                self.collection_task = asyncio.create_task(self.run_full_calibration_batch(data))
        elif command == 'set_amplifier_range':
            await self.set_amplifier_range(data)

        if not task_started:
            self.state = "IDLE"

    async def _handle_amplifier_confirmation(self, amplifier_instrument, amplifier_range, data):
        if data.get('bypass_amplifier_confirmation'):
            return True

        if not amplifier_instrument or not amplifier_range:
            return True

        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Setting amplifier range to {amplifier_range} A..."}))
        await sync_to_async(amplifier_instrument.set_range, thread_sensitive=True)(range_amps=float(amplifier_range))

        self.confirmation_event.clear()
        self.confirmation_status = None

        await self.send(text_data=json.dumps({'type': 'awaiting_amplifier_confirmation', 'range': amplifier_range}))
        await self.confirmation_event.wait()

        if self.confirmation_status != 'confirmed':
            await self.send(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Operation cancelled by user.'}))
            return False 

        await self.send(text_data=json.dumps({'type': 'status_update', 'message': "Amplifier range confirmed by user."}))
        return True 

    async def set_amplifier_range(self, data):
        amplifier = None
        try:
            session_details = await self.get_session_details()
            amp_address = session_details.get('amplifier_address')
            amp_range = data.get('amplifier_range')
            if amp_address and amp_range:
                amplifier = await sync_to_async(Instrument8100, thread_sensitive=True)(model='8100', gpib=amp_address)
                await sync_to_async(amplifier.set_range, thread_sensitive=True)(range_amps=float(amp_range))
                await self.send(text_data=json.dumps({'type': 'amplifier_range_set', 'message': 'Amplifier range set successfully.'}))
            else:
                await self.send(text_data=json.dumps({'type': 'error', 'message': 'Amplifier address or range not configured for this session.'}))
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"Failed to set amplifier range: {e}"}))
        finally:
            if amplifier and hasattr(amplifier, 'close'):
                await sync_to_async(amplifier.close, thread_sensitive=True)()

    @sync_to_async(thread_sensitive=True)
    def _take_one_reading(self, instrument):
        return instrument.read_instrument()

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
        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Taking pre-check sample from {instrument_name}..."}))
        reading = await self._take_one_reading(instrument)
        
        lower_bound = expected_value * (1 - tolerance)
        upper_bound = expected_value * (1 + tolerance)
        reading_abs = abs(reading)

        if lower_bound <= reading_abs <= upper_bound:
            await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"{instrument_name} check passed. Reading: {reading_abs:.4f}V"}))
            return True
        else:
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"{instrument_name} pre-check failed. Reading: {reading_abs:.4f}V, Expected: ~{expected_value:.4f}V"}))
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

        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Initial warm-up period started for {warmup_time}s..."}))
        
        try:
            await asyncio.sleep(warmup_time)
        except asyncio.CancelledError:
            raise

        if not self.stop_event.is_set():
            await self.send(text_data=json.dumps({'type': 'status_update', 'message': "Warm-up complete. Starting measurement."}))

    async def _perform_single_measurement(self, reading_type_base, num_samples, test_point_data, bypass_tvc, amplifier_range, source_instrument, std_reader_instrument, ti_reader_instrument, amplifier_instrument=None, settling_time=0, nplc_setting=None, measurement_params=None):
        """
        Refactored measurement logic: 
        1. Phase 1 (Search): Discards samples (slides window) until initial stability is found.
        2. Phase 2 (Collection): Collects num_samples while monitoring stability.
        3. Abort: Returns False if max_attempts is reached.
        """
        is_ac_reading = 'ac' in reading_type_base
        input_current = float(test_point_data.get('current'))
        voltage = (input_current / float(amplifier_range)) * 2
        if 'neg' in reading_type_base: voltage = -voltage
        
        config_voltage, frequency = abs(voltage), float(test_point_data.get('frequency', 0)) if is_ac_reading else 0
        ignore_after_lock = measurement_params.get('ignore_instability_after_lock', False)

        # Instrument Configuration (Standard and TI)
        for instrument in [std_reader_instrument, ti_reader_instrument]:
            if isinstance(instrument, Instrument34420A) and nplc_setting is not None:
                await sync_to_async(instrument.set_integration, thread_sensitive=True)(setting=nplc_setting)
            if isinstance(instrument, Instrument5790B): 
                await sync_to_async(instrument.set_range, thread_sensitive=True)(value=config_voltage)
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
            await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Settling for {settling_time}s..."}))
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

        await self.send(text_data=json.dumps({'type': 'status_update', 'message': "Monitoring stability..."}))

        while len(final_std_readings) < num_samples and not self.stop_event.is_set():
            # 1. Global Abort Check (Applies to both Search and Collection phases)
            if instability_events >= max_retries:
                # Generate the exact key used by the frontend
                tp_key = f"{test_point_data.get('current')}-{test_point_data.get('frequency')}"
                
                if tp_id:
                    await self.set_test_point_failed_status(tp_id, True)
                
                await self.send(text_data=json.dumps({
                    'type': 'warning',
                    'message': f"Test point aborted: Stability limit ({max_retries}) reached.",
                    'tpKey': tp_key # <-- Send the key directly to the UI
                }))
                return False

            # 2. Take Readings
            std_reading_val, ti_reading_val = await asyncio.gather(
                self._take_one_reading(std_reader_instrument),
                self._take_one_reading(ti_reader_instrument)
            )
            timestamp = time.time()
            
            std_point = {'value': std_reading_val, 'timestamp': timestamp, 'is_stable': True}
            ti_point = {'value': ti_reading_val, 'timestamp': timestamp, 'is_stable': True}

            if stability_method == 'sliding_window':
                stable_candidate_std.append(std_point)
                stable_candidate_ti.append(ti_point)

                if len(stable_candidate_std) >= window_size:
                    # Analyze current window
                    current_window = stable_candidate_std[-window_size:]
                    current_ppm = calc_ppm(current_window)
                    is_currently_stable = current_ppm < threshold_ppm

                    # --- EVALUATE STABILITY & INCREMENT BEFORE SENDING ---
                    if not initial_stability_achieved:
                        if is_currently_stable:
                            initial_stability_achieved = True
                            final_std_readings.extend(stable_candidate_std)
                            final_ti_readings.extend(stable_candidate_ti)
                        else:
                            # SEARCH PHASE: Unstable. Increment retry count and slide window
                            instability_events += 1
                            stable_candidate_std.pop(0)
                            stable_candidate_ti.pop(0)
                    else:
                        # COLLECTION PHASE: Monitor but keep all samples
                        if not is_currently_stable:
                            if not ignore_after_lock:
                                instability_events += 1
                        final_std_readings.append(std_point)
                        final_ti_readings.append(ti_point)

                    # --- NOW SEND UPDATES WITH THE ACCURATE METRICS ---
                    await self.send(text_data=json.dumps({
                        'type': 'sliding_window_update',
                        'ppm': current_ppm,
                        'stdev_ppm': current_ppm,
                        'is_stable': is_currently_stable,
                        'instability_events': instability_events,
                        'max_retries': max_retries
                    }))
                    
                    await self.send(text_data=json.dumps({
                        'type': 'status_update',
                        'message': f"Stdev: {current_ppm:.2f} PPM [{instability_events}/{max_retries}]"
                    }))

                    # Announce stability ONLY exactly when it is found
                    if initial_stability_achieved and is_currently_stable and len(final_std_readings) == window_size:
                        await self.send(text_data=json.dumps({'type': 'status_update', 'message': "Initial stability achieved."}))

                else:
                    # Still filling initial window
                    await self.send(text_data=json.dumps({
                        'type': 'status_update',
                        'message': f"Filling initial window... [{len(stable_candidate_std)}/{window_size}]"
                    }))
                    
                    temp_ppm = calc_ppm(stable_candidate_std) if len(stable_candidate_std) > 1 else None
                    temp_is_stable = (temp_ppm < threshold_ppm) if temp_ppm is not None else True
                    
                    await self.send(text_data=json.dumps({
                        'type': 'sliding_window_update',
                        'ppm': temp_ppm,
                        'stdev_ppm': temp_ppm,
                        'is_stable': temp_is_stable,
                        'instability_events': instability_events,
                        'max_retries': max_retries
                    }))
            else:
                final_std_readings.append(std_point)
                final_ti_readings.append(ti_point)

            # Update the UI with the latest points
            current_count = len(final_std_readings) if initial_stability_achieved else len(stable_candidate_std)

            await self.send(text_data=json.dumps({
                'type': 'dual_reading_update',
                'std_reading': std_point,
                'ti_reading': ti_point,
                'count': current_count,
                'stable_count': len(final_std_readings),
                'total': num_samples,
                'stage': reading_type_base
            }))

            await asyncio.sleep(0.05)
        
        # Save the final (locked) sets to the database
        if final_std_readings and not self.stop_event.is_set():
            await self.save_readings_to_db(f"std_{reading_type_base}", final_std_readings, test_point_data)
            await self.save_readings_to_db(f"ti_{reading_type_base}", final_ti_readings, test_point_data)
            await self.send(text_data=json.dumps({
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
                switch_driver = await sync_to_async(Instrument11713C, thread_sensitive=True)(gpib=session_details.get('switch_driver_address'))

            reading_type_base = data.get('reading_type')
            is_ac_reading = 'ac' in reading_type_base

            if switch_driver:
                required_state = 'AC' if is_ac_reading else 'DC'
                await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_state} source..."}))
                if required_state == 'AC':
                    await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                else:
                    await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                
                await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_state}))
                await asyncio.sleep(1)

            ac_source_address = session_details.get('ac_source_address')
            dc_source_address = session_details.get('dc_source_address')

            if ac_source_address and ac_source_address == dc_source_address:
                shared_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: 
                    ac_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                if dc_source_address: 
                    dc_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=dc_source_address)

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader_instrument = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_model, gpib=std_addr)
            ti_reader_instrument = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_model, gpib=ti_addr)
            
            await self._configure_sources(
                data.get('test_point'), 
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )

            if session_details.get('amplifier_address'):
                amplifier_instrument = await sync_to_async(Instrument8100, thread_sensitive=True)(model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier_instrument, data.get('amplifier_range'), data): return

            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)

            warmup_time = data.get('initial_warm_up_time', 0)
            
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            source_instrument = ac_source if is_ac_reading else dc_source
            if not source_instrument:
                raise Exception(f"Required {'AC' if is_ac_reading else 'DC'} Source is not assigned.")

            await self.send(text_data=json.dumps({
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
                await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))
            elif not success and not self.stop_event.is_set():
                await self.send(text_data=json.dumps({'type': 'error', 'message': 'Test point aborted due to stability limit.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            self.state = "IDLE"
            if switch_driver:
                await sync_to_async(switch_driver.deactivate_all, thread_sensitive=True)()
                await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': 'AC'}))
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
                shared_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: ac_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                if dc_source_address: dc_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=dc_source_address)

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_model, gpib=ti_addr)

            await self._configure_sources(
                data.get('test_point'), 
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )
            
            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(Instrument8100, thread_sensitive=True)(model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data): return
            
            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)
            
            warmup_time = data.get('initial_warm_up_time', 0)
            
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            settling_time, num_samples, nplc_setting, measurement_params = float(data.get('settling_time', 5.0)), data.get('num_samples', 8), data.get('nplc'), data.get('measurement_params')

            for stage in ['ac_open', 'dc_pos', 'dc_neg', 'ac_close']:
                if self.stop_event.is_set(): break
                
                switch_driver = None
                try:
                    if session_details.get('switch_driver_address'):
                        switch_driver = await sync_to_async(Instrument11713C, thread_sensitive=True)(gpib=session_details.get('switch_driver_address'))
                        required_switch_state = 'AC' if 'ac' in stage else 'DC'
                        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_switch_state} source..."}))
                        if required_switch_state == 'AC': await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                        else: await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                        await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_switch_state}))
                        await asyncio.sleep(1)

                    source_instrument = ac_source if 'ac' in stage else dc_source
                    if not source_instrument: raise Exception(f"Required {'AC' if 'ac' in stage else 'DC'} Source is not assigned.")
                    
                    await self.send(text_data=json.dumps({'type': 'calibration_stage_update', 'stage': stage, 'total': num_samples}))
                    
                    success = await self._perform_single_measurement(stage, num_samples, data.get('test_point'), data.get('bypass_tvc'), data.get('amplifier_range'), source_instrument, std_reader, ti_reader, amplifier, settling_time, nplc_setting, measurement_params)
                    
                    # Stop sequence if measurement fails due to instability limits
                    if not success: 
                        if not self.stop_event.is_set():
                            await self.send(text_data=json.dumps({'type': 'error', 'message': f"Sequence aborted: Stability limit reached on {stage}."}))
                        break 
                finally:
                    if switch_driver and hasattr(switch_driver, 'close'): await sync_to_async(switch_driver.close, thread_sensitive=True)()
            
            if not self.stop_event.is_set():
                await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            self.state = "IDLE"
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
                shared_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: ac_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                if dc_source_address: dc_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=dc_source_address)
            
            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_model, gpib=ti_addr)

            if session_details.get('switch_driver_address'):
                switch_driver = await sync_to_async(Instrument11713C, thread_sensitive=True)(gpib=session_details.get('switch_driver_address'))
            
            await self._configure_sources(
                test_points_to_run,
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )
            
            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(Instrument8100, thread_sensitive=True)(model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data): return
            
            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)
            
            warmup_time = data.get('initial_warm_up_time', 0)
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            nplc_setting, measurement_params = data.get('nplc'), data.get('measurement_params')

            for i, point_data in enumerate(test_points_to_run):
                if self.stop_event.is_set(): break
                
                current_settling_time = float(point_data.get('settling_time', data.get('settling_time', 5.0)))
                current_num_samples = int(point_data.get('num_samples', data.get('num_samples', 8)))

                await self.send(text_data=json.dumps({
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
                        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_switch_state} source..."}))
                        if required_switch_state == 'AC': await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                        else: await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                        await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_switch_state}))
                        await asyncio.sleep(1)

                    source_instrument = ac_source if 'ac' in stage else dc_source
                    if not source_instrument: raise Exception(f"Required source for stage '{stage}' is not assigned.")
                    
                    await self.send(text_data=json.dumps({
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
                await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'Batch calibration complete.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred during batch run: {e}"}))
        finally:
            self.state = "IDLE"
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
                shared_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                ac_source, dc_source = shared_source, shared_source
            else:
                if ac_source_address: ac_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
                if dc_source_address: dc_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=dc_source_address)

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            std_reader = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_model, gpib=ti_addr)

            await self._configure_sources(
                test_points_to_run,
                data.get('bypass_tvc'), 
                data.get('amplifier_range'), 
                ac_source=ac_source, 
                dc_source=dc_source
            )
            
            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(Instrument8100, thread_sensitive=True)(model='8100', gpib=session_details.get('amplifier_address'))
                if not await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data): return
            
            await self._activate_sources(ac_source=ac_source, dc_source=dc_source)
            
            warmup_time = data.get('initial_warm_up_time', 0)
            if warmup_time > 0:
                await self._perform_warmup(warmup_time)

            source_instrument = ac_source if 'ac' in stage else dc_source
            if not source_instrument: raise Exception(f"Required source for stage '{stage}' is not assigned.")

            switch_driver = None
            if session_details.get('switch_driver_address'):
                switch_driver = await sync_to_async(Instrument11713C, thread_sensitive=True)(gpib=session_details.get('switch_driver_address'))
                required_switch_state = 'AC' if 'ac' in stage else 'DC'
                await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_switch_state} source for batch run..."}))
                if required_switch_state == 'AC': await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                else: await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_switch_state}))
                await asyncio.sleep(1)

            nplc_setting, measurement_params = data.get('nplc'), data.get('measurement_params')

            for i, point_data in enumerate(test_points_to_run):
                if self.stop_event.is_set(): break

                current_settling_time = float(point_data.get('settling_time', data.get('settling_time', 5.0)))
                current_num_samples = int(point_data.get('num_samples', data.get('num_samples', 8)))

                await self.send(text_data=json.dumps({
                    'type': 'batch_progress_update',
                    'test_point': point_data,
                    'current': i + 1,
                    'total': len(test_points_to_run)
                }))
                
                await self.send(text_data=json.dumps({
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
                await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'Batch readings complete.'}))

        except asyncio.CancelledError:
            print(f"Collection task cancelled for session {self.session_id}.")
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred during batch run: {e}"}))
        finally:
            self.state = "IDLE"
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

    @database_sync_to_async
    def save_readings_to_db(self, reading_type_full, readings_list, test_point):
        current, frequency, direction = test_point.get('current'), test_point.get('frequency'), test_point.get('direction', 'Forward')
        try:
            session = CalibrationSession.objects.get(pk=self.session_id)
            test_point_set, _ = TestPointSet.objects.get_or_create(session=session)
            test_point_obj, _ = TestPoint.objects.get_or_create(test_point_set=test_point_set, current=current, frequency=frequency, direction=direction)
            readings, _ = CalibrationReadings.objects.get_or_create(test_point=test_point_obj)
            setattr(readings, f"{reading_type_full}_readings", readings_list)
            readings.save()
            readings.update_related_results()
        except Exception as e:
            print(f"Error saving readings to DB: {e}")
    
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