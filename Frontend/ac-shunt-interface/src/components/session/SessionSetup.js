/**
 * @file SessionSetup.js
 * @brief A view component for session management.
 * * This component orchestrates the rendering of the SessionManager and
 * SessionDetailsForm components, allowing users to manage session data
 * from a single screen. Loads shunt and TVC serials from the corrections
 * API so the session form can suggest them alongside saved field history.
 */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../constants/constants";
import SessionManager from "./SessionManager";
import SessionDetailsForm from "./SessionDetailsForm";

/**
 * @brief Renders the main view for session management.
 * @param {object} props - Component props.
 * @param {Array} props.sessionsList - The list of all calibration sessions.
 * @param {boolean} props.isLoadingSessions - Flag indicating if sessions are being loaded.
 * @param {Function} props.showNotification - Function to display a notification.
 * @param {Function} props.fetchSessionsList - Function to refresh the sessions list.
 */
function SessionSetup({ sessionsList, isLoadingSessions, showNotification, fetchSessionsList, isRemoteViewer }) {
  const [shuntSerials, setShuntSerials] = useState([]);
  const [tvcSerials, setTvcSerials] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [shRes, tvcRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/shunts/`),
          axios.get(`${API_BASE_URL}/tvcs/`),
        ]);
        if (cancelled) return;
        const sh = shRes.data || [];
        const tv = tvcRes.data || [];
        
        // Formats AC Shunts to include the current rating (e.g., "450274734 (10mA)")
        setShuntSerials(
          [...new Set(sh.map((r) => {
            const serial = String(r.serial_number ?? "").trim();
            if (!serial) return null;
            
            if (r.current !== undefined && r.current !== null) {
              const amps = parseFloat(r.current);
              if (!isNaN(amps)) {
                const currentStr = amps < 1 ? `${amps * 1000}mA` : `${amps}A`;
                return `${serial} (${currentStr})`;
              }
            }
            return serial;
          }).filter(Boolean))]
        );

        // TVCs do not need a current rating
        setTvcSerials(
          [...new Set(tv.map((r) => String(r.serial_number ?? "").trim()).filter(Boolean))]
        );
      } catch {
        if (!cancelled) {
          setShuntSerials([]);
          setTvcSerials([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="session-setup-container">
      <div className="session-setup-manager-pane">
        <SessionManager
          sessionsList={sessionsList}
          isLoadingSessions={isLoadingSessions}
          showNotification={showNotification}
          fetchSessionsList={fetchSessionsList}
          isRemoteViewer={isRemoteViewer}
        />
      </div>
      <div className="session-setup-details-pane">
        <SessionDetailsForm
          sessionsList={sessionsList}
          fetchSessionsList={fetchSessionsList}
          showNotification={showNotification}
          isRemoteViewer={isRemoteViewer}
          shuntSerials={shuntSerials}
          tvcSerials={tvcSerials}
        />
      </div>
    </div>
  );
}

export default SessionSetup;