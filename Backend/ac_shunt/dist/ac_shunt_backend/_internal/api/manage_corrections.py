# api/manage_corrections.py

import os
import json
import hashlib
import pandas as pd
from django.db import transaction
from api.models import Shunt, ShuntCorrection, TVC, TVCCorrection

# --- Settings ---
EXCEL_FILE = 'corrections.xlsx'
HASH_FILE = 'corrections_hash.json'

# ==============================================================================
#  DATA PROCESSING FUNCTIONS
# ==============================================================================

def process_shunt_data(xls):
    """
    Reads shunt correction and uncertainty data from designated Excel sheets.

    This function extracts data from 'AC Shunt Corrections' and 
    'AC Shunt Uncertainties' sheets, merges them, and cleans the data by
    unpivoting frequency columns. It then extracts model name and serial 
    number from a 'Remarks' column and formats the final data structure.

    Args:
        xls (pd.ExcelFile): An open pandas ExcelFile object.

    Returns:
        list[dict] or None: A list of dictionaries, where each dictionary 
                            represents a single shunt correction record. 
                            Returns None if a processing error occurs.
    """
    try:
        df_corr = pd.read_excel(xls, sheet_name='AC Shunt Corrections', header=1)
        df_unc = pd.read_excel(xls, sheet_name='AC Shunt Uncertainties', header=1)
        
        df_corr = df_corr.loc[:, ~df_corr.columns.duplicated()]
        df_unc = df_unc.loc[:, ~df_unc.columns.duplicated()]

        id_vars = [col for col in df_corr.columns if isinstance(col, str)]
        freq_vars = [col for col in df_corr.columns if isinstance(col, (int, float))]
        
        melted_corr = df_corr.melt(id_vars=id_vars, value_vars=freq_vars, var_name='frequency', value_name='correction').dropna(subset=['correction'])
        melted_unc = df_unc.melt(id_vars=id_vars, value_vars=freq_vars, var_name='frequency', value_name='uncertainty').dropna(subset=['uncertainty'])
        
        merge_cols = id_vars + ['frequency']
        df = pd.merge(melted_corr, melted_unc, on=merge_cols, how='outer')
        
        df['Remarks'] = df['Remarks'].astype(str)
        
        df['serial_number'] = df['Remarks'].str.extract(r'sn\s*(\S+)', expand=False)
        df['model_name'] = df['Remarks'].str.extract(r'(.*?)\s*sn', expand=False).str.strip()
        
        df.rename(columns={
            'Range (A)': 'range', 
            'Input (A)': 'current',
            'Remarks': 'remark'
        }, inplace=True)
        
        final_cols = ['model_name', 'serial_number', 'range', 'current', 'frequency', 'correction', 'uncertainty', 'remark']
        
        df = df[final_cols].dropna(subset=['serial_number', 'range', 'current', 'frequency'])
        return df.to_dict('records')
    except Exception as e:
        print(f"Error processing Shunt sheets: {e}")
        return None

def process_tvc_data(xls):
    """
    Parses Thermal Voltage Converter (TVC) data from multiple Excel sheets.

    This function iterates through all sheets in the provided Excel file.
    For each sheet with a name containing "TVC SN", it extracts the serial
    number, test voltage, and a series of frequency-dependent corrections 
    and uncertainties, returning them in a structured dictionary.

    Args:
        xls (pd.ExcelFile): An open pandas ExcelFile object.

    Returns:
        dict: A dictionary where each key is a TVC serial number and the value
              is another dictionary containing the TVC's details and a list 
              of its correction records.
    """
    all_tvcs = {}
    for sheet_name in xls.sheet_names:
        if "TVC SN" not in sheet_name.upper():
            continue
        
        try:
            df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
            
            serial_number = int(df.iloc[0, 1])
            test_voltage = float(df.iloc[1, 1])

            frequencies = df.iloc[3, 1:].dropna().values
            ac_dc_diffs = df.iloc[4, 1:].dropna().values
            uncertainties = df.iloc[5, 1:].dropna().values

            df_final = pd.DataFrame({
                'frequency': frequencies,
                'ac_dc_difference': ac_dc_diffs,
                'expanded_uncertainty': uncertainties
            })
            
            for col in df_final.columns:
                df_final[col] = pd.to_numeric(df_final[col])

            all_tvcs[str(serial_number)] = {
                'serial_number': serial_number,
                'test_voltage': test_voltage,
                'corrections': df_final.to_dict('records')
            }
        except Exception as e:
            print(f"Error processing TVC sheet '{sheet_name}': {e}")
            continue
    return all_tvcs

# ==============================================================================
#  MODIFIED DATABASE UPDATE LOGIC
# ==============================================================================

def update_shunt_records(shunt_data):
    """
    Synchronizes the database with the provided shunt correction data.

    This function performs an efficient "surgical" update. It compares the
    data from the Excel file with records in the database. It then creates
    new records, updates existing ones if values have changed, and deletes
    any records from the database that are no longer present in the file.
    It also cleans up any orphan Shunt records that have no associated corrections.

    Args:
        shunt_data (list[dict]): A list of shunt correction data records
                                 processed from the Excel file.
    """
    # --- FIX: The key now only uses truly unique fields ---
    db_corrections = {
        (c.shunt.serial_number, c.shunt.range, c.shunt.current, c.frequency): c
        for c in ShuntCorrection.objects.select_related('shunt').all()
    }

    file_keys = set()
    to_create = []
    to_update = []
    shunts_to_update = {} # Used to track model_name changes

    for row in shunt_data:
        try:
            model = str(row['model_name'])
            serial = str(row['serial_number'])
            shunt_range = float(row['range'])
            shunt_current = float(row['current'])
            remark_val = str(row.get('remark', ''))
        except (ValueError, TypeError) as e:
            print(f"WARNING: Could not process row due to data type issue: {row}. Error: {e}")
            continue

        correction_key = (serial, shunt_range, shunt_current, row['frequency'])
        file_keys.add(correction_key)

        if correction_key in db_corrections:
            correction_obj = db_corrections[correction_key]
            shunt_instance = correction_obj.shunt

            # <-- CHANGE 1: Modified condition to also check if the remark has changed.
            if shunt_instance.model_name != model or shunt_instance.remark != remark_val:
                shunt_instance.model_name = model
                shunt_instance.remark = remark_val
                shunts_to_update[shunt_instance.id] = shunt_instance
            
            # Check if correction values need an update
            if (correction_obj.correction != row['correction'] or 
                correction_obj.uncertainty != row['uncertainty']):
                correction_obj.correction = row['correction']
                correction_obj.uncertainty = row['uncertainty']
                to_update.append(correction_obj)
        else:
            # Logic for creating new records
            # <-- CHANGE 2: Added 'remark' to the defaults dictionary for new records.
            shunt_instance, _ = Shunt.objects.get_or_create(
                serial_number=serial,
                range=shunt_range,
                current=shunt_current,
                defaults={'model_name': model, 'remark': remark_val}
            )
            
            to_create.append(
                ShuntCorrection(
                    shunt=shunt_instance,
                    frequency=row['frequency'],
                    correction=row['correction'],
                    uncertainty=row['uncertainty']
                )
            )
            
    pks_to_delete = [c.pk for key, c in db_corrections.items() if key not in file_keys]

    if pks_to_delete:
        ShuntCorrection.objects.filter(pk__in=pks_to_delete).delete()
        print(f"Deleted {len(pks_to_delete)} old Shunt correction records.")
    if to_create:
        ShuntCorrection.objects.bulk_create(to_create)
        print(f"Created {len(to_create)} new Shunt correction records.")
    if to_update:
        ShuntCorrection.objects.bulk_update(to_update, ['correction', 'uncertainty'])
        print(f"Updated {len(to_update)} existing Shunt correction values.")
    if shunts_to_update:
        Shunt.objects.bulk_update(list(shunts_to_update.values()), ['model_name', 'remark'])
        print(f"Updated {len(shunts_to_update)} Shunt model names.")

    Shunt.objects.filter(corrections__isnull=True).delete()


def update_tvc_records(tvc_data):
    """
    Synchronizes the database with the provided TVC correction data.

    This function performs an efficient "surgical" update. It compares the
    data from the Excel file with records in the database. It then creates
    new records, updates existing ones if values have changed, and deletes

    any records from the database that are no longer present in the file.
    It also cleans up any orphan TVC records that have no associated corrections.
    Args:
        tvc_data (dict): A dictionary of TVC data, keyed by serial number,
                         processed from the Excel file.
    """
    file_keys = set()
    db_corrections = {
        (c.tvc.serial_number, c.frequency): c
        for c in TVCCorrection.objects.select_related('tvc').all()
    }
    to_create = []
    to_update = []
    tvc_cache = {}

    for sn, data in tvc_data.items():
        for corr in data['corrections']:
            key = (data['serial_number'], corr['frequency'])
            file_keys.add(key)
            if key in db_corrections:
                correction_obj = db_corrections[key]
                if (correction_obj.ac_dc_difference != corr['ac_dc_difference'] or
                    correction_obj.expanded_uncertainty != corr['expanded_uncertainty']):
                    correction_obj.ac_dc_difference = corr['ac_dc_difference']
                    correction_obj.expanded_uncertainty = corr['expanded_uncertainty']
                    to_update.append(correction_obj)
            else:
                serial_number = data['serial_number']
                if serial_number not in tvc_cache:
                    tvc_instance, _ = TVC.objects.get_or_create(
                        serial_number=serial_number,
                        defaults={'test_voltage': data['test_voltage']}
                    )
                    tvc_cache[serial_number] = tvc_instance
                tvc_instance = tvc_cache[serial_number]
                to_create.append(
                    TVCCorrection(tvc=tvc_instance, **corr)
                )

    pks_to_delete = [c.pk for key, c in db_corrections.items() if key not in file_keys]

    if pks_to_delete:
        TVCCorrection.objects.filter(pk__in=pks_to_delete).delete()
        print(f"Deleted {len(pks_to_delete)} old TVC correction records.")
    if to_create:
        TVCCorrection.objects.bulk_create(to_create)
        print(f"Created {len(to_create)} new TVC correction records.")
    if to_update:
        TVCCorrection.objects.bulk_update(to_update, ['ac_dc_difference', 'expanded_uncertainty'])
        print(f"Updated {len(to_update)} existing TVC correction records.")
    
    TVC.objects.filter(corrections__isnull=True).delete()


# ==============================================================================
#  MAIN ORCHESTRATION FUNCTION
# ==============================================================================
def check_and_update_corrections():
    """
    Orchestrates the entire correction data update process.

    This function serves as the main entry point. It checks for the existence
    of the corrections Excel file, processes its contents, and generates a
    SHA256 hash of the data. This hash is compared against a stored hash to
    detect changes. If a change is detected, it updates the database within
    a single transaction and writes the new hash to a file upon success.
    """
    print("Checking for corrections file updates...")
    if not os.path.exists(EXCEL_FILE):
        print(f"'{EXCEL_FILE}' not found."); return
    try:
        xls = pd.ExcelFile(EXCEL_FILE)
    except Exception as e:
        print(f"Could not read Excel file: {e}"); return
    all_data = {
        'shunts': process_shunt_data(xls),
        'tvcs': process_tvc_data(xls)
    }
    if all_data['shunts'] is None:
        print("Halting update due to error in processing shunt data.")
        return
    if not all_data['shunts'] and not all_data['tvcs']:
        print("No valid data processed from Excel file."); return
    json_bytes = json.dumps(all_data, sort_keys=True, default=str).encode('utf-8')
    current_hash = hashlib.sha256(json_bytes).hexdigest()
    stored_hash = ""
    if os.path.exists(HASH_FILE):
        with open(HASH_FILE, 'r') as f: stored_hash = f.read()
    if current_hash != stored_hash:
        print("Change detected in the Excel file. Updating database...")
        try:
            with transaction.atomic():
                print("--- Processing Shunts ---")
                update_shunt_records(all_data['shunts'])
                print("--- Processing TVCs ---")
                update_tvc_records(all_data['tvcs'])
            with open(HASH_FILE, 'w') as f: f.write(current_hash)
            print("\nDatabase update successful.")
        except Exception as e:
            print(f"\nAn error occurred during the update process: {e}")
            print("The hash file will not be updated.")
    else:
        print("No changes detected. Database is up to date.")