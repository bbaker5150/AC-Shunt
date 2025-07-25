/**
 * @file SessionSetup.js
 * @brief A view component for session management.
 * * This component orchestrates the rendering of the SessionManager and
 * SessionDetailsForm components, allowing users to manage session data
 * from a single screen.
 */
import React, { useState, useEffect, useCallback } from 'react';
import SessionManager from './SessionManager';
import SessionDetailsForm from './SessionDetailsForm';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function SessionSetup({ showNotification }) {
    const [sessionsList, setSessionsList] = useState([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

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
    }, [showNotification]);

    useEffect(() => {
        fetchSessionsList();
    }, [fetchSessionsList]);

    return (
        <React.Fragment>
            <div className="content-area">
                <SessionManager
                    sessionsList={sessionsList}
                    isLoadingSessions={isLoadingSessions}
                    showNotification={showNotification}
                    fetchSessionsList={fetchSessionsList}
                />
                <SessionDetailsForm
                    sessionsList={sessionsList}
                    fetchSessionsList={fetchSessionsList}
                    showNotification={showNotification}
                />
            </div>
        </React.Fragment>
    );
}

export default SessionSetup;