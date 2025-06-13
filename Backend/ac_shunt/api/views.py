# api/views.py
import pyvisa
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Message, CalibrationSession, TestPointSet
from .serializers import MessageSerializer, CalibrationSessionSerializer, TestPointSetSerializer

def get_instrument_identity(rm, address):
    """
    Attempts to identify an instrument by trying a series of common commands.
    """
    identity_commands = ['*IDN?', 'ID?']
    
    try:
        instrument = rm.open_resource(address, open_timeout=500)
        instrument.timeout = 500
        
        for command in identity_commands:
            try:
                if command == 'ID?':
                    instrument.read_termination = "\r\n"
                else:
                    instrument.read_termination = "\n"

                identity = instrument.query(command).strip()
                if identity:
                    if command == 'ID?' and '3458A' in identity:
                         return f"HP/Agilent 3458A - {identity}"
                    return identity
            except pyvisa.errors.VisaIOError:
                continue
        
        return "N/A - Instrument connected but did not identify."

    except pyvisa.errors.VisaIOError:
        return f"N/A - VISA I/O Error (Check connection or if in use)."
    except Exception as e:
        return f"N/A - General Error: {str(e)}"
    finally:
        if 'instrument' in locals() and hasattr(instrument, 'close'):
            instrument.close()


@api_view(['GET'])
def discover_instruments(request):
    """
    Scans for connected VISA resources and returns them with their identities.
    """
    instrument_list = []
    unique_addresses = set()
    
    try:
        rm = pyvisa.ResourceManager()
        resources = rm.list_resources()
        print(f"Discovered VISA resources: {resources}")
    except Exception as e:
        print(f"Error initializing VISA resource manager: {e}")
        return JsonResponse({'error': 'Could not initialize VISA resource manager.', 'details': str(e)}, status=500)

    for address in resources:
        if 'ASRL' in address.upper():
            print(f"Ignoring serial port: {address}")
            continue

        base_address = address.split('::INSTR')[0].split('/')[-1] + "::INSTR"
        
        if base_address not in unique_addresses:
            unique_addresses.add(base_address)
            identity = get_instrument_identity(rm, address)
            
            instrument_list.append({
                'address': address,
                'identity': identity
            })

    print(f"Returning unique, identified instruments: {instrument_list}")
    return JsonResponse(instrument_list, safe=False)

class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all().order_by('-created_at')
    serializer_class = MessageSerializer

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
