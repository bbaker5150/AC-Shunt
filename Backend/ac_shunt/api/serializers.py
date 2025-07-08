# api/serializers.py
from rest_framework import serializers
from .models import Message, CalibrationSession, TestPointSet, CalibrationSettings, CalibrationResults, CalibrationReadings, Calibration

class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'text', 'created_at']

class CalibrationSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationSession
        fields = [
            'id', 'session_name',
            'test_instrument_model', 'test_instrument_serial', 'test_instrument_address',
            'standard_instrument_model', 'standard_instrument_serial', 'standard_instrument_address',
            'ac_source_address', 'dc_source_address',
            'temperature', 'humidity', 'created_at', 'notes',
        ]

class TestPointSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestPointSet
        fields = ('id', 'session', 'points')

class CalibrationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationSettings
        fields = ['initial_warm_up_time', 'num_samples', 'ac_shunt_range', 'tvc_upper_limit']

class CalibrationReadingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationReadings
        fields = '__all__'

class CalibrationResultsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationResults
        fields = '__all__'
        # Note: eta_std, eta_ti, and delta_std_known are NOT read_only, so they can be updated.
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'calibration', 
            'std_ac_open_avg', 'std_ac_open_stddev', 'std_dc_pos_avg', 'std_dc_pos_stddev', 
            'std_dc_neg_avg', 'std_dc_neg_stddev', 'std_ac_close_avg', 'std_ac_close_stddev', 
            'ti_ac_open_avg', 'ti_ac_open_stddev', 'ti_dc_pos_avg', 'ti_dc_pos_stddev', 
            'ti_dc_neg_avg', 'ti_dc_neg_stddev', 'ti_ac_close_avg', 'ti_ac_close_stddev'
        ]


class CalibrationSerializer(serializers.ModelSerializer):
    
    settings = CalibrationSettingsSerializer()
    readings = CalibrationReadingsSerializer()
    results = CalibrationResultsSerializer(required=False)

    class Meta:
        model = Calibration
        fields = ['session', 'settings', 'readings', 'results']

    def update(self, instance, validated_data):
        settings_data = validated_data.pop('settings', {})
        results_data = validated_data.pop('results', {})
        readings_data = validated_data.pop('readings', {})

        instance.session = validated_data.get('session', instance.session)
        instance.save()

        # Update or create CalibrationSettings
        settings_instance, _ = CalibrationSettings.objects.get_or_create(calibration=instance)
        for attr, value in settings_data.items():
            setattr(settings_instance, attr, value)
        settings_instance.save()

        # Update or create CalibrationReadings
        readings_instance, _ = CalibrationReadings.objects.get_or_create(calibration=instance)
        for attr, value in readings_data.items():
            setattr(readings_instance, attr, value)
        readings_instance.save()

        # Update or create CalibrationResults
        results_instance, _ = CalibrationResults.objects.get_or_create(calibration=instance)
        for attr, value in results_data.items():
            setattr(results_instance, attr, value)
        results_instance.save()

        return instance