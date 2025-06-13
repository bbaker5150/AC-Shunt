/**
 * @file App.js
 * This is the root component of the application. It sets up the main layout,
 * context provider, and routing between the primary tabs (Session Setup, 
 * Test Point Editor, etc.). It also manages the application-wide state for
 * the light/dark theme.
 */

import React, { useState, useEffect } from 'react';
import './App.css';
import SessionSetup from './components/session/SessionSetup';
import TestPointEditor from './components/calibration/TestPointEditor';
import { InstrumentContextProvider } from './contexts/InstrumentContext';

const TABS = {
  SESSION_SETUP: 'Session Setup',
  TEST_POINTS: 'Test Point Editor',
  CALIBRATION: 'Run Calibration', // Placeholder for the future
};

function App() {
  const [activeTab, setActiveTab] = useState(TABS.SESSION_SETUP);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(theme + '-mode');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case TABS.SESSION_SETUP:
        return <SessionSetup />;
      case TABS.TEST_POINTS:
        return <TestPointEditor />;
      case TABS.CALIBRATION:
        return <div className="content-area"><p>The main calibration execution screen will go here.</p></div>;
      default:
        return <div className="content-area"><p>Select a tab to view content.</p></div>;
    }
  };

  return (
    <InstrumentContextProvider>
      <div className="App">
        <header className="App-header">
          <h1>AC Shunt Calibration</h1>
          <div className="theme-switcher">
            <span>{theme === 'light' ? 'Light' : 'Dark'} Mode</span>
            <label className="switch">
              <input type="checkbox" onChange={toggleTheme} checked={theme === 'dark'} />
              <span className="slider round"></span>
            </label>
          </div>
          <nav className="tab-navigation">
            <button
              className={`tab-button ${activeTab === TABS.SESSION_SETUP ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.SESSION_SETUP)}
            >
              {TABS.SESSION_SETUP}
            </button>
            <button
              className={`tab-button ${activeTab === TABS.TEST_POINTS ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.TEST_POINTS)}
            >
              {TABS.TEST_POINTS}
            </button>
            <button
              className={`tab-button ${activeTab === TABS.CALIBRATION ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.CALIBRATION)}
            >
              {TABS.CALIBRATION}
            </button>
          </nav>
        </header>

        <main className="tab-content-container">
          {renderTabContent()}
        </main>
      </div>
    </InstrumentContextProvider>
  );
}

export default App;
