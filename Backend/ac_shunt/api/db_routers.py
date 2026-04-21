"""
Database routers for AC-Shunt.

The `OutboxRouter` pins the local write-outbox model (`PendingReadingWrite`) to
the dedicated `outbox` SQLite alias so that queue inserts, retries, and status
updates keep working even when the `default` (MSSQL) database is unreachable.

Every other model continues to live on `default`; this keeps the change
completely additive and invisible to the rest of the app.
"""

OUTBOX_DB_ALIAS = 'outbox'
OUTBOX_APP_LABEL = 'api'
OUTBOX_MODEL_NAME = 'pendingreadingwrite'


class OutboxRouter:
    """Route `PendingReadingWrite` exclusively to the `outbox` alias."""

    def _is_outbox(self, model):
        return (
            getattr(model, '_meta', None) is not None
            and model._meta.app_label == OUTBOX_APP_LABEL
            and model._meta.model_name == OUTBOX_MODEL_NAME
        )

    def db_for_read(self, model, **hints):
        if self._is_outbox(model):
            return OUTBOX_DB_ALIAS
        return None

    def db_for_write(self, model, **hints):
        if self._is_outbox(model):
            return OUTBOX_DB_ALIAS
        return None

    def allow_relation(self, obj1, obj2, **hints):
        # PendingReadingWrite is standalone (no FKs across DBs), so always
        # allow; callers won't wire it to other models anyway.
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # The outbox model is the ONLY thing allowed on the outbox alias, and
        # it is NOT allowed on any other alias.
        is_outbox_model = (
            app_label == OUTBOX_APP_LABEL
            and model_name == OUTBOX_MODEL_NAME
        )
        if db == OUTBOX_DB_ALIAS:
            return is_outbox_model
        if is_outbox_model:
            return False
        return None
