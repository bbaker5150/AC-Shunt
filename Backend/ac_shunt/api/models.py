# Backend/ac_shunt/api/models.py
from django.db import models
import uuid # For generating unique IDs for sets, or use auto-incrementing PK

# Default name generator specifically for MeasurementSet
def get_default_measurement_set_name():
    return f"MeasurementSet-{uuid.uuid4().hex[:8]}" # Added prefix here

# Default name generator specifically for CalibrationSession
def get_default_cal_session_name():
    return f"CalSession-{uuid.uuid4().hex[:8]}"

class Message(models.Model): # Your existing model
    text = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return self.text

class MeasurementSet(models.Model):
    name = models.CharField(
        max_length=255,
        unique=True,
        default=get_default_measurement_set_name # Use the specific named function
    )
    created_at = models.DateTimeField(auto_now_add=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} (created at {self.created_at.strftime('%Y-%m-%d %H:%M:%S')})"

    class Meta:
        ordering = ['-created_at']

class DMMMeasurement(models.Model):
    measurement_set = models.ForeignKey(
        MeasurementSet,
        related_name='measurements',
        on_delete=models.CASCADE
    )
    value = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Reading: {self.value} for Set: {self.measurement_set.name} at {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"

    class Meta:
        ordering = ['timestamp']

class CalibrationSession(models.Model):
    session_name = models.CharField(
        max_length=255,
        unique=True,
        default=get_default_cal_session_name
    )
    test_instrument_model = models.CharField(max_length=100, blank=True, null=True)
    test_instrument_serial = models.CharField(max_length=100, blank=True, null=True)
    standard_instrument_model = models.CharField(max_length=100, blank=True, null=True)
    standard_instrument_serial = models.CharField(max_length=100, blank=True, null=True)
    temperature = models.FloatField(null=True, blank=True, help_text="Temperature in °C")
    humidity = models.FloatField(null=True, blank=True, help_text="Relative Humidity in %RH")
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.session_name} (Recorded: {self.created_at.strftime('%Y-%m-%d %H:%M')})"

    class Meta:
        ordering = ['-created_at']

class TestPointSet(models.Model):
    """Represents a single set of calibration test points for a session."""
    session = models.OneToOneField(
        CalibrationSession,
        related_name='test_point_set',
        on_delete=models.CASCADE
    )
    # This field stores the entire list of points as a single JSON object.
    points = models.JSONField(default=list)
    ac_shunt_range = models.FloatField(null=True, blank=True)
    tvc_upper_limit = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Test Point Set for Session: {self.session.session_name}"

    class Meta:
        ordering = ['created_at']