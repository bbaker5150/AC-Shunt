"""Fluke Instrument class file

Instrument class that communicates with an instrument using the PyVISA 
library using commands that are shared among Fluke instruments. 

Supports the following model numbers:
    - 5790B
    - 5730A
"""

import time
import pyvisa
import re

from .instrument import Instrument

class FlukeInstrument(Instrument):
    """Fluke Instrument class
    
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
    def __init__(self, model: str, gpib: str, timeout: float=60000) -> None:
        """Inits the Instrument object and connects to GPIB resource
        
        Raises:
            RuntimeError : An error occured when connecting to the GPIB address
            RuntimeError : The model does not match the instrument's identity
        """
        try:
            super().__init__(model=model, gpib=gpib, timeout=timeout)
            is_match, idn_response = self.check_identity()
            if is_match:
                self.resource.timeout = self.timeout
            else:
                # Include the mismatched identity in the error for easier debugging
                raise RuntimeError(f"Model number '{self.model}' does not match identity '{idn_response}' obtained from {self.gpib}")

        except RuntimeError as e:
            raise e

    @property
    def identity(self) -> str:
        return self.resource.query('*IDN?').strip()

    @property
    def serial_no(self) -> str:
        identity_list = self.identity.split(',')
        return identity_list[2]


    def check_identity(self) -> tuple[bool, str]:
        """
        Query the instrument's identity and check if it matches the model.

        Returns: 
            A tuple containing (match_bool, identity_string).
            match_bool: `True` if the model matches, `False` otherwise.
            identity_string: The raw identity string from the instrument.
        """
        try:
            self.resource.timeout = 2000
            self.resource.read_termination = "\n"
            idn_string = self.resource.query('*IDN?').strip()
            
            model_number_match = re.search(r'\d{4}', self.model)
            
            if not model_number_match:
                is_match = self.model.lower() in idn_string.lower()
                return is_match, idn_string

            model_number = model_number_match.group(0)
            is_match = model_number in idn_string
            return is_match, idn_string

        except pyvisa.errors.VisaIOError:
            raise RuntimeError(f"{self} timed out when querying '*IDN?'. Make sure the model and GPIB are correct")
        finally:
            self.resource.timeout = self.timeout
    

    def cal_zero(self, verbose: bool=False) -> None:
        """Send CAL_ZERO command to instrument
        
        Args:
            verbose : bool, optional
                If `True`, prints all of the commands written to instrument. 
                Defaults to `False`.
        
        Returns:
            None
        """
        self.resource.write('CAL_ZERO')
        if verbose:
            print(f"Write [CAL_ZERO] to {self}")
        
        
    def wait_operation_complete(self, timeout: float = 300000, verbose: bool = False) -> float:
        """Pauses program until operation completes on the instrument

        Args:
            timeout : float, optional
                The time in milliseconds to wait for the operation completes
                before the program times out. Defaults to 5 minutes.
            verbose : bool, optional
                If `True`, prints all of the commands written to instrument. 
                Defaults to `False`.

        Returns:
            A float equal to the amount of time in seconds that the 
            operation took to complete.
        """
        start = time.time()
        # Increase timeout to wait for operation complete
        self.resource.timeout = timeout
        self.resource.query("*OPC?")
        runtime = time.time() - start
        if verbose: 
            print(f"{self} took {runtime} seconds to complete operation")
        self.resource.timeout = self.timeout
        return runtime