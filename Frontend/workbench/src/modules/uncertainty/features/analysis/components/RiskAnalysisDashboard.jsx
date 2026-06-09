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
    typeof v === "number" && Number.isFinite(v) ? v.toPrecision(p) : "N/A";

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
      <section className="risk-viz-shell">
        <header className="risk-viz-header">
          <div>
            <span className="risk-viz-eyebrow">Risk analysis</span>
            <h3>Key Calculation Inputs</h3>
            <p>
              The uncertainties, limits, and correlation feeding the PFA / PFR
              calculation in the visualizer below.
            </p>
          </div>
          <button
            type="button"
            className={`risk-viz-header-action ${isActive("inputs") ? "active" : ""}`}
            onClick={() => onShowBreakdown("inputs")}
          >
            View breakdown
          </button>
        </header>
        <div className="risk-viz-inputs-grid">
          {inputSpecs.map((spec, i) => (
            <div className="risk-viz-metric" key={i}>
              <span>{spec.label}</span>
              <strong>{spec.value}</strong>
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
