/**
 * @file TestPointEditor.js
 * @brief Manages the configuration of test points for a calibration session.
 *
 * This component provides the UI for creating, viewing, and managing a set of
 * test points (current and frequency combinations) associated with a specific
 * calibration session. It allows users to generate points, add them to a list,
 * and save the entire configuration, including a single Input Current,
 * AC Shunt Range, and TVC Upper Limit settings, to the backend API.
 * It relies on the active session ID from the InstrumentContext to fetch and save data.
 * It receives the showNotification function as a prop from a parent component to display status messages.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const AVAILABLE_CURRENENTS = [
    { text: '1A', value: 1 }, { text: '2A', value: 2 },
    { text: '5A', value: 5 }, { text: '10A', value: 10 }, { text: '20A', value: 20 }
];
const AVAILABLE_FREQUENCIES = [
    { text: '10Hz', value: 10 }, { text: '20Hz', value: 20 }, { text: '50Hz', value: 50 },
    { text: '60Hz', value: 60 }, { text: '100Hz', value: 100 }, { text: '200Hz', value: 200 },
    { text: '500Hz', value: 500 }, { text: '1kHz', value: 1000 }, { text: '2kHz', value: 2000 },
    { text: '5kHz', value: 5000 }, { text: '10kHz', value: 10000 }, { text: '20kHz', value: 20000 },
    { text: '50kHz', value: 50000 }, { text: '100kHz', value: 100000 }
];

function TestPointEditor({ showNotification }) {
    const { selectedSessionId, selectedSessionName } = useInstruments();

    const [frequencyInputs, setFrequencyInputs] = useState([{ text: '', value: '' }]);
    const [testPoints, setTestPoints] = useState([]);

    // Settings state
    const [inputCurrent, setInputCurrent] = useState('');
    const [acShuntRange, setAcShuntRange] = useState('');
    const [tvcUpperLimit, setTvcUpperLimit] = useState('');

    const fetchTestPointSetAndSettings = useCallback(async () => {
        if (!selectedSessionId) {
            setTestPoints([]);
            setInputCurrent('');
            setAcShuntRange('');
            setTvcUpperLimit('');
            return;
        }
        try {
            const testPointResponse = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`);
            const pointsWithIds = (testPointResponse.data.points || []).map(p => ({
                ...p,
                id: `server_${Math.random().toString(36).substring(2, 9)}`
            }));
            setTestPoints(pointsWithIds);

            const settingsResponse = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`);
            const { settings } = settingsResponse.data;

            // If points exist, the current is derived from them; otherwise, use saved settings
            const current = pointsWithIds.length > 0 ? pointsWithIds[0].current : (settings?.input_current || '');
            setInputCurrent(current);
            setAcShuntRange(settings?.ac_shunt_range || '');
            setTvcUpperLimit(settings?.tvc_upper_limit || '');

        } catch (error) {
            console.error("Failed to fetch data:", error);
            showNotification('Could not load test points or settings for the selected session.', 'error');
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchTestPointSetAndSettings();
    }, [fetchTestPointSetAndSettings]);

    const handleSaveSettings = async () => {
        if (!selectedSessionId) {
            showNotification('No active session to save to.', 'error');
            return;
        }
        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                settings: {
                    input_current: parseFloat(inputCurrent) || null,
                    ac_shunt_range: parseFloat(acShuntRange) || null,
                    tvc_upper_limit: parseFloat(tvcUpperLimit) || null
                }
            });
            showNotification('Settings saved successfully!', 'success');
            fetchTestPointSetAndSettings();
        } catch (error)
        {
            console.error("Failed to save settings:", error);
            showNotification('An error occurred while saving settings.', 'error');
        }
    };

    const handleGenerateTestPoints = () => {
        const currentInputValue = parseFloat(inputCurrent);
        if (!currentInputValue) {
            showNotification('Please set a valid Input Current before generating points.', 'error');
            return;
        }

        const shuntRangeValue = parseFloat(acShuntRange);
        if (!acShuntRange || isNaN(shuntRangeValue)) {
            showNotification('Please set and save a valid AC Shunt Range before generating points.', 'error');
            return;
        }

        if (currentInputValue > shuntRangeValue) {
            showNotification(`The Input Current (${inputCurrent}A) cannot exceed the AC Shunt Range (${acShuntRange}A).`, 'error');
            return;
        }

        const existingFrequencies = new Set(testPoints.map(p => p.frequency));
        const validNewFrequencies = frequencyInputs.filter(f => f.value && !existingFrequencies.has(f.value));
        const duplicateFrequencies = frequencyInputs.filter(f => f.value && existingFrequencies.has(f.value));

        if (duplicateFrequencies.length > 0) {
            showNotification('Duplicate frequencies were found and have been ignored.', 'error');
        }
        
        if (validNewFrequencies.length === 0) {
            if (duplicateFrequencies.length === 0) {
                 showNotification('Please select at least one new frequency.', 'error');
            }
            return;
        }

        const newTestPoints = validNewFrequencies.map(freq => ({
            id: `local_${Math.random().toString(36).substring(2, 9)}`,
            current: currentInputValue,
            frequency: freq.value
        }));
        setTestPoints(prevPoints => [...prevPoints, ...newTestPoints]);
        setFrequencyInputs([{ text: '', value: '' }]);
    };

    const handleDeleteTestPoint = (idToDelete) => {
        setTestPoints(prevPoints => {
            const newPoints = prevPoints.filter(point => point.id !== idToDelete);
            if (newPoints.length === 0) {
                setInputCurrent('');
            }
            return newPoints;
        });
    };

    const handleClearAllTestPoints = () => {
        setTestPoints([]);
        setInputCurrent('');
    };

    const handleFrequencyChange = (index, selectedValue) => {
        const newFrequencyInputs = [...frequencyInputs];
        const selectedFreqObject = AVAILABLE_FREQUENCIES.find(f => f.value.toString() === selectedValue);
        newFrequencyInputs[index] = selectedFreqObject || { text: '', value: '' };
        setFrequencyInputs(newFrequencyInputs);
    };

    const handleAddFrequency = () => {
        setFrequencyInputs([...frequencyInputs, { text: '', value: '' }]);
    };

    const handleRemoveFrequency = (indexToRemove) => {
        setFrequencyInputs(frequencyInputs.filter((_, index) => index !== indexToRemove));
    };

    const handleSaveAll = async () => {
        if (!selectedSessionId) return;

        const currentVal = parseFloat(inputCurrent);
        if (isNaN(currentVal)) {
            showNotification('Input Current must be a valid number.', 'error');
            return;
        }
        
        const shuntRangeValue = parseFloat(acShuntRange);
        if (isNaN(shuntRangeValue)) {
            showNotification('AC Shunt Range must be a valid number.', 'error');
            return;
        }

        if (currentVal > shuntRangeValue) {
            showNotification(`Save failed: The Input Current (${currentVal}A) exceeds the AC Shunt Range (${shuntRangeValue}A).`, 'error');
            return;
        }

        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                settings: {
                    input_current: currentVal,
                    ac_shunt_range: shuntRangeValue,
                    tvc_upper_limit: parseFloat(tvcUpperLimit) || null
                }
            });

            const pointsToSave = testPoints.map(({ current, frequency }) => ({ current, frequency }));
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, {
                points: pointsToSave,
            });

            showNotification('Settings and test points saved successfully!', 'success');
            fetchTestPointSetAndSettings();
        } catch (error) {
            console.error("Failed to save the configuration:", error);
            showNotification('An error occurred while saving the configuration.', 'error');
        }
    };
    
    const formatFrequency = (value) => {
        const freqObject = AVAILABLE_FREQUENCIES.find(f => f.value === value);
        return freqObject ? freqObject.text : `${value}Hz`;
    };

    const formatCurrent = (value) => {
        const currentObject = AVAILABLE_CURRENENTS.find(c => c.value === value);
        return currentObject ? currentObject.text : `${value}A`;
    };

    return (
        <React.Fragment>
            <div className="content-area calibration-setup">
                <h2>Test Point Configuration</h2>
                {selectedSessionId ? (
                    <h3 className="session-title-header">
                        For Session: <span>{selectedSessionName || `ID: ${selectedSessionId}`}</span>
                    </h3>
                ) : (
                    <div className="form-section-warning">
                        <p>Please select a session from the "Session Setup" tab to add or view test points.</p>
                    </div>
                )}

                <div className="config-grid">
                    {/* Left Column for general settings */}
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="ac-shunt-range">AC Shunt Range (A)</label>
                            <input type="number" id="ac-shunt-range" value={acShuntRange} onChange={(e) => setAcShuntRange(e.target.value)} disabled={!selectedSessionId} placeholder="e.g., 20" />
                        </div>
                        <div className="form-section">
                            <label htmlFor="tvc-upper-limit">TVC Upper Limit</label>
                            <input type="number" id="tvc-upper-limit" value={tvcUpperLimit} onChange={(e) => setTvcUpperLimit(e.target.value)} disabled={!selectedSessionId} placeholder="e.g., 100.5" />
                        </div>
                        <div className="form-section-action">
                             <button onClick={handleSaveSettings} className="button" disabled={!selectedSessionId}>Update Settings</button>
                        </div>
                    </div>

                     {/* Right Column for generating points */}
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="input-current">Input Current (A)</label>
                            <select
                                id="input-current"
                                value={inputCurrent}
                                onChange={(e) => setInputCurrent(e.target.value ? parseFloat(e.target.value) : '')}
                                disabled={!selectedSessionId || testPoints.length > 0}
                            >
                                <option value="">-- Select Current --</option>
                                {AVAILABLE_CURRENENTS.map(current => (<option key={current.value} value={current.value}>{current.text}</option>))}
                            </select>
                        </div>
                        <div className="form-section">
                            <label>Frequencies to Add</label>
                            <div className="frequency-list-container">
                                {frequencyInputs.map((freq, index) => (
                                    <div key={index} className="frequency-input-row">
                                        <select value={freq.value} onChange={(e) => handleFrequencyChange(index, e.target.value)} disabled={!selectedSessionId}>
                                            <option value="">-- Select Frequency --</option>
                                            {AVAILABLE_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.text}</option>)}
                                        </select>
                                        <button type="button" onClick={() => handleRemoveFrequency(index)} className="button button-danger button-small" disabled={!selectedSessionId || frequencyInputs.length <= 1}>Remove</button>
                                    </div>
                                ))}
                            </div>
                             <button type="button" onClick={handleAddFrequency} className="button button-secondary" style={{marginRight: '10px'}} disabled={!selectedSessionId}>Add Frequency</button>
                            <button type="button" onClick={handleGenerateTestPoints} className="button button-success" disabled={!selectedSessionId}>Generate Test Points</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="content-area">
                <div className="test-points-header">
                    <h2>Total Test Points: {testPoints.length}</h2>
                    <div>
                        {testPoints.length > 0 && (<button onClick={handleClearAllTestPoints} className="button button-danger" style={{marginRight: '10px'}}>Clear List</button>)}
                        <button onClick={handleSaveAll} className="button button-success" disabled={!selectedSessionId}>Save All Test Points</button>
                    </div>
                </div>

                {selectedSessionId && (
                    <div className="test-set-details">
                        {/* Use the live state variables for an accurate real-time display */}
                        <div><strong>Input Current:</strong> {inputCurrent ? `${inputCurrent} A` : 'Not Set'}</div>
                        <div><strong>AC Shunt Range:</strong> {acShuntRange ? `${acShuntRange} A` : 'Not Set'}</div>
                        <div><strong>TVC Upper Limit:</strong> {tvcUpperLimit || 'Not Set'}</div>
                    </div>
                )}

                <table className="test-points-table">
                    <thead>
                        <tr>
                            <th>Current</th>
                            <th>Frequency</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {testPoints.length > 0 ? testPoints.map((point) => (
                            <tr key={point.id}>
                                <td>{formatCurrent(point.current)}</td>
                                <td>{formatFrequency(point.frequency)}</td>
                                <td><button onClick={() => handleDeleteTestPoint(point.id)} className="button button-danger button-small">Delete</button></td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="3" style={{textAlign: 'center', fontStyle: 'italic', color: '#6c757d'}}>
                                    {selectedSessionId ? "No test points generated for this session." : "Select a session to view its test points."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </React.Fragment>
    );
}

export default TestPointEditor;