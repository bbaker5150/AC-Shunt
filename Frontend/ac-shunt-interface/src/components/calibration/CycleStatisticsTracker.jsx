import React, { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// CycleStatisticsTracker
//
// Inline accordion peer of LiveStabilityTracker. Displays per-pair AC-DC
// statistics for the focused test point. A "pair" here is one Forward
// TestPoint + one Reverse TestPoint at the same (current, frequency).
// Per-cycle δ values live separately on each direction
// (`results.cycles[]`); this component pulls both sides, applies the
// active pairing scheme (ABBA reverse-pairing by default, or index
// pairing when the session's `use_abba_pairing` flag is off), and reports
// x̄ ± u_A.
//
// Headline values come from `pair_delta_uut_ppm` /
// `pair_type_a_uncertainty_ppm` (mirrored onto BOTH the Fwd and Rev
// CalibrationResults rows by `recompute_pair_aggregate` on the backend),
// with a local fallback in case the backend mirror hasn't caught up to
// the latest cycle yet.
// ---------------------------------------------------------------------------

const fmt = (val, digits = 4) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
};

function CycleStatisticsTracker({ focusedTestPoint, useAbba = true, title = "AC-DC Pair Statistics" }) {
  const [isOpen, setIsOpen] = useState(false);

  // Pull each direction's cycles, sorted by index. Either may be empty
  // (run incomplete) — the view degrades gracefully.
  const fwdCycles = useMemo(() => {
    const list = focusedTestPoint?.forward?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  const revCycles = useMemo(() => {
    const list = focusedTestPoint?.reverse?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  // For the per-cycle table we use SIMPLE pairing — show that cycle's own
  // Fwd, that cycle's own Rev, and the direct (Fwd_i + Rev_i)/2 — so each
  // row is "this cycle's own data" with no cross-cycle borrowing. The top
  // headline always uses the active pairing scheme (ABBA when enabled),
  // sourced from the backend's `pair_delta_uut_ppm` field.
  const cycleRows = useMemo(() => {
    const n = Math.max(fwdCycles.length, revCycles.length);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const fwd = fwdCycles[i];
      const rev = revCycles[i];
      const fwdDelta = fwd?.delta_uut_ppm;
      const revDelta = rev?.delta_uut_ppm;
      const cycleAvg =
        fwdDelta != null && revDelta != null
          ? (Number(fwdDelta) + Number(revDelta)) / 2
          : null;
      rows.push({
        i: i + 1,
        fwd_delta: fwdDelta,
        rev_delta: revDelta,
        cycle_avg: cycleAvg,
      });
    }
    return rows;
  }, [fwdCycles, revCycles]);

  // Prefer the backend-mirrored values when present; otherwise recompute
  // from what we have locally so the headline stays fresh mid-run.
  const backendMean =
    focusedTestPoint?.forward?.results?.pair_delta_uut_ppm
    ?? focusedTestPoint?.reverse?.results?.pair_delta_uut_ppm;
  const backendUA =
    focusedTestPoint?.forward?.results?.pair_type_a_uncertainty_ppm
    ?? focusedTestPoint?.reverse?.results?.pair_type_a_uncertainty_ppm;

  const localStats = useMemo(() => {
    const n = Math.min(fwdCycles.length, revCycles.length);
    if (n < 2) return { mean: null, uA: null, sampleStd: null, n };
    const paired = [];
    for (let i = 0; i < n; i += 1) {
      const f = Number(fwdCycles[i]?.delta_uut_ppm);
      const r = Number(useAbba ? revCycles[n - 1 - i]?.delta_uut_ppm : revCycles[i]?.delta_uut_ppm);
      if (Number.isFinite(f) && Number.isFinite(r)) {
        paired.push((f + r) / 2);
      }
    }
    if (paired.length < 2) return { mean: null, uA: null, sampleStd: null, n: paired.length };
    const mean = paired.reduce((acc, v) => acc + v, 0) / paired.length;
    const variance =
      paired.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (paired.length - 1);
    const s = Math.sqrt(variance);
    return { mean, uA: s / Math.sqrt(paired.length), sampleStd: s, n: paired.length };
  }, [fwdCycles, revCycles, useAbba]);

  const headlineMean = backendMean ?? localStats.mean;
  const headlineUA = backendUA ?? localStats.uA;
  const headlineN = localStats.n;
  const sampleStd =
    localStats.sampleStd != null
      ? localStats.sampleStd
      : headlineUA != null && headlineN > 1
        ? Number(headlineUA) * Math.sqrt(headlineN)
        : null;

  const pairingLabel = useAbba ? "ABBA" : "Index";
  const incompletePair = fwdCycles.length === 0 && revCycles.length === 0;

  // Mirror LiveStabilityTracker: render nothing when there's literally no
  // cycle data, so the chart panel doesn't show a permanently-empty card.
  if (incompletePair) {
    return null;
  }

  return (
    <div className="accordion-card" style={{ marginTop: "20px" }}>
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <h4>
          {title}
          <span className="accordion-header-cycle">{pairingLabel}</span>
        </h4>
        <div className="header-controls">
          <span className="cycle-stats-headline-inline">
            {headlineMean != null ? fmt(headlineMean, 3) : "—"}
            {headlineUA != null ? ` ± ${fmt(headlineUA, 3)}` : ""} ppm
            {headlineN > 0 && <span className="cycle-stats-headline-n">  · N = {headlineN}</span>}
          </span>
          <span className={`accordion-icon ${isOpen ? "open" : ""}`}>▼</span>
        </div>
      </div>
      {isOpen && (
        <div className="accordion-content">
          <div className="stats-grid">
            <div className="stat-card">
              <h6>Mean paired δ (x̄)</h6>
              <div className="stat-details">
                <div>
                  <strong>Value:</strong>
                  <span>{headlineMean != null ? `${fmt(headlineMean, 4)} ppm` : "—"}</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <h6>Type A (u_A = s/√N)</h6>
              <div className="stat-details">
                <div>
                  <strong>Value:</strong>
                  <span>{headlineUA != null ? `± ${fmt(headlineUA, 4)} ppm` : "—"}</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <h6>Sample σ (s)</h6>
              <div className="stat-details">
                <div>
                  <strong>Value:</strong>
                  <span>{sampleStd != null ? `${fmt(sampleStd, 4)} ppm` : "—"}</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <h6>N pairs</h6>
              <div className="stat-details">
                <div>
                  <strong>Count:</strong>
                  <span>{headlineN}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="cycle-stats-table-container" style={{ marginTop: "16px" }}>
            <table className="styled-table styled-table--centered">
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>δ_Fwd (ppm)</th>
                  <th>δ_Rev (ppm)</th>
                  <th>Cycle avg (ppm)</th>
                </tr>
              </thead>
              <tbody>
                {cycleRows.map((row) => (
                  <tr key={row.i}>
                    <td>{row.i}</td>
                    <td>{fmt(row.fwd_delta, 4)}</td>
                    <td>{fmt(row.rev_delta, 4)}</td>
                    <td><strong>{fmt(row.cycle_avg, 4)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="cycle-stats-footnote">
            Per-cycle avg is the simple (δ_Fwd_i + δ_Rev_i)/2 for that cycle.
            The headline x̄ uses {pairingLabel === "ABBA" ? "reverse pairing (Fwd_i ↔ Rev_{N+1−i}) to cancel linear drift across the run" : "index pairing (Fwd_i ↔ Rev_i)"}.
          </p>
        </div>
      )}
    </div>
  );
}

export default CycleStatisticsTracker;
