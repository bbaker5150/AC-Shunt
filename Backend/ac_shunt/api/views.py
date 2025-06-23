# api/views.py
import pyvisa
import statistics
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Message, CalibrationSession, TestPointSet, Calibration, CalibrationSettings, CalibrationReadings, CalibrationResults
from .serializers import MessageSerializer, CalibrationSessionSerializer, TestPointSetSerializer, CalibrationSerializer, CalibrationSettingsSerializer, CalibrationReadingsSerializer, CalibrationResultsSerializer

# --- Hardcoded Readings Dev Testing ---

STD_AC_OPEN_READINGS_INITIAL = [14, 15, 16, 17, 18]
STD_DC_POS_READINGS_INITIAL = [14.1, 15.2, 16.3, 17.4, 18.5]
STD_DC_NEG_READINGS_INITIAL = [-14, -15, -16, -17, -18]
STD_AC_CLOSE_READINGS_INITIAL = [13.9, 14.8, 16.1, 17.2, 18.3]

TI_AC_OPEN_READINGS_INITIAL = [14.05, 18.1, 20.2, 21.3, 22.4]
TI_DC_POS_READINGS_INITIAL = [14.15, 18.2, 20.3, 21.4, 22.5]
TI_DC_NEG_READINGS_INITIAL = [-14.05, -18.1, -20.2, -21.3, -22.4]
TI_AC_CLOSE_READINGS_INITIAL = [13.95, 17.8, 20.1, 21.2, 22.3]

def _calculate_stats(readings):
    """Helper to calculate average and standard deviation."""
    if not readings or len(readings) == 0:
        return 0, 0
    
    avg = statistics.mean(readings)
    # Use population stdev if only one sample, otherwise sample stdev
    stddev = statistics.stdev(readings) if len(readings) > 1 else 0
    
    return round(avg, 2), round(stddev, 2)

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

    @action(detail=True, methods=['get', 'put'], url_path='test_points')
    def test_points_handler(self, request, pk=None):
        session = self.get_object()
        
        if request.method == 'GET':
            test_points, created = TestPointSet.objects.get_or_create(session=session)
            serializer = TestPointSetSerializer(test_points)
            return Response(serializer.data)

        elif request.method == 'PUT':
            test_points, _ = TestPointSet.objects.get_or_create(session=session)
            serializer = TestPointSetSerializer(test_points, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'put'], url_path='information')
    def calibration_handler(self, request, pk=None):
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)

        # **FIX**: Proactively create related objects if they don't exist.
        # This prevents other endpoints from failing and fixes the race condition.
        CalibrationSettings.objects.get_or_create(calibration=calibration)
        CalibrationReadings.objects.get_or_create(calibration=calibration)
        CalibrationResults.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            serializer = CalibrationSerializer(calibration)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationSerializer(calibration, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'put'], url_path='settings')
    def calibration_settings_handler(self, request, pk=None):
        """
        Handles GET and PUT requests for the CalibrationSettings of a session.
        """
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)
        settings, _ = CalibrationSettings.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            serializer = CalibrationSettingsSerializer(settings)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationSettingsSerializer(settings, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'put'], url_path='results')
    def calibration_results_handler(self, request, pk=None):
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)
        results, _ = CalibrationResults.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            # Check if the object is unpopulated, not just if it was created.
            if results.std_ac_open_avg is None:
                # If a key field is null, populate the entire object.
                results.std_ac_open_avg, results.std_ac_open_stddev = _calculate_stats(STD_AC_OPEN_READINGS_INITIAL)
                results.std_dc_pos_avg, results.std_dc_pos_stddev = _calculate_stats(STD_DC_POS_READINGS_INITIAL)
                results.std_dc_neg_avg, results.std_dc_neg_stddev = _calculate_stats(STD_DC_NEG_READINGS_INITIAL)
                results.std_ac_close_avg, results.std_ac_close_stddev = _calculate_stats(STD_AC_CLOSE_READINGS_INITIAL)
                
                results.ti_ac_open_avg, results.ti_ac_open_stddev = _calculate_stats(TI_AC_OPEN_READINGS_INITIAL)
                results.ti_dc_pos_avg, results.ti_dc_pos_stddev = _calculate_stats(TI_DC_POS_READINGS_INITIAL)
                results.ti_dc_neg_avg, results.ti_dc_neg_stddev = _calculate_stats(TI_DC_NEG_READINGS_INITIAL)
                results.ti_ac_close_avg, results.ti_ac_close_stddev = _calculate_stats(TI_AC_CLOSE_READINGS_INITIAL)
                
                results.save()

            serializer = CalibrationResultsSerializer(results)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationResultsSerializer(results, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    @action(detail=True, methods=['get', 'put'], url_path='readings')
    def calibration_readings_handler(self, request, pk=None):
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)
        readings, _ = CalibrationReadings.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            # Check if the object is unpopulated, not just if it was created.
            # An empty list is "falsy" in Python, so this check works.
            if not readings.std_ac_open_readings:
                # If a key field is empty, populate the entire object.
                readings.std_ac_open_readings = STD_AC_OPEN_READINGS_INITIAL
                readings.std_dc_pos_readings = STD_DC_POS_READINGS_INITIAL
                readings.std_dc_neg_readings = STD_DC_NEG_READINGS_INITIAL
                readings.std_ac_close_readings = STD_AC_CLOSE_READINGS_INITIAL

                readings.ti_ac_open_readings = TI_AC_OPEN_READINGS_INITIAL
                readings.ti_dc_pos_readings = TI_DC_POS_READINGS_INITIAL
                readings.ti_dc_neg_readings = TI_DC_NEG_READINGS_INITIAL
                readings.ti_ac_close_readings = TI_AC_CLOSE_READINGS_INITIAL
                
                readings.save()

            serializer = CalibrationReadingsSerializer(readings)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationReadingsSerializer(readings, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
            
        