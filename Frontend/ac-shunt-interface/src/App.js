import React, { useState, useEffect } from 'react';
import './App.css';
import InitializationManager from './components/InitializationManager';
import CalibrationSetup from './components/CalibrationSetup';
import { InstrumentContextProvider } from './contexts/InstrumentContext'; 

// Define your tabs
const TABS = {
  INITIALIZATION: 'Initialization',
  CAL_SETUP: 'Calibration Setup',
  CALIBRATION: 'Calibration',
};

function App() {
  const [activeTab, setActiveTab] = useState(TABS.INITIALIZATION);
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
      case TABS.INITIALIZATION:
        return <InitializationManager />;
      case TABS.CAL_SETUP:
        return <CalibrationSetup />;
      case TABS.CALIBRATION:
        return <div className="content-area"><p>Calibration section content will go here.</p></div>;
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
              className={`tab-button ${activeTab === TABS.INITIALIZATION ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.INITIALIZATION)}
            >
              {TABS.INITIALIZATION}
            </button>
            <button
              className={`tab-button ${activeTab === TABS.CAL_SETUP ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.CAL_SETUP)}
            >
              {TABS.CAL_SETUP}
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
