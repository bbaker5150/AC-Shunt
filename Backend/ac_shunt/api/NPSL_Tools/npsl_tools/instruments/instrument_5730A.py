"""Fluke 5730A Calibrator class file

Contains functions specific to the 5730A such as setting output voltage
and switching between operate and standby.

"""
from .fluke_instrument import FlukeInstrument

class Instrument5730A(FlukeInstrument):
    """5730A Instrument class
    
    Attributes:
        model : str
            The model number of the instrument. Defaults to "5730A"
        gpib : str
            The GPIB address for the instrument
        timeout : float
            Time in milliseconds before commands timeout
        resource : pyvisa.resources.Resource
            PyVisa Resource that connects to the instrument
    """
    def __init__(self, model: str, gpib: str, timeout: float=60000):
        super().__init__(model=model, gpib=gpib, timeout=timeout)
        self.reset()

    def set_output(self, voltage: float, frequency: float) -> None:
        """Set the output voltage for the 5730A.
        
        Args:
            voltage : float
                The output voltage to set
            frequency : float
                The output voltage to set
        """
        self.resource.write(f"OUT {voltage},{frequency}")

    def set_operate(self):
        """Sets 5730A to Operate"""
        self.resource.write('OPER;*WAI')
    
    def set_extsense(self, enabled: bool):
        self.resource.write(f"EXTSENSE {'ON' if enabled else 'OFF'};*CLS")

    def set_extguard(self, enabled: bool):
        self.resource.write(f"EXTGUARD {'ON' if enabled else 'OFF'};*CLS")

    def set_standby(self):
        """Sets 5730A to Standby"""
        self.resource.write('STBY')
        
    def reset(self):
        """Sets 5730A to Standby"""
        self.resource.write('*RST')
        
    def safe_standby(self) -> None:
        """Sets the calibrator output to 0V at 0Hz and then places it in Standby mode.
        
        This is a convenient method for safely shutting down the output.
        """
        self.set_output(voltage=0, frequency=0)
        self.resource.timeout = 1000
        self.set_standby()

    def set_operate_standby(self, operate: bool):
        """Set the 5730A to either operate or standby, based on argument passed.
        
        Args:
            operate : bool
                If `True`, sets the instrument to Operate. `False` for Standby.
        
        Returns:
            None
        """
        if operate:
            self.resource.write('OPER;*WAI')
        else:
            self.resource.write('STBY;*WAI')
            
    def enter_wb_cal(self):
        """Set the 5730A to the wideband calibration setting"""
        self.resource.write("WBAND ON")

    def run_zero_cal(self):
        """Performs internal zeros calibration (CAL_ZERO) without locking the VISA bus."""
        print(f"[Instrument5730A] Sending 'CAL_ZERO;*OPC?' to {self.resource}...")
        
        try:
            # 1. Use write() instead of query(). 
            # This sends the command and releases the VISA bus immediately.
            self.resource.write('CAL_ZERO;*OPC?')
            
            # 2. Poll the Status Byte Register (STB) to see when it's done.
            while True:
                # read_stb() performs a GPIB Serial Poll. It is nearly instantaneous 
                # and doesn't lock the bus waiting for an output buffer response.
                stb = self.resource.read_stb()
                
                # Bit 4 (value 16) is the Message Available (MAV) bit.
                # When *OPC? completes, it places a '1' in the output buffer, setting MAV high.
                if stb & 16:
                    break
                    
                # Sleep the background thread for 5 seconds.
                # This releases the Python GIL and allows the other 5730A thread to use the bus.
                time.sleep(5)
                
            # 3. Read the '1' from the buffer to clear it out.
            self.resource.read()
            
            print(f"[Instrument5730A] Zero Cal returned successfully.")
            return True
            
        except Exception as e:
             print(f"[Instrument5730A] VISA Error during CAL_ZERO: {e}")
             return False

    def get_instrument_status(self):
        """Get the Instrument Status Register (ISR) value of the 5730A.
        
        Returns:
            A string representing the ISR value as a 16-bit binary number.
            
            The bit values are defined as follows:
                
                15 : Always `0`
                14 : AC XFER, `1` when AC/DC transfer is active
                13 : ZERO CAL, `1` when DC Zero Cal is necessary
                12 : SETTLED, `1` when the output has stabilized
                11 : REMOTE, `1` when under remote control
                10 : WBND, `1` when wideband is active
                 9 : SCALE, `1` when scaling is active
                 8 : OFFSET, `1` when an offset is active
                 7 : PLOCK, `1` when calibrator output is phase locked to external source
                 6 : PSHIFT, `1` when variable phase output is active
                 5 : RLOCK, `1` when the calibrator output range is locked
                 4 : RCOMP, `1` when two-wired compensation is active when in resistance mode
                 3 : BOOST, `1` an auxiliary amplifier is active
                 2 : EXTSENS, `1` when external sensing is selected
                 1 : EXGARD, `1` when external voltage guard is selected
                 0 : OPER, `1` when operating. `0` when in standby
        """
        isr = bin(int(self.resource.query('ISR?'))).replace('0b', '')
        return isr.zfill(16)