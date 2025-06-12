"""Base Instrument class file

Instrument class that communicates with an instrument using the PyVISA 
library. Includes functions to connect to a GPIB instrument, send initialization
commands, and check if the model number is correct.

Typical usage example:
    
    instrument = Instrument(model=model, gpib=gpib, timeout=timeout)
    instrument.initialize(*commands)
"""


import pyvisa

class Instrument:
    """Base instrument class
    
    More specific instruments should inherit from this class.

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

    def __init__(self, model: str, gpib: str, timeout: float=60000):
        """Inits Instrument object and connects to GPIB resource
        
        Raises:
            RuntimeError: An error occured when connecting to the GPIB address
        """
        try:
            self.model = model
            self.gpib = gpib
            self.timeout = timeout
            self._connect_gpib()

        except pyvisa.errors.VisaIOError as e:
            print(e)
            raise RuntimeError(f"{self.gpib} is not a valid GPIB address")


    def __str__(self):
        return f"Instrument {self.model} ({self.gpib})"


    def _connect_gpib(self):
        rm = pyvisa.ResourceManager()
        self.resource = rm.open_resource(self.gpib)
    
    def query(self, message: str) -> str:
        return self.resource.query(message)

    def write(self, message: str) -> None:
        self.resource.write(message)

    def read(self) -> str:
        return self.resource.read()

    def check_identity(self) -> bool:
        """Query the instrument's identity and check it matches
        
        Should be overridden by child objects to use instrument specific
        read termination character and identification query.
        
        This function sets the resource timeout value to 1 second to make it faster
        when the GPIB address and model number don't match, so this 
        should still be called when being overridden as such:
        ```
            def check_identity(self):
                super().check_identity()
        ```
        """
        self.resource.timeout = 1000
        return True

    async def initialize(self, *commands, output: callable=None, **kwargs) -> None:
        """Send initialization commands to the instrument.

        Async function
        
        Args:
            *commands : list
                Varibale length list of initialization commands to send to the instrument
            verbose : bool, optional
                If `True`, prints all of the commands written to instrument. 
                Defaults to `False`.
            output : callable, optional
                Callback function for outputting instrument commands to.
                Defaults to `print`
            **kwargs
                Additional arguments for the callback function. If output == print, must be empty
                
        Returns:
            None
            
        Typical usage example:
        ```
            instrument.initialize(
                "command 1",
                "command 2",
                "command 3",
                verbose = True
            )

            commands = ['command 1', 'command 2', 'command 3']
            instrument.initialize(*commands, verbose = False)
        ```
        """
        for cmd in commands:
            self.resource.write(cmd)
            if output:
                output(f"Write [{cmd}] to {self}", **kwargs)
        
        if output:
            output(f"{self} initialized", **kwargs)