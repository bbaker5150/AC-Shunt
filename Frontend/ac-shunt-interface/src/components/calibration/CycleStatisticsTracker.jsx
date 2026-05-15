// src/components/calibration/CycleStatisticsTracker.jsx
import React, { useMemo, useState, useEffect } from "react";

const fmt = (val, digits = 4) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
};

function CycleStatisticsTracker({ focusedTestPoint, defaultUseAbba = true, title = "AC-DC Pair Statistics" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [useAbba, setUseAbba] = useState(defaultUseAbba);
  const [enableFilter, setEnableFilter] = useState(false);
  const [manualExclusions, setManualExclusions] = useState(new Set());

  const fwdCycles = useMemo(() => {
    const list = focusedTestPoint?.forward?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  const revCycles = useMemo(() => {
    const list = focusedTestPoint?.reverse?.results?.cycles || [];
    return [...list].sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
  }, [focusedTestPoint]);

  // Reset manual exclusions if the user changes the pairing strategy or test point
  useEffect(() => {
    setManualExclusions(new Set());
  }, [useAbba, focusedTestPoint]);

  const toggleManualExclusion = (pairNum) => {
    setManualExclusions((prev) => {
      const next = new Set(prev);
      if (next.has(pairNum)) next.delete(pairNum);
      else next.add(pairNum);
      return next;
    });
  };

  // Central analytical engine: Handles pairing, Chauvenet (N>=12), IQR (N<12), and Math
  const cycleData = useMemo(() => {
    const n = Math.max(fwdCycles.length, revCycles.length);
    const rows = [];
    const validValues = [];

    // 1. Build Pairs
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

      if (pairedAvg !== null) validValues.push({ pairNum: i + 1, avg: pairedAvg });
    }

    const validN = validValues.length;
    const autoExcluded = new Set();
    const flagged = new Set();

    // 2. Statistical Outlier Detection (Only if global filter is enabled)
    if (enableFilter) {
      if (validN >= 12) {
        // Chauvenet's Criterion (Automatic Rejection for robust datasets)
        const mean = validValues.reduce((a, b) => a + b.avg, 0) / validN;
        const variance = validValues.reduce((a, b) => a + (b.avg - mean) ** 2, 0) / (validN - 1);
        const std = Math.sqrt(variance);
        
        // Z-Score approximation mapping perfectly to Chauvenet's inverse normal CDF (N=12 to N=100)
        const Z = 1.1 + 0.38 * Math.log(validN); 
        const threshold = Z * std;

        validValues.forEach(v => {
          if (Math.abs(v.avg - mean) > threshold) {
            autoExcluded.add(v.pairNum);
          }
        });
      } else if (validN >= 4) {
        // IQR Filter (Visual Sentinel for fragile datasets)
        const sorted = [...validValues].map(v => v.avg).sort((a, b) => a - b);
        const q1 = sorted[Math.floor(validN * 0.25)];
        const q3 = sorted[Math.floor(validN * 0.75)];
        const iqr = q3 - q1;
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;

        validValues.forEach(v => {
          if (v.avg < lower || v.avg > upper) {
            flagged.add(v.pairNum);
          }
        });
      }
    }

    // 3. Final Headline Statistics (Only from active pairs not auto-excluded or manually excluded)
    const activeVals = validValues
      .filter(v => !autoExcluded.has(v.pairNum) && !manualExclusions.has(v.pairNum))
      .map(v => v.avg);

    let stats = { mean: null, uA: null, sampleStd: null, n: activeVals.length };

    if (activeVals.length === 1) {
      stats.mean = activeVals[0];
    } else if (activeVals.length > 1) {
      const mean = activeVals.reduce((a, b) => a + b, 0) / activeVals.length;
      const variance = activeVals.reduce((a, b) => a + (b - mean) ** 2, 0) / (activeVals.length - 1);
      const s = Math.sqrt(variance);
      stats = { mean, uA: s / Math.sqrt(activeVals.length), sampleStd: s, n: activeVals.length };
    }

    return { rows, autoExcluded, flagged, stats };
  }, [fwdCycles, revCycles, useAbba, enableFilter, manualExclusions]);

  const { rows: cycleRows, autoExcluded, flagged, stats: localStats } = cycleData;
  const incompletePair = fwdCycles.length === 0 && revCycles.length === 0;

  if (incompletePair) return null;

  return (
    <div className="accordion-card" style={{ marginTop: "20px" }}>
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

          {/* Global Filter Toggle */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", marginBottom: "8px" }}>
            <label style={{ display: "flex", alignItems: "center", fontSize: "0.85rem", cursor: "pointer", opacity: 0.8 }}>
              <input 
                type="checkbox" 
                checked={enableFilter} 
                onChange={(e) => setEnableFilter(e.target.checked)} 
                style={{ marginRight: "6px", cursor: "pointer" }}
              />
              Enable Auto-Filter (Chauvenet / IQR)
            </label>
          </div>

          <div className="cycle-stats-table-container">
            <table className="styled-table styled-table--centered">
              <thead>
                <tr>
                  <th>Pair #</th>
                  <th>Forward δ</th>
                  <th>Reverse δ</th>
                  <th>Paired Avg (ppm)</th>
                  <th>Status / Action</th>
                </tr>
              </thead>
              <tbody>
                {cycleRows.map((row) => {
                  const isAuto = autoExcluded.has(row.pairNum);
                  const isManual = manualExclusions.has(row.pairNum);
                  const isExcluded = isAuto || isManual;
                  const isFlagged = flagged.has(row.pairNum);

                  return (
                    <tr key={row.pairNum} style={{ opacity: isExcluded ? 0.45 : 1, transition: "opacity 0.2s" }}>
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
                      <td style={{ textDecoration: isExcluded ? "line-through" : "none" }}>
                        <strong style={{ color: "var(--primary-color)" }}>{fmt(row.pairedAvg, 4)}</strong>
                      </td>
                      <td>
                        {isAuto ? (
                          <span style={{ color: "var(--danger-color, #e74c3c)", fontWeight: 600, fontSize: "0.85em" }}>⚠️ Chauvenet Outlier</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                            {isFlagged && !isExcluded && (
                              <span style={{ color: "var(--warning-color, #f39c12)", fontWeight: 600, fontSize: "0.85em" }} title="Suspicious spread detected by IQR filter">⚠️ Flagged</span>
                            )}
                            {row.pairedAvg != null && (
                              <button
                                type="button"
                                className="cal-results-pill"
                                style={{ fontSize: "0.75rem", padding: "2px 8px", minHeight: "auto", margin: 0, opacity: isExcluded ? 1 : 0.7 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleManualExclusion(row.pairNum);
                                }}
                              >
                                {isExcluded ? "Include" : "Exclude"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
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