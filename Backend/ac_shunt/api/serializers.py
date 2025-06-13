# api/serializers.py
from rest_framework import serializers
from .models import Message, CalibrationSession, TestPointSet

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
        fields = ('id', 'session', 'points', 'ac_shunt_range', 'tvc_upper_limit', 'updated_at')
