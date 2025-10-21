/**
 * @file InstrumentStatusPanel.js
 * @brief Displays the status of connected hardware instruments and allows role assignment.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';
import { FaSave, FaUndo, FaTimes } from 'react-icons/fa';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const ASSIGNABLE_MODELS = ['34420A', '3458A', '5790B'];
const ACDC_ASSIGNABLE_MODELS = ['5730A'];
const AMPLIFIER_MODELS = ['8100']; // Added for the 8100 Amplifier
const SUPPORTED_STATUS_MODELS = ['5730', '5790'];
const SWITCH_DRIVER_MODELS = ['11713C'];

const statusBitDescriptions = {
    OPER: "Operating", EXTGARD: "External Guard", EXTSENS: "External Sensing", BOOST: "Boost Active",
    RCOMP: "R-Comp Active", RLOCK: "Range Locked", PSHIFT: "Phase Shift", PLOCK: "Phase Locked",
    OFFSET: "Offset Active", SCALE: "Scaling Active", WBND: "Wideband Active", REMOTE: "Remote",
    SETTLED: "Settled", ZERO_CAL: "Zero Cal Needed", AC_XFER: "AC/DC Transfer", UNUSED_15: "Unused"
};

function InstrumentStatusPanel({ showNotification }) {
    const {
        selectedSessionId, instrumentStatuses, isFetchingStatuses, getInstrumentStatus,
        discoveredInstruments, setDiscoveredInstruments,
        stdInstrumentAddress, setStdInstrumentAddress, stdReaderModel, setStdReaderModel, stdReaderSN, setStdReaderSN,
        tiInstrumentAddress, setTiInstrumentAddress, tiReaderModel, setTiReaderModel, tiReaderSN, setTiReaderSN,
        acSourceAddress, setAcSourceAddress, acSourceSN, setAcSourceSN, dcSourceAddress, setDcSourceAddress, dcSourceSN, setDcSourceSN,
        switchDriverAddress, setSwitchDriverAddress, switchDriverModel, setSwitchDriverModel, switchDriverSN, setSwitchDriverSN,
        amplifierAddress, setAmplifierAddress, amplifierSN, setAmplifierSN, // Added for Amplifier
    } = useInstruments();

    const [isScanning, setIsScanning] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [activeWorkstationIp, setActiveWorkstationIp] = useState('');
    const [localIp, setLocalIp] = useState('');
    const [editingIp, setEditingIp] = useState(null);
    const [editingName, setEditingName] = useState('');

    useEffect(() => {
        if (selectedSessionId) {
            const savedInstruments = localStorage.getItem(`discoveredInstruments`);
            if (savedInstruments) {
                setDiscoveredInstruments(JSON.parse(savedInstruments));
            } else {
                setDiscoveredInstruments([]);
            }
        } else {
            setDiscoveredInstruments([]);
        }
    }, [selectedSessionId, setDiscoveredInstruments]);

    useEffect(() => {
        if (discoveredInstruments.length > 0 && Object.keys(instrumentStatuses).length === 0) {
            discoveredInstruments.forEach(inst => {
                const modelMatch = inst.identity.match(/(\d{4}[A-Z]?)/);
                const model = modelMatch ? modelMatch[0] : null;

                if (model && inst.address && SUPPORTED_STATUS_MODELS.some(supported => model.startsWith(supported))) {
                    getInstrumentStatus(model, inst.address);
                }
            });
        }
    }, [discoveredInstruments, getInstrumentStatus, instrumentStatuses]);

    const workstations = useMemo(() => {
        const wsMap = new Map();
        discoveredInstruments.forEach(inst => {
            const visaMatch = inst.address.match(/visa:\/\/([0-9.]+)(:[0-9]+)?/i);
            const gpibMatch = inst.address.match(/GPIB\d*::\d+::INSTR/i);

            if (visaMatch && visaMatch[1]) {
                const ip = visaMatch[1];
                if (!wsMap.has(ip)) {
                    const customName = localStorage.getItem(`workstationName_${ip}`);
                    const isLocal = ip === localIp;
                    const displayName = customName || (isLocal ? 'Local Workstation' : ip);

                    wsMap.set(ip, {
                        name: displayName,
                        instruments: []
                    });
                }
                wsMap.get(ip).instruments.push(inst);
            } else if (gpibMatch) {
                const localWorkstationKey = 'local';
                if (!wsMap.has(localWorkstationKey)) {
                    wsMap.set(localWorkstationKey, {
                        name: 'Local Workstation',
                        instruments: []
                    });
                }
                wsMap.get(localWorkstationKey).instruments.push(inst);
            }
        });
        return Array.from(wsMap.entries()).map(([ip, data]) => ({ ip, ...data }));
    }, [discoveredInstruments, localIp]);

    useEffect(() => {
        if (workstations.length > 0 && !workstations.some(ws => ws.ip === activeWorkstationIp)) {
            setActiveWorkstationIp(workstations[0].ip);
        } else if (workstations.length === 0) {
            setActiveWorkstationIp('');
        }
    }, [workstations, activeWorkstationIp]);

    const resetInstrumentAddress = async () => {
        setStdInstrumentAddress(null);
        setStdReaderModel(null);
        setStdReaderSN(null);
        setTiInstrumentAddress(null);
        setTiReaderModel(null);
        setTiReaderSN(null);
        setAcSourceSN(null);
        setAcSourceAddress(null);
        setDcSourceSN(null);
        setDcSourceAddress(null);
        setAmplifierSN(null);
        setAmplifierAddress(null); // Added for Amplifier

        const payload = {
            test_reader_model: null,
            test_reader_serial: null,
            test_reader_address: null,
            standard_reader_model: null,
            standard_reader_serial: null,
            standard_reader_address: null,
            ac_source_serial: null,
            ac_source_address: null,
            dc_source_serial: null,
            dc_source_address: null,
            amplifier_serial: null,
            amplifier_address: null, // Added for Amplifier
        };

        try {
            await axios.patch(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`, payload);
        } catch (error) {
            console.error('Failed to reset instrument addresses:', error);
        }
    };

    const handleInitializeInstruments = async () => {
        if (!selectedSessionId) {
            showNotification("Please select a session first.", "warning");
            return;
        }
        setIsInitializing(true);
        try {
            const response = await axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/initialize-instruments/`);
            if (response.data.errors && response.data.errors.length > 0) {
                const errorMessages = response.data.errors.join('\n');
                showNotification(`Initialization completed with errors:\n${errorMessages}`, 'warning');
            } else {
                showNotification(response.data.status, 'success');
            }
        } catch (error) {
            const errorMessage = error.response?.data?.detail || "An unexpected error occurred during initialization.";
            showNotification(`Initialization failed: ${errorMessage}`, 'error');
            console.error("Initialization error:", error);
        } finally {
            setIsInitializing(false);
        }
    };

    const handleScanInstruments = async () => {
        setIsScanning(true);
        setDiscoveredInstruments([]);

        try {
            const response = await axios.get(`${API_BASE_URL}/instruments/discover/`);
            const instruments = Array.isArray(response.data.instruments) ? response.data.instruments : [];

            const info = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`);

            const testReaderAddress = info.data.test_reader_address;
            const standardReaderAddress = info.data.standard_reader_address;
            const acSourceAddress = info.data.ac_source_address;
            const dcSourceAddress = info.data.dc_source_address;

            const infoContainsVisa =
                (testReaderAddress && testReaderAddress.startsWith("visa://")) ||
                (standardReaderAddress && standardReaderAddress.startsWith("visa://")) ||
                (acSourceAddress && acSourceAddress.startsWith("visa://")) ||
                (dcSourceAddress && dcSourceAddress.startsWith("visa://"));

            const instrumentsContainNonVisa = instruments.some(instrument => instrument.address && !instrument.address.startsWith("visa://"));

            const infoContainsNonVisa = (testReaderAddress && !testReaderAddress.startsWith("visa://")) ||
                (standardReaderAddress && !standardReaderAddress.startsWith("visa://")) ||
                (acSourceAddress && !acSourceAddress.startsWith("visa://")) ||
                (dcSourceAddress && !dcSourceAddress.startsWith("visa://"));

            const instrumentsContainVisa = instruments.some(instrument => instrument.address && instrument.address.startsWith("visa://"));

            if (
                (infoContainsVisa && instrumentsContainNonVisa) ||
                (infoContainsNonVisa && instrumentsContainVisa)
            ) {
                resetInstrumentAddress();
            }

            const serverIp = response.data.local_ip || '';

            setLocalIp(serverIp);
            setDiscoveredInstruments(instruments);

            localStorage.setItem(`discoveredInstruments`, JSON.stringify(instruments));

            instruments.forEach(inst => {
                const modelMatch = inst.identity.match(/(\d{4}[A-Z]?)/);
                const model = modelMatch ? modelMatch[0] : null;
                if (model && inst.address && SUPPORTED_STATUS_MODELS.some(supported => model.startsWith(supported))) {
                    getInstrumentStatus(model, inst.address);
                }
            });

            showNotification(`Scan complete. Found ${instruments.length} instrument(s).`, 'success');
        } catch (error) {
            showNotification('Failed to scan for instruments.', 'error');
        } finally {
            setIsScanning(false);
        }
    };

    const handleEditName = () => {
        const currentWs = workstations.find(ws => ws.ip === activeWorkstationIp);
        if (currentWs) {
            setEditingIp(activeWorkstationIp);
            setEditingName(currentWs.name);
        }
    };

    const handleSaveName = () => {
        if (editingName.trim() === '') return showNotification("Workstation name cannot be empty.", "error");
        localStorage.setItem(`workstationName_${editingIp}`, editingName.trim());
        showNotification(`Workstation name for ${editingIp} saved.`, 'success');
        setEditingIp(null);
        setDiscoveredInstruments([...discoveredInstruments]);
    };

    const handleResetName = () => {
        localStorage.removeItem(`workstationName_${editingIp}`);
        showNotification(`Name for ${editingIp} has been reset.`, 'info');
        setEditingIp(null);
        setDiscoveredInstruments([...discoveredInstruments]);
    };

    const getModelFromIdentity = (identity) => {
        if (!identity) return null;
        const parts = identity.split(',');
        if (parts.length > 1 && parts[1]) return parts[1].trim();
        const allKnownModels = [...ASSIGNABLE_MODELS, ...ACDC_ASSIGNABLE_MODELS, ...AMPLIFIER_MODELS]; // Added Amplifier
        for (const model of allKnownModels) if (identity.includes(model)) return model;
        return identity.trim();
    };

    const getSNFromIdentity = (identity) => {
        if (!identity) return null;
        const parts = identity.split(',');
        if (parts.length > 2 && parts[1] && parts[2]) {
            if (parts[1].trim() === "34420A") {
                return "";
            } else {
                return parts[2].trim();
            }
        }
        return identity.trim();
    };

    const handleRoleAssignment = async (payload) => {
        if (!selectedSessionId) {
            showNotification("Please select a session before assigning roles.", "error");
            return;
        }
        try {
            await axios.patch(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`, payload);
            showNotification(`Role assignments updated.`, 'success');
        } catch (error) {
            showNotification('Failed to save role assignment.', 'error');
        }
    };

    const handleStdTiRoleChange = (instrument, role, isChecked) => {
        const newAddress = isChecked ? instrument.address : null;
        const newModel = isChecked ? getModelFromIdentity(instrument.identity) : null;
        const newSN = isChecked ? getSNFromIdentity(instrument.identity) : null;
        if (role === 'standard') {
            setStdInstrumentAddress(newAddress);
            setStdReaderModel(newModel);
            setStdReaderSN(newSN);
            handleRoleAssignment({ standard_reader_address: newAddress, standard_reader_model: newModel, standard_reader_serial: newSN });
        } else if (role === 'test') {
            setTiInstrumentAddress(newAddress);
            setTiReaderModel(newModel);
            setTiReaderSN(newSN);
            handleRoleAssignment({ test_reader_address: newAddress, test_reader_model: newModel, test_reader_serial: newSN });
        }
    };

    // Added for Amplifier
    const handleAmplifierRoleChange = (instrument, isChecked) => {
        const newAddress = isChecked ? instrument.address : null;
        const newSN = isChecked ? getSNFromIdentity(instrument.identity) : null;
        setAmplifierAddress(newAddress);
        setAmplifierSN(newSN);
        handleRoleAssignment({ amplifier_address: newAddress, amplifier_serial: newSN });
    };

    const handleAcDcCheckboxChange = (instrument, role, isChecked) => {
        const newAddress = isChecked ? instrument.address : null;
        const newSN = isChecked ? getSNFromIdentity(instrument.identity) : null;
        if (role === 'ac') {
            setAcSourceAddress(newAddress);
            setAcSourceSN(newSN);
            handleRoleAssignment({ ac_source_address: newAddress, ac_source_serial: newSN });
        } else if (role === 'dc') {
            setDcSourceAddress(newAddress);
            setDcSourceSN(newSN)
            handleRoleAssignment({ dc_source_address: newAddress, dc_source_serial: newSN });
        }
    };

    const handleSwitchDriverRoleChange = (instrument, isChecked) => {
        const newAddress = isChecked ? instrument.address : null;
        const newModel = isChecked ? getModelFromIdentity(instrument.identity) : null;
        const newSN = isChecked ? getSNFromIdentity(instrument.identity) : null;
        setSwitchDriverAddress(newAddress);
        setSwitchDriverModel(newModel);
        setSwitchDriverSN(newSN);
        handleRoleAssignment({ switch_driver_address: newAddress, switch_driver_model: newModel, switch_driver_serial: newSN });
    };

    const activeInstruments = workstations.find(ws => ws.ip === activeWorkstationIp)?.instruments || [];
    const hasAssignedInstruments = stdInstrumentAddress || tiInstrumentAddress || acSourceAddress || dcSourceAddress || switchDriverAddress || amplifierAddress;

    return (
        <div className="content-area instrument-status-panel">
            <div className="instrument-status-header">
                <h2>Instrument Status Overview</h2>
                <div className="header-buttons" style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={handleScanInstruments} className="button button-icon" disabled={isScanning}>
                        &#128269; {isScanning ? 'Scanning...' : 'Scan for Instruments'}
                    </button>
                    <button
                        type="button"
                        onClick={handleInitializeInstruments}
                        className="button button-icon button-secondary"
                        disabled={isInitializing || !selectedSessionId || !hasAssignedInstruments}
                        title="Send initialization commands to all assigned instruments"
                    >
                        💡 {isInitializing ? 'Initializing...' : 'Initialize Instruments'}
                    </button>
                </div>
            </div>
            <div className="test-set-details" style={{ flexWrap: 'wrap' }}>
                {stdInstrumentAddress && <div><strong>Standard DMM:</strong> {stdReaderModel || ''} {stdReaderSN && `S/N ${stdReaderSN}`} ({stdInstrumentAddress})</div>}
                {tiInstrumentAddress && <div><strong>TI DMM:</strong> {tiReaderModel || ''} {tiReaderSN && `S/N ${tiReaderSN}`} ({tiInstrumentAddress})</div>}
                {acSourceAddress && <div><strong>AC Source:</strong> {acSourceSN && `S/N ${acSourceSN}`} ({acSourceAddress})</div>}
                {dcSourceAddress && <div><strong>DC Source:</strong> {dcSourceSN && `S/N ${dcSourceSN}`} ({dcSourceAddress})</div>}
                {amplifierAddress && <div><strong>Amplifier:</strong> {amplifierSN && `S/N ${amplifierSN}`} ({amplifierAddress})</div>}
                {switchDriverAddress && <div><strong>Switch Driver:</strong> {switchDriverModel || ''} {switchDriverSN && `S/N ${switchDriverSN}`} ({switchDriverAddress})</div>}
            </div>

            {workstations.length > 0 && (
                <div className="workstation-controls">
                    <div className="form-section" style={{ flexGrow: 1, margin: 0, minWidth: '250px' }}>
                        <label htmlFor="workstation-select">Active Workstation</label>
                        <select
                            id="workstation-select"
                            value={activeWorkstationIp}
                            onChange={(e) => setActiveWorkstationIp(e.target.value)}
                        >
                            {workstations.map(({ ip, name, instruments }) => (
                                <option key={ip} value={ip}>{`${name} (${instruments.length} instruments)`}</option>
                            ))}
                        </select>
                    </div>
                    <div className="workstation-editor">
                        {editingIp === activeWorkstationIp ? (
                            <>
                                <input type="text" value={editingName} onChange={e => setEditingName(e.target.value)} placeholder="Enter new name..." />
                                <button className="button button-small" onClick={handleSaveName}>
                                    <FaSave /> Save
                                </button>
                                <button className="button button-secondary button-small" onClick={handleResetName}>
                                    <FaUndo /> Reset
                                </button>
                                <button className="button button-secondary button-small" onClick={() => setEditingIp(null)}>
                                    <FaTimes /> Cancel
                                </button>
                            </>
                        ) : (
                            <button  onClick={handleEditName} disabled={!activeWorkstationIp}>
                                ✏️ Rename Workstation
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="status-list">
                {activeInstruments.length > 0 ? (
                    activeInstruments.map(inst => {
                        const status = instrumentStatuses[inst.address];
                        const isFetching = isFetchingStatuses[inst.address];
                        let isConnected = status && status.wsConnectionState === 'Status Received' && !status.error;
                        const isAssignable = ASSIGNABLE_MODELS.some(m => inst.identity.includes(m));
                        const isAcDcAssignable = ACDC_ASSIGNABLE_MODELS.some(m => inst.identity.includes(m));
                        const isAmplifierAssignable = AMPLIFIER_MODELS.some(m => inst.identity.includes(m)); // Added for Amplifier
                        const isStatusSupported = SUPPORTED_STATUS_MODELS.some(m => inst.identity.includes(m));
                        const isSwitchDriverAssignable = SWITCH_DRIVER_MODELS.some(m => inst.identity.includes(m));

                        const parts = inst.identity.split(',');
                        let model = '';
                        if (parts.length > 1 && parts[1]) {
                            model = parts[1].trim();
                        }
                        if (model === "34420A" || model === "8100" || model === "11713C") {
                            isConnected = true;
                        }

                        return (
                            <div key={inst.address} className="status-card">
                                <div className="status-card-header">
                                    <div>
                                        <p className="instrument-identity">{inst.identity}</p>
                                        <p className="instrument-address">{inst.address}</p>
                                    </div>
                                    <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
                                        <span className="status-badge-icon">●</span>
                                        {isConnected ? 'Connected' : 'Disconnected'}
                                    </div>
                                </div>
                                {isAssignable && (
                                    <div className="role-assignment" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <label style={{ fontWeight: '500' }}>Assign Reader Role:</label>
                                        <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="checkbox" id={`std-role-${inst.address}`} checked={stdInstrumentAddress === inst.address} onChange={(e) => handleStdTiRoleChange(inst, 'standard', e.target.checked)} disabled={!selectedSessionId || !isConnected || (stdInstrumentAddress && stdInstrumentAddress !== inst.address)} />
                                            <label htmlFor={`std-role-${inst.address}`} style={{ marginBottom: 0 }}>Standard</label>
                                        </div>
                                        <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="checkbox" id={`test-role-${inst.address}`} checked={tiInstrumentAddress === inst.address} onChange={(e) => handleStdTiRoleChange(inst, 'test', e.target.checked)} disabled={!selectedSessionId || !isConnected || (tiInstrumentAddress && tiInstrumentAddress !== inst.address)} />
                                            <label htmlFor={`test-role-${inst.address}`} style={{ marginBottom: 0 }}>Test Instrument</label>
                                        </div>
                                    </div>
                                )}
                                {isAcDcAssignable && (
                                    <div className="role-assignment" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <label style={{ fontWeight: '500' }}>Assign Source Function:</label>
                                        <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="checkbox" id={`ac-role-${inst.address}`} checked={acSourceAddress === inst.address} onChange={(e) => handleAcDcCheckboxChange(inst, 'ac', e.target.checked)} disabled={!selectedSessionId || !isConnected || (acSourceAddress && acSourceAddress !== inst.address)} />
                                            <label htmlFor={`ac-role-${inst.address}`} style={{ marginBottom: 0 }}>AC Source</label>
                                        </div>
                                        <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="checkbox" id={`dc-role-${inst.address}`} checked={dcSourceAddress === inst.address} onChange={(e) => handleAcDcCheckboxChange(inst, 'dc', e.target.checked)} disabled={!selectedSessionId || !isConnected || (dcSourceAddress && dcSourceAddress !== inst.address)} />
                                            <label htmlFor={`dc-role-${inst.address}`} style={{ marginBottom: 0 }}>DC Source</label>
                                        </div>
                                    </div>
                                )}
                                {/* Added for Amplifier */}
                                {isAmplifierAssignable && (
                                    <div className="role-assignment" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <label style={{ fontWeight: '500' }}>Assign Amplifier Role:</label>
                                        <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="checkbox" id={`amp-role-${inst.address}`} checked={amplifierAddress === inst.address} onChange={(e) => handleAmplifierRoleChange(inst, e.target.checked)} disabled={!selectedSessionId || !isConnected || (amplifierAddress && amplifierAddress !== inst.address)} />
                                            <label htmlFor={`amp-role-${inst.address}`} style={{ marginBottom: 0 }}>Amplifier</label>
                                        </div>
                                    </div>
                                )}
                                {isSwitchDriverAssignable && (
                                    <div className="role-assignment" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <label style={{ fontWeight: '500' }}>Assign Utility Role:</label>
                                        <div className="checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="checkbox" id={`switch-driver-role-${inst.address}`} checked={switchDriverAddress === inst.address} onChange={(e) => handleSwitchDriverRoleChange(inst, e.target.checked)} disabled={!selectedSessionId || !isConnected || (switchDriverAddress && switchDriverAddress !== inst.address)} />
                                            <label htmlFor={`switch-driver-role-${inst.address}`} style={{ marginBottom: 0 }}>Switch Driver</label>
                                        </div>
                                    </div>
                                )}
                                {isStatusSupported && (
                                    <div className="status-card-body">
                                        {isFetching && <p>Fetching status details...</p>}
                                        {status?.decoded && !status.error && (
                                            <>
                                                <h4 style={{ marginTop: 0, marginBottom: '10px' }}>Active Status Flags</h4>
                                                <ul className="status-flags-list">
                                                    {Object.entries(status.decoded).filter(([, value]) => value === true).length > 0 ?
                                                        Object.entries(status.decoded).filter(([, value]) => value === true).map(([key]) => (
                                                            <li key={key}><span className="status-flag-icon">●</span>{statusBitDescriptions[key] || key}</li>
                                                        )) : <li>No active status flags.</li>
                                                    }
                                                </ul>
                                            </>
                                        )}
                                        {status?.error && <p>Could not retrieve status flags.</p>}
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <p className="no-instruments-text">{isScanning ? 'Scanning...' : `No instruments found. Click "Scan for Instruments" to begin.`}</p>
                )}
            </div>
        </div>
    );
}

export default InstrumentStatusPanel;