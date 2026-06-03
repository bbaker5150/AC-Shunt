import React from "react";

const RiskAnalysisDashboard = ({ results, onShowBreakdown, activeModals = [] }) => {
  if (!results) return null;
  
  const getPfaClass = (pfa) => {
    if (pfa > 5) return "status-bad";
    if (pfa > 2) return "status-warning";
    return "status-good";
  };

  const isActive = (key) => activeModals.includes(key);

  const nativeUnit = results.nativeUnit || "units";

  return (
    <div className="risk-analysis-container">
      <div className="risk-analysis-dashboard">
        <div
          className={`risk-card clickable ${isActive("inputs") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("inputs")}
        >
          <div
            className="risk-label"
            style={{
              fontWeight: "bold",
              fontSize: "1.1rem",
              marginBottom: "15px",
            }}
          >
            Key Calculation Inputs
          </div>
          <ul className="result-breakdown" style={{ marginTop: 0 }}>
            <li>
              <span className="label">
                True Error (σ<sub>uut</sub>)
              </span>
              <span className="value">
                {results.uUUT.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">
                Combined Uncertainty (u<sub>cal</sub>)
              </span>
              <span className="value">
                {results.uCal.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">
                Observed Error (σ<sub>obs</sub>)
              </span>
              <span className="value">
                {results.uDev.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">UUT Lower Tolerance</span>
              <span className="value">
                {results.LLow.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">UUT Upper Tolerance</span>
              <span className="value">
                {results.LUp.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">Lower Acceptance</span>
              <span className="value">
                {results.ALow.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">Upper Acceptance</span>
              <span className="value">
                {results.AUp.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">Correlation (ρ)</span>
              <span className="value">
                {results.correlation.toPrecision(6)}
              </span>
            </li>
          </ul>
        </div>
        <div
          className={`risk-card tur-card clickable ${isActive("tur") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("tur")}
        >
          <div className="risk-value">{results.tur.toFixed(2)} : 1</div>
          <div className="risk-label">Test Uncertainty Ratio (TUR)</div>
          <div className="risk-explanation">
            A ratio of the UUT's tolerance to the measurement uncertainty.
          </div>
        </div>
        <div
          className={`risk-card tur-card clickable ${isActive("tar") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("tar")}
        >
          <div className="risk-value">{results.tar.toFixed(2)} : 1</div>
          <div className="risk-label">Test Acceptance Ratio (TAR)</div>
          <div className="risk-explanation">
            A ratio of the UUT's tolerance span to the TMDE's (Standard's)
            tolerance span.
          </div>
        </div>
        <div
          className={`risk-card pfa-card ${getPfaClass(results.pfa)} clickable ${isActive("pfa") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("pfa")}
        >
          <div className="risk-value">{results.pfa.toFixed(4)} %</div>
          <div className="risk-label">Probability of False Accept (PFA)</div>
          <ul className="result-breakdown" style={{ fontSize: "0.85rem" }}>
            <li>
              <span className="label">Lower Tail Risk</span>
              <span className="value">{results.pfa_term1.toFixed(4)} %</span>
            </li>
            <li>
              <span className="label">Upper Tail Risk</span>
              <span className="value">{results.pfa_term2.toFixed(4)} %</span>
            </li>
          </ul>
        </div>
        <div
          className={`risk-card pfr-card clickable ${isActive("pfr") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("pfr")}
        >
          <div className="risk-value">{results.pfr.toFixed(4)} %</div>
          <div className="risk-label">Probability of False Reject (PFR)</div>
          <ul className="result-breakdown" style={{ fontSize: "0.85rem" }}>
            <li>
              <span className="label">Lower Side Risk</span>
              <span className="value">{results.pfr_term1.toFixed(4)} %</span>
            </li>
            <li>
              <span className="label">Upper Side Risk</span>
              <span className="value">{results.pfr_term2.toFixed(4)} %</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RiskAnalysisDashboard;