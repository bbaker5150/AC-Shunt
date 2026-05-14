// src/components/calibration/CalibrationResults.js
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useInstruments } from "../../contexts/InstrumentContext";
import { FaDownload } from "react-icons/fa";
import CalibrationChart from "./CalibrationChart";
import { downloadFullSessionExcel } from "./sessionExcelExport";
import CustomDropdown from "../shared/CustomDropdown";
import { useTheme } from "../../contexts/ThemeContext";
import { API_BASE_URL } from "../../constants/constants";
import axios from "axios";
import katex from "katex";
import "katex/dist/katex.min.css";

const READING_TYPES = [
  { label: "AC Open", value: "ac_open_readings", color: "rgb(75, 192, 192)" },
  { label: "DC+", value: "dc_pos_readings", color: "rgb(255, 99, 132)" },
  { label: "DC-", value: "dc_neg_readings", color: "rgb(54, 162, 235)" },
  { label: "AC Close", value: "ac_close_readings", color: "rgb(255, 205, 86)" },
];
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

// Render KaTeX to HTML during React render so equations do not "pop in"
// after mount during tab/view transitions.
const MathDisplay = React.memo(({ math }) => {
  const renderedMath = useMemo(() => {
    if (!math) return "";
    const trimmed = String(math).trim();
    const normalized =
      trimmed.startsWith("$$") && trimmed.endsWith("$$")
        ? trimmed.slice(2, -2).trim()
        : trimmed;

    try {
      return katex.renderToString(normalized, {
        displayMode: true,
        throwOnError: false,
        strict: "ignore",
      });
    } catch (error) {
      console.warn("Failed to render KaTeX expression:", error);
      return katex.renderToString("\\text{Equation unavailable}", {
        displayMode: true,
        throwOnError: false,
      });
    }
  }, [math]);

  return <div dangerouslySetInnerHTML={{ __html: renderedMath }} />;
});

const ResultsKpi = ({ title, value, formula, uncertainty = null, nCycles = null }) => {
  const isCalculated = value !== null && value !== undefined;
  const hasUncertainty = uncertainty !== null && uncertainty !== undefined;
  return (
    <div className="cal-results-kpi">
      <p className="cal-results-kpi-label">{title}</p>
      <div className="cal-results-kpi-value-row">
        <span className="cal-results-kpi-num">
          {isCalculated ? parseFloat(value).toFixed(3) : "—"}
        </span>
        {hasUncertainty && (
          <span className="cal-results-kpi-uncertainty">
            &nbsp;±&nbsp;{parseFloat(uncertainty).toFixed(3)}
          </span>
        )}
        <span className="cal-results-kpi-unit">ppm</span>
      </div>
      {hasUncertainty && nCycles ? (
        <p className="cal-results-kpi-uA-caption">
          Type A (u_A = s/√N), N = {nCycles}
        </p>
      ) : null}
      {formula && (
        <div className="cal-results-kpi-formula">
          <MathDisplay math={formula} />
        </div>
      )}
    </div>
  );
};

const DetailedReadingsTable = ({ readingsArray }) => {
  if (!readingsArray || readingsArray.length === 0) {
    return (
      <p style={{ textAlign: "center", fontStyle: "italic", padding: "20px" }}>
        No readings available for this measurement type.
      </p>
    );
  }
  return (
    <div className="table-container">
      <table className="cal-results-table">
        <thead>
          <tr>
            <th>Sample #</th>
            <th>Value</th>
            <th>Status</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {readingsArray.map((point, index) => {
            const isObject = typeof point === "object" && point !== null;
            const value = isObject ? point.value : point;
            const isStable = isObject ? point.is_stable : true;
            const timestamp =
              isObject && point.timestamp
                ? new Date(point.timestamp * 1000).toLocaleString()
                : "N/A";
            return (
              <tr key={index} className={!isStable ? "unstable-row" : ""}>
                <td>{index + 1}</td>
                <td>{value?.toPrecision(8)}</td>
                <td>{isStable ? "Stable" : "Unstable"}</td>
                <td>{timestamp}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const SummaryTable = ({ results, prefix }) => {
  const [stdDevUnit, setStdDevUnit] = useState("ppm");

  return (
    <>
      <div className="cal-results-summary-table-header">
        <h4 className="cal-results-summary-heading">Readings summary</h4>
        <div
          className="cal-results-pill-group cal-results-unit-pills"
          role="group"
          aria-label="Standard deviation units"
        >
          <button
            type="button"
            className={`cal-results-pill ${stdDevUnit === "ppm" ? "is-active" : ""
              }`}
            onClick={() => setStdDevUnit("ppm")}
          >
            ppm
          </button>
          <button
            type="button"
            className={`cal-results-pill ${stdDevUnit === "volts" ? "is-active" : ""
              }`}
            onClick={() => setStdDevUnit("volts")}
          >
            Volts
          </button>
        </div>
      </div>
      <div className="table-container">
        <table className="cal-results-table">
          <thead>
            <tr>
              <th>Measurement</th>
              <th>Average (V)</th>
              <th>Std. Dev. ({stdDevUnit === "ppm" ? "PPM" : "V"})</th>
            </tr>
          </thead>
          <tbody>
            {READING_TYPES.map((rt) => {
              const avgKey = `${prefix}${rt.value.replace(
                "_readings",
                "_avg"
              )}`;
              const stddevKey = `${prefix}${rt.value.replace(
                "_readings",
                "_stddev"
              )}`;
              const average = results?.[avgKey];
              const stddev = results?.[stddevKey];
              let displayStdDev = "...";

              if (average && stddev) {
                if (stdDevUnit === "ppm" && average !== 0) {
                  const ppm = (stddev / Math.abs(average)) * 1_000_000;
                  displayStdDev = ppm.toFixed(3);
                } else {
                  displayStdDev = stddev.toPrecision(3);
                }
              }

              return (
                <tr key={rt.value}>
                  <td>{rt.label}</td>
                  <td>{average?.toPrecision(8) ?? "..."}</td>
                  <td>{displayStdDev}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

function CalibrationResults({
  showNotification,
  sharedFocusedTestPoint: focusedTP,
  uniqueTestPoints,
  onDataUpdate,
  navigationRequest,
}) {
  const { selectedSessionId, selectedSessionName, dataRefreshTrigger } = useInstruments();
  const { theme } = useTheme();

  const requestedDirection = useMemo(() => {
    const dir = navigationRequest?.direction;
    return dir === "Forward" || dir === "Reverse" || dir === "Combined"
      ? dir
      : null;
  }, [navigationRequest]);

  const requestedCycle = useMemo(() => {
    const c = navigationRequest?.cycleIndex;
    return Number.isFinite(c) && c > 0 ? c : null;
  }, [navigationRequest]);

  const [activeTab, setActiveTab] = useState("summary");
  const [detailsView, setDetailsView] = useState("chart");
  const [activeInstrument, setActiveInstrument] = useState("std");
  const [selectedReadingType, setSelectedReadingType] =
    useState("ac_open_readings");
  const [activeDirection, setActiveDirection] = useState(
    () => requestedDirection || "Overview"
  );
  // When set to a 1-based cycle ordinal, the summary view drills into a
  // specific cycle's results instead of the aggregate. Composes with
  // activeDirection: e.g. (Forward, 2) shows cycle 2's Forward breakdown.
  // null = aggregate / legacy view.
  const [activeCycle, setActiveCycle] = useState(null);
  // Reset the cycle drill-in whenever the user navigates back to Overview
  // (clicking a per-cycle card in Overview re-sets it to a number).
  useEffect(() => {
    if (activeDirection === "Overview") setActiveCycle(null);
  }, [activeDirection]);

  const hasBothDirections =
    focusedTP?.forward?.results && focusedTP?.reverse?.results;

  // At-a-glance deltas (used by the Overview summary view).
  //
  // Now produces:
  //   - `overall`: the pair-level mean (`pair_delta_uut_ppm`, mirrored on
  //     both Fwd and Rev results rows by recompute_pair_aggregate). Reads
  //     from either side; falls back to the legacy mean-of-direction-means
  //     for pre-cycle sessions where pair_* is null.
  //   - `overallUA`: pair-level Type A u_A = s(paired δ_i)/√N from the
  //     backend. Null when the pair is incomplete or pre-cycle data.
  //   - `cyclePairs`: ordered list of {i, fwd, rev, avg} — one entry per
  //     cycle ordinal. avg is the simple (fwd_i + rev_i)/2. Entries
  //     missing a half (e.g. mid-run when only fwd is done) still appear,
  //     so the operator can see partial progress.
  //   - Legacy `forward`/`reverse`/`combined` retained for the Fwd/Rev
  //     button row, which still renders the per-direction single-value
  //     entry into the direction-specific tabs.
  const overviewStats = useMemo(() => {
    const fwdLegacy = focusedTP?.forward?.results?.delta_uut_ppm;
    const revLegacy = focusedTP?.reverse?.results?.delta_uut_ppm;
    const fwdLegacyNum = fwdLegacy != null ? parseFloat(fwdLegacy) : null;
    const revLegacyNum = revLegacy != null ? parseFloat(revLegacy) : null;
    const combined =
      fwdLegacyNum != null && revLegacyNum != null
        ? (fwdLegacyNum + revLegacyNum) / 2
        : null;

    // Pair-level overall — backend-mirrored.
    const pairMean =
      focusedTP?.forward?.results?.pair_delta_uut_ppm
      ?? focusedTP?.reverse?.results?.pair_delta_uut_ppm
      ?? null;
    const pairUA =
      focusedTP?.forward?.results?.pair_type_a_uncertainty_ppm
      ?? focusedTP?.reverse?.results?.pair_type_a_uncertainty_ppm
      ?? null;

    // Per-cycle pairs (simple index pairing by cycle_index for display).
    const fwdCycles = (focusedTP?.forward?.results?.cycles || [])
      .slice()
      .sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
    const revCycles = (focusedTP?.reverse?.results?.cycles || [])
      .slice()
      .sort((a, b) => (a.cycle_index || 0) - (b.cycle_index || 0));
    const maxN = Math.max(fwdCycles.length, revCycles.length);
    const cyclePairs = [];
    for (let i = 0; i < maxN; i += 1) {
      const fwd = fwdCycles[i]?.delta_uut_ppm;
      const rev = revCycles[i]?.delta_uut_ppm;
      const fwdNum = fwd != null ? parseFloat(fwd) : null;
      const revNum = rev != null ? parseFloat(rev) : null;
      const avg =
        fwdNum != null && revNum != null ? (fwdNum + revNum) / 2 : null;
      cyclePairs.push({
        i: i + 1,
        fwd: fwdNum,
        rev: revNum,
        avg,
      });
    }

    const overall = pairMean != null ? Number(pairMean) : combined;
    const hasAny =
      overall != null
      || fwdLegacyNum != null
      || revLegacyNum != null
      || cyclePairs.length > 0;

    return {
      forward: fwdLegacyNum,
      reverse: revLegacyNum,
      combined,
      overall,
      overallUA: pairUA != null ? Number(pairUA) : null,
      cyclePairs,
      hasAny,
    };
  }, [focusedTP]);

  // Derive per-direction results / readings synchronously so the first
  // paint already has the correct data. Previously these lived in React
  // state populated by a post-mount useEffect, which caused a visible
  // flicker (the "Calculation cannot be shown..." placeholder briefly
  // rendered before the KaTeX equations on tab/card navigation).
  const { calResults, calReadings } = useMemo(() => {
    if (!focusedTP) {
      return { calResults: null, calReadings: null };
    }

    if (activeDirection === "Overview") {
      return { calResults: null, calReadings: null };
    }

    // Per-cycle drill-in. When activeCycle is set, synthesize calResults
    // from the CalibrationResultsCycle row(s) so the breakdown shows that
    // cycle's own phase averages instead of the aggregate. Correction
    // factors (η, δ_std, δ_ti, δ_std_known) are pulled from the parent
    // direction's results so the KaTeX formula renders the same constants
    // the backend used to compute the per-cycle δ.
    if (activeCycle != null && activeDirection !== "Overview") {
      const findCycle = (results) =>
        (results?.cycles || []).find((c) => c.cycle_index === activeCycle);

      if (activeDirection === "Combined") {
        // Per-cycle Combined: average the matching cycle row from each
        // direction. The breakdown then renders the combined-phase
        // averages → simple (δ_Fwd_i + δ_Rev_i)/2.
        const fwdCycle = findCycle(focusedTP?.forward?.results);
        const revCycle = findCycle(focusedTP?.reverse?.results);
        if (!fwdCycle || !revCycle) {
          return { calResults: null, calReadings: null };
        }
        const phaseKeys = [
          'std_ac_open_avg', 'std_dc_pos_avg', 'std_dc_neg_avg', 'std_ac_close_avg',
          'ti_ac_open_avg', 'ti_dc_pos_avg', 'ti_dc_neg_avg', 'ti_ac_close_avg',
        ];
        const stddevKeys = phaseKeys.map((k) => k.replace('_avg', '_stddev'));
        const synth = {};
        phaseKeys.forEach((k) => {
          const f = fwdCycle[k];
          const r = revCycle[k];
          synth[k] = f != null && r != null ? (Number(f) + Number(r)) / 2 : null;
        });
        stddevKeys.forEach((k) => {
          const f = fwdCycle[k];
          const r = revCycle[k];
          synth[k] = typeof f === 'number' && typeof r === 'number' ? (f + r) / 2 : null;
        });
        // Correction factors are session-level (same for both sides).
        const corrSrc = focusedTP?.forward?.results || focusedTP?.reverse?.results || {};
        synth.eta_std = corrSrc.eta_std;
        synth.eta_ti = corrSrc.eta_ti;
        synth.delta_std = corrSrc.delta_std;
        synth.delta_ti = corrSrc.delta_ti;
        synth.delta_std_known = corrSrc.delta_std_known;
        synth.delta_uut_ppm =
          fwdCycle.delta_uut_ppm != null && revCycle.delta_uut_ppm != null
            ? (Number(fwdCycle.delta_uut_ppm) + Number(revCycle.delta_uut_ppm)) / 2
            : null;
        // No readings array per-cycle (readings are flat across cycles in
        // the JSON; we'd have to filter them here if the user drills into
        // detailed readings for a single cycle. The Details tab will pull
        // from the parent direction's full readings when calReadings is
        // null, which is fine — the breakdown view doesn't need them).
        return { calResults: synth, calReadings: null };
      }

      // Per-cycle Forward or Reverse.
      const dirResults =
        activeDirection === 'Forward'
          ? focusedTP?.forward?.results
          : focusedTP?.reverse?.results;
      const cycleRow = findCycle(dirResults);
      if (!cycleRow || !dirResults) {
        return { calResults: null, calReadings: null };
      }
      return {
        calResults: {
          ...cycleRow,
          // Inherit correction factors from the parent direction's results.
          eta_std: dirResults.eta_std,
          eta_ti: dirResults.eta_ti,
          delta_std: dirResults.delta_std,
          delta_ti: dirResults.delta_ti,
          delta_std_known: dirResults.delta_std_known,
        },
        calReadings: null,
      };
    }

    if (activeDirection === "Combined") {
      const { forward, reverse } = focusedTP;
      if (
        !forward?.readings ||
        !reverse?.readings ||
        !forward?.results ||
        !reverse?.results
      ) {
        return { calResults: null, calReadings: null };
      }

      const combinedReadings = {};
      READING_KEY_NAMES.forEach((key) => {
        combinedReadings[key] = [
          ...(forward.readings[key] || []),
          ...(reverse.readings[key] || []),
        ];
      });

      const combinedResults = {};
      READING_KEY_NAMES.forEach((key) => {
        const readings = combinedReadings[key]
          .filter((r) => r.is_stable !== false)
          .map((r) => (typeof r === "object" ? r.value : r));
        if (readings.length > 0) {
          const sum = readings.reduce((a, b) => a + b, 0);
          const avg = sum / readings.length;
          combinedResults[key.replace("_readings", "_avg")] = avg;

          const stddevKey = key.replace("_readings", "_stddev");
          const stddevFwd = forward.results?.[stddevKey];
          const stddevRev = reverse.results?.[stddevKey];

          let newCombinedStddev = 0;
          if (
            typeof stddevFwd === "number" &&
            typeof stddevRev === "number"
          ) {
            newCombinedStddev = (stddevFwd + stddevRev) / 2;
          }
          combinedResults[stddevKey] = newCombinedStddev;
        }
      });

      const fwdPpm = forward.results.delta_uut_ppm;
      const revPpm = reverse.results.delta_uut_ppm;
      combinedResults.delta_uut_ppm =
        fwdPpm != null && revPpm != null
          ? (parseFloat(fwdPpm) + parseFloat(revPpm)) / 2
          : null;

      // Propagate the pair-level aggregate + correction factors onto the
      // synthesized Combined row so the headline KPI's pair-complete
      // branch fires (was reading these directly, which were undefined on
      // the synth — fix for the "pair incomplete" false negative).
      combinedResults.pair_delta_uut_ppm =
        forward.results.pair_delta_uut_ppm
        ?? reverse.results.pair_delta_uut_ppm
        ?? null;
      combinedResults.pair_type_a_uncertainty_ppm =
        forward.results.pair_type_a_uncertainty_ppm
        ?? reverse.results.pair_type_a_uncertainty_ppm
        ?? null;
      combinedResults.delta_uut_ppm_avg =
        forward.results.delta_uut_ppm_avg
        ?? reverse.results.delta_uut_ppm_avg
        ?? null;
      combinedResults.type_a_uncertainty_ppm =
        forward.results.type_a_uncertainty_ppm
        ?? reverse.results.type_a_uncertainty_ppm
        ?? null;
      combinedResults.eta_std = forward.results.eta_std ?? reverse.results.eta_std;
      combinedResults.eta_ti = forward.results.eta_ti ?? reverse.results.eta_ti;
      combinedResults.delta_std = forward.results.delta_std ?? reverse.results.delta_std;
      combinedResults.delta_ti = forward.results.delta_ti ?? reverse.results.delta_ti;
      combinedResults.delta_std_known =
        forward.results.delta_std_known ?? reverse.results.delta_std_known;
      combinedResults.cycles = forward.results.cycles ?? reverse.results.cycles ?? [];

      return { calResults: combinedResults, calReadings: combinedReadings };
    }

    const pointForDirection =
      activeDirection === "Forward" ? focusedTP?.forward : focusedTP?.reverse;
    return {
      calResults: pointForDirection?.results || null,
      calReadings: pointForDirection?.readings || null,
    };
  }, [focusedTP, activeDirection, activeCycle]);

  // Refetch data when the WebSocket sends a 'connection_sync' signal
  useEffect(() => {
    if (onDataUpdate) {
      onDataUpdate();
    }
  }, [dataRefreshTrigger, onDataUpdate]);

  useLayoutEffect(() => {
    if (!requestedDirection) return;
    setActiveTab("summary");
    setActiveDirection(requestedDirection);
    // requestedCycle is optional — clear when not present so a follow-up
    // aggregate request doesn't inherit a stale cycle drill-in.
    setActiveCycle(requestedCycle);
  }, [requestedDirection, requestedCycle]);

  const handleMarkStability = useCallback(async (stabilityData) => {
    if (!focusedTP || !selectedSessionId) {
      showNotification("No focused test point selected.", "error");
      return;
    }

    const pointForDirection = activeDirection === "Forward"
      ? focusedTP.forward
      : activeDirection === "Reverse"
        ? focusedTP.reverse
        : focusedTP.forward; // Default to forward for "Combined"

    if (!pointForDirection || !pointForDirection.id) {
      showNotification("No valid test point selected for this direction.", "error");
      return;
    }

    const prefix = activeInstrument === "std" ? "std_" : "ti_";
    const readingType = READING_TYPES.find(rt => rt.label === stabilityData.type);

    if (!readingType) {
      showNotification("Invalid reading type selected.", "error");
      return;
    }

    const reading_key = `${prefix}${readingType.value}`;

    const payload = {
      reading_key: reading_key,
      start_index: parseInt(stabilityData.start, 10),
      end_index: parseInt(stabilityData.end, 10),
      is_stable: stabilityData.mark_as === 'stable'
    };

    let testPointIdsToUpdate = [pointForDirection.id];
    if (activeDirection === "Combined" && focusedTP.reverse && focusedTP.reverse.id !== pointForDirection.id) {
      testPointIdsToUpdate.push(focusedTP.reverse.id);
    }

    try {
      for (const tpId of testPointIdsToUpdate) {
        await axios.post(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${tpId}/mark-readings-stability/`,
          payload
        );
      }

      let successMessage = `Readings ${payload.start_index}-${payload.end_index} for ${activeInstrument.toUpperCase()} ${readingType.label} marked as ${stabilityData.mark_as}. Averages recalculated.`;
      if (activeDirection === "Combined" && testPointIdsToUpdate.length > 1) {
        successMessage = `Updated stability for Forward and Reverse directions. Averages recalculated.`;
      }

      showNotification(successMessage, "success");
      await onDataUpdate();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Failed to update reading stability.";
      showNotification(errorMsg, "error");
      console.error(error);
    }
  }, [focusedTP, selectedSessionId, activeDirection, activeInstrument, onDataUpdate, showNotification]);

  const formatFrequency = (value) =>
    (
      AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
        text: `${value}Hz`,
      }
    ).text;

  const buildRawReadingsChartData = (prefix) => {
    if (!calReadings) return { labels: [], datasets: [] };
    const datasets = READING_TYPES.map((rt) => {
      const key = `${prefix}${rt.value}`;
      const baseColor = rt.color;

      return {
        label: rt.label,
        data: (calReadings[key] || []).map((point, index) => {
          const p =
            typeof point === "object"
              ? point
              : { value: point, is_stable: true, timestamp: null };
          return {
            x: index + 1,
            y: p.value,
            t: p.timestamp ? new Date(p.timestamp * 1000) : null,
            is_stable: p.is_stable,
          };
        }),
        borderColor: baseColor,
        backgroundColor: baseColor.replace(")", ", 0.5)").replace("rgb", "rgba"),
        tension: 0.1,
        fill: false,
        segment: {
          borderDash: (ctx) => {
            if (ctx.p0.raw?.is_stable === false || ctx.p1.raw?.is_stable === false) {
              return [6, 6];
            }
            return undefined;
          },
        }
      };
    });
    const allXLabels = datasets.flatMap((ds) => ds.data.map((d) => d.x));
    const uniqueXLabels = [...new Set(allXLabels)].sort((a, b) => a - b);
    return { labels: uniqueXLabels, datasets };
  };

  const CalculationBreakdown = ({ results }) => {
    if (
      !results ||
      results.delta_std_known == null ||
      results.eta_std == null ||
      results.eta_ti == null ||
      results.delta_std == null ||
      results.delta_ti == null ||
      results.delta_uut_ppm == null
    ) {
      return (
        <div className="form-section-warning">
          <p>
            Calculation cannot be shown until all factors and readings are
            complete for this direction.
          </p>
        </div>
      );
    }
    const V_DCSTD =
      (Math.abs(results.std_dc_pos_avg) + Math.abs(results.std_dc_neg_avg)) / 2;
    const V_ACSTD =
      (Math.abs(results.std_ac_open_avg) + Math.abs(results.std_ac_close_avg)) /
      2;
    const V_DCUUT =
      (Math.abs(results.ti_dc_pos_avg) + Math.abs(results.ti_dc_neg_avg)) / 2;
    const V_ACUUT =
      (Math.abs(results.ti_ac_open_avg) + Math.abs(results.ti_ac_close_avg)) /
      2;
    const term_STD =
      ((V_ACSTD - V_DCSTD) * 1000000) / (results.eta_std * V_DCSTD);
    const term_UUT =
      ((V_ACUUT - V_DCUUT) * 1000000) / (results.eta_ti * V_DCUUT);
    const mainFormula = `$$ \\delta_{UUT} \\approx \\delta_{STD} + \\left( \\frac{V_{AC} - V_{DC}}{\\eta \\times V_{DC}} \\right)_{STD} \\times 10^6 - \\left( \\frac{V_{AC} - V_{DC}}{\\eta \\times V_{DC}} \\right)_{UUT} \\times 10^6 + \\delta_{USTD:TVC} - \\delta_{UUT:TVC} $$`;
    const appliedValues = `$$ \\delta_{UUT} \\approx ${results.delta_std_known
      } + \\left( \\frac{${V_ACSTD.toPrecision(8)} - ${V_DCSTD.toPrecision(8)}}{${results.eta_std
      } \\times ${V_DCSTD.toPrecision(
        8
      )}} \\right) \\times 10^6 - \\left( \\frac{${V_ACUUT.toPrecision(
        8
      )} - ${V_DCUUT.toPrecision(8)}}{${results.eta_ti
      } \\times ${V_DCUUT.toPrecision(8)}} \\right) \\times 10^6 + ${results.delta_std
      } - ${results.delta_ti} $$`;
    const intermediateBreakdown = `$$ \\delta_{UUT} \\approx ${results.delta_std_known.toFixed(
      3
    )} + ${term_STD.toFixed(3)} - ${term_UUT.toFixed(
      3
    )} + ${results.delta_std.toFixed(3)} - ${results.delta_ti.toFixed(3)} $$`;
    const finalResult = `$$ \\delta_{UUT} \\approx ${parseFloat(
      results.delta_uut_ppm
    ).toFixed(3)} \\text{ PPM} $$`;

    return (
      <div className="calculation-breakdown cal-results-calc-breakdown cal-results-calc-breakdown--flat">
        <p className="cal-results-calc-lead">
          Direction: <strong>{activeDirection}</strong>
        </p>
        <p className="cal-results-calc-step-label">
          <strong>1. Full formula</strong>
        </p>
        <p>
          <MathDisplay math={mainFormula} />
        </p>
        <hr />
        <p className="cal-results-calc-step-label">
          <strong>2. Applied values</strong>
        </p>
        <p className="cal-results-calc-math-scroll">
          <MathDisplay math={appliedValues} />
        </p>
        <hr />
        <p className="cal-results-calc-step-label">
          <strong>3. Intermediate calculation</strong>
        </p>
        <p>
          <MathDisplay math={intermediateBreakdown} />
        </p>
        <hr />
        <p className="cal-results-calc-step-label">
          <strong>4. Final result</strong>
        </p>
        <p>
          <MathDisplay math={finalResult} />
        </p>
      </div>
    );
  };

  return (
    <div className="content-area">
      {!selectedSessionId && (
        <div className="form-section-warning">
          <p>
            Please select a session from the "Session Setup" tab to view data
            output.
          </p>
        </div>
      )}
      {selectedSessionId && (
        <main>
          <div className="calibration-workflow-container">
            <div className="test-point-content">
              {!focusedTP ? (
                <div className="placeholder-content">
                  <h3>Select a Test Point</h3>
                  <p>
                    Please select a test point from the list on the left to begin.
                  </p>
                </div>
              ) : (
                <section
                  className="cal-results-panel"
                  aria-label="Calibration results for selected test point"
                >
                  <>
                <header className="cal-results-bar">
                  <div className="cal-results-bar-meta" aria-live="polite">
                    <span className="cal-results-bar-amps">
                      {focusedTP.current} A
                    </span>
                    <span className="cal-results-bar-freq">
                      {formatFrequency(focusedTP.frequency)}
                    </span>
                  </div>

                  <div className="cal-results-tabs-cluster">
                    <nav
                      className="cal-results-tabs"
                      role="tablist"
                      aria-label="Results view"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "summary"}
                        className={`cal-results-tab ${activeTab === "summary" ? "is-active" : ""
                          }`}
                        onClick={() => setActiveTab("summary")}
                      >
                        Summary
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "details"}
                        className={`cal-results-tab ${activeTab === "details" ? "is-active" : ""
                          }`}
                        onClick={() => {
                          setActiveTab("details");
                          if (activeDirection === "Overview") {
                            setActiveDirection("Forward");
                          }
                        }}
                      >
                        Raw data
                      </button>
                    </nav>
                    <button
                      type="button"
                      className="cal-results-excel-icon-btn"
                      aria-label="Export session to Excel"
                      title="Export session to Excel — AC–DC summary and all raw readings"
                      disabled={!uniqueTestPoints?.length}
                      onClick={async () => {
                        const r = await downloadFullSessionExcel({
                          uniqueTestPoints,
                          sessionName: selectedSessionName,
                          sessionId: selectedSessionId,
                        });
                        if (!r.ok) {
                          showNotification(r.error, "warning");
                        } else {
                          showNotification("Workbook downloaded.", "success");
                        }
                      }}
                    >
                      <FaDownload aria-hidden />
                    </button>
                  </div>

                  <div className="cal-results-bar-tools">
                    <CustomDropdown
                      className="cal-results-dir-dropdown"
                      ariaLabel="Measurement direction"
                      searchable={false}
                      value={activeDirection}
                      onChange={setActiveDirection}
                      options={[
                        // Overview is a Summary-only concept; hide it from
                        // the picker while viewing raw readings.
                        ...(activeTab === "summary"
                          ? [{ label: "Overview", value: "Overview" }]
                          : []),
                        { label: "Forward", value: "Forward" },
                        { label: "Reverse", value: "Reverse" },
                        {
                          label: "Combined",
                          value: "Combined",
                          disabled: !hasBothDirections,
                        },
                      ]}
                    />
                  </div>
                </header>

                {activeTab === "summary" && activeDirection === "Overview" && (
                  <div className="cal-results-summary cal-results-overview">
                    {overviewStats.hasAny ? (
                      <>
                        {/*
                          Headline card: average across all cycles (pair-level
                          mean δ + u_A from `pair_delta_uut_ppm`, mirrored on
                          both Fwd and Rev results rows). Falls back to the
                          legacy (Fwd + Rev) / 2 single-pass value for
                          pre-cycle sessions.
                        */}
                        {overviewStats.overall != null && (
                          <button
                            type="button"
                            className="cal-calc-kpi cal-calc-kpi--primary cal-results-overview-card"
                            onClick={() => setActiveDirection("Combined")}
                            aria-label="View combined details"
                          >
                            <p className="cal-calc-kpi-label">
                              Final averaged AC–DC difference
                            </p>
                            <div className="cal-calc-kpi-value-row">
                              <span className="cal-calc-kpi-num">
                                {overviewStats.overall.toFixed(3)}
                              </span>
                              {overviewStats.overallUA != null && (
                                <span className="cal-calc-kpi-uncertainty">
                                  &nbsp;±&nbsp;{overviewStats.overallUA.toFixed(3)}
                                </span>
                              )}
                              <span className="cal-calc-kpi-unit">ppm</span>
                            </div>
                            {overviewStats.cyclePairs.length > 0 && (
                              <p className="cal-results-overview-caption">
                                Mean across {
                                  overviewStats.cyclePairs.filter((p) => p.avg != null).length
                                }{" "}
                                paired cycle{
                                  overviewStats.cyclePairs.filter((p) => p.avg != null).length === 1
                                    ? ""
                                    : "s"
                                }
                              </p>
                            )}
                          </button>
                        )}

                        {/*
                          Per-cycle cards. Each row is one cycle, with three
                          clickable cards: that cycle's Forward δ, Reverse δ,
                          and the direct (Fwd_i + Rev_i)/2 average. Clicking
                          one drills into the per-cycle KaTeX breakdown by
                          setting `activeDirection` + `activeCycle`.
                        */}
                        {overviewStats.cyclePairs.length > 0 && (
                          <div className="cal-results-cycle-list">
                            {overviewStats.cyclePairs.map((p) => (
                              <div
                                key={p.i}
                                className="cal-results-cycle-row"
                                aria-label={`Cycle ${p.i} results`}
                              >
                                <span className="cal-results-cycle-label">
                                  Cycle {p.i}
                                </span>
                                <div className="cal-calc-direction-grid cal-results-cycle-cards">
                                  <button
                                    type="button"
                                    className="cal-calc-kpi cal-results-overview-card"
                                    onClick={() => {
                                      setActiveCycle(p.i);
                                      setActiveDirection("Forward");
                                    }}
                                    disabled={p.fwd == null}
                                    title={`View cycle ${p.i} forward breakdown`}
                                    aria-label={`View cycle ${p.i} forward breakdown`}
                                  >
                                    <p className="cal-calc-kpi-label">
                                      Forward · δ
                                    </p>
                                    <div className="cal-calc-kpi-value-row">
                                      <span className="cal-calc-kpi-num">
                                        {p.fwd != null ? p.fwd.toFixed(3) : "—"}
                                      </span>
                                      <span className="cal-calc-kpi-unit">ppm</span>
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    className="cal-calc-kpi cal-results-overview-card"
                                    onClick={() => {
                                      setActiveCycle(p.i);
                                      setActiveDirection("Reverse");
                                    }}
                                    disabled={p.rev == null}
                                    title={`View cycle ${p.i} reverse breakdown`}
                                    aria-label={`View cycle ${p.i} reverse breakdown`}
                                  >
                                    <p className="cal-calc-kpi-label">
                                      Reverse · δ
                                    </p>
                                    <div className="cal-calc-kpi-value-row">
                                      <span className="cal-calc-kpi-num">
                                        {p.rev != null ? p.rev.toFixed(3) : "—"}
                                      </span>
                                      <span className="cal-calc-kpi-unit">ppm</span>
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    className="cal-calc-kpi cal-results-overview-card cal-results-overview-card--accent"
                                    onClick={() => {
                                      setActiveCycle(p.i);
                                      setActiveDirection("Combined");
                                    }}
                                    disabled={p.avg == null}
                                    title={`View cycle ${p.i} paired breakdown`}
                                    aria-label={`View cycle ${p.i} paired breakdown`}
                                  >
                                    <p className="cal-calc-kpi-label">
                                      Cycle avg · (Fwd + Rev) / 2
                                    </p>
                                    <div className="cal-calc-kpi-value-row">
                                      <span className="cal-calc-kpi-num">
                                        {p.avg != null ? p.avg.toFixed(3) : "—"}
                                      </span>
                                      <span className="cal-calc-kpi-unit">ppm</span>
                                    </div>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/*
                          Legacy per-direction cards retained as click-targets
                          to drill into Forward/Reverse detail tabs. Only
                          renders when there's no per-cycle data (pre-cycle
                          sessions) — otherwise the per-cycle grid above
                          covers the same ground in a richer way.
                        */}
                        {overviewStats.cyclePairs.length === 0 && (
                          <div className="cal-calc-direction-grid">
                            <button
                              type="button"
                              className="cal-calc-kpi cal-results-overview-card"
                              onClick={() =>
                                overviewStats.forward != null &&
                                setActiveDirection("Forward")
                              }
                              disabled={overviewStats.forward == null}
                              aria-label="View forward details"
                            >
                              <p className="cal-calc-kpi-label">
                                Forward · δ UUT
                              </p>
                              <div className="cal-calc-kpi-value-row">
                                <span className="cal-calc-kpi-num">
                                  {overviewStats.forward != null
                                    ? overviewStats.forward.toFixed(3)
                                    : "—"}
                                </span>
                                <span className="cal-calc-kpi-unit">ppm</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              className="cal-calc-kpi cal-results-overview-card"
                              onClick={() =>
                                overviewStats.reverse != null &&
                                setActiveDirection("Reverse")
                              }
                              disabled={overviewStats.reverse == null}
                              aria-label="View reverse details"
                            >
                              <p className="cal-calc-kpi-label">
                                Reverse · δ UUT
                              </p>
                              <div className="cal-calc-kpi-value-row">
                                <span className="cal-calc-kpi-num">
                                  {overviewStats.reverse != null
                                    ? overviewStats.reverse.toFixed(3)
                                    : "—"}
                                </span>
                                <span className="cal-calc-kpi-unit">ppm</span>
                              </div>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="cal-calc-empty">
                        <h3 className="cal-calc-empty-title">
                          No results yet
                        </h3>
                        <p className="cal-calc-empty-text">
                          Complete readings and calculate AC–DC difference in
                          the Calibration tab to see an at-a-glance summary
                          here.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "summary" && activeDirection !== "Overview" && (
                  <div className="cal-results-summary">
                    {activeCycle != null && (
                      <div className="cal-results-cycle-context">
                        <span className="cal-results-cycle-context-label">
                          Drilled into <strong>Cycle {activeCycle} · {activeDirection}</strong>
                        </span>
                        <button
                          type="button"
                          className="cal-results-cycle-context-back"
                          onClick={() => setActiveCycle(null)}
                          title="Back to aggregate (all cycles)"
                        >
                          Show all cycles
                        </button>
                      </div>
                    )}
                    <div className="cal-results-kpi-wrap">
                      {/*
                        Source-of-truth priority (matches recompute_pair_aggregate on the backend):
                          1. Per-cycle drill-in (activeCycle != null): use that cycle's own
                             δ value from the synthesized calResults — same row as the
                             card the user clicked on the Overview tab.
                          2. Pair aggregate (`pair_delta_uut_ppm` ± `pair_type_a_uncertainty_ppm`) —
                             present once both Fwd and Rev have ≥2 cycles. This is what gets compared
                             against spec.
                          3. Per-direction mean (`delta_uut_ppm_avg` ± `type_a_uncertainty_ppm`) —
                             shown with a "pair incomplete" caption when only one direction has run.
                          4. Legacy single-pass `delta_uut_ppm` for pre-N-cycle sessions.
                      */}
                      {(() => {
                        // Per-cycle drill-in.
                        if (activeCycle != null) {
                          const cycleDelta = calResults?.delta_uut_ppm;
                          const titleSuffix =
                            activeDirection === "Combined"
                              ? `Cycle ${activeCycle} · paired`
                              : `Cycle ${activeCycle} · ${activeDirection}`;
                          return (
                            <ResultsKpi
                              title={`AC–DC difference · ${titleSuffix}`}
                              value={cycleDelta}
                              uncertainty={null}
                              nCycles={null}
                              formula={
                                activeDirection === "Combined"
                                  ? `$$ \\delta_{${activeCycle}} = (\\delta_{Fwd,${activeCycle}} + \\delta_{Rev,${activeCycle}}) / 2 $$`
                                  : `$$ \\delta_{${activeDirection === "Forward" ? "Fwd" : "Rev"},${activeCycle}} $$`
                              }
                            />
                          );
                        }

                        const pairMean = calResults?.pair_delta_uut_ppm;
                        const pairUA = calResults?.pair_type_a_uncertainty_ppm;
                        // Reading from either side works because the backend mirrors
                        // pair_* onto both rows; cycles arrays themselves are
                        // per-direction so we count both to display "N pairs".
                        const fwdCount = focusedTP?.forward?.results?.cycles?.length || 0;
                        const revCount = focusedTP?.reverse?.results?.cycles?.length || 0;
                        const nPairs = Math.min(fwdCount, revCount);

                        if (pairMean !== null && pairMean !== undefined) {
                          return (
                            <ResultsKpi
                              title="AC–DC difference (paired)"
                              value={pairMean}
                              uncertainty={pairUA}
                              nCycles={nPairs || null}
                              formula={`$$ \\bar{\\delta} = \\overline{(\\delta_{Fwd,i} + \\delta_{Rev,N+1-i})/2} $$`}
                            />
                          );
                        }

                        // Pair incomplete — fall back to per-direction mean.
                        return (
                          <ResultsKpi
                            title={
                              fwdCount === 0 && revCount === 0
                                ? "AC–DC difference (UUT)"
                                : "AC–DC difference (pair incomplete)"
                            }
                            value={
                              calResults?.delta_uut_ppm_avg ??
                              calResults?.delta_uut_ppm
                            }
                            uncertainty={calResults?.type_a_uncertainty_ppm}
                            nCycles={calResults?.cycles?.length || null}
                            formula={
                              activeDirection === "Combined"
                                ? `$$ \\text{Avg} = (\\delta_{Fwd} + \\delta_{Rev}) / 2 $$`
                                : `$$ \\delta_{${activeDirection === "Forward"
                                  ? "Fwd"
                                  : "Rev"
                                }} $$`
                            }
                          />
                        );
                      })()}
                    </div>

                    {(activeDirection !== "Combined" || activeCycle != null) && (
                      <details
                        className="cal-results-disclosure cal-results-disclosure--math"
                        open
                      >
                        <summary className="cal-results-disclosure-summary">
                          Calculation breakdown
                        </summary>
                        <div className="cal-results-disclosure-body">
                          <CalculationBreakdown results={calResults} />
                        </div>
                      </details>
                    )}

                    {(activeDirection !== "Combined" || activeCycle != null) && (
                      <>
                        <details className="cal-results-disclosure">
                          <summary className="cal-results-disclosure-summary">
                            Standard instrument
                          </summary>
                          <div className="cal-results-disclosure-body">
                            <SummaryTable
                              results={calResults}
                              prefix="std_"
                            />
                          </div>
                        </details>

                        <details className="cal-results-disclosure">
                          <summary className="cal-results-disclosure-summary">
                            Test instrument
                          </summary>
                          <div className="cal-results-disclosure-body">
                            <SummaryTable
                              results={calResults}
                              prefix="ti_"
                            />
                          </div>
                        </details>
                      </>
                    )}
                  </div>
                )}

                {activeTab === "details" && activeDirection === "Overview" && (
                  <div className="cal-results-details">
                    <div className="cal-calc-empty">
                      <h3 className="cal-calc-empty-title">
                        Pick a direction
                      </h3>
                      <p className="cal-calc-empty-text">
                        Choose Forward, Reverse, or Combined above to view raw
                        readings for that direction.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "details" && activeDirection !== "Overview" && (
                  <div className="cal-results-details">
                    <div className="cal-results-strip">
                      <div
                        className="cal-results-pill-group"
                        role="group"
                        aria-label="Instrument"
                      >
                        <button
                          type="button"
                          className={`cal-results-pill ${activeInstrument === "std" ? "is-active" : ""
                            }`}
                          onClick={() => setActiveInstrument("std")}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          className={`cal-results-pill ${activeInstrument === "ti" ? "is-active" : ""
                            }`}
                          onClick={() => setActiveInstrument("ti")}
                        >
                          UUT
                        </button>
                      </div>
                      <div
                        className="cal-results-pill-group"
                        role="group"
                        aria-label="Data view"
                      >
                        <button
                          type="button"
                          className={`cal-results-pill ${detailsView === "chart" ? "is-active" : ""
                            }`}
                          onClick={() => setDetailsView("chart")}
                        >
                          Chart
                        </button>
                        <button
                          type="button"
                          className={`cal-results-pill ${detailsView === "table" ? "is-active" : ""
                            }`}
                          onClick={() => setDetailsView("table")}
                        >
                          Table
                        </button>
                      </div>
                      {detailsView === "table" && (
                        <select
                          id="cal-results-measurement-type"
                          className="cal-results-inline-select"
                          value={selectedReadingType}
                          onChange={(e) =>
                            setSelectedReadingType(e.target.value)
                          }
                          aria-label="Measurement type"
                        >
                          {READING_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {detailsView === "table" && (
                      <div className="cal-results-table-panel">
                        <DetailedReadingsTable
                          readingsArray={
                            calReadings
                              ? calReadings[
                              `${activeInstrument}_${selectedReadingType}`
                              ]
                              : []
                          }
                        />
                      </div>
                    )}

                    {detailsView === "chart" && (
                      <div className="chart-container cal-results-chart-wrap">
                        <CalibrationChart
                          title={`${activeInstrument === "std"
                              ? "Standard"
                              : "Test"
                            } · ${activeDirection}`}
                          chartData={buildRawReadingsChartData(
                            `${activeInstrument}_`
                          )}
                          theme={theme}
                          chartType="line"
                          onMarkStability={handleMarkStability}
                          instrumentType={activeInstrument}
                        />
                      </div>
                    )}
                  </div>
                )}
                  </>
                </section>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

export default CalibrationResults;