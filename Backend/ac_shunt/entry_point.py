# entry_point.py
import os
import sys
import django
import socket
from django.core.management import execute_from_command_line, call_command
from django.db import connections

def is_port_in_use(port):
    """
    Checks if the specified port is already bound on 127.0.0.1.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', int(port))) == 0


def _bootstrap_outbox_db():
    """
    Ensure the local write-outbox SQLite database has its schema.

    This is completely independent of the default DB — even if MSSQL is
    unreachable at boot, the outbox must still be ready to accept enqueues
    so an in-progress run can buffer stage saves.
    """
    try:
        outbox_conn = connections['outbox']
        outbox_conn.cursor()  # forces connection open / file creation
        tables = outbox_conn.introspection.table_names()
        if 'api_pendingreadingwrite' not in tables:
            print("Bootstrapping outbox SQLite schema...")
            call_command('migrate', database='outbox', interactive=False, verbosity=0)
            print("Outbox schema ready.")
        else:
            print("Outbox schema already present.")
    except Exception as e:
        # The outbox failing is serious but non-fatal — the app still boots,
        # and save_readings_to_db falls back to its direct path. Log loudly.
        print(f"WARNING: outbox bootstrap failed: {e}")


def main():
    # 1. Initialize Django environment
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ac_shunt.settings')
    
    try:
        django.setup()
    except Exception as e:
        print(f"CRITICAL: Django setup failed: {e}")
        sys.exit(1)

    # 2. Check Database Connection & Run Migrations
    db_conn = connections['default']
    print(f"--- Booting with Database Engine: {db_conn.settings_dict['ENGINE']} ---")
    
    try:
        # Attempt to get a cursor to verify the connection is alive
        db_conn.cursor()
        table_names = db_conn.introspection.table_names()
        
        # Automatic migration on first-run or database switch
        if 'django_migrations' not in table_names:
            print("First run detected. Running migrations...")
            call_command('migrate', interactive=False)
        else:
            print("Database schema exists. Skipping migration.")
            
        # 3. RUN CORRECTIONS SYNC HERE
        try:
            from api.manage_corrections import check_and_update_corrections
            check_and_update_corrections()
            print("Startup corrections synchronization completed.")
        except Exception as e:
            print(f"Non-critical error during corrections sync: {e}")

    except Exception as e:
        # The default DB being down at boot is EXACTLY the scenario the outbox
        # is designed to survive — we continue booting so the drainer can
        # replay once it comes back.
        print(f"CRITICAL: Default database initialization failed: {e}")
        print("Continuing boot so the outbox can buffer writes until the server returns.")

    # 2b. Always bootstrap the local outbox — independent of default DB state.
    _bootstrap_outbox_db()

    # 4. Handle Port Conflicts
    port = '8000'
    if is_port_in_use(port):
        print(f"ERROR: Port {port} is already in use. Kill the existing process first.")
        sys.exit(1)

    # 5. Start the Daphne/Django Server
    print(f"Starting Django server on 127.0.0.1:{port}...")
    
    # execute_from_command_line expects a list where the first arg is the script name.
    # --noreload is used to prevent the double-boot behavior in the Electron environment.
    server_args = [sys.argv[0], 'runserver', f'127.0.0.1:{port}', '--noreload']
    execute_from_command_line(server_args)

if __name__ == '__main__':
    main()