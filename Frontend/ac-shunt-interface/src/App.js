/**
 * @file App.js
 * This is the root component of the application. It sets up the main layout,
 * context providers, and routing between the primary tabs (Session Setup, 
 * Test Point Editor, etc.).
 */
import React, { useState, useCallback } from 'react';
import SessionSetup from './components/session/SessionSetup';
import InstrumentStatusTab from './components/session/InstrumentStatusTab'; // Import new component
import Calibration from './components/calibration/Calibration';
import TestPointEditor from './components/calibration/TestPointEditor';
import CalibrationResults from './components/calibration/CalibrationResults';
// Import the correct Instrument provider and hook
import { InstrumentContextProvider, useInstruments } from './contexts/InstrumentContext'; 
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const Notification = ({ message, type, onDismiss }) => {
    if (!message) return null;
    return (
        <div className={`notification-bar notification-${type}`}>
            <span>{message}</span>
            <button onClick={onDismiss} className="dismiss">&times;</button>
        </div>
    );
};

// We create a new component for the content. This is necessary so it can
// access the contexts provided by its parents.
function AppContent() {
    const [activeTab, setActiveTab] = useState('sessionSetup'); // Default tab
    const [notification, setNotification] = useState({ message: '', type: 'info', key: 0 });
    const { theme, toggleTheme } = useTheme();
    // Get the selected session name from the InstrumentContext
    const { selectedSessionName } = useInstruments();

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

    return (
        <div className="App">
            {notification.message && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    onDismiss={dismissNotification}
                    key={notification.key}
                />
            )}
            
            <header className="App-header">
                <div className="header-top-bar">
                    {/* Left Column: Session Name */}
                    <div className="header-left">
                        {selectedSessionName && (
                            <span className="global-session-name">
                                Session: {selectedSessionName}
                            </span>
                        )}
                    </div>

                    {/* Center Column: Main Title */}
                    <div className="header-center">
                        <h1>AC Shunt Calibration</h1>
                    </div>

                    {/* Right Column: Theme Switcher */}
                    <div className="header-right">
                        <div className="theme-switcher">
                            <span>{theme === 'light' ? 'Light' : 'Dark'} Mode</span>
                            <label className="switch">
                                <input
                                    type="checkbox"
                                    onChange={toggleTheme}
                                    checked={theme === 'dark'}
                                />
                                <span className="slider round" />
                            </label>
                        </div>
                    </div>
                </div>
                
                <nav className="tab-navigation">
                    <button onClick={() => setActiveTab('sessionSetup')} className={activeTab === 'sessionSetup' ? 'tab-button active' : 'tab-button'}>
                        Session Setup
                    </button>
                    {/* New Tab Button */}
                    <button onClick={() => setActiveTab('instrumentStatus')} className={activeTab === 'instrumentStatus' ? 'tab-button active' : 'tab-button'}>
                        Instrument Status
                    </button>
                    <button onClick={() => setActiveTab('testPoints')} className={activeTab === 'testPoints' ? 'tab-button active' : 'tab-button'}>
                        Test Point Editor
                    </button>
                    <button onClick={() => setActiveTab('runCalibration')} className={activeTab === 'runCalibration' ? 'tab-button active' : 'tab-button'}>
                        Run Calibration
                    </button>
                    <button onClick={() => setActiveTab('calibrationResults')} className={activeTab === 'calibrationResults' ? 'tab-button active' : 'tab-button'}>
                        Calibration Results
                    </button>
                </nav>
            </header>

            <main className="tab-content-container">
                {activeTab === 'sessionSetup' && (
                    <SessionSetup showNotification={showNotification} />
                )}
                {/* New Tab Content */}
                {activeTab === 'instrumentStatus' && (
                    <InstrumentStatusTab showNotification={showNotification} />
                )}
                {activeTab === 'testPoints' && (
                    <TestPointEditor showNotification={showNotification} />
                )}
                {activeTab === 'runCalibration' && (
                    <Calibration showNotification={showNotification} />
                )}
                {activeTab === 'calibrationResults' && (
                    <CalibrationResults showNotification={showNotification} />
                )}
            </main>
        </div>
    );
}

// The main App component now provides both the Instrument and Theme contexts.
function App() {
    return (
        <InstrumentContextProvider>
            <ThemeProvider>
                <AppContent />
            </ThemeProvider>
        </InstrumentContextProvider>
    );
}

export default App;