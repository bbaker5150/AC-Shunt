import os
import sys

from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        """
        App initialization logic.

        Most heavy startup (default DB migration, corrections sync) lives in
        entry_point.py to avoid RuntimeWarnings and to keep ``manage.py``
        commands fast. But the local write-outbox is critical for data
        durability even when the server was launched via plain
        ``manage.py runserver`` (developer mode, tests, etc.), so we make
        sure its schema is in place here as well.

        This is cheap (a single table on a local SQLite file) and idempotent,
        and is guarded so management commands like ``migrate`` /
        ``makemigrations`` don't recursively trigger it.
        """
        if os.environ.get('AC_SHUNT_SKIP_OUTBOX_BOOTSTRAP') == '1':
            return

        argv = sys.argv or []
        skip_commands = {'makemigrations', 'migrate', 'collectstatic',
                         'showmigrations', 'sqlmigrate', 'flush'}
        if any(cmd in argv for cmd in skip_commands):
            return

        try:
            from django.db import connections
            from django.core.management import call_command

            outbox_conn = connections['outbox']
            outbox_conn.cursor()
            tables = outbox_conn.introspection.table_names()
            if 'api_pendingreadingwrite' not in tables:
                call_command('migrate', database='outbox', interactive=False, verbosity=0)
        except Exception as e:
            print(f"api.apps.ready: outbox bootstrap skipped ({e}).")
