import json
import asyncio
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async

# Corrected import based on your file path:
from .NPSL_Tools.instruments import Instrument3458A, Instrument5730A, Instrument5790B, Instrument34420A
from .models import Calibration, CalibrationReadings, CalibrationSession, TestPoint, TestPointSet

# A mapping from the model name string (sent from frontend) to the Python class
INSTRUMENT_CLASS_MAP = {
    '5730A': Instrument5730A,
    '5790B': Instrument5790B,
    '3458A': Instrument3458A,
    '34420': Instrument34420A
}

class InstrumentStatusConsumer(AsyncWebsocketConsumer):
    """
    Handles WebSocket connections for getting the status of ANY supported instrument.
    The instrument model and GPIB address are specified in the WebSocket URL.
    """
    instrument_instance = None
    instrument_class = None

    async def connect(self):
        # Get model and address from the URL kwargs provided by routing
        self.instrument_model = self.scope['url_route']['kwargs']['instrument_model']
        self.gpib_address = self.scope['url_route']['kwargs']['gpib_address']

        print(f"StatusConsumer: Attempting connection for model '{self.instrument_model}' at '{self.gpib_address}'")

        # Look up the correct Python class from our map
        self.instrument_class = INSTRUMENT_CLASS_MAP.get(self.instrument_model)

        if not self.instrument_class:
            print(f"StatusConsumer: Unknown model '{self.instrument_model}'. Rejecting connection.")
            await self.close(code=4001) # Custom close code for unknown model
            return

        # Connect to the instrument using the dynamically selected class
        self.instrument_instance = await self.connect_instrument_sync()

        if self.instrument_instance:
            await self.accept()
            print(f"StatusConsumer: WebSocket connected for {self.instrument_model} at {self.gpib_address}.")
            await self.send(text_data=json.dumps({
                'connection_status': 'instrument_connected',
                'instrument_model': self.instrument_model,
                'gpib_address': self.gpib_address,
            }))
        else:
            print(f"StatusConsumer: Failed to connect to instrument. Rejecting WebSocket.")
            await self.close(code=4004) # Custom close code for instrument connection failure

    async def disconnect(self, close_code):
        print(f"StatusConsumer: WebSocket disconnected for {self.instrument_model} at {self.gpib_address}. Code: {close_code}")
        if self.instrument_instance:
            await self.close_instrument_sync()
            self.instrument_instance = None

    async def receive(self, text_data):
        # This logic is now generic and works for any connected instrument
        data = json.loads(text_data)
        command = data.get('command')
        if command == 'get_instrument_status':
            status_result = await self.get_status_sync()
            payload = {
                'instrument_model': self.instrument_model,
                'gpib_address': self.gpib_address,
                'timestamp': time.time(),
                **status_result # Unpack the result dict into the payload
            }
            await self.send(text_data=json.dumps(payload))
        else:
            await self.send(text_data=json.dumps({'error': 'Unknown command'}))

    @sync_to_async(thread_sensitive=True)
    def connect_instrument_sync(self):
        """Instantiates and connects to the instrument using the selected class."""
        try:
            instance = self.instrument_class(model=self.instrument_model, gpib=self.gpib_address)
            print(f"StatusConsumer: Successfully connected using class {self.instrument_class.__name__}")
            return instance
        except Exception as e:
            print(f"StatusConsumer: Error instantiating/connecting to {self.gpib_address}: {e}")
            return None

    @sync_to_async(thread_sensitive=True)
    def close_instrument_sync(self):
        """Closes the instrument resource."""
        if self.instrument_instance and hasattr(self.instrument_instance.resource, 'close'):
            self.instrument_instance.resource.close()
            print(f"StatusConsumer: Closed resource for {self.gpib_address}")

    @sync_to_async(thread_sensitive=True)
    def get_status_sync(self):
        """Calls the get_instrument_status method on the connected instance."""
        if not self.instrument_instance:
            return {'status_report': 'error', 'error_message': 'Instrument not connected.'}
        
        try:
            raw_status = self.instrument_instance.get_instrument_status()
            print(f"StatusConsumer: Fetched status for {self.instrument_model}: {raw_status}")
            return {'status_report': 'ok', 'raw_isr': raw_status}
        except Exception as e:
            print(f"StatusConsumer: Error fetching status: {e}")
            return {'status_report': 'error', 'error_message': str(e)}
        
class CalibrationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.session_group_name = f'session_{self.session_id}'

        await self.channel_layer.group_add(
            self.session_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.session_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')

        if command == 'start_collection':
            await self.collect_and_send_readings(data)

    @sync_to_async(thread_sensitive=True)
    def _take_one_reading(self, instrument):
        """Synchronous wrapper for a single instrument read."""
        return instrument.read_instrument()

    async def collect_and_send_readings(self, data):
        reading_type = data.get('reading_type')
        num_samples = data.get('num_samples')
        test_point = data.get('test_point')
        instrument_address = 'GPIB0::22::INSTR' # As requested

        try:
            # We must instantiate the instrument inside this async context using a sync_to_async wrapper
            instrument = await sync_to_async(Instrument34420A, thread_sensitive=True)(channel=instrument_address)
        except Exception as e:
            await self.send(text_data=json.dumps({'type': 'error', 'message': f"Failed to connect to instrument: {e}"}))
            return

        all_readings = []
        for i in range(num_samples):
            try:
                # Take one reading
                reading = await self._take_one_reading(instrument)
                all_readings.append(reading)
                # Send this single reading to the frontend immediately
                await self.send(text_data=json.dumps({
                    'type': 'reading_update',
                    'reading': reading,
                    'count': i + 1,
                    'total': num_samples
                }))
                await asyncio.sleep(0.05) # Small delay to allow UI to update smoothly
            except Exception as e:
                await self.send(text_data=json.dumps({'type': 'error', 'message': f"Error during reading {i+1}: {e}"}))
                return

        # After the loop, save the full list to the database
        await self.save_readings_to_db(reading_type, all_readings, test_point)

        # Send a final confirmation message
        await self.send(text_data=json.dumps({'type': 'collection_finished', 'message': 'All readings complete.'}))

    @database_sync_to_async
    def save_readings_to_db(self, reading_type, readings_list, test_point):
        """Saves the collected readings to the database."""
        current = test_point.get('current')
        frequency = test_point.get('frequency')

        try:
            session = CalibrationSession.objects.get(pk=self.session_id)
            test_point_set, _ = TestPointSet.objects.get_or_create(session=session)

            test_point, _ = TestPoint.objects.get_or_create(
                test_point_set=test_point_set,
                current=current,
                frequency=frequency
            )

            readings, _ = CalibrationReadings.objects.get_or_create(test_point=test_point)

            field_name = f"{reading_type}_readings"
            if hasattr(readings, field_name):
                setattr(readings, field_name, readings_list)
                readings.save()
        except CalibrationSession.DoesNotExist:
            print(f"Error: Session with id {self.session_id} not found.")

            # calibration, _ = Calibration.objects.get_or_create(session=session)
            # readings, _ = CalibrationReadings.objects.get_or_create(calibration=calibration)


            
        #     field_name = f"{reading_type}_readings"
        #     if hasattr(readings, field_name):
        #         setattr(readings, field_name, readings_list)
        #         readings.save()
        # except CalibrationSession.DoesNotExist:
        #     print(f"Error: Session with id {self.session_id} not found.")
