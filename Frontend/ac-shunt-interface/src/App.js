/**
 * @file App.js
 * This is the root component of the application. It sets up the main layout,
 * context provider, and routing between the primary tabs (Session Setup, 
 * Test Point Editor, etc.). It also manages the application-wide state for
 * the light/dark theme.
 */
import React, { useState, useEffect, useCallback } from 'react';
import SessionSetup from './components/session/SessionSetup';
import TestPointEditor from './components/calibration/TestPointEditor';
// NOTE: You may need to import your actual component for the calibration tab
// import RunCalibration from './components/calibration/RunCalibration'; 
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

function App() {
    const [activeTab, setActiveTab] = useState('sessionSetup');
    const [notification, setNotification] = useState({ message: '', type: 'info', key: 0 });
    
    // --- Dark Mode State and Logic ---
    const [theme, setTheme] = useState('light');

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    useEffect(() => {
        // Apply the theme class to the body element
        document.body.className = '';
        document.body.classList.add(`${theme}-mode`);
    }, [theme]);
    // ---------------------------------

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
                <h1>AC Shunt Calibration</h1>

                {/* --- Restored Theme Switcher --- */}
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
                {/* ---------------------------------- */}
                
                <nav className="tab-navigation">
                    <button onClick={() => setActiveTab('sessionSetup')} className={activeTab === 'sessionSetup' ? 'tab-button active' : 'tab-button'}>
                        Session Setup
                    </button>
                    <button onClick={() => setActiveTab('testPoints')} className={activeTab === 'testPoints' ? 'tab-button active' : 'tab-button'}>
                        Test Point Editor
                    </button>
                    <button onClick={() => setActiveTab('runCalibration')} className={activeTab === 'runCalibration' ? 'tab-button active' : 'tab-button'}>
                        Run Calibration
                    </button>
                </nav>
            </header>

            <main className="tab-content-container">
                {activeTab === 'sessionSetup' && (
                    <SessionSetup showNotification={showNotification} />
                )}
                {activeTab === 'testPoints' && (
                    <TestPointEditor showNotification={showNotification} />
                )}
                {activeTab === 'runCalibration' && (
                    <div>Run Calibration Component Goes Here</div>
                )}
            </main>
        </div>
    );
}

export default App;