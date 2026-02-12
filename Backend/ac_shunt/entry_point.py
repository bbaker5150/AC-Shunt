import os
import sys
import django
from django.core.management import execute_from_command_line, call_command
from pathlib import Path

def main():
    # 1. Set up the environment
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ac_shunt.settings')
    django.setup()

    # 2. Check for Database & Run Migrations Automatically
    # We import settings AFTER setup to get the configured path
    from django.conf import settings
    db_path = Path(settings.DATABASES['default']['NAME'])
    
    if not db_path.exists():
        print("First run detected. Creating database...")
        try:
            call_command('migrate')
            # Optional: Load initial data if you have fixtures
            # call_command('loaddata', 'initial_setup.json') 
            print("Database created successfully.")
        except Exception as e:
            print(f"Error creating database: {e}")

    # 3. Define the port
    port = '8000'

    # 4. Run the Server
    # Note: --noreload is required for PyInstaller
    sys.argv = ['manage.py', 'runserver', f'127.0.0.1:{port}', '--noreload']
    
    print(f"Starting AC Shunt Backend on port {port}...")
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()