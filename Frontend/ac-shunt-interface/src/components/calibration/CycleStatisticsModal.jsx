import React, { useMemo } from "react";
import { FaTimes } from "react-icons/fa";
import AnimatedModalShell from "../shared/AnimatedModalShell";

// ---------------------------------------------------------------------------
// CycleStatisticsModal
//
// Surfaces the per-pair AC-DC statistics for the focused test point. The
// "pair" here is a (current, frequency) entry made of one Forward TestPoint
// and one Reverse TestPoint. Cycle data lives separately on each direction
// (`results.cycles[]`); this modal pulls both sides, applies the active
// pairing scheme (ABBA reverse-pairing by default, or index pairing when
// the session's `use_abba_pairing` flag is false), and reports x̄ ± u_A.
//
// Headline values (`pair_delta_uut_ppm`, `pair_type_a_uncertainty_ppm`) are
// mirrored onto BOTH the Fwd and Rev CalibrationResults rows by
// `recompute_pair_aggregate` on the backend, so the modal can read them
// from whichever side it has at hand.
// ---------------------------------------------------------------------------

const fmt = (val, digits = 4) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
};

const fmtSci = (val) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  const n = Number(val);
  if (!Number.isFinite(n)) return "—";
  return Math.abs(n) < 1e-3 || Math.abs(n) > 1e5 ? n.toExponential(3) : n.toPrecision(6);
};

function CycleStatisticsModal({ isOpen, onClose, focusedTestPoint, useAbba = true, title = "AC-DC Pair Statistics" }) {
  // Pull each direction's cycles, sorted by index. Either may be empty
  // (run incomplete) — the pair view degrades gracefully.
  const fwdCycles = useMemo(() => {
    const list = focusedTestPoint?.forward?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  const revCycles = useMemo(() => {
    const list = focusedTestPoint?.reverse?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  // Build the paired view. Length = min(fwd, rev). Reverse pairing maps
  // Fwd_i to Rev_{N+1-i}; index pairing is just Fwd_i ↔ Rev_i. The math
  // mirrors the backend's `aggregate_paired_cycles` so the numbers match
  // exactly even before the next data refresh lands.
  const pairs = useMemo(() => {
    const n = Math.min(fwdCycles.length, revCycles.length);
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const fwd = fwdCycles[i];
      const rev = useAbba ? revCycles[n - 1 - i] : revCycles[i];
      const fwdDelta = fwd?.delta_uut_ppm;
      const revDelta = rev?.delta_uut_ppm;
      const paired =
        fwdDelta != null && revDelta != null
          ? (Number(fwdDelta) + Number(revDelta)) / 2
          : null;
      out.push({
        i: i + 1,
        fwd_cycle_index: fwd?.cycle_index,
        rev_cycle_index: rev?.cycle_index,
        fwd_delta: fwdDelta,
        rev_delta: revDelta,
        paired_delta: paired,
      });
    }
    return out;
  }, [fwdCycles, revCycles, useAbba]);

  // Prefer the backend-mirrored values when present; fall back to a
  // local recompute from the just-listed pairs. Either should give the
  // same number (the local calc is purely for fast UI freshness mid-run).
  const backendMean = focusedTestPoint?.forward?.results?.pair_delta_uut_ppm
    ?? focusedTestPoint?.reverse?.results?.pair_delta_uut_ppm;
  const backendUA = focusedTestPoint?.forward?.results?.pair_type_a_uncertainty_ppm
    ?? focusedTestPoint?.reverse?.results?.pair_type_a_uncertainty_ppm;

  const localStats = useMemo(() => {
    const numeric = pairs.map((p) => p.paired_delta).filter((v) => v != null);
    if (numeric.length < 2) return { mean: null, uA: null, sampleStd: null };
    const mean = numeric.reduce((acc, v) => acc + v, 0) / numeric.length;
    const variance =
      numeric.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (numeric.length - 1);
    const s = Math.sqrt(variance);
    return { mean, uA: s / Math.sqrt(numeric.length), sampleStd: s };
  }, [pairs]);

  const headlineMean = backendMean ?? localStats.mean;
  const headlineUA = backendUA ?? localStats.uA;
  const headlineN = pairs.filter((p) => p.paired_delta != null).length;
  const sampleStd =
    localStats.sampleStd != null
      ? localStats.sampleStd
      : headlineUA != null && headlineN > 1
        ? Number(headlineUA) * Math.sqrt(headlineN)
        : null;

  const tpLabel = focusedTestPoint
    ? `${focusedTestPoint.current ?? "?"} A @ ${focusedTestPoint.frequency ?? "?"} Hz`
    : "—";

  const pairingLabel = useAbba ? "ABBA (reverse pairing)" : "Index pairing";
  const incompletePair = fwdCycles.length === 0 || revCycles.length === 0;
  const unevenLengths =
    fwdCycles.length > 0 &&
    revCycles.length > 0 &&
    fwdCycles.length !== revCycles.length;

  return (
    <AnimatedModalShell
      isOpen={isOpen}
      onClose={onClose}
      panelClassName="cycle-stats-modal-content"
      panelProps={{
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "cycle-stats-modal-title",
      }}
    >
      <header className="cycle-stats-modal-header">
        <div className="cycle-stats-modal-header-text">
          <span className="cycle-stats-modal-eyebrow">
            Pair-level statistics · {pairingLabel}
          </span>
          <h3 id="cycle-stats-modal-title" className="cycle-stats-modal-title">
            {title}
          </h3>
          <span className="cycle-stats-modal-subtitle">{tpLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="cal-results-excel-icon-btn"
          title="Close"
          aria-label="Close"
        >
          <FaTimes aria-hidden />
        </button>
      </header>

      <main className="cycle-stats-modal-body">
        {incompletePair ? (
          <div className="cycle-stats-empty">
            <p className="cycle-stats-empty-title">Pair incomplete</p>
            <p className="cycle-stats-empty-text">
              {fwdCycles.length === 0 && revCycles.length === 0
                ? "No cycle data yet. Run the paired AC-DC workflow (Forward → flip → Reverse) to populate this view."
                : fwdCycles.length === 0
                  ? "Reverse cycles are present but Forward is empty. Run Forward to complete the pair."
                  : "Forward cycles are present but Reverse is empty. Flip the adapter and run Reverse to complete the pair."}
            </p>
          </div>
        ) : (
          <>
            {unevenLengths && (
              <div className="cycle-stats-empty cycle-stats-empty--warn">
                <p className="cycle-stats-empty-title">Uneven cycle counts</p>
                <p className="cycle-stats-empty-text">
                  Forward has {fwdCycles.length} cycles and Reverse has
                  {" "}{revCycles.length}. Pairing uses the smaller count
                  ({Math.min(fwdCycles.length, revCycles.length)}) — orphan
                  cycles are ignored. Re-run the incomplete direction to
                  bring the pair into balance.
                </p>
              </div>
            )}

            <section className="cycle-stats-summary">
              <div className="cycle-stats-summary-item">
                <span className="cycle-stats-summary-label">Mean paired δ (x̄)</span>
                <span className="cycle-stats-summary-value">
                  {fmt(headlineMean, 4)} <span className="cycle-stats-unit">ppm</span>
                </span>
              </div>
              <div className="cycle-stats-summary-item">
                <span className="cycle-stats-summary-label">Type A (u_A = s/√N)</span>
                <span className="cycle-stats-summary-value">
                  ± {fmt(headlineUA, 4)} <span className="cycle-stats-unit">ppm</span>
                </span>
              </div>
              <div className="cycle-stats-summary-item">
                <span className="cycle-stats-summary-label">Sample σ (s)</span>
                <span className="cycle-stats-summary-value">
                  {fmt(sampleStd, 4)} <span className="cycle-stats-unit">ppm</span>
                </span>
              </div>
              <div className="cycle-stats-summary-item">
                <span className="cycle-stats-summary-label">N pairs</span>
                <span className="cycle-stats-summary-value">{headlineN}</span>
              </div>
            </section>

            <div className="cycle-stats-table-container">
              <table className="styled-table styled-table--centered">
                <thead>
                  <tr>
                    <th>Pair (i)</th>
                    <th>Fwd cycle</th>
                    <th>δ_Fwd (ppm)</th>
                    <th>Rev cycle{useAbba ? " (N+1−i)" : " (i)"}</th>
                    <th>δ_Rev (ppm)</th>
                    <th>Paired δ_i (ppm)</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p) => (
                    <tr key={p.i}>
                      <td>{p.i}</td>
                      <td>{p.fwd_cycle_index ?? "—"}</td>
                      <td>{fmt(p.fwd_delta, 4)}</td>
                      <td>{p.rev_cycle_index ?? "—"}</td>
                      <td>{fmt(p.rev_delta, 4)}</td>
                      <td><strong>{fmt(p.paired_delta, 4)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="cycle-stats-footnote">
              Per-phase within-phase σ is a stability diagnostic and is shown
              on the chart options / range modal — it is <em>not</em> the
              same as the headline Type A u<sub>A</sub> above, which captures
              pair-to-pair reproducibility of δ.
            </p>
          </>
        )}
      </main>
    </AnimatedModalShell>
  );
}

export default CycleStatisticsModal;
