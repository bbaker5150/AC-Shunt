import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useInstruments } from '../contexts/InstrumentContext';

const API_BASE_URL = 'http://10.206.104.144:8000/api';

const AVAILABLE_CURRENTS = [
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

const Notification = ({ message, type, onDismiss }) => {
    if (!message) return null;
    return (
        <div className={`notification-bar notification-${type}`}>
            <span>{message}</span>
            <button onClick={onDismiss} className="dismiss">&times;</button>
        </div>
    );
};

function CalibrationSetup() {
    const { selectedSessionId } = useInstruments();

    const [selectedCurrent, setSelectedCurrent] = useState(AVAILABLE_CURRENTS[0].value);
    const [frequencyInputs, setFrequencyInputs] = useState([{text: '', value: ''}]); 
    const [testPoints, setTestPoints] = useState([]);
    const [testPointSetId, setTestPointSetId] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: 'info', key: 0 });

    const [acShuntRange, setAcShuntRange] = useState('');
    const [tvcUpperLimit, setTvcUpperLimit] = useState('');
    
    const [savedAcShuntRange, setSavedAcShuntRange] = useState('');
    const [savedTvcUpperLimit, setSavedTvcUpperLimit] = useState('');


    const showNotification = useCallback((message, type = 'info', duration = 4000) => {
        const newKey = Date.now();
        setNotification({ message, type, key: newKey });
        if (duration > 0) {
            setTimeout(() => {
                setNotification(prev => (prev.key === newKey ? { message: '', type: 'info', key: 0 } : prev));
            }, duration);
        }
    }, []);
    
    const dismissNotification = useCallback(() => {
        setNotification({ message: '', type: 'info', key: 0 });
    }, []);

    const fetchTestPointSet = useCallback(async () => {
        if (!selectedSessionId) {
            setTestPoints([]); setTestPointSetId(null);
            setAcShuntRange(''); setTvcUpperLimit('');
            setSavedAcShuntRange(''); setSavedTvcUpperLimit('');
            return;
        }
        try {
            const response = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_point_set/`);
            const pointsWithIds = (response.data.points || []).map(p => ({
                ...p,
                id: `server_${Math.random().toString(36).substring(2, 9)}`
            }));
            setTestPoints(pointsWithIds);
            setTestPointSetId(response.data.id);
            setAcShuntRange(response.data.ac_shunt_range || '');
            setTvcUpperLimit(response.data.tvc_upper_limit || '');
            setSavedAcShuntRange(response.data.ac_shunt_range || '');
            setSavedTvcUpperLimit(response.data.tvc_upper_limit || '');

        } catch (error) {
            console.error("Failed to fetch test point set:", error);
            setTestPoints([]);
            showNotification('Could not load test points for the selected session.', 'error');
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchTestPointSet();
    }, [fetchTestPointSet]);
    
    const validateSettings = () => {
        const shuntRangeValue = parseFloat(acShuntRange);
        const tvcLimitValue = parseFloat(tvcUpperLimit);

        if (acShuntRange && tvcUpperLimit && !isNaN(shuntRangeValue) && !isNaN(tvcLimitValue)) {
            if (shuntRangeValue > tvcLimitValue) {
                showNotification(`AC Shunt Range (${acShuntRange}A) cannot exceed the TVC Upper Limit (${tvcUpperLimit}).`, 'error');
                return false;
            }
        }
        return true;
    };

    const handleSaveSettings = async () => {
        if (!selectedSessionId) {
            showNotification('No active session to save to.', 'error');
            return;
        }
        if (!validateSettings()) {
            return;
        }
        try {
            const response = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_point_set/`);
            const existingPoints = response.data.points || [];

            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_point_set/`, {
                points: existingPoints,
                ac_shunt_range: parseFloat(acShuntRange) || null,
                tvc_upper_limit: parseFloat(tvcUpperLimit) || null 
            });
            showNotification('Settings saved successfully!', 'success');
            fetchTestPointSet(); 
        } catch (error) {
            console.error("Failed to save settings:", error);
            showNotification('An error occurred while saving settings.', 'error');
        }
    };
    
    const handleGenerateTestPoints = () => {
        dismissNotification();
        const shuntRangeValue = parseFloat(acShuntRange);
        const currentInputValue = selectedCurrent;

        if (!acShuntRange || isNaN(shuntRangeValue)) {
            showNotification('Please set and save a valid AC Shunt Range before generating points.', 'error');
            return;
        }
        
        if (shuntRangeValue < currentInputValue) {
            const currentDisplay = AVAILABLE_CURRENTS.find(c => c.value === currentInputValue)?.text || `${currentInputValue}A`;
            showNotification(`AC Shunt Range (${acShuntRange}A) must be greater or equal to the selected standard current (${currentDisplay}).`, 'error');
            return;
        }

        const validFrequencies = frequencyInputs.filter(freq => freq.value);
        if (validFrequencies.length === 0) {
            showNotification('Please select at least one frequency.', 'error');
            return;
        }
        const newTestPoints = validFrequencies.map(freq => ({
            id: `local_${Math.random().toString(36).substring(2, 9)}`,
            current: selectedCurrent,
            frequency: freq.value
        }));
        setTestPoints(prevPoints => [...prevPoints, ...newTestPoints]);
        setFrequencyInputs([{text: '', value: ''}]);
    };
    
    const handleDeleteTestPoint = (idToDelete) => {
        setTestPoints(testPoints.filter(point => point.id !== idToDelete));
    };

    const handleClearAllTestPoints = () => {
        setTestPoints([]);
    };

    const handleFrequencyChange = (index, selectedValue) => {
        const newFrequencyInputs = [...frequencyInputs];
        const selectedFreqObject = AVAILABLE_FREQUENCIES.find(f => f.value.toString() === selectedValue);
        newFrequencyInputs[index] = selectedFreqObject || {text: '', value: ''};
        setFrequencyInputs(newFrequencyInputs);
    };

    const handleAddFrequency = () => {
        setFrequencyInputs([...frequencyInputs, {text: '', value: ''}]);
    };

    const handleRemoveFrequency = (indexToRemove) => {
        setFrequencyInputs(frequencyInputs.filter((_, index) => index !== indexToRemove));
    };

    const handleSaveAll = async () => {
        if (!selectedSessionId) return;

        if (!validateSettings()) {
            return;
        }

        const shuntRangeValue = parseFloat(acShuntRange);
        if (testPoints.length > 0 && acShuntRange) {
            if (isNaN(shuntRangeValue)) {
                showNotification('AC Shunt Range must be a valid number.', 'error');
                return;
            }
            // *** THIS IS THE FIX: The check is now correctly <= ***
            const maxCurrentInPoints = Math.max(...testPoints.map(p => p.current));
            if (shuntRangeValue <= maxCurrentInPoints) {
                showNotification(`Save failed: AC Shunt Range (${acShuntRange}A) must be greater than the highest current in the test points list (${maxCurrentInPoints}A).`, 'error');
                return;
            }
        }
        try {
            const pointsToSave = testPoints.map(({ current, frequency }) => ({ current, frequency }));
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_point_set/`, {
                points: pointsToSave,
                ac_shunt_range: shuntRangeValue || null,
                tvc_upper_limit: parseFloat(tvcUpperLimit) || null 
            });
            showNotification('Configuration and test points saved successfully!', 'success');
            fetchTestPointSet(); 
        } catch (error) {
            showNotification('An error occurred while saving the configuration.', 'error');
        }
    };
    
    const formatFrequency = (value) => {
        const freqObject = AVAILABLE_FREQUENCIES.find(f => f.value === value);
        return freqObject ? freqObject.text : `${value}Hz`;
    };
    
    const formatCurrent = (value) => {
        const currentObject = AVAILABLE_CURRENTS.find(c => c.value === value);
        return currentObject ? currentObject.text : `${value}A`;
    }

    return (
        <React.Fragment>
            {notification.message && <Notification message={notification.message} type={notification.type} onDismiss={dismissNotification} key={notification.key} />}

            <div className="content-area calibration-setup">
                <h2>Test Point Configuration</h2>
                {!selectedSessionId && (
                    <div className="form-section-warning">
                        <p>Please select a session from the "Initialization" tab to add or view test points.</p>
                    </div>
                )}
                
                <div className="config-grid">
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="ac-shunt-range">AC Shunt Range (A)</label>
                            <input type="number" id="ac-shunt-range" value={acShuntRange} onChange={(e) => setAcShuntRange(e.target.value)} disabled={!selectedSessionId} placeholder="e.g., 20" />
                        </div>
                        <div className="form-section">
                            <label htmlFor="tvc-upper-limit">TVC Upper Limit</label>
                            <input type="number" id="tvc-upper-limit" value={tvcUpperLimit} onChange={(e) => setTvcUpperLimit(e.target.value)} disabled={!selectedSessionId} placeholder="e.g., 100.5" />
                        </div>
                        <div className="form-section">
                             <button onClick={handleSaveSettings} className="button button-secondary" disabled={!selectedSessionId}>Save</button>
                        </div>
                    </div>
                    
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="current-select">Standard Current to Generate</label>
                            <select id="current-select" value={selectedCurrent} onChange={(e) => setSelectedCurrent(e.target.value ? parseFloat(e.target.value) : '')} disabled={!selectedSessionId} >
                                <option value="">-- Select Current --</option>
                                {AVAILABLE_CURRENTS.map(current => (<option key={current.value} value={current.value}>{current.text}</option>))}
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
                            <button type="button" onClick={handleGenerateTestPoints} className="button button-success" disabled={!selectedSessionId}>Generate Points</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="content-area">
                <div className="test-points-header">
                    <h2>Total Test Points: {testPoints.length}</h2>
                    <div>
                        {testPoints.length > 0 && (<button onClick={handleClearAllTestPoints} className="button button-danger" style={{marginRight: '10px'}}>Clear List</button>)}
                        <button onClick={handleSaveAll} className="button button-success" disabled={!selectedSessionId}>Save Points to Set</button>
                    </div>
                </div>

                {selectedSessionId && (
                    <div className="test-set-details">
                        <div><strong>Saved AC Shunt Range:</strong> {savedAcShuntRange ? `${savedAcShuntRange} A` : 'Not Set'}</div>
                        <div><strong>Saved TVC Upper Limit:</strong> {`${savedTvcUpperLimit} A` || 'Not Set'}</div>
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

export default CalibrationSetup;
