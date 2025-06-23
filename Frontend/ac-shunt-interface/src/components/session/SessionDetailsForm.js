/**
 * @file SessionDetailsForm.js
 * @brief A form for creating and editing calibration session details.
 * * This component provides a form to input or update metadata for a calibration
 * session, including instrument details, environmental conditions (temperature,
 * humidity), and notes. It can operate in two modes: creating a new session or
 * updating an existing one, determined by whether a `selectedSessionId` is
 * active in the InstrumentContext. On submission, it communicates with the
 * backend API to save the data.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const initialFormData = {
    sessionName: `Calibration Session - ${new Date().toLocaleString()}`,
    testInstrument: '', testInstrumentSerial: '',
    standardInstrumentModel: '', standardInstrumentSerial: '',
    temperature: '', humidity: '', notes: '',
};

function SessionDetailsForm({ sessionsList, fetchSessionsList, showNotification }) {
    const { selectedSessionId, setSelectedSessionId, setSelectedSessionName } = useInstruments();
    const [formData, setFormData] = useState(initialFormData);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (selectedSessionId) {
            const session = sessionsList.find(s => s.id.toString() === selectedSessionId);
            if (session) {
                setFormData({
                    sessionName: session.session_name || '',
                    testInstrument: session.test_instrument_model || '',
                    testInstrumentSerial: session.test_instrument_serial || '',
                    standardInstrumentModel: session.standard_instrument_model || '',
                    standardInstrumentSerial: session.standard_instrument_serial || '',
                    temperature: session.temperature !== null ? session.temperature.toString() : '',
                    humidity: session.humidity !== null ? session.humidity.toString() : '',
                    notes: session.notes || '',
                });
            }
        } else {
            setFormData(initialFormData);
        }
    }, [selectedSessionId, sessionsList]);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        const payload = {
            session_name: formData.sessionName,
            test_instrument_model: formData.testInstrument,
            test_instrument_serial: formData.testInstrumentSerial,
            standard_instrument_model: formData.standardInstrumentModel,
            standard_instrument_serial: formData.standardInstrumentSerial,
            temperature: parseFloat(formData.temperature) || null,
            humidity: parseFloat(formData.humidity) || null,
            notes: formData.notes,
        };

        try {
            let response;
            if (selectedSessionId) {
                response = await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`, payload);
                showNotification('Session updated successfully!', 'success');
            } else {
                response = await axios.post(`${API_BASE_URL}/calibration_sessions/`, payload);
                showNotification('New session saved successfully!', 'success');
            }
            fetchSessionsList(); // Refresh the session list
            setSelectedSessionId(response.data.id);
            setSelectedSessionName(response.data.session_name);
        } catch (error) {
            console.error("Failed to save session", error);
            showNotification('Failed to save session.', 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '300px' }}>
                    <div className="form-section">
                        <label htmlFor="sessionName">Session Name</label>
                        <input type="text" id="sessionName" name="sessionName" value={formData.sessionName} onChange={handleChange} required />
                    </div>
                    <div className="form-section">
                        <label htmlFor="testInstrument">Test Instrument</label>
                        <input type="text" id="testInstrument" name="testInstrument" value={formData.testInstrument} onChange={handleChange} required />
                    </div>
                     <div className="form-section">
                        <label htmlFor="testInstrumentSerial">Test Instrument Serial</label>
                        <input type="text" id="testInstrumentSerial" name="testInstrumentSerial" value={formData.testInstrumentSerial} onChange={handleChange} required />
                    </div>
                    <div className="form-section">
                        <label htmlFor="standardInstrumentModel">Standard Instrument</label>
                        <input type="text" id="standardInstrumentModel" name="standardInstrumentModel" value={formData.standardInstrumentModel} onChange={handleChange} required />
                    </div>
                    <div className="form-section">
                        <label htmlFor="standardInstrumentSerial">Standard Serial</label>
                        <input type="text" id="standardInstrumentSerial" name="standardInstrumentSerial" value={formData.standardInstrumentSerial} onChange={handleChange} required />
                    </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '300px' }}>
                     <div className="form-section">
                        <label htmlFor="temperature">Temperature (°C)</label>
                        <input type="number" id="temperature" name="temperature" value={formData.temperature} onChange={handleChange} step="0.1" required />
                    </div>
                     <div className="form-section">
                        <label htmlFor="humidity">Humidity (%RH)</label>
                        <input type="number" id="humidity" name="humidity" value={formData.humidity} onChange={handleChange} step="0.1" required />
                    </div>
                     <div className="form-section">
                        <label htmlFor="notes">Notes</label>
                        <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} rows="4" />
                    </div>
                </div>
            </div>
            <button type="submit" className="button button-success" disabled={isLoading}>
                {isLoading ? 'Saving...' : (selectedSessionId ? 'Update Session' : 'Save as New Session')}
            </button>
        </form>
    );
}

export default SessionDetailsForm;