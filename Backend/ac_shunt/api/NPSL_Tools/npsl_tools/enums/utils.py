from enum import Enum
from npsl_tools.instruments.instrument_5790B import TEST_POINT_TYPE_5790B
import os
import json
def convert_function_value(data):
    if 'function' in data:
        data['function'] = TEST_POINT_TYPE_5790B(data['function'])
    return data
def retrieve_nist_point_list():
    # Define the Enum class for function types
    # Define the relative path to the JSON file
    relative_path = os.path.join('myenv', 'Lib', 'site-packages', 'npsl_tools', 'enums', '5790B_NIST_WB.json')

    # Open the JSON file and load its content into a variable
    with open(relative_path, 'r') as file:
        json_content = json.load(file)
    NIST_WB_POINTS = [convert_function_value(item) for item in json_content]
    for item in NIST_WB_POINTS:
        item.update({"NistPoint": True})

    return NIST_WB_POINTS
def to_dict(obj: Enum):
    ret = {}
    for m in list(obj):
        ret.setdefault(m.name, m.value)
    return ret

def to_reverse_dict(obj: Enum):
    ret = {}
    for m in list(obj):
        ret.setdefault(m.value, m.name)
    return ret

def retrieve_792_serials():
    relative_path = os.path.join('myenv', 'Lib', 'site-packages', 'npsl_tools', 'enums', '792A_Angles.json')
    with open(relative_path, 'r') as file:
        data = json.load(file)
    dictionary_names = [list(item.keys())[0] for item in data]
    return dictionary_names
    
