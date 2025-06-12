"""Fluke 5790B AC Measurement Standard class file

Contains functions specific to the 5790B such as triggering a measurement, 
setting digital filters, and taking measurements

"""
from .fluke_instrument import FlukeInstrument
from .utils import BoolSetting
from enum import Enum

class DFILT_5790B_MODE(int, Enum):
    OFF = 1
    SLOW = 2
    MEDIUM = 3
    FAST = 4

class DFILT_5790B_RESTART(int, Enum):
    FINE = 1
    COARSE = 2
    MEDIUM = 3

class MEASUREMENT_STATUS_5790B(int, Enum):
    VALID = 0
    FREQ_UNDER = 1
    FREQ_OVER = 2
    SETTLED_NOT_FULL = 3
    UNSETTLED = 4
    UNDER_RANGE = 5
    OVER_RANGE = 6
    INVALID = 7

class TEST_POINT_TYPE_5790B(int, Enum):
    DC = 0
    SERVICE = 1
    AC = 2
    LIN = 3
    GAIN = 4
    FLAT = 5

class Instrument5790B(FlukeInstrument):
    """5790B Instrument class
    
    Attributes:
        model : str
            The model number of the instrument. Defaults to "5790B"
        gpib : str
            The GPIB address for the instrument
        timeout : float
            Time in milliseconds before commands timeout
        resource : pyvisa.resources.Resource
            PyVisa Resource that connects to the instrument
    """
    def __init__(self, model: str, gpib: str, timeout: float=60000):
        super().__init__(model=model, gpib=gpib, timeout=timeout)


    def _parse_cal_steps(self, query: str, test_points: list = []):
        """Parse the 5790B output when querying the cal steps.
        
        Args:
            query : str
                A valid calibration step query for the 5730At
            test_points : list, optional
                A list to store the test points in. Can already contain
                information in it. The new test points will be appened
                to the end. Defaults to an empty list.
        
        Returns:
            A list of calibration steps with the newly parsed test points 
            appended to the end. Test points are stored as a dictionary 
            with the following key/value structure:
                
                test_point = {
                    "range": instrument range,
                    "nominal": nominal voltage,
                    "frequency": frequency,
                    "function": "Test point type (AC, DC, or WB)
                }
        
        Raises:
            RuntimeError: A non-valid query is input
        """
        cal_types = {
            "cal_dc? input1": TEST_POINT_TYPE_5790B.DC,
            "cal_i2?": TEST_POINT_TYPE_5790B.SERVICE,
            "cal_ac? input1": TEST_POINT_TYPE_5790B.AC,
            "cal_wblin?": TEST_POINT_TYPE_5790B.LIN,
            "cal_dc? wbnd": TEST_POINT_TYPE_5790B.GAIN,
            "cal_ac? wbnd": TEST_POINT_TYPE_5790B.FLAT,
        }
        if query not in cal_types.keys():
            raise RuntimeError(f"Invalid cal step query: {query}")
            
        self.resource.read_termination = ""
        output = self.resource.query(query)
        if query == "cal_dc? wbnd" or query == "cal_ac? wbnd":
            output = output[2::].strip().split("\n")
        else:
            output = output[3::].strip().split("\n")
        self.resource.read_termination = "\n"

        itr = 0
        while itr < len(output):
            test_range_list = output[itr].split(',')
            test_range = float(test_range_list[0])
            num_points = int(test_range_list[1])

            for j in range(itr + 1, itr + num_points + 1):
                test_point_list = output[j].split(',')
                voltage = float(test_point_list[0])
                frequency = float(test_point_list[1])

                # Get specs
                if cal_types[query] == TEST_POINT_TYPE_5790B.GAIN or cal_types[query] == TEST_POINT_TYPE_5790B.FLAT or cal_types[query] == TEST_POINT_TYPE_5790B.LIN:
                    spec = float(self.resource.query(f'cal_spec? wbnd,{voltage},{frequency}'))
                elif cal_types[query] == TEST_POINT_TYPE_5790B.AC:
                    spec = float(self.resource.query(f'cal_spec? input1,{voltage},{frequency}'))
                elif cal_types[query] == TEST_POINT_TYPE_5790B.DC:
                    if abs(voltage) <= 0.07:
                        spec = float(self.resource.query(f'cal_spec? input1,{abs(voltage)},1000'))
                    else:
                        spec = float(self.resource.query(f'cal_spec? input1,{voltage},{frequency}'))
                elif cal_types[query] == TEST_POINT_TYPE_5790B.SERVICE:
                    spec = float(self.resource.query(f"cal_spec? input1,{voltage},{frequency}"))
                # Get settings

                point = {
                    'range': test_range,
                    'nominal': voltage,
                    'frequency': frequency,
                    'function': cal_types[query],
                    'spec': spec,
                }
                test_points.append(point)
            itr += num_points + 1
        
    def get_cal_steps(self, dc: bool=True, ac_serv: bool=False, ac: bool=True, lin: bool=False, gain: bool=True, flat: bool=True):
        """Query cal steps from 5790B

        By default, gets all test point types
        
        Args:
            dc : bool, optional
                Get DC calibration test points. Default to `True`
            service : bool, optional
                Get additional test points for service calibration. Default to `False`
            ac : bool, optional
                Get AC calibration test points. Default to `True`
            gain : bool, optional
                Get WB gain calibration test points. Default to `True`
            flat : bool, optional
                Get WB flatness calibration test points. Default to `True`
        
        Returns:
            A list of calibration steps stored as a dictionary with the
            following key/value structure:
                
                test_point = {
                    "range": instrument range,
                    "nominal": nominal voltage,
                    "frequency": frequency,
                    "function": "Test point type (AC, DC, or WB)
                }
        """
        test_points = []
        if dc:
            self._parse_cal_steps("cal_dc? input1", test_points)
        if ac_serv:
            self._parse_cal_steps("cal_i2?", test_points)
            freq_cal_point = {
                'range': 2.2,
                'nominal': 2.0,
                'frequency': 1000,
                'function': TEST_POINT_TYPE_5790B.SERVICE,
                'spec': 100.2,
                }
            test_points.append(freq_cal_point)
        if ac:
            self._parse_cal_steps("cal_ac? input1", test_points)
        if lin:
            self._parse_cal_steps("cal_wblin?", test_points)
        if gain:
            self._parse_cal_steps("cal_dc? wbnd", test_points)
        if flat:
            self._parse_cal_steps("cal_ac? wbnd", test_points)

        return test_points

    def set_filters(self, mode: DFILT_5790B_MODE, restart: DFILT_5790B_RESTART, verbose=False):
        message = f"DFILT {mode.name},{restart.name}"
        self.resource.write(message)
        if verbose:
            print(message)
    
    def get_filters(self) -> str:
        return self.resource.query("DFILT?")
    
    def set_hires(self, mode: bool):
        self.resource.write(f"HIRES {int(mode)}")

    def get_hires(self):
        return bool(int(self.resouce.query("HIRES?")))
    
    def set_extguard(self, enabled: bool):
        self.resource.write(f"EXTGUARD {'ON' if enabled else 'OFF'};*CLS")

    def send_VAL(self):
        """Query the "VAL?" command to the 5790B

        Take the most recently completed measurement from 5790B

        Returns:
            A tuple containing (voltage, frequency, status) as described:
                voltage : float
                    Voltage value measured
                frequency : float
                    Frequency value measured
                status : int
                    Describes the measurement with a code ranging from 0 to 7
                        0 : Measurement conditions valid
                        1 : Frequency underrange 
                        2 : Frequency overrange 
                        3 : Measurement settled, but digital filter not full 
                        4 : Measurement is unsettled 
                        5 : Value is underrange ("Under Range" on display)
                        6 : Value is overrange ("Over Range" on display)
                        7 : Value is invalid ("-------" on display)
        """
        output = self.resource.query("VAL?").strip()
        output = output.split(',')
        return float(output[0]), float(output[1]), MEASUREMENT_STATUS_5790B(int(output[2]))

    def send_MEAS(self):
        """Query the "MEAS?" command to the 5790B

        Equivalent to sending "TRIG;*WAI;VAL?" to 5790B.
        Triggers a new measurement and waits for it to complete.

        Returns:
            A tuple containing (voltage, frequency, status) as described:
                voltage : float
                    Voltage value measured
                frequency : float
                    Frequency value measured
                status : int
                    Describes the measurement with a code ranging from 0 to 7
                        0 : Measurement conditions valid
                        1 : Frequency underrange 
                        2 : Frequency overrange 
                        3 : Measurement settled, but digital filter not full 
                        4 : Measurement is unsettled 
                        5 : Value is underrange ("Under Range" on display)
                        6 : Value is overrange ("Over Range" on display)
                        7 : Value is invalid ("-------" on display)
        """
        output = self.resource.query("MEAS?").strip()
        output = output.split(',')
        return float(output[0]), float(output[1]), MEASUREMENT_STATUS_5790B(int(output[2]))
    
    def set_auto_range(self):
        """Set the 5790B to auto range"""
        self.resource.write("RANGE AUTO")

    def set_range(self, value: float):
        """Set the 5790B range by writing RANGE {value} to instrument.

        Args:
            value : float
                Value to be measured or range to be set in Volts
        """
        self.resource.write(f"RANGE {value}")
    
    def get_range(self):
        """Returns the present measurement range parameters
        
        Returns:
            A tuple containing (max, min, resolution, auto_on) as described:
                max : float
                    The nominal maximum value for the range.
                min : float
                    The minimum value measurable by range.
                resolution : float
                    Resolution of the range
                auto_on : int
                    `1` if autoranging, `0` if range locked.
        """
        response = self.resource.query("RANGE?").strip().split(',')
        return float(response[0]), float(response[1]), float(response[2]), int(response[3])
    
    def reset(self):
        """Reset 5790B.
        Will reset all active constants.
        """
        self.resource.write("*RST")
    
    def enter_cal_menu(self, testpoint_type:int):
        """Enter 5790B Calibration Menu

        Required:
            At least one value must be true, else passes.
        
        Args:
            dc : bool, optional
                Get DC calibration test points. Default to `False`
            ac : bool, optional
                Get AC calibration test points. Default to `False`
            gain : bool, optional
                Get WB gain calibration test points. Default to `False`
            flat : bool, optional
                Get WB flatness calibration test points. Default to `False`
            service : bool, optional
                Get additional test points for service calibration. Default to `False`
        """
        calibration_commands = {
            0: "cal_dc input1",
            1: "cal_i2",
            2: "cal_ac input1",
            3: "cal_wblin",
            4: "cal_dc wbnd",
            5: "cal_ac wbnd",
        }

        if testpoint_type in calibration_commands:
            self.resource.write(calibration_commands[testpoint_type])
        else:
            # Handle unknown testpoint_type
            print(f"Unknown testpoint_type: {testpoint_type}") 
    
    def input_wb(self):
        """SET 5790B INPUT TO WIDEBAND"""
        self.resource.write("INPUT WBND")

    def wait(self):
        """Wait until operation complete"""
        self.resource.write("*WAI")
    
    def clear_status(self):
        """Clear status buffer"""
        self.resource.write("*CLS")

    def start_adjust(self, correction_voltage: float):
        """Start DC adjustment procedure
        
        Args:
            correction_voltage: float
                Correction voltage to apply
        """
        self.resource.write(f"*OPC;CAL_NEXT {correction_voltage}")
    
    def start_freq_cal(self, frequency: float):
        """Start frequency calibration procedure
        
        Args:
            frequency: float
                Average frequency to apply
        """
        self.resource.write(f"*OPC;CAL_FREQ INPUT1, {frequency}")

    def check_adjust_complete(self) -> bool:
        """Check DC adjustment status
        
        Returns:
            bool: True if adjustment is complete, False otherwise
        """
        return self.resource.query("*OPC?") == "1"

    def get_cal_next(self) -> str:
        """Get DC adjustment result
        
        Returns:
            str: Adjustment result details
        """
        return self.resource.query("CAL_NEXT?")
    
    def cal_skip(self) -> str:
        """Skip to following CAL_NEXT
        
        Returns:
            str: Skip to following test point in calibration procedure.
        """
        return self.resource.write("CAL_SKIP")

    def get_error_status(self) -> str:
        """Get error status
        
        Returns:
            str: Error code
        """
        return self.resource.query("ERR?")
    
    def secure_off(self) -> str:
        """Turn secure setting off
        
        Returns:
            str: Error code
        """

        return self.resource.write('CAL_SECURE OFF, "5790"')    #CAL_SECURE OFF, "5790"
    
    def secure_on(self) -> str:
        """Turn secure setting on
        
        Returns:
            str: Error code
        """

        return self.resource.write('CAL_SECURE ON, "5790"')
    
    def ranges_updated(self, query: int) -> str:
        """Check if ranges updated > 0
        Returns:
            Int of total number of updated ranges
        """
        cal_commands = {
            TEST_POINT_TYPE_5790B.DC: "CAL_STORE? DC",
            TEST_POINT_TYPE_5790B.SERVICE: "CAL_STORE? ALL",
            TEST_POINT_TYPE_5790B.AC: "CAL_STORE? AC",
            TEST_POINT_TYPE_5790B.LIN: "CAL_STORE? ALL",
            TEST_POINT_TYPE_5790B.GAIN: "CAL_STORE? WDC",
            TEST_POINT_TYPE_5790B.FLAT: "CAL_STORE? WAC",
        }
        
        if query in cal_commands:
            command = cal_commands[query]
            return self.resource.query(command)
        else:
            return f"Invalid cal type: {query}"
        
    def store_constants(self, query: int) -> str:
        """Store contants

        Returns:
            str: Error code
        """
        cal_types = {
            "CAL_STORE DC": TEST_POINT_TYPE_5790B.DC,
            "CAL_STORE ALL": TEST_POINT_TYPE_5790B.SERVICE,
            "CAL_STORE AC": TEST_POINT_TYPE_5790B.AC,
            "CAL_STORE ALL": TEST_POINT_TYPE_5790B.LIN,
            "CAL_STORE WDC": TEST_POINT_TYPE_5790B.GAIN,
            "CAL_STORE WAC": TEST_POINT_TYPE_5790B.FLAT,
        }
        key_name = next((key for key, value in cal_types.items() if value == query), None)
        if key_name: 
            return self.resource.write(key_name)
        else: return f"Invalid cal type: {key_name}"

    def cal_off(self):
        """
        Performs the "CAL_OFF Command to exit the calibration menu

        """
        off_command = "CAL_OFF"
        self.resource.write(off_command)

    def secure_off_service_code(self, service_code: int) -> str:
        """Turn secure setting off for SERVICE
        
        Returns:
            str: Error code
        """

        return self.resource.write(f'CAL_SECURE OFF, "{service_code}"')
    
    def input_cal(self, input: int):
        """Set 5790B to read Input #"""
        self.resource.write(f"INPUT INPUT{input}")
    
    def get_instrument_status(self):
        """Get the Instrument Status Register (ISR) value of the 5790B."""
        isr = bin(int(self.resource.query('ISR?'))).replace('0b', '')
        return isr.zfill(16)
