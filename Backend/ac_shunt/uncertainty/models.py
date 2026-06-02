"""
Models for the Uncertainty Budget module.

Empty for now — the uncertainty-budget data model lands in a later step. Once
models are added here, WorkbenchRouter (``api.db_routers``) routes this app's
tables to the dedicated ``uncertainty`` database alias (wired into APP_DB_MAP),
keeping them isolated from the AC-Shunt (``api``) tables on ``default``.
"""
from django.db import models  # noqa: F401
