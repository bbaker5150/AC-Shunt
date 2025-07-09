import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';
import { useTheme } from '../../contexts/ThemeContext';
import CalibrationChart from './CalibrationChart';

const API_BASE_URL = 'http://127.0.0.1:8000/api';
const WS_BASE_URL = 'ws://127.0.0.1:8000/ws';

const READING_TYPES = [
    { key: 'ac_open', label: 'AC Open', color: 'rgb(75, 192, 192)' },
    { key: 'dc_pos', label: 'DC+', color: 'rgb(255, 99, 132)' },
    { key: 'dc_neg', label: 'DC-', color: 'rgb(54, 162, 235)' },
    { key: 'ac_close', label: 'AC Close', color: 'rgb(255, 205, 86)' }
];

const AVAILABLE_FREQUENCIES = [
    { text: '10Hz', value: 10 }, { text: '20Hz', value: 20 }, { text: '50Hz', value: 50 },
    { text: '60Hz', value: 60 }, { text: '100Hz', value: 100 }, { text: '200Hz', value: 200 },
    { text: '500Hz', value: 500 }, { text: '1kHz', value: 1000 }, { text: '2kHz', value: 2000 },
    { text: '5kHz', value: 5000 }, { text: '10kHz', value: 10000 }, { text: '20kHz', value: 20000 },
    { text: '50kHz', value: 50000 }, { text: '100kHz', value: 100000 }
];

// New component for the tab navigation
const SubNav = ({ activeTab, setActiveTab }) => (
    <div className="sub-nav" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active' : ''}>
            Settings
        </button>
        <button onClick={() => setActiveTab('readings')} className={activeTab === 'readings' ? 'active' : ''}>
            Take Readings
        </button>
        <button onClick={() => setActiveTab('calculate')} className={activeTab === 'calculate' ? 'active' : ''}>
            Calculate Results
        </button>
    </div>
);


function Calibration({ showNotification }) {
    const {
        selectedSessionId,
        liveReadings, setLiveReadings,
        tiLiveReadings, setTiLiveReadings,
        initialLiveReadings
    } = useInstruments();
    const { theme } = useTheme();

    // State to manage which sub-tab is active
    const [activeTab, setActiveTab] = useState('settings');

    const [tpData, setTPData] = useState({ points: [] });
    const [calibrationConfigurations, setCalibrationConfigurations] = useState({});
    const [calibrationSettings, setCalibrationSettings] = useState({
        initial_warm_up_time: 0, num_samples: 8
    });
    const [fetchedResults, setFetchedResults] = useState(null);

    const [correctionInputs, setCorrectionInputs] = useState({
        eta_std: '',
        eta_ti: '',
        delta_std_known: ''
    });
    const [finalPpmDifference, setFinalPpmDifference] = useState(null);

    const [isCollecting, setIsCollecting] = useState(false);
    const [collectionProgress, setCollectionProgress] = useState({ count: 0, total: 0 });
    const [currentReadingKey, setCurrentReadingKey] = useState('');

    const [selectedTP, setSelectedTP] = useState(null);

    const ws = useRef(null);

    useEffect(() => {
        if (window.MathJax) {
            window.MathJax.typeset();
        }
    });

    const fetchAllCalibrationData = useCallback(async () => {
        if (!selectedSessionId) {
            setTPData({ points: [] });
            setCalibrationSettings({ initial_warm_up_time: 0, num_samples: 8});
            setCorrectionInputs({ eta_std: '', eta_ti: '', delta_std_known: '' });
            setFinalPpmDifference(null);
            setFetchedResults(null);
            return;
        }
        try {
            const [tpResponse, infoResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`),
            ]);

            setTPData(tpResponse.data || { points: [] });
            setCalibrationConfigurations(infoResponse.data.configurations);

            if (selectedTP) {
                const tp = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.id}/`);

                setCalibrationSettings(tp.data.settings || { initial_warm_up_time: 0, num_samples: 8 });

                const results = tp.data.results;
                if (results != null) {
                    setFetchedResults(results);
                    setCorrectionInputs({
                        eta_std: results.eta_std || '',
                        eta_ti: results.eta_ti || '',
                        delta_std_known: results.delta_std_known || ''
                    });
                    setFinalPpmDifference(results.delta_uut_ppm);
                }
            } else {
                showNotification("Please select a test point.");
            }

        } catch (error) {
            console.error("Failed to fetch calibration data:", error);
            showNotification('Failed to load calibration data for the selected session.', 'error');
        }
    }, [selectedSessionId, selectedTP, showNotification]);

    const performAutomaticCalculations = useCallback(async (readings, results) => {
        const openReadings = readings.std_ac_open_readings || [];
        const closeReadings = readings.std_ac_close_readings || [];
        let eta_std_placeholder = 1;
        if (openReadings.length > 0 && closeReadings.length > 0) {
            const avgOpen = openReadings.reduce((a, b) => a + b, 0) / openReadings.length;
            const avgClose = closeReadings.reduce((a, b) => a + b, 0) / closeReadings.length;
            eta_std_placeholder = avgOpen !== 0 ? (avgClose / avgOpen) : 1;
        }
        const eta_ti_placeholder = eta_std_placeholder * 0.99998;

        const V_DCSTD = (results.std_dc_pos_avg + Math.abs(results.std_dc_neg_avg)) / 2;
        const V_ACSTD = (results.std_ac_open_avg + results.std_ac_close_avg) / 2;
        const V_DCUUT = (results.ti_dc_pos_avg + Math.abs(results.ti_dc_neg_avg)) / 2;
        const V_ACUUT = (results.ti_ac_open_avg + results.ti_ac_close_avg) / 2;

        const delta_STD_known = 0;
        const term_STD = ((V_ACSTD - V_DCSTD) * 1000000) / (eta_std_placeholder * V_DCSTD);
        const term_UUT = ((V_ACUUT - V_DCUUT) * 1000000) / (eta_ti_placeholder * V_DCUUT);

        const final_ppm = delta_STD_known + term_STD - term_UUT;
        const finalPpmFormatted = final_ppm.toFixed(3);

        showNotification(`Auto-calculated δ UUT: ${finalPpmFormatted} PPM`, 'success');

        try {
            if (selectedTP) {
                await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.id}/update-results/`,
                    {
                        eta_std: eta_std_placeholder.toFixed(5),
                        eta_ti: eta_ti_placeholder.toFixed(5),
                        delta_uut_ppm: finalPpmFormatted
                    }
                );
                showNotification("Final results saved successfully!", 'success');
                fetchAllCalibrationData();
            }

        } catch (error) {
            showNotification("Error saving final calculations.", 'error');
            console.error("Failed to save final results:", error);
        }
    }, [selectedSessionId, selectedTP, showNotification, fetchAllCalibrationData]);

    const handleSaveTiReadings = useCallback(async (testPoint) => {
        if (!testPoint?.readings) {
            console.error("TestPoint or its readings data is missing.");
            showNotification("Error: Missing TestPoint data for TI readings.", 'error');
            return;
        }

        const factorFor = (isAc) => (isAc ? 1.000008 : 1.000005);
        const scaleReadings = (readings, isAc) => readings?.map(r => r * factorFor(isAc)) || [];

        const {
            std_ac_open_readings,
            std_dc_pos_readings,
            std_dc_neg_readings,
            std_ac_close_readings
        } = testPoint.readings;

        const tiReadings = {
            ti_ac_open_readings: scaleReadings(std_ac_open_readings, true),
            ti_dc_pos_readings: scaleReadings(std_dc_pos_readings, false),
            ti_dc_neg_readings: scaleReadings(std_dc_neg_readings, false),
            ti_ac_close_readings: scaleReadings(std_ac_close_readings, true),
        };

        setTiLiveReadings({
            ac_open: tiReadings.ti_ac_open_readings,
            dc_pos: tiReadings.ti_dc_pos_readings,
            dc_neg: tiReadings.ti_dc_neg_readings,
            ac_close: tiReadings.ti_ac_close_readings,
        });

        const stripMeta = ({ created_at, updated_at, test_point, id, ...rest }) => rest;

        const updatedPayload = {
            current: testPoint.current,
            frequency: testPoint.frequency,
            readings: {
                ...stripMeta(testPoint.readings),
                ...tiReadings,
                std_ac_open_readings,
                std_dc_pos_readings,
                std_dc_neg_readings,
                std_ac_close_readings
            },
            results: stripMeta(testPoint.results || {})
        };

        try {
            const response = await axios.put(
                `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${testPoint.id}/`,
                updatedPayload
            );
            showNotification('TI readings saved and updated for TestPoint.', 'success');

            const updated = response.data;
            performAutomaticCalculations(updated.readings, updated.results, updated);

        } catch (error) {
            console.error("Failed to save TI readings:", error.response?.data || error.message);
            showNotification("Error saving TI readings.", 'error');
        }
    }, [selectedSessionId, showNotification, setTiLiveReadings, performAutomaticCalculations]);



    useEffect(() => {
        if (selectedSessionId) {
            const socketUrl = `${WS_BASE_URL}/collect-readings/${selectedSessionId}/`;
            ws.current = new WebSocket(socketUrl);
            ws.current.onopen = () => console.log("Reading collector WebSocket connected.");
            ws.current.onclose = () => console.log("Reading collector WebSocket disconnected.");
            ws.current.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'reading_update') {
                    setCurrentReadingKey(prevKey => {
                        setLiveReadings(readings => ({ ...readings, [prevKey]: [...(readings[prevKey] || []), data.reading] }));
                        return prevKey;
                    });
                    setCollectionProgress({ count: data.count, total: data.total });
                } else if (data.type === 'collection_finished') {
                    showNotification(data.message, 'success');
                    setIsCollecting(false);
                    setCurrentReadingKey('');
                    axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`).then(response => {
                        const testPoints = response.data.test_points;

                        const pointToSave = testPoints.find(p =>
                            p.id === selectedTP.id
                        );

                        if (pointToSave) {
                            handleSaveTiReadings(pointToSave);
                        } else {
                            console.warn("Could not find test point with current:", selectedTP.current, "and frequency:", selectedTP.frequency);
                        }
                    });
                } else if (data.type === 'error') {
                    showNotification(data.message, 'error');
                    setIsCollecting(false);
                    setCurrentReadingKey('');
                }
            };
            return () => { if (ws.current) ws.current.close(); };
        }
    }, [selectedSessionId, selectedTP, showNotification, setLiveReadings, handleSaveTiReadings]);

    useEffect(() => { fetchAllCalibrationData(); }, [fetchAllCalibrationData]);

    const handleCorrectionInputChange = (e) => {
        const { name, value } = e.target;
        setCorrectionInputs(prev => ({ ...prev, [name]: value }));
    };

    const handleFinalCalculation = async () => {
        if (!fetchedResults || !correctionInputs.eta_std || !correctionInputs.eta_ti || !correctionInputs.delta_std_known) {
            showNotification("Please ensure all readings are taken and all correction factors are entered.", "error");
            return;
        }

        const V_DCSTD = (fetchedResults.std_dc_pos_avg + Math.abs(fetchedResults.std_dc_neg_avg)) / 2;
        const V_ACSTD = (fetchedResults.std_ac_open_avg + fetchedResults.std_ac_close_avg) / 2;
        const V_DCUUT = (fetchedResults.ti_dc_pos_avg + Math.abs(fetchedResults.ti_dc_neg_avg)) / 2;
        const V_ACUUT = (fetchedResults.ti_ac_open_avg + fetchedResults.ti_ac_close_avg) / 2;

        const delta_STD_known = parseFloat(correctionInputs.delta_std_known);
        const eta_std = parseFloat(correctionInputs.eta_std);
        const eta_ti = parseFloat(correctionInputs.eta_ti);

        const term_STD = ((V_ACSTD - V_DCSTD) * 1000000) / (eta_std * V_DCSTD);
        const term_UUT = ((V_ACUUT - V_DCUUT) * 1000000) / (eta_ti * V_DCUUT);

        const final_ppm = delta_STD_known + term_STD - term_UUT;
        const finalPpmFormatted = final_ppm.toFixed(3);

        setFinalPpmDifference(finalPpmFormatted);
        showNotification(`Calculated δ UUT: ${finalPpmFormatted} PPM`, 'success');

        try {
            if (selectedTP) {
                await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.id}/update-results/`,
                    {
                        eta_std: eta_std,
                        eta_ti: eta_ti,
                        delta_std_known: delta_STD_known,
                        delta_uut_ppm: finalPpmFormatted
                    }
                );
                showNotification("Inputs and final result saved successfully!", 'success');
            }

        } catch (error) {
            showNotification("Error saving calculations.", 'error');
            console.error("Failed to save final results:", error);
        }
    };

    const handleCollectReadings = (readingKey) => {
        const numSamples = parseInt(calibrationSettings.num_samples, 10) || 8;
        if (ws.current?.readyState === WebSocket.OPEN) {
            setLiveReadings(prev => ({ ...prev, [readingKey]: [] }));
            setCollectionProgress({ count: 0, total: numSamples });
            setCurrentReadingKey(readingKey);
            setIsCollecting(true);
            showNotification(`Starting collection of ${numSamples} samples...`, 'info', 2000);
            ws.current.send(JSON.stringify({
                command: 'start_collection',
                reading_type: `std_${readingKey}`,
                num_samples: numSamples,
                test_point: {
                    current: selectedTP.current,
                    frequency: selectedTP.frequency,
                },
            }));
        } else {
            showNotification('WebSocket is not connected. Please refresh the page.', 'error');
        }
    };

    const buildChartData = (readings) => {
        const datasets = READING_TYPES.map(type => ({
            label: type.label, data: readings[type.key],
            borderColor: type.color, backgroundColor: type.color.replace(')', ', 0.5)').replace('rgb', 'rgba'),
            tension: 0.1, fill: false,
        }));
        const maxLength = Math.max(0, ...Object.values(readings).map(arr => arr.length));
        const labels = Array.from({ length: maxLength }, (_, i) => i + 1);
        return { labels, datasets };
    };

    const formatFrequency = (value) => {
        const freqObject = AVAILABLE_FREQUENCIES.find(f => f.value === value);
        return freqObject ? freqObject.text : `${value}Hz`;
    };

    const stdChartData = buildChartData(liveReadings);
    const tiChartData = buildChartData(tiLiveReadings);
    const showStdLiveChart = Object.values(liveReadings).some(arr => arr.length > 0) || isCollecting;
    const showTiLiveChart = Object.values(tiLiveReadings).some(arr => arr.length > 0);

    const handleSettingsSubmit = async (e) => {
        e.preventDefault();
        if (!selectedSessionId) {
            showNotification('No active session to save settings.', 'error');
            return;
        }
        try {
            if (selectedTP) {
                await axios.patch(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.id}/`, {
                    settings: {
                        initial_warm_up_time: parseFloat(calibrationSettings.initial_warm_up_time) || 0,
                        num_samples: parseInt(calibrationSettings.num_samples, 10) || 8
                    }
                });
                showNotification("Settings saved successfully!", 'success');
                setActiveTab('readings'); // Move to next tab
            } else {
                showNotification("Please select a test point.");
            }

        } catch (error) {
            console.error("Failed to save settings", error);
            showNotification("Error saving settings.", 'error');
        }
    };

    return (
        <div className="content-area">
            {!selectedSessionId ? (
                <div className="form-section-warning"><p>Please select a session to run a calibration.</p></div>
            ) : (
                <>
                    <SubNav activeTab={activeTab} setActiveTab={setActiveTab} />

                    <div className="sub-tab-content">
                        <div className="calibration-summary-bar" style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            alignItems: 'center',
                            padding: '10px 20px',
                            marginBottom: '20px',
                            backgroundColor: 'var(--background-color-offset)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div className="summary-item" style={{ textAlign: 'center' }}>
                                <strong>AC Shunt Range:</strong>
                                <span style={{ marginLeft: '8px' }}>{calibrationConfigurations.ac_shunt_range || 'N/A'} A</span>
                            </div>
                            <div className="summary-item" style={{ textAlign: 'center' }}>
                                <strong>8100 Amplifier Range:</strong>
                                <span style={{ marginLeft: '8px' }}>{calibrationConfigurations.amplifier_range || 'N/A'} A</span>
                            </div>
                            <div className="summary-item" style={{ textAlign: 'center' }}>
                                <strong>Input Current:</strong>
                                <span style={{ marginLeft: '8px' }}>{tpData?.test_points?.[0]?.current ? `${tpData.test_points[0].current} A` : 'N/A'}</span>
                            </div>
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
                                                {point.current}A @ {formatFrequency(point.frequency)}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <p style={{ margin: 0, fontStyle: 'italic' }}>No test points generated. Go to the "Test Point Setup" tab to configure.</p>
                                )}
                            </div>
                        </div>

                        {activeTab === 'settings' && (
                            <>
                                <form onSubmit={handleSettingsSubmit}>
                                    <h4>Calibration Settings</h4>
                                    <div className="config-grid">
                                        <div className="config-column">
                                            <div className="form-section">
                                                <label htmlFor="initial_warm_up_time">Initial Warm-up Wait (sec)</label>
                                                <input type="number" id="initial_warm_up_time" name="initial_warm_up_time" value={calibrationSettings.initial_warm_up_time || 0} onChange={(e) => setCalibrationSettings(prev => ({ ...prev, initial_warm_up_time: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="config-column">
                                            <div className="form-section">
                                                <label htmlFor="num_samples"># of Samples</label>
                                                <input type="number" id="num_samples" name="num_samples" required value={calibrationSettings.num_samples || 8} onChange={(e) => setCalibrationSettings(prev => ({ ...prev, num_samples: e.target.value }))} />
                                            </div>
                                        </div>
                                    </div>
                                    <button type="submit" className="button button-primary" disabled={!selectedSessionId}>Save and Continue</button>
                                </form>
                            </>
                        )}

                        {activeTab === 'readings' && (
                            <>
                                <div className="form-section">
                                    <h4>Standard Instrument Readings</h4>
                                    <p>Instrument: 34420A @ GPIB0::22::INSTR</p>
                                    <div className="config-grid">
                                        {READING_TYPES.map(({ key, label }) => (
                                            <div key={key} className="config-column">
                                                <button onClick={() => handleCollectReadings(key)} disabled={isCollecting} className="button">
                                                    {isCollecting && currentReadingKey === key ? 'Collecting...' : `Take ${label} Readings`}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {showStdLiveChart && (
                                        <div className="chart-container" style={{ marginTop: '20px', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h5 style={{ textAlign: 'center', marginTop: '0' }}>
                                                    Live Standard Readings
                                                    {isCollecting && ` (${collectionProgress.count} of ${collectionProgress.total})`}
                                                </h5>
                                                <button className="button button-danger button-small" onClick={() => setLiveReadings(initialLiveReadings)}>
                                                    Clear Chart
                                                </button>
                                            </div>
                                            <CalibrationChart title="" chartData={stdChartData} chartType="line" theme={theme} />
                                        </div>
                                    )}
                                </div>
                                <div className="form-section">
                                    <h4>Test Instrument Readings</h4>
                                    <p>Simulated data based on Standard instrument readings. Populates after all Standard readings are complete.</p>
                                    {showTiLiveChart && (
                                        <div className="chart-container" style={{ marginTop: '20px', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h5 style={{ textAlign: 'center', marginTop: '0' }}>
                                                    Simulated Test Instrument Readings
                                                </h5>
                                                <button className="button button-danger button-small" onClick={() => setTiLiveReadings(initialLiveReadings)}>
                                                    Clear Chart
                                                </button>
                                            </div>
                                            <CalibrationChart title="" chartData={tiChartData} chartType="line" theme={theme} />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'calculate' && (
                            <>
                                <div className="form-section">
                                    <h4>Correction Factor Inputs</h4>
                                    <p>Enter the known correction factors from your equipment's calibration certificates.</p>
                                    <div className="config-grid">
                                        <div className="config-column">
                                            <label htmlFor="eta_std">η Standard (Gain Factor)</label>
                                            <input type="number" step="any" id="eta_std" name="eta_std" value={correctionInputs.eta_std} onChange={handleCorrectionInputChange} placeholder="e.g., 1.00012" />
                                        </div>
                                        <div className="config-column">
                                            <label htmlFor="eta_ti">η Test Instrument (Gain Factor)</label>
                                            <input type="number" step="any" id="eta_ti" name="eta_ti" value={correctionInputs.eta_ti} onChange={handleCorrectionInputChange} placeholder="e.g., 0.99987" />
                                        </div>
                                        <div className="config-column">
                                            <label htmlFor="delta_std_known">δ Standard (PPM)</label>
                                            <input type="number" step="any" id="delta_std_known" name="delta_std_known" value={correctionInputs.delta_std_known} onChange={handleCorrectionInputChange} placeholder="e.g., 5.5" />
                                        </div>
                                    </div>
                                </div>
                                <div className="form-section">
                                    <h4>UUT AC-DC Difference Measurement (δ)</h4>
                                    <p>
                                        {'This is the final result in Parts-Per-Million (PPM), calculated using the entered correction factors and measured readings.'}
                                    </p>
                                    <div className="config-grid">
                                        <div className="config-column">
                                            <button onClick={handleFinalCalculation} disabled={isCollecting || !fetchedResults} className="button button-primary">
                                                Calculate Final Result (δ)
                                            </button>
                                        </div>
                                        <div className="reading-group">
                                            <div className="reading">
                                                <h3>δ UUT (PPM):</h3>
                                                <p style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                                    {finalPpmDifference ? parseFloat(finalPpmDifference).toFixed(3) : 'Not Calculated'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )
            }
        </div >
    );
}

export default Calibration;