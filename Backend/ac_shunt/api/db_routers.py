"""
Database routers for the Metrology Workbench.

``WorkbenchRouter`` gives the backend a per-module database topology:

  - The local write-outbox model (``api.PendingReadingWrite``) is pinned to the
    dedicated ``outbox`` SQLite alias so queue inserts, retries, and status
    updates keep working even when ``default`` (MSSQL) is unreachable.
  - Apps listed in ``APP_DB_MAP`` are routed (reads, writes, and migrations) to
    their own database alias, isolating each workbench module's tables.
  - The AC-Shunt module keeps using the ``api`` app on ``default`` — it is
    deliberately NOT in ``APP_DB_MAP``, so its ``api_*`` tables and MSSQL
    migration history stay exactly where they are.
  - Everything else falls through to ``default``.

This generalizes the original ``OutboxRouter``; the outbox behavior is byte-for-
byte identical. ``APP_DB_MAP`` starts empty and is populated as per-module
databases come online (uncertainty, reports, ...).
"""

OUTBOX_DB_ALIAS = 'outbox'
OUTBOX_APP_LABEL = 'api'
OUTBOX_MODEL_NAME = 'pendingreadingwrite'

# Maps a module ``app_label`` -> its dedicated database alias. The ``api``
# (AC-Shunt) app is intentionally absent: it stays on ``default``. Populated in
# a later Phase 2 step once the per-module DB aliases exist in settings.
APP_DB_MAP = {}


class WorkbenchRouter:
    """Route the outbox model and per-module apps to their own databases."""

    def _is_outbox(self, model):
        return (
            getattr(model, '_meta', None) is not None
            and model._meta.app_label == OUTBOX_APP_LABEL
            and model._meta.model_name == OUTBOX_MODEL_NAME
        )

    def _module_alias(self, model):
        """Return the mapped alias for ``model``'s app, or None if unmapped."""
        meta = getattr(model, '_meta', None)
        if meta is None:
            return None
        return APP_DB_MAP.get(meta.app_label)

    def db_for_read(self, model, **hints):
        if self._is_outbox(model):
            return OUTBOX_DB_ALIAS
        return self._module_alias(model)

    def db_for_write(self, model, **hints):
        if self._is_outbox(model):
            return OUTBOX_DB_ALIAS
        return self._module_alias(model)

    def allow_relation(self, obj1, obj2, **hints):
        # PendingReadingWrite is standalone (no cross-DB FKs), and module apps
        # are independent; callers won't wire models across aliases. Defer to
        # Django's default same-DB relation check.
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # The outbox model is the ONLY thing allowed on the outbox alias, and it
        # is NOT allowed on any other alias.
        is_outbox_model = (
            app_label == OUTBOX_APP_LABEL
            and model_name == OUTBOX_MODEL_NAME
        )
        if db == OUTBOX_DB_ALIAS:
            return is_outbox_model
        if is_outbox_model:
            return False

        # A per-module app may ONLY migrate onto its mapped alias.
        if app_label in APP_DB_MAP:
            return db == APP_DB_MAP[app_label]

        # A module alias accepts ONLY its mapped app(s); keep shared apps
        # (auth, contenttypes, admin, sessions, ...) and the api app off of it.
        if db in set(APP_DB_MAP.values()):
            return False

        # Everything else (api/AC-Shunt + shared apps on ``default``) is
        # unaffected — defer to Django's default behavior.
        return None


# Backwards-compatible alias. The router was originally named ``OutboxRouter``
# (and is still referenced by api/tests.py and a model docstring); keep the old
# name importable so nothing breaks while the generalized name rolls out.
OutboxRouter = WorkbenchRouter
