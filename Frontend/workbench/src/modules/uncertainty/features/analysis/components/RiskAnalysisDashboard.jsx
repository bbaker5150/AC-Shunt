import React from "react";
import RiskDistributionVisualizer from "./RiskDistributionVisualizer";

const RiskAnalysisDashboard = ({
  results,
  calcResults,
  onShowBreakdown,
  activeModals = [],
}) => {
  if (!results) return null;

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

      <RiskDistributionVisualizer
        results={results}
        calcResults={calcResults}
        onShowBreakdown={onShowBreakdown}
        activeModals={activeModals}
      />
    </div>
  );
};

export default RiskAnalysisDashboard;
