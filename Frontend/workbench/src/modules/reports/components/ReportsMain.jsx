// src/modules/reports/components/ReportsMain.jsx
//
// Placeholder landing view for the Report of Calibration module. Renders a
// simple "coming soon" panel so the /reports route mounts cleanly. The global
// WorkbenchTopBar (window chrome + return-to-launcher) is provided by the
// shell above this subtree, so this component only owns its own content.
import React from "react";
import { FaFileAlt } from "react-icons/fa";

export default function ReportsMain() {
  return (
    <div className="reports-module">
      <div className="reports-placeholder" role="status" aria-live="polite">
        <span className="reports-placeholder-icon" aria-hidden>
          <FaFileAlt />
        </span>
        <h1 className="reports-placeholder-title">Report of Calibration</h1>
        <p className="reports-placeholder-subtitle">Coming soon</p>
      </div>
    </div>
  );
}
