import os
import sys
import pyodbc
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------
# 1. RESOURCE RESOLUTION HELPER
# ---------------------------------------------------------
def get_resource_path(relative_path):
    """
    Get absolute path to resource, works for dev and for PyInstaller.
    PyInstaller 6+ maps '.' to the '_internal' folder in COLLECT mode.
    """
    if hasattr(sys, '_MEIPASS'):
        # In production (bundled EXE), sys._MEIPASS points to the _internal folder
        return os.path.join(sys._MEIPASS, relative_path)
    # In development, look relative to the BASE_DIR
    return os.path.join(BASE_DIR, relative_path)

# Use these variables in your views/logic to access your data files
CORRECTIONS_FILE = get_resource_path("corrections.xlsx")
UNCERTAINTY_FILE = get_resource_path("uncertainty_data.json")

# ---------------------------------------------------------
# 2. DATABASE CONFIGURATION & VERBOSE DEBUGGING
# ---------------------------------------------------------
CREDENTIALS_DIR = Path.home() / "Documents" / "Portal"
CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)

def get_db_cred(filename):
    """Helper to safely read credential files and strip whitespace."""
    filepath = CREDENTIALS_DIR / filename
    try:
        if filepath.exists():
            with open(filepath, 'r') as f:
                return f.read().strip()
    except Exception as e:
        print(f"Warning: Could not read {filename}: {e}")
    return None

print("\n" + "="*50)
print("DATABASE DEBUGGING MODE")
print(f"Current OS User: {os.getlogin() if hasattr(os, 'getlogin') else os.environ.get('USERNAME')}")
print(f"Credentials Directory: {CREDENTIALS_DIR}")

MSSQL_USER = get_db_cred("SQLUSER.txt")
MSSQL_PASS = get_db_cred("SQLPASS.txt")
MSSQL_HOST = get_db_cred("SQLHOST.txt")
MSSQL_NAME = get_db_cred("SQLNAME2.txt")

print(f"Found Host: {MSSQL_HOST}")
print(f"Found User: {MSSQL_USER}")
print(f"Found DB Name: {MSSQL_NAME}")
print(f"Found Password: {'***' if MSSQL_PASS else 'NONE'}")
print("="*50 + "\n")

IS_BUILDING = 'PyInstaller' in sys.modules or os.environ.get('PYINSTALLER_BUILD') == '1'
USE_MSSQL = False

if not IS_BUILDING and all([MSSQL_USER, MSSQL_PASS, MSSQL_HOST, MSSQL_NAME]):
    try:
        # Constructing the connection string with driver-level timeout
        conn_str = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={MSSQL_HOST};"
            f"DATABASE={MSSQL_NAME};"
            f"UID={MSSQL_USER};"
            f"PWD={MSSQL_PASS};"
            f"LoginTimeout=10;"
            f"TrustServerCertificate=yes;" 
        )
        
        print(f"DEBUG: Attempting pyodbc.connect with SERVER={MSSQL_HOST} (10s timeout)...")
        # Diagnostic test connection
        test_conn = pyodbc.connect(conn_str, timeout=10)
        test_conn.close()
        USE_MSSQL = True
        print("SUCCESS: MSSQL Connection test passed.")
    except Exception as e:
        print(f"CRITICAL ERROR during MSSQL connection test:")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Details: {e}")
        print("Falling back to local SQLite database.")
elif IS_BUILDING:
    print("SKIPPING MSSQL: Build Process Detected.")
else:
    print("SKIPPING MSSQL: Missing credentials files in Documents/Portal.")

if USE_MSSQL:
    DATABASES = {
        'default': {
            'ENGINE': 'mssql',
            'NAME': MSSQL_NAME,
            'USER': MSSQL_USER,
            'PASSWORD': MSSQL_PASS,
            'HOST': MSSQL_HOST,
            'PORT': '',
            'OPTIONS': {
                'driver': 'ODBC Driver 18 for SQL Server',
                'connection_timeout': 10,
                'extra_params': 'TrustServerCertificate=yes',
            },
        }
    }
else:
    # Use the writable user directory to avoid permission issues in C:\Program Files\
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': CREDENTIALS_DIR / 'ac_shunt_local.db.sqlite3',
        }
    }

# ---------------------------------------------------------
# 3. STANDARD DJANGO SETTINGS
# ---------------------------------------------------------
SECRET_KEY = 'django-insecure-*#_^+sice+xmm)=9s@(7b%fz#nmtmim+=rap_6g1c_-az5wn_g'
DEBUG = True
ALLOWED_HOSTS = ['10.206.104.144', '127.0.0.1', 'localhost', '*']

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'api',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ac_shunt.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'ac_shunt.wsgi.application'
ASGI_APPLICATION = 'ac_shunt.asgi.application'

CORS_ALLOW_ALL_ORIGINS = True

AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'}]
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}