import React, { useEffect, useMemo } from "react";
import {
  unitSystem,
  calculateDerivedUncertainty,
} from "../../../utils/uncertaintyMath";
import useMonteCarlo, { MC_RUN_OPTIONS } from "../hooks/useMonteCarlo";

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

  const mc = useMonteCarlo({
    enabled: true,
    equationString: testPointData.equationString,
    variableMappings: testPointData.variableMappings,
    tmdeTolerances: tmdeTolerancesData,
    manualComponents,
    correlations: testPointData.inputCorrelations,
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

  const toneStyle = {
    good: {
      border: "1px solid var(--status-good)",
      backgroundColor: "rgba(76, 175, 80, 0.1)",
      color: "var(--status-good)",
    },
    warn: {
      border: "1px solid var(--status-warning)",
      backgroundColor: "rgba(255, 193, 7, 0.12)",
      color: "var(--status-warning)",
    },
  };

  return (
    <div className="panel-card" style={{ marginBottom: "20px" }}>
      <div className="panel-card-header">
        <div className="panel-card-title">
          <span
            style={{
              display: "inline-block",
              padding: "1px 7px",
              borderRadius: "4px",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              backgroundColor: "var(--accent-color, #4a90d9)",
              color: "#fff",
            }}
          >
            MC
          </span>
          <span>Monte Carlo Propagation (GUM-S1)</span>
        </div>
        <div className="panel-card-actions">
          <button
            type="button"
            className="button-secondary"
            style={{ fontSize: "0.85rem" }}
            onClick={() => onUpdateTestPoint({ propagationMode: "linear" })}
          >
            Use linear (GUM) propagation
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {mc.status === "running" && (
          <p style={{ color: "var(--text-color-muted)", margin: 0 }}>
            Simulating… (up to{" "}
            {MC_RUN_OPTIONS.maxSamples.toLocaleString()} trials, seeded)
          </p>
        )}

        {mc.status === "error" && (
          <p style={{ color: "var(--status-bad)", margin: 0 }}>
            Monte Carlo evaluation failed: {mc.error}
          </p>
        )}

        {mc.status === "done" && native && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "10px 18px",
                marginBottom: "10px",
              }}
            >
              <div>
                <div className="mc-metric-label" style={{ color: "var(--text-color-muted)", fontSize: "0.78rem" }}>
                  Mean result
                </div>
                <strong>
                  {fmt(native.mean)} {unit}
                </strong>
              </div>
              <div>
                <div style={{ color: "var(--text-color-muted)", fontSize: "0.78rem" }}>
                  Std. uncertainty (u)
                </div>
                <strong data-testid="mc-standard-uncertainty">
                  {fmt(native.u)} {unit}
                </strong>
              </div>
              <div>
                <div style={{ color: "var(--text-color-muted)", fontSize: "0.78rem" }}>
                  {Math.round(mc.result.coverageProbability * 100)}% shortest
                  interval
                </div>
                <strong>
                  {native.asymmetric
                    ? `+${fmt(native.up, 4)} / −${fmt(native.down, 4)} ${unit}`
                    : `±${fmt((native.up + native.down) / 2, 4)} ${unit}`}
                </strong>
                <div style={{ color: "var(--text-color-muted)", fontSize: "0.78rem" }}>
                  [{fmt(native.low)} … {fmt(native.high)}] {unit}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-color-muted)", fontSize: "0.78rem" }}>
                  Trials (seed {mc.result.seed})
                </div>
                <strong>{mc.result.samplesUsed.toLocaleString()}</strong>
              </div>
            </div>

            {verdict && (
              <div
                style={{
                  ...toneStyle[verdict.tone],
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "0.88rem",
                  marginBottom: "8px",
                }}
              >
                {verdict.text}
              </div>
            )}

            <p
              style={{
                color: "var(--text-color-muted)",
                fontSize: "0.78rem",
                margin: 0,
              }}
            >
              Samples each tolerance component from its configured
              distribution (with input correlations). Risk metrics for this
              point — PFA, PFR, TUR, and guard bands — are integrated
              empirically from this distribution (quadrant counting per GUM-S1)
              instead of the bivariate-normal closed forms; the budget table
              remains first-order for reference.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default MonteCarloCard;
