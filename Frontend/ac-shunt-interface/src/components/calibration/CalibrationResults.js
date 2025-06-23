import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from "xlsx";
import { useInstruments } from '../../contexts/InstrumentContext';
import { FaDownload } from 'react-icons/fa';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

function CalibrationResults({ showNotification }) {
    const { selectedSessionId } = useInstruments();
    const [sessionInfo, setSessionInfo] = useState(null);
    const [calResults, setCalResults] = useState(null); // For calculated stats
    const [calReadings, setCalReadings] = useState(null); // For raw readings

    // The backend now supplies default values for new sessions.

    const calInfoHeaders = [
        'TI Model',
        'TI Serial',
        'STD Model',
        'STD Serial',
        'Calibration Date',
        'Temperature',
        'Humidity'
    ];

    const readingHeadersHeaders = [
        '#',
        'AC Open',
        'Diff vs Avg',
        'Deviation',
        'DCV+',
        'Diff vs Avg',
        'Deviation',
        'DCV-',
        'Diff vs Avg',
        'Deviation',
        'AC Close',
        'Diff vs Avg',
        'Deviation',
    ];

    // This function simply fetches data and sets state.
    const fetchCalibrationData = useCallback(async () => {
        if (!selectedSessionId) {
            setSessionInfo(null);
            setCalResults(null);
            setCalReadings(null);
            return;
        }
        try {
            const sessionResponse = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`);
            setSessionInfo(sessionResponse.data);

            const resultsResponse = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/results/`);
            setCalResults(resultsResponse.data);

            const readingsResponse = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/readings/`);
            setCalReadings(readingsResponse.data);

        } catch (error) {
            console.error("Failed to fetch calibration data:", error);
            showNotification('Failed to load calibration data.', 'error');
            setSessionInfo(null);
            setCalResults(null);
            setCalReadings(null);
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchCalibrationData();
    }, [fetchCalibrationData]);


    const exportTableToXLSX = (tableId, sheetName, fileName, stats, readingsData) => {
        const table = document.getElementById(tableId);
        if (!table) {
            alert(`Table with ID "${tableId}" not found!`);
            return;
        }

        const tableRows = Array.from({ length: Math.max(
            (readingsData.acOpenReadings || []).length,
            (readingsData.dcPosReadings || []).length,
            (readingsData.dcNegReadings || []).length,
            (readingsData.acCloseReadings || []).length
        )}).map((_, index) => {
            const readingAcOpen = readingsData.acOpenReadings[index] !== undefined ? readingsData.acOpenReadings[index] : '';
            const readingDcPos = readingsData.dcPosReadings[index] !== undefined ? readingsData.dcPosReadings[index] : '';
            const readingDcNeg = readingsData.dcNegReadings[index] !== undefined ? readingsData.dcNegReadings[index] : '';
            const readingAcClose = readingsData.acCloseReadings[index] !== undefined ? readingsData.acCloseReadings[index] : '';

            const currentAcOpenAvg = stats.acOpenAvg;
            const currentAcOpenStddev = stats.acOpenStd;
            const currentDcPosAvg = stats.dcPosAvg;
            const currentDcPosStddev = stats.dcPosStd;
            const currentDcNegAvg = stats.dcNegAvg;
            const currentDcNegStddev = stats.dcNegStd;
            const currentAcCloseAvg = stats.acCloseAvg;
            const currentAcCloseStddev = stats.acCloseStd;

            const diff_acOpen = readingAcOpen !== '' ? (readingAcOpen - currentAcOpenAvg).toFixed(2) : '';
            const deviation_acOpen = (currentAcOpenStddev !== 0 && readingAcOpen !== '') ? (diff_acOpen / currentAcOpenStddev).toFixed(2) : (readingAcOpen !== '' ? '0.00' : '');

            const diff_dcPos = readingDcPos !== '' ? (readingDcPos - currentDcPosAvg).toFixed(2) : '';
            const deviation_dcPos = (currentDcPosStddev !== 0 && readingDcPos !== '') ? (diff_dcPos / currentDcPosStddev).toFixed(2) : (readingDcPos !== '' ? '0.00' : '');

            const diff_dcNeg = readingDcNeg !== '' ? (readingDcNeg - currentDcNegAvg).toFixed(2) : '';
            const deviation_dcNeg = (currentDcNegStddev !== 0 && readingDcNeg !== '') ? (diff_dcNeg / currentDcNegStddev).toFixed(2) : (readingDcNeg !== '' ? '0.00' : '');

            const diff_acClose = readingAcClose !== '' ? (readingAcClose - currentAcCloseAvg).toFixed(2) : '';
            const deviation_acClose = (currentAcCloseStddev !== 0 && readingAcClose !== '') ? (diff_acClose / currentAcCloseStddev).toFixed(2) : (readingAcClose !== '' ? '0.00' : '');


            return [
                index + 1,
                readingAcOpen, diff_acOpen, deviation_acOpen,
                readingDcPos, diff_dcPos, deviation_dcPos,
                readingDcNeg, diff_dcNeg, deviation_dcNeg,
                readingAcClose, diff_acClose, deviation_acClose,
            ];
        });

        const headerRow = readingHeadersHeaders;
        const statRows = [
            [],
            ["Metric", "AC Open", "DC+", "DC−", "AC Close"],
            ["Average", stats.acOpenAvg, stats.dcPosAvg, stats.dcNegAvg, stats.acCloseAvg],
            ["Stddev", stats.acOpenStd, stats.dcPosStd, stats.dcNegStd, stats.acCloseStd],
            []
        ];

        const dataForSheet = [...statRows, headerRow, ...tableRows];
        const fullSheet = XLSX.utils.aoa_to_sheet(dataForSheet);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, fullSheet, sheetName);
        XLSX.writeFile(workbook, fileName);
    };

    // Helper to safely get an array from the state, preventing errors before the first fetch completes.
    const getReadingsArray = (readingsObject, key) => (readingsObject?.[key] || []);

    return (
        <React.Fragment>
            <div className="content-area">

                {!selectedSessionId && (
                    <div className="form-section-warning">
                        <p>Please select a session from the "Session Setup" tab to view data output.</p>
                    </div>
                )}

                <div className="table-header-container">
                    <h2>Calibration Session Information</h2>
                </div>

                <table id="cal-info-table" className="cal-results-table">
                    <thead>
                        <tr>
                            {calInfoHeaders.map((headerText, index) => (
                                <th key={`cal-header-${index}`} className="th">{headerText}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="td">{sessionInfo?.test_instrument_model || ''}</td>
                            <td className="td">{sessionInfo?.test_instrument_serial || ''}</td>
                            <td className="td">{sessionInfo?.standard_instrument_model || ''}</td>
                            <td className="td">{sessionInfo?.standard_instrument_serial || ''}</td>
                            <td className="td">
                                {sessionInfo?.created_at ? new Date(sessionInfo.created_at).toLocaleDateString() : ''}
                            </td>
                            <td className="td">{sessionInfo?.temperature || ''}</td>
                            <td className="td">{sessionInfo?.humidity || ''}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="table-header-container">
                    <div className="header-row">
                        <h2>Standard Readings</h2>
                        <FaDownload
                            className="download-icon"
                            title="Export to XLSX"
                            onClick={() =>
                                exportTableToXLSX(
                                    'std-readings-table',
                                    'STD Readings',
                                    'std_readings_data.xlsx',
                                    {
                                        acOpenAvg: calResults?.std_ac_open_avg,
                                        acOpenStd: calResults?.std_ac_open_stddev,
                                        dcPosAvg: calResults?.std_dc_pos_avg,
                                        dcPosStd: calResults?.std_dc_pos_stddev,
                                        dcNegAvg: calResults?.std_dc_neg_avg,
                                        dcNegStd: calResults?.std_dc_neg_stddev,
                                        acCloseAvg: calResults?.std_ac_close_avg,
                                        acCloseStd: calResults?.std_ac_close_stddev,
                                    },
                                    {
                                        acOpenReadings: calReadings?.std_ac_open_readings,
                                        dcPosReadings: calReadings?.std_dc_pos_readings,
                                        dcNegReadings: calReadings?.std_dc_neg_readings,
                                        acCloseReadings: calReadings?.std_ac_close_readings,
                                    }
                                )
                            }
                        />
                    </div>

                    <div className="reading-group">
                        <div className="reading">
                            <h3>AC Open</h3>
                            <p>Average: {calResults?.std_ac_open_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.std_ac_open_stddev ?? '...'}</p>
                        </div>
                        <div className="reading">
                            <h3>DC+</h3>
                            <p>Average: {calResults?.std_dc_pos_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.std_dc_pos_stddev ?? '...'}</p>
                        </div>
                        <div className="reading">
                            <h3>DC−</h3>
                            <p>Average: {calResults?.std_dc_neg_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.std_dc_neg_stddev ?? '...'}</p>
                        </div>
                        <div className="reading">
                            <h3>AC Close</h3>
                            <p>Average: {calResults?.std_ac_close_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.std_ac_close_stddev ?? '...'}</p>
                        </div>
                    </div>
                </div>

                <div className="table-container">
                    <table id="std-readings-table" className="cal-results-table">
                        <thead>
                            <tr>
                                {readingHeadersHeaders.map((headerText, index) => (
                                    <th key={`read-header-${index}`} className="th">{headerText}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: getReadingsArray(calReadings, 'std_ac_open_readings').length }).map((_, index) => {
                                const currentAcOpenReading = getReadingsArray(calReadings, 'std_ac_open_readings')[index];
                                const currentDcPosReading = getReadingsArray(calReadings, 'std_dc_pos_readings')[index];
                                const currentDcNegReading = getReadingsArray(calReadings, 'std_dc_neg_readings')[index];
                                const currentAcCloseReading = getReadingsArray(calReadings, 'std_ac_close_readings')[index];

                                const currentStdAcOpenAvg = calResults?.std_ac_open_avg ?? 0;
                                const currentStdAcOpenStddev = calResults?.std_ac_open_stddev ?? 0;
                                const currentStdDcPosAvg = calResults?.std_dc_pos_avg ?? 0;
                                const currentStdDcPosStddev = calResults?.std_dc_pos_stddev ?? 0;
                                const currentStdDcNegAvg = calResults?.std_dc_neg_avg ?? 0;
                                const currentStdDcNegStddev = calResults?.std_dc_neg_stddev ?? 0;
                                const currentStdAcCloseAvg = calResults?.std_ac_close_avg ?? 0;
                                const currentStdAcCloseStddev = calResults?.std_ac_close_stddev ?? 0;

                                const diff_acOpen = currentAcOpenReading !== undefined ? (currentAcOpenReading - currentStdAcOpenAvg).toFixed(2) : '';
                                const deviation_acOpen = (currentStdAcOpenStddev !== 0 && currentAcOpenReading !== undefined) ? (diff_acOpen / currentStdAcOpenStddev).toFixed(2) : (currentAcOpenReading !== undefined ? '0.00' : '');
                                const diff_dcPos = currentDcPosReading !== undefined ? (currentDcPosReading - currentStdDcPosAvg).toFixed(2) : '';
                                const deviation_dcPos = (currentStdDcPosStddev !== 0 && currentDcPosReading !== undefined) ? (diff_dcPos / currentStdDcPosStddev).toFixed(2) : (currentDcPosReading !== undefined ? '0.00' : '');
                                const diff_dcNeg = currentDcNegReading !== undefined ? (currentDcNegReading - currentStdDcNegAvg).toFixed(2) : '';
                                const deviation_dcNeg = (currentStdDcNegStddev !== 0 && currentDcNegReading !== undefined) ? (diff_dcNeg / currentStdDcNegStddev).toFixed(2) : (currentDcNegReading !== undefined ? '0.00' : '');
                                const diff_acClose = currentAcCloseReading !== undefined ? (currentAcCloseReading - currentStdAcCloseAvg).toFixed(2) : '';
                                const deviation_acClose = (currentStdAcCloseStddev !== 0 && currentAcCloseReading !== undefined) ? (diff_acClose / currentStdAcCloseStddev).toFixed(2) : (currentAcCloseReading !== undefined ? '0.00' : '');

                                return (
                                    <tr key={index}>
                                        <td>{index + 1}</td>
                                        <td>{currentAcOpenReading}</td>
                                        <td>{diff_acOpen}</td>
                                        <td>{deviation_acOpen}</td>
                                        <td>{currentDcPosReading}</td>
                                        <td>{diff_dcPos}</td>
                                        <td>{deviation_dcPos}</td>
                                        <td>{currentDcNegReading}</td>
                                        <td>{diff_dcNeg}</td>
                                        <td>{deviation_dcNeg}</td>
                                        <td>{currentAcCloseReading}</td>
                                        <td>{diff_acClose}</td>
                                        <td>{deviation_acClose}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="table-header-container">
                    <div className="header-row">
                        <h2>Test Instrument Readings</h2>
                        <FaDownload
                            className="download-icon"
                            title="Export to XLSX"
                            onClick={() =>
                                exportTableToXLSX(
                                    'ti-readings-table',
                                    'TI Readings',
                                    'ti_readings_data.xlsx',
                                    {
                                        acOpenAvg: calResults?.ti_ac_open_avg,
                                        acOpenStd: calResults?.ti_ac_open_stddev,
                                        dcPosAvg: calResults?.ti_dc_pos_avg,
                                        dcPosStd: calResults?.ti_dc_pos_stddev,
                                        dcNegAvg: calResults?.ti_dc_neg_avg,
                                        dcNegStd: calResults?.ti_dc_neg_stddev,
                                        acCloseAvg: calResults?.ti_ac_close_avg,
                                        acCloseStd: calResults?.ti_ac_close_stddev,
                                    },
                                    {
                                        acOpenReadings: calReadings?.ti_ac_open_readings,
                                        dcPosReadings: calReadings?.ti_dc_pos_readings,
                                        dcNegReadings: calReadings?.ti_dc_neg_readings,
                                        acCloseReadings: calReadings?.ti_ac_close_readings,
                                    }
                                )
                            }
                        />
                    </div>
                    <div className="reading-group">
                        <div className="reading">
                            <h3>AC Open</h3>
                            <p>Average: {calResults?.ti_ac_open_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.ti_ac_open_stddev ?? '...'}</p>
                        </div>
                        <div className="reading">
                            <h3>DC+</h3>
                            <p>Average: {calResults?.ti_dc_pos_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.ti_dc_pos_stddev ?? '...'}</p>
                        </div>
                        <div className="reading">
                            <h3>DC−</h3>
                            <p>Average: {calResults?.ti_dc_neg_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.ti_dc_neg_stddev ?? '...'}</p>
                        </div>
                        <div className="reading">
                            <h3>AC Close</h3>
                            <p>Average: {calResults?.ti_ac_close_avg ?? '...'}</p>
                            <p>Standard Deviation: {calResults?.ti_ac_close_stddev ?? '...'}</p>
                        </div>
                    </div>
                </div>

                <div className="table-container">
                    <table id="ti-readings-table" className="cal-results-table">
                        <thead>
                            <tr>
                                {readingHeadersHeaders.map((headerText, index) => (
                                    <th key={`read-header-${index}`} className="th">{headerText}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: getReadingsArray(calReadings, 'ti_ac_open_readings').length }).map((_, index) => {
                                const currentTiAcOpenReading = getReadingsArray(calReadings, 'ti_ac_open_readings')[index];
                                const currentTiDcPosReading = getReadingsArray(calReadings, 'ti_dc_pos_readings')[index];
                                const currentTiDcNegReading = getReadingsArray(calReadings, 'ti_dc_neg_readings')[index];
                                const currentTiAcCloseReading = getReadingsArray(calReadings, 'ti_ac_close_readings')[index];

                                const currentTiAcOpenAvg = calResults?.ti_ac_open_avg ?? 0;
                                const currentTiAcOpenStddev = calResults?.ti_ac_open_stddev ?? 0;
                                const currentTiDcPosAvg = calResults?.ti_dc_pos_avg ?? 0;
                                const currentTiDcPosStddev = calResults?.ti_dc_pos_stddev ?? 0;
                                const currentTiDcNegAvg = calResults?.ti_dc_neg_avg ?? 0;
                                const currentTiDcNegStddev = calResults?.ti_dc_neg_stddev ?? 0;
                                const currentTiAcCloseAvg = calResults?.ti_ac_close_avg ?? 0;
                                const currentTiAcCloseStddev = calResults?.ti_ac_close_stddev ?? 0;

                                const diff_acOpen = currentTiAcOpenReading !== undefined ? (currentTiAcOpenReading - currentTiAcOpenAvg).toFixed(2) : '';
                                const deviation_acOpen = (currentTiAcOpenStddev !== 0 && currentTiAcOpenReading !== undefined) ? (diff_acOpen / currentTiAcOpenStddev).toFixed(2) : (currentTiAcOpenReading !== undefined ? '0.00' : '');
                                const diff_dcPos = currentTiDcPosReading !== undefined ? (currentTiDcPosReading - currentTiDcPosAvg).toFixed(2) : '';
                                const deviation_dcPos = (currentTiDcPosStddev !== 0 && currentTiDcPosReading !== undefined) ? (diff_dcPos / currentTiDcPosStddev).toFixed(2) : (currentTiDcPosReading !== undefined ? '0.00' : '');
                                const diff_dcNeg = currentTiDcNegReading !== undefined ? (currentTiDcNegReading - currentTiDcNegAvg).toFixed(2) : '';
                                const deviation_dcNeg = (currentTiDcNegStddev !== 0 && currentTiDcNegReading !== undefined) ? (diff_dcNeg / currentTiDcNegStddev).toFixed(2) : (currentTiDcNegReading !== undefined ? '0.00' : '');
                                const diff_acClose = currentTiAcCloseReading !== undefined ? (currentTiAcCloseReading - currentTiAcCloseAvg).toFixed(2) : '';
                                const deviation_acClose = (currentTiAcCloseStddev !== 0 && currentTiAcCloseReading !== undefined) ? (diff_acClose / currentTiAcCloseStddev).toFixed(2) : (currentTiAcCloseReading !== undefined ? '0.00' : '');

                                return (
                                    <tr key={index}>
                                        <td>{index + 1}</td>
                                        <td>{currentTiAcOpenReading}</td>
                                        <td>{diff_acOpen}</td>
                                        <td>{deviation_acOpen}</td>
                                        <td>{currentTiDcPosReading}</td>
                                        <td>{diff_dcPos}</td>
                                        <td>{deviation_dcPos}</td>
                                        <td>{currentTiDcNegReading}</td>
                                        <td>{diff_dcNeg}</td>
                                        <td>{deviation_dcNeg}</td>
                                        <td>{currentTiAcCloseReading}</td>
                                        <td>{diff_acClose}</td>
                                        <td>{deviation_acClose}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </React.Fragment>
    );
}

export default CalibrationResults;