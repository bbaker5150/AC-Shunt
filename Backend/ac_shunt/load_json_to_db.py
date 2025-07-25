import os
import django
import json
import argparse
from django.db import transaction, connection

DJANGO_PROJECT_NAME = 'ac_shunt'
DJANGO_APP_NAME = 'api'

os.environ.setdefault('DJANGO_SETTINGS_MODULE', f'{DJANGO_PROJECT_NAME}.settings')
django.setup()

from api.models import Correction, Uncertainty

def load_json_to_db(json_file_path, model_class, table_name_suffix):
    if not json_file_path:
        print("JSON file path is empty. Exiting.")
        return
    
    print(f"Starting data load into '{model_class.__name__}' model...")
    try:
        with open(json_file_path, 'r') as f:
            data_list = json.load(f)
        print(f"Read {len(data_list)} records from '{json_file_path}'.")
        
        print("Clearing existing data...")
        model_class.objects.all().delete()
        print("Table cleared.")
        
        table_name = f'{DJANGO_APP_NAME}_{table_name_suffix}'
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM sqlite_sequence WHERE name=%s", [table_name])
            print(f"ID counter for table '{table_name}' has been reset.")
        
        with transaction.atomic():
            for item in data_list:
                try:
                    if model_class.__name__ == 'Correction':
                        model_class.objects.create(
                            range=item['range'],
                            current=item['current'],
                            frequency=item['frequency'],
                            correction=item['value']
                        )
                    elif model_class.__name__ == 'Uncertainty':
                        model_class.objects.create(
                            range=item['range'],
                            current=item['current'],
                            frequency=item['frequency'],
                            uncertainty=item['value']
                        )
                except Exception as e:
                    print(f"Error creating record: {e}. Item: {item}")
        
        print(f"Successfully inserted all records for '{model_class.__name__}'.")
        print(f"Total records now in database: {model_class.objects.count()}")
    except FileNotFoundError:
        print(f"Error: The file '{json_file_path}' was not found.")
    except json.JSONDecodeError:
        print(f"Error: The file '{json_file_path}' is not a valid JSON file.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == '__main__':
    MODEL_MAP = {
        'correction': {'model': Correction, 'json': 'correction_data.json', 'table_suffix': 'correction'},
        'uncertainty': {'model': Uncertainty, 'json': 'uncertainty_data.json', 'table_suffix': 'uncertainty'},
    }
    parser = argparse.ArgumentParser(description='Load data from a JSON file into a Django model.')
    parser.add_argument('type', choices=MODEL_MAP.keys(), help='Type of data to load (correction or uncertainty).')
    args = parser.parse_args()
    config = MODEL_MAP[args.type]
    load_json_to_db(config['json'], config['model'], config['table_suffix'])