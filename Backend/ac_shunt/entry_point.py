# entry_point.py
import os
import sys
import django
import socket
from django.core.management import execute_from_command_line, call_command
from django.db import connections

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', int(port))) == 0

def main():
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
        # Attempt to get a cursor to verify the connection works
        db_conn.cursor()
        table_names = db_conn.introspection.table_names()
        
        if 'django_migrations' not in table_names:
            print("Database schema missing. Running migrations...")
            call_command('migrate', interactive=False)
        else:
            print("Database schema verified.")
    except Exception as e:
        # If this fails, settings.py probably tried to use MSSQL because the test 
        # partially passed but the actual connection is blocked. 
        # We log and let runserver start so the user sees errors in the browser console.
        print(f"WARNING: Database is not ready for queries: {e}")

    port = '8000'
    if is_port_in_use(port):
        print(f"ERROR: Port {port} is already in use. Kill the existing process first.")
        sys.exit(1)

    print(f"Starting Django server on 127.0.0.1:{port}...")
    server_args = [sys.argv[0], 'runserver', f'127.0.0.1:{port}', '--noreload']
    execute_from_command_line(server_args)

if __name__ == '__main__':
    main()