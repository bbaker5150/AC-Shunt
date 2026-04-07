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
        db_conn.cursor()
        table_names = db_conn.introspection.table_names()
        
        if 'django_migrations' not in table_names:
            print("First run detected. Running migrations...")
            call_command('migrate', interactive=False)
        else:
            print("Database schema exists. Skipping migration.")
    except Exception as e:
        print(f"CRITICAL: Database initialization failed: {e}")
        # Don't exit here, attempt to start server anyway for diagnostics

    port = '8000'
    
    if is_port_in_use(port):
        print(f"ERROR: Port {port} is already in use. Kill the existing process first.")
        sys.exit(1)

    # Use 127.0.0.1 instead of 0.0.0.0 for better local reliability
    print(f"Starting Django server on 127.0.0.1:{port}...")
    
    # execute_from_command_line needs a list where the first arg is the script name
    # In a packaged EXE, sys.argv[0] is the path to the EXE itself.
    server_args = [sys.argv[0], 'runserver', f'127.0.0.1:{port}', '--noreload']
    execute_from_command_line(server_args)

if __name__ == '__main__':
    main()