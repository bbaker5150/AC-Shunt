import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';
import { AMPLIFIER_RANGES_A, AVAILABLE_CURRENTS, AVAILABLE_FREQUENCIES } from '../../constants/constants';
import ShuntCorrections from '../tables/ShuntCorrections';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// Reusable Confirmation Modal Component
const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', confirmButtonClass = '' }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{title}</h3>
                <p style={{ marginBottom: '25px', whiteSpace: 'pre-wrap' }}>{message}</p>
                <div className="modal-actions">
                    <button onClick={onCancel} className="button button-secondary">Cancel</button>
                    <button onClick={onConfirm} className={`button ${confirmButtonClass}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper component for the new Frequency Selection Modal
const FrequencySelectionModal = ({ onConfirm, onCancel, preselectedFrequencies }) => {
    const [selected, setSelected] = useState(() => new Set(preselectedFrequencies.map(f => f.value)));

    const handleCheckboxChange = (value) => {
        const newSelected = new Set(selected);
        if (newSelected.has(value)) {
            newSelected.delete(value);
        } else {
            newSelected.add(value);
        }
        setSelected(newSelected);
    };

    const handleConfirm = () => {
        const selectedFrequencyObjects = AVAILABLE_FREQUENCIES.filter(f => selected.has(f.value));
        onConfirm(selectedFrequencyObjects);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ textAlign: 'left' }}>
                <h3>Select Frequencies</h3>
                <div className="frequency-list-container" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '15px' }}>
                    {AVAILABLE_FREQUENCIES.map(freq => (
                        <div key={freq.value} className="frequency-selection-row">
                            <input
                                type="checkbox"
                                id={`freq-${freq.value}`}
                                checked={selected.has(freq.value)}
                                onChange={() => handleCheckboxChange(freq.value)}
                            />
                            <label htmlFor={`freq-${freq.value}`}>
                                {freq.text}
                            </label>
                        </div>
                    ))}
                </div>
                <div className="modal-actions" style={{ marginTop: '20px' }}>
                    <button onClick={onCancel} className="button button-secondary">Cancel</button>
                    <button onClick={handleConfirm} className="button">Confirm</button>
                </div>
            </div>
        </div>
    );
};

// --- Helper Functions for Unit Conversion ---
const getValueInAmps = (value, unit) => {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return null;
    return unit === 'mA' ? numericValue / 1000 : numericValue;
};

const getDisplayValueAndUnit = (valueInAmps) => {
    if (valueInAmps === null || valueInAmps === undefined || isNaN(valueInAmps)) {
        return { value: '', unit: 'A' };
    }
    if (valueInAmps > 0 && valueInAmps < 1) {
        return { value: valueInAmps * 1000, unit: 'mA' };
    }
    return { value: valueInAmps, unit: 'A' };
};


function TestPointEditor({ showNotification }) {
    const { selectedSessionId } = useInstruments();
    const [allTestPoints, setAllTestPoints] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    const [inputCurrent, setInputCurrent] = useState('');
    const [shuntRange, setShuntRange] = useState('');
    const [shuntRangeUnit, setShuntRangeUnit] = useState('A');
    const [amplifierRange, setAmplifierRange] = useState('');
    const [tvcUpperLimit, setTvcUpperLimit] = useState('');
    const [tvcUpperLimitUnit, setTvcUpperLimitUnit] = useState('A');
    const [filteredCurrents, setFilteredCurrents] = useState([]);

    const uniqueTestPoints = useMemo(() => {
        const pointMap = new Map();
        allTestPoints.forEach(point => {
            const key = `${point.current}-${point.frequency}`;
            if (!pointMap.has(key)) {
                pointMap.set(key, { key, current: point.current, frequency: point.frequency, forward: null, reverse: null });
            }
            const entry = pointMap.get(key);
            if (point.direction === 'Forward') entry.forward = point;
            else if (point.direction === 'Reverse') entry.reverse = point;
        });
        return Array.from(pointMap.values());
    }, [allTestPoints]);

    const formatFrequency = (value) => (AVAILABLE_FREQUENCIES.find(f => f.value === value) || { text: `${value}Hz` }).text;
    
    const fetchTestPointSetAndSettings = useCallback(async () => {
        if (!selectedSessionId) {
            setAllTestPoints([]); setInputCurrent(''); setShuntRange(''); setShuntRangeUnit('A');
            setAmplifierRange(''); setTvcUpperLimit(''); setTvcUpperLimitUnit('A'); setFilteredCurrents([]);
            return;
        }
        try {
            const [testPointResponse, infoResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`)
            ]);
            const fetchedTestPoints = testPointResponse.data.test_points || [];
            setAllTestPoints(fetchedTestPoints);
            if (fetchedTestPoints.length > 0) {
                const uniqueCurrents = new Set(fetchedTestPoints.map(p => p.current));
                if (uniqueCurrents.size === 1) {
                    setInputCurrent(fetchedTestPoints[0].current);
                }
            }
            const { configurations } = infoResponse.data;
            const shuntDisplay = getDisplayValueAndUnit(configurations?.ac_shunt_range);
            const tvcDisplay = getDisplayValueAndUnit(configurations?.tvc_upper_limit);
            setShuntRange(shuntDisplay.value); setShuntRangeUnit(shuntDisplay.unit);
            setTvcUpperLimit(tvcDisplay.value); setTvcUpperLimitUnit(tvcDisplay.unit);
            setAmplifierRange(configurations?.amplifier_range || '');
        } catch (error) { showNotification('Could not load test points or configurations.', 'error'); }
    }, [selectedSessionId, showNotification]);

    useEffect(() => { fetchTestPointSetAndSettings(); }, [fetchTestPointSetAndSettings]);

    useEffect(() => {
        const shuntRangeInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
        if (shuntRangeInAmps && shuntRangeInAmps > 0) {
            setFilteredCurrents(AVAILABLE_CURRENTS.filter(current =>
                current.value <= shuntRangeInAmps ||
                (shuntRangeInAmps === 1 && current.value === 1.09)
            ));
        } else {
            setFilteredCurrents([]);
            if (inputCurrent) setInputCurrent('');
        }
    }, [shuntRange, shuntRangeUnit, inputCurrent]);

    useEffect(() => {
        const current = parseFloat(inputCurrent);
        if (current && !isNaN(current)) {
            const suitableRange = AMPLIFIER_RANGES_A.find(range => current <= range);
            setAmplifierRange(suitableRange !== undefined ? suitableRange : 'Out of Range');
        } else {
            setAmplifierRange('');
        }
    }, [inputCurrent]);

    const handleSaveSettings = async () => {
        if (!selectedSessionId) return showNotification('No active session to save to.', 'error');
        const shuntValueInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
        if (shuntValueInAmps === null) return showNotification('AC Shunt Range must be a valid number.', 'error');
        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                configurations: { ac_shunt_range: shuntValueInAmps, amplifier_range: parseFloat(amplifierRange) || null, tvc_upper_limit: getValueInAmps(tvcUpperLimit, tvcUpperLimitUnit) }
            });
            showNotification('Settings saved successfully!', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) { showNotification('An error occurred while saving configurations.', 'error'); }
    };

    const handleConfirmAndSaveFrequencies = async (selectedFrequencies) => {
        const currentInputValue = parseFloat(inputCurrent);
        if (!currentInputValue) return showNotification('Please set a valid Input Current before generating points.', 'error');
        if (amplifierRange === 'Out of Range') return showNotification(`Input Current of ${currentInputValue}A is out of the amplifier's range.`, 'error');
        if (selectedFrequencies.length === 0) return showNotification('Please select at least one frequency to add.', 'error');

        const existingFrequencies = new Set(uniqueTestPoints.map(p => p.frequency));
        const newFrequenciesToAdd = selectedFrequencies.filter(f => !existingFrequencies.has(f.value));

        if (newFrequenciesToAdd.length !== selectedFrequencies.length) showNotification('One or more selected frequencies already exist and were ignored.', 'warning');
        if (newFrequenciesToAdd.length === 0) return showNotification('All selected frequencies have already been added.', 'info');
        
        const newPointsBothDirections = newFrequenciesToAdd.flatMap(freq => ([
            { current: currentInputValue, frequency: freq.value, direction: 'Forward' },
            { current: currentInputValue, frequency: freq.value, direction: 'Reverse' }
        ]));
        
        const shuntValueInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
        const tvcValueInAmps = getValueInAmps(tvcUpperLimit, tvcUpperLimitUnit);

        try {
            const promises = [];
            if (newPointsBothDirections.length > 0) {
                promises.push(axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/append/`, { points: newPointsBothDirections }));
            }
            promises.push(axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                configurations: { ac_shunt_range: shuntValueInAmps, amplifier_range: parseFloat(amplifierRange), tvc_upper_limit: tvcValueInAmps }
            }));
            await Promise.all(promises);
            showNotification('Configuration saved and new test points generated!', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) { showNotification('An error occurred while saving the configuration.', 'error'); }
    };

    const hasAnyReadings = (point) => point?.readings && Object.values(point.readings).some(arr => Array.isArray(arr) && arr.length > 0);
    const hasAllReadings = (point) => point?.readings && ['std_ac_open_readings', 'std_dc_pos_readings', 'std_dc_neg_readings', 'std_ac_close_readings', 'ti_ac_open_readings', 'ti_dc_pos_readings', 'ti_dc_neg_readings', 'ti_ac_close_readings'].every(key => point.readings[key]?.length > 0);

    const performDeleteTestPoint = async (pointsToDelete) => {
        if (pointsToDelete.length === 0) return;
        try {
            const deletePromises = pointsToDelete.map(p => axios.delete(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${p.id}/`));
            await Promise.all(deletePromises);
            showNotification('Test point deleted successfully!', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) { showNotification('An error occurred while deleting the test point.', 'error'); }
        setConfirmationModal({ isOpen: false });
    };

    const handleDeleteTestPoint = (uniquePoint) => {
        const pointsToDelete = [uniquePoint.forward, uniquePoint.reverse].filter(Boolean);
        if (pointsToDelete.some(hasAnyReadings)) {
            setConfirmationModal({ isOpen: true, title: 'Confirm Deletion', message: 'This test point has existing readings. Deleting it will permanently remove all associated data for both Forward and Reverse directions.\n\nAre you sure you want to continue?', confirmText: 'Delete', confirmButtonClass: 'button-danger', onConfirm: () => performDeleteTestPoint(pointsToDelete) });
        } else {
            performDeleteTestPoint(pointsToDelete);
        }
    };

    const performClearAllTestPoints = async () => {
        try {
            await axios.delete(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/clear/`);
            showNotification('All test points cleared.', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) { showNotification('An error occurred while clearing test points.', 'error'); }
        setConfirmationModal({ isOpen: false });
    };

    const handleClearAllTestPoints = () => {
        if (allTestPoints.some(hasAnyReadings)) {
            setConfirmationModal({ isOpen: true, title: 'Confirm Clear All', message: 'One or more test points have existing readings. This action will permanently remove all test points and their associated data.\n\nAre you sure you want to continue?', confirmText: 'Clear All', confirmButtonClass: 'button-danger', onConfirm: performClearAllTestPoints });
        } else {
            performClearAllTestPoints();
        }
    };

    const formatCurrent = (value) => (AVAILABLE_CURRENTS.find(c => c.value === parseFloat(value)) || { text: `${value}A` }).text;

    return (
        <React.Fragment>
            <ConfirmationModal isOpen={confirmationModal.isOpen} title={confirmationModal.title} message={confirmationModal.message} onConfirm={confirmationModal.onConfirm} onCancel={() => setConfirmationModal({ isOpen: false })} confirmText={confirmationModal.confirmText} confirmButtonClass={confirmationModal.confirmButtonClass}/>
            {isModalOpen && (<FrequencySelectionModal onCancel={() => setIsModalOpen(false)} onConfirm={(selected) => { handleConfirmAndSaveFrequencies(selected); setIsModalOpen(false); }} preselectedFrequencies={uniqueTestPoints.map(p => ({ value: p.frequency, text: formatFrequency(p.frequency) }))}/>)}
            <div className="content-area calibration-setup">
                <h2>Test Point Configuration</h2>
                {!selectedSessionId && (<div className="form-section-warning"><p>Please select a session from the "Session Setup" tab to add or view test points.</p></div>)}
                <div className="config-grid">
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="shunt-range">AC Shunt Range</label>
                            <div className="input-with-unit">
                                <input type="number" id="shunt-range" value={shuntRange} onChange={(e) => setShuntRange(e.target.value)} disabled={!selectedSessionId || uniqueTestPoints.length > 0} placeholder="e.g., 20"/>
                                <select value={shuntRangeUnit} onChange={(e) => setShuntRangeUnit(e.target.value)} disabled={!selectedSessionId || uniqueTestPoints.length > 0}>
                                    <option value="A">A</option>
                                    <option value="mA">mA</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-section">
                            <label htmlFor="amplifier-range">8100 Amplifier Range</label>
                            <input type="text" id="amplifier-range" value={amplifierRange ? `${amplifierRange} A` : ''} disabled readOnly />
                        </div>
                        <div className="form-section">
                            <label htmlFor="tvc-upper-limit">TVC Upper Limit</label>
                            <div className="input-with-unit">
                                <input type="number" id="tvc-upper-limit" value={tvcUpperLimit} onChange={(e) => setTvcUpperLimit(e.target.value)} disabled={!selectedSessionId} placeholder="e.g., 100.5"/>
                                <select value={tvcUpperLimitUnit} onChange={(e) => setTvcUpperLimitUnit(e.target.value)} disabled={!selectedSessionId}>
                                    <option value="A">A</option>
                                    <option value="mA">mA</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-section-action">
                            <button onClick={handleSaveSettings} className="button" disabled={!selectedSessionId}>Update Configuration</button>
                        </div>
                    </div>
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="input-current">Input Current</label>
                            <select id="input-current" value={inputCurrent} onChange={(e) => setInputCurrent(e.target.value ? parseFloat(e.target.value) : '')} disabled={!selectedSessionId || uniqueTestPoints.length > 0 || filteredCurrents.length === 0}>
                                <option value="">{uniqueTestPoints.length > 0 ? "Clear points to change" : !shuntRange ? "-- Set AC Shunt Range First --" : "-- Select Current --"}</option>
                                {filteredCurrents.map(current => (<option key={current.value} value={current.value}>{current.text}</option>))}
                            </select>
                        </div>
                        <div className="form-section-action">
                             <button type="button" onClick={() => setIsModalOpen(true)} className="button" disabled={!selectedSessionId || !inputCurrent}>Add Test Points...</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="content-area">
                <div className="test-points-header">
                    <h2>Generated Test Points ({uniqueTestPoints.length})</h2>
                    <div>
                        <div style={{ display: 'flex', gap: '30px', alignContent: 'center' }}>
                            <ShuntCorrections dataType="correction" showNotification={showNotification} />
                            <ShuntCorrections dataType="uncertainty" showNotification={showNotification} />
                            {uniqueTestPoints.length > 0 && (<button onClick={handleClearAllTestPoints} className="button button-danger">Clear All Points</button>)}
                        </div>
                    </div>
                    
                </div>
                {uniqueTestPoints.length > 0 && (
                    <div className="test-points-legend">
                        <span className="legend-item"><span className="legend-icon completed">✓</span> Complete</span>
                        <span className="legend-item"><span className="legend-icon in-progress"></span> In Progress</span>
                        <span className="legend-item"><span className="legend-icon not-started"></span> Not Started</span>
                    </div>
                )}
                <div className="test-point-chip-container">
                    {uniqueTestPoints.length > 0 ? (
                        uniqueTestPoints.map((point) => {
                            const isComplete = hasAllReadings(point.forward) && hasAllReadings(point.reverse);
                            const isPartial = !isComplete && (hasAnyReadings(point.forward) || hasAnyReadings(point.reverse));
                            let statusClass = '';
                            if (isComplete) {
                                statusClass = 'completed';
                            } else if (isPartial) {
                                statusClass = 'in-progress';
                            }
                            return (
                                <div key={point.key} className={`test-point-chip ${statusClass}`}>
                                    <span>{formatCurrent(point.current)} @ {formatFrequency(point.frequency)}</span>
                                    {isComplete && <span className="status-icon">✓</span>}
                                    <button onClick={() => handleDeleteTestPoint(point)} className="delete-chip-button" title="Delete test point">&times;</button>
                                </div>
                            );
                        })
                    ) : ( <p style={{ margin: 0, fontStyle: 'italic', color: '#6c757d' }}>{selectedSessionId ? "No test points generated for this session." : "Select a session to view its test points."}</p> )}
                </div>
            </div>
        </React.Fragment>
    );
}

export default TestPointEditor;