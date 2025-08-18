import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { FaStop, FaCalculator, FaTimes } from 'react-icons/fa';
import { useInstruments } from '../../contexts/InstrumentContext';
import { useTheme } from '../../contexts/ThemeContext';
import CalibrationChart from './CalibrationChart';
import SwitchControl from './SwitchControl';
import ActionDropdownButton from './ActionDropdownButton';

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

const NPLC_OPTIONS = [0.02, 0.2, 1, 2, 10, 20, 100, 200];

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

// MODAL FOR CORRECTION FACTOR INPUTS
const CorrectionFactorsModal = ({ isOpen, onClose, onSubmit, initialValues, onInputChange, onGetCorrection }) => {
    if (!isOpen) return null;

    const isFormValid = Object.values(initialValues).every(val => val !== '' && !isNaN(parseFloat(val)));

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '600px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Correction Factor Inputs</h3>
                    <button onClick={onClose} className="modal-close-button" style={{ position: 'static' }}><FaTimes /></button>
                </div>
                <p>Enter known correction factors. These will be applied to all completed directions.</p>

                <div className="modal-form-grid">
                    <div className="form-group">
                        <label htmlFor="eta_std">η Standard (Gain Factor)</label>
                        <input type="number" step="any" id="eta_std" name="eta_std" value={initialValues.eta_std} onChange={onInputChange} placeholder="e.g., 1.00012" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="eta_ti">η Test Instrument (Gain Factor)</label>
                        <input type="number" step="any" id="eta_ti" name="eta_ti" value={initialValues.eta_ti} onChange={onInputChange} placeholder="e.g., 0.99987" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="delta_std">δ Standard (TVC AC-DC Difference)</label>
                        <input type="number" step="any" id="delta_std" name="delta_std" value={initialValues.delta_std} onChange={onInputChange} placeholder="e.g., -1" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="delta_ti">δ Test Instrument (TVC AC-DC Difference)</label>
                        <input type="number" step="any" id="delta_ti" name="delta_ti" value={initialValues.delta_ti} onChange={onInputChange} placeholder="e.g., -2" />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="delta_std_known">δ Standard (PPM)</label>
                        <input type="number" step="any" id="delta_std_known" name="delta_std_known" value={initialValues.delta_std_known} onChange={onInputChange} placeholder="e.g., 5.5" />
                    </div>
                </div>

                <div className="modal-actions">
                    <button type="button" onClick={onGetCorrection} className="button button-secondary">
                        Fetch Corrections
                    </button>
                    <div className="modal-actions-right">
                        <button onClick={onClose} className="button button-secondary">Cancel</button>
                        <button onClick={() => onSubmit(initialValues)} className="button button-primary" disabled={!isFormValid}>Calculate & Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
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
        activeCollectionDetails, readingWsState, collectionStatus, switchDriverAddress,
        clearLiveReadings, amplifierAddress,
        lastMessage,
        sendWsCommand,
    } = useInstruments();
    const { theme } = useTheme();

    const [activeTab, setActiveTab] = useState('settings');
    const [tpData, setTPData] = useState({ test_points: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [calibrationConfigurations, setCalibrationConfigurations] = useState({});
    const [calibrationSettings, setCalibrationSettings] = useState({ initial_warm_up_time: 0, num_samples: 8, settling_time: 5 });
    const [correctionInputs, setCorrectionInputs] = useState({ eta_std: '', eta_ti: '', delta_std: '', delta_ti: '', delta_std_known: '' });
    const [averagedPpmDifference, setAveragedPpmDifference] = useState(null);
    const [selectedTP, setSelectedTP] = useState(null);
    const [activeDirection, setActiveDirection] = useState('Forward');
    const [lastCollectionDirection, setLastCollectionDirection] = useState(null);
    const [hardwareModal, setHardwareModal] = useState({ isOpen: false, onConfirm: () => { } });
    const [amplifierModal, setAmplifierModal] = useState({ isOpen: false, range: null, onConfirm: () => { } });
    const [historicalReadings, setHistoricalReadings] = useState(initialLiveReadings);
    const [tiHistoricalReadings, setTiHistoricalReadings] = useState(initialLiveReadings);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [normalizeData, setNormalizeData] = useState({});
    const [tvcCorrections, setTVCCorrections] = useState({});
    const collectionPromise = useRef(null);
    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

    useEffect(() => {
        if (collectionStatus === 'collection_finished' || collectionStatus === 'collection_stopped') {
            if (collectionPromise.current) {
                collectionPromise.current.resolve(collectionStatus);
                collectionPromise.current = null;
            }
        } else if (collectionStatus === 'error') {
            if (collectionPromise.current) {
                collectionPromise.current.reject(new Error('Collection failed with an error.'));
                collectionPromise.current = null;
            }
        }
    }, [collectionStatus]);

    const waitForCollection = () => {
        return new Promise((resolve, reject) => {
            collectionPromise.current = { resolve, reject };
        });
    };

    useEffect(() => {
        if (lastMessage?.type === 'awaiting_amplifier_confirmation') {
            const range = lastMessage.range;
            setAmplifierModal({
                isOpen: true,
                range: range,
                onConfirm: () => {
                    sendWsCommand({ command: 'amplifier_confirmed' });
                    setAmplifierModal({ isOpen: false });
                },
                onCancel: () => {
                    sendWsCommand({ command: 'operation_cancelled' });
                    setAmplifierModal({ isOpen: false });
                }
            });
        }
    }, [lastMessage, sendWsCommand]);

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
            setTVCCorrections(infoResponse.data.tvc_corrections || {});
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

    const getShuntCorrection = useCallback(() => {
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

    const getTVCCorrection = useCallback(() => {
        const corrections = [];
        const types = ['Standard', 'Test'];

        for (const typeKey of types) {
            if (tvcCorrections && tvcCorrections[typeKey] && Array.isArray(tvcCorrections[typeKey].measurements)) {
                const foundMeasurement = tvcCorrections[typeKey].measurements.find(
                    (measurement) => measurement.frequency === selectedTP.frequency
                );

                if (foundMeasurement) {
                    corrections.push(foundMeasurement.ac_dc_difference);
                } else {
                    console.warn(`Frequency ${selectedTP.frequency} not found in measurements for type ${typeKey}.`);
                    corrections.push(null);
                }
            } else {
                console.error(`Invalid or missing measurements data for type: ${typeKey}.`);
                corrections.push(null);
            }
        }
        return corrections;
    }, [selectedTP, tvcCorrections]);

    useEffect(() => {
        const formatReadingsForChart = (readingsArray) => {
            if (!readingsArray) return [];
            return readingsArray.map((point, index) => ({ x: index + 1, y: (typeof point === 'object' ? point.value : point), t: (typeof point === 'object' && point.timestamp ? new Date(point.timestamp * 1000) : null) }));
        };
        setHistoricalReadings(initialLiveReadings);
        setTiHistoricalReadings(initialLiveReadings);

        if (selectedTP) {
            const pointForDirection = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;
            if (pointForDirection) {
                const defaultSettings = { initial_warm_up_time: 0, num_samples: 8, settling_time: 5, nplc: 20 };
                setCalibrationSettings({ ...defaultSettings, ...pointForDirection.settings });
                if (pointForDirection.readings) {
                    setHistoricalReadings({ ac_open: formatReadingsForChart(pointForDirection.readings.std_ac_open_readings), dc_pos: formatReadingsForChart(pointForDirection.readings.std_dc_pos_readings), dc_neg: formatReadingsForChart(pointForDirection.readings.std_dc_neg_readings), ac_close: formatReadingsForChart(pointForDirection.readings.std_ac_close_readings) });
                    setTiHistoricalReadings({ ac_open: formatReadingsForChart(pointForDirection.readings.ti_ac_open_readings), dc_pos: formatReadingsForChart(pointForDirection.readings.ti_dc_pos_readings), dc_neg: formatReadingsForChart(pointForDirection.readings.ti_dc_neg_readings), ac_close: formatReadingsForChart(pointForDirection.readings.ti_ac_close_readings) });
                }
            }
        }
    }, [selectedTP, activeDirection, initialLiveReadings]);

    useEffect(() => {
        if (!selectedTP) {
            setAveragedPpmDifference(null);
            return;
        }
        const forwardResult = selectedTP.forward?.results?.delta_uut_ppm;
        const reverseResult = selectedTP.reverse?.results?.delta_uut_ppm;

        if (forwardResult !== undefined && forwardResult !== null && reverseResult !== undefined && reverseResult !== null) {
            const averagePpm = (parseFloat(forwardResult) + parseFloat(reverseResult)) / 2;
            const averagePpmFormatted = averagePpm.toFixed(3);
            setAveragedPpmDifference(averagePpmFormatted);

            const saveAverage = async () => {
                try {
                    const forwardPayload = { ...selectedTP.forward.results, delta_uut_ppm_avg: averagePpmFormatted };
                    const reversePayload = { ...selectedTP.reverse.results, delta_uut_ppm_avg: averagePpmFormatted };
                    await Promise.all([
                        axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.forward.id}/update-results/`, forwardPayload),
                        axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.reverse.id}/update-results/`, reversePayload)
                    ]);
                    if (averagedPpmDifference !== averagePpmFormatted) {
                        showNotification(`Saved Averaged δ UUT: ${averagePpmFormatted} PPM`, 'success');
                        refreshTestPointList();
                    }
                } catch (error) {
                    showNotification("Error saving the averaged result.", 'error');
                }
            };
            saveAverage();
        } else {
            setAveragedPpmDifference(null);
        }
    }, [selectedTP, selectedSessionId, showNotification, averagedPpmDifference, refreshTestPointList]);


    const handleCorrectionInputChange = (e) => setCorrectionInputs(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const performFinalCalculation = async (currentCorrectionInputs) => {
        const calculatePpmFor = (point) => {
            const fetchedResults = point?.results;
            if (!point || !fetchedResults || !['std_dc_pos_avg', 'std_dc_neg_avg', 'std_ac_open_avg', 'std_ac_close_avg', 'ti_dc_pos_avg', 'ti_dc_neg_avg', 'ti_ac_open_avg', 'ti_ac_close_avg'].every(key => fetchedResults[key] != null)) {
                return null;
            }
            const V_DCSTD = (fetchedResults.std_dc_pos_avg + Math.abs(fetchedResults.std_dc_neg_avg)) / 2;
            const V_ACSTD = (fetchedResults.std_ac_open_avg + fetchedResults.std_ac_close_avg) / 2;
            const V_DCUUT = (fetchedResults.ti_dc_pos_avg + Math.abs(fetchedResults.ti_dc_neg_avg)) / 2;
            const V_ACUUT = (fetchedResults.ti_ac_open_avg + fetchedResults.ti_ac_close_avg) / 2;
            const { eta_std, eta_ti, delta_std, delta_ti, delta_std_known } = Object.fromEntries(Object.entries(currentCorrectionInputs).map(([k, v]) => [k, parseFloat(v)]));
            const term_STD = ((V_ACSTD - V_DCSTD) * 1000000) / (eta_std * V_DCSTD);
            const term_UUT = ((V_ACUUT - V_DCUUT) * 1000000) / (eta_ti * V_DCUUT);
            return (delta_std_known + term_STD - term_UUT + delta_std - delta_ti).toFixed(3);
        };

        const newForwardPpm = hasAllReadings(selectedTP.forward) ? calculatePpmFor(selectedTP.forward) : null;
        const newReversePpm = hasAllReadings(selectedTP.reverse) ? calculatePpmFor(selectedTP.reverse) : null;

        if (newForwardPpm === null && newReversePpm === null) {
            return showNotification("No directions have complete readings to calculate.", "warning");
        }

        try {
            const updatePromises = [];
            const sharedPayload = { ...currentCorrectionInputs };

            if (selectedTP.forward && selectedTP.forward.id) {
                const forwardPayload = { ...(selectedTP.forward.results || {}), ...sharedPayload };
                if (newForwardPpm !== null) {
                    forwardPayload.delta_uut_ppm = newForwardPpm;
                }
                updatePromises.push(
                    axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.forward.id}/update-results/`, forwardPayload)
                );
            }

            if (selectedTP.reverse && selectedTP.reverse.id) {
                const reversePayload = { ...(selectedTP.reverse.results || {}), ...sharedPayload };
                if (newReversePpm !== null) {
                    reversePayload.delta_uut_ppm = newReversePpm;
                }
                updatePromises.push(
                    axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${selectedTP.reverse.id}/update-results/`, reversePayload)
                );
            }

            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
                showNotification(`AC-DC Difference successfully saved!`, 'success');
            }

            await refreshTestPointList();
            setIsCorrectionModalOpen(false);

        } catch (error) {
            showNotification("Error saving results.", 'error');
            console.error("Error saving calculation results:", error.response ? error.response.data : error.message);
        }
    };

    const handleOpenCorrectionModal = () => {
        const primaryPoint = selectedTP.forward || selectedTP.reverse;
        const existingResults = primaryPoint?.results || {};
        const tvcCorrection = getTVCCorrection();
        const shuntCorrection = getShuntCorrection();

        setCorrectionInputs({
            eta_std: existingResults.eta_std || '1',
            eta_ti: existingResults.eta_ti || '1',
            delta_std: existingResults.delta_std !== undefined ? existingResults.delta_std : (tvcCorrection[0] !== null ? tvcCorrection[0] : ''),
            delta_ti: existingResults.delta_ti !== undefined ? existingResults.delta_ti : (tvcCorrection[1] !== null ? tvcCorrection[1] : ''),
            delta_std_known: existingResults.delta_std_known !== undefined ? existingResults.delta_std_known : (shuntCorrection !== null ? shuntCorrection : '')
        });

        setIsCorrectionModalOpen(true);
    };

    const handleGetCorrection = () => {
        const tvcCorrection = getTVCCorrection();
        const stdTVC = tvcCorrection[0];
        const tiTVC = tvcCorrection[1];
        const shuntCorrection = getShuntCorrection();

        const updates = {};
        let hasAnyCorrection = false;
        const updatedFieldDetails = [];

        if (stdTVC !== null) {
            updates.delta_std = stdTVC;
            hasAnyCorrection = true;
            updatedFieldDetails.push(`Standard TVC (${stdTVC})`);
        }
        if (tiTVC !== null) {
            updates.delta_ti = tiTVC;
            hasAnyCorrection = true;
            updatedFieldDetails.push(`Test TVC (${tiTVC})`);
        }
        if (shuntCorrection !== null) {
            updates.delta_std_known = shuntCorrection;
            hasAnyCorrection = true;
            updatedFieldDetails.push(`Shunt correction (${shuntCorrection})`);
        }

        if (!hasAnyCorrection) {
            showNotification("No correction found for the selected test point parameters.", "info");
        } else {
            setCorrectionInputs(prev => ({ ...prev, ...updates }));
            const successMessage = `Successfully updated: ${updatedFieldDetails.join(', ')}.`;
            showNotification(successMessage, "success");
        }
    };

    const runMeasurement = async (runType, baseReadingKey = null) => {
        if (!selectedTP) return;
        const ampRange = calibrationConfigurations.amplifier_range;

        if (amplifierAddress && !ampRange) {
            return showNotification('An amplifier is assigned, but its range is not set. Please set it in the Test Point Editor.', 'error');
        }

        if (activeDirection === 'Reverse' && !allForwardPointsComplete) return showNotification('Please complete all Forward readings before starting Reverse.', 'error');

        let pointData = activeDirection === 'Forward' ? selectedTP.forward : selectedTP.reverse;
        if (!pointData) {
            try {
                const response = await axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, { current: selectedTP.current, frequency: selectedTP.frequency, direction: activeDirection });
                pointData = response.data;
                await refreshTestPointList();
            } catch (error) { return showNotification(`Error creating ${activeDirection} configuration.`, 'error'); }
        }

        clearLiveReadings();

        try {
            let params;
            if (runType === 'full') {
                params = {
                    command: 'start_full_calibration',
                    num_samples: parseInt((pointData.settings || { num_samples: 8 }).num_samples, 10) || 8,
                    settling_time: calibrationSettings.settling_time || 5,
                };
            } else { // 'single'
                params = {
                    command: 'start_collection',
                    reading_type: baseReadingKey,
                    num_samples: parseInt((pointData.settings || { num_samples: 8 }).num_samples, 10) || 8,
                    settling_time: calibrationSettings.settling_time || 5,
                };
            }

            Object.assign(params, {
                nplc: parseFloat(calibrationSettings.nplc) || 20,
                test_point: { current: selectedTP.current, frequency: selectedTP.frequency, direction: activeDirection },
                test_point_id: pointData.id,
                std_reader_model: stdReaderModel,
                ti_reader_model: tiReaderModel,
            });

            if (amplifierAddress) {
                params.amplifier_range = ampRange;
            }

            if (startReadingCollection(params)) {
                setLastCollectionDirection(activeDirection);
                const result = await waitForCollection();
                const message = runType === 'full' ? 'Full measurement sequence' : `${baseReadingKey.replace(/_/g, ' ')} readings`;
                if (result === 'collection_stopped') {
                    showNotification("Sequence stopped by user.", "warning");
                } else if (result === 'collection_finished') {
                    showNotification(`${message} complete!`, "success");
                }
            } else {
                showNotification('WebSocket is not connected. Please refresh the page.', 'error');
            }

        } catch (error) {
            showNotification(`Operation failed: ${error.message || 'An unknown error occurred.'}`, 'error');
            console.error("Measurement run error:", error);
        }
    };

    const handleRunAllRequest = () => {
        const run = () => runMeasurement('full');
        if (!lastCollectionDirection || activeDirection === lastCollectionDirection) {
            run();
        } else {
            setHardwareModal({
                isOpen: true,
                onConfirm: () => { setHardwareModal({ isOpen: false }); run(); },
                onCancel: () => setHardwareModal({ isOpen: false })
            });
        }
    };
    const handleCollectReadingsRequest = (baseReadingKey) => runMeasurement('single', baseReadingKey);


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
            nplc: parseFloat(calibrationSettings.nplc) || 20,
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

    const isCalculationReady = selectedTP && (hasAllReadings(selectedTP.forward) || hasAllReadings(selectedTP.reverse));
    const is34420AInUse = stdReaderModel === '34420A' || tiReaderModel === '34420A';

    return (
        <>
            <CorrectionFactorsModal
                isOpen={isCorrectionModalOpen}
                onClose={() => setIsCorrectionModalOpen(false)}
                onSubmit={performFinalCalculation}
                initialValues={correctionInputs}
                onInputChange={handleCorrectionInputChange}
                onGetCorrection={handleGetCorrection}
            />
            <ConfirmationModal isOpen={hardwareModal.isOpen} title="Confirm Hardware Change" message={`Please ensure you have physically configured the hardware for the '${activeDirection}' direction before proceeding.`} onConfirm={hardwareModal.onConfirm} onCancel={() => setHardwareModal({ isOpen: false })} confirmText="Ready" />
            <ConfirmationModal isOpen={amplifierModal.isOpen} title="Confirm Amplifier Range" message={`Please ensure the 8100 Amplifier range is set to ${amplifierModal.range} A.\n\nIncorrect range may damage the equipment. Once verified, set 8100 to operate.`} onConfirm={amplifierModal.onConfirm} onCancel={amplifierModal.onCancel} confirmText="Range is Set" />
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
                                    {switchDriverAddress && (
                                        <SwitchControl />
                                    )}
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
                                                    {is34420AInUse && (
                                                        <div className="form-section">
                                                            <label htmlFor="nplc">34420A Integration (NPLC)</label>
                                                            <select
                                                                id="nplc"
                                                                name="nplc"
                                                                value={calibrationSettings.nplc || 20}
                                                                onChange={(e) => setCalibrationSettings(prev => ({ ...prev, nplc: parseFloat(e.target.value) }))}
                                                            >
                                                                {NPLC_OPTIONS.map(val => (
                                                                    <option key={val} value={val}>{val} PLC</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div><button type="submit" className="button button-primary">Save and Continue</button>
                                            </form>)}
                                            {activeTab === 'readings' && (<>
                                                <DirectionToggle activeDirection={activeDirection} setActiveDirection={setActiveDirection} />
                                                <div className="form-section">
                                                    <div className="readings-grid">
                                                        {isCollecting ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '20px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', gridColumn: '1 / -1' }}>
                                                                <div style={{ flexGrow: 1, textAlign: 'left' }}>
                                                                    <p style={{ margin: 0, fontWeight: 500 }}>Collecting: {getStageName()}</p>
                                                                    <p style={{ margin: 0, fontSize: '0.9em', color: 'var(--text-color-muted)' }}>{collectionProgress.count} / {collectionProgress.total}</p>
                                                                </div>
                                                                <FaStop onClick={stopReadingCollection} title="Stop Collection" style={{ fontSize: '24px', color: '#dc3545', cursor: 'pointer', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'} />
                                                            </div>
                                                        ) : (
                                                            <ActionDropdownButton
                                                                primaryText="Run All Measurements"
                                                                onPrimaryClick={handleRunAllRequest}
                                                                disabled={!selectedTP || readingWsState !== WebSocket.OPEN}
                                                                options={READING_TYPES.map(({ key, label }) => ({
                                                                    key: key,
                                                                    label: `Take ${label} Readings`,
                                                                    onClick: () => handleCollectReadingsRequest(key)
                                                                }))}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                {showStdChart && <div className="chart-container"><CalibrationChart title="Standard Instrument Readings" chartData={stdChartData} chartType="line" theme={theme} onHover={setHoveredIndex} syncedHoverIndex={hoveredIndex} comparisonData={tiChartData.datasets} /></div>}
                                                {showTiChart && <div className="chart-container"><CalibrationChart title="Test Instrument Readings" chartData={tiChartData} chartType="line" theme={theme} onHover={setHoveredIndex} syncedHoverIndex={hoveredIndex} comparisonData={stdChartData.datasets} /></div>}
                                            </>)}
                                            {activeTab === 'calculate' && (
                                                <div className="results-container">
                                                    <div className="form-section" style={{ textAlign: 'center', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
                                                        <button
                                                            onClick={handleOpenCorrectionModal}
                                                            disabled={isCollecting || !isCalculationReady}
                                                            className="button button-success button-icon"
                                                            style={{ fontSize: '1.1rem', padding: '12px 24px' }}
                                                        >
                                                            <FaCalculator /> Calculate AC-DC Difference
                                                        </button>
                                                    </div>

                                                    {averagedPpmDifference && (
                                                        <div className="final-result-card" style={{ marginBottom: '20px', background: 'var(--success-color)' }}>
                                                            <h4>Final Averaged AC-DC Difference</h4>
                                                            <p>{averagedPpmDifference} PPM</p>
                                                        </div>
                                                    )}

                                                    <div className="reading-group" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
                                                        {selectedTP.forward?.results?.delta_uut_ppm && (
                                                            <div className="reading">
                                                                <h4>Forward Direction</h4>
                                                                <div className="reading-group" style={{ gridTemplateColumns: '1fr' }}>
                                                                    <div className="reading">
                                                                        <h3>δ UUT (PPM):</h3>
                                                                        <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                                                            {parseFloat(selectedTP.forward.results.delta_uut_ppm).toFixed(3)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {selectedTP.reverse?.results?.delta_uut_ppm && (
                                                            <div className="reading">
                                                                <h4>Reverse Direction</h4>
                                                                <div className="reading-group" style={{ gridTemplateColumns: '1fr' }}>
                                                                    <div className="reading">
                                                                        <h3>δ UUT (PPM):</h3>
                                                                        <p style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                                                            {parseFloat(selectedTP.reverse.results.delta_uut_ppm).toFixed(3)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {!(selectedTP.forward?.results?.delta_uut_ppm || selectedTP.reverse?.results?.delta_uut_ppm) && (
                                                        <div className="placeholder-content" style={{ minHeight: '200px' }}>
                                                            <h3>No Results Calculated</h3>
                                                            <p>Complete readings for a direction and click the "Calculate" button above.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div></>
                                    )}</div>
                                </div></div>
                            </>
                        )}
        </>
    );
}

export default Calibration;