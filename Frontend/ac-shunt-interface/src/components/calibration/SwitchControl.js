// src/components/calibration/SwitchControl.js
import React from 'react';
import { FaBolt, FaWaveSquare, FaQuestionCircle, FaExclamationTriangle } from 'react-icons/fa';
import { useInstruments } from '../../contexts/InstrumentContext';

const StatusDisplay = ({ icon, text }) => (
    <div className='switch-status-item active'>
        {icon}
        <span style={{marginLeft: '8px'}}>{text}</span>
    </div>
);

const SwitchControl = () => {
    const { switchStatus } = useInstruments(); 

    const renderStatus = () => {
        if (!switchStatus.isConnected) {
            return <StatusDisplay icon={<FaExclamationTriangle />} text={switchStatus.status} />;
        }
        
        switch (switchStatus.status) {
            case 'AC':
                return <StatusDisplay icon={<FaWaveSquare />} text="AC Source Active" />;
            case 'DC':
                return <StatusDisplay icon={<FaBolt />} text="DC Source Active" />;
            case 'Error':
                return <StatusDisplay icon={<FaExclamationTriangle />} text="Connection Error" />;
            default:
                return <StatusDisplay icon={<FaQuestionCircle />} text="Unknown State" />;
        }
    };

    return (
        <div className="switch-control-container summary-item" style={{ textAlign: 'left' }}>
            <strong>Source Switch Status:</strong>
            <div className={`switch-control-status ${!switchStatus.isConnected ? 'disconnected' : ''}`} style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center' }}>
                {renderStatus()}
            </div>
        </div>
    );
};

export default SwitchControl;