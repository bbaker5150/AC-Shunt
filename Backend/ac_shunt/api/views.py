# api/views.py
import pyvisa
import re
import statistics
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Message, CalibrationSession, TestPoint, TestPointSet, Calibration, CalibrationConfigurations, CalibrationSettings, CalibrationReadings, CalibrationResults
from .serializers import MessageSerializer, CalibrationSerializer, CalibrationSessionSerializer, TestPointSerializer, TestPointSetSerializer, CalibrationConfigurationsSerializer, CalibrationSettingsSerializer, CalibrationReadingsSerializer, CalibrationResultsSerializer
from .NPSL_Tools.instruments.instrument_34420A import Instrument34420A
from django.core.exceptions import ObjectDoesNotExist
# --- Hardcoded Readings Dev Testing ---

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

    # --- NEW: Action to collect a specified number of samples from an instrument ---
    # @action(detail=True, methods=['post'], url_path='collect-readings')
    # def collect_readings(self, request, pk=None):
    #     session = self.get_object()
        
    #     # Extract data from the frontend request
    #     reading_type = request.data.get('reading_type') # e.g., 'std_ac_open'
    #     num_samples = request.data.get('num_samples')

    #     if not all([reading_type, num_samples]):
    #         return Response(
    #             {'error': 'reading_type and num_samples are required.'},
    #             status=status.HTTP_400_BAD_REQUEST
    #         )
        
    #     # For now, we use the hardcoded address for the 34420A as requested
    #     instrument_address = 'GPIB0::22::INSTR'

    #     try:
    #         instrument = Instrument34420A(channel=instrument_address)
            
    #         collected_readings = []
    #         for _ in range(int(num_samples)):
    #             # Call the read_instrument method for each sample
    #             reading = instrument.read_instrument()
    #             collected_readings.append(reading)

    #         # Get the related readings model
    #         calibration, _ = Calibration.objects.get_or_create(session=session)
    #         readings, _ = CalibrationReadings.objects.get_or_create(calibration=calibration)

    #         # Update the correct field on the model with the new list of readings
    #         field_name = f"{reading_type}_readings"  # e.g., 'std_ac_open_readings'
    #         if hasattr(readings, field_name):
    #             setattr(readings, field_name, collected_readings)
    #             readings.save()
    #         else:
    #             return Response({'error': f'Invalid reading_type: {reading_type}'}, status=status.HTTP_400_BAD_REQUEST)

    #         return Response({
    #             'message': f'Successfully collected {num_samples} samples.',
    #             'readings': collected_readings
    #         }, status=status.HTTP_200_OK)

    #     except Exception as e:
    #         return Response({'error': f'Instrument communication failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # --- NEW: Action to collect a specified number of samples from an instrument ---
    # @action(detail=True, methods=['post'], url_path='collect-readings')
    # def collect_readings(self, request, pk=None):
    #     session = self.get_object()
        
    #     # Extract data from the frontend request
    #     reading_type = request.data.get('reading_type') # e.g., 'std_ac_open'
    #     num_samples = request.data.get('num_samples')

    #     if not all([reading_type, num_samples]):
    #         return Response(
    #             {'error': 'reading_type and num_samples are required.'},
    #             status=status.HTTP_400_BAD_REQUEST
    #         )
        
    #     # For now, we use the hardcoded address for the 34420A as requested
    #     instrument_address = 'GPIB0::22::INSTR'

    #     try:
    #         instrument = Instrument34420A(channel=instrument_address)
            
    #         collected_readings = []
    #         for _ in range(int(num_samples)):
    #             # Call the read_instrument method for each sample
    #             reading = instrument.read_instrument()
    #             collected_readings.append(reading)

    #         # Get the related readings model
    #         calibration, _ = Calibration.objects.get_or_create(session=session)
    #         readings, _ = CalibrationReadings.objects.get_or_create(calibration=calibration)

    #         # Update the correct field on the model with the new list of readings
    #         field_name = f"{reading_type}_readings"  # e.g., 'std_ac_open_readings'
    #         if hasattr(readings, field_name):
    #             setattr(readings, field_name, collected_readings)
    #             readings.save()
    #         else:
    #             return Response({'error': f'Invalid reading_type: {reading_type}'}, status=status.HTTP_400_BAD_REQUEST)

    #         return Response({
    #             'message': f'Successfully collected {num_samples} samples.',
    #             'readings': collected_readings
    #         }, status=status.HTTP_200_OK)

    #     except Exception as e:
    #         return Response({'error': f'Instrument communication failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get', 'put'], url_path='information')
    def calibration_handler(self, request, pk=None):
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)

        CalibrationConfigurations.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            serializer = CalibrationSerializer(calibration)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationSerializer(calibration, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    @action(detail=True, methods=['get', 'put'], url_path='configurations')
    def calibration_configurations_handler(self, request, pk=None):
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)
        configurations, _ = CalibrationConfigurations.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            serializer = CalibrationConfigurationsSerializer(configurations)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationConfigurationsSerializer(configurations, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


    @action(detail=True, methods=['get', 'put'], url_path='settings')
    def test_point_settings_handler(self, request, pk=None):
        session = self.get_object()
        test_point_set, _ = TestPointSet.objects.get_or_create(session=session)
        test_points = test_point_set.points.all()

        if request.method == 'GET':
            all_settings_data = []
            for tp in test_points:
                try:
                    settings_instance = tp.settings
                    settings_serializer = CalibrationSettingsSerializer(settings_instance)
                    settings_dict = settings_serializer.data
                    settings_dict['test_point_id'] = tp.id
                    all_settings_data.append(settings_dict)
                except ObjectDoesNotExist:
                    pass

            return Response(all_settings_data, status=status.HTTP_200_OK)

        elif request.method == 'PUT':
            incoming_settings_list = request.data
            
            with transaction.atomic():
                existing_test_points_map = {tp.id: tp for tp in test_point_set.points.all()}

                for settings_data in incoming_settings_list:
                    test_point_id = settings_data.pop('test_point_id', None)

                    if not test_point_id:
                        return Response(
                            {"detail": "Each setting object must include 'test_point_id'."},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    test_point_instance = existing_test_points_map.get(test_point_id)

                    if not test_point_instance:
                        return Response(
                            {"detail": f"TestPoint with ID {test_point_id} not found for this session."},
                            status=status.HTTP_404_NOT_FOUND
                        )

                    existing_settings_instance = getattr(test_point_instance, 'settings', None)

                    if existing_settings_instance:
                        settings_serializer = CalibrationSettingsSerializer(
                            instance=existing_settings_instance,
                            data=settings_data,
                            partial=True
                        )
                    else:
                        settings_serializer = CalibrationSettingsSerializer(data=settings_data)

                    settings_serializer.is_valid(raise_exception=True)
                    new_or_updated_settings = settings_serializer.save()

                    if not test_point_instance.settings or test_point_instance.settings != new_or_updated_settings:
                        test_point_instance.settings = new_or_updated_settings
                        test_point_instance.save(update_fields=['settings'])

            return self.test_point_settings_handler(request._request, pk=pk)

        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
    
    @action(detail=True, methods=['get', 'put'], url_path='readings')
    def test_point_readings_handler(self, request, pk=None):
        session = self.get_object()
        test_point_set, _ = TestPointSet.objects.get_or_create(session=session)
        test_points = test_point_set.points.all()

        if request.method == 'GET':
            all_readings_data = []
            for tp in test_points:
                try:
                    readings_instance = tp.readings
                    readings_serializer = CalibrationReadingsSerializer(readings_instance)
                    readings_dict = readings_serializer.data
                    readings_dict['test_point_id'] = tp.id
                    all_readings_data.append(readings_dict)
                except ObjectDoesNotExist:
                    pass

            return Response(all_readings_data, status=status.HTTP_200_OK)

        elif request.method == 'PUT':
            incoming_readings_list = request.data
            
            with transaction.atomic():
                existing_test_points_map = {tp.id: tp for tp in test_point_set.points.all()}

                for readings_data in incoming_readings_list:
                    test_point_id = readings_data.pop('test_point_id', None)

                    if not test_point_id:
                        return Response(
                            {"detail": "Each setting object must include 'test_point_id'."},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    test_point_instance = existing_test_points_map.get(test_point_id)

                    if not test_point_instance:
                        return Response(
                            {"detail": f"TestPoint with ID {test_point_id} not found for this session."},
                            status=status.HTTP_404_NOT_FOUND
                        )

                    existing_readings_instance = getattr(test_point_instance, 'readings', None)

                    if existing_readings_instance:
                        readings_serializer = CalibrationReadingsSerializer(
                            instance=existing_readings_instance,
                            data=readings_data,
                            partial=True
                        )
                    else:
                        readings_serializer = CalibrationReadingsSerializer(data=readings_data)

                    readings_serializer.is_valid(raise_exception=True)
                    new_or_updated_readings = readings_serializer.save()

                    if not test_point_instance.readings or test_point_instance.readings != new_or_updated_readings:
                        test_point_instance.readings = new_or_updated_readings
                        test_point_instance.save(update_fields=['readings'])

            return self.test_point_readings_handler(request._request, pk=pk)

        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
    
    @action(detail=True, methods=['get', 'put'], url_path='results')
    def test_point_results_handler(self, request, pk=None):
        session = self.get_object()
        test_point_set, _ = TestPointSet.objects.get_or_create(session=session)
        test_points = test_point_set.points.all()

        if request.method == 'GET':
            all_results_data = []
            for tp in test_points:
                try:
                    results_instance = tp.results
                    results_serializer = CalibrationResultsSerializer(results_instance)
                    results_dict = results_serializer.data
                    results_dict['test_point_id'] = tp.id
                    all_results_data.append(results_dict)
                except ObjectDoesNotExist:
                    pass

            return Response(all_results_data, status=status.HTTP_200_OK)

        elif request.method == 'PUT':
            incoming_results_list = request.data
            
            with transaction.atomic():
                existing_test_points_map = {tp.id: tp for tp in test_point_set.points.all()}

                for results_data in incoming_results_list:
                    test_point_id = results_data.pop('test_point_id', None)

                    if not test_point_id:
                        return Response(
                            {"detail": "Each setting object must include 'test_point_id'."},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    test_point_instance = existing_test_points_map.get(test_point_id)

                    if not test_point_instance:
                        return Response(
                            {"detail": f"TestPoint with ID {test_point_id} not found for this session."},
                            status=status.HTTP_404_NOT_FOUND
                        )

                    existing_results_instance = getattr(test_point_instance, 'readings', None)

                    if existing_readings_instance:
                        results_serializer = CalibrationResultsSerializer(
                            instance=existing_results_instance,
                            data=results_data,
                            partial=True
                        )
                    else:
                        results_serializer = CalibrationResultsSerializer(data=results_data)

                    results_serializer.is_valid(raise_exception=True)
                    new_or_updated_results = results_serializer.save()

                    if not test_point_instance.results or test_point_instance.results != new_or_updated_results:
                        test_point_instance.results = new_or_updated_results
                        test_point_instance.save(update_fields=['results'])

            return self.test_point_results_handler(request._request, pk=pk)

        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
    
    @action(detail=True, methods=['get'], url_path='settings/(?P<tp_id>[^/.]+)?')
    def session_settings_handler(self, request, pk=None, tp_id=None):
        session = self.get_object()

        try:
            test_point_set = TestPointSet.objects.get(session=session)
        except TestPointSet.DoesNotExist:
            return Response(
                {"detail": "Test point set not found for this session."},
                status=status.HTTP_404_NOT_FOUND
            )

        if tp_id:
            try:
                test_point = test_point_set.points.get(pk=tp_id)
                settings_instance = getattr(test_point, 'settings', None)
                if settings_instance:
                    serializer = CalibrationSettingsSerializer(settings_instance)
                    return Response(serializer.data, status=status.HTTP_200_OK)
                else:
                    return Response(
                        {"detail": f"No settings found for test point {tp_id}."},
                        status=status.HTTP_404_NOT_FOUND
                    )
            except TestPoint.DoesNotExist:
                return Response(
                    {"detail": f"Test point {tp_id} not found in this session."},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            all_settings = []
            test_points = test_point_set.points.all()

            for tp in test_points:
                settings_instance = getattr(tp, 'settings', None)
                if settings_instance:
                    all_settings.append(settings_instance)

            serializer = CalibrationSettingsSerializer(all_settings, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        
    @action(detail=True, methods=['get'], url_path='readings/(?P<tp_id>[^/.]+)?')
    def session_readings_handler(self, request, pk=None, tp_id=None):
        session = self.get_object()

        try:
            test_point_set = TestPointSet.objects.get(session=session)
        except TestPointSet.DoesNotExist:
            return Response(
                {"detail": "Test point set not found for this session."},
                status=status.HTTP_404_NOT_FOUND
            )

        if tp_id:
            try:
                test_point = test_point_set.points.get(pk=tp_id)
                readings_instance = getattr(test_point, 'readings', None)
                if readings_instance:
                    serializer = CalibrationReadingsSerializer(readings_instance)
                    return Response(serializer.data, status=status.HTTP_200_OK)
                else:
                    return Response(
                        {"detail": f"No readings found for test point {tp_id}."},
                        status=status.HTTP_404_NOT_FOUND
                    )
            except TestPoint.DoesNotExist:
                return Response(
                    {"detail": f"Test point {tp_id} not found in this session."},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            all_readings = []
            test_points = test_point_set.points.all()

            for tp in test_points:
                readings_instance = getattr(tp, 'readings', None)
                if readings_instance:
                    all_readings.append(readings_instance)

            serializer = CalibrationReadingsSerializer(all_readings, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        
    @action(detail=True, methods=['get'], url_path='results/(?P<tp_id>[^/.]+)?')
    def session_results_handler(self, request, pk=None, tp_id=None):
        session = self.get_object()

        try:
            test_point_set = TestPointSet.objects.get(session=session)
        except TestPointSet.DoesNotExist:
            return Response(
                {"detail": "Test point set not found for this session."},
                status=status.HTTP_404_NOT_FOUND
            )

        if tp_id:
            try:
                test_point = test_point_set.points.get(pk=tp_id)
                results_instance = getattr(test_point, 'results', None)
                if results_instance:
                    serializer = CalibrationResultsSerializer(results_instance)
                    return Response(serializer.data, status=status.HTTP_200_OK)
                else:
                    return Response(
                        {"detail": f"No results found for test point {tp_id}."},
                        status=status.HTTP_404_NOT_FOUND
                    )
            except TestPoint.DoesNotExist:
                return Response(
                    {"detail": f"Test point {tp_id} not found in this session."},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            all_results = []
            test_points = test_point_set.points.all()

            for tp in test_points:
                results_instance = getattr(tp, 'results', None)
                if results_instance:
                    all_results.append(results_instance)

            serializer = CalibrationResultsSerializer(all_results, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        
class TestPointViewSet(viewsets.ModelViewSet):
    serializer_class = TestPointSerializer

    def get_queryset(self):
        return TestPoint.objects.filter(test_point_set__session_id=self.kwargs['session_pk'])

    def perform_create(self, serializer):
        session = CalibrationSession.objects.get(pk=self.kwargs['session_pk'])
        test_point_set = TestPointSet.objects.get(session=session)
        serializer.save(test_point_set=test_point_set)

    @action(detail=False, methods=['post'], url_path='append')
    def append_points(self, request, session_pk=None):
        points_data = request.data.get('points', [])
        try:
            tp_set, created_tp_set = TestPointSet.objects.get_or_create(session_id=session_pk)
            existing = tp_set.points.values_list('current', 'frequency')

            existing_set = set(existing)
            created_points_count = 0

            for point in points_data:
                key = (str(point.get('current')), point.get('frequency'))
                if key not in existing_set:
                    TestPoint.objects.create(test_point_set=tp_set, **point)
                    existing_set.add(key)
                    created_points_count += 1

            return Response(
                {"message": f"Added {created_points_count} new test point(s)."},
                status=status.HTTP_201_CREATED
            )

        except CalibrationSession.DoesNotExist:
            return Response({"detail": "Calibration Session not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e: 
            return Response({"detail": f"An error occurred: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        
    @action(detail=False, methods=['delete'], url_path='clear')
    def clear_test_points(self, request, session_pk=None):
        try:
            tp_set = TestPointSet.objects.get(session__id=session_pk)
        except TestPointSet.DoesNotExist:
            return Response(
                {"detail": "TestPointSet not found for this session, nothing to clear."},
                status=status.HTTP_404_NOT_FOUND
            )
        except CalibrationSession.DoesNotExist:
            return Response({"detail": "Calibration Session not found."}, status=status.HTTP_404_NOT_FOUND)

        deleted_count, _ = tp_set.points.all().delete()
        return Response(
            {"message": f"Deleted {deleted_count} test points for session {session_pk}."},
            status=status.HTTP_204_NO_CONTENT
        )

    @action(detail=True, methods=['put'], url_path='update-results')
    def update_results(self, request, session_pk=None, pk=None):
        try:
            test_point = self.get_queryset().get(pk=pk)
            results = getattr(test_point, 'results', None)

            if not results:
                return Response({"detail": "Results not found for this test point."}, status=status.HTTP_404_NOT_FOUND)

            serializer = CalibrationResultsSerializer(results, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()

            return Response(serializer.data, status=status.HTTP_200_OK)

        except TestPoint.DoesNotExist:
            return Response({"detail": "Test point not found."}, status=status.HTTP_404_NOT_FOUND)
                        
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)

        return Response({
            "calibration_session_id": int(self.kwargs['session_pk']),
            "test_points": serializer.data
        })
    
