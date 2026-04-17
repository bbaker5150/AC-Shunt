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
    
    # TVC Serials
    standard_tvc_serial = models.CharField(max_length=100, blank=True, null=True)
    test_tvc_serial = models.CharField(max_length=100, blank=True, null=True)
    
    # Standard Reader (The instrument reading the standard, e.g., 3458A)
    standard_reader_model = models.CharField(max_length=100, blank=True, null=True)
    standard_reader_serial = models.CharField(max_length=100, blank=True, null=True)
    standard_reader_address = models.CharField(max_length=100, blank=True, null=True)

    # Test Instrument (The Unit Under Test, e.g., another A40B Shunt)
    test_instrument_model = models.CharField(max_length=100, blank=True, null=True)
    test_instrument_serial = models.CharField(max_length=100, blank=True, null=True)

    # Test Instrument Reader (The instrument reading the UUT, e.g., 5790B)
    test_reader_model = models.CharField(max_length=100, blank=True, null=True)
    test_reader_serial = models.CharField(max_length=100, blank=True, null=True)
    test_reader_address = models.CharField(max_length=100, blank=True, null=True)
    
    # AC/DC Source Addresses
    ac_source_serial = models.CharField(max_length=100, blank=True, null=True)
    dc_source_serial = models.CharField(max_length=100, blank=True, null=True)
    ac_source_address = models.CharField(max_length=100, blank=True, null=True)
    dc_source_address = models.CharField(max_length=100, blank=True, null=True)

    # Switch Driver Addresses
    switch_driver_address = models.CharField(max_length=100, blank=True, null=True)
    switch_driver_model = models.CharField(max_length=100, blank=True, null=True)
    switch_driver_serial = models.CharField(max_length=100, blank=True, null=True)

    # Amplifier Address
    amplifier_address = models.CharField(max_length=255, null=True, blank=True)
    amplifier_serial = models.CharField(max_length=255, null=True, blank=True)
    
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
    order = models.IntegerField(default=0, help_text="Custom sort order for the test point pair")
    is_stability_failed = models.BooleanField(default=False)

    def __str__(self):
        return f"ID: {self.id} | {self.direction} | Current: {self.current}, Frequency: {self.frequency}"
    
    class Meta:
        # Ensure a test point is unique for a given current, frequency, and direction within a set
        unique_together = ('test_point_set', 'current', 'frequency', 'direction')
        ordering = ['order', 'frequency', 'current', 'direction']

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
    
class CalibrationSettings(models.Model):
    test_point = models.OneToOneField(
        TestPoint, 
        related_name='settings',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    STABILITY_CHOICES = [
        ('sliding_window', 'Sliding Window'),
        ('iqr_filter', 'IQR Filter'),
    ]
    stability_check_method = models.CharField(
        max_length=20,
        choices=STABILITY_CHOICES,
        default='sliding_window'
    )
    
    initial_warm_up_time = models.IntegerField(null=True, blank=True)
    num_samples = models.IntegerField(default=35, null=True, blank=True)
    settling_time = models.IntegerField(default=120, null=True, blank=True)
    nplc = models.FloatField(default=20, null=True, blank=True, help_text="Integration time in Power Line Cycles for 34420A")
    stability_window = models.IntegerField(default=30, null=True, blank=True)
    stability_threshold_ppm = models.FloatField(default=10, null=True, blank=True)
    stability_max_attempts = models.IntegerField(default=10, null=True, blank=True)
    iqr_filter_enabled = models.BooleanField(default=False)
    iqr_filter_ppm_threshold = models.FloatField(default=15.0, null=True, blank=True)
    ignore_instability_after_lock = models.BooleanField(default=False)

class CalibrationReadings(models.Model):

    test_point = models.OneToOneField(
        TestPoint,
        related_name='readings',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    
    # --- Standard Instrument Readings ---
    std_ac_open_readings = models.JSONField(default=list, blank=True, null=True)
    std_dc_pos_readings = models.JSONField(default=list, blank=True, null=True)
    std_dc_neg_readings = models.JSONField(default=list, blank=True, null=True)
    std_ac_close_readings = models.JSONField(default=list, blank=True, null=True)

    # --- Test Instrument Readings ---
    ti_ac_open_readings = models.JSONField(default=list, blank=True, null=True)
    ti_dc_pos_readings = models.JSONField(default=list, blank=True, null=True)
    ti_dc_neg_readings = models.JSONField(default=list, blank=True, null=True)
    ti_ac_close_readings = models.JSONField(default=list, blank=True, null=True)

    # --- TVC Sensitivity Characterization Readings ---
    std_char_plus1_readings = models.JSONField(default=list, blank=True, null=True)
    std_char_minus_readings = models.JSONField(default=list, blank=True, null=True)
    std_char_plus2_readings = models.JSONField(default=list, blank=True, null=True)

    ti_char_plus1_readings = models.JSONField(default=list, blank=True, null=True)
    ti_char_minus_readings = models.JSONField(default=list, blank=True, null=True)
    ti_char_plus2_readings = models.JSONField(default=list, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Calibration Readings for TestPoint ID: {self.test_point.id} | Session: {self.test_point.test_point_set.session.session_name}"

    def update_related_results(self):
        print(f"\n[MODELS] --- Starting Result Calculation for TP ID {self.test_point.id} ---", flush=True)
        results, _ = CalibrationResults.objects.get_or_create(test_point=self.test_point)
        
        def calculate_stats(readings, label="Reading"):
            import math
            if not readings:
                return None, None
            
            stable_values = [
                r['value'] for r in readings
                if isinstance(r, dict) and r.get('is_stable', True)
            ]

            # Fallback if no stable readings exist
            if len(stable_values) < 2:
                print(f"[MODELS - {label}] Warning: < 2 stable readings. Using all {len(readings)} readings as fallback.", flush=True)
                all_values = [r['value'] for r in readings if isinstance(r, dict) and 'value' in r]
                
                if len(all_values) < 2:
                    print(f"[MODELS - {label}] Insufficient readings to calculate stats. Aborting.", flush=True)
                    return None, None
                stable_values = all_values

            # Welford's Algorithm for strict parity with Frontend/Excel
            mean_val = 0.0
            M2 = 0.0
            for index, val in enumerate(stable_values):
                delta = val - mean_val
                mean_val += delta / (index + 1)
                M2 += delta * (val - mean_val)

            variance = M2 / (len(stable_values) - 1)
            std_dev = math.sqrt(variance)
            
            print(f"[MODELS - {label}] Calculated from {len(stable_values)} points: Mean = {mean_val:.6f}, StdDev = {std_dev:.6e}", flush=True)
            return mean_val, std_dev

        # --- 1. Standard Averages Update ---
        print("[MODELS] Calculating Standard Instrument AC/DC Averages...", flush=True)
        results.std_ac_open_avg, results.std_ac_open_stddev = calculate_stats(self.std_ac_open_readings, "STD AC Open")
        results.std_dc_pos_avg, results.std_dc_pos_stddev = calculate_stats(self.std_dc_pos_readings, "STD DC Pos")
        results.std_dc_neg_avg, results.std_dc_neg_stddev = calculate_stats(self.std_dc_neg_readings, "STD DC Neg")
        results.std_ac_close_avg, results.std_ac_close_stddev = calculate_stats(self.std_ac_close_readings, "STD AC Close")

        print("[MODELS] Calculating Test Instrument AC/DC Averages...", flush=True)
        results.ti_ac_open_avg, results.ti_ac_open_stddev = calculate_stats(self.ti_ac_open_readings, "TI AC Open")
        results.ti_dc_pos_avg, results.ti_dc_pos_stddev = calculate_stats(self.ti_dc_pos_readings, "TI DC Pos")
        results.ti_dc_neg_avg, results.ti_dc_neg_stddev = calculate_stats(self.ti_dc_neg_readings, "TI DC Neg")
        results.ti_ac_close_avg, results.ti_ac_close_stddev = calculate_stats(self.ti_ac_close_readings, "TI AC Close")

        # --- 2. TVC Characterization Averages ---
        print("[MODELS] Calculating TVC Characterization Averages...", flush=True)
        std_char_plus1_avg, _ = calculate_stats(self.std_char_plus1_readings, "STD Char +500ppm (1)")
        std_char_minus_avg, _ = calculate_stats(self.std_char_minus_readings, "STD Char -500ppm")
        std_char_plus2_avg, _ = calculate_stats(self.std_char_plus2_readings, "STD Char +500ppm (2)")

        ti_char_plus1_avg, _ = calculate_stats(self.ti_char_plus1_readings, "TI Char +500ppm (1)")
        ti_char_minus_avg, _ = calculate_stats(self.ti_char_minus_readings, "TI Char -500ppm")
        ti_char_plus2_avg, _ = calculate_stats(self.ti_char_plus2_readings, "TI Char +500ppm (2)")

        # --- 3. Eta (η) Calculation ---
        def calculate_eta(v_out_1, v_out_2, v_out_3, label="Unknown"):
            print(f"[MODELS - ETA CALC - {label}] Checking variables: v1={v_out_1}, v2={v_out_2}, v3={v_out_3}", flush=True)
            if None in [v_out_1, v_out_2, v_out_3] or v_out_2 == 0: 
                print(f"[MODELS - ETA CALC - {label}] Missing or invalid data. Skipping calculation.", flush=True)
                return None
            
            denominator = 0.00100050025 
            numerator = ((v_out_1 + v_out_3) / (2 * v_out_2)) - 1
            calculated_eta = numerator / denominator
            
            print(f"[MODELS - ETA CALC - {label}] Math Execution:", flush=True)
            print(f"   -> Numerator: (( {v_out_1} + {v_out_3} ) / (2 * {v_out_2})) - 1 = {numerator}", flush=True)
            print(f"   -> Denominator: 0.00100050025", flush=True)
            print(f"   -> Final Gain (eta): {calculated_eta}", flush=True)
            return calculated_eta

        # Helper to save global TVC gain
        def save_global_tvc_gain(tvc_serial, gain_val):
            if not tvc_serial or gain_val is None: 
                print(f"[MODELS - GLOBAL SAVE] Skipping save. Serial: {tvc_serial}, Gain: {gain_val}", flush=True)
                return
            try:
                # Find the TVC by serial
                tvc_obj = TVC.objects.get(serial_number=tvc_serial)
                tp = self.test_point
                # Create or update the specific gain profile for this current/freq
                TVCSensitivity.objects.update_or_create(
                    tvc=tvc_obj,
                    current=float(tp.current),
                    frequency=tp.frequency,
                    defaults={'gain_eta': gain_val}
                )
                print(f"[MODELS - GLOBAL SAVE] SUCCESS: Saved Gain {gain_val} to global TVC SN {tvc_serial} for TP {tp.current}A @ {tp.frequency}Hz.", flush=True)
            except TVC.DoesNotExist:
                print(f"[MODELS - GLOBAL SAVE] ERROR: TVC SN {tvc_serial} not found in global DB. Gain not saved globally.", flush=True)

        session = self.test_point.test_point_set.session

        new_eta_std = calculate_eta(std_char_plus1_avg, std_char_minus_avg, std_char_plus2_avg, "STD TVC")
        if new_eta_std is not None:
            if results.eta_std is None or abs(results.eta_std - new_eta_std) > 1e-9:
                results.eta_std = new_eta_std
                print(f"[MODELS] Triggering global save for STD Gain {new_eta_std}...", flush=True)
                save_global_tvc_gain(session.standard_tvc_serial, new_eta_std)
            else:
                print(f"[MODELS] STD Gain unchanged ({results.eta_std}). Skipping global save.", flush=True)

        new_eta_ti = calculate_eta(ti_char_plus1_avg, ti_char_minus_avg, ti_char_plus2_avg, "TI TVC")
        if new_eta_ti is not None:
            if results.eta_ti is None or abs(results.eta_ti - new_eta_ti) > 1e-9:
                results.eta_ti = new_eta_ti
                print(f"[MODELS] Triggering global save for TI Gain {new_eta_ti}...", flush=True)
                save_global_tvc_gain(session.test_tvc_serial, new_eta_ti)
            else:
                print(f"[MODELS] TI Gain unchanged ({results.eta_ti}). Skipping global save.", flush=True)

        results.save()
        print(f"[MODELS] --- Result Calculation Complete ---", flush=True)

class CalibrationResults(models.Model):
    test_point = models.OneToOneField(
        TestPoint,
        related_name='results',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    
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

    combined_uncertainty = models.FloatField(null=True, blank=True, help_text="Calculated combined standard uncertainty (uc) in PPM")
    effective_dof = models.FloatField(null=True, blank=True, help_text="Calculated effective degrees of freedom (veff)")
    k_value = models.FloatField(null=True, blank=True, help_text="Calculated coverage factor (k)")
    expanded_uncertainty = models.FloatField(null=True, blank=True, help_text="Calculated expanded uncertainty (U) in PPM")
    is_detailed_uncertainty_calculated = models.BooleanField(default=False)
    
    manual_uncertainty_components = models.JSONField(default=list, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Calibration Results for {self.test_point.test_point_set.session.session_name} at Test Point {self.test_point.id}" if self.test_point else "Calibration Results (no test point)"
    
class Shunt(models.Model):
    """
    Represents a single AC Shunt device at a specific range and current.
    """
    model_name = models.CharField(max_length=100, default='Shunt')
    serial_number = models.CharField(max_length=100)
    range = models.FloatField()
    current = models.FloatField()
    remark = models.CharField(max_length=255, blank=True, null=True)
    is_manual = models.BooleanField(default=False)

    class Meta:
        unique_together = ('serial_number', 'range', 'current')

    def __str__(self):
        return f"{self.model_name} SN: {self.serial_number} ({self.range}A / {self.current}A)"


class ShuntCorrection(models.Model):
    """
    Stores a single correction/uncertainty point for a specific Shunt.
    """
    shunt = models.ForeignKey(Shunt, on_delete=models.CASCADE, related_name='corrections')
    frequency = models.IntegerField()
    correction = models.FloatField(null=True, blank=True)
    uncertainty = models.FloatField(null=True, blank=True)

    class Meta:
        unique_together = ('shunt', 'frequency')


class TVC(models.Model):
    """
    Represents a single Thermal Voltage Converter device.
    """
    serial_number = models.IntegerField(unique=True)
    test_voltage = models.FloatField()
    is_manual = models.BooleanField(default=False)

    def __str__(self):
        return f"TVC Device SN: {self.serial_number}"

class TVCSensitivity(models.Model):
    """
    Stores the characterized Gain (η) for a specific TVC at a specific test point.
    """
    tvc = models.ForeignKey(TVC, on_delete=models.CASCADE, related_name='sensitivities')
    current = models.FloatField()
    frequency = models.FloatField()
    gain_eta = models.FloatField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('tvc', 'current', 'frequency')

    def __str__(self):
        return f"TVC {self.tvc.serial_number} Gain: {self.gain_eta} at {self.current}A, {self.frequency}Hz"


class TVCCorrection(models.Model):
    """
    Stores a single correction point for a specific TVC device.
    """
    tvc = models.ForeignKey(TVC, on_delete=models.CASCADE, related_name='corrections')
    frequency = models.IntegerField()
    ac_dc_difference = models.IntegerField()
    expanded_uncertainty = models.IntegerField()

    class Meta:
        unique_together = ('tvc', 'frequency')