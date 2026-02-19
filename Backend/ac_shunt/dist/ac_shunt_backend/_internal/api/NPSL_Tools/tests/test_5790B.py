from src.npsl_tools.instruments import Instrument5790B

def connect():
    address = "GPIB0::16::INSTR"
    inst = Instrument5790B(address)
    return inst

def test_connect():
    inst = connect()
    assert inst.__class__ == Instrument5790B