# api/serializers.py
from rest_framework import serializers
from .models import Message, DMMMeasurement, MeasurementSet, CalibrationSession, TestPointSet

class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'text', 'created_at']

class DMMMeasurementSerializer(serializers.ModelSerializer):
    class Meta:
        model = DMMMeasurement
        # Include measurement_set ID so you know which set it belongs to
        fields = ['id', 'value', 'timestamp', 'measurement_set']

class MeasurementSetSerializer(serializers.ModelSerializer):
    # Optional: If you want to include all measurements when fetching a set
    # measurements = DMMMeasurementSerializer(many=True, read_only=True)
    # Or just count them
    measurement_count = serializers.IntegerField(source='measurements.count', read_only=True)

    class Meta:
        model = MeasurementSet
        fields = ['id', 'name', 'created_at', 'description', 'measurement_count']
        # If including nested measurements:
        # fields = ['id', 'name', 'created_at', 'description', 'measurements']

class CalibrationSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalibrationSession
        fields = [ # List all fields you want to expose via the API
            'id', 'session_name',
            'test_instrument_model', 'test_instrument_serial',
            'standard_instrument_model', 'standard_instrument_serial',
            'temperature', 'humidity', 'created_at', 'notes',
        ]
        # 'read_only_fields = ['id', 'created_at'] # id and created_at are typically read-only

class TestPointSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestPointSet
        fields = ('id', 'session', 'points', 'ac_shunt_range', 'tvc_upper_limit', 'updated_at')