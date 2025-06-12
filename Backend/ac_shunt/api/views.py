# api/views.py
import pyvisa
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Message, DMMMeasurement, MeasurementSet, CalibrationSession, TestPointSet
from .serializers import MessageSerializer, DMMMeasurementSerializer, MeasurementSetSerializer, CalibrationSessionSerializer, TestPointSetSerializer

def get_instrument_identity(rm, address):
    """
    Attempts to identify an instrument by trying a series of common commands.
    
    Args:
        rm: The PyVISA ResourceManager instance.
        address: The VISA address string of the instrument.
        
    Returns:
        A string containing the instrument's identity, or an error/status message.
    """
    # List of identification commands to try in order.
    # The 3458A uses 'ID?'. Most modern instruments use '*IDN?'.
    identity_commands = ['*IDN?', 'ID?']
    
    try:
        # Open the resource with a short timeout to avoid long hangs on unresponsive devices
        instrument = rm.open_resource(address, open_timeout=500)
        instrument.timeout = 500 # Timeout for the query itself
        
        for command in identity_commands:
            try:
                # For Agilent/HP instruments, a specific termination character is often needed.
                if command == 'ID?':
                    instrument.read_termination = "\r\n"
                else:
                    # Use default for others
                    instrument.read_termination = "\n"

                identity = instrument.query(command).strip()
                # If we get any non-empty response, we consider it a success.
                if identity:
                    # Prepend the model name if it's a known special case
                    if command == 'ID?' and '3458A' in identity:
                         return f"HP/Agilent 3458A - {identity}"
                    return identity
            except pyvisa.errors.VisaIOError:
                # This error is expected if an instrument doesn't support a command.
                # We'll just continue to the next command in the list.
                continue
        
        # If no command succeeded, return a generic message.
        return "N/A - Instrument connected but did not identify."

    except pyvisa.errors.VisaIOError:
        # This catches errors during the initial open_resource call.
        return f"N/A - VISA I/O Error (Check connection or if in use)."
    except Exception as e:
        return f"N/A - General Error: {str(e)}"
    finally:
        # Ensure the resource is always closed.
        if 'instrument' in locals() and hasattr(instrument, 'close'):
            instrument.close()


@api_view(['GET'])
def discover_instruments(request):
    """
    Scans for connected VISA resources, filters duplicates and non-instrument ports,
    and returns them with their identities.
    """
    instrument_list = []
    unique_addresses = set() # Use a set to track addresses and prevent duplicates
    
    try:
        rm = pyvisa.ResourceManager()
        resources = rm.list_resources()
        print(f"Discovered VISA resources: {resources}")
    except Exception as e:
        print(f"Error initializing VISA resource manager: {e}")
        return JsonResponse({'error': 'Could not initialize VISA resource manager.', 'details': str(e)}, status=500)

    for address in resources:
        # **FIX**: Ignore ASRL (serial/COM) ports which are not instruments.
        if 'ASRL' in address.upper():
            print(f"Ignoring serial port: {address}")
            continue

        # Normalize the address to handle duplicates like 'GPIB0::...' and 'visa://.../GPIB0::...'
        # This takes the last part of the address string, which is typically the unique alias.
        base_address = address.split('::INSTR')[0].split('/')[-1] + "::INSTR"
        
        if base_address not in unique_addresses:
            unique_addresses.add(base_address)
            
            # Use the original full address for connection, but the base for tracking.
            identity = get_instrument_identity(rm, address)
            
            instrument_list.append({
                'address': address, # Use the full, original address for connecting
                'identity': identity
            })

    print(f"Returning unique, identified instruments: {instrument_list}")
    return JsonResponse(instrument_list, safe=False)

class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all().order_by('-created_at')
    serializer_class = MessageSerializer

class MeasurementSetViewSet(viewsets.ModelViewSet): # Allow create/list/retrieve/update/delete for sets
    queryset = MeasurementSet.objects.all()
    serializer_class = MeasurementSetSerializer

    # Custom action to get measurements for a specific set
    # Access via /api/measurement_sets/{set_pk}/get_measurements/
    @action(detail=True, methods=['get'], url_path='get-measurements')
    def get_measurements(self, request, pk=None):
        measurement_set = self.get_object()
        measurements = DMMMeasurement.objects.filter(measurement_set=measurement_set).order_by('timestamp')
        serializer = DMMMeasurementSerializer(measurements, many=True)
        return Response(serializer.data)

# This ViewSet can still exist if you want a way to see ALL DMM measurements
# regardless of set, or measurements filtered by other criteria.
# For now, fetching measurements VIA a set is the primary goal.
class DMMMeasurementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DMMMeasurement.objects.all().order_by('timestamp')
    serializer_class = DMMMeasurementSerializer
    # Add filtering if needed, e.g., /api/dmm_measurements/?set_id=X
    filterset_fields = ['measurement_set']

class CalibrationSessionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing Calibration Session records.
    """
    queryset = CalibrationSession.objects.all().order_by('-created_at')
    serializer_class = CalibrationSessionSerializer

    @action(detail=True, methods=['get', 'put'], url_path='test_point_set')
    def test_point_set_handler(self, request, pk=None):
        session = self.get_object()
        
        if request.method == 'GET':
            test_point_set, created = TestPointSet.objects.get_or_create(session=session)
            serializer = TestPointSetSerializer(test_point_set)
            return Response(serializer.data)

        elif request.method == 'PUT':
            test_point_set, _ = TestPointSet.objects.get_or_create(session=session)
            serializer = TestPointSetSerializer(test_point_set, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)