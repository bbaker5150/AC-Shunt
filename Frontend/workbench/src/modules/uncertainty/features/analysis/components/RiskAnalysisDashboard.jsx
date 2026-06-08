import React from "react";
import RiskGauge from "./RiskGauge";

const RiskAnalysisDashboard = ({ results, onShowBreakdown, activeModals = [] }) => {
  if (!results) return null;

  const getPfaClass = (pfa) => {
    if (pfa > 5) return "status-bad";
    if (pfa > 2) return "status-warning";
    return "status-good";
  };

  const isActive = (key) => activeModals.includes(key);

  const nativeUnit = results.nativeUnit || "units";
  const fmt = (v, p = 6) =>
    typeof v === "number" ? v.toPrecision(p) : "N/A";

  const inputSpecs = [
    {
      label: (
        <>
          True Error (σ<sub>uut</sub>)
        </>
      ),
      value: `${fmt(results.uUUT)} ${nativeUnit}`,
    },
    {
      label: (
        <>
          Combined Uncertainty (u<sub>cal</sub>)
        </>
      ),
      value: `${fmt(results.uCal)} ${nativeUnit}`,
    },
    {
      label: (
        <>
          Observed Error (σ<sub>obs</sub>)
        </>
      ),
      value: `${fmt(results.uDev)} ${nativeUnit}`,
    },
    { label: "UUT Lower Tolerance", value: `${fmt(results.LLow)} ${nativeUnit}` },
    { label: "UUT Upper Tolerance", value: `${fmt(results.LUp)} ${nativeUnit}` },
    { label: "Lower Acceptance", value: `${fmt(results.ALow)} ${nativeUnit}` },
    { label: "Upper Acceptance", value: `${fmt(results.AUp)} ${nativeUnit}` },
    { label: "Correlation (ρ)", value: fmt(results.correlation) },
  ];

  return (
    <div className="risk-dashboard">
      <section className="risk-inputs-panel">
        <button
          type="button"
          className={`risk-inputs-header ${isActive("inputs") ? "active" : ""}`}
          onClick={() => onShowBreakdown("inputs")}
        >
          <span>Key Calculation Inputs</span>
          <span className="risk-inputs-hint">View breakdown</span>
        </button>
        <div className="risk-inputs-grid">
          {inputSpecs.map((spec, i) => (
            <div className="risk-spec" key={i}>
              <span className="risk-spec-label">{spec.label}</span>
              <span className="risk-spec-value">{spec.value}</span>
            </div>
          ))}
        </div>
      </section>

      <RiskGauge
        label="Test Uncertainty Ratio (TUR)"
        value={`${results.tur.toFixed(2)} : 1`}
        accent="accent-primary"
        note="A ratio of the UUT's tolerance to the measurement uncertainty."
        active={isActive("tur")}
        onClick={() => onShowBreakdown("tur")}
      />

      <RiskGauge
        label="Test Acceptance Ratio (TAR)"
        value={`${results.tar.toFixed(2)} : 1`}
        accent="accent-primary"
        note="A ratio of the UUT's tolerance span to the TMDE's (Standard's) tolerance span."
        active={isActive("tar")}
        onClick={() => onShowBreakdown("tar")}
      />

      <RiskGauge
        label="Probability of False Accept (PFA)"
        value={`${results.pfa.toFixed(4)} %`}
        status={getPfaClass(results.pfa)}
        breakdown={[
          { label: "Lower Tail Risk", value: `${results.pfa_term1.toFixed(4)} %` },
          { label: "Upper Tail Risk", value: `${results.pfa_term2.toFixed(4)} %` },
        ]}
        active={isActive("pfa")}
        onClick={() => onShowBreakdown("pfa")}
      />

      <RiskGauge
        label="Probability of False Reject (PFR)"
        value={`${results.pfr.toFixed(4)} %`}
        status="neutral"
        breakdown={[
          { label: "Lower Side Risk", value: `${results.pfr_term1.toFixed(4)} %` },
          { label: "Upper Side Risk", value: `${results.pfr_term2.toFixed(4)} %` },
        ]}
        active={isActive("pfr")}
        onClick={() => onShowBreakdown("pfr")}
      />
    </div>
  );
};

export default RiskAnalysisDashboard;
