/**
 * @file InstrumentStatusPanel.js
 * @brief Displays the status of connected hardware instruments and allows role assignment.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = 'http://127.0.0.1:8000/api';
const ASSIGNABLE_MODELS = ['34420A']; 
const ACDC_ASSIGNABLE_MODELS = ['5730A'];
const SUPPORTED_STATUS_MODELS = ['5730', '5790'];

const statusBitDescriptions = {
    OPER: "Operating", EXTGARD: "External Guard", EXTSENS: "External Sensing", BOOST: "Boost Active",
    RCOMP: "R-Comp Active", RLOCK: "Range Locked", PSHIFT: "Phase Shift", PLOCK: "Phase Locked",
    OFFSET: "Offset Active", SCALE: "Scaling Active", WBND: "Wideband Active", REMOTE: "Remote",
    SETTLED: "Settled", ZERO_CAL: "Zero Cal Needed", AC_XFER: "AC/DC Transfer", UNUSED_15: "Unused"
};

function InstrumentStatusPanel({ showNotification }) {
    const { 
        selectedSessionId,
        instrumentStatuses, 
        isFetchingStatuses, 
        getInstrumentStatus,
        stdInstrumentAddress, setStdInstrumentAddress,
        tiInstrumentAddress, setTiInstrumentAddress,
        acSourceAddress, setAcSourceAddress,
        dcSourceAddress, setDcSourceAddress
    } = useInstruments();
    const [discoveredInstruments, setDiscoveredInstruments] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [showRoleAssignWarning, setShowRoleAssignWarning] = useState(null);

    const handleScanInstruments = async () => {
        setIsScanning(true);
        setDiscoveredInstruments([]);
        try {
            const response = await axios.get(`${API_BASE_URL}/instruments/discover/`);
            if (Array.isArray(response.data)) {
                const instruments = response.data;
                setDiscoveredInstruments(instruments);
                instruments.forEach(inst => {
                    const modelMatch = inst.identity.match(/(\d{4}[A-Z]?)/);
                    const model = modelMatch ? modelMatch[0] : null;
                    if (model && inst.address && SUPPORTED_STATUS_MODELS.some(supported => model.startsWith(supported))) {
                        getInstrumentStatus(model, inst.address);
                    }
                });
                showNotification(`Scan complete. Found ${instruments.length} instrument(s).`, 'success');
            }
        } catch (error) {
            console.error("Failed to scan instruments", error);
            showNotification('Failed to scan for instruments.', 'error');
        } finally {
            setIsScanning(false);
        }
    };

    const handleRoleChange = async (instrument, newRole) => {
        if (!selectedSessionId) {
            showNotification("Please select or create a session before assigning roles.", "error");
            return;
        }

        let newStdAddress = stdInstrumentAddress;
        let newTiAddress = tiInstrumentAddress;

        if (newRole === 'standard') {
            newStdAddress = instrument.address;
            if (tiInstrumentAddress === instrument.address) newTiAddress = null; 
        } else if (newRole === 'test') {
            newTiAddress = instrument.address;
            if (stdInstrumentAddress === instrument.address) newStdAddress = null;
        } else { // Unassigning
            if (stdInstrumentAddress === instrument.address) newStdAddress = null;
            if (tiInstrumentAddress === instrument.address) newTiAddress = null;
        }

        setStdInstrumentAddress(newStdAddress);
        setTiInstrumentAddress(newTiAddress);
        
        try {
            const identityParts = instrument.identity.split(',');
            await axios.patch(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`, {
                standard_instrument_address: newStdAddress,
                test_instrument_address: newTiAddress,
                standard_instrument_model: newStdAddress ? identityParts[1] : null,
                standard_instrument_serial: newStdAddress ? identityParts[2] : null,
                test_instrument_model: newTiAddress ? identityParts[1] : null,
                test_instrument_serial: newTiAddress ? identityParts[2] : null,
            });
            showNotification(`Role assignments updated successfully.`, 'success');
        } catch (error) {
            showNotification('Failed to save role assignment to the database.', 'error');
            setStdInstrumentAddress(stdInstrumentAddress); // Revert on failure
            setTiInstrumentAddress(tiInstrumentAddress);
        }
    };

    const handleAcDcRoleChange = async (instrument, newRole) => {
        if (!selectedSessionId) {
            showNotification("Please select or create a session before assigning roles.", "error");
            return;
        }

        let newAcAddress = acSourceAddress;
        let newDcAddress = dcSourceAddress;

        if (newRole === 'ac') {
            newAcAddress = instrument.address;
            if (dcSourceAddress === instrument.address) newDcAddress = null;
        } else if (newRole === 'dc') {
            newDcAddress = instrument.address;
            if (acSourceAddress === instrument.address) newAcAddress = null;
        } else { // Unassigning
            if (acSourceAddress === instrument.address) newAcAddress = null;
            if (dcSourceAddress === instrument.address) newDcAddress = null;
        }

        setAcSourceAddress(newAcAddress);
        setDcSourceAddress(newDcAddress);
        
        try {
            await axios.patch(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`, {
                ac_source_address: newAcAddress,
                dc_source_address: newDcAddress,
            });
            showNotification(`Function assignments updated successfully.`, 'success');
        } catch (error) {
            showNotification('Failed to save function assignment to the database.', 'error');
            setAcSourceAddress(acSourceAddress); // Revert on failure
            setDcSourceAddress(dcSourceAddress);
        }
    };

    return (
        <div className="content-area instrument-status-panel">
            <div className="instrument-status-header">
                <h2>Instrument Status Overview</h2>
                <button type="button" onClick={handleScanInstruments} className="button" disabled={isScanning}>
                    {isScanning ? 'Scanning...' : 'Scan for Instruments'}
                </button>
            </div>
            <div className="status-list">
                <div className="test-set-details" style={{flexWrap: 'wrap'}}>
                    <div><strong>Standard Instrument:</strong> {stdInstrumentAddress || 'Not Assigned'}</div>
                    <div><strong>Test Instrument:</strong> {tiInstrumentAddress || 'Not Assigned'}</div>
                    <div><strong>AC Source:</strong> {acSourceAddress || 'Not Assigned'}</div>
                    <div><strong>DC Source:</strong> {dcSourceAddress || 'Not Assigned'}</div>
                </div>

                {discoveredInstruments.length > 0 ? (
                    discoveredInstruments.map(inst => {
                        const status = instrumentStatuses[inst.address];
                        const isFetching = isFetchingStatuses[inst.address];
                        const isAssignable = ASSIGNABLE_MODELS.some(m => inst.identity.includes(m));
                        const isAcDcAssignable = ACDC_ASSIGNABLE_MODELS.some(m => inst.identity.includes(m));
                        const isStatusSupported = SUPPORTED_STATUS_MODELS.some(m => inst.identity.includes(m));
                        
                        let currentRole = '';
                        if (inst.address === stdInstrumentAddress) currentRole = 'standard';
                        else if (inst.address === tiInstrumentAddress) currentRole = 'test';

                        let currentAcDcRole = '';
                        if (inst.address === acSourceAddress) currentAcDcRole = 'ac';
                        else if (inst.address === dcSourceAddress) currentAcDcRole = 'dc';

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
                                
                                {isAssignable && (
                                     <div className="role-assignment" style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', position: 'relative'}}
                                          onMouseEnter={() => !selectedSessionId && setShowRoleAssignWarning(inst.address + '_role')}
                                          onMouseLeave={() => setShowRoleAssignWarning(null)}>
                                        <label htmlFor={`role-${inst.address}`} style={{marginRight: '10px', fontWeight: '500'}}>Assign Role:</label>
                                        <select 
                                            id={`role-${inst.address}`}
                                            value={currentRole} 
                                            onChange={(e) => handleRoleChange(inst, e.target.value)}
                                            disabled={!selectedSessionId}
                                            style={{minWidth: '180px'}}
                                        >
                                            <option value="">- Unassigned -</option>
                                            <option value="standard" disabled={stdInstrumentAddress && stdInstrumentAddress !== inst.address}>Standard Instrument</option>
                                            <option value="test" disabled={tiInstrumentAddress && tiInstrumentAddress !== inst.address}>Test Instrument</option>
                                        </select>
                                        {showRoleAssignWarning === (inst.address + '_role') && !selectedSessionId && (
                                            <div className="tooltip" style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                backgroundColor: 'var(--error-color)',
                                                color: 'white',
                                                padding: '5px 10px',
                                                borderRadius: '4px',
                                                zIndex: 10,
                                                marginTop: '10px',
                                                fontSize: '0.85em'
                                            }}>
                                                Please select a session to assign a role.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isAcDcAssignable && (
                                     <div className="role-assignment" style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', position: 'relative'}}
                                          onMouseEnter={() => !selectedSessionId && setShowRoleAssignWarning(inst.address + '_func')}
                                          onMouseLeave={() => setShowRoleAssignWarning(null)}>
                                        <label htmlFor={`acdc-role-${inst.address}`} style={{marginRight: '10px', fontWeight: '500'}}>Assign Function:</label>
                                        <select 
                                            id={`acdc-role-${inst.address}`}
                                            value={currentAcDcRole} 
                                            onChange={(e) => handleAcDcRoleChange(inst, e.target.value)}
                                            disabled={!selectedSessionId}
                                            style={{minWidth: '180px'}}
                                        >
                                            <option value="">- Unassigned -</option>
                                            <option value="ac" disabled={acSourceAddress && acSourceAddress !== inst.address}>AC Source</option>
                                            <option value="dc" disabled={dcSourceAddress && dcSourceAddress !== inst.address}>DC Source</option>
                                        </select>
                                        {showRoleAssignWarning === (inst.address + '_func') && !selectedSessionId && (
                                            <div className="tooltip" style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                backgroundColor: 'var(--error-color)',
                                                color: 'white',
                                                padding: '5px 10px',
                                                borderRadius: '4px',
                                                zIndex: 10,
                                                marginTop: '10px',
                                                fontSize: '0.85em'
                                            }}>
                                                Please select a session to assign a function.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isStatusSupported && (
                                    <div className="status-card-body">
                                        {isFetching && <p className="fetching-text">Fetching status details...</p>}
                                        {status?.decoded && !status.error && (
                                             <>
                                                <h4 className="status-flags-header">Active Status Flags</h4>
                                                <ul className="status-flags-list">
                                                    {Object.entries(status.decoded).filter(([, value]) => value === true).length > 0 ?
                                                        Object.entries(status.decoded).filter(([, value]) => value === true).map(([key]) => (
                                                            <li key={key} className="status-flag-item">
                                                                <span className="status-flag-icon">●</span>
                                                                {statusBitDescriptions[key] || key}
                                                            </li>
                                                        )) : <li className="no-flags-text">No active status flags.</li>
                                                    }
                                                </ul>
                                            </>
                                        )}
                                        {status?.error && <p className="error-text">Could not retrieve status flags.</p>}
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <p className="no-instruments-text">Click "Scan for Instruments" to begin.</p>
                )}
            </div>
        </div>
    );
}

export default InstrumentStatusPanel;