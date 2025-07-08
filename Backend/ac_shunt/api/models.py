# Backend/ac_shunt/api/models.py
from django.db import models
import uuid
import numpy as np

def get_default_cal_session_name():
    return f"CalSession-{uuid.uuid4().hex[:8]}"

class Message(models.Model):
    text = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return self.text

class CalibrationSession(models.Model):
    session_name = models.CharField(
        max_length=255,
        unique=True,
        default=get_default_cal_session_name
    )
    # Standard Instrument
    standard_instrument_model = models.CharField(max_length=100, blank=True, null=True)
    standard_instrument_serial = models.CharField(max_length=100, blank=True, null=True)
    standard_instrument_address = models.CharField(max_length=100, blank=True, null=True)
    # Test Instrument
    test_instrument_model = models.CharField(max_length=100, blank=True, null=True)
    test_instrument_serial = models.CharField(max_length=100, blank=True, null=True)
    test_instrument_address = models.CharField(max_length=100, blank=True, null=True)
    
    # AC/DC Source Addresses
    ac_source_address = models.CharField(max_length=100, blank=True, null=True)
    dc_source_address = models.CharField(max_length=100, blank=True, null=True)
    
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
        related_name='test_points',
        on_delete=models.CASCADE
    )
    points = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Test Point Set for Session: {self.session.session_name}"

    class Meta:
        ordering = ['created_at']

class Calibration(models.Model):
    session = models.OneToOneField(
        CalibrationSession,
        related_name='calibration',
        on_delete=models.CASCADE
    )

class CalibrationSettings(models.Model):
    calibration = models.OneToOneField(
        Calibration, 
        related_name='settings', # This makes it accessible as calibration.settings
        on_delete=models.CASCADE
    )
    initial_warm_up_time = models.IntegerField(null=True, blank=True)
    num_samples = models.IntegerField(default=8, null=True, blank=True)
    ac_shunt_range = models.FloatField(null=True, blank=True)
    tvc_upper_limit = models.FloatField(null=True, blank=True)

class CalibrationReadings(models.Model):

    calibration = models.OneToOneField(
        Calibration,
        related_name='readings', # This makes it accessible as calibration.readings
        on_delete=models.CASCADE
    )
    # Standard Instrument Readings
    std_ac_open_readings = models.JSONField(default=list, blank=True, null=True)
    std_dc_pos_readings = models.JSONField(default=list, blank=True, null=True)
    std_dc_neg_readings = models.JSONField(default=list, blank=True, null=True)
    std_ac_close_readings = models.JSONField(default=list, blank=True, null=True)

    # Test Instrument Readings
    ti_ac_open_readings = models.JSONField(default=list, blank=True, null=True)
    ti_dc_pos_readings = models.JSONField(default=list, blank=True, null=True)
    ti_dc_neg_readings = models.JSONField(default=list, blank=True, null=True)
    ti_ac_close_readings = models.JSONField(default=list, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Calibration Readings for {self.calibration.session.session_name}"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.update_related_results()

    def update_related_results(self):
        results, _ = CalibrationResults.objects.get_or_create(calibration=self.calibration)
        
        def calculate_stats(readings):
            if readings and len(readings) > 0:
                return np.mean(readings), np.std(readings)
            return None, None

        results.std_ac_open_avg, results.std_ac_open_stddev = calculate_stats(self.std_ac_open_readings)
        results.std_dc_pos_avg, results.std_dc_pos_stddev = calculate_stats(self.std_dc_pos_readings)
        results.std_dc_neg_avg, results.std_dc_neg_stddev = calculate_stats(self.std_dc_neg_readings)
        results.std_ac_close_avg, results.std_ac_close_stddev = calculate_stats(self.std_ac_close_readings)

        results.ti_ac_open_avg, results.ti_ac_open_stddev = calculate_stats(self.ti_ac_open_readings)
        results.ti_dc_pos_avg, results.ti_dc_pos_stddev = calculate_stats(self.ti_dc_pos_readings)
        results.ti_dc_neg_avg, results.ti_dc_neg_stddev = calculate_stats(self.ti_dc_neg_readings)
        results.ti_ac_close_avg, results.ti_ac_close_stddev = calculate_stats(self.ti_ac_close_readings)

        results.save()


class CalibrationResults(models.Model):
    calibration = models.OneToOneField(
        Calibration,
        related_name='results',
        on_delete=models.CASCADE
    )
    
    # Standard Readings Stats
    std_ac_open_avg = models.FloatField(null=True, blank=True)
    std_ac_open_stddev = models.FloatField(null=True, blank=True)
    std_dc_pos_avg = models.FloatField(null=True, blank=True)
    std_dc_pos_stddev = models.FloatField(null=True, blank=True)
    std_dc_neg_avg = models.FloatField(null=True, blank=True)
    std_dc_neg_stddev = models.FloatField(null=True, blank=True)
    std_ac_close_avg = models.FloatField(null=True, blank=True)
    std_ac_close_stddev = models.FloatField(null=True, blank=True)
    
    # Test Instrument Readings Stats
    ti_ac_open_avg = models.FloatField(null=True, blank=True)
    ti_ac_open_stddev = models.FloatField(null=True, blank=True)
    ti_dc_pos_avg = models.FloatField(null=True, blank=True)
    ti_dc_pos_stddev = models.FloatField(null=True, blank=True)
    ti_dc_neg_avg = models.FloatField(null=True, blank=True)
    ti_dc_neg_stddev = models.FloatField(null=True, blank=True)
    ti_ac_close_avg = models.FloatField(null=True, blank=True)
    ti_ac_close_stddev = models.FloatField(null=True, blank=True)

    # User-provided correction factors
    eta_std = models.FloatField(null=True, blank=True, help_text="Gain factor for Standard instrument system")
    eta_ti = models.FloatField(null=True, blank=True, help_text="Gain factor for Test Instrument system")
    delta_std_known = models.FloatField(null=True, blank=True, help_text="Known AC-DC difference of the Standard Shunt in PPM")

    # Final Result
    delta_uut_ppm = models.FloatField(null=True, blank=True, help_text="Final calculated UUT AC-DC difference in PPM")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Calibration Results for {self.calibration.session.session_name}"