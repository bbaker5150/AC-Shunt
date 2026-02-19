"""Fluke 53132A Frequency Counter class file

Contains functions specific to the 53132A such as triggering a measurement, 
setting digital filters, and taking measurements

"""

import time
from .fluke_instrument import FlukeInstrument

class Instrument53132A(FlukeInstrument):
    """53132A Instrument class
    
    Attributes:
        model : str
            The model number of the instrument. Defaults to "53132A"
        gpib : str
            The GPIB address for the instrument
        timeout : float
            Time in milliseconds before commands timeout
        resource : pyvisa.resources.Resource
            PyVisa Resource that connects to the instrument
    """
    def __init__(self, gpib: str, timeout: float=60000):
        super().__init__(model="53132A", gpib=gpib, timeout=timeout)

        
    def reset(self):
        """Reset the device to default state and clear errors."""
        self.resource.write("*RST")
        time.sleep(10)
        self.resource.write("*CLS")
        self.resource.write("*SRE 0")
        self.resource.write("*ESE 0")
        self.resource.write(":STAT:PRES")

    def setup(self, gate_time=0.02):
        """
         Configure the frequency counter for frequency measurement.

        Args:
            gate_time (float): Measurement gate time in seconds.
        
        """
        self.resource.write(":FUNC 'FREQ 1'")
        self.resource.write(":INPut1:FILTer:LPASs:STATe 1")
        self.resource.write(":EVENT1:LEVEL 1.0")  
        self.resource.write(":FREQ:ARM:STAR:SOUR IMM")
        self.resource.write(":FREQ:ARM:STOP:SOUR TIM")
        self.resource.write(f":FREQ:ARM:STOP:TIM {gate_time}")
        self.resource.write(":INIT")

    def measure(self, num_meas=10, gate_time=0.002):
        """
        Perform frequency measurements and calculate average.
        
        Args:
            num_measurements (int): Number of measurements to perform.
            gate_time (float): Gate time for each measurement in seconds.

        Returns:
            avg_freq: Average frequency
            sdev_freq: Standard deviation
        """
        self.resource.write(":FUNC 'FREQ 1'")
        self.resource.write(":INPut1:FILTer:LPASs:STATe 1")
        self.resource.write(":EVENT1:LEVEL 1.0")
        self.resource.write(":FREQ:ARM:STAR:SOUR IMM")
        self.resource.write(":FREQ:ARM:STOP:SOUR TIM")
        self.resource.write(f":FREQ:ARM:STOP:TIM {gate_time}")
        self.resource.write(":CALC3:AVER:TYPE SDEV")
        self.resource.write(":CALC3:AVER ON")
        self.resource.write(f":CALC3:AVER:COUNT {num_meas}")
        self.resource.write(":TRIG:COUNT:AUTO ON")
        self.resource.write(":INIT")
    
        time.sleep(20)

        sdev_freq = self.resource.query(":CALC3:AVERAGE:TYPE SDEV;:CALC3:DATA?")
        avg_freq = self.resource.query(":CALC3:AVERAGE:TYPE MEAN;:CALC3:DATA?")
        sdev_freq = round(float(sdev_freq),8)
        avg_freq = round(float(avg_freq), 4)
        return avg_freq, float(sdev_freq)
    
    
    def validate(self, ll_freq=1000-0.25, ul_freq=1000+0.25, ul_sdev=0.25):
        """
        Validate frequency measurement against specified thresholds.

        Args:
            ll_freq (float): Lower frequency limit for validation.
            ul_freq (float): Upper frequency limit for validation.
            ul_sdev (float): Maximum allowed standard deviation.

        Returns:
            int: 1 if measurement passes validation, 0 otherwise.
        """
        avg_freq, sdev_freq = self.measure()

        if ll_freq <= avg_freq <= ul_freq and sdev_freq < ul_sdev:
            return 1  # Measurement is valid
        else:
            return 0 # Measurement is invalid

    def adjust(self, average_frequency):
        """
        Adjusts the calibration frequency for INPUT1.

        Args:
            self: Instance of the class
            average_frequency (float): The frequency value to set for calibration

        Returns:
            None
        """
        self.resource.write(f"*OPC;CAL_FREQ INPUT1,{average_frequency}")
