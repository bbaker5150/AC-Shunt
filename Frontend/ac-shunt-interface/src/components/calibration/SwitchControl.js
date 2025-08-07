// src/components/calibration/SwitchControl.js
import React, { useState, useEffect, useRef } from 'react';
import { FaBolt, FaWaveSquare } from 'react-icons/fa';

const SwitchControl = ({ model, gpibAddress, showNotification }) => {
    const [activeSource, setActiveSource] = useState('Unknown');
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);

    useEffect(() => {
        if (!model || !gpibAddress) return;
        const wsUrl = `ws://${window.location.hostname}:8000/ws/switch/${model}/${gpibAddress}/`;
        
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            console.log('Switch driver WebSocket connected.');
            setIsConnected(true);
        };

        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'connection_established' || data.type === 'source_changed' || data.type === 'status_update') {
                setActiveSource(data.active_source);
            }
        };

        ws.current.onclose = () => {
            console.log('Switch driver WebSocket disconnected.');
            setIsConnected(false);
            setActiveSource('Error');
        };

        ws.current.onerror = (error) => {
            console.error('Switch driver WebSocket error:', error);
            showNotification(`Could not connect to Switch Driver at ${gpibAddress}.`, 'error');
            setActiveSource('Error');
        };

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [model, gpibAddress, showNotification]);

    const handleSwitch = (targetSource) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                command: 'select_source',
                source: targetSource,
            }));
        }
    };
    
    const isAcActive = activeSource === 'AC';
    const isDcActive = activeSource === 'DC';

    return (
        <div className="switch-control-container">
            <span className="switch-label">Source Select:</span>
            <div className={`switch-control ${!isConnected ? 'disconnected' : ''}`}>
                <button 
                    className={`switch-button ${isAcActive ? 'active' : ''}`} 
                    onClick={() => handleSwitch('AC')}
                    disabled={!isConnected || isAcActive}
                >
                    <FaWaveSquare /> AC
                </button>
                <button 
                    className={`switch-button ${isDcActive ? 'active' : ''}`} 
                    onClick={() => handleSwitch('DC')}
                    disabled={!isConnected || isDcActive}
                >
                    <FaBolt /> DC
                </button>
            </div>
        </div>
    );
};

export default SwitchControl;