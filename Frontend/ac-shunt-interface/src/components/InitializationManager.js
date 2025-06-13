import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useInstruments } from '../contexts/InstrumentContext';

const API_BASE_URL = 'http://10.206.104.144:8000/api';

const Notification = ({ message, type, onDismiss }) => {
    if (!message) return null;
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

const InfoDialog = ({ isOpen, title, message, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{title}</h3>
                <p>{message}</p>
                <div className="modal-actions" style={{ justifyContent: 'center' }}>
                    <button onClick={onClose} className="button button-success">OK</button>
                </div>
            </div>
        </div>
    );
};

const statusBitDescriptions = {
    OPER: "Operating", EXTGARD: "External Guard", EXTSENS: "External Sensing", BOOST: "Boost Active",
    RCOMP: "R-Comp Active", RLOCK: "Range Locked", PSHIFT: "Phase Shift", PLOCK: "Phase Locked",
    OFFSET: "Offset Active", SCALE: "Scaling Active", WBND: "Wideband Active", REMOTE: "Remote",
    SETTLED: "Settled", ZERO_CAL: "Zero Cal Needed", AC_XFER: "AC/DC Transfer", UNUSED_15: "Unused"
};

const initialFormData = {
    sessionName: `Calibration Session - ${new Date().toLocaleString()}`,
    testInstrument: '', testInstrumentSerial: '',
    standardInstrumentAddress: '', 
    standardInstrumentIdentity: '',
    temperature: '', humidity: '', notes: '',
};

const SUPPORTED_STATUS_MODELS = ['5730', '5790']; 

function InitializationManager() {
    const {
        instrumentStatuses,
        isFetchingStatuses,
        getInstrumentStatus,
        selectedSessionId,
        setSelectedSessionId,
        setSelectedSessionName,
    } = useInstruments();

    const [formData, setFormData] = useState(initialFormData);
    const [isLoadingForm, setIsLoadingForm] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: 'info', key: 0 });
    const [sessionsList, setSessionsList] = useState([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, sessionId: null, sessionName: '' });
    const [infoDialog, setInfoDialog] = useState({ isOpen: false, title: '', message: '' });
    
    const [discoveredInstruments, setDiscoveredInstruments] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    
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

    const handleScanInstruments = async () => {
        setIsScanning(true);
        setDiscoveredInstruments([]);
        showNotification('Scanning for instruments...', 'info', 3000);
        try {
            const response = await axios.get(`${API_BASE_URL}/instruments/discover/`);
            if (Array.isArray(response.data)) {
                const instruments = response.data;
                setDiscoveredInstruments(instruments);
                showNotification(`Scan complete. Found ${instruments.length} instrument(s).`, 'success');
                instruments.forEach(inst => {
                    const modelMatch = inst.identity.match(/(\d{4}[A-Z]?)/);
                    const model = modelMatch ? modelMatch[0] : null;
                    if (model && inst.address && SUPPORTED_STATUS_MODELS.some(supported => model.startsWith(supported))) {
                        getInstrumentStatus(model, inst.address);
                    }
                });
            } else {
                showNotification('Scan returned unexpected data format.', 'error');
            }
        } catch (error) {
            const errMsg = error.response?.data?.error || 'Failed to scan for instruments.';
            showNotification(errMsg, 'error');
        } finally {
            setIsScanning(false);
        }
    };
    
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

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSessionSelectChange = (e) => {
        const sessionId = e.target.value;
        if (sessionId) {
            const session = sessionsList.find(s => s.id.toString() === sessionId);
            if (session) {
                setSelectedSessionName(session.session_name);
            }
        } else {
            setSelectedSessionName('');
        }
        setSelectedSessionId(sessionId || null);
    };

    const handleClearForm = useCallback((showMsg = true) => {
        setFormData(initialFormData);
        setSelectedSessionId(null);
        setSelectedSessionName('');
        dismissNotification();
        if (showMsg) showNotification('Form cleared.', 'info', 3000);
    }, [setSelectedSessionId, setSelectedSessionName, showNotification, dismissNotification]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoadingForm(true);
        dismissNotification();

        if (!formData.testInstrument || !formData.testInstrumentSerial || !formData.standardInstrumentIdentity || formData.temperature === '' || formData.humidity === '') {
            showNotification('Please fill all required fields.', 'error');
            setIsLoadingForm(false);
            return;
        }
        
        const payload = {
            session_name: formData.sessionName.trim() || `CalSession - ${new Date().toISOString()}`,
            test_instrument_model: formData.testInstrument,
            test_instrument_serial: formData.testInstrumentSerial,
            standard_instrument_model: formData.standardInstrumentIdentity,
            standard_instrument_serial: formData.standardInstrumentAddress,
            temperature: formData.temperature !== '' ? parseFloat(formData.temperature) : null,
            humidity: formData.humidity !== '' ? parseFloat(formData.humidity) : null,
            notes: formData.notes,
        };

        try {
            const response = await axios.post(`${API_BASE_URL}/calibration_sessions/`, payload);
            setInfoDialog({ isOpen: true, title: 'Save Successful', message: `Session "${response.data.session_name}" saved!` });
            fetchSessionsList();
            setSelectedSessionId(response.data.id);
            setSelectedSessionName(response.data.session_name);
        } catch (error) {
            let errMsg = error.response?.data?.detail || (typeof error.response?.data === 'object' ? JSON.stringify(error.response.data) : error.message) || 'Failed to save session.';
            showNotification(`Error: ${errMsg}`, 'error', 0);
        } finally {
            setIsLoadingForm(false);
        }
    };
    
    const handleDeleteSession = () => {
        if (!selectedSessionId) { showNotification("No session selected.", "info"); return; }
        const session = sessionsList.find(s => s.id.toString() === selectedSessionId.toString());
        if (session) setDeleteConfirmation({ isOpen: true, sessionId: selectedSessionId, sessionName: session.session_name });
        else showNotification("Could not find session to delete.", "error");
    };

    const confirmActualDelete = async () => {
        const { sessionId, sessionName } = deleteConfirmation;
        if (!sessionId) return;
        setIsLoadingForm(true);
        dismissNotification();
        try {
            await axios.delete(`${API_BASE_URL}/calibration_sessions/${sessionId}/`);
            setInfoDialog({ isOpen: true, title: 'Delete Successful', message: `Session "${sessionName}" deleted.` });
            handleClearForm(false);
            fetchSessionsList();
        } catch (error) {
            showNotification(`Failed to delete session "${sessionName}".`, 'error');
        } finally {
            setDeleteConfirmation({ isOpen: false, sessionId: null, sessionName: '' });
            setIsLoadingForm(false);
        }
    };

    const cancelDelete = () => setDeleteConfirmation({ isOpen: false, sessionId: null, sessionName: '' });
    const closeInfoDialog = () => setInfoDialog({ isOpen: false, title: '', message: '' });

    useEffect(() => { fetchSessionsList(); }, [fetchSessionsList]);
    
    useEffect(() => {
        if (!selectedSessionId) {
            setFormData(initialFormData);
            return;
        }
        setIsLoadingDetails(true);
        dismissNotification();
        axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`)
            .then(response => {
                const d = response.data;
                setFormData({
                    sessionName: d.session_name || '',
                    testInstrument: d.test_instrument_model || '',
                    testInstrumentSerial: d.test_instrument_serial || '',
                    standardInstrumentAddress: d.standard_instrument_serial || '',
                    standardInstrumentIdentity: d.standard_instrument_model || '',
                    temperature: d.temperature !== null ? d.temperature.toString() : '',
                    humidity: d.humidity !== null ? d.humidity.toString() : '',
                    notes: d.notes || '',
                });
                showNotification(`Loaded session: ${d.session_name}`, 'info', 3000);
            })
            .catch(error => {
                showNotification(`Failed to load session ${selectedSessionId}.`, 'error');
                handleClearForm(false);
            })
            .finally(() => setIsLoadingDetails(false));
    }, [selectedSessionId, showNotification, dismissNotification, handleClearForm]);
    
    const formRowStyle = { display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' };
    const columnStyle = { flex: '1', display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '300px' };

    return (
        <React.Fragment>
            {notification.message && <Notification message={notification.message} type={notification.type} onDismiss={dismissNotification} key={notification.key} />}
            {deleteConfirmation.isOpen && (<ConfirmationDialog title="Confirm Deletion" message={`Delete session "${deleteConfirmation.sessionName}"?`} onConfirm={confirmActualDelete} onCancel={cancelDelete} />)}
            {infoDialog.isOpen && (<InfoDialog isOpen={infoDialog.isOpen} title={infoDialog.title} message={infoDialog.message} onClose={closeInfoDialog} />)}
            
            <div className="content-area initialization-manager">
                 <h2>Calibration Session Information</h2>
                 <div className="form-section">
                     <label htmlFor="session-select">Calibration Session:</label>
                     <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                         <select id="session-select" value={selectedSessionId || ''} onChange={handleSessionSelectChange} disabled={isLoadingSessions || isLoadingDetails || isLoadingForm} style={{ flexGrow: 1 }}>
                             <option value="">-- Start New Session --</option>
                             {isLoadingSessions ? <option disabled>Loading...</option> : sessionsList.map(s => <option key={s.id} value={s.id}>{s.session_name} (ID: {s.id})</option>)}
                         </select>
                         <button type="button" onClick={() => handleClearForm(true)} className="button button-secondary" disabled={isLoadingForm || isLoadingDetails}>Reset</button>
                         {selectedSessionId && <button type="button" onClick={handleDeleteSession} className="button button-danger" disabled={isLoadingForm || isLoadingDetails}>Delete</button>}
                     </div>
                     {isLoadingDetails && <p>Loading details...</p>}
                 </div>

                 <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
                     <div style={formRowStyle}>
                         <div style={columnStyle}>
                             <div className="form-section"><label htmlFor="sessionName">Calibration Session Name:</label><input type="text" id="sessionName" name="sessionName" value={formData.sessionName} onChange={handleChange} disabled={isLoadingForm} required /></div>
                             <div className="form-section"><label htmlFor="testInstrument">Test Instrument:</label><input type="text" id="testInstrument" name="testInstrument" value={formData.testInstrument} onChange={handleChange} placeholder="e.g., Fluke, 5790B" disabled={isLoadingForm} required /></div>
                             <div className="form-section"><label htmlFor="testInstrumentSerial">Test Instrument Serial:</label><input type="text" id="testInstrumentSerial" name="testInstrumentSerial" value={formData.testInstrumentSerial} onChange={handleChange} placeholder="e.g., 5444504" disabled={isLoadingForm} required /></div>
                             <div className="form-section"><label htmlFor="standardInstrumentIdentity">Standard Instrument:</label><input type="text" id="standardInstrumentIdentity" name="standardInstrumentIdentity" value={formData.standardInstrumentIdentity} onChange={handleChange} placeholder="e.g., Fluke, 5730A" disabled={isLoadingForm} required /></div>
                         </div>
                         <div style={columnStyle}>
                             <div className="form-section"><label htmlFor="temperature">Temperature (°C):</label><input type="number" id="temperature" name="temperature" value={formData.temperature} onChange={handleChange} placeholder="e.g., 23.5" step="0.1" disabled={isLoadingForm} required /></div>
                             <div className="form-section"><label htmlFor="humidity">Humidity (%RH):</label><input type="number" id="humidity" name="humidity" value={formData.humidity} onChange={handleChange} placeholder="e.g., 45.2" step="0.1" min="0" max="100" disabled={isLoadingForm} required /></div>
                             <div className="form-section"><label htmlFor="notes">Notes:</label><textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} placeholder="Relevant notes..." rows="3" disabled={isLoadingForm} style={{ width: '100%', resize: 'vertical' }} /></div>
                         </div>
                     </div>
                     <button type="submit" className="button button-success" disabled={isLoadingForm || isLoadingDetails}>
                         {selectedSessionId ? 'Update Session' : 'Save as New Session'}
                     </button>
                 </form>
            </div>
            
            <div className="content-area instrument-status-panel">
                <div className="instrument-status-header">
                    <h2>Instrument Status Overview</h2>
                    <button type="button" onClick={handleScanInstruments} className="button button-secondary" disabled={isScanning}>
                        {isScanning ? 'Scanning...' : 'Scan for Instruments'}
                    </button>
                </div>
                <div className="status-list">
                {discoveredInstruments.length > 0 ? (
                    discoveredInstruments.map(inst => {
                        const modelMatch = inst.identity.match(/(\d{4}[A-Z]?)/);
                        const model = modelMatch ? modelMatch[0] : null;
                        const isSupported = model && SUPPORTED_STATUS_MODELS.some(supported => model.startsWith(supported));
                        
                        const status = instrumentStatuses[inst.address];
                        const isFetching = isFetchingStatuses[inst.address];
                        const hasReceivedStatus = status && status.wsConnectionState === 'Status Received';

                        return (
                            <div key={inst.address} className="status-card">
                                <div className="status-card-header">
                                    <div>
                                        <p className="instrument-identity">{inst.identity}</p>
                                        <p className="instrument-address">{inst.address}</p>
                                    </div>
                                    <div className="status-badge">
                                        <span className="status-badge-icon">●</span>
                                        Connected
                                    </div>
                                </div>
                                {isSupported && (isFetching || hasReceivedStatus) && (
                                    <div className="status-card-body">
                                        {isFetching && !hasReceivedStatus && <p className="fetching-text">Fetching status details...</p>}
                                        {status?.decoded && !status.error ? (
                                            <>
                                                <h4 className="status-flags-header">Active Status Flags <span className="raw-status-text">(Raw: {status.raw || 'N/A'})</span></h4>
                                                <ul className="status-flags-list">
                                                {Object.entries(status.decoded).filter(([, value]) => value === true).length > 0 ?
                                                    Object.entries(status.decoded)
                                                        .filter(([, value]) => value === true)
                                                        .map(([key]) => (
                                                            <li key={key} className="status-flag-item">
                                                                <span className="status-flag-icon">●</span>
                                                                {statusBitDescriptions[key] || key}
                                                            </li>
                                                        ))
                                                    : <li className="no-flags-text">No active status flags.</li>
                                                }
                                                </ul>
                                            </>
                                        ) : status?.error && <p className="error-text">Could not retrieve status flags: {status.error}</p>}
                                        
                                        <p className="last-checked-text">Last Checked: {status?.lastCheck || 'N/A'}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <p className="no-instruments-text">Scan for instruments to see their status.</p>
                )}
                </div>
            </div>
        </React.Fragment>
    );
}

export default InitializationManager;
