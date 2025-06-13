/**
 * @file SessionSetup.js
 * @brief A view component for session management and instrument status.
 * * This component acts as a container for the main "Initialization" or "Setup"
 * tab of the application. It orchestrates the rendering of the SessionManager,
 * SessionDetailsForm, and InstrumentStatusPanel components, allowing users to
 * manage session data and view the status of connected instruments from a
 * single screen.
 */

import React, { useState } from 'react';
import SessionManager from './SessionManager';
import SessionDetailsForm from './SessionDetailsForm';
import InstrumentStatusPanel from '../instruments/InstrumentStatusPanel';
import axios from 'axios';

const API_BASE_URL = 'http://10.206.104.144:8000/api';

function SessionSetup({ showNotification }) {
    const [sessionsList, setSessionsList] = useState([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    // This function will be passed to SessionManager to fetch sessions
    // and to SessionDetailsForm to refresh the list after a save.
    const fetchSessionsList = async () => {
        setIsLoadingSessions(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/calibration_sessions/`);
            setSessionsList(response.data || []);
        } catch (error) {
            // Use the notification function here
            showNotification('Failed to fetch sessions list.', 'error');
        } finally {
            setIsLoadingSessions(false);
        }
    };

    return (
        <React.Fragment>
            <div className="content-area">
                <SessionManager
                    sessionsList={sessionsList}
                    setSessionsList={setSessionsList}
                    isLoadingSessions={isLoadingSessions}
                    setIsLoadingSessions={setIsLoadingSessions}
                    showNotification={showNotification}
                    fetchSessionsList={fetchSessionsList} 
                />
                <SessionDetailsForm
                    sessionsList={sessionsList}
                    fetchSessionsList={fetchSessionsList}
                    showNotification={showNotification}
                />
            </div>
            <InstrumentStatusPanel showNotification={showNotification} />
        </React.Fragment>
    );
}

export default SessionSetup;