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

    const [showCalcDetails, setShowCalcDetails] = useState(false);

    const [tpData, setTPData] = useState({ points: [] });
    const [selectedTP, setSelectedTP] = useState(null);

    const calInfoHeaders = ['TI Model', 'TI Serial', 'STD Model', 'STD Serial', 'Calibration Date', 'Temperature', 'Humidity'];
    const readingHeadersHeaders = ['#', 'AC Open', 'DC+', 'DC-', 'AC Close'];

    useEffect(() => {
        if (window.MathJax) {
            window.MathJax.typeset();
        }
    });

    const fetchCalibrationData = useCallback(async () => {
        if (!selectedSessionId) {
            setSessionInfo(null); setCalResults(null); setCalReadings(null);
            return;
        }
        try {
            const [sessionResponse, tpResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`),
            ]);
            setSessionInfo(sessionResponse.data);
            setTPData(tpResponse.data || { points: [] });
        } catch (error) {
            console.error("Failed to fetch calibration data:", error);
            showNotification('Failed to load calibration data.', 'error');
            setSessionInfo(null); setCalResults(null); setCalReadings(null);
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchCalibrationData();
    }, [fetchCalibrationData]);

    useEffect(() => {
        const fetchSelectedTP = async () => {
            if (!selectedTP || !selectedSessionId) return;

            try {
                const response = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.id}/`);
                setCalResults(response.data.results);
                setCalReadings(response.data.readings);
            } catch (error) {
                console.error("Error fetching selected test point:", error);
            }
        };

        fetchSelectedTP();
    }, [selectedTP, selectedSessionId]);

    const exportTableToXLSX = (sheetName, fileName, stats, readingsData) => {
        const tableRows = Array.from({
            length: Math.max(
                (readingsData.acOpenReadings || []).length, (readingsData.dcPosReadings || []).length,
                (readingsData.dcNegReadings || []).length, (readingsData.acCloseReadings || []).length
            )
        }).map((_, index) => {
            return [
                index + 1,
                readingsData.acOpenReadings[index] ?? '',
                readingsData.dcPosReadings[index] ?? '',
                readingsData.dcNegReadings[index] ?? '',
                readingsData.acCloseReadings[index] ?? ''
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
        } else {
            const readingLengths = keys.map(key => (calReadings[`${prefix}${key}_readings`] || []).length);
            const maxLen = Math.max(0, ...readingLengths);
            x_labels = Array.from({ length: maxLen }, (_, i) => i + 1);

            datasets = keys.map((key, i) => {
                const readings = calReadings[`${prefix}${key}_readings`] || [];
                // const avg = calResults[`${prefix}${key}_avg`] || 0;
                // const stddev = calResults[`${prefix}${key}_stddev`] || 0;
                let data;
                data = readings;
                return { label: `${labels[i]}`, data: data, borderColor: borderColors[i], tension: 0.1, fill: false };
            });
        }
        return { labels: x_labels, datasets };
    };

    const getChartTitle = (type, metric) => {
        const instrument = type === 'std' ? 'Standard' : 'Test';
        let metricName;
        if (metric === 'readings') metricName = 'Raw Readings';
        else if (metric === 'average') metricName = 'Averages';
        else if (metric === 'stddev') metricName = 'Standard Deviations';
        return `${instrument} Instrument - ${metricName}`;
    }

    const SummaryTable = ({ results, prefix }) => (
        <table className="summary-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '-1px' }}>
            <tbody>
                <tr>
                    <td style={{ width: '25%', verticalAlign: 'top', border: '1px solid var(--border-color)', padding: '10px' }}>
                        <h3>AC Open</h3>
                        <p>Average: {results?.[`${prefix}ac_open_avg`]?.toPrecision(8) ?? '...'}</p>
                        <p>Standard Deviation: {results?.[`${prefix}ac_open_stddev`]?.toPrecision(8) ?? '...'}</p>
                    </td>
                    <td style={{ width: '25%', verticalAlign: 'top', border: '1px solid var(--border-color)', padding: '10px' }}>
                        <h3>DC+</h3>
                        <p>Average: {results?.[`${prefix}dc_pos_avg`]?.toPrecision(8) ?? '...'}</p>
                        <p>Standard Deviation: {results?.[`${prefix}dc_pos_stddev`]?.toPrecision(8) ?? '...'}</p>
                    </td>
                    <td style={{ width: '25%', verticalAlign: 'top', border: '1px solid var(--border-color)', padding: '10px' }}>
                        <h3>DC−</h3>
                        <p>Average: {results?.[`${prefix}dc_neg_avg`]?.toPrecision(8) ?? '...'}</p>
                        <p>Standard Deviation: {results?.[`${prefix}dc_neg_stddev`]?.toPrecision(8) ?? '...'}</p>
                    </td>
                    <td style={{ width: '25%', verticalAlign: 'top', border: '1px solid var(--border-color)', padding: '10px' }}>
                        <h3>AC Close</h3>
                        <p>Average: {results?.[`${prefix}ac_close_avg`]?.toPrecision(8) ?? '...'}</p>
                        <p>Standard Deviation: {results?.[`${prefix}ac_close_stddev`]?.toPrecision(8) ?? '...'}</p>
                    </td>
                </tr>
            </tbody>
        </table>
    );

    const CalculationBreakdown = ({ results }) => {
        if (!results || !results.delta_std_known || !results.eta_std || !results.eta_ti) {
            return <p style={{ textAlign: 'center', padding: '10px' }}>Calculation cannot be shown until all readings are taken and correction factors are entered.</p>;
        }

        const V_DCSTD = (results.std_dc_pos_avg + Math.abs(results.std_dc_neg_avg)) / 2;
        const V_ACSTD = (results.std_ac_open_avg + results.std_ac_close_avg) / 2;
        const V_DCUUT = (results.ti_dc_pos_avg + Math.abs(results.ti_dc_neg_avg)) / 2;
        const V_ACUUT = (results.ti_ac_open_avg + results.ti_ac_close_avg) / 2;

        const term_STD = ((V_ACSTD - V_DCSTD) * 1000000) / (results.eta_std * V_DCSTD);
        const term_UUT = ((V_ACUUT - V_DCUUT) * 1000000) / (results.eta_ti * V_DCUUT);

        const mainBreakdown = `
            \\begin{align*}
            \\delta_{\\text{UUT}} &\\approx \\delta_{\\text{STD}} + \\text{Term}_{\\text{STD}} - \\text{Term}_{\\text{UUT}} \\\\
            ${results.delta_uut_ppm} &\\approx ${results.delta_std_known} + (${term_STD.toFixed(3)}) - (${term_UUT.toFixed(3)})
            \\end{align*}
        `;

        const termStdBreakdown = `
            \\begin{align*}
            \\text{Term}_{\\text{STD}} &= \\frac{(V_{\\text{AC,STD}} - V_{\\text{DC,STD}}) \\times 10^6}{\\eta_{\\text{STD}} \\times V_{\\text{DC,STD}}} \\\\
            &= \\frac{(${V_ACSTD.toPrecision(8)} - ${V_DCSTD.toPrecision(8)}) \\times 10^6}{${results.eta_std} \\times ${V_DCSTD.toPrecision(8)}} \\\\
            &= ${term_STD.toFixed(5)}
            \\end{align*}
        `;

        const termUutBreakdown = `
            \\begin{align*}
            \\text{Term}_{\\text{UUT}} &= \\frac{(V_{\\text{AC,UUT}} - V_{\\text{DC,UUT}}) \\times 10^6}{\\eta_{\\text{UUT}} \\times V_{\\text{DC,UUT}}} \\\\
            &= \\frac{(${V_ACUUT.toPrecision(8)} - ${V_DCUUT.toPrecision(8)}) \\times 10^6}{${results.eta_ti} \\times ${V_DCUUT.toPrecision(8)}} \\\\
            &= ${term_UUT.toFixed(5)}
            \\end{align*}
        `;

        return (
            <div className="calculation-breakdown" style={{
                backgroundColor: 'var(--background-color-offset)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '15px',
                marginTop: '15px',
                fontSize: '1.1em',
            }}>
                <p style={{ textAlign: 'center', fontWeight: 'bold' }}>Final Calculation Breakdown</p>
                {`$$ ${mainBreakdown} $$`}
                <hr style={{ margin: '15px 0', borderColor: 'var(--border-color-light)' }} />
                {`$$ ${termStdBreakdown} $$`}
                <hr style={{ margin: '15px 0', borderColor: 'var(--border-color-light)' }} />
                {`$$ ${termUutBreakdown} $$`}
            </div>
        );
    };

    return (
        <React.Fragment>
            <div className="content-area">
                {!selectedSessionId && <div className="form-section-warning"><p>Please select a session from the "Session Setup" tab to view data output.</p></div>}

                {selectedSessionId && (
                    <>
                        <div className="table-header-container"><h2>Calibration Session Information</h2></div>
                        <div className="table-container">
                            <table id="cal-info-table" className="cal-results-table">
                                <thead><tr>{calInfoHeaders.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                                <tbody><tr><td>{sessionInfo?.test_instrument_model || ''}</td><td>{sessionInfo?.test_instrument_serial || ''}</td><td>{sessionInfo?.standard_instrument_model || ''}</td><td>{sessionInfo?.standard_instrument_serial || ''}</td><td>{sessionInfo?.created_at ? new Date(sessionInfo.created_at).toLocaleDateString() : ''}</td><td>{sessionInfo?.temperature || ''}</td><td>{sessionInfo?.humidity || ''}</td></tr></tbody>
                            </table>
                        </div>

                        <div className="form-section">
                            <h4>Test Points</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '10px 0' }}>
                                {tpData?.test_points?.length > 0 ? (
                                    tpData.test_points.map((point, index) => {
                                        const isSelected = selectedTP && point.id === selectedTP.id;
                                        return (
                                            <button
                                                key={index}
                                                data-index={index}
                                                data-current={point.current}
                                                data-frequency={point.frequency}
                                                onClick={() => setSelectedTP(point)}
                                                style={{
                                                    padding: '8px 16px',
                                                    borderRadius: '20px',
                                                    backgroundColor: isSelected
                                                        ? 'var(--button-selected-bg, #F4A261)'
                                                        : 'var(--button-bg, #E0E0E0)',
                                                    color: isSelected
                                                        ? 'var(--button-selected-color, #fff)'
                                                        : 'var(--button-text-color, #333)',
                                                    fontWeight: '500',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    transition: 'background-color 0.3s, color 0.3s'
                                                }}>
                                                {point.current}A @ {point.frequency}Hz
                                            </button>
                                        );
                                    })
                                ) : (
                                    <p style={{ margin: 0, fontStyle: 'italic' }}>No test points generated. Go to the "Test Point Setup" tab to configure.</p>
                                )}
                            </div>
                        </div>

                        <div className="table-header-container">
                            <h2>Correction Factor Inputs</h2>
                        </div>
                        <div className="reading-group">
                            <div className="reading">
                                <h3>δ Standard (PPM)</h3>
                                <p>{calResults?.delta_std_known ? calResults.delta_std_known.toFixed(3) : 'Not Entered'}</p>
                            </div>
                            <div className="reading">
                                <h3>η Standard</h3>
                                <p>{calResults?.eta_std ? parseFloat(calResults.eta_std).toPrecision(8) : 'Not Entered'}</p>
                            </div>
                            <div className="reading">
                                <h3>η Test Instrument</h3>
                                <p>{calResults?.eta_ti ? parseFloat(calResults.eta_ti).toPrecision(8) : 'Not Entered'}</p>
                            </div>
                        </div>

                        <div className="table-header-container">
                            <h2>UUT AC-DC Difference Measurement (δ)</h2>
                            <p>
                                {'This is the final result in Parts-Per-Million (PPM), based on the formula:'}
                            </p>
                            {`$$
                            \\delta_{\\text{UUT}} \\approx \\delta_{\\text{STD}} + \\left( \\frac{V_{AC} - V_{DC}}{\\eta \\times V_{DC}} \\right)_{\\text{STD}} \\times 10^6 - \\left( \\frac{V_{AC} - V_{DC}}{\\eta \\times V_{DC}} \\right)_{\\text{UUT}} \\times 10^6
                            $$`}
                        </div>
                        <div className="reading-group">
                            <div className="reading">
                                <h3 style={{ fontWeight: 'bold' }}>δ UUT (PPM)</h3>
                                <p style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                    {calResults?.delta_uut_ppm ? parseFloat(calResults.delta_uut_ppm).toFixed(3) : 'Not Calculated'}
                                </p>
                            </div>
                        </div>

                        <div style={{ textAlign: 'center', margin: '10px 0 20px' }}>
                            <button className="button button-secondary button-small" onClick={() => setShowCalcDetails(!showCalcDetails)}>
                                {showCalcDetails ? 'Hide Calculation Details' : 'Show Calculation Details'}
                            </button>
                        </div>

                        {showCalcDetails && <CalculationBreakdown results={calResults} />}

                        <div className="table-header-container">
                            <div className="header-row">
                                <h2>Standard Readings</h2>
                                <FaDownload className="download-icon" title="Export to XLSX" onClick={() => exportTableToXLSX('STD Readings', 'std_readings_data.xlsx', { acOpenAvg: calResults?.std_ac_open_avg, acOpenStd: calResults?.std_ac_open_stddev, dcPosAvg: calResults?.std_dc_pos_avg, dcPosStd: calResults?.std_dc_pos_stddev, dcNegAvg: calResults?.std_dc_neg_avg, dcNegStd: calResults?.std_dc_neg_stddev, acCloseAvg: calResults?.std_ac_close_avg, acCloseStd: calResults?.std_ac_close_stddev }, { acOpenReadings: calReadings?.std_ac_open_readings, dcPosReadings: calReadings?.std_dc_pos_readings, dcNegReadings: calReadings?.std_dc_neg_readings, acCloseReadings: calReadings?.std_ac_close_readings })} />
                                <div className="view-toggle"><button className={stdView === 'table' ? 'active' : ''} onClick={() => setStdView('table')}>Table</button><button className={stdView === 'chart' ? 'active' : ''} onClick={() => setStdView('chart')}>Chart</button></div>
                            </div>
                            {stdView === 'table' && <SummaryTable results={calResults} prefix="std_" />}
                        </div>
                        {stdView === 'table' ? (
                            <div className="table-container">
                                <table id="std-readings-table" className="cal-results-table">
                                    <thead>
                                        <tr>{readingHeadersHeaders.map((h, i) => <th key={`std-h-${i}`}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: Math.max(getReadingsArray(calReadings, 'std_ac_open_readings').length, getReadingsArray(calReadings, 'std_dc_pos_readings').length) }).map((_, index) => (
                                            <tr key={`std-r-${index}`}>
                                                <td>{index + 1}</td>
                                                <td>{getReadingsArray(calReadings, 'std_ac_open_readings')[index]?.toPrecision(8)}</td>
                                                <td>{getReadingsArray(calReadings, 'std_dc_pos_readings')[index]?.toPrecision(8)}</td>
                                                <td>{getReadingsArray(calReadings, 'std_dc_neg_readings')[index]?.toPrecision(8)}</td>
                                                <td>{getReadingsArray(calReadings, 'std_ac_close_readings')[index]?.toPrecision(8)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="chart-container" style={{ margin: '20px 0 40px' }}>
                                <div className="chart-controls" style={{ marginBottom: '10px' }}>
                                    <label htmlFor="std-metric-type" style={{ marginRight: '10px' }}>Metric to Plot: </label>
                                    <select id="std-metric-type" value={stdMetric} onChange={(e) => setStdMetric(e.target.value)}>
                                        <option value="average">Average</option>
                                        <option value="stddev">Standard Deviation</option>
                                        <option value="readings">Readings</option>
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
                            {tiView === 'table' && <SummaryTable results={calResults} prefix="ti_" />}
                        </div>
                        {tiView === 'table' ? (
                            <div className="table-container">
                                <table id="ti-readings-table" className="cal-results-table">
                                    <thead>
                                        <tr>{readingHeadersHeaders.map((h, i) => <th key={`ti-h-${i}`}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: Math.max(getReadingsArray(calReadings, 'ti_ac_open_readings').length, getReadingsArray(calReadings, 'ti_dc_pos_readings').length) }).map((_, index) => (
                                            <tr key={`ti-r-${index}`}>
                                                <td>{index + 1}</td>
                                                <td>{getReadingsArray(calReadings, 'ti_ac_open_readings')[index]?.toPrecision(8)}</td>
                                                <td>{getReadingsArray(calReadings, 'ti_dc_pos_readings')[index]?.toPrecision(8)}</td>
                                                <td>{getReadingsArray(calReadings, 'ti_dc_neg_readings')[index]?.toPrecision(8)}</td>
                                                <td>{getReadingsArray(calReadings, 'ti_ac_close_readings')[index]?.toPrecision(8)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="chart-container" style={{ margin: '20px 0 40px' }}>
                                <div className="chart-controls" style={{ marginBottom: '10px' }}>
                                    <label htmlFor="ti-metric-type" style={{ marginRight: '10px' }}>Metric to Plot: </label>
                                    <select id="ti-metric-type" value={tiMetric} onChange={(e) => setTiMetric(e.target.value)}>
                                        <option value="average">Average</option>
                                        <option value="stddev">Standard Deviation</option>
                                        <option value="readings">Readings</option>
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
                    </>
                )}
            </div>
        </React.Fragment>
    );
}

export default CalibrationResults;