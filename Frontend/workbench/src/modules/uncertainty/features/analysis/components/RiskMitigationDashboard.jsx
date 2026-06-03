import React from "react";

const RiskMitigationDashboard = ({ results, onShowBreakdown, activeModals = [] }) => {
  if (!results) return null;

  const guardBandInputs = results.gbInputs;
  const guardBand = results.gbResults;

  const isActive = (key) => activeModals.includes(key);

  const nativeUnit = results.nativeUnit || "units";

  return (
    <div className="risk-analysis-container">
      <div className="risk-analysis-dashboard">
        <div
          className={`risk-card clickable ${isActive("gbinputs") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("gbinputs")}
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
              <span className="label">Calibration Interval</span>
              <span className="value">
                {guardBandInputs.calibrationInt} months
              </span>
            </li>
            <li>
              <span className="label">Required PFA</span>
              <span className="value">{guardBandInputs.reqPFA * 100}%</span>
            </li>
            <li>
              <span className="label">Required TUR</span>
              <span className="value">{guardBandInputs.reqTUR}</span>
            </li>
            <li>
              <span className="label">Measurement Reliability Target</span>
              <span className="value">
                {guardBandInputs.measRelTarget * 100}%
              </span>
            </li>
            <li>
              <span className="label">
                Measurement Reliability Calculated/Assumed
              </span>
              <span className="value">
                {guardBandInputs.measrelCalcAssumed * 100}%
              </span>
            </li>
            <li>
              <span className="label">TUR Result</span>
              <span className="value">
                {(guardBandInputs.turVal || 0).toPrecision(6)}
              </span>
            </li>
            <li>
              <span className="label">
                Combined Uncertainty (u<sub>cal</sub>)
              </span>
              <span className="value">
                {guardBandInputs.combUnc.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">Nominal</span>
              <span className="value">
                {guardBandInputs.nominal.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">UUT Lower Tolerance</span>
              <span className="value">
                {guardBandInputs.uutLower.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">UUT Upper Tolerance</span>
              <span className="value">
                {guardBandInputs.uutUpper.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">TMDE Upper Tolerance</span>
              <span className="value">
                {guardBandInputs.tmdeLower.toPrecision(6)} {nativeUnit}
              </span>
            </li>
            <li>
              <span className="label">TMDE Upper Tolerance</span>
              <span className="value">
                {guardBandInputs.tmdeUpper.toPrecision(6)} {nativeUnit}
              </span>
            </li>
          </ul>
        </div>
        <div
          className={`risk-card gblow-card clickable ${isActive("gblow") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("gblow")}
        >
          <div className="risk-value">
            {typeof guardBand.GBLOW === 'number' 
                ? guardBand.GBLOW.toFixed(results.uutResolution+1) 
                : "N/A"}
          </div>
          <div className="risk-label">GB Limit Low Value</div>
          <div className="risk-explanation">
            Guardbanded UUT Lower Tolerance Limit.
          </div>
        </div>
        <div
          className={`risk-card gbhigh-card clickable ${isActive("gbhigh") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("gbhigh")}
        >
          <div className="risk-value">
            {typeof guardBand.GBUP === 'number' 
                ? guardBand.GBUP.toFixed(results.uutResolution+1) 
                : "N/A"}
          </div>
          <div className="risk-label">GB Limit High Value</div>
          <div className="risk-explanation">
            Guardbanded UUT Upper Tolerance Limit.
          </div>
        </div>

        <div
          className={`risk-card gbpfa-card clickable ${isActive("gbpfa") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("gbpfa")}
        >
          <div className="risk-value">
             {typeof guardBand.GBPFA === 'number' ? guardBand.GBPFA.toFixed(4) + " %" : "N/A"}
          </div>
          <div className="risk-label">
            Probability of False Accept (PFA) with Guard Banding
          </div>
          <ul className="result-breakdown" style={{ fontSize: "0.85rem" }}>
            <li>
              <span className="label">Lower Tail Risk</span>
              <span className="value">
                {typeof guardBand.GBPFAT1 === 'number' ? guardBand.GBPFAT1.toFixed(4) + " %" : "N/A"}
              </span>
            </li>
            <li>
              <span className="label">Upper Tail Risk</span>
              <span className="value">
                {typeof guardBand.GBPFAT2 === 'number' ? guardBand.GBPFAT2.toFixed(4) + " %" : "N/A"}
              </span>
            </li>
          </ul>
        </div>
        <div
          className={`risk-card gbpfr-card clickable ${isActive("gbpfr") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("gbpfr")}
        >
          <div className="risk-value">
            {typeof guardBand.GBPFR === 'number' ? guardBand.GBPFR.toFixed(4) + " %" : "N/A"}
          </div>
          <div className="risk-label">
            Probability of False Reject (PFR) with Guard Banding
          </div>
          <ul className="result-breakdown" style={{ fontSize: "0.85rem" }}>
            <li>
              <span className="label">Lower Side Risk</span>
              <span className="value">
                 {typeof guardBand.GBPFRT1 === 'number' ? guardBand.GBPFRT1.toFixed(4) + " %" : "N/A"}
              </span>
            </li>
            <li>
              <span className="label">Upper Side Risk</span>
              <span className="value">
                 {typeof guardBand.GBPFRT2 === 'number' ? guardBand.GBPFRT2.toFixed(4) + " %" : "N/A"}
              </span>
            </li>
          </ul>
        </div>
        <div
          className={`risk-card gbmult-card clickable ${isActive("gbmult") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("gbmult")}
        >
          <div className="risk-value">
            {typeof guardBand.GBMULT === 'number' ? guardBand.GBMULT.toFixed(4) + " %" : "N/A"}
          </div>
          <div className="risk-label">Guard Band Multiplier</div>
          <div className="risk-explanation">
            Ratio between the guardband tolerance limits and UUT tolerance
            limits.
          </div>
        </div>
        <div
          className={`risk-card gbcalint-card clickable ${isActive("gbcalint") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("gbcalint")}
        >
          <div className="risk-value">
             {typeof guardBand.GBCALINT === 'number' ? guardBand.GBCALINT.toFixed(4) : "N/A"}
          </div>
          <div className="risk-label">
            Calibration Interval with Guard Banding
          </div>
          <div className="risk-explanation">
            Recommended Calibration Interval with Guard Band Tolerance Limits.
          </div>
        </div>
        <div
          className={`risk-card calint-card clickable ${isActive("calint") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("calint")}
        >
          <div className="risk-value">
             {typeof guardBand.NOGBCALINT === 'number' ? guardBand.NOGBCALINT.toFixed(4) : "N/A"}
          </div>
          <div className="risk-label">Calibration without Guard Banding</div>
          <div className="risk-explanation">
            Recommended Calibration Interval without Guard Band Tolerance
            Limits.
          </div>
        </div>
        <div
          className={`risk-card measrel-card clickable ${isActive("measrel") ? "active-card" : ""}`}
          onClick={() => onShowBreakdown("measrel")}
        >
          <div className="risk-value">
             {typeof guardBand.NOGBMEASREL === 'number' ? guardBand.NOGBMEASREL.toFixed(4) + " %" : "N/A"}
          </div>
          <div className="risk-label">
            Measurement Reliability Needed without Guard Banding
          </div>
          <div className="risk-explanation">
            Required Measurement Reliability without Guard Banding.
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskMitigationDashboard;