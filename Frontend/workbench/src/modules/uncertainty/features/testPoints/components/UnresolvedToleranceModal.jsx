import React from "react";
import ReactDOM from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { getToleranceSummary } from "../../../utils/uncertaintyMath";

const UnresolvedToleranceModal = ({ isOpen, matches, onSelect, onClose, instrumentName }) => {
  if (!isOpen || !matches || matches.length === 0) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal-content" style={{ width: '500px' }}>
        <div className="modal-header">
          <h3>Select Tolerance Range</h3>
        </div>
        
        <div className="modal-body" style={{ padding: '15px 0' }}>
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                marginBottom: '15px', 
                color: 'var(--text-color-secondary)',
                fontSize: '0.9rem' 
            }}>
                <FontAwesomeIcon icon={faInfoCircle} />
                <p style={{ margin: 0 }}>
                    The instrument <strong>{instrumentName}</strong> has multiple specifications that fit this measurement point. Please select the correct one:
                </p>
            </div>

            <div className="selection-list">
                {matches.map((match, index) => (
                    <button
                        key={match.id || index}
                        className="selection-item"
                        onClick={() => onSelect(match)}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            padding: '12px',
                            marginBottom: '8px',
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textAlign: 'left'
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                Range: {match.rangeInfo}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-color-muted)' }}>
                                {getToleranceSummary(match.tolerance)}
                            </div>
                        </div>
                        <div style={{ color: 'var(--primary-color)' }}>
                            Select
                        </div>
                    </button>
                ))}
            </div>
        </div>

        <div className="modal-actions">
           <button className="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UnresolvedToleranceModal;
