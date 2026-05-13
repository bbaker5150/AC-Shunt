# Backend/ac_shunt/api/models.py
from django.db import models
from django.core.validators import MinValueValidator
import math
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

    # Physical bench the run happens on. Nullable so every pre-existing
    # session (and single-user Electron installs that never touch the
    # concept) keeps working unchanged; unset sessions implicitly resolve
    # to Workstation.get_default() at request time.
    workstation = models.ForeignKey(
        'Workstation',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sessions',
    )

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
    # When true, reverse-pair Fwd_i with Rev_{N+1-i} (cancels linear drift).
    # When false, pair Fwd_i with Rev_i. Operator-toggleable for testing.
    use_abba_pairing = models.BooleanField(
        default=True,
        help_text=(
            "When true, reverse-pair Fwd_i with Rev_{N+1-i} so linear drift "
            "across the run cancels. When false, index-pair Fwd_i with Rev_i. "
            "Toggle for testing/comparison."
        ),
    )
    
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
    characterize_test_first = models.BooleanField(default=False)
    characterization_source = models.CharField(max_length=10, default="DC")
    enable_low_frequency_settings = models.BooleanField(default=False)
    lf_harmonic_projection = models.BooleanField(default=False)
    enable_11hz_filter = models.BooleanField(default=True)
    min_low_freq_settling_time = models.IntegerField(default=0, null=True, blank=True)
    lf_harmonics = models.IntegerField(default=2, null=True, blank=True)

    # Number of full AC-DC measurement cycles to repeat at this test point.
    # Required for Type A statistical uncertainty: u_A = s(delta_i) / sqrt(N),
    # which is meaningful only with N >= 2. Default = 3 to give 2 degrees of
    # freedom while keeping run time reasonable.
    n_cycles = models.PositiveIntegerField(
        default=3,
        validators=[MinValueValidator(2)],
        help_text="Number of full AC-DC cycles to average per test point (>= 2).",
    )


# ---------------------------------------------------------------------------
# Pure math helpers — extracted so the per-cycle finalizer in
# CalibrationConsumer can compute δ for a single cycle's phase averages
# without duplicating the formula, and so a CalibrationResults row can
# reuse the same code in `calculate_ac_dc_difference`. The frontend has a
# parallel copy in `sessionExcelExport.js:calcFullyCorrectedStandard` —
# any change here must be mirrored there.
# ---------------------------------------------------------------------------
def welford_mean_stddev(values):
    """Return (mean, sample_stddev) for an iterable of floats using Welford's
    one-pass algorithm. Returns (None, None) if fewer than 2 values.
    """
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return (None, None)
    mean_val = 0.0
    M2 = 0.0
    for index, val in enumerate(vals):
        delta = val - mean_val
        mean_val += delta / (index + 1)
        M2 += delta * (val - mean_val)
    variance = M2 / (len(vals) - 1)
    return (mean_val, math.sqrt(variance))


def compute_delta_uut_ppm(phase_avgs, eta_std, eta_ti, delta_std, delta_ti, delta_std_known):
    """Compute the per-cycle (or aggregate) UUT AC-DC difference in ppm.

    `phase_avgs` is a dict with the 8 keys: std_ac_open_avg, std_dc_pos_avg,
    std_dc_neg_avg, std_ac_close_avg, ti_ac_open_avg, ti_dc_pos_avg,
    ti_dc_neg_avg, ti_ac_close_avg. Any None → returns None.

    Returns float ppm or None.
    """
    required = (
        'std_dc_pos_avg', 'std_dc_neg_avg', 'std_ac_open_avg', 'std_ac_close_avg',
        'ti_dc_pos_avg', 'ti_dc_neg_avg', 'ti_ac_open_avg', 'ti_ac_close_avg',
    )
    if any(phase_avgs.get(k) is None for k in required):
        return None
    eta_std = eta_std if eta_std is not None else 1.0
    eta_ti = eta_ti if eta_ti is not None else 1.0
    delta_std = delta_std if delta_std is not None else 0.0
    delta_ti = delta_ti if delta_ti is not None else 0.0
    delta_std_known = delta_std_known if delta_std_known is not None else 0.0

    try:
        V_DCSTD = (abs(phase_avgs['std_dc_pos_avg']) + abs(phase_avgs['std_dc_neg_avg'])) / 2
        V_ACSTD = (abs(phase_avgs['std_ac_open_avg']) + abs(phase_avgs['std_ac_close_avg'])) / 2
        V_DCUUT = (abs(phase_avgs['ti_dc_pos_avg']) + abs(phase_avgs['ti_dc_neg_avg'])) / 2
        V_ACUUT = (abs(phase_avgs['ti_ac_open_avg']) + abs(phase_avgs['ti_ac_close_avg'])) / 2

        term_STD = ((V_ACSTD - V_DCSTD) * 1_000_000) / (eta_std * V_DCSTD)
        term_UUT = ((V_ACUUT - V_DCUUT) * 1_000_000) / (eta_ti * V_DCUUT)

        return delta_std_known + term_STD - term_UUT + delta_std - delta_ti
    except ZeroDivisionError:
        return None


def aggregate_cycle_deltas(cycle_deltas):
    """Given a list of per-cycle δ values, return (mean, type_a_uncertainty)
    where type_a = s / √N. Returns (None, None) if fewer than 2 numeric
    entries.
    """
    nums = [d for d in cycle_deltas if d is not None]
    if len(nums) < 2:
        return (None, None)
    mean_val, std_dev = welford_mean_stddev(nums)
    if mean_val is None:
        return (None, None)
    return (mean_val, std_dev / math.sqrt(len(nums)))


def aggregate_paired_cycles(fwd_deltas, rev_deltas, use_abba=True):
    """Pair Fwd and Rev cycle δ values and roll up to the AC-DC pair
    aggregate (mean, u_A).

    Two pairing modes:

    - ``use_abba=True`` (default, NIST/NPL standard): reverse pairing —
      Fwd_i is paired with Rev_{N+1-i}. All paired midpoint times collapse
      to the same instant, which fully cancels any linear-in-time drift
      contribution to ``s`` (and therefore to u_A). Strongly preferred.
    - ``use_abba=False``: index pairing — Fwd_i with Rev_i. Simpler, but
      linear drift across the run inflates ``s``. Exposed via a session-
      level checkbox for side-by-side comparison.

    Returns ``(mean_pair_delta_ppm, type_a_ppm, n_used)`` or
    ``(None, None, 0)`` when the two lists do not have matched non-null
    lengths ≥ 2 (we need at least 2 paired deltas to define ``s``).
    """
    fwd = [d for d in (fwd_deltas or []) if d is not None]
    rev = [d for d in (rev_deltas or []) if d is not None]
    n = min(len(fwd), len(rev))
    if n < 2:
        return (None, None, n)
    if use_abba:
        paired = [(fwd[i] + rev[n - 1 - i]) / 2 for i in range(n)]
    else:
        paired = [(fwd[i] + rev[i]) / 2 for i in range(n)]
    mean_val, std_dev = welford_mean_stddev(paired)
    if mean_val is None:
        return (None, None, n)
    return (mean_val, std_dev / math.sqrt(n), n)


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
        # print(f"\n[MODELS] --- Starting Result Calculation for TP ID {self.test_point.id} ---", flush=True)
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
                # print(f"[MODELS - {label}] Warning: < 2 stable readings. Using all {len(readings)} readings as fallback.", flush=True)
                all_values = [r['value'] for r in readings if isinstance(r, dict) and 'value' in r]
                
                if len(all_values) < 2:
                    # print(f"[MODELS - {label}] Insufficient readings to calculate stats. Aborting.", flush=True)
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
            
            # print(f"[MODELS - {label}] Calculated from {len(stable_values)} points: Mean = {mean_val:.6f}, StdDev = {std_dev:.6e}", flush=True)
            return mean_val, std_dev

        # --- 1. Standard Averages Update ---
        # print("[MODELS] Calculating Standard Instrument AC/DC Averages...", flush=True)
        results.std_ac_open_avg, results.std_ac_open_stddev = calculate_stats(self.std_ac_open_readings, "STD AC Open")
        results.std_dc_pos_avg, results.std_dc_pos_stddev = calculate_stats(self.std_dc_pos_readings, "STD DC Pos")
        results.std_dc_neg_avg, results.std_dc_neg_stddev = calculate_stats(self.std_dc_neg_readings, "STD DC Neg")
        results.std_ac_close_avg, results.std_ac_close_stddev = calculate_stats(self.std_ac_close_readings, "STD AC Close")

        print("[MODELS] Calculating Test Instrument AC/DC Averages...", flush=True)
        results.ti_ac_open_avg, results.ti_ac_open_stddev = calculate_stats(self.ti_ac_open_readings, "TI AC Open")
        results.ti_dc_pos_avg, results.ti_dc_pos_stddev = calculate_stats(self.ti_dc_pos_readings, "TI DC Pos")
        results.ti_dc_neg_avg, results.ti_dc_neg_stddev = calculate_stats(self.ti_dc_neg_readings, "TI DC Neg")
        results.ti_ac_close_avg, results.ti_ac_close_stddev = calculate_stats(self.ti_ac_close_readings, "TI AC Close")

        # --- 2 & 3. TVC Characterization Averages & Eta (η) Calculation ---
        # ONLY run this if characterization readings actually exist
        has_std_char = bool(self.std_char_plus1_readings and self.std_char_minus_readings and self.std_char_plus2_readings)
        has_ti_char = bool(self.ti_char_plus1_readings and self.ti_char_minus_readings and self.ti_char_plus2_readings)

        if has_std_char or has_ti_char:
            print("[MODELS] Characterization data detected. Calculating Averages and Eta...", flush=True)

            def calculate_eta(v_out_1, v_out_2, v_out_3, label="Unknown"):
                if None in [v_out_1, v_out_2, v_out_3] or v_out_2 == 0: 
                    return None
                denominator = 0.00100050025 
                numerator = ((v_out_1 + v_out_3) / (2 * v_out_2)) - 1
                return numerator / denominator

            # NOTE: The characterized gain (η) is intentionally stored ONLY on the
            # per-point CalibrationResults row (and propagated to in-session
            # siblings by consumers._propagate_characterization_eta). Historically
            # we also wrote to the global TVCSensitivity table here, but that
            # table was session-agnostic and would silently leak a newer
            # session's characterization into older sessions if anything ever
            # read from it. Session isolation is now enforced by keeping η
            # strictly per-session on CalibrationResults.

            # Process Standard TVC Characterization
            if has_std_char:
                std_char_plus1_avg, _ = calculate_stats(self.std_char_plus1_readings, "STD Char +500ppm (1)")
                std_char_minus_avg, _ = calculate_stats(self.std_char_minus_readings, "STD Char -500ppm")
                std_char_plus2_avg, _ = calculate_stats(self.std_char_plus2_readings, "STD Char +500ppm (2)")

                new_eta_std = calculate_eta(std_char_plus1_avg, std_char_minus_avg, std_char_plus2_avg, "STD TVC")
                if new_eta_std is not None and (results.eta_std is None or abs(results.eta_std - new_eta_std) > 1e-9):
                    results.eta_std = new_eta_std

            # Process Test Instrument TVC Characterization
            if has_ti_char:
                ti_char_plus1_avg, _ = calculate_stats(self.ti_char_plus1_readings, "TI Char +500ppm (1)")
                ti_char_minus_avg, _ = calculate_stats(self.ti_char_minus_readings, "TI Char -500ppm")
                ti_char_plus2_avg, _ = calculate_stats(self.ti_char_plus2_readings, "TI Char +500ppm (2)")

                new_eta_ti = calculate_eta(ti_char_plus1_avg, ti_char_minus_avg, ti_char_plus2_avg, "TI TVC")
                if new_eta_ti is not None and (results.eta_ti is None or abs(results.eta_ti - new_eta_ti) > 1e-9):
                    results.eta_ti = new_eta_ti

        # --- 4. Final Save and Math Trigger ---
        results.save()
        results.calculate_ac_dc_difference()
        print(f"[MODELS] --- Result Calculation Complete ---", flush=True)

class CalibrationResults(models.Model):
    test_point = models.OneToOneField(
        TestPoint,
        related_name='results',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    
    def fetch_automatic_corrections(self):
        """Automatically fetches DB correction factors if they haven't been manually set."""
        session = self.test_point.test_point_set.session
        target_freq = float(self.test_point.frequency)
        target_current = float(self.test_point.current)

        # 1. Shunt Correction
        if self.delta_std_known is None and session.standard_instrument_serial:
            cal_config = getattr(session.calibration, 'configurations', None)
            if cal_config and cal_config.ac_shunt_range:
                from .models import Shunt
                try:
                    shunt = Shunt.objects.get(
                        serial_number=session.standard_instrument_serial, 
                        range=cal_config.ac_shunt_range, 
                        current=target_current
                    )
                    corr = shunt.corrections.filter(frequency=target_freq).first()
                    if corr:
                        self.delta_std_known = corr.correction
                except Shunt.DoesNotExist:
                    pass

        # 2. TVC Interpolation Logic
        def get_tvc_corr(serial):
            if not serial: return None
            from .models import TVC
            try:
                tvc = TVC.objects.get(serial_number=serial)
                corrs = list(tvc.corrections.all().order_by('frequency'))
                if not corrs: return None
                
                # Exact Match
                for c in corrs:
                    if float(c.frequency) == target_freq: return c.ac_dc_difference
                
                # Interpolation / Extrapolation
                sorted_corrs = sorted(corrs, key=lambda x: x.frequency)
                if target_freq < 1000:
                    next_corr = next((c for c in sorted_corrs if c.frequency > target_freq), None)
                    return next_corr.ac_dc_difference if next_corr else None
                
                for i in range(len(sorted_corrs) - 1):
                    lower, upper = sorted_corrs[i], sorted_corrs[i+1]
                    if lower.frequency < target_freq < upper.frequency:
                        # Linear Interpolation
                        return lower.ac_dc_difference + ((target_freq - lower.frequency) * (upper.ac_dc_difference - lower.ac_dc_difference)) / (upper.frequency - lower.frequency)
                
                # Extrapolation
                if len(sorted_corrs) >= 2:
                    if target_freq < sorted_corrs[0].frequency:
                        f1, d1 = sorted_corrs[0].frequency, sorted_corrs[0].ac_dc_difference
                        f2, d2 = sorted_corrs[1].frequency, sorted_corrs[1].ac_dc_difference
                        return d1 + ((target_freq - f1) * (d2 - d1)) / (f2 - f1)
                    elif target_freq > sorted_corrs[-1].frequency:
                        f1, d1 = sorted_corrs[-2].frequency, sorted_corrs[-2].ac_dc_difference
                        f2, d2 = sorted_corrs[-1].frequency, sorted_corrs[-1].ac_dc_difference
                        return d2 + ((target_freq - f2) * (d2 - d1)) / (f2 - f1)
            except TVC.DoesNotExist:
                return None
            return None

        if self.delta_std is None: self.delta_std = get_tvc_corr(session.standard_tvc_serial)
        if self.delta_ti is None: self.delta_ti = get_tvc_corr(session.test_tvc_serial)

        # Set defaults so math doesn't crash
        if self.eta_std is None: self.eta_std = 1.0
        if self.eta_ti is None: self.eta_ti = 1.0
        if self.delta_std is None: self.delta_std = 0.0
        if self.delta_ti is None: self.delta_ti = 0.0
        if self.delta_std_known is None: self.delta_std_known = 0.0

        self.save(update_fields=['delta_std', 'delta_ti', 'delta_std_known', 'eta_std', 'eta_ti'])

    def calculate_ac_dc_difference(self):
        """Performs the final math formulation."""
        # 1. Check if all required averages exist
        required_avgs = [
            self.std_dc_pos_avg, self.std_dc_neg_avg, self.std_ac_open_avg, self.std_ac_close_avg,
            self.ti_dc_pos_avg, self.ti_dc_neg_avg, self.ti_ac_open_avg, self.ti_ac_close_avg
        ]
        if any(v is None for v in required_avgs):
            return None  # Not ready to calculate yet

        # 2. Fetch corrections automatically if not already set
        self.fetch_automatic_corrections()

        # 3. Perform Math (delegated to the shared pure function so the
        #    per-cycle finalizer and this aggregate path compute δ via one
        #    source of truth).
        phase_avgs = {
            'std_ac_open_avg': self.std_ac_open_avg,
            'std_dc_pos_avg': self.std_dc_pos_avg,
            'std_dc_neg_avg': self.std_dc_neg_avg,
            'std_ac_close_avg': self.std_ac_close_avg,
            'ti_ac_open_avg': self.ti_ac_open_avg,
            'ti_dc_pos_avg': self.ti_dc_pos_avg,
            'ti_dc_neg_avg': self.ti_dc_neg_avg,
            'ti_ac_close_avg': self.ti_ac_close_avg,
        }
        delta = compute_delta_uut_ppm(
            phase_avgs,
            eta_std=self.eta_std,
            eta_ti=self.eta_ti,
            delta_std=self.delta_std,
            delta_ti=self.delta_ti,
            delta_std_known=self.delta_std_known,
        )
        if delta is None:
            return None

        self.delta_uut_ppm = delta
        self.save(update_fields=['delta_uut_ppm'])
        return self.delta_uut_ppm

    def recompute_cycle_aggregates(self):
        """After per-cycle δ values are persisted in CalibrationResultsCycle,
        roll them up onto this row: `delta_uut_ppm_avg` = mean(δᵢ),
        `type_a_uncertainty_ppm` = s(δᵢ) / √N. Leaves `delta_uut_ppm` (the
        legacy single-pass value) untouched so older sessions keep showing
        their original number.

        These are *per-direction* aggregates and are diagnostic-only — the
        headline AC-DC δ comes from ``recompute_pair_aggregate`` below.
        """
        cycle_deltas = list(
            self.cycles.exclude(delta_uut_ppm__isnull=True)
            .order_by('cycle_index')
            .values_list('delta_uut_ppm', flat=True)
        )
        mean_val, type_a = aggregate_cycle_deltas(cycle_deltas)
        update_fields = []
        if mean_val is not None:
            self.delta_uut_ppm_avg = mean_val
            update_fields.append('delta_uut_ppm_avg')
        if type_a is not None:
            self.type_a_uncertainty_ppm = type_a
            update_fields.append('type_a_uncertainty_ppm')
        if update_fields:
            self.save(update_fields=update_fields)
        return (mean_val, type_a)

    def recompute_pair_aggregate(self):
        """Find the opposite-direction sibling TestPoint at the same
        (current, frequency) and pair-up the cycle δ values across the two.

        Computes ``pair_delta_uut_ppm`` and ``pair_type_a_uncertainty_ppm``
        per the session's pairing preference (ABBA by default, index when
        ``CalibrationConfigurations.use_abba_pairing`` is False) and
        **mirrors the result onto both rows** so either side can serve as
        the canonical headline source.

        Idempotent — safe to call after any cycle row mutates. Returns the
        paired mean δ in ppm (or ``None`` when the pair is incomplete).
        """
        tp = self.test_point
        if tp is None:
            return None
        opposite_direction = 'Reverse' if tp.direction == 'Forward' else 'Forward'
        try:
            sibling_tp = TestPoint.objects.get(
                test_point_set=tp.test_point_set,
                current=tp.current,
                frequency=tp.frequency,
                direction=opposite_direction,
            )
        except TestPoint.DoesNotExist:
            return None
        sibling_results = getattr(sibling_tp, 'results', None)
        if sibling_results is None:
            return None

        fwd_results, rev_results = (
            (self, sibling_results) if tp.direction == 'Forward' else (sibling_results, self)
        )
        fwd_deltas = list(
            fwd_results.cycles.exclude(delta_uut_ppm__isnull=True)
            .order_by('cycle_index').values_list('delta_uut_ppm', flat=True)
        )
        rev_deltas = list(
            rev_results.cycles.exclude(delta_uut_ppm__isnull=True)
            .order_by('cycle_index').values_list('delta_uut_ppm', flat=True)
        )

        # Read the session's pairing preference (defaults to ABBA on).
        session = tp.test_point_set.session
        cal_cfg = getattr(getattr(session, 'calibration', None), 'configurations', None)
        use_abba = bool(getattr(cal_cfg, 'use_abba_pairing', True))

        mean_val, u_a, _ = aggregate_paired_cycles(fwd_deltas, rev_deltas, use_abba=use_abba)

        # Mirror onto BOTH rows. Persist `None` symmetrically when the pair
        # is incomplete so the UI can render the "pair incomplete" state
        # without holding stale partial data.
        for row in (fwd_results, rev_results):
            row.pair_delta_uut_ppm = mean_val
            row.pair_type_a_uncertainty_ppm = u_a
            row.save(update_fields=['pair_delta_uut_ppm', 'pair_type_a_uncertainty_ppm'])
        return mean_val

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

    delta_uut_ppm = models.FloatField(null=True, blank=True, help_text="Legacy single-pass UUT AC-DC difference in PPM (pre-N-cycle workflow)")
    delta_uut_ppm_avg = models.FloatField(null=True, blank=True, help_text="Per-direction mean δ across this TestPoint's cycles (ppm). Diagnostic only — the headline AC-DC δ is pair_delta_uut_ppm.")
    type_a_uncertainty_ppm = models.FloatField(
        null=True, blank=True,
        help_text="Per-direction Type A u_A = s(δᵢ)/√N across this TestPoint's cycles (ppm). Diagnostic only — the headline u_A is pair_type_a_uncertainty_ppm."
    )
    # Pair-level aggregate (Forward + Reverse paired). Mirrored on BOTH the
    # Fwd and Rev CalibrationResults rows of a (current, frequency) pair so
    # either side can serve as the source of truth.
    pair_delta_uut_ppm = models.FloatField(
        null=True, blank=True,
        help_text="Paired AC-DC δ_UUT = mean over pair_i = (δ_Fwd_i + δ_Rev_{N+1-i})/2 (ppm). Mirrored on both Fwd and Rev results rows."
    )
    pair_type_a_uncertainty_ppm = models.FloatField(
        null=True, blank=True,
        help_text="Pair-level Type A u_A = s(pair_δ_i)/√N (ppm). Mirrored on both Fwd and Rev results rows."
    )

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


class CalibrationResultsCycle(models.Model):
    """One row per AC-DC measurement cycle at a test point.

    Each cycle owns the full `ac_open → dc_pos → dc_neg → ac_close` sequence
    that yielded a single estimate of δ_UUT. The per-cycle phase averages
    and stddevs are persisted here so the new statistics modal and chart
    cycle-filter can reconstruct what happened in each cycle without
    re-aggregating from raw readings.

    The parent `CalibrationResults.delta_uut_ppm_avg` is the mean across
    all `cycle.delta_uut_ppm` values; `type_a_uncertainty_ppm` is
    s(δᵢ)/√N over the same set.
    """

    results = models.ForeignKey(
        CalibrationResults,
        related_name='cycles',
        on_delete=models.CASCADE,
    )
    cycle_index = models.PositiveIntegerField(help_text="1-based cycle ordinal within a test point.")
    delta_uut_ppm = models.FloatField(null=True, blank=True, help_text="δ_UUT for this cycle alone, in PPM.")

    # Per-cycle phase averages (mirror the 8 *_avg fields on CalibrationResults)
    std_ac_open_avg = models.FloatField(null=True, blank=True)
    std_dc_pos_avg = models.FloatField(null=True, blank=True)
    std_dc_neg_avg = models.FloatField(null=True, blank=True)
    std_ac_close_avg = models.FloatField(null=True, blank=True)
    ti_ac_open_avg = models.FloatField(null=True, blank=True)
    ti_dc_pos_avg = models.FloatField(null=True, blank=True)
    ti_dc_neg_avg = models.FloatField(null=True, blank=True)
    ti_ac_close_avg = models.FloatField(null=True, blank=True)

    # Per-cycle within-phase stddevs (short-term sample noise; diagnostic only)
    std_ac_open_stddev = models.FloatField(null=True, blank=True)
    std_dc_pos_stddev = models.FloatField(null=True, blank=True)
    std_dc_neg_stddev = models.FloatField(null=True, blank=True)
    std_ac_close_stddev = models.FloatField(null=True, blank=True)
    ti_ac_open_stddev = models.FloatField(null=True, blank=True)
    ti_dc_pos_stddev = models.FloatField(null=True, blank=True)
    ti_dc_neg_stddev = models.FloatField(null=True, blank=True)
    ti_ac_close_stddev = models.FloatField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('results', 'cycle_index')
        ordering = ['cycle_index']

    def __str__(self):
        return f"Cycle {self.cycle_index} for Results {self.results_id} (δ={self.delta_uut_ppm})"


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

class BugReport(models.Model):
    SEVERITY_CHOICES = [
        ('Low', 'Low'),
        ('Medium', 'Medium'),
        ('High', 'High'),
        ('Critical', 'Critical')
    ]
    CATEGORY_CHOICES = [
        ('UI/UX', 'UI/UX'),
        ('Hardware Communication', 'Hardware Communication'),
        ('Calculation Accuracy', 'Calculation Accuracy'),
        ('Database/Sync', 'Database/Sync'),
        ('Other', 'Other')
    ]
    STATUS_CHOICES = [
        ('Not Started', 'Not Started'),
        ('In Work', 'In Work'),
        ('Solved', 'Solved'),
    ]

    title = models.CharField(max_length=255)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='Medium')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='UI/UX')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Not Started')
    description = models.TextField()
    steps = models.TextField(blank=True, null=True)
    system_info = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.severity} - {self.title}"

class Workstation(models.Model):
    """A calibration bench — the physical location where a run happens.

    Workstation identity replaces the client-IP-based claim system so the
    application can be hosted centrally on a VM and still correctly
    attribute which physical bench a host is driving. Every entry is
    rarely-edited reference data managed through the Django admin; the
    optional ``Documents/Portal/workstations.json`` seed file imports an
    initial inventory on a fresh install and is ignored once any
    non-default rows exist.

    The relationship to :class:`CalibrationSession` is intentionally
    nullable — pre-existing sessions (and single-user Electron installs
    that never touch the concept) keep working, falling back to the
    auto-created local bench via :meth:`get_default`.
    """

    name = models.CharField(max_length=100, unique=True)
    identifier = models.SlugField(
        max_length=100,
        unique=True,
        help_text="Stable slug used in URLs / WebSocket payloads. Lower-case, no spaces.",
    )
    location = models.CharField(max_length=200, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(
        default=False,
        help_text=(
            "Marks the auto-created local bench. Used as the fallback "
            "workstation when a CalibrationSession has no explicit link."
        ),
    )
    instrument_addresses = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Advisory list of GPIB/VISA addresses that physically live at "
            "this bench. Not enforced at run-time — used by the UI to "
            "pre-filter instrument choices when configuring a session."
        ),
    )
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @classmethod
    def get_default(cls):
        """Return the auto-created local bench, creating it if missing.

        Called from ``entry_point._bootstrap_local_workstation`` at boot and
        as a safety net during request handling so the "Local Workstation"
        invariant holds even if the bootstrap step is ever skipped. Never
        raises — a broken DB surfaces elsewhere.
        """
        ws, _ = cls.objects.get_or_create(
            is_default=True,
            defaults={
                'name': 'Local Workstation',
                'identifier': 'local',
                'location': 'Local',
                'is_active': True,
            },
        )
        return ws


class WorkstationClaim(models.Model):
    """Durable row-backed replacement for the in-memory claim registry.

    Keeping the claim in the DB rather than the process-global
    ``CLAIMED_WORKSTATIONS`` dict gives us two things the dict cannot:

    1. **Crash safety** — a daphne restart no longer strands a workstation
       under a lock nobody owns. Staleness is detected via
       ``last_heartbeat_at`` plus a TTL enforced at claim time.
    2. **Cross-process correctness** — when the deployment eventually runs
       multiple ASGI workers, the claim row remains the single source of
       truth without any inter-process coordination.

    ``owner_channel`` stores the ASGI ``channel_name`` of the WebSocket
    that currently holds the lock. Release/disconnect logic verifies
    ownership against this value before mutating the row so a misrouted
    command cannot steal someone else's bench.
    """

    workstation = models.OneToOneField(
        Workstation,
        on_delete=models.CASCADE,
        related_name='claim',
    )
    owner_channel = models.CharField(max_length=200, db_index=True)
    owner_client_id = models.CharField(max_length=100, blank=True, default='')
    owner_label = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text="Human-readable owner description surfaced in the UI.",
    )
    active_session = models.ForeignKey(
        CalibrationSession,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='active_claims',
    )
    claimed_at = models.DateTimeField(auto_now_add=True)
    last_heartbeat_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['owner_channel']),
            models.Index(fields=['last_heartbeat_at']),
        ]

    def __str__(self):
        return f"Claim on {self.workstation.name} by {self.owner_channel[:40]}"


class PendingReadingWrite(models.Model):
    """
    Durable local write-outbox for calibration stage saves.

    Every call to `CalibrationConsumer.save_readings_to_db` enqueues one row
    here BEFORE attempting the real write against the default database. If the
    real write succeeds the row is marked `done`; if it fails (typical MSSQL
    outage) the row stays `pending` and the background drainer in
    `api.outbox.run_drainer_forever` retries with exponential backoff until
    the server is reachable again.

    This table lives on the dedicated `outbox` SQLite alias (see
    `api.db_routers.OutboxRouter`) so it is completely independent of the
    MSSQL connection state. All fields are plain JSON-serializable types so
    the row carries everything needed to replay the write without re-reading
    anything from the (possibly unreachable) default DB.
    """

    STATUS_PENDING = 'pending'
    STATUS_IN_FLIGHT = 'in_flight'
    STATUS_DONE = 'done'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_IN_FLIGHT, 'In flight'),
        (STATUS_DONE, 'Done'),
        (STATUS_FAILED, 'Failed'),
    ]

    # Identifying context — enough to resolve the target row on replay.
    session_id = models.IntegerField(db_index=True)
    test_point_id = models.IntegerField(null=True, blank=True, db_index=True)
    test_point_lookup = models.JSONField(
        default=dict, blank=True,
        help_text="Fallback {current, frequency, direction} used when test_point_id is missing."
    )

    # Payload.
    reading_type_full = models.CharField(max_length=64)
    readings_json = models.JSONField(default=list, blank=True)

    # Replay bookkeeping.
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True
    )
    attempts = models.IntegerField(default=0)
    last_error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return (
            f"PendingReadingWrite[{self.status}] "
            f"session={self.session_id} tp={self.test_point_id} "
            f"stage={self.reading_type_full} attempts={self.attempts}"
        )
