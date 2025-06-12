import json
import asyncio
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async

# Corrected import based on your file path:
from .NPSL_Tools.instruments import Instrument3458A, Instrument5730A, Instrument5790B, Instrument53132A
from .models import DMMMeasurement, MeasurementSet # Import your Django model


# A mapping from the model name string (sent from frontend) to the Python class
INSTRUMENT_CLASS_MAP = {
    '5730A': Instrument5730A,
    '5790B': Instrument5790B,
    '3458A': Instrument3458A, 
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
            # self.instrument_class is set in connect()
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
            # Assumes all instrument classes have a 'get_instrument_status' method
            raw_status = self.instrument_instance.get_instrument_status()
            print(f"StatusConsumer: Fetched status for {self.instrument_model}: {raw_status}")
            return {'status_report': 'ok', 'raw_isr': raw_status}
        except Exception as e:
            print(f"StatusConsumer: Error fetching status: {e}")
            return {'status_report': 'error', 'error_message': str(e)}

class DMMConsumer(AsyncWebsocketConsumer):
    """
    Handles WebSocket connections for live DMM measurements.
    This consumer has not been changed and still uses a hardcoded GPIB address.
    """
    instrument = None
    measurement_task = None
    active_measurement_set_id = None

    target_num_readings = 0 
    current_reading_count = 0

    async def connect(self):
        await self.accept()
        print(f"DMMConsumer: WebSocket client connected: {self.channel_name}")
        self.gpib_address = self.scope['url_route']['kwargs']['gpib_address']

    async def disconnect(self, close_code):
        print(f"DMMConsumer: WebSocket disconnected. Client: {self.channel_name}. Code: {close_code}")
        await self._stop_measurements_internal(notify_client=False) 
        self.active_measurement_set_id = None 

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get('command')
        print(f"DMMConsumer: Received command: {command} from {self.channel_name} with data: {data}")

        if command == 'start_new_measurement_set':
            num_readings = data.get('num_readings', 0)
            user_provided_name = data.get('setName', None) 
            self.target_num_readings = int(num_readings) if num_readings else 0
            self.current_reading_count = 0
            await self._start_new_measurement_set_internal(user_set_name_prefix=user_provided_name)
        elif command == 'stop_measurements':
            print(f"DMMConsumer: Received stop_measurements command for active set {self.active_measurement_set_id}")
            await self._stop_measurements_internal(notify_client=True)

    @database_sync_to_async
    def _create_new_set_in_db(self, name_prefix="New DMM Set"):
        # ... (method implementation is unchanged)
        base_name = name_prefix if name_prefix and name_prefix.strip() else f"DMM Measurements - {time.strftime('%Y%m%d-%H%M%S')}"
        final_name = base_name
        counter = 0
        while MeasurementSet.objects.filter(name=final_name).exists():
            counter += 1
            final_name = f"{base_name} ({counter})"
        try:
            new_set = MeasurementSet.objects.create(name=final_name)
            print(f"DMMConsumer: Created new MeasurementSet: ID {new_set.id}, Name '{new_set.name}'")
            return new_set
        except Exception as e: 
            print(f"DMMConsumer: Error creating new MeasurementSet in DB with name '{final_name}': {e}")
            return None

    @sync_to_async(thread_sensitive=True)
    def _connect_instrument_sync(self):
        # ... (method implementation is unchanged)
        try:
            instr = Instrument3458A(gpib=self.gpib_address, timeout=10000)
            print(f"DMMConsumer: Successfully initialized/connected Instrument3458A: {self.gpib_address}")
            return instr
        except Exception as e:
            print(f"DMMConsumer: PyVISA/Instrument Error connecting to {self.gpib_address}: {e}")
            return None

    @sync_to_async(thread_sensitive=True)
    def _close_instrument_sync(self, instr_to_close):
        # ... (method implementation is unchanged)
        if instr_to_close is None:
            return
        try:
            if hasattr(instr_to_close, 'resource') and instr_to_close.resource:
                instr_to_close.resource.close()
            print(f"DMMConsumer: Successfully closed DMM resource: {self.gpib_address}")
        except Exception as e:
            print(f"DMMConsumer: PyVISA/Instrument Error closing resource {self.gpib_address}: {e}")

    async def _start_new_measurement_set_internal(self, user_set_name_prefix=None):
        # ... (method implementation is unchanged)
        if self.measurement_task:
            await self.send(text_data=json.dumps({'error': 'Already taking measurements for a set.', 'set_id': self.active_measurement_set_id}))
            return
        new_set = await self._create_new_set_in_db(name_prefix=user_set_name_prefix or "")
        if not new_set:
            await self.send(text_data=json.dumps({'error': 'Failed to create new measurement set in database.'}))
            return
        self.active_measurement_set_id = new_set.id
        self.active_set_name = new_set.name 
        self.instrument = await self._connect_instrument_sync()
        if not self.instrument:
            await self.send(text_data=json.dumps({'error': f'Failed to connect to instrument at {self.gpib_address}.', 'set_id': self.active_measurement_set_id}))
            self.active_measurement_set_id = None
            return
        await self.send(text_data=json.dumps({'status': 'measurements_started', 'set_id': self.active_measurement_set_id, 'set_name': self.active_set_name, 'target_readings': self.target_num_readings}))
        self.current_reading_count = 0
        self.measurement_task = asyncio.create_task(self._instrument_polling_loop())

    async def _stop_measurements_internal(self, notify_client=True):
        # ... (method implementation is unchanged)
        active_set_id_at_stop = self.active_measurement_set_id
        if self.measurement_task:
            self.measurement_task.cancel()
            try:
                await self.measurement_task
            except asyncio.CancelledError:
                pass
            self.measurement_task = None
        if self.instrument:
            await self._close_instrument_sync(self.instrument)
            self.instrument = None
        if notify_client and active_set_id_at_stop is not None:
            await self.send(text_data=json.dumps({'status': 'measurements_stopped', 'set_id': active_set_id_at_stop, 'readings_taken': self.current_reading_count }))
        self.active_measurement_set_id = None
        self.target_num_readings = 0
        self.current_reading_count = 0

    @database_sync_to_async
    def _save_reading_to_db(self, set_id, reading_value):
        # ... (method implementation is unchanged)
        try:
            measurement_set_instance = MeasurementSet.objects.get(id=set_id)
            DMMMeasurement.objects.create(measurement_set=measurement_set_instance, value=reading_value)
        except MeasurementSet.DoesNotExist:
            print(f"DMMConsumer: ERROR - MeasurementSet ID {set_id} does not exist.")
        except Exception as e:
            print(f"DMMConsumer: Error saving reading to DB for Set ID {set_id}: {e}")

    @sync_to_async(thread_sensitive=True)
    def _take_instrument_measurement_sync(self):
        # ... (method implementation is unchanged)
        if not self.instrument:
            return {"error_during_measurement": "Instrument not connected."}
        try:
            return self.instrument.take_measurement()
        except Exception as e:
            return {"error_during_measurement": str(e)}

    async def _instrument_polling_loop(self):
        # ... (method implementation is unchanged)
        loop_set_id = self.active_measurement_set_id
        loop_target_readings = self.target_num_readings
        loop_current_readings = 0 
        if not self.instrument or loop_set_id is None:
            return
        try:
            while True:
                if loop_target_readings > 0 and loop_current_readings >= loop_target_readings:
                    await self.send(text_data=json.dumps({'status': 'target_readings_reached', 'set_id': loop_set_id, 'readings_taken': loop_current_readings}))
                    await self._stop_measurements_internal(notify_client=False) 
                    break
                measurement_result = await self._take_instrument_measurement_sync()
                payload_value = None
                error_message = None
                if isinstance(measurement_result, dict) and 'error_during_measurement' in measurement_result:
                    error_message = measurement_result['error_during_measurement']
                else:
                    payload_value = measurement_result
                    loop_current_readings += 1 
                    self.current_reading_count = loop_current_readings 
                    await self._save_reading_to_db(loop_set_id, measurement_result)
                payload = {'timestamp': time.time(), 'set_id': loop_set_id, 'value': payload_value, 'error': error_message, 'current_count': loop_current_readings, 'target_count': loop_target_readings }
                await self.send(text_data=json.dumps(payload))
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            print(f"DMMConsumer: Polling loop explicitly cancelled for Set ID {loop_set_id}.")
        except Exception as e:
            print(f"DMMConsumer: Unhandled error in polling loop for Set ID {loop_set_id}: {e}")
        finally:
            print(f"DMMConsumer: Exiting polling loop for Set ID {loop_set_id}.")

class Status5730Consumer(AsyncWebsocketConsumer):
    """
    Handles WebSocket connections for getting the status of a Fluke 5730A.
    The GPIB address is specified in the WebSocket connection URL.
    """
    instrument_5730a = None
    # self.gpib_address will be set in the connect method.

    @sync_to_async(thread_sensitive=True)
    def _connect_5730a_sync_internal(self):
        """Synchronously connects to the Fluke 5730A instrument."""
        try:
            # This method now uses self.gpib_address, which is set dynamically in connect()
            instr = Instrument5730A(gpib=self.gpib_address, timeout=5000)
            print(f"Status5730Consumer: Successfully initialized/connected to Fluke 5730A: {self.gpib_address}")
            return instr
        except Exception as e:
            print(f"Status5730Consumer: PyVISA/Instrument Error connecting to {self.gpib_address}: {e}")
            return None

    async def connect(self):
        # Get the GPIB address from the URL kwargs provided by the routing
        # The URL pattern in routing.py should be like: re_path(r'^ws/status/(?P<gpib_address>.+)/$', ...)
        self.gpib_address = self.scope['url_route']['kwargs']['gpib_address']

        print(f"Status5730Consumer: Attempting WebSocket connection for status at '{self.gpib_address}'")
        
        self.instrument_5730a = await self._connect_5730a_sync_internal()

        if self.instrument_5730a:
            await self.accept()
            print(f"Status5730Consumer: WebSocket connected successfully for {self.gpib_address}. Client: {self.channel_name}")
            await self.send(text_data=json.dumps({
                'connection_status': 'instrument_connected',
                'instrument_type': 'Fluke5730A',
                'gpib_address': self.gpib_address,
                'message': 'Ready to provide status on request.'
            }))
        else:
            print(f"Status5730Consumer: Failed to connect to instrument at {self.gpib_address}. WebSocket connection will be closed.")
            # Explicitly close the connection if the instrument cannot be reached.
            # The client's 'onerror' and 'onclose' events will be triggered.
            await self.close(code=4004)

    @sync_to_async(thread_sensitive=True)
    def _close_5730a_sync_internal(self, instr_to_close):
        """Synchronously closes the Fluke 5730A instrument resource."""
        if not instr_to_close:
            return
        try:
            if hasattr(instr_to_close, 'resource') and instr_to_close.resource:
                instr_to_close.resource.close()
            print(f"Status5730Consumer: Successfully closed 5730A resource: {self.gpib_address}")
        except Exception as e:
            print(f"Status5730Consumer: PyVISA/Instrument Error closing 5730A resource {self.gpib_address}: {e}")

    async def disconnect(self, close_code):
        print(f"Status5730Consumer: WebSocket disconnected for {self.gpib_address}. Client: {self.channel_name}. Code: {close_code}")
        if self.instrument_5730a:
            await self._close_5730a_sync_internal(self.instrument_5730a)
            self.instrument_5730a = None

    @sync_to_async(thread_sensitive=True)
    def _get_5730a_status_sync(self):
        """Synchronously gets the status from the Fluke 5730A instrument."""
        if not self.instrument_5730a:
            return {"error": "5730A instrument not connected or connection failed."}
        try:
            status_register_value = self.instrument_5730a.get_instrument_status() 
            print(f"Status5730Consumer: Fetched status for {self.gpib_address}. ISR: {status_register_value}")
            return {"status": "success", "raw_isr": status_register_value}
        except Exception as e:
            print(f"Status5730Consumer: Error during 5730A status fetch for {self.gpib_address}: {e}")
            return {"status": "error", "error_message": str(e)}

    async def receive(self, text_data):
        """Handles messages received from the WebSocket client."""
        try:
            data = json.loads(text_data)
            command = data.get('command')
            print(f"Status5730Consumer: Received command: '{command}' from {self.channel_name}")

            if command == 'get_5730a_status':
                if not self.instrument_5730a:
                    await self.send(text_data=json.dumps({
                        'instrument_type': 'Fluke5730A',
                        'gpib_address': self.gpib_address,
                        'timestamp': time.time(),
                        'status_report': 'error_fetching',
                        'error_message': 'Instrument not connected on server. Please try reconnecting.',
                    }))
                    return

                status_result = await self._get_5730a_status_sync()
                
                payload = {
                    'instrument_type': 'Fluke5730A',
                    'gpib_address': self.gpib_address,
                    'timestamp': time.time(),
                }
                if status_result.get("status") == "success":
                    payload['status_report'] = 'ok'
                    payload['raw_isr'] = status_result.get('raw_isr')
                else:
                    payload['status_report'] = 'error_fetching'
                    payload['error_message'] = status_result.get('error_message', 'Unknown error fetching status.')
                
                await self.send(text_data=json.dumps(payload))
            
            # This 'check_connection' command is less necessary now, but can be kept for debugging
            elif command == 'check_connection':
                is_connected = self.instrument_5730a is not None
                await self.send(text_data=json.dumps({
                    'connection_status': 'instrument_still_connected' if is_connected else 'instrument_not_connected',
                    'instrument_type': 'Fluke5730A',
                    'gpib_address': self.gpib_address,
                    'message': f'Instrument connection is {"active" if is_connected else "not active"} on the server.'
                }))
            else:
                await self.send(text_data=json.dumps({
                    'error': 'Unknown command',
                    'received_command': command
                }))
        except json.JSONDecodeError:
            print(f"Status5730Consumer: Received invalid JSON from {self.channel_name}")
            await self.send(text_data=json.dumps({'error': 'Invalid JSON format'}))
        except Exception as e:
            print(f"Status5730Consumer: Error processing received message: {e}")
            await self.send(text_data=json.dumps({'error': f'Server error processing message: {str(e)}'}))