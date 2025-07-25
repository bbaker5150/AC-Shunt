import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from "xlsx";
import { useInstruments } from '../../contexts/InstrumentContext';
import { FaDownload, FaTable, FaChartBar, FaCalculator, FaBookOpen } from 'react-icons/fa';
import CalibrationChart from './CalibrationChart';
import { useTheme } from '../../contexts/ThemeContext';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const READING_TYPES = [
    { label: 'AC Open', value: 'ac_open_readings', color: 'rgb(75, 192, 192)' },
    { label: 'DC+', value: 'dc_pos_readings', color: 'rgb(255, 99, 132)' },
    { label: 'DC-', value: 'dc_neg_readings', color: 'rgb(54, 162, 235)' },
    { label: 'AC Close', value: 'ac_close_readings', color: 'rgb(255, 205, 86)' }
];
const AVAILABLE_FREQUENCIES = [
    { text: '10Hz', value: 10 }, { text: '20Hz', value: 20 }, { text: '50Hz', value: 50 },
    { text: '60Hz', value: 60 }, { text: '100Hz', value: 100 }, { text: '200Hz', value: 200 },
    { text: '500Hz', value: 500 }, { text: '1kHz', value: 1000 }, { text: '2kHz', value: 2000 },
    { text: '5kHz', value: 5000 }, { text: '10kHz', value: 10000 }, { text: '20kHz', value: 20000 },
    { text: '50kHz', value: 50000 }, { text: '100kHz', value: 100000 }
];

const DirectionToggle = ({ activeDirection, setActiveDirection }) => (
    <div className="view-toggle" style={{ marginBottom: '1rem', justifyContent: 'center' }}>
        <button
            className={activeDirection === 'Forward' ? 'active' : ''}
            onClick={() => setActiveDirection('Forward')}>
            Forward
        </button>
        <button
            className={activeDirection === 'Reverse' ? 'active' : ''}
            onClick={() => setActiveDirection('Reverse')}>
            Reverse
        </button>
    </div>
);

const FinalResultCard = ({ title, value, formula }) => {
    const isCalculated = value !== null && value !== undefined;
    const cardStyle = title.toLowerCase().includes('average') 
        ? { borderTop: '4px solid var(--success-color)'}
        : { borderTop: '4px solid var(--primary-color)'};

    return (
        <div className="final-result-card" style={cardStyle}>
            <h4>{title}</h4>
            <p>
                {isCalculated ? parseFloat(value).toFixed(3) : '---'}
                <span style={{ fontSize: '1.5rem', marginLeft: '10px', opacity: 0.8 }}>PPM</span>
            </p>
            {formula && <span style={{ opacity: 0.7, fontSize: '0.9rem' }}>{formula}</span>}
        </div>
    );
};

const DetailedReadingsTable = ({ readingsArray }) => {
    if (!readingsArray || readingsArray.length === 0) {
        return <p style={{ textAlign: 'center', fontStyle: 'italic', padding: '20px' }}>No readings available for this measurement type.</p>;
    }
    return (
        <div className="table-container">
            <table className="cal-results-table">
                <thead><tr><th>Sample #</th><th>Value</th><th>Timestamp</th></tr></thead>
                <tbody>
                    {readingsArray.map((point, index) => {
                        const isObject = typeof point === 'object' && point !== null;
                        const value = isObject ? point.value : point;
                        const timestamp = isObject && point.timestamp ? new Date(point.timestamp * 1000).toLocaleString() : 'N/A';
                        return (<tr key={index}><td>{index + 1}</td><td>{value?.toPrecision(8)}</td><td>{timestamp}</td></tr>);
                    })}
                </tbody>
            </table>
        </div>
    );
};

const SummaryTable = ({ results, prefix, title }) => (
    <div style={{marginBottom: '20px'}}>
        <h4>{title}</h4>
        <div className="table-container">
            <table className="cal-results-table">
                <thead><tr><th>Measurement</th><th>Average (V)</th><th>Std. Dev. (PPM)</th></tr></thead>
                <tbody>
                    {READING_TYPES.map(rt => {
                        const avgKey = `${prefix}${rt.value.replace('_readings', '_avg')}`;
                        const stddevKey = `${prefix}${rt.value.replace('_readings', '_stddev')}`;
                        const average = results?.[avgKey];
                        const stddev = results?.[stddevKey];
                        let stddevPpm = '...';
                        if (average && stddev && average !== 0) {
                            const ppm = (stddev / Math.abs(average)) * 1_000_000;
                            stddevPpm = ppm.toFixed(3);
                        }
                        return (
                             <tr key={rt.value}>
                                <td>{rt.label}</td>
                                <td>{average?.toPrecision(8) ?? '...'}</td>
                                <td>{stddevPpm}</td>
                             </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);


function CalibrationResults({ showNotification }) {
    const { selectedSessionId } = useInstruments();
    const { theme } = useTheme();

    const [sessionInfo, setSessionInfo] = useState(null);
    const [calResults, setCalResults] = useState(null);
    const [calReadings, setCalReadings] = useState(null);
    const [tpData, setTPData] = useState({ points: [] });
    const [selectedTP, setSelectedTP] = useState(null);
    const [activeTab, setActiveTab] = useState('summary');
    const [detailsView, setDetailsView] = useState('chart');
    const [activeInstrument, setActiveInstrument] = useState('std');
    const [selectedReadingType, setSelectedReadingType] = useState('ac_open_readings');
    const [showCalcDetails, setShowCalcDetails] = useState(false);
    const [activeDirection, setActiveDirection] = useState('Forward');
    const [averagedResult, setAveragedResult] = useState(null);

    const calInfoHeaders = ['TI Model', 'TI Serial', 'STD Model', 'STD Serial', 'Calibration Date', 'Temperature', 'Humidity'];

    const uniqueTestPoints = useMemo(() => {
        if (!tpData?.points) return [];
        const pointMap = new Map();
        tpData.points.forEach(point => {
            const key = `${point.current}-${point.frequency}`;
            if (!pointMap.has(key)) {
                pointMap.set(key, { key, current: point.current, frequency: point.frequency, forward: null, reverse: null });
            }
            const entry = pointMap.get(key);
            if (point.direction === 'Forward') entry.forward = point;
            else if (point.direction === 'Reverse') entry.reverse = point;
        });
        return Array.from(pointMap.values());
    }, [tpData]);

    useEffect(() => {
        if (window.MathJax && (showCalcDetails || activeTab === 'summary')) {
             if (typeof window.MathJax.typesetPromise === 'function') {
                window.MathJax.typesetPromise().catch((err) => console.error('MathJax typeset failed:', err));
             }
        }
    }, [showCalcDetails, calResults, activeTab, averagedResult]);

    const fetchCalibrationData = useCallback(async () => {
        if (!selectedSessionId) {
            setSessionInfo(null);
            setTPData({ points: [] });
            setSelectedTP(null);
            return;
        }
        try {
            const [sessionResponse, tpResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`),
            ]);
            setSessionInfo(sessionResponse.data);
            const testPoints = tpResponse.data?.test_points || [];
            setTPData({ points: testPoints });
        } catch (error) {
            showNotification('Failed to load calibration data.', 'error');
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchCalibrationData();
    }, [fetchCalibrationData]);

    useEffect(() => {
        const pointForDirection = activeDirection === 'Forward' ? selectedTP?.forward : selectedTP?.reverse;
        if (pointForDirection) {
            setCalResults(pointForDirection.results);
            setCalReadings(pointForDirection.readings);
        } else {
            setCalResults(null);
            setCalReadings(null);
        }
    }, [selectedTP, activeDirection]);

    useEffect(() => {
        if (selectedTP) {
            const forwardResult = selectedTP.forward?.results?.delta_uut_ppm;
            const reverseResult = selectedTP.reverse?.results?.delta_uut_ppm;

            if (forwardResult !== null && forwardResult !== undefined && reverseResult !== null && reverseResult !== undefined) {
                const avg = (parseFloat(forwardResult) + parseFloat(reverseResult)) / 2;
                setAveragedResult(avg);
            } else {
                setAveragedResult(null);
            }
        } else {
            setAveragedResult(null);
        }
    }, [selectedTP]);

    const hasAllReadings = (point) => point?.readings && ['std_ac_open_readings', 'std_dc_pos_readings', 'std_dc_neg_readings', 'std_ac_close_readings', 'ti_ac_open_readings', 'ti_dc_pos_readings', 'ti_dc_neg_readings', 'ti_ac_close_readings'].every(key => point.readings[key]?.length > 0);
    const formatFrequency = (value) => (AVAILABLE_FREQUENCIES.find(f => f.value === value) || { text: `${value}Hz` }).text;

    const exportReadingsToXLSX = (instrumentType) => {
        if (!calReadings || !calResults) {
            showNotification('No data available to export.', 'warning');
            return;
        }
        const wb = XLSX.utils.book_new();
        const prefix = instrumentType === 'std' ? 'std_' : 'ti_';
        const instrumentName = instrumentType === 'std' ? 'Standard' : 'Test_Instrument';
        const pointForDirection = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;

        READING_TYPES.forEach(rt => {
            const key = `${prefix}${rt.value}`;
            const readingsArray = calReadings[key] || [];

            if (readingsArray.length > 0) {
                const sheetData = [['Sample #', 'Value', 'Timestamp']];
                readingsArray.forEach((point, index) => {
                    const p = typeof point === 'object' ? point : { value: point, timestamp: null };
                    const ts = p.timestamp ? new Date(p.timestamp * 1000).toLocaleString() : 'N/A';
                    sheetData.push([index + 1, p.value, ts]);
                });
                sheetData.push([]);
                const avgKey = `${prefix}${rt.value.replace('_readings', '_avg')}`;
                const stddevKey = `${prefix}${rt.value.replace('_readings', '_stddev')}`;
                const average = calResults?.[avgKey];
                const stddev = calResults?.[stddevKey];
                if (average !== undefined && average !== null) {
                    sheetData.push(['Average:', average.toPrecision(8)]);
                }
                if (stddev !== undefined && stddev !== null) {
                    sheetData.push(['Standard Deviation:', stddev.toPrecision(8)]);
                }
                const sheet = XLSX.utils.aoa_to_sheet(sheetData);
                XLSX.utils.book_append_sheet(wb, sheet, rt.label);
            }
        });

        if (wb.SheetNames.length > 0) {
            XLSX.writeFile(wb, `${instrumentName}_Readings_${pointForDirection.current}A_${formatFrequency(pointForDirection.frequency)}_${pointForDirection.direction}.xlsx`);
        } else {
            showNotification('No detailed readings to export for this instrument.', 'warning');
        }
    };

    const buildRawReadingsChartData = (prefix) => {
        if (!calReadings) return { labels: [], datasets: [] };
        const datasets = READING_TYPES.map(rt => {
            const key = `${prefix}${rt.value}`;
            return {
                label: rt.label,
                data: (calReadings[key] || []).map((point, index) => ({
                    x: index + 1,
                    y: typeof point === 'object' ? point.value : point,
                    t: typeof point === 'object' && point.timestamp ? new Date(point.timestamp * 1000) : null,
                })),
                borderColor: rt.color,
                backgroundColor: rt.color.replace(')', ', 0.5)').replace('rgb', 'rgba'),
                tension: 0.1, fill: false
            };
        });
        const allXLabels = datasets.flatMap(ds => ds.data.map(d => d.x));
        const uniqueXLabels = [...new Set(allXLabels)].sort((a, b) => a - b);
        return { labels: uniqueXLabels, datasets };
    };

    const CalculationBreakdown = ({ results }) => {
        if (!results || !results.delta_std_known || !results.eta_std || !results.eta_ti || !results.delta_uut_ppm) {
            return <div className="form-section-warning"><p>Calculation cannot be shown until all factors and readings are complete for this direction.</p></div>;
        }
        const V_DCSTD = (results.std_dc_pos_avg + Math.abs(results.std_dc_neg_avg)) / 2;
        const V_ACSTD = (results.std_ac_open_avg + results.std_ac_close_avg) / 2;
        const V_DCUUT = (results.ti_dc_pos_avg + Math.abs(results.ti_dc_neg_avg)) / 2;
        const V_ACUUT = (results.ti_ac_open_avg + results.ti_ac_close_avg) / 2;
        const term_STD = ((V_ACSTD - V_DCSTD) * 1000000) / (results.eta_std * V_DCSTD);
        const term_UUT = ((V_ACUUT - V_DCUUT) * 1000000) / (results.eta_ti * V_DCUUT);
        const mainFormula = `$$ \\delta_{UUT} \\approx \\delta_{STD} + \\left( \\frac{V_{AC} - V_{DC}}{\\eta \\times V_{DC}} \\right)_{STD} \\times 10^6 - \\left( \\frac{V_{AC} - V_{DC}}{\\eta \\times V_{DC}} \\right)_{UUT} \\times 10^6 $$`;
        const appliedValues = `$$ \\delta_{UUT} \\approx ${results.delta_std_known} + \\left( \\frac{${V_ACSTD.toPrecision(8)} - ${V_DCSTD.toPrecision(8)}}{${results.eta_std} \\times ${V_DCSTD.toPrecision(8)}} \\right) \\times 10^6 - \\left( \\frac{${V_ACUUT.toPrecision(8)} - ${V_DCUUT.toPrecision(8)}}{${results.eta_ti} \\times ${V_DCUUT.toPrecision(8)}} \\right) \\times 10^6 $$`;
        const intermediateBreakdown = `$$ \\delta_{UUT} \\approx ${results.delta_std_known.toFixed(3)} + ${term_STD.toFixed(3)} - ${term_UUT.toFixed(3)} $$`;
        const finalResult = `$$ \\delta_{UUT} \\approx ${parseFloat(results.delta_uut_ppm).toFixed(3)} \\text{ PPM} $$`

        return (
            <div className="calculation-breakdown" style={{background: 'var(--background-color)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                <h4 style={{marginTop: 0}}>Calculation Breakdown for {activeDirection} Direction</h4>
                <p style={{marginBottom: '0.5rem'}}><b>1. Full Formula:</b></p>
                <p style={{marginTop: '0.5rem'}}>{mainFormula}</p>
                <hr style={{borderColor: 'var(--border-color)', opacity: 0.5, margin: '1rem 0'}} />
                <p style={{marginBottom: '0.5rem'}}><b>2. Applied Values:</b></p>
                <p style={{marginTop: '0.5rem', overflowX: 'auto', whiteSpace: 'nowrap'}}>{appliedValues}</p>
                <hr style={{borderColor: 'var(--border-color)', opacity: 0.5, margin: '1rem 0'}} />
                <p style={{marginBottom: '0.5rem'}}><b>3. Intermediate Calculation:</b></p>
                <p style={{marginTop: '0.5rem'}}>{intermediateBreakdown}</p>
                <hr style={{borderColor: 'var(--border-color)', opacity: 0.5, margin: '1rem 0'}} />
                <p style={{marginBottom: '0.5rem'}}><b>4. Final Result:</b></p>
                <p style={{marginTop: '0.5rem'}}>{finalResult}</p>
            </div>
        );
    };
    
    return (
        <React.Fragment>
            <div className="content-area">
                {!selectedSessionId && <div className="form-section-warning"><p>Please select a session from the "Session Setup" tab to view data output.</p></div>}
                {selectedSessionId && (
                    <>
                        <h2>Calibration Session Information</h2>
                        <div className="table-container">
                            <table id="cal-info-table" className="cal-results-table" style={{marginBottom: '20px'}}>
                                <thead><tr>{calInfoHeaders.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                                <tbody><tr><td>{sessionInfo?.test_instrument_model || ''}</td><td>{sessionInfo?.test_instrument_serial || ''}</td><td>{sessionInfo?.standard_instrument_model || ''}</td><td>{sessionInfo?.standard_instrument_serial || ''}</td><td>{sessionInfo?.created_at ? new Date(sessionInfo.created_at).toLocaleDateString() : ''}</td><td>{sessionInfo?.temperature || ''}</td><td>{sessionInfo?.humidity || ''}</td></tr></tbody>
                            </table>
                        </div>

                        <div className="results-workflow-container">
                            <aside className="results-sidebar">
                                <div className="test-point-sidebar">
                                    <h4>Test Points</h4>
                                    <div className="test-point-list">
                                        {uniqueTestPoints.length > 0 ? (
                                            uniqueTestPoints.map((point) => (
                                                <button key={point.key} onClick={() => setSelectedTP(point)} className={`test-point-item ${selectedTP?.key === point.key ? 'active' : ''} ${hasAllReadings(point.forward) && hasAllReadings(point.reverse) ? 'completed' : ''}`}>
                                                    <span className="test-point-name">{point.current}A @ {formatFrequency(point.frequency)}</span>
                                                    {hasAllReadings(point.forward) && hasAllReadings(point.reverse) && <span className="status-icon">✓</span>}
                                                </button>
                                            ))
                                        ) : (<p className="no-test-points-message">No test points for this session.</p>)}
                                    </div>
                                </div>
                            </aside>
                            <main className="results-content">
                                {!selectedTP ? (
                                    <div className="placeholder-content">
                                        <h3>Select a Test Point</h3>
                                        <p>Please select a test point from the list to view its results.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="sub-nav">
                                            <button onClick={() => setActiveTab('summary')} className={activeTab === 'summary' ? 'active' : ''}><FaCalculator style={{marginRight: '8px'}}/>Summary</button>
                                            <button onClick={() => setActiveTab('details')} className={activeTab === 'details' ? 'active' : ''}><FaBookOpen style={{marginRight: '8px'}}/>Detailed Readings</button>
                                        </div>
                                        
                                        <DirectionToggle activeDirection={activeDirection} setActiveDirection={setActiveDirection} />

                                        {activeTab === 'summary' && (
                                            <div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                                    <FinalResultCard title={`AC-DC Diff. (${activeDirection})`} value={calResults?.delta_uut_ppm} formula={`$$ \\delta_{${activeDirection === 'Forward' ? 'Fwd' : 'Rev'}} $$`}/>
                                                    <FinalResultCard title="Averaged AC-DC Difference" value={averagedResult} formula="$$ \\delta_{Avg} = (\\delta_{Fwd} + \\delta_{Rev}) / 2 $$"/>
                                                </div>

                                                <div style={{ textAlign: 'center', margin: '10px 0 20px' }}><button className="button button-secondary button-small" onClick={() => setShowCalcDetails(!showCalcDetails)}>{showCalcDetails ? 'Hide Calculation Details' : 'Show Calculation Details'}</button></div>
                                                {showCalcDetails && <CalculationBreakdown results={calResults} />}
                                                <h4>Correction Factor Inputs ({activeDirection})</h4>
                                                <div className="reading-group">
                                                    <div className="reading"><h3>δ Standard (PPM)</h3><p>{calResults?.delta_std_known?.toFixed(3) ?? 'N/A'}</p></div>
                                                    <div className="reading"><h3>η Standard</h3><p>{calResults?.eta_std?.toPrecision(8) ?? 'N/A'}</p></div>
                                                    <div className="reading"><h3>η Test Instrument</h3><p>{calResults?.eta_ti?.toPrecision(8) ?? 'N/A'}</p></div>
                                                </div>
                                                <SummaryTable results={calResults} prefix="std_" title={`Standard Instrument Summary (${activeDirection})`}/>
                                                <SummaryTable results={calResults} prefix="ti_" title={`Test Instrument Summary (${activeDirection})`}/>
                                            </div>
                                        )}

                                        {activeTab === 'details' && (
                                            <div>
                                                <div className="details-action-bar">
                                                    <div className="view-toggle" title="Select Instrument">
                                                        <button className={activeInstrument === 'std' ? 'active' : ''} onClick={() => setActiveInstrument('std')}>Standard</button>
                                                        <button className={activeInstrument === 'ti' ? 'active' : ''} onClick={() => setActiveInstrument('ti')}>Test Instrument</button>
                                                    </div>
                                                    <div className="action-group">
                                                        <div className="form-section" style={{ visibility: detailsView === 'table' ? 'visible' : 'hidden', minWidth: '250px', marginRight: '1rem' }}>
                                                            <label>Measurement Type:</label>
                                                            <select value={selectedReadingType} onChange={(e) => setSelectedReadingType(e.target.value)}>
                                                                {READING_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="view-toggle">
                                                            <button className={detailsView === 'chart' ? 'active' : ''} onClick={() => setDetailsView('chart')}><FaChartBar style={{marginRight: '6px'}}/> Chart</button>
                                                            <button className={detailsView === 'table' ? 'active' : ''} onClick={() => setDetailsView('table')}><FaTable style={{marginRight: '6px'}}/> Table</button>
                                                        </div>
                                                        <FaDownload className="download-icon" title={`Export ${activeInstrument.toUpperCase()} Readings`} onClick={() => exportReadingsToXLSX(activeInstrument)} />
                                                    </div>
                                                </div>

                                                {detailsView === 'table' && (
                                                   <DetailedReadingsTable readingsArray={calReadings ? calReadings[`${activeInstrument}_${selectedReadingType}`] : []} />
                                                )}

                                                {detailsView === 'chart' && (
                                                    <div className="chart-container" style={{margin: 0, padding: 0, border: 'none'}}>
                                                        <CalibrationChart
                                                            title={`${activeInstrument === 'std' ? 'Standard' : 'Test'} Instrument Readings (${activeDirection})`}
                                                            chartData={buildRawReadingsChartData(`${activeInstrument}_`)}
                                                            theme={theme}
                                                            chartType="line"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </main>
                        </div>
                    </>
                )}
            </div>
        </React.Fragment>
    );
}

export default CalibrationResults;