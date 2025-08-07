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
    # Standard Instrument (The actual device being used as a reference, e.g., A40B Shunt)
    standard_instrument_model = models.CharField(max_length=100, blank=True, null=True)
    standard_instrument_serial = models.CharField(max_length=100, blank=True, null=True)
    
    # Standard Reader (The instrument reading the standard, e.g., 3458A)
    standard_reader_model = models.CharField(max_length=100, blank=True, null=True)
    standard_reader_address = models.CharField(max_length=100, blank=True, null=True)

    # Test Instrument (The Unit Under Test, e.g., another A40B Shunt)
    test_instrument_model = models.CharField(max_length=100, blank=True, null=True)
    test_instrument_serial = models.CharField(max_length=100, blank=True, null=True)

    # Test Instrument Reader (The instrument reading the UUT, e.g., 5790B)
    test_reader_model = models.CharField(max_length=100, blank=True, null=True)
    test_reader_address = models.CharField(max_length=100, blank=True, null=True)
    
    # AC/DC Source Addresses
    ac_source_address = models.CharField(max_length=100, blank=True, null=True)
    dc_source_address = models.CharField(max_length=100, blank=True, null=True)

    # Switch Driver Addresses
    switch_driver_address = models.CharField(max_length=100, blank=True, null=True)
    switch_driver_model = models.CharField(max_length=100, blank=True, null=True)
    
    temperature = models.FloatField(null=True, blank=True, help_text="Temperature in °C")
    humidity = models.FloatField(null=True, blank=True, help_text="Relative Humidity in %RH")
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.session_name} (Recorded: {self.created_at.strftime('%Y-%m-%d %H:%M')})"

    class Meta:
        ordering = ['-created_at']


class Calibration(models.Model):
    session = models.OneToOneField(
        CalibrationSession,
        related_name='calibration',
        on_delete=models.CASCADE
    )

class Correction(models.Model):
    range = models.FloatField()
    current = models.FloatField()
    frequency = models.IntegerField()
    correction = models.FloatField(null=True, blank=True)
    class Meta:
        unique_together = ('range', 'current', 'frequency')

    def __str__(self):
        return f"ID: {self.id} | Range: {self.range}, Current: {self.current}, Frequency: {self.frequency}, Correction: {self.correction}"
    
class Uncertainty(models.Model):
    range = models.FloatField()
    current = models.FloatField()
    frequency = models.IntegerField()
    uncertainty = models.FloatField(null=True, blank=True)
    class Meta:
        unique_together = ('range', 'current', 'frequency')

    def __str__(self):
        return f"ID: {self.id} | Range: {self.range}, Current: {self.current}, Frequency: {self.frequency}, Uncertainty: {self.uncertainty}"
    
class TestPointSet(models.Model):
    session = models.OneToOneField(
        CalibrationSession,
        on_delete=models.CASCADE,
        related_name='test_point_set'
    )

    def __str__(self):
        return f"TestPointSet for Session: {self.session.session_name}"

class TestPoint(models.Model):
    DIRECTION_CHOICES = [
        ('Forward', 'Forward'),
        ('Reverse', 'Reverse'),
    ]
    test_point_set = models.ForeignKey(
        TestPointSet,
        on_delete=models.CASCADE,
        related_name='points'
    )
    current = models.DecimalField(max_digits=10, decimal_places=5)
    frequency = models.IntegerField()
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default='Forward')

    def __str__(self):
        return f"ID: {self.id} | {self.direction} | Current: {self.current}, Frequency: {self.frequency}"
    
    class Meta:
        # Ensure a test point is unique for a given current, frequency, and direction within a set
        unique_together = ('test_point_set', 'current', 'frequency', 'direction')
        ordering = ['frequency', 'current', 'direction']

class CalibrationTVCCorrections(models.Model):
    calibration = models.OneToOneField(
        Calibration,
        related_name='tvccorrections',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    corrections_data = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"TVC Corrections for {self.calibration.session.name if self.calibration and self.calibration.session else 'N/A'}"
    

class CalibrationConfigurations(models.Model):
    calibration = models.OneToOneField(
        Calibration, 
        related_name='configurations',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    ac_shunt_range = models.FloatField(null=True, blank=True)
    amplifier_range = models.FloatField(null=True, blank=True)
    tvc_upper_limit = models.FloatField(null=True, blank=True)
    
class CalibrationSettings(models.Model):
    test_point = models.OneToOneField(
        TestPoint, 
        related_name='settings',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    initial_warm_up_time = models.IntegerField(null=True, blank=True)
    num_samples = models.IntegerField(default=8, null=True, blank=True)
    settling_time = models.IntegerField(default=5, null=True, blank=True)

class CalibrationReadings(models.Model):

    test_point = models.OneToOneField(
        TestPoint,
        related_name='readings',
        on_delete=models.CASCADE,
        null=True,
        blank=True
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
        return f"Calibration Readings for TestPoint ID: {self.test_point.id} | Session: {self.test_point.test_point_set.session.session_name}"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.update_related_results()

    def update_related_results(self):
        results, _ = CalibrationResults.objects.get_or_create(test_point=self.test_point)
        
        def calculate_stats(readings):
            if not readings or len(readings) == 0:
                return None, None
            
            # Check if the first item is a dictionary (new format) or a number (old format)
            if isinstance(readings[0], dict) and 'value' in readings[0]:
                # Extract just the 'value' from each dictionary
                numeric_values = [r.get('value') for r in readings]
                return np.mean(numeric_values), np.std(numeric_values)
            else:
                # Handle the old format (list of numbers) for backward compatibility
                return np.mean(readings), np.std(readings)

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
    test_point = models.OneToOneField(
        TestPoint,
        related_name='results',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    
    # ... (existing fields for stats and corrections) ...
    std_ac_open_avg = models.FloatField(null=True, blank=True)
    std_ac_open_stddev = models.FloatField(null=True, blank=True)
    std_dc_pos_avg = models.FloatField(null=True, blank=True)
    std_dc_pos_stddev = models.FloatField(null=True, blank=True)
    std_dc_neg_avg = models.FloatField(null=True, blank=True)
    std_dc_neg_stddev = models.FloatField(null=True, blank=True)
    std_ac_close_avg = models.FloatField(null=True, blank=True)
    std_ac_close_stddev = models.FloatField(null=True, blank=True)
    
    ti_ac_open_avg = models.FloatField(null=True, blank=True)
    ti_ac_open_stddev = models.FloatField(null=True, blank=True)
    ti_dc_pos_avg = models.FloatField(null=True, blank=True)
    ti_dc_pos_stddev = models.FloatField(null=True, blank=True)
    ti_dc_neg_avg = models.FloatField(null=True, blank=True)
    ti_dc_neg_stddev = models.FloatField(null=True, blank=True)
    ti_ac_close_avg = models.FloatField(null=True, blank=True)
    ti_ac_close_stddev = models.FloatField(null=True, blank=True)

    eta_std = models.FloatField(null=True, blank=True, help_text="Gain factor for Standard instrument system")
    eta_ti = models.FloatField(null=True, blank=True, help_text="Gain factor for Test Instrument system")
    delta_std = models.FloatField(null=True, blank=True, help_text="Known AC-DC difference of the Standard TVC in PPM")
    delta_ti = models.FloatField(null=True, blank=True, help_text="Known AC-DC difference of the TI TVC in PPM")
    delta_std_known = models.FloatField(null=True, blank=True, help_text="Known AC-DC difference of the Standard Shunt in PPM")

    delta_uut_ppm = models.FloatField(null=True, blank=True, help_text="Final calculated UUT AC-DC difference in PPM -> Forward or Revers")
    delta_uut_ppm_avg = models.FloatField(null=True, blank=True, help_text="Final averaged UUT AC-DC difference in PPM")

    # Calculated Uncertainty Budget
    combined_uncertainty = models.FloatField(null=True, blank=True, help_text="Calculated combined standard uncertainty (uc) in PPM")
    effective_dof = models.FloatField(null=True, blank=True, help_text="Calculated effective degrees of freedom (veff)")
    k_value = models.FloatField(null=True, blank=True, help_text="Calculated coverage factor (k)")
    expanded_uncertainty = models.FloatField(null=True, blank=True, help_text="Calculated expanded uncertainty (U) in PPM")
    is_detailed_uncertainty_calculated = models.BooleanField(default=False)
    
    # NEW FIELD to store the manual uncertainty components
    manual_uncertainty_components = models.JSONField(default=list, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Calibration Results for {self.test_point.test_point_set.session.session_name} at Test Point {self.test_point.id}" if self.test_point else "Calibration Results (no test point)"

class Correction(models.Model):
    range = models.FloatField()
    current = models.FloatField()
    frequency = models.IntegerField()
    correction = models.FloatField(null=True, blank=True)
    class Meta:
        unique_together = ('range', 'current', 'frequency')

    def __str__(self):
        return f"ID: {self.id} | Range: {self.range}, Current: {self.current}, Frequency: {self.frequency}, Correction: {self.correction}"
    
class Uncertainty(models.Model):
    range = models.FloatField()
    current = models.FloatField()
    frequency = models.IntegerField()
    uncertainty = models.FloatField(null=True, blank=True)
    class Meta:
        unique_together = ('range', 'current', 'frequency')

    def __str__(self):
        return f"ID: {self.id} | Range: {self.range}, Current: {self.current}, Frequency: {self.frequency}, Uncertainty: {self.uncertainty}"