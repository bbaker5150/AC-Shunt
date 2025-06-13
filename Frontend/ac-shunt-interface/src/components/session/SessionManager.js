/**
 * @file SessionManager.js
 * @brief Component for selecting, viewing, and resetting calibration sessions.
 * * This component fetches a list of existing calibration sessions from the API
 * and displays them in a dropdown menu. It allows a user to select a session
 * to view or edit its details. It also provides a "Reset" button to clear the
 * current selection and start a new session. It uses and updates the shared
 * session state (ID and name) from the InstrumentContext.
 */
import React, { useEffect, useCallback } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = 'http://10.206.104.144:8000/api';

function SessionManager({ sessionsList, setSessionsList, isLoadingSessions, setIsLoadingSessions, showNotification }) {
    const { selectedSessionId, setSelectedSessionId, setSelectedSessionName } = useInstruments();

    const fetchSessionsList = useCallback(async () => {
        setIsLoadingSessions(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/calibration_sessions/`);
            setSessionsList(response.data || []);
        } catch (error) {
            showNotification('Failed to fetch sessions list.', 'error');
        } finally {
            setIsLoadingSessions(false);
        }
    }, [setIsLoadingSessions, setSessionsList, showNotification]);

    useEffect(() => {
        fetchSessionsList();
    }, [fetchSessionsList]);

    const handleSessionSelectChange = (e) => {
        const sessionId = e.target.value;
        const session = sessionsList.find(s => s.id.toString() === sessionId);

        setSelectedSessionId(sessionId || null);
        setSelectedSessionName(session ? session.session_name : '');
    };

    const handleReset = () => {
        setSelectedSessionId(null);
        setSelectedSessionName('');
        showNotification('Form cleared.', 'info');
    };

    return (
        <div className="form-section">
            <label htmlFor="session-select">Calibration Session</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                    id="session-select"
                    value={selectedSessionId || ''}
                    onChange={handleSessionSelectChange}
                    disabled={isLoadingSessions}
                    style={{ flexGrow: 1 }}
                >
                    <option value="">-- Start New Session --</option>
                    {isLoadingSessions ? <option disabled>Loading...</option> : sessionsList.map(s => (
                        <option key={s.id} value={s.id}>{s.session_name} (ID: {s.id})</option>
                    ))}
                </select>
                <button type="button" onClick={handleReset} className="button button-secondary">
                    Reset
                </button>
            </div>
        </div>
    );
}

export default SessionManager;