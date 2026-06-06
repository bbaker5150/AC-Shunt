import React from "react";
import ReactDOM from "react-dom";
import { useFloatingWindow } from "../../hooks/useFloatingWindow";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faInfoCircle, 
  faExclamationTriangle, 
  faCheck, 
  faTimes
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
  const windowWidth = Math.min(420, window.innerWidth - 32);
  const safeInitialPosition = {
    x: Math.max(16, (window.innerWidth - windowWidth) / 2),
    y: Math.max(88, Math.min(window.innerHeight / 3, window.innerHeight - 280)),
  };

  const { position, handleMouseDown } = useFloatingWindow({
    isOpen,
    defaultWidth: windowWidth,
    defaultHeight: "auto",
    initialPosition: safeInitialPosition,
  });

  if (!isOpen) return null;

  // Determine Icon & Color based on Title keywords
  let icon = faInfoCircle;
  let tone = "info";
  
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("delete") || lowerTitle.includes("warning") || lowerTitle.includes("error")) {
    icon = faExclamationTriangle;
    tone = "danger";
  } else if (lowerTitle.includes("success") || lowerTitle.includes("saved")) {
    icon = faCheck;
    tone = "success";
  }

  return ReactDOM.createPortal(
    <div
      className={`notification-window floating-window-content notification-window--${tone}`}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 3001,
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="notification-modal-title"
    >
      <div
        className="window-header"
        onMouseDown={handleMouseDown}
      >
        <div className="notification-window-heading">
          <span className="notification-window-icon">
            <FontAwesomeIcon icon={icon} />
          </span>
          <div>
            <span className="notification-window-eyebrow">
              {tone === "danger" ? "Confirmation required" : "Notification"}
            </span>
            <h3 id="notification-modal-title">{title}</h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="modal-close-button"
          title="Close"
          aria-label="Close"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <div className="window-body">
        <p>{message}</p>

        <div className="notification-window-actions">
          {onConfirm && (
            <button
              className={`notification-window-confirm notification-window-confirm--${tone}`}
              onClick={onConfirm}
            >
              {confirmText}
              {isIconConfirm && <FontAwesomeIcon icon={faCheck} />}
            </button>
          )}
          
          {!onConfirm && (
            <button className="notification-window-confirm" onClick={onClose}>
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
