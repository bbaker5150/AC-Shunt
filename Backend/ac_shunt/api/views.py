# api/views.py
import pyvisa
import re
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.conf import settings
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
import json
import os
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import (
    Message, CalibrationSession, TestPoint, TestPointSet, Calibration, 
    CalibrationConfigurations, CalibrationTVCCorrections, CalibrationSettings, 
    CalibrationReadings, CalibrationResults, Shunt, TVC, BugReport,
    Workstation,
)
from .serializers import (
    MessageSerializer, CalibrationSerializer, CalibrationSessionSerializer, 
    TestPointSerializer, TestPointSetSerializer, 
    CalibrationTVCCorrectionsSerializer, CalibrationConfigurationsSerializer, 
    CalibrationSettingsSerializer, CalibrationReadingsSerializer, 
    CalibrationResultsSerializer, ShuntSerializer, TVCSerializer, BugReportSerializer,
    WorkstationSerializer,
)
from npsl_tools.instruments import (
    Instrument11713C, Instrument3458A, Instrument5730A, Instrument5790B, 
    Instrument34420A, Instrument8100
)


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

    When settings.MOCK_INSTRUMENTS is True the pyvisa path is skipped entirely
    and a deterministic mock inventory is returned instead, so the Instrument
    Status page can be exercised on dev machines with no lab hardware.
    """
    if getattr(settings, "MOCK_INSTRUMENTS", False):
        from .mock_instruments import MOCK_INVENTORY
        instruments = [
            {"address": item["address"], "identity": item["identity"]}
            for item in MOCK_INVENTORY
        ]
        print(f"[MOCK] Returning {len(instruments)} mock instruments.")
        return JsonResponse({
            "instruments": instruments,
            "local_ip": request.META.get("REMOTE_ADDR"),
        })

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

class ShuntViewSet(viewsets.ModelViewSet):
    queryset = Shunt.objects.prefetch_related('corrections').all()
    serializer_class = ShuntSerializer

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # Pretty print the first item to see its structure and data types
        if response.data:
            import json
            # print(json.dumps(response.data[0], indent=2))
        return response

class TVCViewSet(viewsets.ModelViewSet):
    queryset = TVC.objects.prefetch_related('corrections').all()
    serializer_class = TVCSerializer

    # --- ADDED: Logging for debugging ---
    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if response.data:
            import json
        #     print(json.dumps(response.data[0], indent=2))
        # print("------------------------------------------------\n")
        return response

class WorkstationViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only list/retrieve for the session-setup dropdown.

    CRUD on Workstation rows is intentionally kept in the Django admin —
    workstations are rarely-edited reference data (think: "Bench 3" gets
    renamed once, maybe; a new bench is added once a year) and gating
    edits behind admin keeps accidental misconfiguration off the hot path.
    The frontend only needs to list active benches, which this endpoint
    serves with the attached claim snapshot so the picker can render
    claim status in one round trip.
    """

    # select_related('claim') avoids N+1 in the list endpoint by pulling the
    # OneToOne reverse side in the same SELECT.
    queryset = (
        Workstation.objects
        .filter(is_active=True)
        .select_related('claim', 'claim__active_session')
        .order_by('name')
    )
    serializer_class = WorkstationSerializer


class BugReportViewSet(viewsets.ModelViewSet):
    queryset = BugReport.objects.all().order_by('-created_at')
    serializer_class = BugReportSerializer

    def get_queryset(self):
        qs = BugReport.objects.all().order_by('-created_at')
        # Cap list payload for the in-app browser (newest first).
        if getattr(self, 'action', None) == 'list':
            return qs[:200]
        return qs

    def get_permissions(self):
        # Lab clients are often unauthenticated; full in-app CRUD from the desktop UI.
        return [AllowAny()]

class CalibrationViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing Calibration records, which link together
    all aspects of a calibration for a given session.
    """
    queryset = Calibration.objects.all()
    serializer_class = CalibrationSerializer

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
        
def _broadcast_test_point_sync(session_pk, message):
    """Push a ``connection_sync`` event to every socket in the session group.

    Remote viewers key off this to re-fetch the session's test-point data so
    their sidebar status dots, completion badges, and charts stay in sync
    with host-side edits that bypass the calibration WebSocket pipeline
    (e.g. clear readings, delete point, append points from the REST API).
    Host sockets simply no-op on the refresh since they already know the
    change they just made.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f'session_{session_pk}',
            {
                'type': 'connection_sync',
                'is_complete': False,
                'message': message,
            },
        )
    except Exception as e:
        # Broadcast is best-effort — surface the error in logs but don't fail
        # the HTTP request the host is waiting on.
        print(f"[sync] Failed to broadcast test-point change: {e}", flush=True)


class TestPointViewSet(viewsets.ModelViewSet):
    serializer_class = TestPointSerializer

    def get_queryset(self):
        return TestPoint.objects.filter(test_point_set__session_id=self.kwargs['session_pk'])

    def perform_create(self, serializer):
        session = CalibrationSession.objects.get(pk=self.kwargs['session_pk'])
        test_point_set = TestPointSet.objects.get(session=session)
        serializer.save(test_point_set=test_point_set)
        _broadcast_test_point_sync(self.kwargs['session_pk'], 'Test point added.')

    def perform_destroy(self, instance):
        session_pk = self.kwargs['session_pk']
        instance.delete()
        _broadcast_test_point_sync(session_pk, 'Test point deleted.')
    
    @action(detail=True, methods=['post'], url_path='mark-readings-stability')
    def mark_readings_stability(self, request, session_pk=None, pk=None):
        """
        Marks a range of readings for a specific measurement type as stable or unstable.
        """
        try:
            reading_key = request.data.get('reading_key')
            start_index = request.data.get('start_index')
            end_index = request.data.get('end_index')
            is_stable = request.data.get('is_stable')

            if not all([reading_key, start_index, end_index, is_stable is not None]):
                return Response(
                    {"detail": "Missing required fields: reading_key, start_index, end_index, is_stable."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            test_point = self.get_queryset().get(pk=pk)
            readings = getattr(test_point, 'readings', None)
            
            if not readings:
                return Response(
                    {"detail": "No readings object found for this test point."},
                    status=status.HTTP_404_NOT_FOUND
                )

            reading_list = getattr(readings, reading_key, None)

            if not isinstance(reading_list, list):
                return Response(
                    {"detail": f"Reading key '{reading_key}' not found or is not a list."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Convert 1-based user index to 0-based python index
            start = int(start_index) - 1
            end = int(end_index) # Slice end is exclusive, so user's 'end' is correct
            
            if start < 0 or end > len(reading_list) or start >= end:
                return Response(
                    {"detail": "Invalid start/end index range."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            modified_count = 0
            with transaction.atomic():
                for i in range(start, end):
                    if isinstance(reading_list[i], dict):
                        reading_list[i]['is_stable'] = bool(is_stable)
                        modified_count += 1
                    # Handle legacy data that might just be values (optional, but good practice)
                    elif isinstance(reading_list[i], (int, float)):
                        # This data point has no timestamp or stable flag, so we can't update it.
                        # Or, we could convert it, but that might be out of scope.
                        # For now, we just skip it.
                        pass
                
                setattr(readings, reading_key, reading_list)
                readings.save(update_fields=[reading_key])
                
                # CRITICAL: Recalculate averages after changing stability
                readings.update_related_results()

            return Response(
                {"message": f"Successfully updated {modified_count} readings as {'stable' if is_stable else 'unstable'} and recalculated averages."},
                status=status.HTTP_200_OK
            )

        except TestPoint.DoesNotExist:
            return Response({"detail": "Test point not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": f"An unexpected error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='actions/apply-settings-to-all')
    def apply_settings_to_all(self, request, session_pk=None):
        full_settings_data = request.data.get('settings')
        focused_tp_id = request.data.get('focused_test_point_id')

        if not full_settings_data or not focused_tp_id:
            return Response({"detail": "Both 'settings' and 'focused_test_point_id' are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            test_point_set = TestPointSet.objects.get(session_id=session_pk)
            
            # Identify the focused point to determine its current/frequency pair AND direction
            focused_point = test_point_set.points.get(pk=focused_tp_id)
            focused_key = (focused_point.current, focused_point.frequency)

            # Settings payload for the specific focused point (contains the user-defined warm-up time)
            full_warmup_settings = full_settings_data.copy()

            # Common settings payload for all other points (force warm-up to 0)
            common_settings_data = full_settings_data.copy()
            common_settings_data['initial_warm_up_time'] = 0

            # Get all unique (current, frequency) pairs for the session
            unique_points = test_point_set.points.values('current', 'frequency').distinct()
            
            with transaction.atomic():
                for point_key in unique_points:
                    current = point_key['current']
                    frequency = point_key['frequency']
                    
                    is_focused_pair = (current, frequency) == focused_key

                    # Default both directions to use the "0s warmup" settings
                    forward_settings = common_settings_data
                    reverse_settings = common_settings_data

                    # If this is the pair the user is editing, apply the full warmup to the CORRECT direction
                    if is_focused_pair:
                        if focused_point.direction == 'Forward':
                            forward_settings = full_warmup_settings
                        elif focused_point.direction == 'Reverse':
                            reverse_settings = full_warmup_settings

                    # 1. Handle the 'Forward' direction
                    forward_point_obj, _ = TestPoint.objects.get_or_create(
                        test_point_set=test_point_set,
                        current=current,
                        frequency=frequency,
                        direction='Forward'
                    )
                    CalibrationSettings.objects.update_or_create(
                        test_point=forward_point_obj,
                        defaults=forward_settings
                    )

                    # 2. Handle the 'Reverse' direction
                    reverse_point_obj, _ = TestPoint.objects.get_or_create(
                        test_point_set=test_point_set,
                        current=current,
                        frequency=frequency,
                        direction='Reverse'
                    )
                    CalibrationSettings.objects.update_or_create(
                        test_point=reverse_point_obj,
                        defaults=reverse_settings
                    )
            
            return Response({"message": "Settings successfully applied to all test points and directions."}, status=status.HTTP_200_OK)

        except TestPointSet.DoesNotExist:
            return Response({"detail": "TestPointSet not found for this session."}, status=status.HTTP_404_NOT_FOUND)
        except TestPoint.DoesNotExist:
            return Response({"detail": "Focused test point not found in this session."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"detail": f"An unexpected error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='actions/update-order')
    def update_order(self, request, session_pk=None):
        """
        Receives an ordered list of test point keys and updates the 'order'
        field for both Forward and Reverse directions of each point.
        """
        ordered_keys = request.data.get('ordered_keys', [])

        if not ordered_keys:
            return Response({"detail": "An ordered list of keys is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            test_point_set = TestPointSet.objects.get(session_id=session_pk)
            with transaction.atomic():
                for index, key in enumerate(ordered_keys):
                    current_str, frequency_str = key.split('-')
                    # Update both Forward and Reverse points for the given key
                    test_point_set.points.filter(
                        current=current_str,
                        frequency=frequency_str
                    ).update(order=index)

            return Response({"message": "Test point order updated successfully."}, status=status.HTTP_200_OK)

        except TestPointSet.DoesNotExist:
            return Response({"detail": "TestPointSet not found for this session."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": f"An error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'], url_path='append')
    def append_points(self, request, session_pk=None):
        """
        Creates new test points for the session and broadcasts a sync message to update the UI.
        """
        points_data = request.data.get('points', [])
        try:
            tp_set, created_tp_set = TestPointSet.objects.get_or_create(session_id=session_pk)
            existing = tp_set.points.values_list('current', 'frequency', 'direction')
            existing_set = { (str(c), f, d) for c, f, d in existing }
            
            points_to_create = []
            for point in points_data:
                key = (
                    str(point.get('current')), 
                    point.get('frequency'), 
                    point.get('direction')
                )
                
                if key not in existing_set:
                    points_to_create.append(
                        TestPoint(test_point_set=tp_set, **point)
                    )
                    existing_set.add(key) 
            
            if points_to_create:
                TestPoint.objects.bulk_create(points_to_create)

                # --- BROADCAST SYNC TO FRONTEND ---
                # This ensures the Sidebar and Main views refresh automatically via WebSockets
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'session_{session_pk}',
                    {
                        'type': 'connection_sync',
                        'is_complete': False,
                        'message': 'Test points appended.'
                    }
                )

            return Response(
                {"message": f"Added {len(points_to_create)} new test point(s)."},
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
        _broadcast_test_point_sync(session_pk, 'All test points cleared.')
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
                # 1. Reset the failure flag so the UI clears the red border
                test_point.is_stability_failed = False
                test_point.save(update_fields=['is_stability_failed'])

                # 2. Safely delete results if they exist (avoids RelatedObjectDoesNotExist exception)
                CalibrationResults.objects.filter(test_point=test_point).delete()

                # 3. Clear all readings arrays
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
                    readings_instance.save()

            _broadcast_test_point_sync(session_pk, 'Readings cleared.')

            return Response(
                {"message": f"Readings and results for Test Point {pk} have been cleared."},
                status=status.HTTP_200_OK
            )

        except TestPoint.DoesNotExist:
            return Response({"detail": "Test point not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": f"An unexpected error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='calculate-averages')
    def calculate_averages(self, request, session_pk=None, pk=None):
        """
        Manually triggers the calculation of averages for a specific test point's readings.
        This should be called after all raw readings for the point have been collected.
        """
        print(f"[DEBUG - Views] Endpoint '/calculate-averages/' hit for TestPoint ID: {pk}")
        try:
            test_point = self.get_queryset().get(pk=pk)
            readings = getattr(test_point, 'readings', None)

            if not readings:
                return Response(
                    {"detail": "No readings found for this test point to calculate."}, 
                    status=status.HTTP_404_NOT_FOUND
                )

            # Manually trigger the calculation method from the model
            readings.update_related_results()

            # Return the newly calculated and saved results
            results_serializer = CalibrationResultsSerializer(test_point.results)
            return Response(results_serializer.data, status=status.HTTP_200_OK)

        except TestPoint.DoesNotExist:
            return Response({"detail": "Test point not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": f"An error occurred during calculation: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['put'], url_path='update-results')
    def update_results(self, request, session_pk=None, pk=None):
        try:
            test_point = self.get_queryset().get(pk=pk)
            results = getattr(test_point, 'results', None)

            if not results:
                results, _ = CalibrationResults.objects.get_or_create(test_point=test_point)

            serializer = CalibrationResultsSerializer(results, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            saved_results = serializer.save()
            saved_results.calculate_ac_dc_difference()

            return Response(CalibrationResultsSerializer(saved_results).data, status=status.HTTP_200_OK)

        except TestPoint.DoesNotExist:
            return Response({"detail": "Test point not found."}, status=status.HTTP_404_NOT_FOUND)
                        
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)

        return Response({
            "calibration_session_id": int(self.kwargs['session_pk']),
            "test_points": serializer.data
        })

@api_view(['GET'])
def system_info(request):
    """
    Returns basic system information, such as the active database engine and
    the current state of the local write outbox (buffered stage-save rows and
    whether the default DB is reachable right now).
    """
    db_engine = settings.DATABASES['default']['ENGINE'].split('.')[-1]
    db_name = str(settings.DATABASES['default']['NAME'])

    # Outbox snapshot — imported lazily so a broken outbox can't take down
    # this lightweight endpoint.
    pending_count = 0
    failed_count = 0
    reachable = True
    try:
        from .outbox import (
            get_pending_count_sync,
            get_failed_count_sync,
            probe_default_reachable,
        )
        pending_count = get_pending_count_sync()
        failed_count = get_failed_count_sync()
        reachable = probe_default_reachable()
    except Exception as e:
        print(f"system_info: outbox snapshot failed: {e}")

    return JsonResponse({
        "database_type": db_engine,
        "database_name": db_name,
        "outbox": {
            "pending_count": pending_count,
            "failed_count": failed_count,
            "reachable": reachable,
        },
    })