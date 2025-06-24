import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from "xlsx";
import { useInstruments } from '../../contexts/InstrumentContext';
import { FaDownload } from 'react-icons/fa';
import CalibrationChart from './CalibrationChart';
import { useTheme } from '../../contexts/ThemeContext';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

function CalibrationResults({ showNotification }) {
    const { selectedSessionId } = useInstruments();
    const [sessionInfo, setSessionInfo] = useState(null);
    const [calResults, setCalResults] = useState(null);
    const [calReadings, setCalReadings] = useState(null);
    const { theme } = useTheme();

    const [stdView, setStdView] = useState('table');
    const [tiView, setTiView] = useState('table');
    const [stdMetric, setStdMetric] = useState('average');
    const [tiMetric, setTiMetric] = useState('average');

    const calInfoHeaders = ['TI Model', 'TI Serial', 'STD Model', 'STD Serial', 'Calibration Date', 'Temperature', 'Humidity'];
    const readingHeadersHeaders = ['#', 'AC Open', 'Diff vs Avg', 'Deviation', 'DCV+', 'Diff vs Avg', 'Deviation', 'DCV-', 'Diff vs Avg', 'Deviation', 'AC Close', 'Diff vs Avg', 'Deviation'];

    const fetchCalibrationData = useCallback(async () => {
        if (!selectedSessionId) {
            setSessionInfo(null); setCalResults(null); setCalReadings(null);
            return;
        }
        try {
            const [sessionResponse, resultsResponse, readingsResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/results/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/readings/`)
            ]);
            setSessionInfo(sessionResponse.data);
            setCalResults(resultsResponse.data);
            setCalReadings(readingsResponse.data);
        } catch (error) {
            console.error("Failed to fetch calibration data:", error);
            showNotification('Failed to load calibration data.', 'error');
            setSessionInfo(null); setCalResults(null); setCalReadings(null);
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchCalibrationData();
    }, [fetchCalibrationData]);

    const exportTableToXLSX = (sheetName, fileName, stats, readingsData) => {

        const tableRows = Array.from({
            length: Math.max(
                (readingsData.acOpenReadings || []).length, (readingsData.dcPosReadings || []).length,
                (readingsData.dcNegReadings || []).length, (readingsData.acCloseReadings || []).length
            )
        }).map((_, index) => {
            const readingAcOpen = readingsData.acOpenReadings[index] !== undefined ? readingsData.acOpenReadings[index] : '';
            const readingDcPos = readingsData.dcPosReadings[index] !== undefined ? readingsData.dcPosReadings[index] : '';
            const readingDcNeg = readingsData.dcNegReadings[index] !== undefined ? readingsData.dcNegReadings[index] : '';
            const readingAcClose = readingsData.acCloseReadings[index] !== undefined ? readingsData.acCloseReadings[index] : '';
            const { acOpenAvg, acOpenStd, dcPosAvg, dcPosStd, dcNegAvg, dcNegStd, acCloseAvg, acCloseStd } = stats;
            const diff_acOpen = readingAcOpen !== '' ? (readingAcOpen - acOpenAvg).toFixed(2) : '';
            const deviation_acOpen = (acOpenStd !== 0 && readingAcOpen !== '') ? (diff_acOpen / acOpenStd).toFixed(2) : (readingAcOpen !== '' ? '0.00' : '');
            const diff_dcPos = readingDcPos !== '' ? (readingDcPos - dcPosAvg).toFixed(2) : '';
            const deviation_dcPos = (dcPosStd !== 0 && readingDcPos !== '') ? (diff_dcPos / dcPosStd).toFixed(2) : (readingDcPos !== '' ? '0.00' : '');
            const diff_dcNeg = readingDcNeg !== '' ? (readingDcNeg - dcNegAvg).toFixed(2) : '';
            const deviation_dcNeg = (dcNegStd !== 0 && readingDcNeg !== '') ? (diff_dcNeg / dcNegStd).toFixed(2) : (readingDcNeg !== '' ? '0.00' : '');
            const diff_acClose = readingAcClose !== '' ? (readingAcClose - acCloseAvg).toFixed(2) : '';
            const deviation_acClose = (acCloseStd !== 0 && readingAcClose !== '') ? (diff_acClose / acCloseStd).toFixed(2) : (readingAcClose !== '' ? '0.00' : '');
            return [index + 1, readingAcOpen, diff_acOpen, deviation_acOpen, readingDcPos, diff_dcPos, deviation_dcPos, readingDcNeg, diff_dcNeg, deviation_dcNeg, readingAcClose, diff_acClose, deviation_acClose];
        });
        const headerRow = readingHeadersHeaders;
        const statRows = [[], ["Metric", "AC Open", "DC+", "DC−", "AC Close"], ["Average", stats.acOpenAvg, stats.dcPosAvg, stats.dcNegAvg, stats.acCloseAvg], ["Stddev", stats.acOpenStd, stats.dcPosStd, stats.dcNegStd, stats.acCloseStd], []];
        const dataForSheet = [...statRows, headerRow, ...tableRows];
        const fullSheet = XLSX.utils.aoa_to_sheet(dataForSheet);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, fullSheet, sheetName);
        XLSX.writeFile(workbook, fileName);
    };

    const getReadingsArray = (readingsObject, key) => (readingsObject?.[key] || []);

    const prepareChartData = (type, metricType) => {
        if (!calResults || !calReadings) return null;

        const prefix = type === 'std' ? 'std_' : 'ti_';
        const keys = ['ac_open', 'dc_pos', 'dc_neg', 'ac_close'];
        const colors = ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)', 'rgba(54, 162, 235, 0.6)', 'rgba(255, 205, 86, 0.6)'];
        const borderColors = ['rgb(75, 192, 192)', 'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 205, 86)'];
        const labels = ['AC Open', 'DC+', 'DC-', 'AC Close'];

        let datasets = [];
        let x_labels = [];

        if (metricType === 'average' || metricType === 'stddev') {
            x_labels = labels;
            const dataKey = metricType === 'average' ? 'avg' : 'stddev';
            datasets = [{
                label: metricType === 'average' ? 'Average' : 'Standard Deviation',
                data: keys.map(key => calResults[`${prefix}${key}_${dataKey}`]),
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 1,
            }];
        } else { // For 'readings', 'diff', and 'deviation'
            const readingLengths = keys.map(key => (calReadings[`${prefix}${key}_readings`] || []).length);
            const maxLen = Math.max(0, ...readingLengths);
            x_labels = Array.from({ length: maxLen }, (_, i) => i + 1);

            datasets = keys.map((key, i) => {
                const readings = calReadings[`${prefix}${key}_readings`] || [];
                const avg = calResults[`${prefix}${key}_avg`] || 0;
                const stddev = calResults[`${prefix}${key}_stddev`] || 0;
                let data;
                if (metricType === 'diff') {
                    data = readings.map(r => (r - avg));
                } else if (metricType === 'deviation') {
                    data = stddev === 0 ? readings.map(() => 0) : readings.map(r => (r - avg) / stddev);
                } else { // 'readings'
                    data = readings;
                }
                return { label: `${labels[i]}`, data: data, borderColor: borderColors[i], tension: 0.1, fill: false };
            });
        }
        return { labels: x_labels, datasets };
    };

    const getChartTitle = (type, metric) => {
        const instrument = type === 'std' ? 'Standard' : 'Test';
        let metricName;
        if (metric === 'readings') metricName = 'Raw Readings';
        else if (metric === 'diff') metricName = 'Difference from Average';
        else if (metric === 'deviation') metricName = 'Statistical Deviation';
        else if (metric === 'average') metricName = 'Averages';
        else if (metric === 'stddev') metricName = 'Standard Deviations';
        return `${instrument} Instrument - ${metricName}`;
    }

    return (
        <React.Fragment>
            <div className="content-area">
                {!selectedSessionId && <div className="form-section-warning"><p>Please select a session from the "Session Setup" tab to view data output.</p></div>}
                <div className="table-header-container"><h2>Calibration Session Information</h2></div>
                <div className="table-container">
                    <table id="cal-info-table" className="cal-results-table">
                        <thead><tr>{calInfoHeaders.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                        <tbody><tr><td>{sessionInfo?.test_instrument_model || ''}</td><td>{sessionInfo?.test_instrument_serial || ''}</td><td>{sessionInfo?.standard_instrument_model || ''}</td><td>{sessionInfo?.standard_instrument_serial || ''}</td><td>{sessionInfo?.created_at ? new Date(sessionInfo.created_at).toLocaleDateString() : ''}</td><td>{sessionInfo?.temperature || ''}</td><td>{sessionInfo?.humidity || ''}</td></tr></tbody>
                    </table>
                </div>

                <div className="table-header-container">
                    <div className="header-row">
                        <h2>Standard Readings</h2>
                        <FaDownload className="download-icon" title="Export to XLSX" onClick={() => exportTableToXLSX('STD Readings', 'std_readings_data.xlsx', { acOpenAvg: calResults?.std_ac_open_avg, acOpenStd: calResults?.std_ac_open_stddev, dcPosAvg: calResults?.std_dc_pos_avg, dcPosStd: calResults?.std_dc_pos_stddev, dcNegAvg: calResults?.std_dc_neg_avg, dcNegStd: calResults?.std_dc_neg_stddev, acCloseAvg: calResults?.std_ac_close_avg, acCloseStd: calResults?.std_ac_close_stddev }, { acOpenReadings: calReadings?.std_ac_open_readings, dcPosReadings: calReadings?.std_dc_pos_readings, dcNegReadings: calReadings?.std_dc_neg_readings, acCloseReadings: calReadings?.std_ac_close_readings })} />
                        <div className="view-toggle"><button className={stdView === 'table' ? 'active' : ''} onClick={() => setStdView('table')}>Table</button><button className={stdView === 'chart' ? 'active' : ''} onClick={() => setStdView('chart')}>Chart</button></div>
                    </div>
                    {stdView === 'table' && <div className="reading-group"><div className="reading"><h3>AC Open</h3><p>Average: {calResults?.std_ac_open_avg ?? '...'}</p><p>Standard Deviation: {calResults?.std_ac_open_stddev ?? '...'}</p></div><div className="reading"><h3>DC+</h3><p>Average: {calResults?.std_dc_pos_avg ?? '...'}</p><p>Standard Deviation: {calResults?.std_dc_pos_stddev ?? '...'}</p></div><div className="reading"><h3>DC−</h3><p>Average: {calResults?.std_dc_neg_avg ?? '...'}</p><p>Standard Deviation: {calResults?.std_dc_neg_stddev ?? '...'}</p></div><div className="reading"><h3>AC Close</h3><p>Average: {calResults?.std_ac_close_avg ?? '...'}</p><p>Standard Deviation: {calResults?.std_ac_close_stddev ?? '...'}</p></div></div>}
                </div>
                {stdView === 'table' ? (
                    <div className="table-container"><table id="std-readings-table" className="cal-results-table"><thead><tr>{readingHeadersHeaders.map((h, i) => <th key={`std-h-${i}`}>{h}</th>)}</tr></thead><tbody>{Array.from({ length: Math.max(getReadingsArray(calReadings, 'std_ac_open_readings').length, getReadingsArray(calReadings, 'std_dc_pos_readings').length) }).map((_, index) => { const r1 = getReadingsArray(calReadings, 'std_ac_open_readings')[index], r2 = getReadingsArray(calReadings, 'std_dc_pos_readings')[index], r3 = getReadingsArray(calReadings, 'std_dc_neg_readings')[index], r4 = getReadingsArray(calReadings, 'std_ac_close_readings')[index]; const a1 = calResults?.std_ac_open_avg ?? 0, s1 = calResults?.std_ac_open_stddev ?? 0, a2 = calResults?.std_dc_pos_avg ?? 0, s2 = calResults?.std_dc_pos_stddev ?? 0, a3 = calResults?.std_dc_neg_avg ?? 0, s3 = calResults?.std_dc_neg_stddev ?? 0, a4 = calResults?.std_ac_close_avg ?? 0, s4 = calResults?.std_ac_close_stddev ?? 0; const d1 = (r1 !== undefined ? (r1 - a1).toFixed(2) : ''), v1 = (s1 !== 0 && r1 !== undefined ? (d1 / s1).toFixed(2) : (r1 !== undefined ? '0.00' : '')); const d2 = (r2 !== undefined ? (r2 - a2).toFixed(2) : ''), v2 = (s2 !== 0 && r2 !== undefined ? (d2 / s2).toFixed(2) : (r2 !== undefined ? '0.00' : '')); const d3 = (r3 !== undefined ? (r3 - a3).toFixed(2) : ''), v3 = (s3 !== 0 && r3 !== undefined ? (d3 / s3).toFixed(2) : (r3 !== undefined ? '0.00' : '')); const d4 = (r4 !== undefined ? (r4 - a4).toFixed(2) : ''), v4 = (s4 !== 0 && r4 !== undefined ? (d4 / s4).toFixed(2) : (r4 !== undefined ? '0.00' : '')); return (<tr key={`std-r-${index}`}><td>{index + 1}</td><td>{r1}</td><td>{d1}</td><td>{v1}</td><td>{r2}</td><td>{d2}</td><td>{v2}</td><td>{r3}</td><td>{d3}</td><td>{v3}</td><td>{r4}</td><td>{d4}</td><td>{v4}</td></tr>); })}</tbody></table></div>
                ) : (
                    <div className="chart-container" style={{ margin: '20px 0 40px' }}>
                        <div className="chart-controls" style={{ marginBottom: '10px' }}>
                            <label htmlFor="std-metric-type" style={{ marginRight: '10px' }}>Metric to Plot: </label>
                            <select id="std-metric-type" value={stdMetric} onChange={(e) => setStdMetric(e.target.value)}>
                                <option value="average">Average</option>
                                <option value="stddev">Standard Deviation</option>
                                <option value="readings">Readings</option>
                                <option value="diff">Difference vs. Avg</option>
                                <option value="deviation">Deviation</option>
                            </select>
                        </div>
                        <CalibrationChart
                            title={getChartTitle('std', stdMetric)}
                            chartData={prepareChartData('std', stdMetric)}
                            theme={theme}
                            chartType={(stdMetric === 'average' || stdMetric === 'stddev') ? 'bar' : 'line'}
                        />
                    </div>
                )}

                <div className="table-header-container">
                    <div className="header-row">
                        <h2>Test Instrument Readings</h2>
                        <FaDownload className="download-icon" title="Export to XLSX" onClick={() => exportTableToXLSX('TI Readings', 'ti_readings_data.xlsx', { acOpenAvg: calResults?.ti_ac_open_avg, acOpenStd: calResults?.ti_ac_open_stddev, dcPosAvg: calResults?.ti_dc_pos_avg, dcPosStd: calResults?.ti_dc_pos_stddev, dcNegAvg: calResults?.ti_dc_neg_avg, dcNegStd: calResults?.ti_dc_neg_stddev, acCloseAvg: calResults?.ti_ac_close_avg, acCloseStd: calResults?.ti_ac_close_stddev, }, { acOpenReadings: calReadings?.ti_ac_open_readings, dcPosReadings: calReadings?.ti_dc_pos_readings, dcNegReadings: calReadings?.ti_dc_neg_readings, acCloseReadings: calReadings?.ti_ac_close_readings, })} />
                        <div className="view-toggle"><button className={tiView === 'table' ? 'active' : ''} onClick={() => setTiView('table')}>Table</button><button className={tiView === 'chart' ? 'active' : ''} onClick={() => setTiView('chart')}>Chart</button></div>
                    </div>
                    {tiView === 'table' && <div className="reading-group"><div className="reading"><h3>AC Open</h3><p>Average: {calResults?.ti_ac_open_avg ?? '...'}</p><p>Standard Deviation: {calResults?.ti_ac_open_stddev ?? '...'}</p></div><div className="reading"><h3>DC+</h3><p>Average: {calResults?.ti_dc_pos_avg ?? '...'}</p><p>Standard Deviation: {calResults?.ti_dc_pos_stddev ?? '...'}</p></div><div className="reading"><h3>DC−</h3><p>Average: {calResults?.ti_dc_neg_avg ?? '...'}</p><p>Standard Deviation: {calResults?.ti_dc_neg_stddev ?? '...'}</p></div><div className="reading"><h3>AC Close</h3><p>Average: {calResults?.ti_ac_close_avg ?? '...'}</p><p>Standard Deviation: {calResults?.ti_ac_close_stddev ?? '...'}</p></div></div>}
                </div>
                {tiView === 'table' ? (
                    <div className="table-container"><table id="ti-readings-table" className="cal-results-table"><thead><tr>{readingHeadersHeaders.map((h, i) => <th key={`ti-h-${i}`}>{h}</th>)}</tr></thead><tbody>{Array.from({ length: Math.max(getReadingsArray(calReadings, 'ti_ac_open_readings').length, getReadingsArray(calReadings, 'ti_dc_pos_readings').length) }).map((_, index) => { const r1 = getReadingsArray(calReadings, 'ti_ac_open_readings')[index], r2 = getReadingsArray(calReadings, 'ti_dc_pos_readings')[index], r3 = getReadingsArray(calReadings, 'ti_dc_neg_readings')[index], r4 = getReadingsArray(calReadings, 'ti_ac_close_readings')[index]; const a1 = calResults?.ti_ac_open_avg ?? 0, s1 = calResults?.ti_ac_open_stddev ?? 0, a2 = calResults?.ti_dc_pos_avg ?? 0, s2 = calResults?.ti_dc_pos_stddev ?? 0, a3 = calResults?.ti_dc_neg_avg ?? 0, s3 = calResults?.ti_dc_neg_stddev ?? 0, a4 = calResults?.ti_ac_close_avg ?? 0, s4 = calResults?.ti_ac_close_stddev ?? 0; const d1 = (r1 !== undefined ? (r1 - a1).toFixed(2) : ''), v1 = (s1 !== 0 && r1 !== undefined ? (d1 / s1).toFixed(2) : (r1 !== undefined ? '0.00' : '')); const d2 = (r2 !== undefined ? (r2 - a2).toFixed(2) : ''), v2 = (s2 !== 0 && r2 !== undefined ? (d2 / s2).toFixed(2) : (r2 !== undefined ? '0.00' : '')); const d3 = (r3 !== undefined ? (r3 - a3).toFixed(2) : ''), v3 = (s3 !== 0 && r3 !== undefined ? (d3 / s3).toFixed(2) : (r3 !== undefined ? '0.00' : '')); const d4 = (r4 !== undefined ? (r4 - a4).toFixed(2) : ''), v4 = (s4 !== 0 && r4 !== undefined ? (d4 / s4).toFixed(2) : (r4 !== undefined ? '0.00' : '')); return (<tr key={`ti-r-${index}`}><td>{index + 1}</td><td>{r1}</td><td>{d1}</td><td>{v1}</td><td>{r2}</td><td>{d2}</td><td>{v2}</td><td>{r3}</td><td>{d3}</td><td>{v3}</td><td>{r4}</td><td>{d4}</td><td>{v4}</td></tr>); })}</tbody></table></div>
                ) : (
                    <div className="chart-container" style={{ margin: '20px 0 40px' }}>
                        <div className="chart-controls" style={{ marginBottom: '10px' }}>
                            <label htmlFor="ti-metric-type" style={{ marginRight: '10px' }}>Metric to Plot: </label>
                            <select id="ti-metric-type" value={tiMetric} onChange={(e) => setTiMetric(e.target.value)}>
                                <option value="average">Average</option>
                                <option value="stddev">Standard Deviation</option>
                                <option value="readings">Readings</option>
                                <option value="diff">Difference vs. Avg</option>
                                <option value="deviation">Deviation</option>
                            </select>
                        </div>
                        <CalibrationChart
                            title={getChartTitle('ti', tiMetric)}
                            chartData={prepareChartData('ti', tiMetric)}
                            theme={theme}
                            chartType={(tiMetric === 'average' || tiMetric === 'stddev') ? 'bar' : 'line'}
                        />
                    </div>
                )}
            </div>
        </React.Fragment>
    );
}

export default CalibrationResults;