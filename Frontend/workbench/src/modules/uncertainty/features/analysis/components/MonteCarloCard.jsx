import React, { useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import {
  unitSystem,
  calculateDerivedUncertainty,
} from "../../../utils/uncertaintyMath";
import {
  MC_SAMPLE_CHOICES,
  normalizeMcSampleCount,
} from "../../../utils/monteCarlo";
import useMonteCarlo from "../hooks/useMonteCarlo";

const fmt = (v, digits = 5) =>
  Number.isFinite(v) ? parseFloat(v.toPrecision(digits)).toString() : "N/A";

// GUM-vs-MC agreement threshold for the validation verdict. JCGM 101 §8 ties
// the tolerance to the reported digits; 5% is the pragmatic equivalent for a
// two-significant-digit uncertainty statement.
const VALIDATION_TOLERANCE_PCT = 5;

/**
 * Monte Carlo (GUM Supplement 1) propagation card for a derived test point.
 * Shown when the point's propagationMode is "montecarlo". Runs the simulation
 * (worker + debounce + cache via useMonteCarlo), displays the empirical
 * results with a possibly-asymmetric shortest coverage interval, and renders
 * a plain-language GUM-vs-MC validation verdict.
 */
const MonteCarloCard = ({
  testPointData,
  tmdeTolerancesData,
  manualComponents,
  uutNominal,
  onUpdateTestPoint,
}) => {
  const unit = uutNominal?.unit || "";
  const maxSamples = normalizeMcSampleCount(testPointData.mcMaxSamples);

  const mc = useMonteCarlo({
    enabled: true,
    equationString: testPointData.equationString,
    variableMappings: testPointData.variableMappings,
    tmdeTolerances: tmdeTolerancesData,
    manualComponents,
    correlations: testPointData.inputCorrelations,
    maxSamples,
  });

  // First-order result recomputed locally for an apples-to-apples,
  // equation-level comparison (cheap — symbolic derivatives only).
  const linear = useMemo(
    () =>
      calculateDerivedUncertainty(
        testPointData.equationString,
        testPointData.variableMappings,
        tmdeTolerancesData,
        uutNominal,
        manualComponents
      ),
    [
      testPointData.equationString,
      testPointData.variableMappings,
      tmdeTolerancesData,
      uutNominal,
      manualComponents,
    ]
  );

  // Persist a compact summary (hash + quantile table) onto the point so the
  // SYNCHRONOUS risk pipeline (riskCompute for the sidebar, useRiskCalculation
  // for this panel) can integrate PFA/PFR/guard bands empirically without
  // re-running the simulation. Saved only when the configuration hash changes,
  // so this never loops or spams saves.
  useEffect(() => {
    if (mc.status !== "done" || !mc.result || !mc.hash) return;
    if (testPointData.mcSummary?.hash === mc.hash) return;
    onUpdateTestPoint({
      mcSummary: {
        hash: mc.hash,
        uBase: mc.result.standardUncertainty,
        meanBase: mc.result.mean,
        intervalLowBase: mc.result.intervalLow,
        intervalHighBase: mc.result.intervalHigh,
        coverageProbability: mc.result.coverageProbability,
        quantiles: mc.result.quantiles || null,
        samplesUsed: mc.result.samplesUsed,
        seed: mc.result.seed,
      },
    });
  }, [
    mc.status,
    mc.hash,
    mc.result,
    testPointData.mcSummary?.hash,
    onUpdateTestPoint,
  ]);

  const native = useMemo(() => {
    if (!mc.result) return null;
    const f = (v) => unitSystem.fromBaseUnit(v, unit);
    const mean = f(mc.result.mean);
    const low = f(mc.result.intervalLow);
    const high = f(mc.result.intervalHigh);
    const up = high - mean;
    const down = mean - low;
    return {
      mean,
      u: f(mc.result.standardUncertainty),
      low,
      high,
      up,
      down,
      // Asymmetric when the up/down half-widths differ by > 2% of the span.
      asymmetric: Math.abs(up - down) > 0.02 * Math.max(high - low, 1e-300),
    };
  }, [mc.result, unit]);

  let verdict = null; // { tone: "good" | "warn", text }
  if (native) {
    const linearU = linear?.combinedUncertaintyNative;
    if (linear?.degenerate) {
      verdict = {
        tone: "warn",
        text: "Linear (GUM) propagation is invalid at this operating point — the equation is at a stationary point, so the first-order budget reports zero uncertainty. The Monte Carlo values below are authoritative.",
      };
    } else if (linear?.error || !Number.isFinite(linearU)) {
      verdict = {
        tone: "warn",
        text: "Linear (GUM) propagation could not be evaluated for comparison; the Monte Carlo values below stand alone.",
      };
    } else if (linearU === 0 && native.u === 0) {
      verdict = {
        tone: "good",
        text: "No input carries uncertainty; both methods agree the combined uncertainty is zero.",
      };
    } else {
      const ref = Math.max(linearU, 1e-300);
      const deltaPct = (Math.abs(native.u - linearU) / ref) * 100;
      verdict =
        deltaPct <= VALIDATION_TOLERANCE_PCT
          ? {
              tone: "good",
              text: `Linear GUM validated at this operating point: the Monte Carlo standard uncertainty differs by ${deltaPct.toFixed(1)}% (GUM ${fmt(linearU)} ${unit} vs MC ${fmt(native.u)} ${unit}).`,
            }
          : {
              tone: "warn",
              text: `The Monte Carlo standard uncertainty differs from the linear budget by ${deltaPct.toFixed(1)}% (GUM ${fmt(linearU)} ${unit} vs MC ${fmt(native.u)} ${unit}). The first-order budget ${native.u > linearU ? "understates" : "overstates"} the uncertainty at this operating point.`,
            };
    }
  }

  return (
    <div className="panel-card" style={{ marginBottom: "20px" }}>
      <div className="panel-card-header">
        <div className="panel-card-title">
          <span className="mc-flag">MC</span>
          <span>Monte Carlo Propagation (GUM-S1)</span>
        </div>
        <div className="panel-card-actions">
          <label
            className="mc-trials-select"
            title="Maximum number of simulated trials. Adaptive batching may stop earlier once the result stabilizes; more trials sharpen the distribution tails used for empirical PFA/PFR."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.82rem",
              color: "var(--text-color-muted)",
              marginRight: "10px",
            }}
          >
            Trials
            <select
              value={maxSamples}
              aria-label="Maximum Monte Carlo trials"
              onChange={(e) =>
                onUpdateTestPoint({
                  mcMaxSamples: parseInt(e.target.value, 10),
                })
              }
            >
              {(MC_SAMPLE_CHOICES.includes(maxSamples)
                ? MC_SAMPLE_CHOICES
                : [...MC_SAMPLE_CHOICES, maxSamples].sort((a, b) => a - b)
              ).map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <div
            className="propagation-mode-switch"
            role="group"
            aria-label="Propagation method"
          >
            <button
              type="button"
              aria-label="Use linear (GUM) propagation"
              title="Switch this point back to first-order GUM propagation"
              onClick={() => onUpdateTestPoint({ propagationMode: "linear" })}
            >
              Linear (GUM)
            </button>
            <button type="button" className="active" aria-pressed="true">
              Monte Carlo
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {mc.status === "running" && (
          <p style={{ color: "var(--text-color-muted)", margin: 0 }}>
            Simulating… (up to {maxSamples.toLocaleString()} trials, seeded)
          </p>
        )}

        {mc.status === "error" && (
          <p style={{ color: "var(--status-bad)", margin: 0 }}>
            Monte Carlo evaluation failed: {mc.error}
          </p>
        )}

        {mc.status === "done" && native && (
          <>
            <div className="mc-metric-grid">
              <div>
                <div className="mc-metric-label">Mean result</div>
                <div className="mc-metric-value">
                  {fmt(native.mean)} {unit}
                </div>
              </div>
              <div>
                <div className="mc-metric-label">Std. uncertainty (u)</div>
                <div
                  className="mc-metric-value"
                  data-testid="mc-standard-uncertainty"
                >
                  {fmt(native.u)} {unit}
                </div>
              </div>
              <div>
                <div className="mc-metric-label">
                  {Math.round(mc.result.coverageProbability * 100)}% shortest
                  interval
                </div>
                <div className="mc-metric-value">
                  {native.asymmetric
                    ? `+${fmt(native.up, 4)} / −${fmt(native.down, 4)} ${unit}`
                    : `±${fmt((native.up + native.down) / 2, 4)} ${unit}`}
                </div>
                <div className="mc-metric-sub">
                  [{fmt(native.low)} … {fmt(native.high)}] {unit}
                </div>
              </div>
              <div>
                <div className="mc-metric-label">
                  Trials (seed {mc.result.seed})
                </div>
                <div className="mc-metric-value">
                  {mc.result.samplesUsed.toLocaleString()}
                </div>
              </div>
            </div>

            {verdict && (
              <div className={`method-callout ${verdict.tone}`} role="status">
                <div className="method-callout-main">
                  <FontAwesomeIcon
                    icon={
                      verdict.tone === "good"
                        ? faCheckCircle
                        : faExclamationTriangle
                    }
                    className="method-callout-icon"
                  />
                  <span>{verdict.text}</span>
                </div>
              </div>
            )}

            <p className="mc-footnote">
              Samples each tolerance component from its configured
              distribution (with input correlations). Risk metrics for this
              point — PFA, PFR, TUR, and guard bands — are integrated
              empirically from this distribution (quadrant counting per GUM-S1)
              instead of the bivariate-normal closed forms. The budget's final
              results use this distribution; component rows remain first-order
              decomposition references.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default MonteCarloCard;
