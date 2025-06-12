import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend,
} from 'chart.js';
import { useInstruments } from '../contexts/InstrumentContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const MAX_DATA_POINTS_DISPLAY = 100;
const API_BASE_URL = 'http://10.206.104.144:8000/api';

// --- Reusable Helper Components ---

const Notification = ({ message, type, onDismiss }) => {
  if (!message) return null;
  // Simplified component to use CSS classes for styling
  return (
    <div className={`notification-bar notification-${type}`}>
      <span>{message}</span>
      <button onClick={onDismiss} className="dismiss">&times;</button>
    </div>
  );
};

const ConfirmationDialog = ({ title, message, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Cancel", confirmButtonClass = "button-danger" }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel} className="button button-secondary">{cancelText}</button>
          <button onClick={onConfirm} className={`button ${confirmButtonClass}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
};

const SetNamePromptDialog = ({ isOpen, onConfirm, onCancel, currentSetName, onSetNameChange }) => {
  if (!isOpen) return null;
  const handleSubmit = (e) => { e.preventDefault(); onConfirm(currentSetName); };
  return (
    <div className="modal-overlay">
      <form onSubmit={handleSubmit} className="modal-content">
        <h3>Enter New Set Name</h3>
        <div className="form-section" style={{borderBottom: 'none', paddingBottom: 0}}>
          <label htmlFor="prompt-new-set-name">Set Name (optional):</label>
          <input type="text" id="prompt-new-set-name" value={currentSetName} onChange={onSetNameChange} placeholder="e.g., Calibration Run Alpha" autoFocus />
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="button button-secondary">Cancel</button>
          <button type="submit" className="button button-success">Start Measurements</button>
        </div>
      </form>
    </div>
  );
};


function DMMMeasurementManager({ theme }) {
  const {
    dmmData, dmmActiveSetDetails, isDmmMeasuring, dmmWebSocketStatus, 
    startDMMMeasurements, stopDMMMeasurements, connectDmmWebSocket, 
    registerRefreshDmmSets
  } = useInstruments();

  const [measurementSets, setMeasurementSets] = useState([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [historicalMeasurements, setHistoricalMeasurements] = useState([]); 
  
  const [chartData, setChartData] = useState({ labels: [], datasets: [{ label: 'DMM Readings', data: [], borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1 }] });
  const [isLoadingSets, setIsLoadingSets] = useState(false);
  const [isLoadingMeasurements, setIsLoadingMeasurements] = useState(false);
  
  const [dmmGpibAddress, setDmmGpibAddress] = useState('GPIB0::22::INSTR');
  const [numReadingsToTake, setNumReadingsToTake] = useState(10);
  const [isPromptingSetName, setIsPromptingSetName] = useState(false);
  const [promptedSetName, setPromptedSetName] = useState('');

  const [notification, setNotification] = useState({ message: '', type: 'info', key: 0 });
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, setId: null, setName: '' });
  
  const showNotification = useCallback((message, type = 'info', duration = 5000) => {
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

  const fetchMeasurementSets = useCallback(async () => {
    setIsLoadingSets(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/measurement_sets/`);
      setMeasurementSets(response.data || []);
    } catch (err) {
      showNotification('Failed to fetch measurement sets.', 'error');
    } finally {
      setIsLoadingSets(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchMeasurementSets();
    if (registerRefreshDmmSets) {
        registerRefreshDmmSets(fetchMeasurementSets);
    }
  }, [fetchMeasurementSets, registerRefreshDmmSets]);

  useEffect(() => {
    if (selectedSetId && !isDmmMeasuring) { 
      setIsLoadingMeasurements(true);
      setHistoricalMeasurements([]); 
      axios.get(`${API_BASE_URL}/measurement_sets/${selectedSetId}/get-measurements/`)
        .then(response => setHistoricalMeasurements(response.data || []))
        .catch(() => showNotification(`Failed to fetch historical data for set ${selectedSetId}.`, 'error'))
        .finally(() => setIsLoadingMeasurements(false));
    } else if (!selectedSetId && !isDmmMeasuring) {
        setHistoricalMeasurements([]);
    }
  }, [selectedSetId, isDmmMeasuring, showNotification]);

  useEffect(() => {
    const currentDataToDisplay = isDmmMeasuring ? dmmData : historicalMeasurements;
    const labels = currentDataToDisplay.map(m => new Date(typeof m.timestamp === 'string' ? m.timestamp : m.timestamp * 1000).toLocaleTimeString());
    const dataValues = currentDataToDisplay.map(m => m.value);
    
    setChartData(prev => ({ 
        ...prev, 
        labels: labels.slice(-MAX_DATA_POINTS_DISPLAY), 
        datasets: [{ ...prev.datasets[0], data: dataValues.slice(-MAX_DATA_POINTS_DISPLAY) }] 
    }));
  }, [dmmData, historicalMeasurements, isDmmMeasuring]); 

  useEffect(() => {
    const isDarkMode = theme === 'dark';
    const lineColor = isDarkMode ? '#63b3ed' : 'rgb(75, 192, 192)';
    const areaColor = isDarkMode ? 'rgba(99, 179, 237, 0.2)' : 'rgba(75, 192, 192, 0.2)';

    setChartData(prevChartData => ({
        ...prevChartData,
        datasets: [{
            ...prevChartData.datasets[0],
            borderColor: lineColor,
            backgroundColor: areaColor,
        }]
    }));
  }, [theme]);

  const handleTriggerStartNewMeasurements = () => {
    if (!dmmGpibAddress) {
      showNotification('Please enter a GPIB address for the DMM.', 'error');
      return;
    }
    setPromptedSetName('');
    setIsPromptingSetName(true);
  };
  
  const handleConfirmSetName = async (nameFromPrompt) => {
    setIsPromptingSetName(false);
    setSelectedSetId(''); 
    setHistoricalMeasurements([]); 
    await startDMMMeasurements(nameFromPrompt, numReadingsToTake, dmmGpibAddress);
  };

  const handleStopMeasurements = () => {
    if (isDmmMeasuring) {
        stopDMMMeasurements();
    }
  };

  const handleSetSelection = (event) => {
    const setId = event.target.value;
    if (isDmmMeasuring) {
      showNotification("Please stop current measurements before viewing a historical set.", "info");
      return;
    }
    setSelectedSetId(setId);
  };

  const handleDeleteSet = (setIdToDelete) => {
    const setToDeleteDetails = measurementSets.find(s => s.id.toString() === setIdToDelete.toString());
    setDeleteConfirmation({ isOpen: true, setId: setIdToDelete, setName: setToDeleteDetails ? setToDeleteDetails.name : `ID ${setIdToDelete}` });
  };

  const confirmDeleteSet = async () => {
    const { setId, setName } = deleteConfirmation;
    if (!setId) return;
    dismissNotification();
    try {
      await axios.delete(`${API_BASE_URL}/measurement_sets/${setId}/`);
      showNotification(`Set '${setName}' deleted successfully.`, 'success');
      fetchMeasurementSets();
      if (selectedSetId === setId.toString()) {
        setSelectedSetId('');
        setHistoricalMeasurements([]);
      }
    } catch (err) {
      showNotification(`Failed to delete set '${setName}'. ${err.response?.data?.detail || err.message}`, 'error');
    } finally {
      setDeleteConfirmation({ isOpen: false, setId: null, setName: '' });
    }
  };
  
  const chartOptions = useMemo(() => {
    const isDarkMode = theme === 'dark';
    const textColor = isDarkMode ? '#e2e8f0' : '#333';
    const gridColor = isDarkMode ? '#4a5568' : '#e0e0e0';
    const titleColor = isDarkMode ? '#ffffff' : '#2c3e50';

    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
            legend: {
                position: 'top',
                labels: { color: textColor }
            },
            title: {
                display: true,
                text: isDmmMeasuring && dmmActiveSetDetails ? `Live: ${dmmActiveSetDetails.name || 'Unnamed Set'} (ID: ${dmmActiveSetDetails.id})` : (selectedSetId && measurementSets.find(s => s.id.toString() === selectedSetId) ? `Set: ${measurementSets.find(s => s.id.toString() === selectedSetId).name}` : 'DMM Measurements'),
                color: titleColor,
                font: { size: 18 }
            }
        },
        scales: {
            x: {
                title: { display: true, text: 'Time', color: textColor },
                ticks: { color: textColor },
                grid: { color: gridColor }
            },
            y: {
                title: { display: true, text: 'Value', color: textColor },
                ticks: { color: textColor, callback: v => {
                    if (v === null || v === undefined) return '';
                    if ((Math.abs(v)<0.000001 && v!==0) || Math.abs(v)>100000) return v.toExponential(4);
                    return Number(v.toFixed(8));
                }},
                grid: { color: gridColor }
            }
        }
    };
  }, [theme, isDmmMeasuring, dmmActiveSetDetails, selectedSetId, measurementSets]);
  

  return (
    <div className="content-area dmm-manager-component">
        <Notification message={notification.message} type={notification.type} onDismiss={dismissNotification} key={notification.key} />
        {deleteConfirmation.isOpen && ( <ConfirmationDialog title="Confirm Deletion" message={`Delete set "${deleteConfirmation.setName}"?`} onConfirm={confirmDeleteSet} onCancel={() => setDeleteConfirmation({isOpen: false, setId: null, setName: ''})}/> )}
        <SetNamePromptDialog isOpen={isPromptingSetName} currentSetName={promptedSetName} onSetNameChange={(e) => setPromptedSetName(e.target.value)} onConfirm={handleConfirmSetName} onCancel={() => setIsPromptingSetName(false)} />

        <div className="form-section">
            <label htmlFor="set-select">Select Measurement Set:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <select id="set-select" value={selectedSetId} onChange={handleSetSelection} disabled={isDmmMeasuring || isLoadingSets}>
                <option value="">-- Select a Set (Historical View) --</option>
                {isLoadingSets ? <option disabled>Loading...</option> :
                measurementSets.map(set => (
                    <option key={set.id} value={set.id}>
                    {set.name} (ID: {set.id}) - {new Date(set.created_at).toLocaleString()}
                    </option>
                ))
                }
            </select>
            {selectedSetId && !isDmmMeasuring && (
                <button onClick={() => handleDeleteSet(selectedSetId)} className="button button-danger">
                Delete Selected Set
                </button>
            )}
            </div>
        </div>

        <div className="form-section">
            <h4>Start New Measurement</h4>
            <div style={{ marginBottom: '15px', maxWidth: '400px' }}>
            <label htmlFor="dmm-gpib-address">DMM GPIB Address (e.g., 3458A):</label>
            <input type="text" id="dmm-gpib-address" value={dmmGpibAddress} 
                    onChange={(e) => setDmmGpibAddress(e.target.value)}
                    placeholder="e.g., GPIB0::22::INSTR"
                    disabled={isDmmMeasuring} />
            </div>
            <div style={{ marginBottom: '15px', maxWidth: '400px' }}>
            <label htmlFor="num-readings">Number of Readings (0 for indefinite):</label>
            <input type="number" id="num-readings" value={numReadingsToTake} 
                    onChange={(e) => setNumReadingsToTake(e.target.value ? parseInt(e.target.value) : 0)}
                    min="0" disabled={isDmmMeasuring} />
            </div>
            <div>
            {!isDmmMeasuring ? (
                <button onClick={handleTriggerStartNewMeasurements} className="button button-success" disabled={isLoadingSets || dmmWebSocketStatus === 'Connecting...'}>
                Start New Measurement Set
                </button>
            ) : (
                <button onClick={handleStopMeasurements} className="button button-warning">
                Stop Current Measurements (Set: {dmmActiveSetDetails?.name || 'New Set'})
                </button>
            )}
            </div>
        </div>
        
        {isLoadingMeasurements && !isDmmMeasuring && <p style={{ margin: '15px 0' }}>Loading historical measurements...</p>}

        <div className="chart-container" style={{marginTop: '20px'}}>
            <div style={{ width: '100%', height: '450px', position: 'relative' }}>
            <Line options={chartOptions} data={chartData} />
            </div>
        </div>
        <p style={{ marginTop: '15px', fontSize: '0.9em' }}>
            DMM WebSocket Status: {dmmWebSocketStatus}
            {isDmmMeasuring && dmmActiveSetDetails && ` | Active Set: ${dmmActiveSetDetails.name || 'Unnamed'} (ID: ${dmmActiveSetDetails.id})`}
            {isDmmMeasuring && dmmActiveSetDetails?.targetReadings > 0 && ` | Readings: ${dmmData.length} / ${dmmActiveSetDetails.targetReadings}`}
            {isDmmMeasuring && dmmActiveSetDetails?.targetReadings === 0 && ` | Readings: ${dmmData.length} (Continuous)`}
        </p>
        {dmmWebSocketStatus.startsWith('Disconnected') || dmmWebSocketStatus.startsWith('Error') ? (
            <button onClick={() => connectDmmWebSocket(dmmGpibAddress)} className="button button-secondary" style={{marginTop: '5px'}}>
            Reconnect DMM WS
            </button>
        ) : null}
    </div>
  );
}

export default DMMMeasurementManager;