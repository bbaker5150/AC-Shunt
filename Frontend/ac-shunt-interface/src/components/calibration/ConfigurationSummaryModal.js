// src/components/Calibration/ConfigurationSummaryModal.js
import React from "react";
import { FaTimes } from "react-icons/fa";
import SwitchControl from "./SwitchControl"; // Import the SwitchControl component

const ConfigurationSummaryModal = ({
  isOpen,
  onClose,
  configurations,
  uniqueTestPoints,
  getInstrumentIdentity,
  stdInstrumentAddress,
  stdReaderModel,
  tiInstrumentAddress,
  tiReaderModel,
  acSourceAddress,
  dcSourceAddress,
  switchDriverAddress, // Add switchDriverAddress as a prop
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "800px" }}>
        <div className="modal-header">
          <button onClick={onClose} className="modal-close-button">
            <FaTimes />
          </button>
        </div>
        <div className="summary-modal-grid">
          <div className="summary-modal-section">
            <h4>Configuration Summary</h4>
            <div className="summary-item">
              <strong>AC Shunt Range:</strong>
              <span>{configurations.ac_shunt_range || "N/A"} A</span>
            </div>
            <div className="summary-item">
              <strong>Amplifier Range:</strong>
              <span>{configurations.amplifier_range || "N/A"} A</span>
            </div>
            <div className="summary-item">
              <strong>Input Current:</strong>
              <span>
                {uniqueTestPoints?.[0]?.current
                  ? `${uniqueTestPoints[0].current} A`
                  : "N/A"}
              </span>
            </div>
          </div>
          <div className="summary-modal-section">
            <h4>Sources & Readers</h4>
            <div className="summary-item">
              <strong>Standard Reader:</strong>
              <span>
                {getInstrumentIdentity(stdInstrumentAddress, stdReaderModel)}
              </span>
            </div>
            <div className="summary-item">
              <strong>Test Reader:</strong>
              <span>
                {getInstrumentIdentity(tiInstrumentAddress, tiReaderModel)}
              </span>
            </div>
            <div className="summary-item">
              <strong>AC Source:</strong>
              <span>{getInstrumentIdentity(acSourceAddress)}</span>
            </div>
            <div className="summary-item">
              <strong>DC Source:</strong>
              <span>{getInstrumentIdentity(dcSourceAddress)}</span>
            </div>
            {/* Conditionally render the SwitchControl if an address is provided */}
            {switchDriverAddress && (
              <div className="summary-item">
                <strong>Switch Control:</strong>
                <SwitchControl />
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
          <button onClick={onClose} className="button button-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationSummaryModal;