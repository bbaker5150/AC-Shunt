from enum import Enum 

class BoolSetting(Enum):
    def __str__(self):
        return self.name

    def __int__(self):
        return self.value

    ON = 0
    OFF = 1

class FilterType(Enum):
    def __str__(self):
        return self.value[1]

    ANALOG = (1, 'ANAL')
    DIGITAL = (2, 'DIG')
    BOTH = (3, 'BOTH')

class DigitalFilterResponse(Enum):
    def __str__(self):
        return self.value[1]

    SLOW = (1, 'SLOW')
    MEDIUM = (2, 'MED')
    FAST = (3, 'FAST')

class TriggerSource(Enum):
    def __str__(self):
        return self.value[1] 
    
    EXTERNAL = (1, 'EXT')
    INTERNAL = (2, 'INT')
    BUS = (3, 'BUS')