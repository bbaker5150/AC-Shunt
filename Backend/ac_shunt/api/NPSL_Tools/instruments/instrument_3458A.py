"""""""""""""""""""""""""""""""""""""""""""""""""""""

Agilent 3458A Digital Multimeter class file

Contains functions specific to the 3458A.

"""""""""""""""""""""""""""""""""""""""""""""""""""""

import pyvisa

from .instrument import Instrument
from enum import Enum


class Range_5790B(Enum):
    V2mV = 1
    V7mV = 2
    V22mV = 3
    V70mV = 4
    V220mV = 5
    V2V = 6
    V7V = 7
    V22V = 8
    V70V = 9
    V220V = 10
    V700V = 11
    V1000V = 12


def Threshold_792A3458A():
    x = 0.9
    if Range_5790B == 12:
        Threshold_792A = 1.79 * x
    elif Range_5790B == 11:
        Threshold_792A = 1.08 * x
    elif Range_5790B == 10:
        Threshold_792A = 1.80 * x
    elif Range_5790B == 9:
        Threshold_792A = 1.80 * x  
    elif Range_5790B == 8:
        Threshold_792A = 1.80 * x
    elif Range_5790B == 7:
        Threshold_792A = 1.78 * x
    elif Range_5790B == 6:
        Threshold_792A = 1.70 * x
    elif Range_5790B == 5:
        Threshold_792A = 1.69 * x
    elif Range_5790B == 4:
        Threshold_792A = 1.79 * x
    elif Range_5790B == 3:
        Threshold_792A = 1.80 * x
    elif Range_5790B == 2:
        Threshold_792A = 0.54 * x
    elif Range_5790B == 1:
        Threshold_792A = 0.18 * x


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
    def __init__(self, gpib: str, timeout: float=60000):
        """Inits the Instrument object and connects to GPIB resource
        
        Raises:
            RuntimeError : An error occured when connecting to the GPIB address
            RuntimeError : The model did not respond to the "*IDN?" query
        """
        try:
            super().__init__(model="3458A", gpib=gpib, timeout=timeout)
            if self.check_identity():
                self.resource.timeout = self.timeout
            else:
                raise RuntimeError(f"Model number {self.model} does not match identity obtained from {self.gpib}")

        except RuntimeError as e:
            raise e

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
        return float(self.resource.query('TRIG SGL').strip())


    def AC_5790B_AllSettings(self):
        """3458A setting attributes for the entire 5790B Cal.
        """

        self.resource.write('END ALWAYS; DCV AUTO; NDIG 8; NDIG 9; NRDGS 1; TARM AUTO')


    def AC_792A_3458A_RangeSettings(self, mode: Range_5790B):
        """3458A settings depending on range and cal point of 5790B.
        """

        if Range_5790B > 0.006:
            message = 'Range 10'
        else:
            message = 'Range 1'
        self.resource.write(message)
    
    def init(self):
        """Send initialize sequence command to 3458A

        Returns: 
            None

        """
        self.resource.write("RESET")
        self.resource.write("END ALWAYS")
        self.resource.write("DCV AUTO")
        self.resource.write("NDIG 8")
        self.resource.write("NDIG 9")
        self.resource.write("NPLC 100")
        self.resource.write("NRDGS 1")
        self.resource.write("TARM AUTO")
        self.resource.write("TRIG AUTO")

    def zero_3458A(self):
        """Send zero sequence command to 3458A

        Returns: 
            None

        """
        self.resource.write("RANGE 0")
        self.resource.timeout = 600000
        self.resource.write("CAL 0, 3458")

    def tenv_3458A(self, voltage: float):
        """Send zero sequence command to 3458A

        Returns: 
            None

        """

        if not (9 <= float(voltage) <= 10):
            voltage = 0

        self.resource.write("RANGE 0")
        self.resource.timeout = 600000
        self.resource.write(f"CAL {voltage}, 3458")





    

