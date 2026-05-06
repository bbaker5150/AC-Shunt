"""
Create a calibration session with realistic readings + results for UI development.

Usage (from Backend/ac_shunt, with Django env active):
  python manage.py seed_mock_calibration_session

Re-run: removes any existing session with the same name and recreates it.
"""

import time
from decimal import Decimal
from typing import Optional

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import (
    Calibration,
    CalibrationConfigurations,
    CalibrationReadings,
    CalibrationResults,
    CalibrationSession,
    CalibrationSettings,
    CalibrationTVCCorrections,
    TestPoint,
    TestPointSet,
    Workstation,
)
from api.mock_instruments import MOCK_SESSION_ROLE_ASSIGNMENT

MOCK_SESSION_NAME = "[MOCK] UI Development"


def _series(base: float, n: int = 12, spread: float = 1e-6, t0: Optional[float] = None):
    t0 = t0 or time.time()
    out = []
    for i in range(n):
        jitter = ((i % 5) - 2) * spread
        out.append(
            {
                "value": base + jitter,
                "timestamp": t0 + i * 0.5,
                "is_stable": True,
            }
        )
    return out


def _char_series(center: float, n: int = 8, t0: Optional[float] = None):
    t0 = t0 or time.time()
    return [
        {
            "value": center + (i % 3 - 1) * 1e-7,
            "timestamp": t0 + i * 0.3,
            "is_stable": True,
        }
        for i in range(n)
    ]


class Command(BaseCommand):
    help = "Seed a mock calibration session with readings and results for UI work."

    def handle(self, *args, **options):
        with transaction.atomic():
            CalibrationSession.objects.filter(session_name=MOCK_SESSION_NAME).delete()

            roles = MOCK_SESSION_ROLE_ASSIGNMENT
            # Link to the default local bench so the seeded session exercises
            # the same workstation-scoped code paths a real session will use.
            # Safe to call here even if _bootstrap_local_workstation hasn't
            # run yet in this process; get_default() is idempotent.
            local_bench = Workstation.get_default()
            session = CalibrationSession.objects.create(
                session_name=MOCK_SESSION_NAME,
                workstation=local_bench,
                standard_instrument_model="A40B",
                standard_instrument_serial="MOCK-STD",
                test_instrument_model="A40B",
                test_instrument_serial="MOCK-UUT",
                standard_tvc_serial="12345",
                test_tvc_serial="67890",
                # Instrument role assignment wired up so the Instrument Status
                # panel shows an "Assigned Roles" section out-of-the-box.
                standard_reader_model=roles["standard_reader"]["model"],
                standard_reader_serial=roles["standard_reader"]["serial"],
                standard_reader_address=roles["standard_reader"]["address"],
                test_reader_model=roles["test_reader"]["model"],
                test_reader_serial=roles["test_reader"]["serial"],
                test_reader_address=roles["test_reader"]["address"],
                ac_source_serial=roles["ac_source"]["serial"],
                ac_source_address=roles["ac_source"]["address"],
                dc_source_serial=roles["dc_source"]["serial"],
                dc_source_address=roles["dc_source"]["address"],
                amplifier_serial=roles["amplifier"]["serial"],
                amplifier_address=roles["amplifier"]["address"],
                switch_driver_model=roles["switch_driver"]["model"],
                switch_driver_serial=roles["switch_driver"]["serial"],
                switch_driver_address=roles["switch_driver"]["address"],
                temperature=23.0,
                humidity=45.0,
                notes="Seeded mock data for Calibration Results UI development.",
            )

            TestPointSet.objects.create(session=session)
            calibration = Calibration.objects.create(session=session)
            CalibrationConfigurations.objects.create(
                calibration=calibration,
                ac_shunt_range=100.0,
                amplifier_range=2.0,
            )
            CalibrationTVCCorrections.objects.create(
                calibration=calibration,
                corrections_data={
                    "Standard": {"placeholder": True},
                    "Test": {"placeholder": True},
                },
            )

            tp_set = session.test_point_set
            pairs = [
                # Low-frequency points exercise the harmonic-projection branch
                # (Mock34420A injects synthetic 2f ripple at 0 < f <= 40 Hz).
                (Decimal("1.0"), 10, -6),
                (Decimal("1.0"), 20, -4),
                (Decimal("1.0"), 40, -2),
                (Decimal("1.0"), 60, 0),
                (Decimal("1.0"), 1000, 2),
            ]

            for current, frequency, order_base in pairs:
                for direction, ppm_offset in (("Forward", 0.0), ("Reverse", 0.15)):
                    tp = TestPoint.objects.create(
                        test_point_set=tp_set,
                        current=current,
                        frequency=frequency,
                        direction=direction,
                        order=order_base + (0 if direction == "Forward" else 1),
                        is_stability_failed=False,
                    )
                    CalibrationSettings.objects.create(
                        test_point=tp,
                        num_samples=35,
                        settling_time=120,
                        nplc=20.0,
                        stability_window=30,
                        stability_threshold_ppm=10.0,
                    )

                    t0 = time.time()
                    # Distinct but plausible DC/AC magnitudes
                    v_dc = 0.7 + ppm_offset * 1e-6
                    v_ac_o = 0.701 + ppm_offset * 1e-6
                    v_ac_c = 0.7005 + ppm_offset * 1e-6

                    readings = CalibrationReadings.objects.create(
                        test_point=tp,
                        std_ac_open_readings=_series(v_ac_o, t0=t0),
                        std_dc_pos_readings=_series(v_dc, t0=t0 + 1),
                        std_dc_neg_readings=_series(-v_dc, t0=t0 + 2),
                        std_ac_close_readings=_series(v_ac_c, t0=t0 + 3),
                        ti_ac_open_readings=_series(v_ac_o * 1.0002, t0=t0 + 0.1),
                        ti_dc_pos_readings=_series(v_dc * 1.0001, t0=t0 + 1.1),
                        ti_dc_neg_readings=_series(-v_dc * 1.0001, t0=t0 + 2.1),
                        ti_ac_close_readings=_series(v_ac_c * 1.0002, t0=t0 + 3.1),
                        std_char_plus1_readings=_char_series(0.65),
                        std_char_minus_readings=_char_series(0.64),
                        std_char_plus2_readings=_char_series(0.66),
                        ti_char_plus1_readings=_char_series(0.62),
                        ti_char_minus_readings=_char_series(0.61),
                        ti_char_plus2_readings=_char_series(0.63),
                    )
                    readings.update_related_results()

                    res = tp.results
                    delta_uut = 2.5 + ppm_offset + (float(frequency) / 10000.0)
                    avg = (delta_uut + (delta_uut - 0.1)) / 2.0
                    res.delta_uut_ppm = delta_uut
                    res.delta_uut_ppm_avg = avg
                    res.delta_std = 1.2
                    res.delta_ti = 1.1
                    res.delta_std_known = 0.05
                    res.combined_uncertainty = 0.8
                    res.expanded_uncertainty = 1.6
                    res.k_value = 2.0
                    res.effective_dof = 50.0
                    res.is_detailed_uncertainty_calculated = True
                    res.save()

        self.stdout.write(
            self.style.SUCCESS(
                f'Mock session "{MOCK_SESSION_NAME}" created (id={session.pk}). '
                "Select it in the app to work on Calibration Results."
            )
        )
        self.stdout.write(
            "Tip: launch the server with MOCK_INSTRUMENTS=1 to also see mock "
            "instruments in the Instrument Status panel. PowerShell example:\n"
            '    $env:MOCK_INSTRUMENTS = "1"; python manage.py runserver'
        )
