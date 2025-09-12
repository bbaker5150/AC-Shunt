import re
from rest_framework import serializers
from .models import (
    Message, Shunt, ShuntCorrection, TVC, TVCCorrection, 
    CalibrationSession, TestPoint, TestPointSet, Calibration, 
    CalibrationTVCCorrections, CalibrationConfigurations, CalibrationSettings, 
    CalibrationReadings, CalibrationResults
)
from datetime import datetime


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'text', 'created_at']

# ==============================================================================
#  NEW Serializers for Correction Data
#  (Replaces the old BaseDataSerializer, CorrectionSerializer, etc.)
# ==============================================================================

class ShuntCorrectionSerializer(serializers.ModelSerializer):
    """ Serializes a single correction point for a Shunt. """
    class Meta:
        model = ShuntCorrection
        fields = ['frequency', 'correction', 'uncertainty']

class ShuntSerializer(serializers.ModelSerializer):
    corrections = ShuntCorrectionSerializer(many=True, read_only=True)
    size = serializers.SerializerMethodField()

    class Meta:
        model = Shunt
        fields = ['id', 'serial_number', 'range', 'current', 'remark', 'size', 'corrections']
    
    def get_size(self, obj):
        """
        Parses the 'remarks' field to extract the shunt size.
        e.g., from "A40B-10mA sn 450274734", it extracts "10mA".
        """
        if obj.remark:
            match = re.search(r'-(\S+?)\s+sn', obj.remark)
            if match:
                return match.group(1)
        return None

class TVCCorrectionSerializer(serializers.ModelSerializer):
    """ Serializes a single correction point for a TVC. """
    class Meta:
        model = TVCCorrection
        fields = ['frequency', 'ac_dc_difference', 'expanded_uncertainty']

class TVCSerializer(serializers.ModelSerializer):
    """ Serializes a TVC device and nests all its correction points. """
    corrections = TVCCorrectionSerializer(many=True, read_only=True)

    class Meta:
        model = TVC
        fields = ['serial_number', 'test_voltage', 'corrections']

# ==============================================================================
#  Existing Serializers (Preserved from your original file)
# ==============================================================================

class CalibrationSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationSession
        fields = [
            'id', 'session_name', 'test_instrument_model', 'test_instrument_serial',
            'test_reader_model', 'test_reader_address', 'standard_instrument_model',
            'standard_instrument_serial', 'standard_reader_model', 'standard_reader_address',
            'ac_source_address', 'dc_source_address', 'switch_driver_address',
            'switch_driver_model', 'amplifier_address', 'temperature', 'humidity',
            'created_at', 'notes', 'standard_tvc_serial', 'test_tvc_serial',
        ]

class CalibrationTVCCorrectionsSerializer(serializers.ModelSerializer):
    Standard = serializers.DictField(required=False)
    Test = serializers.DictField(required=False)

    class Meta:
        model = CalibrationTVCCorrections
        fields = ['Standard', 'Test']

    def to_representation(self, instance):
        corrections = instance.corrections_data or {}
        return {
            "Standard": corrections.get("Standard", {}),
            "Test": corrections.get("Test", {}),
        }

    def update(self, instance, validated_data):
        corrections = {
            "Standard": validated_data.get("Standard", {}),
            "Test": validated_data.get("Test", {}),
        }
        instance.corrections_data = corrections
        instance.save()
        return instance

class CalibrationConfigurationsSerializer(serializers.ModelSerializer):
    test_point = serializers.PrimaryKeyRelatedField(read_only=True)
    class Meta:
        model = CalibrationConfigurations
        fields = '__all__'

class CalibrationSettingsSerializer(serializers.ModelSerializer):
    test_point = serializers.PrimaryKeyRelatedField(read_only=True)
    class Meta:
        model = CalibrationSettings
        exclude = ['id']

class FormattedReadingsField(serializers.Field):
    """ Custom serializer field to add a human-readable timestamp. """
    def to_representation(self, value):
        if not isinstance(value, list):
            return value
        
        formatted_readings = []
        for point in value:
            if isinstance(point, dict) and 'timestamp' in point:
                point['timestamp_formatted'] = datetime.fromtimestamp(point['timestamp']).strftime('%Y-%m-%d %H:%M:%S')
            formatted_readings.append(point)
        return formatted_readings

class CalibrationReadingsSerializer(serializers.ModelSerializer):
    test_point = serializers.PrimaryKeyRelatedField(read_only=True)
    std_ac_open_readings = FormattedReadingsField()
    std_dc_pos_readings = FormattedReadingsField()
    std_dc_neg_readings = FormattedReadingsField()
    std_ac_close_readings = FormattedReadingsField()
    ti_ac_open_readings = FormattedReadingsField()
    ti_dc_pos_readings = FormattedReadingsField()
    ti_dc_neg_readings = FormattedReadingsField()
    ti_ac_close_readings = FormattedReadingsField()

    class Meta:
        model = CalibrationReadings
        fields = '__all__'

class CalibrationResultsSerializer(serializers.ModelSerializer):
    test_point = serializers.PrimaryKeyRelatedField(read_only=True)
    class Meta:
        model = CalibrationResults
        fields = '__all__'

class TestPointSerializer(serializers.ModelSerializer):
    settings = CalibrationSettingsSerializer(required=False)
    readings = CalibrationReadingsSerializer(required=False)
    results = CalibrationResultsSerializer(required=False)
    class Meta:
        model = TestPoint
        fields = ['id', 'current', 'frequency', 'direction', 'settings', 'readings', 'results']
    
    def update(self, instance, validated_data):
        settings_data = validated_data.pop('settings', None)
        if settings_data:
            CalibrationSettings.objects.update_or_create(test_point=instance, defaults=settings_data)

        readings_data = validated_data.pop('readings', None)
        if readings_data:
            CalibrationReadings.objects.update_or_create(test_point=instance, defaults=readings_data)

        results_data = validated_data.pop('results', None)
        if results_data:
            CalibrationResults.objects.update_or_create(test_point=instance, defaults=results_data)

        return super().update(instance, validated_data)

class TestPointSetSerializer(serializers.ModelSerializer):
    points = TestPointSerializer(many=True) 

    class Meta:
        model = TestPointSet
        fields = '__all__'
        
    def _handle_nested_one_to_one(self, parent_instance, field_name, nested_data, nested_serializer_class, nested_model_class):
        if nested_data is not None:
            nested_instance = getattr(parent_instance, field_name, None) 
            if nested_instance:
                nested_serializer = nested_serializer_class(nested_instance, data=nested_data, partial=True)
            else:
                nested_serializer = nested_serializer_class(data=nested_data)
            nested_serializer.is_valid(raise_exception=True)
            nested_serializer.save(**{parent_instance._meta.model_name: parent_instance})

    def update(self, instance, validated_data):
        points_data = validated_data.pop('points', [])
        existing_test_points = {tp.id: tp for tp in instance.points.all()}
        
        for point_data in points_data:
            point_id = point_data.get('id')
            settings_data = point_data.pop('settings', None)
            readings_data = point_data.pop('readings', None)
            results_data = point_data.pop('results', None)

            if point_id and point_id in existing_test_points:
                test_point_instance = existing_test_points[point_id]
                test_point_serializer = TestPointSerializer(test_point_instance, data=point_data, partial=True)
                test_point_serializer.is_valid(raise_exception=True)
                test_point_instance = test_point_serializer.save()
                self._handle_nested_one_to_one(test_point_instance, 'settings', settings_data, CalibrationSettingsSerializer, CalibrationSettings)
                self._handle_nested_one_to_one(test_point_instance, 'readings', readings_data, CalibrationReadingsSerializer, CalibrationReadings)
                self._handle_nested_one_to_one(test_point_instance, 'results', results_data, CalibrationResultsSerializer, CalibrationResults)
            else:
                test_point_serializer = TestPointSerializer(data=point_data, partial=True)
                test_point_serializer.is_valid(raise_exception=True)
                test_point_instance = test_point_serializer.save(test_point_set=instance) 
                if settings_data: CalibrationSettings.objects.create(test_point=test_point_instance, **settings_data)
                if readings_data: CalibrationReadings.objects.create(test_point=test_point_instance, **readings_data)
                if results_data: CalibrationResults.objects.create(test_point=test_point_instance, **results_data)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save() 
        return instance 

class CalibrationSerializer(serializers.ModelSerializer):
    tvc_corrections = CalibrationTVCCorrectionsSerializer(source='tvccorrections', required=False, allow_null=True)
    configurations = CalibrationConfigurationsSerializer(required=False, allow_null=True)
    test_points = serializers.SerializerMethodField()

    class Meta:
        model = Calibration
        fields = ['id', 'session', 'tvc_corrections', 'configurations', 'test_points']

    def get_test_points(self, obj):
        try:
            session = obj.session
            test_point_set = TestPointSet.objects.get(session=session)
            return TestPointSetSerializer(test_point_set).data
        except TestPointSet.DoesNotExist:
            return None
        except Exception:
            return None

    def update(self, instance, validated_data):
        tvc_corrections_data = validated_data.pop('tvccorrections', None)
        configurations_data = validated_data.pop('configurations', None)
        instance.session = validated_data.get('session', instance.session)
        instance.save()

        if tvc_corrections_data is not None:
            tvc_corrections_instance, _ = CalibrationTVCCorrections.objects.get_or_create(calibration=instance)
            tvc_corrections_serializer = CalibrationTVCCorrectionsSerializer(tvc_corrections_instance, data=tvc_corrections_data, partial=True)
            if tvc_corrections_serializer.is_valid(raise_exception=True):
                tvc_corrections_serializer.save()

        if configurations_data is not None:
            configurations_instance, _ = CalibrationConfigurations.objects.get_or_create(calibration=instance)
            configurations_serializer = CalibrationConfigurationsSerializer(configurations_instance, data=configurations_data, partial=True)
            if configurations_serializer.is_valid(raise_exception=True):
                configurations_serializer.save()

        return instance