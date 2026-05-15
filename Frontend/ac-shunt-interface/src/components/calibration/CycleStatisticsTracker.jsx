// src/components/calibration/CycleStatisticsTracker.jsx
import React, { useMemo, useState } from "react";

const fmt = (val, digits = 4) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
};

function CycleStatisticsTracker({ focusedTestPoint, defaultUseAbba = true, title = "AC-DC Pair Statistics" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [useAbba, setUseAbba] = useState(defaultUseAbba);

  const fwdCycles = useMemo(() => {
    const list = focusedTestPoint?.forward?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  const revCycles = useMemo(() => {
    const list = focusedTestPoint?.reverse?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  // Compute stats entirely locally so they respond instantly to the toggle
  const localStats = useMemo(() => {
    const n = Math.min(fwdCycles.length, revCycles.length);
    if (n < 2) {
      // Single pair fallback
      const f = Number(fwdCycles[0]?.delta_uut_ppm);
      const r = Number(revCycles[0]?.delta_uut_ppm);
      if (Number.isFinite(f) && Number.isFinite(r)) {
         return { mean: (f + r) / 2, uA: null, sampleStd: null, n: 1 };
      }
      return { mean: null, uA: null, sampleStd: null, n };
    }

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
    const variance = paired.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (paired.length - 1);
    const s = Math.sqrt(variance);
    return { mean, uA: s / Math.sqrt(paired.length), sampleStd: s, n: paired.length };
  }, [fwdCycles, revCycles, useAbba]);

  // Build rows that explicitly show the pairing map
  const cycleRows = useMemo(() => {
    const n = Math.max(fwdCycles.length, revCycles.length);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const fwdIndex = i;
      const revIndex = useAbba ? (n - 1 - i) : i;

      const fwd = fwdCycles[fwdIndex];
      const rev = revCycles[revIndex];

      const fwdDelta = fwd?.delta_uut_ppm;
      const revDelta = rev?.delta_uut_ppm;
      const pairedAvg = fwdDelta != null && revDelta != null ? (Number(fwdDelta) + Number(revDelta)) / 2 : null;

      rows.push({
        pairNum: i + 1,
        fwdCycleNum: fwd?.cycle_index || fwdIndex + 1,
        revCycleNum: rev?.cycle_index || revIndex + 1,
        fwdDelta,
        revDelta,
        pairedAvg,
      });
    }
    return rows;
  }, [fwdCycles, revCycles, useAbba]);

  const incompletePair = fwdCycles.length === 0 && revCycles.length === 0;
  if (incompletePair) return null;

  return (
    <div className="accordion-card" style={{ marginTop: "20px" }}>
      {/* Refactored header for a clean 3-column layout */}
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)} style={{ display: "flex", alignItems: "center" }}>
        
        {/* 1. Left: Title */}
        <h4 style={{ flex: 1, margin: 0 }}>
          {title}
        </h4>

        {/* 2. Center: Headline Math */}
        <div style={{ flex: 2, textAlign: "center", fontWeight: 600, fontSize: "0.95rem", letterSpacing: "0.3px" }}>
          {localStats.mean != null ? fmt(localStats.mean, 3) : "—"}
          {localStats.uA != null ? ` ± ${fmt(localStats.uA, 3)}` : ""} ppm
          {localStats.n > 0 && <span style={{ opacity: 0.7, fontWeight: "normal", marginLeft: "4px" }}>· N = {localStats.n}</span>}
        </div>

        {/* 3. Right: Toggles and Icon */}
        <div className="header-controls" style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          <div className="unit-toggle" onClick={(e) => e.stopPropagation()} style={{ marginRight: "12px" }}>
            <button
              type="button"
              title="Reverse Pairing"
              className={useAbba ? "active" : ""}
              onClick={() => setUseAbba(true)}
            >
              ABBA
            </button>
            <button
              type="button"
              title="Standard Index Pairing"
              className={!useAbba ? "active" : ""}
              onClick={() => setUseAbba(false)}
            >
              Standard
            </button>
          </div>
          <span className={`accordion-icon ${isOpen ? "open" : ""}`}>▼</span>
        </div>
      </div>

      {isOpen && (
        <div className="accordion-content">
          <div className="stats-grid">
            <div className="stat-card">
              <h6>Mean paired δ (x̄)</h6>
              <div className="stat-details">
                <div style={{ width: "100%", display: "flex", justifyContent: "space-between" }}>
                  <strong>Value:</strong>
                  <span style={{ color: "var(--primary-color)", fontWeight: 600 }}>
                    {localStats.mean != null ? `${fmt(localStats.mean, 4)} ppm` : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <h6>Type A (u_A)</h6>
              <div className="stat-details">
                <div style={{ width: "100%", display: "flex", justifyContent: "space-between" }}>
                  <strong>Value:</strong>
                  <span style={{ color: "var(--primary-color)", fontWeight: 600 }}>
                    {localStats.uA != null ? `± ${fmt(localStats.uA, 4)} ppm` : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <h6>Sample σ (s)</h6>
              <div className="stat-details">
                <div style={{ width: "100%", display: "flex", justifyContent: "space-between" }}>
                  <strong>Value:</strong>
                  <span style={{ color: "var(--primary-color)", fontWeight: 600 }}>
                    {localStats.sampleStd != null ? `${fmt(localStats.sampleStd, 4)} ppm` : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <h6>N pairs</h6>
              <div className="stat-details">
                <div style={{ width: "100%", display: "flex", justifyContent: "space-between" }}>
                  <strong>Count:</strong>
                  <span style={{ color: "var(--primary-color)", fontWeight: 600 }}>
                    {localStats.n}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="cycle-stats-table-container" style={{ marginTop: "16px" }}>
            <table className="styled-table styled-table--centered">
              <thead>
                <tr>
                  <th>Pair #</th>
                  <th>Forward δ</th>
                  <th>Reverse δ</th>
                  <th>Paired Avg (ppm)</th>
                </tr>
              </thead>
              <tbody>
                {cycleRows.map((row) => (
                  <tr key={row.pairNum}>
                    <td>{row.pairNum}</td>
                    <td>
                      {row.fwdDelta != null ? (
                        <>
                          {fmt(row.fwdDelta, 4)}{" "}
                          <span style={{ opacity: 0.6, fontSize: "0.85em" }}>(Cy {row.fwdCycleNum})</span>
                        </>
                      ) : "—"}
                    </td>
                    <td>
                      {row.revDelta != null ? (
                        <>
                          {fmt(row.revDelta, 4)}{" "}
                          <span style={{ opacity: 0.6, fontSize: "0.85em" }}>(Cy {row.revCycleNum})</span>
                        </>
                      ) : "—"}
                    </td>
                    <td><strong style={{ color: "var(--primary-color)" }}>{fmt(row.pairedAvg, 4)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="cycle-stats-footnote">
            The table above shows the exact pairs used to calculate the headline values based on your selected strategy.
          </p>
        </div>
      )}
    </div>
  );
}

export default CycleStatisticsTracker;