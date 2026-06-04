"""
Seed the Uncertainty Budget module with realistic mock data for local testing.

Loads the JSON fixtures in ``uncertainty/fixtures/mock/`` into the dedicated
``uncertainty`` database. The primary derived-session fixture mirrors the
``MUA BRG3100 21972 BEARING TORQUE TEST MACHINE.xlsm`` workbook setup, including
the BRG-3100 UUT, calibration beam, F-class weight, torque indication
resolution, document metadata, uncertainty requirements, and torque points:

  * ``instruments.json`` -> the global Instrument library
  * every other ``*.json`` -> a full analysis session (areas, UUTs, TMDEs,
    test points + components), via the same serializer the API uses, so the
    seeded data is byte-for-byte what a real save would produce.

Usage (from Backend/ac_shunt, with the Django venv active):

    python manage.py seed_uncertainty_mock          # seed everything
    python manage.py seed_uncertainty_mock --flush   # wipe sessions/instruments first

The command is idempotent: sessions and instruments are upserted by id, so
re-running refreshes the mock data in place. Run ``manage.py bootstrap`` (or
``manage.py migrate --database=uncertainty``) first so the schema exists.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import OperationalError

from uncertainty import models
from uncertainty.serializers import save_instrument, save_session

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "mock"
INSTRUMENTS_FILE = "instruments.json"


class Command(BaseCommand):
    help = "Seed the Uncertainty module with mock instruments + sessions for local testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete existing sessions and instruments before seeding.",
        )

    def handle(self, *args, **options):
        if not FIXTURES_DIR.is_dir():
            raise CommandError(f"Fixtures directory not found: {FIXTURES_DIR}")

        if options["flush"]:
            self._flush()

        self._seed_instruments()
        self._seed_sessions()
        self.stdout.write(self.style.SUCCESS("Uncertainty mock data seeded."))

    # ------------------------------------------------------------------ #
    def _flush(self):
        try:
            s = models.Session.objects.all().delete()
            i = models.Instrument.objects.all().delete()
        except OperationalError as exc:
            raise CommandError(
                "Could not access the 'uncertainty' database. Run "
                "`python manage.py bootstrap` (or migrate the uncertainty alias) first."
            ) from exc
        self.stdout.write(f"  flushed sessions={s[0]} instruments={i[0]}")

    def _seed_instruments(self):
        path = FIXTURES_DIR / INSTRUMENTS_FILE
        if not path.exists():
            self.stdout.write(self.style.WARNING(f"  (no {INSTRUMENTS_FILE}; skipping instruments)"))
            return
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = [data]
        try:
            for inst in data:
                save_instrument(inst)
        except OperationalError as exc:
            raise CommandError(
                "Could not write to the 'uncertainty' database. Run "
                "`python manage.py bootstrap` (or migrate the uncertainty alias) first."
            ) from exc
        self.stdout.write(self.style.SUCCESS(f"  instruments: {len(data)} loaded"))

    def _seed_sessions(self):
        session_files = sorted(
            p for p in FIXTURES_DIR.glob("*.json") if p.name != INSTRUMENTS_FILE
        )
        if not session_files:
            self.stdout.write(self.style.WARNING("  (no session fixtures found)"))
            return
        for path in session_files:
            data = json.loads(path.read_text(encoding="utf-8"))
            session = save_session(data)
            self.stdout.write(
                self.style.SUCCESS(
                    f"  session: {session.name!r} (id={session.id}) "
                    f"areas={session.measurement_areas.count()} "
                    f"uuts={session.uuts.count()} "
                    f"tmdes={session.tmdes.count()} "
                    f"points={session.test_points.count()}"
                )
            )
