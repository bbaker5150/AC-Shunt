import pyvisa

from .instrument import Instrument
from .utils import BoolSetting, FilterType, DigitalFilterResponse, TriggerSource

class Instrument34420A():
    def __init__(self, gpib: str, timeout: int = 5000):
        self.rm = pyvisa.ResourceManager()
        self.device = self.rm.open_resource(gpib)
        self.timeout = timeout
        self.device.read_termination = '\n'

        # Initialize instrument to a known state
        self.reset()
        self.clear()

        # self.device.write('CONF:VOLT:DC DEF')
        # self.device.write('SENS:VOLT:DC:NPLC 20')

        self.max_range = float(self.device.query('SENS:VOLT:DC:RANG? MAX'))
        # print(f"Max Range: {self.max_range}")
        self.min_range = float(self.device.query('SENS:VOLT:DC:RANG? MIN'))
        # print(f"Min Range: {self.min_range}")
        self.max_integration = float(self.device.query('SENS:VOLT:DC:NPLC? MAX'))
        # print(f"Max Integration (NPLC): {self.max_integration}")
        self.min_integration = float(self.device.query('SENS:VOLT:DC:NPLC? MIN'))
        # print(f"Min Integration (NPLC): {self.min_integration}")
        # self.check_instrument_errors("Initialization")

    def get_identity(self):
        return self.device.query('*IDN?')

    def reset(self):
        self.device.write('*RST')

    def clear(self):
        self.device.write('*CLS')

    def measure_dc_volt(self):
        return float(self.device.query('MEAS:VOLT:DC?'))

    def set_filter_state(self, setting: BoolSetting):
        self.device.write(f'INP:FILT:STAT {setting}')
    def get_filter_state(self):
        return bool(int(self.device.query('INP:FILT:STAT?')))

    def set_filter_type(self, setting: FilterType):
        self.device.write(f'INP:FILT:TYPE {setting}')
    def get_filter_type(self):
        return self.device.query('INP:FILT:TYPE?')

    def set_filter_response(self, setting: DigitalFilterResponse):
        self.device.write(f'INP:FILT:DIG:RESP {setting}')
    def get_filter_response(self):
        return self.device.query('INP:FILT:DIG:RESP?')


    def set_autorange(self, setting: BoolSetting):
        self.device.write(f'SENS:VOLT:DC:RANG:AUTO {setting}')
    def get_autorange(self):
        return bool(int(self.device.query('SENS:VOLT:DC:RANG:AUTO?')))
    
    def set_manual_range(self, setting: float):
        if setting > self.max_range or setting < self.min_range:
            raise ValueError(f'Invalid Range Setting {setting}')

        self.device.write(f'SENS:VOLT:DC:RANG {setting}')
    def get_manual_range(self):
        return float(self.device.query('SENS:VOLT:DC:RANG?'))

        
    def set_integration(self, setting: float):
        if setting > self.max_integration or setting < self.min_integration:
            raise ValueError(f'Invalid Integration Setting {setting}')

        self.device.write(f'SENS:VOLT:DC:NPLC {setting}')
        current_nplc = self.device.query('SENS:VOLT:DC:NPLC?')
        # print(f"Current NPLC is set to: {float(current_nplc)}")

    def get_integration(self):
        return float(self.device.query('SENS:VOLT:DC:NPLC?'))
    
    def set_configuration(self, range_setting: float, resolution: float):
        if range_setting > self.max_range or range_setting < self.min_range:
            raise ValueError(f'Invalid Range Setting {range_setting}')
        
        max_res = range_setting * 1E-4
        min_res = range_setting * 1E-7

        if resolution > max_res or resolution < min_res:
            raise ValueError(f'Invalid Resolution Setting {resolution}')
        
        if resolution == max_res:
            self.device.write(f'CONF:VOLT:DC {range_setting}, MAX')
        elif resolution == min_res:
            self.device.write(f'CONF:VOLT:DC {range_setting}, MIN')
        else:
            self.device.write(f'CONF:VOLT:DC {range_setting}, {resolution}')

    def set_trigger_delay(self, setting: float):
        pass

    def set_trigger_count(self, setting: int):
        max_triggers = int(float(self.device.query('TRIGGER:COUNT? MAX')))
        min_triggers = int(float(self.device.query('TRIGGER:COUNT? MIN')))
        if setting > max_triggers or setting < min_triggers:
            raise ValueError(f'Invalid trigger count {setting}')

        self.device.write(f'TRIGGER:COUNT {setting}')

    def set_sample_count(self, setting: int):
        max_samples = int(float(self.device.query('SAMPLE:COUNT? MAX')))
        min_samples = int(float(self.device.query('SAMPLE:COUNT? MIN')))
        if setting > max_samples or setting < min_samples:
            raise ValueError(f'Invalid sample count {setting}')

        self.device.write(f'SAMPLE:COUNT {setting}')

    def set_trigger_source(self, setting: TriggerSource):
        self.device.write(f'TRIGGER:SOURCE {setting}')
    
    def read_instrument(self):
        data = self.device.query('READ?')
        data = data.split(',')

        if len(data) == 1:
            return float(data[0])
        else:
            for i in range(len(data)):
                data[i] = float(data[i])
            
            
            return data

    def init_instrument(self):
        self.device.write('INIT')

    def fetch_instrument(self):
        data = self.device.query('FETCH?')
        data = data.split(',')
        for i in range(len(data)):
            data[i] = float(data[i])
        
        if len(data) == 1:
            return data[0]
        else:
            for i in range(len(data)):
                data[i] = float(data[i])
            
            
            return data
        
    def check_instrument_errors(self, operation_name: str):
        print(f"--- Checking for errors after: {operation_name} ---")
        while True:
            # Query the error queue
            error_string = self.device.query('SYST:ERR?')
            
            # The response is a string like "-113,\"Undefined header\""
            error_code = int(error_string.split(',')[0])

            if error_code == 0:
                # No more errors
                print("--- No errors found. ---")
                break
            else:
                # Print the error and continue checking
                print(f"Instrument Error: {error_string.strip()}")

    def close(self):
        """Closes the VISA resource connection."""
        if self.device:
            self.device.close()