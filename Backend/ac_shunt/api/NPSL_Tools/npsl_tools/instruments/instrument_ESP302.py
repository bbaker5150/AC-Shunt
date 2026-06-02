import pyvisa
from pyvisa import constants
import pyvisa.constants
import time
from time import sleep
import os
import json
"""
NPSL Library for the esp302 Motor Controller. Commands are assuming that the user has the URS100BPP Rotation Stage.
The setup for this library is minimal. Install the latest version of NPSL_TOOLS that contains this program in the SPORK repository.

- Instantiate the program by creating a motor controller instance. 

    ex. 
        esp302 = MotorController()
        or
        esp302 = MotorController(resource_name = string address, baud_rate = integer baudrate value)


- Initiate home in program then calibration home on the user interface.

    ex. 
        esp302.home(axis) -> python level function call after creation .. Home Position to 0 Degrees
        esp302.calibration_home(axis) - > user interface button .. Home Calibration 2.2V to Position 16 Degrees

- Perform Commands as needed.
    ex.
        def main():
            esp302 = MotorController()
            esp302.home(1)
            esp302.move_absolute(1, 75)
            esp302.home(1)
            print(f"Motor Controller ID: {esp302.id}")
            esp302.close()

Available programmable Commands:
-esp302.home(axis)*
-esp302.calibration_home(axis)*
-esp302.controller_status(axis)**
-esp302.get_position(axis)
-esp302.move_absolute(axis, absolute position target)*
-esp302.move_relative(axis, relative position target)*
-esp302.motor_step_range_check(axis)***
-esp302.write('string message no ending carriage')
-esp302.query('string message no ending carriage')
-esp302.read('string message no ending carriage')
-esp302.set_velocity(axis, integer value of units/second)
-esp302.set_acceleration(axis, integer value of units/second)
-esp302.disconnect()
-esp302.reboot()**Run this command only if the rotation stage becomes out of sync with the motion controller

*Internal Wait Commands for movements, will sleep for the value associated with the polling interval can be changed.
    ex.
        esp302.polling_interval = integer or float in seconds.

**The controller_status command runs automatically based on movement, if in movement the connected motor list will return true for the axis else false.

***Check will perform based off axis if in connected_motors
"""
class MotorController:
    def __init__(self, resource_name = 'ASRL4::INSTR', baud_rate = 19200):
        self.resource_name = resource_name
        self.baud_rate = baud_rate
        self.motor_controller = None
        self.polling_interval = 2.5
        self.rm = None
        self.id = None
        self.preset_positions = {}
        self.connected_motors = {}

    def set_792_angles(self, serial = 'Default'):
        relative_path = os.path.join('myenv', 'Lib', 'site-packages', 'npsl_tools', 'enums', '792A_Angles.json')
        with open(relative_path, 'r') as file:
            data = json.load(file)
        result = next((d for d in data if serial in d), None)
        self.preset_positions = result[serial]

        
    def connect(self):
        try:
            self.rm = pyvisa.ResourceManager()
            self.motor_controller = self.rm.open_resource('ASRL4::INSTR', baud_rate = 19200, flow_control = pyvisa.constants.VI_ASRL_FLOW_XON_XOFF)
            self.motor_controller.read_termination = '\r\r\n'
            self.motor_controller.write_termination = '\n'
            self.motor_controller.timeout = 5000

            self.id = self.query('VE?').partition(" ")[0]
            print(f"Connected to Device: {self.id}")
        except Exception as e:
            print(f"Error Initializing Motor Controller: {e}")
            if self.rm:
                self.rm.close()

    def motor_step_range_check(self, axis):
        for position in self.preset_positions:
            current_position = self.motor_controller.query(f'{axis}TP?')
            print(f'Axis {axis} stepping from Degree {current_position} => Degree {self.preset_positions[position]}')
            self.move_absolute(axis, self.preset_positions[position])

    def initialize_motors(self):
        print('Motor Controller Setup: Initializing all Axis...')
        self.motor_controller.write('MK')
        for motor in range(1,4):
            status = self.motor_controller.query(f'{motor}TS?')
            print(f'On startup check for connection to Axis {motor} with disabled power...')
            if status != 'Q@':
                print(f'Axis {motor} Connected OK .. Enabling Axis {motor} ')
                self.write(f'{motor}MO')
                self.connected_motors[motor] = {}
            else:
                print(f'Axis {motor} not connected or not present...')
        
    def write(self, command):
        try:
            if self.motor_controller:
                self.motor_controller.write(command)
            else:
                print("Motor Controller not initialized")
        except Exception as e:
            print(f"Error writing to Motor Controller: {e}")

    def query(self, command):
        try:
            if self.motor_controller:
                return self.motor_controller.query(command)
            else:
                print("Motor Controller not initialized")
        except Exception as e:
            print(f"Error querying Motor Controller: {e}")
            return e
        
    def read(self):
        try:
            if self.motor_controller:
                return self.motor_controller.read()
            else:
                print("Motor Controller not initialized")
                return None
        except Exception as e:
            print(f"Error reading Motor Controller: {e}")
            return e
    def id(self):
        return self.id
    
    def wait_for_motion(self,axis, current_position, target_position, polling_interval=2.5):
        try:
            if self.motor_controller:
                while float(current_position) != target_position:
                    current_position = float(self.motor_controller.query(f'{axis}TP?'))
                    print(f'Current Position is: {current_position}, target is {target_position}')
                    self.connected_motors[axis] = self.axis_status(axis)
                    print(self.connected_motors[axis])
                    sleep(polling_interval)
            else:
                print("Motor Controller not initialized")
        except Exception as e:
            print(f"Waiting for Motion completion: {e}")

    def axis_status(self, axis):
        query_status = self.query(f'{axis}TS?')
        axis_position = self.get_position(axis)
        byte1 = ord(query_status[0])
        byte2 = ord(query_status[1])
        status = {
            'axis_position': axis_position,
            'axis disconnected':bool(byte1 & 0x01),
            'motor on':bool(byte1 & 0x02),
            'axis in motion':bool(byte1 & 0x04),
            'origin done':bool(byte1 & 0x10),

            'following error':bool(byte2 & 0x01),
            'motor fault':bool(byte2 & 0x02),
            'negative limit reached':bool(byte2 & 0x04),
            'positive limit reached':bool(byte2 & 0x08),
            'zm reached':bool(byte2 & 0x10),
        }
        return status

    def home(self, axis):
        self.write(f'{axis}OL2')
        self.write(f'{axis}OR2')
        self.wait_for_motion(axis, self.motor_controller.query(f'{axis}TP'), 0, self.polling_interval)

    def calibration_home(self, axis):
        calibration_home_position = self.preset_positions['2.2']
        self.move_absolute(axis, calibration_home_position)
    
    def get_position(self,axis):
        return float(self.motor_controller.query(f'{axis}TP?'))

    def move_absolute(self, axis, position):
        self.write(f"{axis}PA{position}")
        self.wait_for_motion(axis, self.motor_controller.query(f'{axis}TP'), position, self.polling_interval)

    def move_relative(self,axis,position):
        self.write(f"{axis}PR{position}")
        self.wait_for_motion(axis, self.motor_controller.query(f'{axis}TP'), position, self.polling_interval)

    def set_velocity(self,axis,velocity):
        self.write(f"{axis}VA{velocity}")

    def set_acceleration(self,axis,acceleration,deceleration):
        self.write(f"{axis}AC{acceleration}")
        if deceleration is not None:
            self.write(f"{axis}AG{deceleration}")
    def reboot(self):
        self.write("RS")
    def disconnect(self):
        try:
            if self.motor_controller:
                self.motor_controller.write('MK')
                self.motor_controller.close()
            if self.rm:
                self.rm.close()
            print("Connection to Motor Controller Obliterated")
        except Exception as e:
            print(f"Error closing Motor Controller Connection: {e}") 