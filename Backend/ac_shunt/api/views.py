# api/views.py
import pyvisa
import re
import statistics
from collections import defaultdict
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from .models import Message, Correction, Uncertainty, CalibrationSession, TestPoint, TestPointSet, Calibration, CalibrationConfigurations, CalibrationTVCCorrections, CalibrationSettings, CalibrationReadings, CalibrationResults
from .serializers import MessageSerializer, CorrectionSerializer, CorrectionGroupedSerializer, FlatCorrectionSerializer, UncertaintySerializer, UncertaintyGroupedSerializer, FlatUncertaintySerializer, CalibrationSerializer, CalibrationSessionSerializer, TestPointSerializer, TestPointSetSerializer, CalibrationTVCCorrectionsSerializer, CalibrationConfigurationsSerializer, CalibrationSettingsSerializer, CalibrationReadingsSerializer, CalibrationResultsSerializer
from .NPSL_Tools.instruments import Instrument11713C, Instrument3458A, Instrument5730A, Instrument5790B, Instrument34420A, Instrument8100
from django.core.exceptions import ObjectDoesNotExist
import json
import os

INSTRUMENT_CLASS_MAP = {
    '5730A': Instrument5730A,
    '5790B': Instrument5790B,
    '3458A': Instrument3458A,
    '34420A': Instrument34420A,
    '11713C': Instrument11713C,
    '8100': Instrument8100
}

def get_instrument_identity(rm, address):
    """
    Attempts to identify an instrument by trying a series of common commands.
    """
    identity_commands = ['*IDN?', 'ID?']
    
    try:
        instrument = rm.open_resource(address, open_timeout=500)
        instrument.timeout = 500
        instrument.clear() # Clear buffer before sending commands

        for command in identity_commands:
            try:
                if command == 'ID?':
                    instrument.read_termination = "\r\n"
                else:
                    instrument.read_termination = "\n"

                identity = instrument.query(command).strip()

                try:
                    float(identity)
                    continue
                except ValueError:
                    pass
                
                if identity:
                    if command == 'ID?' and '3458A' in identity:
                         return f"{identity}"
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
    Scans for connected VISA resources, de-duplicates them robustly, and returns
    them with their identities and the local IP.
    """
    try:
        rm = pyvisa.ResourceManager()
        resources = rm.list_resources()
        print(f"Discovered VISA resources: {resources}")
    except Exception as e:
        print(f"Error initializing VISA resource manager: {e}")
        return JsonResponse({'error': 'Could not initialize VISA resource manager.', 'details': str(e)}, status=500)

    # --- Robust De-duplication Logic ---
    visa_network_resources = []
    local_resources = []

    for address in resources:
        if 'visa://' in address.lower():
            visa_network_resources.append(address)
        else:
            local_resources.append(address)

    final_addresses = []
    instrument_map = {}

    if visa_network_resources:
        print("Network instruments found. Prioritizing VISA network addresses.")
        for address in visa_network_resources:
            ip_match = re.search(r'visa:\/\/([0-9.]+)(:[0-9]+)?', address)
            core_match = re.search(r'GPIB\d*::\d+::INSTR', address)
            
            if ip_match and core_match:
                ip = ip_match.group(1)
                core_address = core_match.group(0)
                unique_key = f"{ip}-{core_address}"
                instrument_map[unique_key] = address

        final_addresses = sorted(list(instrument_map.values()))
    else:
        print("No network instruments found. Falling back to local addresses.")
        local_map = {}
        for address in local_resources:
            core_match = re.search(r'GPIB\d*::\d+::INSTR', address)
            local_map[core_match] = address
        final_addresses = sorted(list(local_map.values()))

    print(f"De-duplicated, prioritized instrument addresses: {final_addresses}")

    instrument_list = []
    for address in final_addresses:
        identity = get_instrument_identity(rm, address)
        instrument_list.append({
            'address': address,
            'identity': identity
        })

    local_ip = request.META.get('REMOTE_ADDR')
    response_data = {
        "instruments": instrument_list,
        "local_ip": local_ip
    }

    print(f"Returning identified instruments: {instrument_list}")
    return JsonResponse(response_data)


class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all().order_by('-created_at')
    serializer_class = MessageSerializer

class BaseDataViewSet(viewsets.ViewSet):
    model_class = None
    list_serializer_class = None
    flat_serializer_class = None
    value_key = None

    def list(self, request):
        if not self.list_serializer_class or not self.model_class:
            return Response({"error": "Configuration missing"}, status=500)
        
        queryset = self.model_class.objects.all()
        serializer = self.list_serializer_class(queryset)
        return Response(serializer.data)

    def create(self, request):
        data_list = request.data

        if not isinstance(data_list, list):
            return Response({"detail": f"Expected a list of {self.value_key}s."}, status=400)

        saved = []
        errors = []

        for data in data_list:
            try:
                range_val = float(data["range"])
                current_val = float(data["current"])
                frequency_val = float(data["frequency"])
                value_raw = data.get(self.value_key)

                value = None
                if value_raw is not None and value_raw != "":
                    value = float(value_raw)

                if value is not None:
                    obj, created = self.model_class.objects.update_or_create(
                        range=range_val,
                        current=current_val,
                        frequency=frequency_val,
                        defaults={self.value_key: value}
                    )
                    saved.append(self.flat_serializer_class(obj).data)
                else:
                    deleted_count, _ = self.model_class.objects.filter(
                        range=range_val,
                        current=current_val,
                        frequency=frequency_val,
                    ).delete()
                    if deleted_count > 0:
                        print(f"Deleted {deleted_count} record(s) for {self.value_key}: {range_val}A, {current_val}A, {frequency_val}Hz")

            except Exception as e:
                errors.append({"input": data, "error": str(e)})

        return Response(
            {"saved": saved, "errors": errors},
            status=status.HTTP_200_OK if not errors else status.HTTP_207_MULTI_STATUS
        )
    
    @action(detail=False, methods=['post'])
    def reset(self, request):
        try:
            file_name = f"{self.value_key}_data.json"
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            file_path = os.path.join(base_dir, file_name)
            
            with open(file_path, 'r') as f:
                revert_data_list = json.load(f)

            json_keys = set()
            for data in revert_data_list:
                json_keys.add((
                    float(data.get('range')),
                    float(data.get('current')),
                    int(data.get('frequency'))
                ))

            updated_count = 0
            created_count = 0
            for data in revert_data_list:
                range_val = str(data.get('range'))
                current_val = str(data.get('current'))
                frequency_val = int(data.get('frequency'))
                value = float(data.get('value'))
                
                _, created = self.model_class.objects.update_or_create(
                    range=range_val,
                    current=current_val,
                    frequency=frequency_val,
                    defaults={self.value_key: value}
                )
                
                if created:
                    created_count += 1
                else:
                    updated_count += 1

            all_db_records = self.model_class.objects.all()
            
            db_keys = set((
                float(obj.range),
                float(obj.current),
                int(obj.frequency)
            ) for obj in all_db_records)

            records_to_delete_keys = db_keys - json_keys
            deleted_count = 0
            
            if records_to_delete_keys:
                for key in records_to_delete_keys:
                    deleted_count += self.model_class.objects.filter(
                        range=key[0],
                        current=key[1],
                        frequency=key[2]
                    ).delete()[0]
                
            return Response(
                {"status": f"Data synchronized successfully. Updated: {updated_count}, Created: {created_count}, Deleted: {deleted_count}"},
                status=status.HTTP_200_OK
            )

        except FileNotFoundError:
            return Response({"error": f"Reset data file '{file_name}' not found."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({"error": f"Failed to reset data: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class BaseDataGroupedViewSet(viewsets.ViewSet):
    model_class = None
    grouped_serializer_class = None

    def list(self, request):
        if not self.grouped_serializer_class or not self.model_class:
            return Response({"error": "Configuration missing"}, status=500)
            
        queryset = self.model_class.objects.all().order_by('range', 'current', 'frequency')
        serializer = self.grouped_serializer_class(queryset)
        return Response(serializer.data)
    
class CorrectionViewSet(BaseDataViewSet):
    model_class = Correction
    list_serializer_class = CorrectionSerializer
    flat_serializer_class = FlatCorrectionSerializer
    value_key = 'correction'

class UncertaintyViewSet(BaseDataViewSet):
    model_class = Uncertainty
    list_serializer_class = UncertaintySerializer
    flat_serializer_class = FlatUncertaintySerializer
    value_key = 'uncertainty'

class CorrectionGroupedViewSet(BaseDataGroupedViewSet):
    model_class = Correction
    grouped_serializer_class = CorrectionGroupedSerializer

class UncertaintyGroupedViewSet(BaseDataGroupedViewSet):
    model_class = Uncertainty
    grouped_serializer_class = UncertaintyGroupedSerializer

class CalibrationSessionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing Calibration Session records.
    """
    queryset = CalibrationSession.objects.all().order_by('-created_at')
    serializer_class = CalibrationSessionSerializer

    @action(detail=True, methods=['post'], url_path='initialize-instruments')
    def initialize_instruments(self, request, pk=None):
        session = self.get_object()
        
        assigned_instruments = [
            ("Standard Reader", session.standard_reader_model, session.standard_reader_address),
            ("Test Reader", session.test_reader_model, session.test_reader_address),
            ("AC Source", "5730A", session.ac_source_address),
            ("DC Source", "5730A", session.dc_source_address),
            ("Switch Driver", session.switch_driver_model, session.switch_driver_address),
            ("Amplifier", "8100", session.amplifier_address),
        ]

        initialized = []
        errors = []

        for role, model, address in assigned_instruments:
            if not model or not address:
                continue

            instrument = None
            try:
                instrument_class = INSTRUMENT_CLASS_MAP.get(model)
                if not instrument_class:
                    raise RuntimeError(f"Unknown instrument model: {model}")

                print(f"Initializing {role} ({model}) at {address}...")
                # Instantiating the class runs its __init__ method, which performs the initialization
                if instrument_class in [Instrument34420A, Instrument11713C]:
                     instrument = instrument_class(gpib=address)
                else:
                     instrument = instrument_class(model=model, gpib=address)
                
                initialized.append(f"{role} ({model})")

            except Exception as e:
                errors.append(f"{role}: {str(e)}")
            finally:
                # Ensure the VISA resource is closed after initialization
                if instrument:
                    connection = getattr(instrument, 'resource', None) or getattr(instrument, 'device', None)
                    if connection and hasattr(connection, 'close'):
                        connection.close()
        
        if errors:
            return Response(
                {"status": "Completed with errors", "initialized": initialized, "errors": errors},
                status=status.HTTP_207_MULTI_STATUS
            )

        return Response(
            {"status": "All assigned instruments initialized successfully.", "initialized": initialized},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['get', 'put'], url_path='information')
    def calibration_handler(self, request, pk=None):
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)

        CalibrationConfigurations.objects.get_or_create(calibration=calibration)
        CalibrationTVCCorrections.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            serializer = CalibrationSerializer(calibration)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationSerializer(calibration, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'put'], url_path='tvc-corrections')
    def calibration_tvc_corrections_handler(self, request, pk=None):
        session = self.get_object()
        calibration, _ = Calibration.objects.get_or_create(session=session)
        tvc_corrections, _ = CalibrationTVCCorrections.objects.get_or_create(calibration=calibration)

        if request.method == 'GET':
            serializer = CalibrationTVCCorrectionsSerializer(tvc_corrections)
            return Response(serializer.data)

        elif request.method == 'PUT':
            serializer = CalibrationTVCCorrectionsSerializer(tvc_corrections, data=request.data, partial=True)
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

                    if existing_results_instance:
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
    
    @action(detail=False, methods=['post'], url_path='actions/apply-settings-to-all')
    def apply_settings_to_all(self, request, session_pk=None):
        settings_data = request.data.get('settings')
        focused_tp_id = request.data.get('focused_test_point_id')

        if not settings_data:
            return Response({"detail": "Settings data is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not focused_tp_id:
            return Response({"detail": "focused_test_point_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            test_point_set = TestPointSet.objects.get(session_id=session_pk)

            # --- FIX START: Identify the focused point AND its sibling ---
            try:
                focused_point = test_point_set.points.get(pk=focused_tp_id)
            except TestPoint.DoesNotExist:
                return Response({"detail": "Focused test point not found in this session."}, status=status.HTTP_404_NOT_FOUND)

            # Find the sibling by matching current and frequency, but excluding the focused point's ID
            sibling_point = test_point_set.points.filter(
                current=focused_point.current,
                frequency=focused_point.frequency
            ).exclude(pk=focused_tp_id).first()

            # Create a set of IDs for the pair that should receive the full settings
            pair_ids = {focused_point.id}
            if sibling_point:
                pair_ids.add(sibling_point.id)
            # --- FIX END ---

            test_points = test_point_set.points.all()
            
            with transaction.atomic():
                for point in test_points:
                    # Check if the current point is part of the focused pair
                    if point.id in pair_ids:
                        # Apply the full, original settings to both members of the pair
                        CalibrationSettings.objects.update_or_create(
                            test_point=point,
                            defaults=settings_data
                        )
                    else:
                        # For all other points, reset the warm-up time
                        settings_for_others = settings_data.copy()
                        settings_for_others['initial_warm_up_time'] = 0
                        CalibrationSettings.objects.update_or_create(
                            test_point=point,
                            defaults=settings_for_others
                        )
            
            return Response({"message": f"Settings applied to {test_points.count()} test points."}, status=status.HTTP_200_OK)

        except TestPointSet.DoesNotExist:
            return Response({"detail": "TestPointSet not found for this session."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": f"An error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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

    @action(detail=True, methods=['post'], url_path='clear-readings')
    def clear_readings(self, request, session_pk=None, pk=None):
        """
        Clears all readings and calculated results for a specific test point.
        """
        try:
            test_point = self.get_queryset().get(pk=pk)
            
            with transaction.atomic():
                # **THE FIX**: Delete the results object entirely.
                if hasattr(test_point, 'results') and test_point.results is not None:
                    test_point.results.delete()

                readings_instance = getattr(test_point, 'readings', None)
                if readings_instance:
                    readings_instance.std_ac_open_readings = []
                    readings_instance.std_dc_pos_readings = []
                    readings_instance.std_dc_neg_readings = []
                    readings_instance.std_ac_close_readings = []
                    readings_instance.ti_ac_open_readings = []
                    readings_instance.ti_dc_pos_readings = []
                    readings_instance.ti_dc_neg_readings = []
                    readings_instance.ti_ac_close_readings = []
                    
                    # Saving the blank readings will trigger the auto-creation
                    # of a fresh, empty CalibrationResults object.
                    readings_instance.save()

            return Response(
                {"message": f"Readings and results for Test Point {pk} have been cleared."},
                status=status.HTTP_200_OK
            )

        except TestPoint.DoesNotExist:
            return Response({"detail": "Test point not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": f"An unexpected error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['put'], url_path='update-results')
    def update_results(self, request, session_pk=None, pk=None):
        try:
            test_point = self.get_queryset().get(pk=pk)
            results = getattr(test_point, 'results', None)

            if not results:
                results, _ = CalibrationResults.objects.get_or_create(test_point=test_point)

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