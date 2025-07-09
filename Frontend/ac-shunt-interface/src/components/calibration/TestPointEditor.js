/**
 * @file TestPointEditor.js
 * @brief Manages the configuration of test points for a calibration session.
 *
 * This component provides the UI for creating, viewing, and managing a set of
 * test points (current and frequency combinations) associated with a specific
 * calibration session. It allows users to generate points and save the entire
 * configuration, including a single Input Current, AC Shunt Range, and TVC 
 * Upper Limit settings, to the backend API in a single action.
 * It relies on the active session ID from the InstrumentContext to fetch and save data.
 * It receives the showNotification function as a prop from a parent component to display status messages.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const AVAILABLE_CURRENTS = [
    { text: '1 mA', value: 0.001 }, { text: '2 mA', value: 0.002 },
    { text: '5 mA', value: 0.005 }, { text: '10 mA', value: 0.01 }, { text: '20 mA', value: 0.02 },
    { text: '50 mA', value: 0.05 }, { text: '100 mA', value: 0.1 }, { text: '200 mA', value: 0.2 },
    { text: '500 mA', value: 0.5 }, { text: '1 A', value: 1 }, { text: '2 A', value: 2 },
    { text: '5 A', value: 5 }, { text: '10 A', value: 10 }, { text: '20 A', value: 20 },
    { text: '50 A', value: 50 }, { text: '100 A', value: 100 }
];

const AVAILABLE_FREQUENCIES = [
    { text: '10 Hz', value: 10 }, { text: '20 Hz', value: 20 }, { text: '50 Hz', value: 50 },
    { text: '60 Hz', value: 60 }, { text: '100 Hz', value: 100 }, { text: '200 Hz', value: 200 },
    { text: '500 Hz', value: 500 }, { text: '1 kHz', value: 1000 }, { text: '2 kHz', value: 2000 },
    { text: '5 kHz', value: 5000 }, { text: '10 kHz', value: 10000 }, { text: '20 kHz', value: 20000 },
    { text: '50 kHz', value: 50000 }, { text: '100 kHz', value: 100000 }
];

const AMPLIFIER_RANGES_A = [0.002, 0.02, 0.2, 2, 20, 100];

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

    const [testPoints, setTestPoints] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Settings state
    const [inputCurrent, setInputCurrent] = useState('');
    const [shuntRange, setShuntRange] = useState('');
    const [shuntRangeUnit, setShuntRangeUnit] = useState('A');
    const [amplifierRange, setAmplifierRange] = useState('');
    const [tvcUpperLimit, setTvcUpperLimit] = useState('');
    const [tvcUpperLimitUnit, setTvcUpperLimitUnit] = useState('A');
    const [filteredCurrents, setFilteredCurrents] = useState([]);

    const formatFrequency = (value) => {
        const freqObject = AVAILABLE_FREQUENCIES.find(f => f.value === value);
        return freqObject ? freqObject.text : `${value}Hz`;
    };
    
    const fetchTestPointSetAndSettings = useCallback(async () => {
        if (!selectedSessionId) {
            setTestPoints([]);
            setInputCurrent('');
            setShuntRange(''); setShuntRangeUnit('A');
            setAmplifierRange('');
            setTvcUpperLimit(''); setTvcUpperLimitUnit('A');
            setFilteredCurrents([]);
            return;
        }
        try {
            const [testPointResponse, infoResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`),
                axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`)
            ]);

            const fetchedTestPoints = testPointResponse.data.test_points || [];
            setTestPoints(fetchedTestPoints);

            if (fetchedTestPoints.length > 0) {
                setInputCurrent(fetchedTestPoints[0].current);
            }

            const { configurations } = infoResponse.data;
            const shuntDisplay = getDisplayValueAndUnit(configurations?.ac_shunt_range);
            const tvcDisplay = getDisplayValueAndUnit(configurations?.tvc_upper_limit);

            setShuntRange(shuntDisplay.value);
            setShuntRangeUnit(shuntDisplay.unit);
            setTvcUpperLimit(tvcDisplay.value);
            setTvcUpperLimitUnit(tvcDisplay.unit);
            setAmplifierRange(configurations?.amplifier_range || '');

        } catch (error) {
            console.error("Failed to fetch data:", error);
            showNotification('Could not load test points or configurations for the selected session.', 'error');
            setTestPoints([]);
            setInputCurrent('');
            setShuntRange(''); setShuntRangeUnit('A');
            setAmplifierRange('');
            setTvcUpperLimit(''); setTvcUpperLimitUnit('A');
            setFilteredCurrents([]);
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchTestPointSetAndSettings();
    }, [fetchTestPointSetAndSettings]);

    useEffect(() => {
        const shuntRangeInAmps = getValueInAmps(shuntRange, shuntRangeUnit);

        if (shuntRangeInAmps && shuntRangeInAmps > 0) {
            setFilteredCurrents(AVAILABLE_CURRENTS.filter(current => current.value <= shuntRangeInAmps));
        } else {
            setFilteredCurrents([]);
            if (inputCurrent) {
                setInputCurrent('');
            }
        }
    }, [shuntRange, shuntRangeUnit, inputCurrent]);
    
    useEffect(() => {
        const current = parseFloat(inputCurrent);
        if (current && !isNaN(current)) {
            const suitableRange = AMPLIFIER_RANGES_A.find(range => current <= range);
            if (suitableRange !== undefined) {
                setAmplifierRange(suitableRange);
            } else {
                setAmplifierRange('Out of Range');
            }
        }
    }, [inputCurrent]);

    const handleSaveSettings = async () => {
        if (!selectedSessionId) {
            showNotification('No active session to save to.', 'error');
            return;
        }
        
        const shuntValueInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
        if (shuntValueInAmps === null) {
            showNotification('AC Shunt Range must be a valid number.', 'error');
            return;
        }

        const tvcValueInAmps = getValueInAmps(tvcUpperLimit, tvcUpperLimitUnit);

        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                configurations: {
                    ac_shunt_range: shuntValueInAmps,
                    amplifier_range: parseFloat(amplifierRange) || null,
                    tvc_upper_limit: tvcValueInAmps,
                }
            });
            showNotification('Settings saved successfully!', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) {
            console.error("Failed to save configurations:", error);
            showNotification('An error occurred while saving configurations.', 'error');
        }
    };
    
    const handleConfirmAndSaveFrequencies = async (selectedFrequencies) => {
        const currentInputValue = parseFloat(inputCurrent);
        if (!currentInputValue) {
            showNotification('Please set a valid Input Current before generating points.', 'error');
            return;
        }
        if (amplifierRange === 'Out of Range') {
            showNotification(`Input Current of ${currentInputValue}A is out of the amplifier's range.`, 'error');
            return;
        }
        if (selectedFrequencies.length === 0) {
            showNotification('Please select at least one frequency to add.', 'error');
            return;
        }

        const existingFrequencies = new Set(testPoints.map(p => p.frequency));
        const newFrequenciesToAdd = selectedFrequencies.filter(f => !existingFrequencies.has(f.value));

        if (newFrequenciesToAdd.length !== selectedFrequencies.length) {
            showNotification('One or more selected frequencies already exist and were ignored.', 'warning');
        }

        if (newFrequenciesToAdd.length === 0) {
            showNotification('All selected frequencies have already been added.', 'info');
            return;
        }

        const newTestPoints = newFrequenciesToAdd.map(freq => ({
            current: currentInputValue,
            frequency: freq.value
        }));
        
        const shuntValueInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
        const tvcValueInAmps = getValueInAmps(tvcUpperLimit, tvcUpperLimitUnit);

        try {
            await Promise.all([
                axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/append/`, {
                    points: newTestPoints
                }),
                axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                    configurations: {
                        ac_shunt_range: shuntValueInAmps,
                        amplifier_range: parseFloat(amplifierRange),
                        tvc_upper_limit: tvcValueInAmps,
                    }
                })
            ]);

            showNotification(`${newFrequenciesToAdd.length} new test point(s) generated and saved!`, 'success');
            fetchTestPointSetAndSettings();
        } catch (error) {
            console.error("Failed to save the configuration:", error);
            showNotification('An error occurred while saving the new test points.', 'error');
        }
    };

    const handleDeleteTestPoint = async (idToDelete) => {
        try {
            await axios.delete(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${idToDelete}/`);
            showNotification('Test point deleted successfully!', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) {
            console.error("Failed to delete the test point:", error.response ? error.response.data : error.message);
            showNotification('An error occurred while deleting the test point.', 'error');
        }
    };

    const handleClearAllTestPoints = async () => {
        try {
            await axios.delete(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/clear/`);
            showNotification('All test points cleared.', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) {
            console.error("Failed to clear test points:", error);
            showNotification('An error occurred while clearing test points.', 'error');
        }
    };

    const formatCurrent = (value) => {
        const currentObject = AVAILABLE_CURRENTS.find(c => c.value === value);
        return currentObject ? currentObject.text : `${value}A`;
    };

    return (
        <React.Fragment>
            {isModalOpen && (
                <FrequencySelectionModal
                    onCancel={() => setIsModalOpen(false)}
                    onConfirm={(selected) => {
                        handleConfirmAndSaveFrequencies(selected);
                        setIsModalOpen(false);
                    }}
                    preselectedFrequencies={testPoints.map(p => ({ value: p.frequency, text: formatFrequency(p.frequency) }))}
                />
            )}
            <div className="content-area calibration-setup">
                <h2>Test Point Configuration</h2>
                {!selectedSessionId && (
                    <div className="form-section-warning">
                        <p>Please select a session from the "Session Setup" tab to add or view test points.</p>
                    </div>
                )}

                <div className="config-grid">
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="shunt-range">AC Shunt Range</label>
                            <div className="input-with-unit">
                                <input
                                    type="number"
                                    id="shunt-range"
                                    value={shuntRange}
                                    onChange={(e) => setShuntRange(e.target.value)}
                                    disabled={!selectedSessionId || testPoints.length > 0}
                                    placeholder="e.g., 20"
                                />
                                <select 
                                    value={shuntRangeUnit} 
                                    onChange={(e) => setShuntRangeUnit(e.target.value)}
                                    disabled={!selectedSessionId || testPoints.length > 0}
                                >
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
                                <input
                                    type="number"
                                    id="tvc-upper-limit"
                                    value={tvcUpperLimit}
                                    onChange={(e) => setTvcUpperLimit(e.target.value)}
                                    disabled={!selectedSessionId}
                                    placeholder="e.g., 100.5"
                                />
                                <select 
                                    value={tvcUpperLimitUnit} 
                                    onChange={(e) => setTvcUpperLimitUnit(e.target.value)}
                                    disabled={!selectedSessionId}
                                >
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
                            <label htmlFor="input-current">Input Current (A)</label>
                            <select
                                id="input-current"
                                value={inputCurrent}
                                onChange={(e) => setInputCurrent(e.target.value ? parseFloat(e.target.value) : '')}
                                disabled={!selectedSessionId || testPoints.length > 0 || filteredCurrents.length === 0}
                            >
                                <option value="">
                                    {testPoints.length > 0
                                        ? "Clear points to change"
                                        : !shuntRange
                                        ? "-- Set AC Shunt Range First --"
                                        : "-- Select Current --"}
                                </option>
                                {filteredCurrents.map(current => (<option key={current.value} value={current.value}>{current.text}</option>))}
                            </select>
                        </div>
                        <div className="form-section-action">
                             <button 
                                type="button" 
                                onClick={() => setIsModalOpen(true)} 
                                className="button" 
                                disabled={!selectedSessionId || !inputCurrent}
                            >
                                Add Test Points...
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="content-area">
                <div className="test-points-header">
                    <h2>Generated Test Points ({testPoints.length})</h2>
                    <div>
                        {testPoints.length > 0 && (<button onClick={handleClearAllTestPoints} className="button button-danger">Clear All Points</button>)}
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '10px 0' }}>
                    {testPoints.length > 0 ? (
                        testPoints.map((point) => (
                            <div
                                key={point.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '8px 12px',
                                    borderRadius: '20px',
                                    backgroundColor: 'var(--button-bg, #E0E0E0)',
                                    color: 'var(--button-text-color, #333)',
                                    fontWeight: '500',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                }}
                            >
                                <span>{formatCurrent(point.current)} @ {formatFrequency(point.frequency)}</span>
                                <button
                                    onClick={() => handleDeleteTestPoint(point.id)}
                                    style={{
                                        marginLeft: '8px',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--button-danger-text-color)',
                                        cursor: 'pointer',
                                        fontSize: '1em',
                                        fontWeight: 'bold',
                                        padding: '0 4px',
                                        lineHeight: '1',
                                    }}
                                    title="Delete test point"
                                >
                                    &times;
                                </button>
                            </div>
                        ))
                    ) : (
                        <p style={{ margin: 0, fontStyle: 'italic', color: '#6c757d' }}>
                            {selectedSessionId ? "No test points generated for this session." : "Select a session to view its test points."}
                        </p>
                    )}
                </div>
            </div>
        </React.Fragment>
    );
}

export default TestPointEditor;