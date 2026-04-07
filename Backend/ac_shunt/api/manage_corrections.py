# api/manage_corrections.py

import os
import json
import hashlib
import pandas as pd
from django.db import transaction
from django.conf import settings # Use central settings for path resolution
from api.models import Shunt, ShuntCorrection, TVC, TVCCorrection

# Use absolute paths provided by settings.py
# In dev: resolves to BASE_DIR / corrections.xlsx
# In prod: resolves to _internal / corrections.xlsx
EXCEL_FILE = settings.CORRECTIONS_FILE 

# The hash file should live in the writable Portal directory to track changes across sessions
HASH_FILE = os.path.join(settings.CREDENTIALS_DIR, 'corrections_hash.json')

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
        
        records = df.to_dict('records')
        print(f"Shunt data processing: Found {len(records)} valid correction records.")
        return records
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
    
    if all_tvcs:
        print(f"TVC data processing: Found {len(all_tvcs)} TVC units ({', '.join(all_tvcs.keys())}).")
    else:
        print("TVC data processing: No TVC sheets identified.")
        
    return all_tvcs

# ==============================================================================
#  DATABASE UPDATE LOGIC
# ==============================================================================

def update_shunt_records(shunt_data):
    """
    Synchronizes the database with the provided shunt correction data.

    This function performs an efficient "surgical" update. It compares the
    data from the Excel file with records in the database. It then creates
    new records, updates existing ones if values have changed, and deletes
    any records from the database that are no longer present in the file,
    EXCEPT those marked as manual entries.
    """
    # Load existing corrections and their parent shunt details
    db_corrections = {
        (c.shunt.serial_number, c.shunt.range, c.shunt.current, c.frequency): c
        for c in ShuntCorrection.objects.select_related('shunt').all()
    }

    file_keys = set()
    to_create = []
    to_update = []
    shunts_to_update = {}

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

            # Update model/remark if they changed in the Excel file
            if shunt_instance.model_name != model or shunt_instance.remark != remark_val:
                shunt_instance.model_name = model
                shunt_instance.remark = remark_val
                shunts_to_update[shunt_instance.id] = shunt_instance
            
            # Update correction values
            if (correction_obj.correction != row['correction'] or 
                correction_obj.uncertainty != row['uncertainty']):
                correction_obj.correction = row['correction']
                correction_obj.uncertainty = row['uncertainty']
                to_update.append(correction_obj)
        else:
            # Create new records for data found in Excel
            shunt_instance, _ = Shunt.objects.get_or_create(
                serial_number=serial,
                range=shunt_range,
                current=shunt_current,
                defaults={'model_name': model, 'remark': remark_val, 'is_manual': False}
            )
            
            to_create.append(
                ShuntCorrection(
                    shunt=shunt_instance,
                    frequency=row['frequency'],
                    correction=row['correction'],
                    uncertainty=row['uncertainty']
                )
            )
            
    # --- UPDATED DELETION LOGIC ---
    # Only delete records that are missing from the file AND are not marked as manual
    pks_to_delete = [
        c.pk for key, c in db_corrections.items() 
        if key not in file_keys and not c.shunt.is_manual
    ]

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

    # Cleanup orphaned shunts that aren't manual entries
    Shunt.objects.filter(corrections__isnull=True, is_manual=False).delete()


def update_tvc_records(tvc_data):
    """
    Synchronizes the database with the provided TVC correction data.
    Preserves manual entries during the synchronization.
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
                        defaults={'test_voltage': data['test_voltage'], 'is_manual': False}
                    )
                    tvc_cache[serial_number] = tvc_instance
                tvc_instance = tvc_cache[serial_number]
                to_create.append(
                    TVCCorrection(tvc=tvc_instance, **corr)
                )

    # --- UPDATED DELETION LOGIC ---
    # Only delete records missing from file that are not manual
    pks_to_delete = [
        c.pk for key, c in db_corrections.items() 
        if key not in file_keys and not c.tvc.is_manual
    ]

    if pks_to_delete:
        TVCCorrection.objects.filter(pk__in=pks_to_delete).delete()
        print(f"Deleted {len(pks_to_delete)} old TVC correction records.")
    if to_create:
        TVCCorrection.objects.bulk_create(to_create)
        print(f"Created {len(to_create)} new TVC correction records.")
    if to_update:
        TVCCorrection.objects.bulk_update(to_update, ['ac_dc_difference', 'expanded_uncertainty'])
        print(f"Updated {len(to_update)} existing TVC correction records.")
    
    # Cleanup orphaned TVCs that aren't manual entries
    TVC.objects.filter(corrections__isnull=True, is_manual=False).delete()


# ==============================================================================
#  MAIN ORCHESTRATION FUNCTION
# ==============================================================================

def check_and_update_corrections():
    """
    Orchestrates the update process. Uses absolute paths from settings.
    """
    print(f"Checking for corrections update at: {EXCEL_FILE}")
    if not os.path.exists(EXCEL_FILE):
        print(f"Warning: Corrections file not found at {EXCEL_FILE}")
        return

    try:
        xls = pd.ExcelFile(EXCEL_FILE)
    except Exception as e:
        print(f"Error: Could not read Excel file: {e}")
        return

    all_data = {
        'shunts': process_shunt_data(xls),
        'tvcs': process_tvc_data(xls)
    }

    if all_data['shunts'] is None:
        print("Halting update due to error in processing shunt data.")
        return

    print(f"Processing complete. Found {len(all_data['shunts'])} Shunt correction points and {len(all_data['tvcs'])} TVC units.")

    if not all_data['shunts'] and not all_data['tvcs']:
        print("No valid data processed from Excel file.")
        return

    json_bytes = json.dumps(all_data, sort_keys=True, default=str).encode('utf-8')
    current_hash = hashlib.sha256(json_bytes).hexdigest()
    
    stored_hash = ""
    if os.path.exists(HASH_FILE):
        with open(HASH_FILE, 'r') as f:
            stored_hash = f.read()

    if current_hash != stored_hash:
        print("Excel change detected. Updating database records...")
        try:
            with transaction.atomic():
                print("--- Processing Shunts ---")
                update_shunt_records(all_data['shunts'])
                print("--- Processing TVCs ---")
                update_tvc_records(all_data['tvcs'])
            
            with open(HASH_FILE, 'w') as f:
                f.write(current_hash)
            print("Database synchronization complete.")
        except Exception as e:
            print(f"Database update failed: {e}")
    else:
        print("Database is already synchronized with Excel data.")