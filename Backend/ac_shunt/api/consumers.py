# api/consumers.py

import json
import asyncio
import time
import traceback
import re
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async

from .NPSL_Tools.instruments import Instrument11713C, Instrument3458A, Instrument5730A, Instrument5790B, Instrument34420A, Instrument8100
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
    # This class remains unchanged
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


class CalibrationConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.collection_task = None
        self.stop_event = asyncio.Event()
        self.confirmation_event = asyncio.Event()
        self.confirmation_status = None

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.session_group_name = f'session_{self.session_id}'
        await self.channel_layer.group_add(self.session_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if self.collection_task:
            self.collection_task.cancel()
        await self.channel_layer.group_discard(self.session_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')
        
        if command == 'amplifier_confirmed':
            self.confirmation_status = 'confirmed'
            self.confirmation_event.set()
            return
        elif command == 'operation_cancelled':
            self.confirmation_status = 'cancelled'
            self.confirmation_event.set()
            return

        if self.collection_task and not self.collection_task.done():
            if command == 'stop_collection': self.stop_event.set()
            else: await self.send(text_data=json.dumps({'type': 'error', 'message': 'A collection is already in progress.'}))
            return
            
        self.stop_event.clear()
        
        if command == 'start_collection':
            self.collection_task = asyncio.create_task(self.collect_single_reading_set(data))
        elif command == 'start_full_calibration':
            self.collection_task = asyncio.create_task(self.run_full_calibration_sequence(data))
        elif command == 'set_amplifier_range':
            await self.set_amplifier_range(data)
        elif command == 'stop_collection':
            self.stop_event.set()

    async def _handle_amplifier_confirmation(self, amplifier_instrument, amplifier_range, data):
        """Handles the amplifier confirmation flow."""
        if not amplifier_instrument or not amplifier_range:
            return True # Nothing to confirm, proceed.

        # Set the range on the instrument BEFORE asking the user to confirm.
        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Setting amplifier range to {amplifier_range} A..."}))
        await sync_to_async(amplifier_instrument.set_range, thread_sensitive=True)(range_amps=float(amplifier_range))

        # 1. Clear previous confirmation state
        self.confirmation_event.clear()
        self.confirmation_status = None

        # 2. Send request to frontend for user to verify the physical setting and wait
        await self.send(text_data=json.dumps({'type': 'awaiting_amplifier_confirmation', 'range': amplifier_range}))
        await self.confirmation_event.wait()

        # 3. Check the user's response
        if self.confirmation_status != 'confirmed':
            await self.send(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Operation cancelled by user.'}))
            return False # Signal that the operation was cancelled

        # 4. If confirmed, proceed
        await self.send(text_data=json.dumps({'type': 'status_update', 'message': "Amplifier range confirmed by user."}))
        return True # Signal that the operation can continue

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
        """Takes a single reading and checks if it's within tolerance of the expected value."""
        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Taking pre-check sample from {instrument_name}..."}))
        print(f"VERIFY: Performing 10% pre-check for {instrument_name}.")
        
        reading = await self._take_one_reading(instrument)
        
        lower_bound = expected_value * (1 - tolerance)
        upper_bound = expected_value * (1 + tolerance)
        
        reading_abs = abs(reading)

        print(f"VERIFY: {instrument_name} read {reading_abs:.6f}V. Expected range: [{lower_bound:.6f}V, {upper_bound:.6f}V].")
        
        if lower_bound <= reading_abs <= upper_bound:
            await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"{instrument_name} check passed. Reading: {reading_abs:.4f}V"}))
            print(f"VERIFY: {instrument_name} check PASSED.")
            return True
        else:
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"{instrument_name} pre-check failed. Reading: {reading_abs:.4f}V, Expected: ~{expected_value:.4f}V"}))
            print(f"VERIFY: {instrument_name} check FAILED.")
            return False

    async def _perform_single_measurement(self, reading_type_base, num_samples, test_point_data, bypass_tvc, amplifier_range, source_instrument, std_reader_instrument, ti_reader_instrument, amplifier_instrument=None, settling_time=0, nplc_setting=None):
        is_ac_reading = 'ac' in reading_type_base
        input_current = float(test_point_data.get('current'))
        voltage = (input_current / float(amplifier_range)) * 2 if not bypass_tvc and amplifier_range and float(amplifier_range) != 0 else input_current
        if 'neg' in reading_type_base: voltage = -voltage
        
        config_voltage, frequency = abs(voltage), float(test_point_data.get('frequency', 0)) if is_ac_reading else 0

        for instrument in [std_reader_instrument, ti_reader_instrument]:
            if isinstance(instrument, Instrument34420A) and nplc_setting is not None:
                await sync_to_async(instrument.set_integration, thread_sensitive=True)(setting=nplc_setting)
            if isinstance(instrument, Instrument5790B): await sync_to_async(instrument.set_range, thread_sensitive=True)(value=config_voltage)
            elif isinstance(instrument, Instrument3458A): await sync_to_async(instrument.configure_measurement, thread_sensitive=True)(**{'function': 'ACV' if is_ac_reading else 'DCV', 'expected_value': config_voltage, 'frequency': frequency})

        await sync_to_async(source_instrument.set_output, thread_sensitive=True)(voltage=voltage, frequency=frequency)
        await sync_to_async(source_instrument.set_operate, thread_sensitive=True)()
        
        # Add a fixed delay to allow the instrument's internal relays to engage.
        await asyncio.sleep(1.5)
        
        if settling_time > 0:
            await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Settling for {settling_time}s..."}))
            await asyncio.sleep(settling_time)

        # if not await self._verify_initial_reading(std_reader_instrument, "Standard Reader", config_voltage):
        #     return
        # if not await self._verify_initial_reading(ti_reader_instrument, "Test Instrument", config_voltage):
        #     return

        all_std_readings, all_ti_readings = [], []
        for i in range(num_samples):
            if self.stop_event.is_set(): return
            
            std_reading, ti_reading = await asyncio.gather(self._take_one_reading(std_reader_instrument), self._take_one_reading(ti_reader_instrument))
            timestamp = time.time()
            all_std_readings.append({'value': std_reading, 'timestamp': timestamp})
            all_ti_readings.append({'value': ti_reading, 'timestamp': timestamp})
            await self.send(text_data=json.dumps({'type': 'dual_reading_update', 'std_reading': std_reading, 'ti_reading': ti_reading, 'count': i + 1, 'total': num_samples, 'timestamp': timestamp, 'stage': reading_type_base}))
            await asyncio.sleep(0.1)

        await self.save_readings_to_db(f"std_{reading_type_base}", all_std_readings, test_point_data)
        await self.save_readings_to_db(f"ti_{reading_type_base}", all_ti_readings, test_point_data)

    async def collect_single_reading_set(self, data):
        source_instrument, std_reader_instrument, ti_reader_instrument, amplifier_instrument, switch_driver = None, None, None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")
            
            direction = data.get('test_point', {}).get('direction', 'Forward')
            std_addr = session_details.get('std_reader_address')
            ti_addr = session_details.get('ti_reader_address')
            std_model = session_details.get('std_reader_model')
            ti_model = session_details.get('ti_reader_model')

            print(f"[{direction.upper()}] Initial instrument roles: STD GPIB={std_addr}, TI GPIB={ti_addr}")
            if direction == 'Reverse':
                std_addr, ti_addr = ti_addr, std_addr
                std_model, ti_model = ti_model, std_model
                print(f"[{direction.upper()}] Swapped instrument roles: STD GPIB={std_addr}, TI GPIB={ti_addr}")
            
            if session_details.get('amplifier_address'):
                amplifier_instrument = await sync_to_async(Instrument8100, thread_sensitive=True)(model='8100', gpib=session_details.get('amplifier_address'))
                is_confirmed = await self._handle_amplifier_confirmation(amplifier_instrument, data.get('amplifier_range'), data)
                if not is_confirmed:
                    return

            if session_details.get('switch_driver_address'):
                switch_driver = await sync_to_async(Instrument11713C, thread_sensitive=True)(gpib=session_details.get('switch_driver_address'))

            nplc_setting = data.get('nplc')
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

            source_address = session_details.get('ac_source_address') if is_ac_reading else session_details.get('dc_source_address')
            if not source_address: raise Exception(f"Required {'AC' if is_ac_reading else 'DC'} Source is not assigned.")

            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_model), INSTRUMENT_CLASS_MAP.get(ti_model)
            
            source_instrument = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=source_address)
            std_reader_instrument = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_model, gpib=std_addr)
            ti_reader_instrument = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_model, gpib=ti_addr)
            
            await self._perform_single_measurement(reading_type_base, data.get('num_samples'), data.get('test_point'), data.get('bypass_tvc'), data.get('amplifier_range'), source_instrument, std_reader_instrument, ti_reader_instrument, amplifier_instrument, float(data.get('settling_time', 0.0)), nplc_setting)
            
            if not self.stop_event.is_set(): await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))
            else: await self.send(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Collection stopped by user.'}))
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            if switch_driver:
                await sync_to_async(switch_driver.deactivate_all, thread_sensitive=True)()
                await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': 'AC'}))
                if hasattr(switch_driver, 'close'): await sync_to_async(switch_driver.close, thread_sensitive=True)()
            
            if source_instrument:
                await sync_to_async(source_instrument.safe_standby, thread_sensitive=True)()
            if amplifier_instrument:
                await sync_to_async(amplifier_instrument.set_standby, thread_sensitive=True)()
            
            if std_reader_instrument and hasattr(std_reader_instrument, 'close'): await sync_to_async(std_reader_instrument.close, thread_sensitive=True)()
            if ti_reader_instrument and hasattr(ti_reader_instrument, 'close'): await sync_to_async(ti_reader_instrument.close, thread_sensitive=True)()
            if amplifier_instrument and hasattr(amplifier_instrument, 'close'): await sync_to_async(amplifier_instrument.close, thread_sensitive=True)()

    async def run_full_calibration_sequence(self, data):
        ac_source, dc_source, std_reader, ti_reader, amplifier = None, None, None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details:
                raise Exception("Session not found.")

            direction = data.get('test_point', {}).get('direction', 'Forward')
            std_addr = session_details.get('std_reader_address')
            ti_addr = session_details.get('ti_reader_address')
            std_model = session_details.get('std_reader_model')
            ti_model = session_details.get('ti_reader_model')

            print(f"[{direction.upper()}] Initial instrument roles: STD GPIB={std_addr}, TI GPIB={ti_addr}")
            if direction == 'Reverse':
                std_addr, ti_addr = ti_addr, std_addr
                std_model, ti_model = ti_model, std_model
                print(f"[{direction.upper()}] Swapped instrument roles: STD GPIB={std_addr}, TI GPIB={ti_addr}")

            if session_details.get('amplifier_address'):
                amplifier = await sync_to_async(Instrument8100, thread_sensitive=True)(model='8100', gpib=session_details.get('amplifier_address'))
                is_confirmed = await self._handle_amplifier_confirmation(amplifier, data.get('amplifier_range'), data)
                if not is_confirmed:
                    return

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
            std_reader = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=std_addr) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_model, gpib=std_addr)
            ti_reader = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=ti_addr) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_model, gpib=ti_addr)

            settling_time = float(data.get('settling_time', 5.0))
            num_samples = data.get('num_samples', 8)
            nplc_setting = data.get('nplc')

            for stage in ['ac_open', 'dc_pos', 'dc_neg', 'ac_close']:
                if self.stop_event.is_set():
                    break

                switch_driver = None
                try:
                    if session_details.get('switch_driver_address'):
                        switch_driver = await sync_to_async(Instrument11713C, thread_sensitive=True)(gpib=session_details.get('switch_driver_address'))
                        required_switch_state = 'AC' if 'ac' in stage else 'DC'
                        
                        await self.send(text_data=json.dumps({'type': 'status_update', 'message': f"Switching to {required_switch_state} source..."}))
                        if required_switch_state == 'AC':
                            await sync_to_async(switch_driver.select_ac_source, thread_sensitive=True)()
                        else:
                            await sync_to_async(switch_driver.select_dc_source, thread_sensitive=True)()
                        
                        await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': required_switch_state}))
                        await asyncio.sleep(1)

                    source_instrument = ac_source if 'ac' in stage else dc_source
                    if not source_instrument:
                        raise Exception(f"Required {'AC' if 'ac' in stage else 'DC'} Source is not assigned.")
                    
                    await self.send(text_data=json.dumps({'type': 'calibration_stage_update', 'stage': stage, 'total': num_samples}))
                    
                    await self._perform_single_measurement(stage, num_samples, data.get('test_point'), data.get('bypass_tvc'), data.get('amplifier_range'), source_instrument, std_reader, ti_reader, amplifier, settling_time, nplc_setting)

                finally:
                    if switch_driver:
                        await sync_to_async(switch_driver.deactivate_all, thread_sensitive=True)()
                        await self.send(text_data=json.dumps({'type': 'switch_status_update', 'active_source': 'AC'}))
                        if hasattr(switch_driver, 'close'):
                            await sync_to_async(switch_driver.close, thread_sensitive=True)()
            
            if not self.stop_event.is_set():
                await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))
            else:
                await self.send(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Collection stopped by user.'}))
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            sources_to_shutdown = []
            if ac_source and dc_source and ac_source is dc_source:
                sources_to_shutdown.append(ac_source)
            else:
                if ac_source: sources_to_shutdown.append(ac_source)
                if dc_source: sources_to_shutdown.append(dc_source)
            
            for source in sources_to_shutdown:
                await sync_to_async(source.safe_standby, thread_sensitive=True)()

            if amplifier:
                await sync_to_async(amplifier.set_standby, thread_sensitive=True)()

            if std_reader and hasattr(std_reader, 'close'): await sync_to_async(std_reader.close, thread_sensitive=True)()
            if ti_reader and hasattr(ti_reader, 'close'): await sync_to_async(ti_reader.close, thread_sensitive=True)()
            if amplifier and hasattr(amplifier, 'close'): await sync_to_async(amplifier.close, thread_sensitive=True)()

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
        except Exception as e:
            print(f"Error saving readings to DB: {e}")


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