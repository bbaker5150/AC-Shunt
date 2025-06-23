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
            'test_instrument_model', 'test_instrument_serial',
            'standard_instrument_model', 'standard_instrument_serial',
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
        read_only_fields = ['id', 'created_at', 'updated_at', 'calibration']

class CalibrationSerializer(serializers.ModelSerializer):
    
    settings = CalibrationSettingsSerializer()
    readings = CalibrationReadingsSerializer()
    results = CalibrationResultsSerializer(required=False) # Make it optional for PUT operations if not always sent

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

