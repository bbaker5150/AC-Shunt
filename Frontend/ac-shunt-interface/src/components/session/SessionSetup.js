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

function SessionSetup({ showNotification }) { 
    const [sessionsList, setSessionsList] = useState([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    return (
        <React.Fragment>
            <div className="content-area">
                <SessionManager 
                    sessionsList={sessionsList}
                    setSessionsList={setSessionsList}
                    isLoadingSessions={isLoadingSessions}
                    setIsLoadingSessions={setIsLoadingSessions}
                    // Pass the prop down to SessionManager
                    showNotification={showNotification} 
                />
                <SessionDetailsForm 
                    sessionsList={sessionsList} 
                    fetchSessionsList={() => setIsLoadingSessions(true)}
                />
            </div>
            <InstrumentStatusPanel />
        </React.Fragment>
    );
}

export default SessionSetup;