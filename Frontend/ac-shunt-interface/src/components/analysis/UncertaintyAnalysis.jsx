import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import axios from "axios";
import { useInstruments } from "../../contexts/InstrumentContext";
import { API_BASE_URL } from "../../constants/constants";
import { probit, erf } from "simple-statistics";

// Helper function for the bivariate normal CDF
function bivariateNormalCDF(x, y, rho) {
  if (rho === null || isNaN(rho) || rho > 1 || rho < -1) {
    return NaN;
  }
  if (rho === 0)
    return (
      (((1 + erf(x / Math.sqrt(2))) / 2) * (1 + erf(y / Math.sqrt(2)))) / 2
    );
  if (rho === 1) return (1 + erf(Math.min(x, y) / Math.sqrt(2))) / 2;
  if (rho === -1)
    return Math.max(
      0,
      (1 + erf(x / Math.sqrt(2))) / 2 + (1 + erf(y / Math.sqrt(2))) / 2 - 1
    );
  const rho2 = rho * rho;
  let result = 0;
  if (rho2 < 1) {
    const t = (y - rho * x) / Math.sqrt(1 - rho2);
    const biv_g =
      (1 / (2 * Math.PI * Math.sqrt(1 - rho2))) *
      Math.exp(-(x * x - 2 * rho * x * y + y * y) / (2 * (1 - rho2)));
    if (x * y * rho > 0) {
      const L =
        (((1 + erf(x / Math.sqrt(2))) / 2) * (1 + erf(t / Math.sqrt(2)))) / 2;
      let sum = 0;
      for (let i = 0; i < 5; i++) {
        sum +=
          Math.pow(rho, i + 1) /
          ((i + 1) *
            Math.pow(2, i / 2 + 1) *
            Math.exp(Math.log(i + 1) * 2) *
            Math.PI);
      }
      result = L - biv_g * sum;
    } else {
      const L =
        (((1 + erf(x / Math.sqrt(2))) / 2) * (1 + erf(t / Math.sqrt(2)))) / 2;
      result = L - bivariateNormalCDF(x, t, 0);
    }
  }
  return result < 0 ? 0 : result > 1 ? 1 : result;
}

const AVAILABLE_FREQUENCIES = [
  { text: "10Hz", value: 10 },
  { text: "20Hz", value: 20 },
  { text: "50Hz", value: 50 },
  { text: "60Hz", value: 60 },
  { text: "100Hz", value: 100 },
  { text: "200Hz", value: 200 },
  { text: "500Hz", value: 500 },
  { text: "1kHz", value: 1000 },
  { text: "2kHz", value: 2000 },
  { text: "5kHz", value: 5000 },
  { text: "10kHz", value: 10000 },
  { text: "20kHz", value: 20000 },
  { text: "50kHz", value: 50000 },
  { text: "100kHz", value: 100000 },
];
const READING_KEYS = [
  {
    key: "std_ac_open",
    name: "AC Open Readings",
    category: "Standard Instrument",
  },
  { key: "std_dc_pos", name: "DC+ Readings", category: "Standard Instrument" },
  { key: "std_dc_neg", name: "DC- Readings", category: "Standard Instrument" },
  {
    key: "std_ac_close",
    name: "AC Close Readings",
    category: "Standard Instrument",
  },
  {
    key: "ti_ac_open",
    name: "AC Open Readings",
    category: "Unit Under Test (UUT)",
  },
  { key: "ti_dc_pos", name: "DC+ Readings", category: "Unit Under Test (UUT)" },
  { key: "ti_dc_neg", name: "DC- Readings", category: "Unit Under Test (UUT)" },
  {
    key: "ti_ac_close",
    name: "AC Close Readings",
    category: "Unit Under Test (UUT)",
  },
];
const BASIC_SPECIFICATIONS = {
  "1 mA": { DC: 20, 1000: 55, 10000: 75, 30000: 75, 100000: 150 },
  "10 mA": { DC: 20, 1000: 26, 10000: 26, 30000: 26, 100000: 26 },
  "20 mA": { DC: 20, 1000: 26, 10000: 26, 30000: 26, 100000: 26 },
  "50 mA": { DC: 20, 1000: 23, 10000: 23, 30000: 23, 100000: 23 },
  "100 mA": { DC: 20, 1000: 24, 10000: 24, 30000: 24, 100000: 24 },
  "200 mA": { DC: 20, 1000: 26, 10000: 26, 30000: 26, 100000: 26 },
  "500 mA": { DC: 21, 1000: 27, 10000: 27, 30000: 27, 100000: 28 },
  "1 A": { DC: 21, 1000: 27, 10000: 28, 30000: 28, 100000: 31 },
  "2 A": { DC: 21, 1000: 27, 10000: 30, 30000: 30, 100000: 48 },
  "5 A": { DC: 21, 1000: 31, 10000: 32, 30000: 40, 100000: 71 },
  "10 A": { DC: 26, 1000: 37, 10000: 60, 30000: 61, 100000: 92 },
  "20 A": { DC: 26, 1000: 43, 10000: 52, 30000: 70, 100000: 113 },
  "50 A": { DC: 32, 1000: 55, 10000: 80, 30000: 81, 100000: 144 },
  "100 A": { DC: 35, 1000: 65, 10000: 90, 30000: 98, 100000: 174 },
};
const READING_KEY_NAMES = [
  "std_ac_open_readings",
  "std_dc_pos_readings",
  "std_dc_neg_readings",
  "std_ac_close_readings",
  "ti_ac_open_readings",
  "ti_dc_pos_readings",
  "ti_dc_neg_readings",
  "ti_ac_close_readings",
];
const T_DISTRIBUTION_95 = {
  1: 12.71,
  2: 4.3,
  3: 3.18,
  4: 2.78,
  5: 2.57,
  6: 2.45,
  7: 2.36,
  8: 2.31,
  9: 2.26,
  10: 2.23,
  15: 2.13,
  20: 2.09,
  25: 2.06,
  30: 2.04,
  40: 2.02,
  50: 2.01,
  60: 2.0,
  100: 1.98,
  120: 1.98,
};

function getKValueFromTDistribution(dof) {
  if (dof === Infinity || dof > 120) return 1.96;
  const roundedDof = Math.round(dof);
  if (T_DISTRIBUTION_95[roundedDof]) {
    return T_DISTRIBUTION_95[roundedDof];
  }
  const lowerKeys = Object.keys(T_DISTRIBUTION_95)
    .map(Number)
    .filter((k) => k < roundedDof);
  const upperKeys = Object.keys(T_DISTRIBUTION_95)
    .map(Number)
    .filter((k) => k > roundedDof);
  if (lowerKeys.length === 0) return T_DISTRIBUTION_95[Math.min(...upperKeys)];
  if (upperKeys.length === 0) return T_DISTRIBUTION_95[Math.max(...lowerKeys)];
  const lowerBound = Math.max(...lowerKeys);
  const upperBound = Math.min(...upperKeys);
  const kLower = T_DISTRIBUTION_95[lowerBound];
  const kUpper = T_DISTRIBUTION_95[upperBound];
  const kValue =
    kLower +
    ((roundedDof - lowerBound) * (kUpper - kLower)) / (upperBound - lowerBound);
  return kValue;
}

const Accordion = ({ title, children, startOpen = false }) => {
  const [isOpen, setIsOpen] = useState(startOpen);
  useEffect(() => {
    if (
      isOpen &&
      window.MathJax &&
      typeof window.MathJax.typesetPromise === "function"
    ) {
      setTimeout(() => {
        window.MathJax.typesetPromise().catch((err) =>
          console.error("MathJax typeset failed:", err)
        );
      }, 0);
    }
  }, [isOpen]);
  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <h4>{title}</h4>
        <span className={`accordion-icon ${isOpen ? "open" : ""}`}>
          &#9660;
        </span>
      </div>
      {isOpen && <div className="accordion-content">{children}</div>}
    </div>
  );
};

const UncertaintyBudgetTable = ({ components, onRemove, calcResults }) => {
  useEffect(() => {
    if (
      calcResults &&
      window.MathJax &&
      typeof window.MathJax.typesetPromise === "function"
    ) {
      setTimeout(() => {
        window.MathJax.typesetPromise().catch((err) =>
          console.error("MathJax typeset failed:", err)
        );
      }, 0);
    }
  }, [calcResults]);

  const totalUncertainty = useMemo(() => {
    if (!components || components.length === 0) return 0;
    const combinedVariance = components.reduce(
      (sum, comp) => sum + Math.pow(comp.value, 2),
      0
    );
    return Math.sqrt(combinedVariance);
  }, [components]);

  const renderTBody = (title, filteredComponents) => {
    if (filteredComponents.length === 0) return null;
    return (
      <React.Fragment key={title}>
        <tr className="category-header">
          <td colSpan="5">{title}</td>
        </tr>
        {filteredComponents.map((c) => {
          const stddevInPpm = c.calculationDetails
            ? (c.calculationDetails.stddev /
                Math.abs(c.calculationDetails.avg)) *
              1_000_000
            : null;

          return (
            <tr key={c.id}>
              <td>
                {c.type === "A" && c.calculationDetails ? (
                  <div className="tooltip-container">
                    {c.name}
                    <span
                      className="tooltip-text"
                      style={{ textAlign: "left" }}
                    >
                      <b>Type A Calculation</b>
                      <hr style={{ margin: "4px 0", opacity: 0.2 }} />
                      <b>Absolute Std Dev (σ):</b>{" "}
                      {c.calculationDetails.stddev.toExponential(4)} V<br />
                      <b>Relative Std Dev (σ):</b>{" "}
                      {stddevInPpm != null ? stddevInPpm.toFixed(3) : "N/A"} ppm
                      <br />
                      <b>Average (V):</b>{" "}
                      {c.calculationDetails.avg.toExponential(4)} V<br />
                      <b>Samples (n):</b> {c.calculationDetails.n}
                      <p className="tooltip-note">
                        The <strong>absolute σ</strong> is used in the formula
                        to calculate the final uncertainty.
                      </p>
                      <b>
                        Std. Uncertainty (uᵢ):{" "}
                        {c.value != null ? c.value.toFixed(4) : "N/A"} ppm
                      </b>
                    </span>
                  </div>
                ) : (
                  c.name
                )}
              </td>
              <td>{c.type}</td>
              <td>{c.value != null ? c.value.toFixed(4) : "N/A"}</td>
              <td>
                {c.dof === Infinity
                  ? "∞"
                  : c.dof != null
                  ? c.dof.toFixed(0)
                  : "N/A"}
              </td>
              <td className="action-cell">
                {!c.isAuto && (
                  <span
                    onClick={() => onRemove(c.id)}
                    className="delete-action"
                    title="Remove Component"
                  >
                    ×
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </React.Fragment>
    );
  };

  const stdComponents = components.filter(
    (c) => c.category === "Standard Instrument"
  );
  const uutComponents = components.filter(
    (c) => c.category === "Unit Under Test (UUT)"
  );
  const sysComponents = components.filter(
    (c) => c.category === "System & Environmental"
  );

  return (
    <table className="uncertainty-budget-table">
      <thead>
        <tr>
          <th>Uncertainty Component</th>
          <th>Type</th>
          <th>uᵢ (ppm)</th>
          <th>vᵢ (dof)</th>
          <th style={{ width: "50px" }}></th>
        </tr>
      </thead>
      <tbody>
        {renderTBody("Standard Instrument", stdComponents)}
        {renderTBody("Unit Under Test (UUT)", uutComponents)}
        {renderTBody("System & Environmental", sysComponents)}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan="2">{"Combined Standard Uncertainty ($u_c$)"}</td>
          <td>{totalUncertainty.toFixed(4)}</td>
          <td colSpan="2"></td>
        </tr>
        {calcResults && (
          <>
            <tr>
              <td colSpan="2">{"Effective Degrees of Freedom ($v_{eff}$)"}</td>
              <td>
                {calcResults.effectiveDof === Infinity ||
                calcResults.effectiveDof === null
                  ? "∞"
                  : calcResults.effectiveDof.toFixed(2)}
              </td>
              <td colSpan="2"></td>
            </tr>
            <tr>
              <td colSpan="2">{"Coverage Factor ($k$)"}</td>
              <td>{calcResults.kValue.toFixed(3)}</td>
              <td colSpan="2"></td>
            </tr>
          </>
        )}
      </tfoot>
    </table>
  );
};

const FinalResultCard = ({ result, calcResults, testPointInfo }) => {
  if (result === null || result === undefined) {
    return <p className="placeholder-text">No averaged result available.</p>;
  }
  const measuredValue = parseFloat(result);

  return (
    <>
      <p
        style={{
          fontSize: "0.9rem",
          color: "#6c757d",
          marginTop: "10px",
          textAlign: "center",
        }}
      >
        {testPointInfo.current}A @ {testPointInfo.frequency} (
        {testPointInfo.direction})
      </p>

      {!calcResults ? (
        <div style={{ textAlign: "center" }}>
          <div className="final-result-value">
            <span>{measuredValue.toFixed(3)}</span> ppm
          </div>
          <p className="placeholder-text">
            The calculated AC-DC difference is shown above. Complete the
            uncertainty budget and calculate to determine the final measurement
            result with its associated uncertainty.
          </p>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div className="final-result-value">
            δ = (<span>{measuredValue.toFixed(3)}</span> ±{" "}
            <span>{calcResults.expandedUncertainty.toFixed(3)}</span>) ppm
          </div>
          <ul className="result-breakdown">
            <li>
              <span className="label">Combined Uncertainty (uₑ)</span>
              <span className="value">
                {calcResults.combinedUncertainty.toFixed(4)} ppm
              </span>
            </li>
            <li>
              <span className="label">Effective DoF (vₑₒₒ)</span>
              <span className="value">
                {calcResults.effectiveDof === Infinity ||
                calcResults.effectiveDof === null
                  ? "∞"
                  : calcResults.effectiveDof.toFixed(2)}
              </span>
            </li>
            <li>
              <span className="label">Coverage Factor (k)</span>
              <span className="value">{calcResults.kValue.toFixed(3)}</span>
            </li>
          </ul>
          <p className="result-confidence-note">
            The reported expanded uncertainty of measurement is stated as the
            standard uncertainty of measurement multiplied by the coverage
            factor k={calcResults.kValue.toFixed(3)}, which for a t-distribution
            with vₑₒₒ ={" "}
            {calcResults.effectiveDof === Infinity ||
            calcResults.effectiveDof === null
              ? "∞"
              : calcResults.effectiveDof.toFixed(2)}{" "}
            corresponds to a coverage probability of approximately 95%.
          </p>
        </div>
      )}
    </>
  );
};

// MODAL COMPONENTS
const InputsBreakdownModal = ({ results, inputs, onClose }) => {
  useEffect(() => {
    window.MathJax && window.MathJax.typesetPromise();
  }, [results, inputs]);
  if (!results || !inputs) return null;

  const mid = (inputs.LUp + inputs.LLow) / 2;
  const LUp_symmetric = Math.abs(inputs.LUp - mid);

  return (
    <div className="modal-overlay">
      <div className="modal-content breakdown-modal-content">
        <button onClick={onClose} className="modal-close-button">
          &times;
        </button>
        <h3>Key Inputs Breakdown</h3>
        <div className="breakdown-step">
          <h5>Std. Unc. of Cal (uₑₐₗ)</h5>
          <p>
            This value is the **Combined Standard Uncertainty**, calculated
            using the root sum of squares (RSS) of all individual components
            (uᵢ) from the detailed budget.
          </p>
          {`$$ u_{cal} = \\sqrt{\\sum_{i=1}^{N} u_i^2} = \\mathbf{${results.uCal.toFixed(
            4
          )}} \\text{ ppm} $$`}
        </div>
        <div className="breakdown-step">
          <h5>UUT Uncertainty (uᵤᵤₜ)</h5>
          <p>
            The standard uncertainty of the UUT is isolated from the total
            deviation uncertainty, which is derived from the target reliability
            (R).
          </p>
          1. Deviation Uncertainty (uₔₑᵥ):{" "}
          {`$$ u_{dev} = \\frac{L_{Upper}}{\\Phi^{-1}((1+R)/2)} = \\frac{${LUp_symmetric.toFixed(
            2
          )}}{\\Phi^{-1}((1+${inputs.reliability})/2)} = ${results.uDev.toFixed(
            4
          )} \\text{ ppm} $$`}
          2. UUT Uncertainty:{" "}
          {`$$ u_{UUT} = \\sqrt{u_{dev}^2 - u_{cal}^2} = \\sqrt{${results.uDev.toFixed(
            4
          )}^2 - ${results.uCal.toFixed(
            4
          )}^2} = \\mathbf{${results.uUUT.toFixed(4)}} \\text{ ppm} $$`}
        </div>
        <div className="breakdown-step">
          <h5>Acceptance Limits (A)</h5>
          <p>
            Calculated by applying the **Guard Band Multiplier** to the
            tolerance limits.
          </p>
          {`$$ A_{Low} = L_{Low} \\times G = ${inputs.LLow.toFixed(
            2
          )} \\times ${
            inputs.guardBandMultiplier
          } = \\mathbf{${results.ALow.toFixed(4)}} \\text{ ppm} $$`}
          {`$$ A_{Up} = L_{Up} \\times G = ${inputs.LUp.toFixed(2)} \\times ${
            inputs.guardBandMultiplier
          } = \\mathbf{${results.AUp.toFixed(4)}} \\text{ ppm} $$`}
        </div>
        <div className="breakdown-step">
          <h5>Correlation (ρ)</h5>
          <p>
            The statistical correlation between the UUT's true value and the
            measured value.
          </p>
          {`$$ \\rho = \\frac{u_{UUT}}{u_{dev}} = \\frac{${results.uUUT.toFixed(
            4
          )}}{${results.uDev.toFixed(
            4
          )}} = \\mathbf{${results.correlation.toFixed(4)}} $$`}
        </div>
      </div>
    </div>
  );
};

const TurBreakdownModal = ({ results, inputs, onClose }) => {
  useEffect(() => {
    window.MathJax && window.MathJax.typesetPromise();
  }, [results, inputs]);
  if (!results || !inputs) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content breakdown-modal-content">
        <button onClick={onClose} className="modal-close-button">
          &times;
        </button>
        <h3>TUR Calculation Breakdown</h3>
        <div className="breakdown-step">
          <h5>Step 1: Formula</h5>
          <p>
            The Test Uncertainty Ratio (TUR) is the ratio of the tolerance span
            to the expanded measurement uncertainty.
          </p>
          {`$$ TUR = \\frac{L_{Upper} - L_{Lower}}{U_{95}} $$`}
        </div>
        <div className="breakdown-step">
          <h5>Step 2: Inputs</h5>
          <ul>
            <li>
              Tolerance Span:{" "}
              {`$$ L_{Upper} - L_{Lower} = ${inputs.LUp.toFixed(
                2
              )} - (${inputs.LLow.toFixed(2)}) = ${(
                inputs.LUp - inputs.LLow
              ).toFixed(2)} \\text{ ppm} $$`}
            </li>
            <li>
              Expanded Uncertainty:{" "}
              {`$$ U_{95} = ${results.expandedUncertainty.toFixed(
                4
              )} \\text{ ppm} $$`}
            </li>
          </ul>
        </div>
        <div className="breakdown-step">
          <h5>Step 3: Final Calculation</h5>
          {`$$ TUR = \\frac{${(inputs.LUp - inputs.LLow).toFixed(
            2
          )}}{${results.expandedUncertainty.toFixed(
            4
          )}} = \\mathbf{${results.tur.toFixed(4)}:1} $$`}
        </div>
      </div>
    </div>
  );
};

const TarBreakdownModal = ({ results, inputs, onClose }) => {
  useEffect(() => {
    window.MathJax && window.MathJax.typesetPromise();
  }, [results, inputs]);
  if (!results || !inputs) return null;

  const uutToleranceSpan = inputs.LUp - inputs.LLow;
  const tmdeToleranceSpan = results.tmdeToleranceSpan;

  return (
    <div className="modal-overlay">
      <div className="modal-content breakdown-modal-content">
        <button onClick={onClose} className="modal-close-button">
          &times;
        </button>
        <h3>TAR Calculation Breakdown</h3>
        <div className="breakdown-step">
          <h5>Step 1: Formula</h5>
          <p>
            The Test Acceptance Ratio (TAR) is the ratio of the UUT's tolerance
            span to the TMDE's (Standard's) tolerance span.
          </p>
          {`$$ TAR = \\frac{UUT\\ Tolerance\\ Span}{TMDE\\ Tolerance\\ Span} = \\frac{L_{UUT\\_Up} - L_{UUT\\_Low}}{L_{TMDE\\_Up} - L_{TMDE\\_Low}} $$`}
        </div>
        <div className="breakdown-step">
          <h5>Step 2: Inputs</h5>
          <ul>
            <li>
              UUT Tolerance Span:{" "}
              {`$$ ${inputs.LUp.toFixed(2)} - (${inputs.LLow.toFixed(
                2
              )}) = \\mathbf{${uutToleranceSpan.toFixed(2)}} \\text{ ppm} $$`}
            </li>
            <li>
              TMDE Tolerance Span:{" "}
              {`$$ \\mathbf{${tmdeToleranceSpan.toFixed(2)}} \\text{ ppm} $$`}{" "}
              <em>
                (Derived from the 'Standard Instrument' component in the budget)
              </em>
            </li>
          </ul>
        </div>
        <div className="breakdown-step">
          <h5>Step 3: Final Calculation</h5>
          {`$$ TAR = \\frac{${uutToleranceSpan.toFixed(
            2
          )}}{${tmdeToleranceSpan.toFixed(2)}} = \\mathbf{${results.tar.toFixed(
            4
          )}:1} $$`}
        </div>
      </div>
    </div>
  );
};

const PfaBreakdownModal = ({ results, inputs, onClose }) => {
  useEffect(() => {
    window.MathJax && window.MathJax.typesetPromise();
  }, [results, inputs]);
  if (!results || !inputs) return null;

  const mid = (inputs.LUp + inputs.LLow) / 2;
  const LLow_norm = inputs.LLow - mid;
  const LUp_norm = inputs.LUp - mid;
  const ALow_norm = results.ALow - mid;
  const AUp_norm = results.AUp - mid;

  const z1 = LLow_norm / results.uUUT;
  const z2 = AUp_norm / results.uDev;
  const z3 = ALow_norm / results.uDev;
  const z4 = -LUp_norm / results.uUUT;
  const z5 = -ALow_norm / results.uDev;
  const z6 = -AUp_norm / results.uDev;

  return (
    <div className="modal-overlay">
      <div className="modal-content breakdown-modal-content">
        <button onClick={onClose} className="modal-close-button">
          &times;
        </button>
        <h3>PFA Calculation Breakdown</h3>
        <div className="breakdown-step">
          <h5>Step 1: Formula</h5>
          <p>
            The Probability of False Accept is the risk of accepting an
            out-of-tolerance UUT.
          </p>
          {`$$ PFA = \\int G(x) \\left[ \\Phi(\\frac{A-x}{u_{cal}}) - \\Phi(\\frac{-A-x}{u_{cal}}) \\right] dx $$`}
        </div>
        <div className="breakdown-step">
          <h5>Step 2: Standardized Limits (Z-Scores)</h5>
          <p>
            The limits are normalized by their respective uncertainties to
            create unitless Z-scores.
          </p>
          {`$$ z_{L_{Low}} = ${z1.toFixed(4)}, z_{L_{Up}} = ${z4.toFixed(
            4
          )}, z_{A_{Low}} = ${z3.toFixed(4)}, z_{A_{Up}} = ${z2.toFixed(4)} $$`}
        </div>
        <div className="breakdown-step">
          <h5>Step 3: Bivariate Normal Probabilities (Φ₂)</h5>
          <p>
            Using Z-scores and correlation (ρ = {results.correlation.toFixed(4)}
            ), we solve the Bivariate Normal CDF (Φ₂).
          </p>
          Term A:{" "}
          {`$$ \\Phi_2(${z1.toFixed(2)}, ${z2.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z1,
            z2,
            results.correlation
          ).toFixed(6)} $$`}
          Term B:{" "}
          {`$$ \\Phi_2(${z1.toFixed(2)}, ${z3.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z1,
            z3,
            results.correlation
          ).toFixed(6)} $$`}
          Term C:{" "}
          {`$$ \\Phi_2(${z4.toFixed(2)}, ${z5.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z4,
            z5,
            results.correlation
          ).toFixed(6)} $$`}
          Term D:{" "}
          {`$$ \\Phi_2(${z4.toFixed(2)}, ${z6.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z4,
            z6,
            results.correlation
          ).toFixed(6)} $$`}
        </div>
        <div className="breakdown-step">
          <h5>Step 4: Final PFA Calculation</h5>
          Lower Tail Risk (A-B):{" "}
          {`$$ ${(results.pfa_term1 / 100).toFixed(6)} $$`}
          Upper Tail Risk (C-D):{" "}
          {`$$ ${(results.pfa_term2 / 100).toFixed(6)} $$`}
          Total PFA = {`$$ \\mathbf{${results.pfa.toFixed(4)}\\%} $$`}
        </div>
      </div>
    </div>
  );
};

const PfrBreakdownModal = ({ results, inputs, onClose }) => {
  useEffect(() => {
    window.MathJax && window.MathJax.typesetPromise();
  }, [results, inputs]);
  if (!results || !inputs) return null;

  const mid = (inputs.LUp + inputs.LLow) / 2;
  const LLow_norm = inputs.LLow - mid;
  const LUp_norm = inputs.LUp - mid;
  const ALow_norm = results.ALow - mid;
  const AUp_norm = results.AUp - mid;

  const z1 = LUp_norm / results.uUUT;
  const z2 = ALow_norm / results.uDev;
  const z3 = LLow_norm / results.uUUT;
  const z4 = -LLow_norm / results.uUUT;
  const z5 = -AUp_norm / results.uDev;
  const z6 = -LUp_norm / results.uUUT;

  return (
    <div className="modal-overlay">
      <div className="modal-content breakdown-modal-content">
        <button onClick={onClose} className="modal-close-button">
          &times;
        </button>
        <h3>PFR Calculation Breakdown</h3>
        <div className="breakdown-step">
          <h5>Step 1: Formula</h5>
          <p>
            The Probability of False Reject is the risk of rejecting an
            in-tolerance UUT.
          </p>
          {`$$ PFR = \\int_{-L}^{L} G(x) \\left[ 1 - \\Phi(\\frac{A-x}{u_{cal}}) + \\Phi(\\frac{-A-x}{u_{cal}}) \\right] dx $$`}
        </div>
        <div className="breakdown-step">
          <h5>Step 2: Bivariate Normal Probabilities (Φ₂)</h5>
          <p>
            Using Z-scores and correlation (ρ = {results.correlation.toFixed(4)}
            ), we solve the Bivariate Normal CDF (Φ₂).
          </p>
          Term A:{" "}
          {`$$ \\Phi_2(${z1.toFixed(2)}, ${z2.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z1,
            z2,
            results.correlation
          ).toFixed(6)} $$`}
          Term B:{" "}
          {`$$ \\Phi_2(${z3.toFixed(2)}, ${z2.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z3,
            z2,
            results.correlation
          ).toFixed(6)} $$`}
          Term C:{" "}
          {`$$ \\Phi_2(${z4.toFixed(2)}, ${z5.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z4,
            z5,
            results.correlation
          ).toFixed(6)} $$`}
          Term D:{" "}
          {`$$ \\Phi_2(${z6.toFixed(2)}, ${z5.toFixed(
            2
          )}, \\rho) = ${bivariateNormalCDF(
            z6,
            z5,
            results.correlation
          ).toFixed(6)} $$`}
        </div>
        <div className="breakdown-step">
          <h5>Step 3: Final PFR Calculation</h5>
          Lower Side Risk (A-B):{" "}
          {`$$ ${(results.pfr_term1 / 100).toFixed(6)} $$`}
          Upper Side Risk (C-D):{" "}
          {`$$ ${(results.pfr_term2 / 100).toFixed(6)} $$`}
          Total PFR = {`$$ \\mathbf{${results.pfr.toFixed(4)}\\%} $$`}
        </div>
      </div>
    </div>
  );
};

const RiskAnalysisDashboard = ({ results, onShowBreakdown }) => {
  useEffect(() => {
    if (results && window.MathJax) {
      window.MathJax.typesetPromise();
    }
  }, [results]);

  if (!results) return null;

  const getPfaClass = (pfa) => {
    if (pfa > 5) return "status-bad";
    if (pfa > 2) return "status-warning";
    return "status-good";
  };

  return (
    <div className="risk-analysis-container">
      <div className="risk-analysis-dashboard">
        <div className="risk-card">
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
              <span className="label">Std. Unc. of Cal (uₑₐₗ)</span>
              <span className="value">{results.uCal.toFixed(3)} ppm</span>
            </li>
            <li>
              <span className="label">Std. Unc. of UUT (uᵤᵤₜ)</span>
              <span className="value">{results.uUUT.toFixed(3)} ppm</span>
            </li>
            <li>
              <span className="label">Acceptance Limit (Aₗₒw)</span>
              <span className="value">{results.ALow.toFixed(3)} ppm</span>
            </li>
            <li>
              <span className="label">Acceptance Limit (Aᵤₚ)</span>
              <span className="value">{results.AUp.toFixed(3)} ppm</span>
            </li>
          </ul>
          <button
            className="button button-small breakdown-button"
            onClick={() => onShowBreakdown("inputs")}
          >
            Show Breakdown
          </button>
        </div>

        <div className="risk-card tur-card">
          <div className="risk-value">{results.tur.toFixed(2)} : 1</div>
          <div className="risk-label">Test Uncertainty Ratio (TUR)</div>
          <div className="risk-explanation">
            A ratio of the UUT's tolerance to the measurement uncertainty.
          </div>
          <button
            className="button button-small breakdown-button"
            onClick={() => onShowBreakdown("tur")}
          >
            Show Breakdown
          </button>
        </div>

        <div className="risk-card tur-card">
          <div className="risk-value">{results.tar.toFixed(2)} : 1</div>
          <div className="risk-label">Test Acceptance Ratio (TAR)</div>
          <div className="risk-explanation">
            A ratio of the UUT's tolerance span to the TMDE's (Standard's)
            tolerance span.
          </div>
          <button
            className="button button-small breakdown-button"
            onClick={() => onShowBreakdown("tar")}
          >
            Show Breakdown
          </button>
        </div>

        <div className={`risk-card pfa-card ${getPfaClass(results.pfa)}`}>
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
          <button
            className="button button-small breakdown-button"
            onClick={() => onShowBreakdown("pfa")}
          >
            Show Breakdown
          </button>
        </div>

        <div className="risk-card pfr-card">
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
          <button
            className="button button-small breakdown-button"
            onClick={() => onShowBreakdown("pfr")}
          >
            Show Breakdown
          </button>
        </div>
      </div>
    </div>
  );
};

function Analysis({
  testPointData,
  showNotification,
  selectedSessionId,
  onDataSave,
}) {
  const { readings, results, testPointInfo } = testPointData;
  const [analysisMode, setAnalysisMode] = useState("detailed");
  const [manualComponents, setManualComponents] = useState([]);
  const [newComponent, setNewComponent] = useState({
    name: "",
    type: "B",
    distribution: "uniform",
    toleranceLimit: "",
    expandedUncertainty: "",
    coverageFactor: 2,
    dof: Infinity,
    category: "System & Environmental",
  });
  const [useTDistribution, setUseTDistribution] = useState(false);
  const [calcResults, setCalcResults] = useState(null);
  const isInitialMount = useRef(true);
  const [riskInputs, setRiskInputs] = useState({
    LLow: "",
    LUp: "",
    reliability: 0.95,
    guardBandMultiplier: 1,
  });
  const [riskResults, setRiskResults] = useState(null);
  const [breakdownModal, setBreakdownModal] = useState(null);

  useEffect(() => {
    setRiskResults(null);
  }, [riskInputs, calcResults]);

  useEffect(() => {
    if (results && results.is_detailed_uncertainty_calculated) {
      setCalcResults({
        combinedUncertainty: results.combined_uncertainty,
        effectiveDof:
          results.effective_dof === null ? Infinity : results.effective_dof,
        kValue: results.k_value,
        expandedUncertainty: results.expanded_uncertainty,
      });
    } else {
      setCalcResults(null);
    }

    if (results && results.manual_uncertainty_components) {
      setManualComponents(results.manual_uncertainty_components);
    } else {
      setManualComponents([]);
    }

    isInitialMount.current = true;
  }, [results]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setCalcResults(null);
  }, [manualComponents.length, useTDistribution]);

  useEffect(() => {
    if (
      calcResults &&
      window.MathJax &&
      typeof window.MathJax.typesetPromise === "function"
    ) {
      window.MathJax.typesetPromise().catch((err) =>
        console.error("MathJax typeset failed:", err)
      );
    }
  }, [calcResults]);

  const formatShuntKey = (current) => {
    const numCurrent = parseFloat(current);
    if (isNaN(numCurrent)) return null;
    if (numCurrent < 1) return `${numCurrent * 1000} mA`;
    return `${numCurrent} A`;
  };
  const shuntKey = formatShuntKey(testPointInfo.current);
  const toPpm = useCallback((val) => val * 1e6, []);
  const allUncertaintyComponents = useMemo(() => {
    const typeAComponents = READING_KEYS.map((item) => {
      const readingsArray = (readings[`${item.key}_readings`] || []).filter(r => r.is_stable !== false);
      const avg = results[`${item.key}_avg`];
      const stddev = results[`${item.key}_stddev`];
      const n = readingsArray.length;
      if (!stddev || !avg || avg === 0 || n < 2) return null;

      const stdUncertaintyOfMean = stddev / Math.sqrt(n);

      return {
        id: `type-a-${item.key}`,
        name: item.name,
        type: "A",
        value: toPpm(stdUncertaintyOfMean / Math.abs(avg)),
        dof: n - 1,
        isAuto: true,
        category: item.category,
        calculationDetails: { stddev, n, avg },
      };
    }).filter(Boolean);
    return [...typeAComponents, ...manualComponents];
  }, [readings, results, manualComponents, toPpm]);
  const basicSpecificationUncertainty = useMemo(() => {
    const specRow = BASIC_SPECIFICATIONS[shuntKey];
    if (!specRow) return null;
    const freq = testPointInfo.frequencyValue;
    if (freq < 1000) return specRow.DC;
    const freqPoints = Object.keys(specRow)
      .filter((k) => k !== "DC")
      .map(Number)
      .sort((a, b) => a - b);
    if (freq >= freqPoints[freqPoints.length - 1])
      return specRow[freqPoints[freqPoints.length - 1].toString()];
    const f_lower = freqPoints.findLast((p) => p <= freq);
    const f_upper = freqPoints.find((p) => p > freq);
    if (!f_lower || !f_upper) return specRow.DC;
    const s_lower = specRow[f_lower.toString()];
    const s_upper = specRow[f_upper.toString()];
    return (
      s_lower + ((freq - f_lower) * (s_upper - s_lower)) / (f_upper - f_lower)
    );
  }, [shuntKey, testPointInfo]);

  const saveManualComponents = useCallback(
    async (updatedComponents) => {
      const payload = { manual_uncertainty_components: updatedComponents };
      const testPointId = testPointInfo.testPointId;
      try {
        await axios.put(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${testPointId}/update-results/`,
          payload
        );
      } catch (error) {
        showNotification("Failed to save budget changes.", "error");
        console.error("Failed to save manual components", error);
      }
    },
    [selectedSessionId, testPointInfo.testPointId, showNotification]
  );

  const handleAddComponent = () => {
    let value = null;
    let toleranceLimit = null;

    switch (newComponent.distribution) {
      case "uniform":
      case "triangular":
        const tol = parseFloat(newComponent.toleranceLimit);
        if (isNaN(tol) || tol <= 0) {
          showNotification(
            "Please provide a valid, positive tolerance limit.",
            "warning"
          );
          return;
        }
        value =
          newComponent.distribution === "uniform"
            ? tol / Math.sqrt(3)
            : tol / Math.sqrt(6);
        toleranceLimit = tol;
        break;
      case "normal":
        const expUnc = parseFloat(newComponent.expandedUncertainty);
        const k = parseFloat(newComponent.coverageFactor);
        if (isNaN(expUnc) || isNaN(k) || expUnc <= 0 || k <= 0) {
          showNotification(
            "Please provide valid expanded uncertainty and coverage factor values.",
            "warning"
          );
          return;
        }
        value = expUnc / k;
        toleranceLimit = expUnc;
        break;
      default:
        showNotification("Invalid distribution selected.", "error");
        return;
    }

    if (!newComponent.name || value === null) {
      showNotification(
        "Component name and a valid uncertainty value are required.",
        "warning"
      );
      return;
    }

    const dof = parseFloat(newComponent.dof);
    const componentToAdd = {
      id: Date.now(),
      name: newComponent.name,
      type: "B",
      value: value,
      dof: isNaN(dof) || dof <= 0 ? Infinity : dof,
      isAuto: false,
      distribution: newComponent.distribution,
      toleranceLimit: toleranceLimit,
      coverageFactor:
        newComponent.distribution === "normal"
          ? newComponent.coverageFactor
          : null,
      category: newComponent.category,
    };

    const updatedComponents = [...manualComponents, componentToAdd];
    setManualComponents(updatedComponents);
    saveManualComponents(updatedComponents);
    setNewComponent({
      name: "",
      type: "B",
      distribution: "uniform",
      toleranceLimit: "",
      expandedUncertainty: "",
      coverageFactor: 2,
      dof: Infinity,
      category: "System & Environmental",
    });
  };

  const handleRemoveComponent = (id) => {
    const updatedComponents = manualComponents.filter((c) => c.id !== id);
    setManualComponents(updatedComponents);
    saveManualComponents(updatedComponents);
  };
  const handleInputChange = (e) =>
    setNewComponent((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleCalculateUncertainty = async () => {
    let componentsToCalculate = allUncertaintyComponents;
    if (
      componentsToCalculate.length === 0 ||
      componentsToCalculate.some((c) => c.value === null || isNaN(c.value))
    ) {
      showNotification("Uncertainty budget is empty or invalid.", "warning");
      return;
    }

    const combinedVariance = componentsToCalculate.reduce(
      (sum, comp) => sum + Math.pow(comp.value, 2),
      0
    );
    const combinedUncertaintyRaw = Math.sqrt(combinedVariance);
    const combinedUncertainty = parseFloat(combinedUncertaintyRaw.toFixed(4));

    const numerator = Math.pow(combinedUncertainty, 4);
    const denominator = componentsToCalculate.reduce(
      (sum, comp) =>
        comp.dof === Infinity ? sum : sum + Math.pow(comp.value, 4) / comp.dof,
      0
    );
    const effectiveDof = denominator > 0 ? numerator / denominator : Infinity;

    const kValue = useTDistribution
      ? getKValueFromTDistribution(effectiveDof)
      : 2;
    const expandedUncertainty = kValue * combinedUncertainty;
    const newResults = {
      combinedUncertainty,
      effectiveDof,
      kValue,
      expandedUncertainty,
    };

    const payload = {
      manual_uncertainty_components: manualComponents,
      combined_uncertainty: newResults.combinedUncertainty,
      effective_dof:
        newResults.effectiveDof === Infinity ? null : newResults.effectiveDof,
      k_value: newResults.kValue,
      expanded_uncertainty: newResults.expandedUncertainty,
      is_detailed_uncertainty_calculated: true,
    };

    try {
      const testPointId = testPointInfo.testPointId;
      await axios.put(
        `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${testPointId}/update-results/`,
        payload
      );
      setCalcResults(newResults);
      showNotification("Uncertainty calculation saved to database.", "success");
      onDataSave();
    } catch (error) {
      console.error("Failed to save uncertainty results", error);
      showNotification("Failed to save uncertainty results.", "error");
    }
  };

  const handleRiskInputChange = (e) => {
    const { name, value } = e.target;
    setRiskInputs((prev) => ({ ...prev, [name]: value }));
  };

  const calculateRiskMetrics = () => {
    const LLow = parseFloat(riskInputs.LLow);
    const LUp = parseFloat(riskInputs.LUp);
    const reliability = parseFloat(riskInputs.reliability);
    const guardBandMultiplier = parseFloat(riskInputs.guardBandMultiplier);

    if (isNaN(LLow) || isNaN(LUp) || LUp <= LLow) {
      showNotification("Please enter valid UUT tolerance limits.", "warning");
      return;
    }
    if (isNaN(reliability) || reliability <= 0 || reliability >= 1) {
      showNotification(
        "Please enter a valid reliability (e.g., 0.95).",
        "warning"
      );
      return;
    }
    if (
      isNaN(guardBandMultiplier) ||
      guardBandMultiplier <= 0 ||
      guardBandMultiplier > 1
    ) {
      showNotification(
        "Guard Band Multiplier must be between 0 and 1.",
        "warning"
      );
      return;
    }
    if (!calcResults) {
      showNotification(
        "A detailed uncertainty budget must be calculated first.",
        "warning"
      );
      return;
    }

    const tmdeComponent = allUncertaintyComponents.find(
      (c) => c.category === "Standard Instrument" && c.type === "B"
    );

    if (!tmdeComponent || !tmdeComponent.toleranceLimit) {
      showNotification(
        "Could not find a 'Standard Instrument' component with a tolerance limit in the budget. Please add one to calculate TAR.",
        "warning"
      );
      return;
    }
    const tmdeToleranceSpan = tmdeComponent.toleranceLimit * 2;

    const uCal = calcResults.combinedUncertainty;
    const mid = (LUp + LLow) / 2;
    const LUp_symmetric = Math.abs(LUp - mid);
    const uDev = LUp_symmetric / probit((1 + reliability) / 2);
    const uUUT2 = uDev ** 2 - uCal ** 2;

    let uUUT = 0;
    if (uUUT2 <= 0) {
      showNotification(
        "Warning: UUT uncertainty is non-positive. Test uncertainty may be too large for the specified reliability and tolerance.",
        "warning"
      );
      uUUT = 0;
    } else {
      uUUT = Math.sqrt(uUUT2);
    }

    const ALow = LLow * guardBandMultiplier;
    const AUp = LUp * guardBandMultiplier;
    const uDev_risk = Math.sqrt(uUUT ** 2 + uCal ** 2);
    const correlation = uUUT === 0 || uDev_risk === 0 ? 0 : uUUT / uDev_risk;

    const LLow_norm = LLow - mid;
    const LUp_norm = LUp - mid;
    const ALow_norm = ALow - mid;
    const AUp_norm = AUp - mid;

    const pfa_term1 =
      bivariateNormalCDF(LLow_norm / uUUT, AUp_norm / uDev_risk, correlation) -
      bivariateNormalCDF(LLow_norm / uUUT, ALow_norm / uDev_risk, correlation);
    const pfa_term2 =
      bivariateNormalCDF(
        -LUp_norm / uUUT,
        -ALow_norm / uDev_risk,
        correlation
      ) -
      bivariateNormalCDF(-LUp_norm / uUUT, -AUp_norm / uDev_risk, correlation);
    const pfaResult =
      isNaN(pfa_term1) || isNaN(pfa_term2) ? 0 : pfa_term1 + pfa_term2;

    const pfr_term1 =
      bivariateNormalCDF(LUp_norm / uUUT, ALow_norm / uDev_risk, correlation) -
      bivariateNormalCDF(LLow_norm / uUUT, ALow_norm / uDev_risk, correlation);
    const pfr_term2 =
      bivariateNormalCDF(
        -LLow_norm / uUUT,
        -AUp_norm / uDev_risk,
        correlation
      ) -
      bivariateNormalCDF(-LUp_norm / uUUT, -AUp_norm / uDev_risk, correlation);
    const pfrResult =
      isNaN(pfr_term1) || isNaN(pfr_term2) ? 0 : pfr_term1 + pfr_term2;

    const turResult = (LUp - LLow) / (2 * calcResults.expandedUncertainty);
    const tarResult =
      tmdeToleranceSpan !== 0 ? (LUp - LLow) / tmdeToleranceSpan : 0;

    setRiskResults({
      tur: turResult,
      tar: tarResult,
      pfa: pfaResult * 100,
      pfr: pfrResult * 100,
      pfa_term1: (isNaN(pfa_term1) ? 0 : pfa_term1) * 100,
      pfa_term2: (isNaN(pfa_term2) ? 0 : pfa_term2) * 100,
      pfr_term1: (isNaN(pfr_term1) ? 0 : pfr_term1) * 100,
      pfr_term2: (isNaN(pfr_term2) ? 0 : pfr_term2) * 100,
      uCal,
      uUUT,
      uDev: uDev_risk,
      correlation,
      ALow,
      AUp,
      expandedUncertainty: calcResults.expandedUncertainty,
      tmdeToleranceSpan: tmdeToleranceSpan,
    });
  };

  if (!results || results.delta_uut_ppm === null) {
    return (
      <div className="content-area">
        <p>
          The final AC-DC Difference has not been calculated. Please complete
          the calculation on the "Run Calibration" tab.
        </p>
      </div>
    );
  }

  const renderSpecComparison = () => {
    if (!calcResults) {
      return (
        <div className="form-section-warning">
          <p style={{ fontWeight: "bold" }}>
            A detailed uncertainty budget must be calculated first.
          </p>
          <p style={{ marginTop: "10px" }}>
            Please go to the "Detailed Budget" tab, complete your budget, and
            click "Calculate & Save Uncertainty" to enable this comparison.
          </p>
        </div>
      );
    }

    const U_user = calcResults.expandedUncertainty;
    const U_spec = basicSpecificationUncertainty;
    const percentageOfSpec = (U_user / U_spec) * 100;

    let status = "Within Specification";
    let statusClass = "status-good";
    if (percentageOfSpec > 100) {
      status = "Exceeds Specification";
      statusClass = "status-bad";
    } else if (percentageOfSpec > 90) {
      status = "Approaching Limit";
      statusClass = "status-warning";
    }

    const rotation = Math.min(percentageOfSpec, 120) * 1.5;
    const needleAngle = -90 + rotation;

    const GaugeBackground = () => (
      <svg
        className="gauge-svg-background"
        viewBox="-5 -5 210 115"
        preserveAspectRatio="none"
      >
        <path
          d="M 10 100 A 90 90 0 0 1 163.64 36.36"
          className="gauge-arc-good"
        />
        <path
          d="M 163.64 36.36 A 90 90 0 0 1 177.94 55"
          className="gauge-arc-warning"
        />
        <path d="M 177.94 55 A 90 90 0 0 1 190 100" className="gauge-arc-bad" />
      </svg>
    );

    return (
      <div className={`spec-dashboard ${statusClass}`}>
        <div className="spec-gauge-container">
          <div className="spec-gauge">
            <GaugeBackground />
            <div
              className="gauge-needle"
              style={{ transform: `rotate(${needleAngle}deg)` }}
            ></div>
            <div className="gauge-center-pivot"></div>
          </div>
          <div className="gauge-value">
            {percentageOfSpec.toFixed(1)}
            <span>%</span>
          </div>
          <div className="gauge-label">of Specification Limit</div>
        </div>
        <div className="spec-details-container">
          <div className="spec-detail-card user-spec">
            <span className="detail-label">Your Expanded Uncertainty (U)</span>
            <span className="detail-value">{U_user.toFixed(3)} ppm</span>
            <span className="detail-sub-value">
              k ≈ {calcResults.kValue.toFixed(2)}
            </span>
          </div>
          <div className="spec-detail-card mfg-spec">
            <span className="detail-label">Mfr. Specification (U)</span>
            <span className="detail-value">{U_spec.toFixed(3)} ppm</span>
            <span className="detail-sub-value">k = 2.00</span>
          </div>
        </div>
        <div className="spec-status-footer">
          <strong>Status:</strong> {status}
        </div>
      </div>
    );
  };

  return (
    <div>
      {breakdownModal === "tar" && (
        <TarBreakdownModal
          results={riskResults}
          inputs={{
            ...riskInputs,
            LLow: parseFloat(riskInputs.LLow),
            LUp: parseFloat(riskInputs.LUp),
          }}
          onClose={() => setBreakdownModal(null)}
        />
      )}
      {breakdownModal === "inputs" && (
        <InputsBreakdownModal
          results={riskResults}
          inputs={{
            ...riskInputs,
            LLow: parseFloat(riskInputs.LLow),
            LUp: parseFloat(riskInputs.LUp),
          }}
          onClose={() => setBreakdownModal(null)}
        />
      )}
      {breakdownModal === "tur" && (
        <TurBreakdownModal
          results={riskResults}
          inputs={{
            ...riskInputs,
            LLow: parseFloat(riskInputs.LLow),
            LUp: parseFloat(riskInputs.LUp),
          }}
          onClose={() => setBreakdownModal(null)}
        />
      )}
      {breakdownModal === "pfa" && (
        <PfaBreakdownModal
          results={riskResults}
          inputs={{
            ...riskInputs,
            LLow: parseFloat(riskInputs.LLow),
            LUp: parseFloat(riskInputs.LUp),
          }}
          onClose={() => setBreakdownModal(null)}
        />
      )}
      {breakdownModal === "pfr" && (
        <PfrBreakdownModal
          results={riskResults}
          inputs={{
            ...riskInputs,
            LLow: parseFloat(riskInputs.LLow),
            LUp: parseFloat(riskInputs.LUp),
          }}
          onClose={() => setBreakdownModal(null)}
        />
      )}

      <div
        className="view-toggle"
        style={{ justifyContent: "center", marginBottom: "30px" }}
      >
        <button
          className={analysisMode === "detailed" ? "active" : ""}
          onClick={() => setAnalysisMode("detailed")}
        >
          Detailed Budget
        </button>
        <button
          className={analysisMode === "risk" ? "active" : ""}
          onClick={() => setAnalysisMode("risk")}
        >
          Risk Analysis
        </button>
        <button
          className={analysisMode === "basic" ? "active" : ""}
          onClick={() => setAnalysisMode("basic")}
        >
          Specification Comparison
        </button>
      </div>

      <Accordion title="Final Measurement Result" startOpen={true}>
        <FinalResultCard
          result={results.delta_uut_ppm}
          calcResults={calcResults}
          testPointInfo={testPointInfo}
        />
      </Accordion>

      {analysisMode === "detailed" && (
        <div>
          <div className="configuration-panel">
            <Accordion title="Add Other Type B Component">
              <div className="config-grid" style={{ paddingTop: "15px" }}>
                <div className="config-column">
                  <label>Component Name</label>
                  <input
                    type="text"
                    name="name"
                    value={newComponent.name}
                    onChange={handleInputChange}
                    placeholder="e.g., UUT Stability Spec"
                  />
                </div>
                <div className="config-column">
                  <label>Category</label>
                  <select
                    name="category"
                    value={newComponent.category}
                    onChange={handleInputChange}
                  >
                    <option value="System & Environmental">
                      System & Environmental
                    </option>
                    <option value="Standard Instrument">
                      Standard Instrument (TMDE)
                    </option>
                    <option value="Unit Under Test (UUT)">
                      Unit Under Test (UUT)
                    </option>
                  </select>
                </div>
                <div className="config-column" style={{ gridColumn: "1 / -1" }}>
                  <label>Distribution</label>
                  <select
                    name="distribution"
                    value={newComponent.distribution}
                    onChange={handleInputChange}
                  >
                    <option value="uniform">Uniform (Rectangular)</option>
                    <option value="triangular">Triangular</option>
                    <option value="normal">Normal</option>
                  </select>
                </div>

                {(newComponent.distribution === "uniform" ||
                  newComponent.distribution === "triangular") && (
                  <div className="config-column">
                    <label>Tolerance Limits (± ppm)</label>
                    <input
                      type="number"
                      step="any"
                      name="toleranceLimit"
                      value={newComponent.toleranceLimit}
                      onChange={handleInputChange}
                      placeholder="e.g., 100"
                    />
                  </div>
                )}

                {newComponent.distribution === "normal" && (
                  <>
                    <div className="config-column">
                      <label>Expanded Uncertainty (± ppm)</label>
                      <input
                        type="number"
                        step="any"
                        name="expandedUncertainty"
                        value={newComponent.expandedUncertainty}
                        onChange={handleInputChange}
                        placeholder="e.g., 50"
                      />
                    </div>
                    <div className="config-column">
                      <label>Coverage Factor (k)</label>
                      <input
                        type="number"
                        step="any"
                        name="coverageFactor"
                        value={newComponent.coverageFactor}
                        onChange={handleInputChange}
                      />
                    </div>
                  </>
                )}
                <div className="config-column">
                  <label>Degrees of Freedom</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    name="dof"
                    value={newComponent.dof}
                    onChange={handleInputChange}
                    placeholder="Infinity"
                  />
                </div>
              </div>
              <button
                onClick={handleAddComponent}
                className="button"
                style={{ marginTop: "15px" }}
              >
                Add Component
              </button>
            </Accordion>
          </div>

          <div className="configuration-panel">
            <Accordion
              title="Uncertainty Budget (AC-DC Difference, ppm)"
              startOpen={true}
            >
              <div className="uncertainty-legend">
                <h5>Standard Uncertainty (uᵢ)</h5>
                <p>
                  For Type A components, this is calculated from the standard
                  deviation of the mean of the measurement data.
                </p>
                <p
                  style={{
                    textAlign: "center",
                    fontFamily: "serif",
                    fontSize: "1.2rem",
                    margin: "10px 0",
                  }}
                >{`$$ u_i = \\frac{\\sigma / \\sqrt{n}}{|Avg|} \\times 10^6 $$`}</p>
                <hr />
                <h5>Degrees of Freedom (vᵢ)</h5>
                <p>
                  Represents the statistical reliability of an uncertainty
                  component. For Type A, it's the number of samples minus one
                  (n-1). For most Type B estimates, it is considered infinite.
                </p>
                <hr />
                <h5>Effective Degrees of Freedom (v_eff)</h5>
                <p>
                  The effective degrees of freedom for the combined uncertainty
                  is calculated using the Welch-Satterthwaite equation:
                </p>
                <p
                  style={{
                    textAlign: "center",
                    fontFamily: "serif",
                    fontSize: "1.2rem",
                    margin: "10px 0",
                  }}
                >{`$$v_{eff} = \\frac{u_c^4}{\\sum_{i=1}^{N} \\frac{u_i^4}{v_i}}$$`}</p>
              </div>
              <UncertaintyBudgetTable
                components={allUncertaintyComponents}
                onRemove={handleRemoveComponent}
                calcResults={calcResults}
              />
            </Accordion>
          </div>
          <div className="calculation-options">
            <div className="checkbox-container">
              <input
                type="checkbox"
                id="use-t-dist"
                checked={useTDistribution}
                onChange={(e) => setUseTDistribution(e.target.checked)}
              />
              <label htmlFor="use-t-dist">
                Use Student's t-distribution for k-factor (more precise)
              </label>
            </div>
            <button
              onClick={handleCalculateUncertainty}
              className="button"
              style={{
                fontSize: "1.1rem",
                padding: "12px 30px",
                margin: "0 0 0 20px",
              }}
            >
              Calculate & Save Uncertainty
            </button>
          </div>
        </div>
      )}

      {analysisMode === "risk" && (
        <Accordion title="Risk & Conformance Analysis" startOpen={true}>
          {!calcResults ? (
            <div className="form-section-warning">
              <p style={{ fontWeight: "bold" }}>
                A detailed uncertainty budget must be calculated first.
              </p>
              <p style={{ marginTop: "10px" }}>
                Please go to the "Detailed Budget" tab, complete your budget,
                and click "Calculate & Save Uncertainty" to enable risk
                analysis.
              </p>
            </div>
          ) : (
            <>
              <div className="risk-inputs-container">
                <div className="config-column">
                  <label>UUT Lower Tolerance Limit (LLow)</label>
                  <input
                    type="number"
                    name="LLow"
                    value={riskInputs.LLow}
                    onChange={handleRiskInputChange}
                    placeholder="e.g., -100"
                  />
                </div>
                <div className="config-column">
                  <label>UUT Upper Tolerance Limit (LUp)</label>
                  <input
                    type="number"
                    name="LUp"
                    value={riskInputs.LUp}
                    onChange={handleRiskInputChange}
                    placeholder="e.g., 100"
                  />
                </div>
                <div className="config-column">
                  <label>Target Reliability (R)</label>
                  <input
                    type="number"
                    step="0.01"
                    max="0.9999"
                    min="0.5"
                    name="reliability"
                    value={riskInputs.reliability}
                    onChange={handleRiskInputChange}
                  />
                </div>
                <div className="config-column">
                  <label>
                    Guard Band Multiplier
                    <span
                      className="tooltip-container"
                      style={{ marginLeft: "5px" }}
                    >
                      &#9432;
                      <span
                        className="tooltip-text"
                        style={{ width: "250px", marginLeft: "-125px" }}
                      >
                        Reduces acceptance limits to lower false accept risk.
                        Default is 1 (no guard band). A value of 0.95 sets
                        acceptance limits to 95% of tolerance limits.
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    max="1"
                    min="0"
                    name="guardBandMultiplier"
                    value={riskInputs.guardBandMultiplier}
                    onChange={handleRiskInputChange}
                  />
                </div>
              </div>
              <button
                onClick={calculateRiskMetrics}
                className="button"
                style={{ marginTop: "10px" }}
              >
                Calculate Risk Metrics
              </button>
              {riskResults && (
                <RiskAnalysisDashboard
                  results={riskResults}
                  onShowBreakdown={(modalType) => setBreakdownModal(modalType)}
                />
              )}
            </>
          )}
        </Accordion>
      )}

      {analysisMode === "basic" && (
        <Accordion title="Specification Comparison Analysis" startOpen={true}>
          {renderSpecComparison()}
        </Accordion>
      )}
    </div>
  );
}

function UncertaintyAnalysis({
  showNotification,
  sharedFocusedTestPoint,
  onDataUpdate,
  orderedTestPoints,
  setSharedFocusedTestPoint,
}) {
  const { selectedSessionId } = useInstruments();
  const [testPointData, setTestPointData] = useState(null);

  // This effect handles auto-selecting a valid point for analysis
  useEffect(() => {
    if (!orderedTestPoints || !setSharedFocusedTestPoint) return;

    // Find all points that have a final, averaged result, making them "analysis-ready"
    const analysisReadyPoints = orderedTestPoints.filter(
      (p) =>
        p.forward?.results?.delta_uut_ppm_avg !== null &&
        p.forward?.results?.delta_uut_ppm_avg !== undefined
    );

    // Check if the currently focused point is in our valid list
    const isCurrentPointReady = sharedFocusedTestPoint
      ? analysisReadyPoints.some((p) => p.key === sharedFocusedTestPoint.key)
      : false;

    // If the current point isn't ready (or no point is focused),
    // and we have at least one point that IS ready, select the first one.
    if (!isCurrentPointReady && analysisReadyPoints.length > 0) {
      setSharedFocusedTestPoint(analysisReadyPoints[0]);
    }
  }, [orderedTestPoints, sharedFocusedTestPoint, setSharedFocusedTestPoint]);

  const formatFrequency = (value) =>
    (
      AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
        text: `${value}Hz`,
      }
    ).text;

  useEffect(() => {
    if (!sharedFocusedTestPoint) {
      setTestPointData(null);
      return;
    }

    const hasAveragedResult =
      sharedFocusedTestPoint.forward?.results?.delta_uut_ppm_avg !== null &&
      sharedFocusedTestPoint.forward?.results?.delta_uut_ppm_avg !== undefined;

    if (hasAveragedResult) {
      const { forward, reverse } = sharedFocusedTestPoint;

      const combinedReadings = {};
      READING_KEY_NAMES.forEach((key) => {
        const forwardReadings = forward.readings?.[key] || [];
        const reverseReadings = reverse.readings?.[key] || [];
        combinedReadings[key] = [...forwardReadings, ...reverseReadings];
      });

      const combinedResults = {};

        READING_KEY_NAMES.forEach((key) => {
          const readings = combinedReadings[key]
            .filter((r) => r.is_stable !== false)
            .map((r) => (typeof r === "object" ? r.value : r));

          if (readings.length > 0) {
            // Use Welford's Algorithm instead of the standard reduce/pow method
            let mean = 0;
            let M2 = 0;

            readings.forEach((val, index) => {
              const delta = val - mean;
              mean += delta / (index + 1);
              M2 += delta * (val - mean);
            });

            // Handle edge case where there is only 1 reading
            const variance = readings.length > 1 ? M2 / (readings.length - 1) : 0;
            const stdDev = Math.sqrt(variance);

            const avgKey = key.replace("_readings", "_avg");
            const stddevKey = key.replace("_readings", "_stddev");
            
            combinedResults[avgKey] = mean;
            combinedResults[stddevKey] = stdDev;
          }
        });

      Object.assign(combinedResults, {
        eta_std: forward.results.eta_std,
        eta_ti: forward.results.eta_ti,
        delta_std: forward.results.delta_std,
        delta_ti: forward.results.delta_ti,
        delta_std_known: forward.results.delta_std_known,
        is_detailed_uncertainty_calculated:
          forward.results.is_detailed_uncertainty_calculated,
        manual_uncertainty_components:
          forward.results.manual_uncertainty_components,
        combined_uncertainty: forward.results.combined_uncertainty,
        effective_dof: forward.results.effective_dof,
        k_value: forward.results.k_value,
        expanded_uncertainty: forward.results.expanded_uncertainty,
      });

      combinedResults.delta_uut_ppm = forward.results.delta_uut_ppm_avg;

      setTestPointData({
        readings: combinedReadings,
        results: combinedResults,
        testPointInfo: {
          current: sharedFocusedTestPoint.current,
          frequency: formatFrequency(sharedFocusedTestPoint.frequency),
          frequencyValue: sharedFocusedTestPoint.frequency,
          direction: "Averaged",
          testPointId: forward.id,
        },
      });
    } else {
      setTestPointData(null);
    }
  }, [sharedFocusedTestPoint]);

  const hasAveragedResult =
    sharedFocusedTestPoint?.forward?.results?.delta_uut_ppm_avg !== null &&
    sharedFocusedTestPoint?.forward?.results?.delta_uut_ppm_avg !== undefined;

  return (
    <div className="content-area uncertainty-analysis-page">
      <h2>Uncertainty Analysis</h2>
      {!selectedSessionId ? (
        <div className="form-section-warning">
          <p>
            Please select a session from the "Session Setup" tab to perform
            analysis.
          </p>
        </div>
      ) : !sharedFocusedTestPoint ? (
        <div className="placeholder-content" style={{ textAlign: "center" }}>
          <h3>Select a Test Point</h3>
          <p>
            Please select a test point from the list to begin the uncertainty
            analysis.
          </p>
        </div>
      ) : !hasAveragedResult ? (
        <div className="form-section-warning">
          <h3>Analysis Not Available</h3>
          <p>
            The selected test point ({sharedFocusedTestPoint.current}A @{" "}
            {formatFrequency(sharedFocusedTestPoint.frequency)}) does not have a
            final averaged result.
          </p>
          <p>
            Please complete readings for both Forward and Reverse directions and
            calculate the result on the 'Run Calibration' tab.
          </p>
        </div>
      ) : testPointData ? (
        <Analysis
          testPointData={testPointData}
          showNotification={showNotification}
          selectedSessionId={selectedSessionId}
          onDataSave={onDataUpdate}
        />
      ) : (
        <div className="placeholder-content">
          <p>Loading analysis data for the selected test point...</p>
        </div>
      )}
    </div>
  );
}
export default UncertaintyAnalysis;