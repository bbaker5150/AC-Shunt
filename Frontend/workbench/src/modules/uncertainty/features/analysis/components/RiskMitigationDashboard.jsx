import React from "react";
import RiskGauge from "./RiskGauge";

const RiskMitigationDashboard = ({ results, onShowBreakdown, activeModals = [] }) => {
  if (!results) return null;

  const guardBandInputs = results.gbInputs;
  const guardBand = results.gbResults;

  const isActive = (key) => activeModals.includes(key);

  const nativeUnit = results.nativeUnit || "units";

  // Formatters that gracefully degrade to "N/A" when the math engine could not
  // converge on guard-band limits.
  const fmtPct = (v) => (typeof v === "number" ? `${v.toFixed(4)} %` : "N/A");
  const fmtNum = (v, d = 4) => (typeof v === "number" ? v.toFixed(d) : "N/A");
  const fmtLimit = (v) =>
    typeof v === "number" ? v.toFixed(results.uutResolution + 1) : "N/A";
  const fmt = (v, p = 6) => (typeof v === "number" ? v.toPrecision(p) : "N/A");

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

  return (
    <div className="risk-dashboard">
      <section className="risk-inputs-panel">
        <button
          type="button"
          className={`risk-inputs-header ${isActive("gbinputs") ? "active" : ""}`}
          onClick={() => onShowBreakdown("gbinputs")}
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
        label="GB Limit Low Value"
        value={fmtLimit(guardBand.GBLOW)}
        accent="accent-guardband"
        note="Guardbanded UUT Lower Tolerance Limit."
        active={isActive("gblow")}
        onClick={() => onShowBreakdown("gblow")}
      />

      <RiskGauge
        label="GB Limit High Value"
        value={fmtLimit(guardBand.GBUP)}
        accent="accent-guardband"
        note="Guardbanded UUT Upper Tolerance Limit."
        active={isActive("gbhigh")}
        onClick={() => onShowBreakdown("gbhigh")}
      />

      <RiskGauge
        label="Probability of False Accept (PFA) with Guard Banding"
        value={fmtPct(guardBand.GBPFA)}
        accent="accent-guardband"
        breakdown={[
          { label: "Lower Tail Risk", value: fmtPct(guardBand.GBPFAT1) },
          { label: "Upper Tail Risk", value: fmtPct(guardBand.GBPFAT2) },
        ]}
        active={isActive("gbpfa")}
        onClick={() => onShowBreakdown("gbpfa")}
      />

      <RiskGauge
        label="Probability of False Reject (PFR) with Guard Banding"
        value={fmtPct(guardBand.GBPFR)}
        accent="accent-guardband"
        breakdown={[
          { label: "Lower Side Risk", value: fmtPct(guardBand.GBPFRT1) },
          { label: "Upper Side Risk", value: fmtPct(guardBand.GBPFRT2) },
        ]}
        active={isActive("gbpfr")}
        onClick={() => onShowBreakdown("gbpfr")}
      />

      <RiskGauge
        label="Guard Band Multiplier"
        value={fmtPct(guardBand.GBMULT)}
        accent="accent-guardband"
        note="Ratio between the guardband tolerance limits and UUT tolerance limits."
        active={isActive("gbmult")}
        onClick={() => onShowBreakdown("gbmult")}
      />

      <RiskGauge
        label="Calibration Interval with Guard Banding"
        value={fmtNum(guardBand.GBCALINT)}
        accent="accent-guardband"
        note="Recommended Calibration Interval with Guard Band Tolerance Limits."
        active={isActive("gbcalint")}
        onClick={() => onShowBreakdown("gbcalint")}
      />

      <RiskGauge
        label="Calibration without Guard Banding"
        value={fmtNum(guardBand.NOGBCALINT)}
        accent="accent-guardband"
        note="Recommended Calibration Interval without Guard Band Tolerance Limits."
        active={isActive("calint")}
        onClick={() => onShowBreakdown("calint")}
      />

      <RiskGauge
        label="Measurement Reliability Needed without Guard Banding"
        value={fmtPct(guardBand.NOGBMEASREL)}
        accent="accent-guardband"
        note="Required Measurement Reliability without Guard Banding."
        active={isActive("measrel")}
        onClick={() => onShowBreakdown("measrel")}
      />
    </div>
  );
};

export default RiskMitigationDashboard;
