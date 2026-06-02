// src/modules/uncertainty/components/UncertaintyMain.jsx
//
// Placeholder landing view for the Uncertainty Budget module. Renders a
// simple "coming soon" panel so the /uncertainty route mounts cleanly. The
// global WorkbenchTopBar (window chrome + return-to-launcher) is provided by
// the shell above this subtree, so this component only owns its own content.
import React from "react";
import { FaCalculator } from "react-icons/fa";

export default function UncertaintyMain() {
  return (
    <div className="uncertainty-module">
      <div className="uncertainty-placeholder" role="status" aria-live="polite">
        <span className="uncertainty-placeholder-icon" aria-hidden>
          <FaCalculator />
        </span>
        <h1 className="uncertainty-placeholder-title">Uncertainty Budget</h1>
        <p className="uncertainty-placeholder-subtitle">Coming soon</p>
      </div>
    </div>
  );
}
