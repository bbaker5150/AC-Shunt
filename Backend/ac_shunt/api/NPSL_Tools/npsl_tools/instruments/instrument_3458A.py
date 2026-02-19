"""""""""""""""""""""""""""""""""""""""""""""""""""""

Agilent 3458A Digital Multimeter class file

Contains functions specific to the 3458A.

"""""""""""""""""""""""""""""""""""""""""""""""""""""

import pyvisa

from .instrument import Instrument
from enum import Enum


class Instrument3458A(Instrument):
    """3458A Instrument class
    
    Attributes:
        model : str
            The model number of the instrument
        gpib : str
            The GPIB address for the instrument
        timeout : float
            Time in milliseconds before commands timeout
        resource : pyvisa.resources.Resource
            PyVisa Resource that connects to the instrument
    """
    def __init__(self, model: str, gpib: str, timeout: float=60000):
        """Inits the Instrument object and connects to GPIB resource
        
        Raises:
            RuntimeError : An error occured when connecting to the GPIB address
        """
        try:
            super().__init__(model=model, gpib=gpib, timeout=timeout)
            self.resource.timeout = self.timeout
            # Initialize the instrument to a known state on creation
            self.init()
        except Exception as e:
            raise RuntimeError(f"Failed to connect to {model} at {gpib}: {e}")

    @property
    def identity(self) -> str:
        self.resource.read_termination = "\r\n"
        return self.resource.query('ID?')

    @property
    def serial_no(self) -> str:
        return ""
    
    def check_identity(self) -> bool:
        """Query the instrument's identity and check it matches

        Returns: 
            A bool that is `True` when the model matches the queryied identity, 
            `False` when it doesn't.

        Raises:
            RuntimeError : The model did not respond to the "*IDN?" query
        """
        try:
            super().check_identity()  # just sets timeout to 1 second
            self.resource.read_termination = "\r\n"
            return self.model in self.resource.query('ID?')
        
        except pyvisa.errors.VisaIOError as e:
            print(e)
            raise RuntimeError(f"{self} timed out when querying 'ID?'. Make sure the model and GPIB are correct")
    
    def take_measurement(self):
        """
        Takes a single measurement using the TRIG SGL command.
        This is more robust as it uses the currently active configuration
        without overriding it.
        """
        # The TRIG SGL command initiates a single measurement using the current
        # configuration, places the result in the output buffer, and then enters a HOLD state.
        self.resource.write("TRIG SGL")
        
        # After the trigger, the instrument completes the measurement and places the
        # reading in its output buffer. The subsequent read operation retrieves it.
        reading = self.resource.read()
        print(f"[DEBUG 3458A @ {self.gpib}] Reading returned: {reading.strip()}")
        return float(reading)

    def read_instrument(self):
        """Unified method to take a reading, consistent with other readers."""
        return self.take_measurement()

    # --- THIS IS THE CORRECTED METHOD NAME ---
    def configure_measurement(self, function: str, expected_value: float, frequency: float = None):
        """Configures the 3458A for a measurement with a specific range and resolution.

        Args:
            function (str): The measurement function, e.g., "DCV" or "ACV".
            expected_value (float): The expected voltage. Used to set the appropriate range.
            frequency (float, optional): The frequency for AC measurements. Defaults to None.
        """
        if function == 'DCV':
            # For best speed, disable autozero. This is recommended for stable environments.
            self.resource.write("AZERO OFF")
            # Set the DCV function, range, and a default high resolution in a single command.
            command = f"DCV {abs(expected_value)},0.001"
            self.resource.write(command)
            print(f"[DEBUG 3458A @ {self.gpib}] Configured with command: '{command}'")
        
        elif function == 'ACV':
            # SETACV ANA is the power-on default and a good general-purpose choice for signals up to 2MHz.
            self.resource.write("SETACV ANA")
            
            if frequency:
                # Set a bandwidth around the test frequency for better accuracy and speed.
                low_freq = frequency * 0.9
                high_freq = frequency * 1.1
                self.resource.write(f"ACBAND {low_freq},{high_freq}")
            
            # Set the ACV function and range.
            command = f"ACV {abs(expected_value)}"
            self.resource.write(command)
            print(f"[DEBUG 3458A @ {self.gpib}] Configured with command: '{command}'")

    def init(self):
        """Send initialize sequence command to 3458A."""
        self.resource.write("RESET")
        self.resource.write("END ALWAYS")
        self.resource.write("DCV AUTO")
        self.resource.write("NDIG 8")
        self.resource.write("NPLC 100")
        self.resource.write("NRDGS 1")
        self.resource.write("TARM AUTO")
        self.resource.write("TRIG AUTO")

    def zero_3458A(self):
        """Send zero sequence command to 3458A."""
        self.resource.write("RANGE 0")
        self.resource.timeout = 600000
        self.resource.write("CAL 0, 3458")

    def tenv_3458A(self, voltage: float):
        """Send tenv sequence command to 3458A."""
        if not (9 <= float(voltage) <= 10):
            voltage = 0

        self.resource.write("RANGE 0")
        self.resource.timeout = 600000
        self.resource.write(f"CAL {voltage}, 3458")