import json
import asyncio
import time
import traceback
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async

from .NPSL_Tools.instruments import Instrument3458A, Instrument5730A, Instrument5790B, Instrument34420A
from .models import CalibrationReadings, CalibrationSession, TestPoint, TestPointSet

INSTRUMENT_CLASS_MAP = {
    '5730A': Instrument5730A,
    '5790B': Instrument5790B,
    '3458A': Instrument3458A,
    '34420A': Instrument34420A
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
        else:
            await self.send(text_data=json.dumps({'error': 'Unknown command'}))

    @sync_to_async(thread_sensitive=True)
    def connect_instrument_sync(self):
        try:
            instance = self.instrument_class(gpib=self.gpib_address) if self.instrument_class == Instrument34420A else self.instrument_class(model=self.instrument_model, gpib=self.gpib_address)
            return instance
        except Exception as e:
            print(f"StatusConsumer: Error instantiating/connecting to {self.gpib_address}: {e}")
            return None

    @sync_to_async(thread_sensitive=True)
    def close_instrument_sync(self):
        if self.instrument_instance and hasattr(self.instrument_instance.resource, 'close'):
            self.instrument_instance.resource.close()

    @sync_to_async(thread_sensitive=True)
    def get_status_sync(self):
        if not self.instrument_instance:
            return {'status_report': 'error', 'error_message': 'Instrument not connected.'}
        try:
            raw_status = self.instrument_instance.get_instrument_status()
            return {'status_report': 'ok', 'raw_isr': raw_status}
        except Exception as e:
            return {'status_report': 'error', 'error_message': str(e)}

class CalibrationConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.collection_task = None
        self.stop_event = asyncio.Event()

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
        
        if self.collection_task and not self.collection_task.done():
            if command == 'stop_collection': self.stop_event.set()
            else: await self.send(text_data=json.dumps({'type': 'error', 'message': 'A collection is already in progress.'}))
            return
            
        self.stop_event.clear()

        if command == 'start_collection':
            self.collection_task = asyncio.create_task(self.collect_single_reading_set(data))
        elif command == 'start_full_calibration':
            self.collection_task = asyncio.create_task(self.run_full_calibration_sequence(data))
        elif command == 'stop_collection':
            self.stop_event.set()

    @sync_to_async(thread_sensitive=True)
    def _take_one_reading(self, instrument):
        return instrument.read_instrument()

    @database_sync_to_async
    def get_session_details(self):
        try:
            session = CalibrationSession.objects.get(pk=self.session_id)
            return {
                'ac_source_address': session.ac_source_address, 'dc_source_address': session.dc_source_address,
                'std_reader_address': session.standard_reader_address, 'std_reader_model': session.standard_reader_model,
                'ti_reader_address': session.test_reader_address, 'ti_reader_model': session.test_reader_model,
            }
        except CalibrationSession.DoesNotExist: return None

    async def _perform_single_measurement(self, reading_type_base, num_samples, test_point_data, bypass_tvc, amplifier_range, source_instrument, std_reader_instrument, ti_reader_instrument):
        is_ac_reading = 'ac' in reading_type_base
        input_current = float(test_point_data.get('current'))
        voltage = (input_current / float(amplifier_range)) * 2 if not bypass_tvc and amplifier_range and float(amplifier_range) != 0 else input_current
        if 'neg' in reading_type_base: voltage = -voltage
        
        config_voltage, frequency = abs(voltage), float(test_point_data.get('frequency', 0)) if is_ac_reading else 0

        for instrument in [std_reader_instrument, ti_reader_instrument]:
            if isinstance(instrument, Instrument5790B): await sync_to_async(instrument.set_range, thread_sensitive=True)(value=config_voltage)
            elif isinstance(instrument, Instrument3458A): await sync_to_async(instrument.configure_measurement, thread_sensitive=True)(**{'function': 'ACV' if is_ac_reading else 'DCV', 'expected_value': config_voltage, 'frequency': frequency})

        await sync_to_async(source_instrument.set_output, thread_sensitive=True)(voltage=voltage, frequency=frequency)
        await sync_to_async(source_instrument.set_operate, thread_sensitive=True)()
        await asyncio.gather(self._take_one_reading(std_reader_instrument), self._take_one_reading(ti_reader_instrument))

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
        source_instrument, std_reader_instrument, ti_reader_instrument = None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")
            
            reading_type_base = data.get('reading_type')
            is_ac_reading = 'ac' in reading_type_base
            source_address = session_details.get('ac_source_address') if is_ac_reading else session_details.get('dc_source_address')
            if not source_address: raise Exception(f"Required {'AC' if is_ac_reading else 'DC'} Source is not assigned.")

            std_reader_model, ti_reader_model = session_details.get('std_reader_model'), session_details.get('ti_reader_model')
            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_reader_model), INSTRUMENT_CLASS_MAP.get(ti_reader_model)
            
            source_instrument = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=source_address)
            std_reader_instrument = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=session_details.get('std_reader_address')) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_reader_model, gpib=session_details.get('std_reader_address'))
            ti_reader_instrument = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=session_details.get('ti_reader_address')) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_reader_model, gpib=session_details.get('ti_reader_address'))
            
            await self._perform_single_measurement(reading_type_base, data.get('num_samples'), data.get('test_point'), data.get('bypass_tvc'), data.get('amplifier_range'), source_instrument, std_reader_instrument, ti_reader_instrument)
            
            if not self.stop_event.is_set(): await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))
            else: await self.send(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Collection stopped by user.'}))
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            if source_instrument: await sync_to_async(source_instrument.set_standby, thread_sensitive=True)()

    async def run_full_calibration_sequence(self, data):
        ac_source, dc_source, std_reader, ti_reader = None, None, None, None
        try:
            session_details = await self.get_session_details()
            if not session_details: raise Exception("Session not found.")
            
            settling_time = float(data.get('settling_time', 5.0))
            num_samples = data.get('num_samples', 8)
            ac_source_address, dc_source_address = session_details.get('ac_source_address'), session_details.get('dc_source_address')
            std_reader_model, ti_reader_model = session_details.get('std_reader_model'), session_details.get('ti_reader_model')
            std_reader_class, ti_reader_class = INSTRUMENT_CLASS_MAP.get(std_reader_model), INSTRUMENT_CLASS_MAP.get(ti_reader_model)

            if ac_source_address: ac_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=ac_source_address)
            if dc_source_address: dc_source = await sync_to_async(Instrument5730A, thread_sensitive=True)(model="5730A", gpib=dc_source_address)
            std_reader = await sync_to_async(std_reader_class, thread_sensitive=True)(gpib=session_details.get('std_reader_address')) if std_reader_class == Instrument34420A else await sync_to_async(std_reader_class, thread_sensitive=True)(model=std_reader_model, gpib=session_details.get('std_reader_address'))
            ti_reader = await sync_to_async(ti_reader_class, thread_sensitive=True)(gpib=session_details.get('ti_reader_address')) if ti_reader_class == Instrument34420A else await sync_to_async(ti_reader_class, thread_sensitive=True)(model=ti_reader_model, gpib=session_details.get('ti_reader_address'))

            for stage in ['ac_open', 'dc_pos', 'dc_neg', 'ac_close']:
                if self.stop_event.is_set(): break
                
                await self.send(text_data=json.dumps({
                    'type': 'calibration_stage_update', 
                    'stage': stage,
                    'total': num_samples
                }))
                await asyncio.sleep(settling_time)
                
                source_instrument = ac_source if 'ac' in stage else dc_source
                if not source_instrument: raise Exception(f"Required {'AC' if 'ac' in stage else 'DC'} Source is not assigned.")

                await self._perform_single_measurement(stage, num_samples, data.get('test_point'), data.get('bypass_tvc'), data.get('amplifier_range'), source_instrument, std_reader, ti_reader)
            
            if not self.stop_event.is_set(): await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))
            else: await self.send(text_data=json.dumps({'type': 'collection_stopped', 'message': 'Collection stopped by user.'}))
        except Exception as e:
            traceback.print_exc()
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"An instrument error occurred: {e}"}))
        finally:
            if ac_source: await sync_to_async(ac_source.set_standby, thread_sensitive=True)()
            if dc_source: await sync_to_async(dc_source.set_standby, thread_sensitive=True)()

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