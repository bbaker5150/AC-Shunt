import json
import asyncio
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async

# Corrected import based on your file path:
from .NPSL_Tools.instruments import Instrument3458A, Instrument5730A, Instrument5790B, Instrument53132A

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
