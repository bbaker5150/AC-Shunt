import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const TVCCorrections = ({ handleClose, showNotification }) => {
    const { selectedSessionId } = useInstruments();

    const [instruments, setInstruments] = useState({
        'Standard Instrument': {
            serial_number: '',
            test_voltage: '',
            frequencies: [],
            ac_dc_difference: [],
            expanded_uncertainty: [],
            has_data: false,
        },
        'Test Instrument': {
            serial_number: '',
            test_voltage: '',
            frequencies: [],
            ac_dc_difference: [],
            expanded_uncertainty: [],
            has_data: false,
        },
    });

    useEffect(() => {
        const fetchTVCCorrections = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`);
                const corrections = response.data.tvc_corrections;

                const transformFetchedDataForDisplay = (instrumentData) => {
                    if (!instrumentData || !Array.isArray(instrumentData.measurements) || instrumentData.measurements.length === 0) {
                        return {
                            serial_number: '',
                            test_voltage: '',
                            frequencies: [],
                            ac_dc_difference: [],
                            expanded_uncertainty: [],
                            has_data: false,
                        };
                    }
                    const { serial_number = '', test_voltage = '', measurements = [] } = instrumentData;

                    return {
                        serial_number,
                        test_voltage,
                        frequencies: measurements.map(m => m.frequency),
                        ac_dc_difference: measurements.map(m => m.ac_dc_difference),
                        expanded_uncertainty: measurements.map(m => m.expanded_uncertainty),
                        has_data: true,
                    };
                };

                const newInstruments = {
                    'Standard Instrument': transformFetchedDataForDisplay(corrections.Standard),
                    'Test Instrument': transformFetchedDataForDisplay(corrections.Test),
                };

                setInstruments(newInstruments);

            } catch (error) {
                console.error('Error fetching TVC corrections:', error);
                const defaultInstrumentState = {
                    serial_number: '',
                    test_voltage: '',
                    frequencies: [],
                    ac_dc_difference: [],
                    expanded_uncertainty: [],
                    has_data: false,
                };
                setInstruments({
                    'Standard Instrument': defaultInstrumentState,
                    'Test Instrument': defaultInstrumentState,
                });
            }
        };

        if (selectedSessionId) {
            fetchTVCCorrections();
        }
    }, [selectedSessionId]);

    function parseInstrumentData(jsonData) {
        let serial = '', voltage = '', freqs = [], diff = [], uncertainty = [];

        jsonData.forEach(row => {
            if (Array.isArray(row)) {
                const cell = String(row[0]).trim();
                if (cell.startsWith('Serial Number')) serial = String(row[1] || '').trim();
                else if (cell.startsWith('Test Voltage')) voltage = String(row[1] || '').trim();
                else if (cell.startsWith('Applied Frequencies')) freqs = row.slice(1).filter(c => typeof c === 'number');
                else if (cell.startsWith('AC-DC Difference')) diff = row.slice(1).filter(c => typeof c === 'number');
                else if (cell.startsWith('Expanded Uncertainty')) uncertainty = row.slice(1).filter(c => typeof c === 'number');
            }
        });

        return { serial, voltage, freqs, diff, uncertainty };
    }

    async function handleFileUpload(event, instrumentTitle) {
        const file = event.target.files[0];

        if (!file) {
            return;
        }

        try {
            const fileData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    resolve(e.target.result);
                };
                reader.onerror = (error) => {
                    reject(error);
                };
                reader.readAsArrayBuffer(file);
            });

            const data = new Uint8Array(fileData);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

            const { serial, voltage, freqs, diff, uncertainty } = parseInstrumentData(jsonData);

            const updatedInstrumentsState = {
                ...instruments,
                [instrumentTitle]: {
                    ...instruments[instrumentTitle],
                    serial_number: serial,
                    test_voltage: voltage,
                    frequencies: freqs,
                    ac_dc_difference: diff,
                    expanded_uncertainty: uncertainty,
                    has_data: true
                }
            };

            setInstruments(updatedInstrumentsState);
            event.target.value = null;

        } catch (error) {
            console.error('Error in handleFileUpload:', error);
            showNotification('Error importing data or saving corrections.', 'error');
        }
    };

    const handleTableDataChange = (instrumentTitle, fieldName, index, value) => {
        setInstruments(prevInstruments => {
            const updatedInstrument = { ...prevInstruments[instrumentTitle] };
            const updatedArray = [...updatedInstrument[fieldName]];
            updatedArray[index] = value;

            return {
                ...prevInstruments,
                [instrumentTitle]: {
                    ...updatedInstrument,
                    [fieldName]: updatedArray,
                },
            };
        });
    };

    const handleInfoFieldChange = (instrumentTitle, fieldName, value) => {
        setInstruments(prevInstruments => ({
            ...prevInstruments,
            [instrumentTitle]: {
                ...prevInstruments[instrumentTitle],
                [fieldName]: value,
            },
        }));
    };

    async function handleSave() {
        if (!selectedSessionId) {
            console.error("No session ID selected. Cannot save data.");
            return;
        }

        const transformInstrumentDataForSave = (instrument) => {
            const measurements = instrument.frequencies.map((freq, index) => ({
                frequency: parseFloat(freq),
                ac_dc_difference: parseFloat(instrument.ac_dc_difference[index]),
                expanded_uncertainty: parseFloat(instrument.expanded_uncertainty[index]),
            }));

            return {
                serial_number: instrument.serial_number,
                test_voltage: instrument.test_voltage,
                measurements: measurements,
            };
        };

        const tvcPayload = {
            tvc_corrections: {
                Standard: transformInstrumentDataForSave(instruments['Standard Instrument']),
                Test: transformInstrumentDataForSave(instruments['Test Instrument']),
            },
        };

        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, tvcPayload);
            showNotification('TVC Corrections saved successfully.', 'success');
            handleClose();
        } catch (error) {
            console.error('Error saving TVC corrections:', error);
            showNotification('Error saving corrections.', 'error');
        }
    }

    const hasAnyDataImported = Object.values(instruments).some(instrument => instrument.has_data);

    return (
        <div className={`tvc-corrections-main-container ${!hasAnyDataImported ? 'tvc-corrections-main-container--initial' : ''}`}>
            <div className="tvc-corrections-modal-header">
                <h2 className="tvc-corrections-modal-title">TVC Corrections</h2>
                <button type="button" className="tvc-corrections-close-button" onClick={handleClose}>&times;</button>
            </div>

            {Object.keys(instruments).map((instrumentTitle, index) => {
                const instrument = instruments[instrumentTitle];
                return (
                    <div key={index} className="tvc-corrections-instrument-section">
                        <div className="tvc-corrections-header-row">
                            <h3 className="tvc-corrections-instrument-subtitle">{instrumentTitle}</h3>
                            <div className="tvc-corrections-button-group">
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    id={`file-input-${index}`}
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleFileUpload(e, instrumentTitle)}
                                />
                                <button
                                    type="button"
                                    onClick={() => document.getElementById(`file-input-${index}`).click()}
                                    className="button"
                                >
                                    Import Excel
                                </button>

                            </div>
                        </div>

                        {instrument.has_data ? (
                            <>
                                <div className="tvc-corrections-info-fields-container">
                                    <div className="tvc-corrections-info-field">
                                        <label htmlFor={`serial-number-${index}`} className="tvc-corrections-label">Serial Number</label>
                                        <input
                                            type="text"
                                            id={`serial-number-${index}`}
                                            value={instrument.serial_number}
                                            onChange={(e) => handleInfoFieldChange(instrumentTitle, 'serial_number', e.target.value)}
                                            className="tvc-corrections-input-field"
                                        />
                                    </div>
                                    <div className="tvc-corrections-info-field">
                                        <label htmlFor={`test-voltage-${index}`} className="tvc-corrections-label">Test Voltage (V)</label>
                                        <input
                                            type="text"
                                            id={`test-voltage-${index}`}
                                            value={instrument.test_voltage}
                                            onChange={(e) => handleInfoFieldChange(instrumentTitle, 'test_voltage', e.target.value)}
                                            className="tvc-corrections-input-field"
                                        />
                                    </div>
                                </div>

                                <table className="tvc-corrections-table">
                                    <tbody>
                                        <tr className="tvc-corrections-table-row">
                                            <td className="tvc-corrections-table-row-header">Applied Frequencies (Hz)</td>
                                            {instrument.frequencies.map((freq, idx) => (
                                                <td key={`freq-${index}-${idx}`} className="tvc-corrections-table-cell">
                                                    <input
                                                        type="text"
                                                        value={freq}
                                                        onChange={(e) => handleTableDataChange(instrumentTitle, 'frequencies', idx, e.target.value)}
                                                        className="tvc-corrections-data-input"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                        <tr className="tvc-corrections-table-row">
                                            <td className="tvc-corrections-table-row-header">AC-DC Difference (ppm)</td>
                                            {instrument.ac_dc_difference.map((diff, idx) => (
                                                <td key={`diff-${index}-${idx}`} className="tvc-corrections-table-cell">
                                                    <input
                                                        type="text"
                                                        value={diff}
                                                        onChange={(e) => handleTableDataChange(instrumentTitle, 'ac_dc_difference', idx, e.target.value)}
                                                        className="tvc-corrections-data-input"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                        <tr className="tvc-corrections-table-row">
                                            <td className="tvc-corrections-table-row-header">Expanded Uncertainty (ppm)</td>
                                            {instrument.expanded_uncertainty.map((uncert, idx) => (
                                                <td key={`uncert-${index}-${idx}`} className="tvc-corrections-table-cell">
                                                    <input
                                                        type="text"
                                                        value={uncert}
                                                        onChange={(e) => handleTableDataChange(instrumentTitle, 'expanded_uncertainty', idx, e.target.value)}
                                                        className="tvc-corrections-data-input"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </>
                        ) : (
                            <p className="tvc-corrections-no-data-message">
                                Please import an Excel file to view instrument details.
                            </p>
                        )}
                    </div>
                );
            })}
            {hasAnyDataImported && (
                <div className="tvc-corrections-modal-footer">
                    <button type="button" className="button" onClick={handleSave}>Save</button>
                </div>
            )}
        </div>
    );
}

export default TVCCorrections;