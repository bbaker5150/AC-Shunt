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
    { text: '1mA', value: 0.001 }, { text: '2mA', value: 0.002 }, 
    { text: '5mA', value: 0.005 }, { text: '10mA', value: 0.01 }, { text: '20mA', value: 0.02 },
    { text: '50mA', value: 0.05 }, { text: '100mA', value: 0.1 }, { text: '200mA', value: 0.2 },
    { text: '500mA', value: 0.5 }, { text: '1A', value: 1 }, { text: '2A', value: 2 },
    { text: '5A', value: 5 }, { text: '10A', value: 10 }, { text: '20A', value: 20 },
    { text: '50A', value: 50 }, { text: '100A', value: 100 }
];

const AVAILABLE_FREQUENCIES = [
    { text: '10Hz', value: 10 }, { text: '20Hz', value: 20 }, { text: '50Hz', value: 50 },
    { text: '60Hz', value: 60 }, { text: '100Hz', value: 100 }, { text: '200Hz', value: 200 },
    { text: '500Hz', value: 500 }, { text: '1kHz', value: 1000 }, { text: '2kHz', value: 2000 },
    { text: '5kHz', value: 5000 }, { text: '10kHz', value: 10000 }, { text: '20kHz', value: 20000 },
    { text: '50kHz', value: 50000 }, { text: '100kHz', value: 100000 }
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
            <div className="modal-content" style={{textAlign: 'left'}}>
                <h3>Select Frequencies</h3>
                <div className="frequency-list-container" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '15px' }}>
                    {AVAILABLE_FREQUENCIES.map(freq => (
                        <div key={freq.value} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                            <input
                                type="checkbox"
                                id={`freq-${freq.value}`}
                                checked={selected.has(freq.value)}
                                onChange={() => handleCheckboxChange(freq.value)}
                                style={{ width: 'auto', marginRight: '10px' }}
                            />
                            <label htmlFor={`freq-${freq.value}`} style={{ marginBottom: '0', fontWeight: 'normal' }}>
                                {freq.text}
                            </label>
                        </div>
                    ))}
                </div>
                <div className="modal-actions" style={{marginTop: '20px'}}>
                    <button onClick={onCancel} className="button button-secondary">Cancel</button>
                    <button onClick={handleConfirm} className="button">Confirm</button>
                </div>
            </div>
        </div>
    );
};

function TestPointEditor({ showNotification }) {
    const { selectedSessionId, selectedSessionName } = useInstruments();

    const [stagedFrequencies, setStagedFrequencies] = useState([]);
    const [testPoints, setTestPoints] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Settings state
    const [inputCurrent, setInputCurrent] = useState('');
    const [amplifierRange, setAmplifierRange] = useState('');
    const [tvcUpperLimit, setTvcUpperLimit] = useState('');

    const fetchTestPointSetAndSettings = useCallback(async () => {
        if (!selectedSessionId) {
            setTestPoints([]);
            setInputCurrent('');
            setAmplifierRange('');
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

            const current = pointsWithIds.length > 0 ? pointsWithIds[0].current : (settings?.input_current || '');
            setInputCurrent(current);
            setTvcUpperLimit(settings?.tvc_upper_limit || '');

        } catch (error) {
            console.error("Failed to fetch data:", error);
            showNotification('Could not load test points or settings for the selected session.', 'error');
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchTestPointSetAndSettings();
    }, [fetchTestPointSetAndSettings]);

    useEffect(() => {
        const current = parseFloat(inputCurrent);
        if (!current || isNaN(current)) {
            setAmplifierRange('');
            return;
        }

        const suitableRange = AMPLIFIER_RANGES_A.find(range => current <= range);

        if (suitableRange !== undefined) {
            setAmplifierRange(suitableRange);
        } else {
            setAmplifierRange('Out of Range');
        }
    }, [inputCurrent]);
    
    const handleSaveSettings = async () => {
        if (!selectedSessionId) {
            showNotification('No active session to save to.', 'error');
            return;
        }
        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                settings: {
                    ac_shunt_range: parseFloat(amplifierRange) || null,
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

    const handleGenerateAndSavePoints = async () => {
        const currentInputValue = parseFloat(inputCurrent);
        if (!currentInputValue) {
            showNotification('Please set a valid Input Current before generating points.', 'error');
            return;
        }
        if (amplifierRange === 'Out of Range') {
            showNotification(`Input Current of ${currentInputValue}A exceeds the maximum amplifier range of 100A.`, 'error');
            return;
        }
        if (stagedFrequencies.length === 0) {
            showNotification('Please select at least one frequency to add.', 'error');
            return;
        }

        const existingFrequencies = new Set(testPoints.map(p => p.frequency));
        const newFrequenciesToAdd = stagedFrequencies.filter(f => !existingFrequencies.has(f.value));

        if (newFrequenciesToAdd.length !== stagedFrequencies.length) {
            showNotification('One or more selected frequencies already exist and were ignored.', 'warning');
        }

        if (newFrequenciesToAdd.length === 0) {
            showNotification('All selected frequencies have already been added.', 'error');
            return;
        }

        const newTestPoints = newFrequenciesToAdd.map(freq => ({
            current: currentInputValue,
            frequency: freq.value
        }));
        
        const updatedTestPoints = [...testPoints, ...newTestPoints];
        const pointsToSave = updatedTestPoints.map(({ current, frequency }) => ({ current, frequency }));

        try {
            await Promise.all([
                axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, { points: pointsToSave }),
                axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                    settings: {
                        input_current: currentInputValue,
                        ac_shunt_range: parseFloat(amplifierRange),
                        tvc_upper_limit: parseFloat(tvcUpperLimit) || null
                    }
                })
            ]);

            showNotification(`${newFrequenciesToAdd.length} new test point(s) generated and saved!`, 'success');
            
            fetchTestPointSetAndSettings();
            setStagedFrequencies([]);
        } catch (error) {
            console.error("Failed to save the configuration:", error);
            showNotification('An error occurred while saving the new test points.', 'error');
        }
    };

    const handleDeleteTestPoint = async (idToDelete) => {
        const updatedPoints = testPoints.filter(point => point.id !== idToDelete);
        const pointsToSave = updatedPoints.map(({ current, frequency }) => ({ current, frequency }));

        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, { points: pointsToSave });

            showNotification('Test point deleted successfully!', 'success');
            if (updatedPoints.length === 0) {
                setInputCurrent('');
            }
            fetchTestPointSetAndSettings();
        } catch (error) {
            console.error("Failed to delete the test point:", error);
            showNotification('An error occurred while deleting the test point.', 'error');
        }
    };

    const handleClearAllTestPoints = async () => {
        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`, { points: [] });
            showNotification('All test points cleared.', 'success');
            setInputCurrent('');
            fetchTestPointSetAndSettings();
        } catch (error) {
            console.error("Failed to clear test points:", error);
            showNotification('An error occurred while clearing test points.', 'error');
        }
    };
    
    const formatFrequency = (value) => {
        const freqObject = AVAILABLE_FREQUENCIES.find(f => f.value === value);
        return freqObject ? freqObject.text : `${value}Hz`;
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
                        setStagedFrequencies(selected);
                        setIsModalOpen(false);
                    }}
                    preselectedFrequencies={stagedFrequencies}
                />
            )}
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
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="amplifier-range">8100 Amplifier Range</label>
                            <input type="text" id="amplifier-range" value={amplifierRange ? `${amplifierRange}A` : ''} disabled readOnly />
                        </div>
                         <div className="form-section">
                            <label htmlFor="tvc-upper-limit">TVC Upper Limit (A)</label>
                            <input type="number" id="tvc-upper-limit" value={tvcUpperLimit} onChange={(e) => setTvcUpperLimit(e.target.value)} disabled={!selectedSessionId} placeholder="e.g., 100.5" />
                        </div>
                        <div className="form-section-action">
                             <button onClick={handleSaveSettings} className="button" disabled={!selectedSessionId}>Update Settings</button>
                        </div>
                    </div>

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
                                {AVAILABLE_CURRENTS.map(current => (<option key={current.value} value={current.value}>{current.text}</option>))}
                            </select>
                        </div>
                        <div className="form-section">
                            <label>Frequencies to Add</label>
                            <div className="staged-frequencies" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '40px', padding: '5px', borderRadius: '4px' }}>
                                {stagedFrequencies.length > 0 ? stagedFrequencies.map(f => (
                                    <span key={f.value} className="frequency-tag" style={{ padding: '5px 10px', backgroundColor: 'var(--background-color-offset)', color: 'var(--primary-text-color)', borderRadius: '4px' }}>
                                        {f.text}
                                    </span>
                                )) : <span style={{color: 'var(--secondary-text-color)', fontStyle: 'italic', padding: '5px' }}>Click "Select Frequencies..." below to choose frequencies.</span>}
                            </div>
                        </div>
                         <div className="form-section-action">
                             <button type="button" onClick={() => setIsModalOpen(true)} className="button" style={{marginRight: '10px'}} disabled={!selectedSessionId}>Select Frequencies...</button>
                            <button type="button" onClick={handleGenerateAndSavePoints} className="button" disabled={!selectedSessionId || stagedFrequencies.length === 0}>Generate & Save Points</button>
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