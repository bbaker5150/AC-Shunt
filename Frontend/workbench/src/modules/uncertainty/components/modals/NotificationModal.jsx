import React from "react";
import ReactDOM from "react-dom";
import { useFloatingWindow } from "../../hooks/useFloatingWindow";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faInfoCircle, 
  faExclamationTriangle, 
  faCheck, 
  faTimes, 
  faBell 
} from "@fortawesome/free-solid-svg-icons";

const NotificationModal = ({ 
  isOpen, 
  onClose, 
  title = "Notification", 
  message, 
  onConfirm, 
  confirmText = "OK",
  isIconConfirm = false
}) => {
  
  // Explicitly calculate initial position to ensure it spawns in a visible, safe area
  // (e.g., 1/3 down the screen, centered horizontally)
  const safeInitialPosition = {
      x: window.innerWidth / 2 - 200, // Center based on 400px width
      y: Math.max(100, window.innerHeight / 3) // Ensure at least 100px from top
  };

  const { position, handleMouseDown } = useFloatingWindow({
    isOpen,
    defaultWidth: 400,
    defaultHeight: "auto",
    initialPosition: safeInitialPosition // <--- FIXED: Passed correctly now
  });

  if (!isOpen) return null;

  // Determine Icon & Color based on Title keywords
  let icon = faInfoCircle;
  let headerColor = "var(--primary-color)";
  
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("delete") || lowerTitle.includes("warning") || lowerTitle.includes("error")) {
    icon = faExclamationTriangle;
    headerColor = "var(--status-bad)";
  } else if (lowerTitle.includes("success") || lowerTitle.includes("saved")) {
    icon = faCheck;
    headerColor = "var(--status-good)";
  }

  return ReactDOM.createPortal(
    <div
      className="notification-window floating-window-content"
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        width: "400px",
        zIndex: 3001, 
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
      }}
    >
      {/* --- Draggable Header --- */}
      <div
        className="window-header"
        onMouseDown={handleMouseDown}
        style={{
          padding: "10px 15px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "move",
          backgroundColor: "var(--background-secondary)",
          userSelect: "none",
          borderTop: `3px solid ${headerColor}`
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-color)" }}>
          <FontAwesomeIcon icon={icon} style={{ color: headerColor }} />
          {title}
        </h3>
        <button
          onClick={onClose}
          className="modal-close-button"
          style={{ position: "static", fontSize: "1.1rem" }}
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* --- Body --- */}
      <div className="window-body" style={{ padding: "20px" }}>
        <p style={{ 
            marginTop: 0, 
            marginBottom: "20px", 
            lineHeight: "1.5", 
            color: "var(--text-color)",
            fontSize: "0.95rem"
        }}>
          {message}
        </p>

        {/* --- Actions --- */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          {onConfirm && (
            <button
              className="button"
              onClick={onConfirm}
              style={{
                backgroundColor: headerColor === "var(--status-bad)" ? "var(--status-bad)" : "var(--primary-color)",
                borderColor: headerColor === "var(--status-bad)" ? "var(--status-bad)" : "var(--primary-color)",
                minWidth: isIconConfirm ? "auto" : "100px",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
               {confirmText} 
               {isIconConfirm && <FontAwesomeIcon icon={faCheck} />}
            </button>
          )}
          
          {!onConfirm && (
            <button className="button button-secondary" onClick={onClose}>
                Close
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NotificationModal;