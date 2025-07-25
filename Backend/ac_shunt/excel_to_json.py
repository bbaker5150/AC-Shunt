import pandas as pd
import json
import numpy as np
import argparse

def excel_to_json(excel_file_path, json_file_path, sheet_name):
    try:
        df = pd.read_excel(excel_file_path, sheet_name=sheet_name, header=[0, 1])

        if ('Remarks', 'Remarks') in df.columns:
            df = df.drop(('Remarks', 'Remarks'), axis=1)

        df.columns = [
            f'{col[0].strip()}_{col[1]}' if col[0].strip() not in ['Range (A)', 'Input (A)']
            else col[0].strip()
            for col in df.columns
        ]

        range_col = df.columns[0]
        input_col = df.columns[1]
        freq_cols = df.columns[2:]

        data_list = []

        for _, row in df.iterrows():
            range_val = row[range_col]
            current_val = row[input_col]

            if pd.isna(range_val) and pd.isna(current_val):
                continue

            for freq_col in freq_cols:
                value = row[freq_col]

                if not pd.isna(value):
                    try:
                        freq = int(freq_col.split('_')[-1])
                        data_list.append({
                            'range': float(range_val),
                            'current': float(current_val),
                            'frequency': freq,
                            'value': float(value)
                        })
                    except (ValueError, IndexError):
                        continue

        with open(json_file_path, 'w') as f:
            json.dump(data_list, f, indent=4)

        print(f"Converted sheet '{sheet_name}' to '{json_file_path}'. Generated {len(data_list)} records.")
        return json_file_path
    except FileNotFoundError:
        print(f"Error: The file '{excel_file_path}' was not found.")
        return None
    except ValueError as ve:
        print(f"Error: Sheet '{sheet_name}' not found. Details: {ve}")
        return None
    except Exception as e:
        print(f"An error occurred during conversion: {e}")
        return None

if __name__ == '__main__':
    EXCEL_FILE = 'corrections.xlsx'
    SHEET_MAP = {
        'correction': {'sheet': 'AC_Shunt_Corrections', 'json': 'correction_data.json'},
        'uncertainty': {'sheet': 'AC_Shunt_Uncertainties', 'json': 'uncertainty_data.json'},
    }
    parser = argparse.ArgumentParser(description='Convert a specific sheet from an Excel file to JSON.')
    parser.add_argument('type', choices=SHEET_MAP.keys(), help='Type of data to process (correction or uncertainty).')
    args = parser.parse_args()
    config = SHEET_MAP[args.type]
    excel_to_json(EXCEL_FILE, config['json'], config['sheet'])