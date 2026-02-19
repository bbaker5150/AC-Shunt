import os
import sys
import django
from django.core.management import execute_from_command_line, call_command
from django.db import connections
from django.db.utils import OperationalError

def main():
    # 1. Set up the environment
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ac_shunt.settings')
    django.setup()

    # 2. Check for Database Connection & Run Migrations Automatically
    # Since MSSQL is server-based (not a file), we must verify connectivity 
    # and check if the schema exists by looking for the migrations table.
    print("Checking MSSQL database connection...")
    
    db_conn = connections['default']
    try:
        # Attempt to get a cursor to verify the connection works
        db_conn.cursor()
        print("Database connection successful.")
        
        # Check if the 'django_migrations' table exists to see if this is a "First Run"
        # This is more reliable than checking file paths for server-based DBs
        table_names = db_conn.introspection.table_names()
        
        if 'django_migrations' not in table_names:
            print("First run detected (schema missing). Running migrations...")
            try:
                call_command('migrate')
                # Optional: Load initial data if you have fixtures
                # call_command('loaddata', 'initial_setup.json') 
                print("Database schema created successfully.")
            except Exception as e:
                print(f"Error running migrations: {e}")
                sys.exit(1)
        else:
            print("Database schema exists. Skipping migration.")
            
    except OperationalError as e:
        print(f"CRITICAL: Could not connect to MSSQL Database. Verify credentials and network.\nError: {e}")
        # In a GUI app context, this will cause the backend process to exit, 
        # which you can catch in your Electron 'backendProcess.on("exit")' handler.
        sys.exit(1)

    # 3. Define the port
    port = '8000'

    # 4. Run the Server
    # Note: --noreload is required for PyInstaller
    # CHANGED: 127.0.0.1 -> 0.0.0.0 to ensure external instruments can be discovered
    sys.argv = ['manage.py', 'runserver', f'0.0.0.0:{port}', '--noreload']
    
    print(f"Starting AC Shunt Backend on 0.0.0.0:{port}...")
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()