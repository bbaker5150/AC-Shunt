import React from "react";
import { pfaStatus } from "./RiskDistributionVisualizer";

/**
 * Guardband result card in the visualizer's outcome-card language: an accent
 * icon chip, a small label, a monospace readout, and an optional muted note.
 */
const GuardbandCard = ({ icon, label, value, note, accent, active, onClick }) => (
  <button
    type="button"
    className={`risk-viz-outcome ${accent} ${active ? "active" : ""}`}
    onClick={onClick}
  >
    <span className="risk-viz-outcome-icon">{icon}</span>
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <em>{note}</em>}
    </span>
  </button>
);

const RiskMitigationDashboard = ({ results, onShowBreakdown, activeModals = [] }) => {
  if (!results) return null;

  const guardBandInputs = results.gbInputs;
  const guardBand = results.gbResults;

  const isActive = (key) => activeModals.includes(key);

  const nativeUnit = results.nativeUnit || "units";

  // Formatters that gracefully degrade to "N/A" when the math engine could not
  // converge on guard-band limits.
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const fmtPct = (v) => (isNum(v) ? `${v.toFixed(4)} %` : "N/A");
  const fmtNum = (v, d = 4) => (isNum(v) ? v.toFixed(d) : "N/A");
  const fmtLimit = (v) =>
    isNum(v) ? v.toFixed(results.uutResolution + 1) : "N/A";
  const fmt = (v, p = 6) => (isNum(v) ? v.toPrecision(p) : "N/A");

  const inputSpecs = [
    { label: "Calibration Interval", value: `${guardBandInputs.calibrationInt} months` },
    { label: "Required PFA", value: `${guardBandInputs.reqPFA * 100}%` },
    { label: "Required TUR", value: guardBandInputs.reqTUR },
    {
      label: "Measurement Reliability Target",
      value: `${guardBandInputs.measRelTarget * 100}%`,
    },
    {
      label: "Measurement Reliability Calculated/Assumed",
      value: `${guardBandInputs.measrelCalcAssumed * 100}%`,
    },
    { label: "TUR Result", value: fmt(guardBandInputs.turVal || 0) },
    {
      label: (
        <>
          Combined Uncertainty (u<sub>cal</sub>)
        </>
      ),
      value: `${fmt(guardBandInputs.combUnc)} ${nativeUnit}`,
    },
    { label: "Nominal", value: `${fmt(guardBandInputs.nominal)} ${nativeUnit}` },
    {
      label: "UUT Lower Tolerance",
      value: `${fmt(guardBandInputs.uutLower)} ${nativeUnit}`,
    },
    {
      label: "UUT Upper Tolerance",
      value: `${fmt(guardBandInputs.uutUpper)} ${nativeUnit}`,
    },
    {
      label: "TMDE Lower Tolerance",
      value: `${fmt(guardBandInputs.tmdeLower)} ${nativeUnit}`,
    },
    {
      label: "TMDE Upper Tolerance",
      value: `${fmt(guardBandInputs.tmdeUpper)} ${nativeUnit}`,
    },
  ];

  const guardbandCards = [
    {
      key: "gblow",
      icon: "GBL",
      label: "GB limit low value",
      value: `${fmtLimit(guardBand.GBLOW)} ${nativeUnit}`,
      note: "Guardbanded UUT lower tolerance limit",
      accent: "accent-guardband",
    },
    {
      key: "gbhigh",
      icon: "GBU",
      label: "GB limit high value",
      value: `${fmtLimit(guardBand.GBUP)} ${nativeUnit}`,
      note: "Guardbanded UUT upper tolerance limit",
      accent: "accent-guardband",
    },
    {
      key: "gbpfa",
      icon: "FA",
      label: "False accept probability with guardbanding",
      value: fmtPct(guardBand.GBPFA),
      note: `Lower tail ${fmtPct(guardBand.GBPFAT1)} / upper tail ${fmtPct(guardBand.GBPFAT2)}`,
      accent: `status-${pfaStatus(guardBand.GBPFA)}`,
    },
    {
      key: "gbpfr",
      icon: "FR",
      label: "False reject probability with guardbanding",
      value: fmtPct(guardBand.GBPFR),
      note: `Lower side ${fmtPct(guardBand.GBPFRT1)} / upper side ${fmtPct(guardBand.GBPFRT2)}`,
      accent: "status-muted",
    },
    {
      key: "gbmult",
      icon: "GBM",
      label: "Guardband multiplier",
      value: fmtPct(guardBand.GBMULT),
      note: "Ratio between the guardband and UUT tolerance limits",
      accent: "accent-guardband",
    },
    {
      key: "gbcalint",
      icon: "CIG",
      label: "Calibration interval with guardbanding",
      value: fmtNum(guardBand.GBCALINT),
      note: "Recommended calibration interval using the guardband limits",
      accent: "accent-primary",
    },
    {
      key: "calint",
      icon: "CI",
      label: "Calibration interval without guardbanding",
      value: fmtNum(guardBand.NOGBCALINT),
      note: "Recommended calibration interval at the original limits",
      accent: "accent-primary",
    },
    {
      key: "measrel",
      icon: "MR",
      label: "Measurement reliability needed without guardbanding",
      value: fmtPct(guardBand.NOGBMEASREL),
      note: "Required measurement reliability if no guardband is applied",
      accent: "accent-primary",
    },
  ];

  return (
    <div className="risk-dashboard">
      <section className="risk-viz-shell">
        <header className="risk-viz-header">
          <div>
            <span className="risk-viz-eyebrow">Risk mitigation</span>
            <h3>Key Calculation Inputs</h3>
            <p>
              The targets, tolerances, and uncertainties driving the guardband
              calculation.
            </p>
          </div>
          <button
            type="button"
            className={`risk-viz-header-action ${isActive("gbinputs") ? "active" : ""}`}
            onClick={() => onShowBreakdown("gbinputs")}
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

      <section className="risk-viz-shell">
        <header className="risk-viz-header">
          <div>
            <span className="risk-viz-eyebrow">Guardband strategy</span>
            <h3>Risk Mitigation Results</h3>
            <p>
              Acceptance limits tightened until the false-accept requirement is
              met, and the calibration-interval trade-offs that follow. Click
              any card for its calculation breakdown.
            </p>
          </div>
        </header>
        <div className="risk-viz-outcome-grid">
          {guardbandCards.map((card) => (
            <GuardbandCard
              key={card.key}
              icon={card.icon}
              label={card.label}
              value={card.value}
              note={card.note}
              accent={card.accent}
              active={isActive(card.key)}
              onClick={() => onShowBreakdown(card.key)}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default RiskMitigationDashboard;
