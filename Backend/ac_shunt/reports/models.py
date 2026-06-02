"""
Models for the Report of Calibration module.

Empty for now — the report data model lands in a later step. Once models are
added here, WorkbenchRouter (``api.db_routers``) routes this app's tables to the
dedicated ``reports`` database alias (wired into APP_DB_MAP), keeping them
isolated from the AC-Shunt (``api``) tables on ``default``.
"""
from django.db import models  # noqa: F401
