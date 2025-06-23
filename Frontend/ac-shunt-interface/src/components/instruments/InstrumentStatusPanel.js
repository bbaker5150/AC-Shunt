/**
 * @file InstrumentStatusPanel.js
 * @brief Displays the status of connected hardware instruments.
 * * This component is responsible for discovering and displaying the real-time
 * status of connected instruments. It features a "Scan" button to detect
 * instruments via an API call. For each supported instrument found, it uses
 * the `getInstrumentStatus` function from the InstrumentContext to establish a
 * WebSocket connection and display active status flags, such as "Settled" or
 * "Remote".
 */
import React, { useState } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = 'http://127.0.0.1:8000/api';
const SUPPORTED_STATUS_MODELS = ['5730', '5790'];

const statusBitDescriptions = {
    OPER: "Operating", EXTGARD: "External Guard", EXTSENS: "External Sensing", BOOST: "Boost Active",
    RCOMP: "R-Comp Active", RLOCK: "Range Locked", PSHIFT: "Phase Shift", PLOCK: "Phase Locked",
    OFFSET: "Offset Active", SCALE: "Scaling Active", WBND: "Wideband Active", REMOTE: "Remote",
    SETTLED: "Settled", ZERO_CAL: "Zero Cal Needed", AC_XFER: "AC/DC Transfer", UNUSED_15: "Unused"
};

function InstrumentStatusPanel({ showNotification }) {
    const { instrumentStatuses, isFetchingStatuses, getInstrumentStatus } = useInstruments();
    const [discoveredInstruments, setDiscoveredInstruments] = useState([]);
    const [isScanning, setIsScanning] = useState(false);

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

    return (
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
                    const status = instrumentStatuses[inst.address];
                    const isFetching = isFetchingStatuses[inst.address];
                    const isSupported = SUPPORTED_STATUS_MODELS.some(m => inst.identity.includes(m));

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
                            {isSupported && (
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
                <p className="no-instruments-text">Scan for instruments to see their status.</p>
            )}
            </div>
        </div>
    );
}

export default InstrumentStatusPanel;