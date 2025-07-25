import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { FaStop } from 'react-icons/fa';
import { useInstruments } from '../../contexts/InstrumentContext';
import { useTheme } from '../../contexts/ThemeContext';
import CalibrationChart from './CalibrationChart';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

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

const normalizeKey = value => parseFloat(value).toString();

const normalizeCorrectionData = rawData => {
    const normalized = {};
    for (const range in rawData) {
        const normRange = parseFloat(range).toString();
        normalized[normRange] = {};
        for (const current in rawData[range]) {
            const normCurrent = parseFloat(current).toString();
            normalized[normRange][normCurrent] = {};
            for (const frequency in rawData[range][current]) {
                const normFreq = parseFloat(frequency).toString();
                normalized[normRange][normCurrent][normFreq] = rawData[range][current][frequency];
            }
        }
    }
    return normalized;
};

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm' }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{title}</h3>
                <p style={{ marginBottom: '25px', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{message}</p>
                <div className="modal-actions">
                    <button onClick={onCancel} className="button button-secondary">Cancel</button>
                    <button onClick={onConfirm} className="button">{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

const SubNav = ({ activeTab, setActiveTab }) => (
    <div className="sub-nav">
        <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active' : ''}>1. Settings</button>
        <button onClick={() => setActiveTab('readings')} className={activeTab === 'readings' ? 'active' : ''}>2. Take Readings</button>
        <button onClick={() => setActiveTab('calculate')} className={activeTab === 'calculate' ? 'active' : ''}>3. Calculate Results</button>
    </div>
);

const DirectionToggle = ({ activeDirection, setActiveDirection }) => (
    <div className="view-toggle" style={{ marginBottom: '1rem', justifyContent: 'center' }}>
        <button className={activeDirection === 'Forward' ? 'active' : ''} onClick={() => setActiveDirection('Forward')}>Forward</button>
        <button className={activeDirection === 'Reverse' ? 'active' : ''} onClick={() => setActiveDirection('Reverse')}>Reverse</button>
    </div>
);

function Calibration({ showNotification }) {
    const {
        selectedSessionId, liveReadings, tiLiveReadings, initialLiveReadings, discoveredInstruments,
        stdInstrumentAddress, stdReaderModel, tiInstrumentAddress, tiReaderModel, acSourceAddress,
        dcSourceAddress, isCollecting, collectionProgress, startReadingCollection, stopReadingCollection,
        activeCollectionDetails, readingWsState, collectionStatus,
    } = useInstruments();
    const { theme } = useTheme();

    const [activeTab, setActiveTab] = useState('settings');
    const [tpData, setTPData] = useState({ test_points: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [calibrationConfigurations, setCalibrationConfigurations] = useState({});
    const [calibrationSettings, setCalibrationSettings] = useState({ initial_warm_up_time: 0, num_samples: 8, settling_time: 5 });
    const [fetchedResults, setFetchedResults] = useState(null);
    const [correctionInputs, setCorrectionInputs] = useState({ eta_std: '', eta_ti: '', delta_std_known: '' });
    const [finalPpmDifference, setFinalPpmDifference] = useState(null);
    const [averagedPpmDifference, setAveragedPpmDifference] = useState(null);
    const [selectedTP, setSelectedTP] = useState(null);
    const [activeDirection, setActiveDirection] = useState('Forward');
    const [lastCollectionDirection, setLastCollectionDirection] = useState(null);
    const [hardwareModal, setHardwareModal] = useState({ isOpen: false, onConfirm: () => {} });
    const [amplifierModal, setAmplifierModal] = useState({ isOpen: false, range: null, onConfirm: () => {} });
    const [bypassTvc, setBypassTvc] = useState(false);
    const [historicalReadings, setHistoricalReadings] = useState(initialLiveReadings);
    const [tiHistoricalReadings, setTiHistoricalReadings] = useState(initialLiveReadings);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [normalizeData, setNormalizeData] = useState({});

    const fetchCorrections = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/correction/`);
            setNormalizeData(normalizeCorrectionData(response.data));
        } catch (error) {
            showNotification('Could not fetch correction data from the database.', 'warning');
        }
    }, [showNotification]);

    useEffect(() => {
        fetchCorrections();
    }, [fetchCorrections]);

    useEffect(() => {
        if (collectionStatus === 'collection_stopped') {
            showNotification("Reading collection stopped by user.", "warning");
        }
    }, [collectionStatus, showNotification]);

    const getInstrumentIdentityByAddress = (address, model) => {
        if (!address) return 'Not Assigned';
        if (model) return `${model} (${address})`;
        const instrument = discoveredInstruments.find(inst => inst.address === address);
        return instrument ? `${instrument.identity} (${instrument.address})` : address;
    };

    const refreshTestPointList = useCallback(async () => {
        if (!selectedSessionId) return;
        try {
            const [tpResponse, infoResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`)
            ]);
            setTPData(tpResponse.data || { test_points: [] });
            setCalibrationConfigurations(infoResponse.data.configurations || {});
        } catch (error) { showNotification('Could not refresh test point list.', 'error'); }
    }, [selectedSessionId, showNotification]);

    useEffect(() => { if (!isCollecting) refreshTestPointList(); }, [isCollecting, refreshTestPointList]);

    const hasAllReadings = useCallback((point) => {
        if (!point?.readings) return false;
        return ['std_ac_open_readings', 'std_dc_pos_readings', 'std_dc_neg_readings', 'std_ac_close_readings', 'ti_ac_open_readings', 'ti_dc_pos_readings', 'ti_dc_neg_readings', 'ti_ac_close_readings'].every(k => point.readings[k]?.length > 0);
    }, []);

    const uniqueTestPoints = useMemo(() => {
        if (!tpData?.test_points) return [];
        const pointMap = new Map();
        tpData.test_points.forEach(point => {
            const key = `${point.current}-${point.frequency}`;
            if (!pointMap.has(key)) pointMap.set(key, { key, current: point.current, frequency: point.frequency, forward: null, reverse: null });
            const entry = pointMap.get(key);
            if (point.direction === 'Forward') entry.forward = point;
            else if (point.direction === 'Reverse') entry.reverse = point;
        });
        return Array.from(pointMap.values());
    }, [tpData]);

    const allForwardPointsComplete = useMemo(() => {
        if (uniqueTestPoints.length === 0) return false;
        return uniqueTestPoints.every(p => p.forward && hasAllReadings(p.forward));
    }, [uniqueTestPoints, hasAllReadings]);

    useEffect(() => {
        if (selectedTP && uniqueTestPoints.length > 0) {
            const updatedSelectedTP = uniqueTestPoints.find(p => p.key === selectedTP.key);
            if (updatedSelectedTP) setSelectedTP(updatedSelectedTP);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uniqueTestPoints]);

    useEffect(() => {
        if (selectedSessionId) {
            setIsLoading(true);
            refreshTestPointList().finally(() => setIsLoading(false));
        } else {
            setTPData({ test_points: [] });
            setCalibrationConfigurations({});
            setSelectedTP(null);
            setIsLoading(false);
        }
    }, [selectedSessionId, refreshTestPointList]);
    
    const getCorrection = useCallback(() => {
        if (selectedTP && calibrationConfigurations.ac_shunt_range) {
            const range = normalizeKey(calibrationConfigurations.ac_shunt_range);
            const current = normalizeKey(selectedTP.current);
            const frequency = normalizeKey(selectedTP.frequency);
            const correctionValue = normalizeData[range]?.[current]?.[frequency];
            if (correctionValue === undefined || correctionValue === null) {
                return null;
            }
            return correctionValue;
        }
        return null;
    }, [selectedTP, calibrationConfigurations, normalizeData]);

    useEffect(() => {
        const formatReadingsForChart = (readingsArray) => {
            if (!readingsArray) return [];
            return readingsArray.map((point, index) => ({ x: index + 1, y: (typeof point === 'object' ? point.value : point), t: (typeof point === 'object' && point.timestamp ? new Date(point.timestamp * 1000) : null) }));
        };
        setHistoricalReadings(initialLiveReadings);
        setTiHistoricalReadings(initialLiveReadings);
        setFetchedResults(null);
        setFinalPpmDifference(null);

        if (selectedTP) {
            const pointForDirection = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;
            if (pointForDirection) {
                setCalibrationSettings(pointForDirection.settings || { initial_warm_up_time: 0, num_samples: 8, settling_time: 5 });
                const results = pointForDirection.results;
                setFetchedResults(results);
                if (results) {
                    setCorrectionInputs({ eta_std: results.eta_std || '', eta_ti: results.eta_ti || '', delta_std_known: results.delta_std_known || '' });
                    setFinalPpmDifference(results.delta_uut_ppm);
                } else {
                     const correction = getCorrection();
                     setCorrectionInputs({ eta_std: '', eta_ti: '', delta_std_known: correction !== null ? correction : '' });
                     setFinalPpmDifference(null);
                }
                if (pointForDirection.readings) {
                    setHistoricalReadings({ ac_open: formatReadingsForChart(pointForDirection.readings.std_ac_open_readings), dc_pos: formatReadingsForChart(pointForDirection.readings.std_dc_pos_readings), dc_neg: formatReadingsForChart(pointForDirection.readings.std_dc_neg_readings), ac_close: formatReadingsForChart(pointForDirection.readings.std_ac_close_readings) });
                    setTiHistoricalReadings({ ac_open: formatReadingsForChart(pointForDirection.readings.ti_ac_open_readings), dc_pos: formatReadingsForChart(pointForDirection.readings.ti_dc_pos_readings), dc_neg: formatReadingsForChart(pointForDirection.readings.ti_dc_neg_readings), ac_close: formatReadingsForChart(pointForDirection.readings.ti_ac_close_readings) });
                }
            }
        } else {
            setAveragedPpmDifference(null);
        }
    }, [selectedTP, activeDirection, initialLiveReadings, getCorrection]);

    useEffect(() => {
        if (!selectedTP) {
            setAveragedPpmDifference(null);
            return;
        }
        const forwardResult = selectedTP.forward?.results?.delta_uut_ppm;
        const reverseResult = selectedTP.reverse?.results?.delta_uut_ppm;
        if (forwardResult !== undefined && forwardResult !== null && reverseResult !== undefined && reverseResult !== null) {
            const averagePpm = (parseFloat(forwardResult) + parseFloat(reverseResult)) / 2;
            setAveragedPpmDifference(averagePpm.toFixed(3));
        } else {
            setAveragedPpmDifference(null);
        }
    }, [selectedTP]);

    const handleCorrectionInputChange = (e) => setCorrectionInputs(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleFinalCalculation = async () => {
        const pointForDirection = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;
        if (!pointForDirection || !fetchedResults) return showNotification("Readings for this direction are not complete.", "error");
        if (!['std_dc_pos_avg', 'std_dc_neg_avg', 'std_ac_open_avg', 'std_ac_close_avg', 'ti_dc_pos_avg', 'ti_dc_neg_avg', 'ti_ac_open_avg', 'ti_ac_close_avg'].every(key => fetchedResults[key] !== null && fetchedResults[key] !== undefined) || !['eta_std', 'eta_ti', 'delta_std_known'].every(key => correctionInputs[key])) {
            return showNotification("Not all readings or correction factors are available for this direction.", "error");
        }
        const V_DCSTD = (fetchedResults.std_dc_pos_avg + Math.abs(fetchedResults.std_dc_neg_avg)) / 2;
        const V_ACSTD = (fetchedResults.std_ac_open_avg + fetchedResults.std_ac_close_avg) / 2;
        const V_DCUUT = (fetchedResults.ti_dc_pos_avg + Math.abs(fetchedResults.ti_dc_neg_avg)) / 2;
        const V_ACUUT = (fetchedResults.ti_ac_open_avg + fetchedResults.ti_ac_close_avg) / 2;
        const { eta_std, eta_ti, delta_std_known } = Object.fromEntries(Object.entries(correctionInputs).map(([k, v]) => [k, parseFloat(v)]));
        const term_STD = ((V_ACSTD - V_DCSTD) * 1000000) / (eta_std * V_DCSTD);
        const term_UUT = ((V_ACUUT - V_DCUUT) * 1000000) / (eta_ti * V_DCUUT);
        const finalPpmFormatted = (delta_std_known + term_STD - term_UUT).toFixed(3);
        setFinalPpmDifference(finalPpmFormatted);
        try {
            const { forward: forwardPoint, reverse: reversePoint } = selectedTP;
            const sharedPayload = { eta_std, eta_ti, delta_std_known };
            if (forwardPoint) {
                await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${forwardPoint.id}/update-results/`, {
                    ...sharedPayload, delta_uut_ppm: activeDirection === 'Forward' ? finalPpmFormatted : forwardPoint.results?.delta_uut_ppm
                });
            }
            if (reversePoint) {
                await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${reversePoint.id}/update-results/`, {
                    ...sharedPayload, delta_uut_ppm: activeDirection === 'Reverse' ? finalPpmFormatted : reversePoint.results?.delta_uut_ppm
                });
            }
            showNotification("Correction factors saved for both directions!", 'success');
            refreshTestPointList();
        } catch (error) { showNotification("Error saving results.", 'error'); }
    };

    const handleAverageCalculation = () => {
        if (!selectedTP) return;
        const { forward, reverse } = selectedTP;
        if (!forward?.results?.delta_uut_ppm || !reverse?.results?.delta_uut_ppm) return showNotification("Calculations for both Forward and Reverse directions must be completed first.", "error");
        const averagePpm = (parseFloat(forward.results.delta_uut_ppm) + parseFloat(reverse.results.delta_uut_ppm)) / 2;
        setAveragedPpmDifference(averagePpm.toFixed(3));
        showNotification(`Calculated Average δ UUT: ${averagePpm.toFixed(3)} PPM`, 'success');
    };
    
    const handleGetCorrection = () => {
        const correction = getCorrection();
        if (correction === null) {
            showNotification("No correction found for the selected test point parameters.", "info");
        } else {
            setCorrectionInputs(prev => ({ ...prev, delta_std_known: correction }));
            showNotification(`Applied correction: ${correction}`, "success");
        }
    };

    const executeReadingCollection = async (baseReadingKey) => {
        let pointData = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;
        const params = {
            command: 'start_collection',
            reading_type: baseReadingKey,
            num_samples: parseInt((pointData.settings || { num_samples: 8 }).num_samples, 10) || 8,
            test_point: { current: selectedTP.current, frequency: selectedTP.frequency, direction: activeDirection },
            test_point_id: pointData.id,
            std_reader_model: stdReaderModel,
            ti_reader_model: tiReaderModel,
            bypass_tvc: bypassTvc,
            amplifier_range: calibrationConfigurations.amplifier_range
        };
        if (startReadingCollection(params)) {
            setLastCollectionDirection(activeDirection);
        } else {
            showNotification('WebSocket is not connected. Please refresh the page.', 'error');
        }
    };

    const executeFullCalibration = async () => {
        let pointData = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;
        const params = {
            command: 'start_full_calibration',
            settling_time: parseFloat((pointData.settings || { settling_time: 5 }).settling_time, 10) || 5,
            num_samples: parseInt((pointData.settings || { num_samples: 8 }).num_samples, 10) || 8,
            test_point: { current: selectedTP.current, frequency: selectedTP.frequency, direction: activeDirection },
            test_point_id: pointData.id,
            std_reader_model: stdReaderModel,
            ti_reader_model: tiReaderModel,
            bypass_tvc: bypassTvc,
            amplifier_range: calibrationConfigurations.amplifier_range
        };
        if (startReadingCollection(params)) {
            setLastCollectionDirection(activeDirection);
        } else {
            showNotification('WebSocket is not connected. Please refresh the page.', 'error');
        }
    };

    const triggerReadingCollection = async (collectionFunction) => {
        const ampRange = calibrationConfigurations.amplifier_range;
        if (!ampRange) return showNotification('Amplifier Range is not set. Please set it in the Test Point Editor.', 'error');
        if (activeDirection === 'Reverse' && !allForwardPointsComplete) return showNotification('Please complete all Forward readings before starting Reverse.', 'error');

        let pointData = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;
        if (!pointData) {
            try {
                const { data } = await axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, { current: selectedTP.current, frequency: selectedTP.frequency, direction: activeDirection });
                pointData = data;
                await refreshTestPointList();
            } catch (error) { return showNotification(`Error creating ${activeDirection} configuration.`, 'error'); }
        }

        const confirmAndRun = () => {
            setAmplifierModal({ isOpen: true, range: ampRange, onConfirm: () => {
                setAmplifierModal({ isOpen: false });
                collectionFunction();
            }});
        };

        if (!lastCollectionDirection || activeDirection === lastCollectionDirection) {
            confirmAndRun();
        } else {
            setHardwareModal({ isOpen: true, onConfirm: () => {
                setHardwareModal({ isOpen: false });
                confirmAndRun();
            }});
        }
    };

    const handleCollectReadingsRequest = (baseReadingKey) => {
        triggerReadingCollection(() => executeReadingCollection(baseReadingKey));
    };

    const handleRunAllRequest = () => {
        triggerReadingCollection(() => executeFullCalibration());
    };

    const buildChartData = (readings) => ({
        labels: [...new Set(Object.values(readings).flatMap(arr => arr ? arr.map(point => point.x) : []))].sort((a, b) => a - b),
        datasets: READING_TYPES.map(type => ({ label: type.label, data: readings[type.key], borderColor: type.color, backgroundColor: type.color.replace(')', ', 0.5)').replace('rgb', 'rgba'), tension: 0.1, fill: false }))
    });

    const formatFrequency = (value) => (AVAILABLE_FREQUENCIES.find(f => f.value === value) || { text: `${value}Hz` }).text;

    const handleSettingsSubmit = async (e) => {
        e.preventDefault();
        if (!selectedTP || !selectedSessionId) return showNotification('No test point selected.', 'error');
        const newSettings = {
            initial_warm_up_time: parseFloat(calibrationSettings.initial_warm_up_time) || 0,
            num_samples: parseInt(calibrationSettings.num_samples, 10) || 8,
            settling_time: parseFloat(calibrationSettings.settling_time) || 5,
        };
        let { forward, reverse } = selectedTP;
        try {
            if (!forward) forward = (await axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, { current: selectedTP.current, frequency: selectedTP.frequency, direction: 'Forward' })).data;
            if (!reverse) reverse = (await axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, { current: selectedTP.current, frequency: selectedTP.frequency, direction: 'Reverse' })).data;
            await axios.patch(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${forward.id}/`, { settings: newSettings });
            await axios.patch(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${reverse.id}/`, { settings: newSettings });
            showNotification("Settings saved for both directions!", 'success');
            await refreshTestPointList();
            setActiveTab('readings');
        } catch (error) { showNotification("Error saving settings.", 'error'); }
    };

    const pointForDirection = selectedTP ? (activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse) : null;
    const isCurrentTPActive = isCollecting && activeCollectionDetails?.tpId === pointForDirection?.id;

    const stdChartDataSource = isCurrentTPActive ? { ...historicalReadings, ...liveReadings } : historicalReadings;
    const tiChartDataSource = isCurrentTPActive ? { ...tiHistoricalReadings, ...tiLiveReadings } : tiHistoricalReadings;
    
    const stdChartData = buildChartData(stdChartDataSource);
    const tiChartData = buildChartData(tiChartDataSource);
    const showStdChart = isCurrentTPActive || Object.values(historicalReadings).some(arr => arr && arr.length > 0);
    const showTiChart = isCurrentTPActive || Object.values(tiHistoricalReadings).some(arr => arr && arr.length > 0);

    const getStageName = () => {
        const stage = activeCollectionDetails?.stage || activeCollectionDetails?.readingKey;
        if (!stage) return 'Initializing...';
        return stage.replace(/_/g, ' ').replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());
    };
    
    return (
        <>
            <ConfirmationModal isOpen={hardwareModal.isOpen} title="Confirm Hardware Change" message={`Please ensure you have physically configured the hardware for the '${activeDirection}' direction before proceeding.`} onConfirm={hardwareModal.onConfirm} onCancel={() => setHardwareModal({ isOpen: false })} confirmText="Ready"/>
            <ConfirmationModal isOpen={amplifierModal.isOpen} title="Confirm Amplifier Range" message={`Please ensure the 8100 Amplifier range is set to ${amplifierModal.range} A.\n\nIncorrect range may damage the equipment.`} onConfirm={amplifierModal.onConfirm} onCancel={() => setAmplifierModal({ isOpen: false })} confirmText="Range is Set"/>
            {!selectedSessionId ? <div className="content-area form-section-warning"><p>Please select a session to run a calibration.</p></div>
            : isLoading ? <div className="content-area"><p>Loading session data...</p></div>
            : uniqueTestPoints.length === 0 ? <div className="content-area form-section-warning"><p>This session has no test points. Please go to the "Test Point Editor" to generate them.</p></div>
            : (
                <>
                    <div className="content-area"><h2>Configuration Summary</h2><div className="calibration-summary-bar">
                        <div className="summary-item"><strong>AC Shunt Range:</strong><span>{calibrationConfigurations.ac_shunt_range || 'N/A'} A</span></div>
                        <div className="summary-item"><strong>Amplifier Range:</strong><span>{calibrationConfigurations.amplifier_range || 'N/A'} A</span></div>
                        <div className="summary-item"><strong>Input Current:</strong><span>{uniqueTestPoints?.[0]?.current ? `${uniqueTestPoints[0].current} A` : 'N/A'}</span></div>
                    </div></div>
                    <div className="content-area"><h2>Sources & Readers</h2><div className="calibration-summary-bar" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="summary-item" style={{ textAlign: 'left' }}><strong>Standard Instrument Reader:</strong><span style={{ marginLeft: '8px' }}>{getInstrumentIdentityByAddress(stdInstrumentAddress, stdReaderModel)}</span></div>
                        <div className="summary-item" style={{ textAlign: 'left' }}><strong>Test Instrument Reader:</strong><span style={{ marginLeft: '8px' }}>{getInstrumentIdentityByAddress(tiInstrumentAddress, tiReaderModel)}</span></div>
                        <div className="summary-item" style={{ textAlign: 'left' }}><strong>AC Source:</strong><span style={{ marginLeft: '8px' }}>{getInstrumentIdentityByAddress(acSourceAddress)}</span></div>
                        <div className="summary-item" style={{ textAlign: 'left' }}><strong>DC Source:</strong><span style={{ marginLeft: '8px' }}>{getInstrumentIdentityByAddress(dcSourceAddress)}</span></div>
                    </div></div>
                    <div className="content-area"><div className="calibration-workflow-container">
                        <div className="test-point-sidebar"><h4>Test Points</h4><div className="test-point-list">
                            {uniqueTestPoints.map((point) => {
                                const isSelected = selectedTP?.key === point.key;
                                const isComplete = hasAllReadings(point.forward) && hasAllReadings(point.reverse);
                                const isCollectingNow = isCollecting && (activeCollectionDetails?.tpId === point.forward?.id || activeCollectionDetails?.tpId === point.reverse?.id);
                                return (
                                    <button key={point.key} onClick={() => setSelectedTP(point)} className={`test-point-item ${isSelected ? 'active' : ''} ${isComplete ? 'completed' : ''}`}>
                                        <span className="test-point-name">{point.current}A @ {formatFrequency(point.frequency)}</span>
                                        {isCollectingNow && <span className="status-indicator"></span>}
                                        {isComplete && !isCollectingNow && <span className="status-icon">✓</span>}
                                    </button>
                                );
                            })}
                        </div></div>
                        <div className="test-point-content">{!selectedTP ? <div className="placeholder-content"><h3>Select a Test Point</h3><p>Please select a test point from the list on the left to begin.</p></div> : (
                            <><SubNav activeTab={activeTab} setActiveTab={setActiveTab} /><div className="sub-tab-content">
                                {activeTab === 'settings' && (<form onSubmit={handleSettingsSubmit}>
                                    <h4>Calibration Settings for {selectedTP.current}A @ {formatFrequency(selectedTP.frequency)}</h4>
                                    <div className="config-grid">
                                        <div className="form-section"><label htmlFor="initial_warm_up_time">Initial Warm-up Wait (sec)</label><input type="number" id="initial_warm_up_time" name="initial_warm_up_time" value={calibrationSettings.initial_warm_up_time || 0} onChange={(e) => setCalibrationSettings(prev => ({ ...prev, initial_warm_up_time: e.target.value }))} /></div>
                                        <div className="form-section"><label htmlFor="num_samples"># of Samples</label><input type="number" id="num_samples" name="num_samples" required value={calibrationSettings.num_samples || 8} onChange={(e) => setCalibrationSettings(prev => ({ ...prev, num_samples: e.target.value }))} /></div>
                                        <div className="form-section"><label htmlFor="settling_time">Settling Time (sec)</label><input type="number" id="settling_time" name="settling_time" required value={calibrationSettings.settling_time || 5} onChange={(e) => setCalibrationSettings(prev => ({ ...prev, settling_time: e.target.value }))} /></div>
                                    </div><button type="submit" className="button button-primary">Save and Continue</button>
                                </form>)}
                                {activeTab === 'readings' && (<>
                                    <DirectionToggle activeDirection={activeDirection} setActiveDirection={setActiveDirection} />
                                    <div className="form-section">
                                        <h4>Reading Options</h4>
                                        <div className="checkbox-container">
                                            <input type="checkbox" id="bypass-tvc" checked={bypassTvc} onChange={(e) => setBypassTvc(e.target.checked)}/>
                                            <label htmlFor="bypass-tvc">Bypass TVC (Set Output based on Input Current)</label>
                                        </div>
                                    </div>
                                    <div className="form-section"><h4>Take Readings ({activeDirection})</h4>
                                    <div className="readings-grid">
                                        {isCollecting ? (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '20px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', gridColumn: '1 / -1' }}>
                                            <div style={{ flexGrow: 1, textAlign: 'left' }}>
                                            <p style={{ margin: 0, fontWeight: 500 }}>Collecting: {getStageName()}</p>
                                                <p style={{ margin: 0, fontSize: '0.9em', color: 'var(--text-muted)' }}>{collectionProgress.count} / {collectionProgress.total}</p>
                                            </div>
                                            <FaStop onClick={stopReadingCollection} title="Stop Collection" style={{ fontSize: '24px', color: '#dc3545', cursor: 'pointer', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}/>
                                        </div>) : (<>
                                            <button onClick={handleRunAllRequest} disabled={!selectedTP || readingWsState !== WebSocket.OPEN} className="button button-success" style={{ gridColumn: '1 / -1' }}>Run All Measurements</button>
                                            {READING_TYPES.map(({ key, label }) => {
                                                const isDisabled = !selectedTP || !stdInstrumentAddress || !tiInstrumentAddress || readingWsState !== WebSocket.OPEN;
                                                return <button key={key} onClick={() => handleCollectReadingsRequest(key)} disabled={isDisabled} className="button">Take {label} Readings</button>;
                                            })}
                                        </>)}
                                    </div></div>
                                    {showStdChart && <div className="chart-container"><CalibrationChart title="Standard Instrument Readings" chartData={stdChartData} chartType="line" theme={theme} onHover={setHoveredIndex} syncedHoverIndex={hoveredIndex} comparisonData={tiChartData.datasets} /></div>}
                                    {showTiChart && <div className="chart-container"><CalibrationChart title="Test Instrument Readings" chartData={tiChartData} chartType="line" theme={theme} onHover={setHoveredIndex} syncedHoverIndex={hoveredIndex} comparisonData={stdChartData.datasets} /></div>}
                                </>)}
                                {activeTab === 'calculate' && (<>
                                    <div className="form-section"><h4>Correction Factor Inputs</h4><p>Enter known correction factors from your equipment's calibration certificates.</p><div className="config-grid">
                                        <div className="config-column"><label htmlFor="eta_std">η Standard (Gain Factor)</label><input type="number" step="any" id="eta_std" name="eta_std" value={correctionInputs.eta_std} onChange={handleCorrectionInputChange} placeholder="e.g., 1.00012" /></div>
                                        <div className="config-column"><label htmlFor="eta_ti">η Test Instrument (Gain Factor)</label><input type="number" step="any" id="eta_ti" name="eta_ti" value={correctionInputs.eta_ti} onChange={handleCorrectionInputChange} placeholder="e.g., 0.99987" /></div>
                                        <div className="config-column">
                                            <label htmlFor="delta_std_known">δ Standard (PPM)</label>
                                            <input type="number" step="any" id="delta_std_known" name="delta_std_known" value={correctionInputs.delta_std_known} onChange={handleCorrectionInputChange} placeholder="e.g., 5.5" />
                                            <button type="button" onClick={handleGetCorrection} className="button" style={{marginTop: '10px'}}>
                                                Get Known Correction
                                            </button>
                                        </div>
                                    </div></div>
                                    <DirectionToggle activeDirection={activeDirection} setActiveDirection={setActiveDirection} />
                                    <div className="form-section"><h4>UUT AC-DC Difference for {activeDirection} Direction (δ)</h4><div className="calculation-area"><button onClick={handleFinalCalculation} disabled={isCollecting} className="button button-primary">Calculate & Save Result (δ)</button><div className="reading-group"><div className="reading"><h3>δ UUT (PPM):</h3><p style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--primary-color)' }}>{finalPpmDifference ? parseFloat(finalPpmDifference).toFixed(3) : 'Not Calculated'}</p></div></div></div></div>
                                    <div className="form-section" style={{ borderTop: '2px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}><h4>Final Averaged AC-DC Difference</h4><p>This result is the average of the Forward and Reverse direction calculations.</p><div className="calculation-area"><button onClick={handleAverageCalculation} disabled={isCollecting} className="button button-success">Calculate Averaged Result</button><div className="reading-group"><div className="reading"><h3>Avg. δ UUT (PPM):</h3><p style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--success-color)' }}>{averagedPpmDifference ? averagedPpmDifference : 'Not Calculated'}</p></div></div></div></div>
                                </>)}
                            </div></>
                        )}</div>
                    </div></div>
                </>
            )}
        </>
    );
}

export default Calibration;