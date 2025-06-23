import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

function Calibration({ showNotification }) {
    const { selectedSessionId } = useInstruments();

    const [tpData, setTPData] = useState({ points: [] });
    const [calibrationSettings, setCalibrationSettings] = useState({
        initial_warm_up_time: '',
        num_samples: '',
        ac_shunt_range: '',
        tvc_upper_limit: '',
        input_current: '' // Added to state
    });

    const fetchAllCalibrationData = useCallback(async () => {
        if (!selectedSessionId) {
            setTPData({ points: [] });
            setCalibrationSettings({
                initial_warm_up_time: '',
                num_samples: '',
                ac_shunt_range: '',
                tvc_upper_limit: '',
                input_current: ''
            });
            return;
        }
        try {
            // Fetch test points first to get the definitive input current
            const tpResponse = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points`);
            const points = tpResponse.data.points || [];
            setTPData({ points });

            // The single source of truth for the current is the first test point
            const currentFromPoints = points.length > 0 ? points[0].current : '';

            const settingsResponse = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`);
            const { settings } = settingsResponse.data;
            
            setCalibrationSettings({
                initial_warm_up_time: settings?.initial_warm_up_time || '',
                num_samples: settings?.num_samples || '',
                ac_shunt_range: settings?.ac_shunt_range || '',
                tvc_upper_limit: settings?.tvc_upper_limit || '',
                // Use the current from the test points as the primary value
                input_current: currentFromPoints || settings?.input_current || ''
            });
        } catch (error) {
            console.error("Failed to fetch calibration data:", error);
            showNotification('Failed to load calibration data for the selected session.', 'error');
            setTPData({ points: [] });
            setCalibrationSettings({
                initial_warm_up_time: '',
                num_samples: '',
                ac_shunt_range: '',
                tvc_upper_limit: '',
                input_current: ''
            });
        }
    }, [selectedSessionId, showNotification]);

    useEffect(() => {
        fetchAllCalibrationData();
    }, [fetchAllCalibrationData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCalibrationSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedSessionId) {
            showNotification('No active session to save settings.', 'error');
            return;
        }
        try {
            await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, {
                settings: {
                    initial_warm_up_time: parseFloat(calibrationSettings.initial_warm_up_time) || null,
                    num_samples: parseFloat(calibrationSettings.num_samples) || null,
                    ac_shunt_range: parseFloat(calibrationSettings.ac_shunt_range) || null,
                    tvc_upper_limit: parseFloat(calibrationSettings.tvc_upper_limit) || null,
                    input_current: parseFloat(calibrationSettings.input_current) || null
                }
            });
            showNotification("Settings saved successfully!", 'success');
            fetchAllCalibrationData();
        } catch (error) {
            console.error("Failed to save settings", error);
            showNotification("Error saving settings.", 'error');
        }
    };

    return (
        <div className="content-area">
            {!selectedSessionId && (
                <div className="form-section-warning">
                    <p>Please select a session from the "Session Setup" tab to view calibration.</p>
                </div>
            )}

            {/* Top Details Section */}
            <div className="test-set-details">
                <div className="form-section">
                    <label>AC Shunt Range (A)</label>
                    <span>{calibrationSettings.ac_shunt_range || 'N/A'}</span>
                </div>
                <div className="form-section">
                    <label>Input Current</label>
                    {/* Display the input_current from state, which is now sourced from test points */}
                    <span>{calibrationSettings.input_current ? `${calibrationSettings.input_current} A` : 'N/A'}</span>
                </div>
                <div className="form-section">
                    <label>Running Test Point</label>
                    <span>{/* Placeholder for Running Test Point */}N/A</span>
                </div>
                <div className="form-section">
                    <label>Total Points</label>
                    <span>{tpData?.points?.length || '0'}</span>
                </div>
            </div>

            {/* Calibration Frequencies */}
            <div className="form-section">
                <h4>Calibration Frequencies (Hz)</h4>
                <div className="table-container">
                    <table id="cal-frequencies-table" className="cal-freq-table">
                        <tbody>
                            <tr>
                                {tpData?.points?.length > 0 ? (
                                    tpData.points.map((point, index) => (
                                        <td key={index}>{point.frequency}</td>
                                    ))
                                ) : (
                                    <td>No test points found.</td>
                                )}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Settings Form */}
            <form onSubmit={handleSubmit}>
                <h4>Calibration Settings</h4>
                <div className="config-grid">
                    {/* Column 1 */}
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="initial_warm_up_time">Initial Warm-up Wait (sec)</label>
                            <input
                                type="number"
                                id="initial_warm_up_time"
                                name="initial_warm_up_time"
                                required
                                value={calibrationSettings.initial_warm_up_time}
                                onChange={handleChange}
                                disabled={!selectedSessionId}
                            />
                        </div>
                        <div className="form-section">
                            <label htmlFor="ac_shunt_range">AC Shunt Range (A)</label>
                            <input
                                type="number"
                                id="ac_shunt_range"
                                name="ac_shunt_range"
                                value={calibrationSettings.ac_shunt_range}
                                onChange={handleChange}
                                disabled={!selectedSessionId}
                                placeholder="e.g., 20"
                            />
                        </div>
                    </div>
                    {/* Column 2 */}
                    <div className="config-column">
                        <div className="form-section">
                            <label htmlFor="num_samples"># of Samples</label>
                            <input
                                type="number"
                                id="num_samples"
                                name="num_samples"
                                required
                                value={calibrationSettings.num_samples}
                                onChange={handleChange}
                                disabled={!selectedSessionId}
                            />
                        </div>
                        <div className="form-section">
                            <label htmlFor="tvc_upper_limit">TVC Upper Limit</label>
                            <input
                                type="number"
                                id="tvc_upper_limit"
                                name="tvc_upper_limit"
                                value={calibrationSettings.tvc_upper_limit}
                                onChange={handleChange}
                                disabled={!selectedSessionId}
                                placeholder="e.g., 100.5"
                            />
                        </div>
                    </div>
                </div>
                <button type="submit" className="button button-success" disabled={!selectedSessionId}>
                    Save Settings
                </button>
            </form>
        </div>
    );
}

export default Calibration;