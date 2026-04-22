// src/components/calibration/CalibrationResults.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useInstruments } from "../../contexts/InstrumentContext";
import { FaDownload } from "react-icons/fa";
import CalibrationChart from "./CalibrationChart";
import { downloadFullSessionExcel } from "./sessionExcelExport";
import CustomDropdown from "../shared/CustomDropdown";
import { useTheme } from "../../contexts/ThemeContext";
import { API_BASE_URL } from "../../constants/constants";
import axios from "axios";

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

// Reusable MathDisplay Component for isolated MathJax rendering
const MathDisplay = ({ math }) => {
  const containerRef = useRef(null);
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (window.MathJax && containerRef.current) {
      window.MathJax
        .typesetPromise([containerRef.current])
        .then(() => {
          if (!isCancelled) setHasRenderedOnce(true);
        })
        .catch((err) => {
          if (!isCancelled) {
            // Fall back to showing content if MathJax fails.
            setHasRenderedOnce(true);
          }
          console.error("MathJax typeset failed:", err);
        });
    } else {
      // If MathJax is not available yet, avoid hiding content.
      setHasRenderedOnce(true);
    }

    return () => {
      isCancelled = true;
    };
  }, [math]);

  return (
    <span
      ref={containerRef}
      style={{
        // Only hide the very first paint to prevent raw TeX flash.
        // On subsequent math updates, keep existing render visible until new one is ready.
        visibility: hasRenderedOnce ? "visible" : "hidden",
      }}
    >
      {math}
    </span>
  );
};

const ResultsKpi = ({ title, value, formula }) => {
  const isCalculated = value !== null && value !== undefined;
  return (
    <div className="cal-results-kpi">
      <p className="cal-results-kpi-label">{title}</p>
      <div className="cal-results-kpi-value-row">
        <span className="cal-results-kpi-num">
          {isCalculated ? parseFloat(value).toFixed(3) : "—"}
        </span>
        <span className="cal-results-kpi-unit">ppm</span>
      </div>
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

  const [calResults, setCalResults] = useState(null);
  const [calReadings, setCalReadings] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [detailsView, setDetailsView] = useState("chart");
  const [activeInstrument, setActiveInstrument] = useState("std");
  const [selectedReadingType, setSelectedReadingType] =
    useState("ac_open_readings");
  const [activeDirection, setActiveDirection] = useState("Overview");

  const hasBothDirections =
    focusedTP?.forward?.results && focusedTP?.reverse?.results;

  // At-a-glance deltas (used by the Overview summary view)
  const overviewStats = useMemo(() => {
    const fwd = focusedTP?.forward?.results?.delta_uut_ppm;
    const rev = focusedTP?.reverse?.results?.delta_uut_ppm;
    const fwdNum = fwd != null ? parseFloat(fwd) : null;
    const revNum = rev != null ? parseFloat(rev) : null;
    const combined =
      fwdNum != null && revNum != null ? (fwdNum + revNum) / 2 : null;
    return {
      forward: fwdNum,
      reverse: revNum,
      combined,
      hasAny: fwdNum != null || revNum != null,
    };
  }, [focusedTP]);

  // Refetch data when the WebSocket sends a 'connection_sync' signal
  useEffect(() => {
    if (onDataUpdate) {
      onDataUpdate();
    }
  }, [dataRefreshTrigger, onDataUpdate]);

  useEffect(() => {
    if (!navigationRequest?.direction) return;
    const allowedDirections = new Set(["Forward", "Reverse", "Combined"]);
    if (!allowedDirections.has(navigationRequest.direction)) return;
    setActiveTab("summary");
    setActiveDirection(navigationRequest.direction);
  }, [navigationRequest]);

  useEffect(() => {
    if (!focusedTP) {
      setCalResults(null);
      setCalReadings(null);
      return;
    }

    if (activeDirection === "Overview") {
      // Overview uses focusedTP directly; no per-direction hydrate needed.
      setCalResults(null);
      setCalReadings(null);
      return;
    }

    if (activeDirection === "Combined") {
      const { forward, reverse } = focusedTP;
      if (
        forward?.readings &&
        reverse?.readings &&
        forward?.results &&
        reverse?.results
      ) {
        const combinedReadings = {};
        READING_KEY_NAMES.forEach((key) => {
          combinedReadings[key] = [
            ...(forward.readings[key] || []),
            ...(reverse.readings[key] || []),
          ];
        });
        setCalReadings(combinedReadings);

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

        if (fwdPpm != null && revPpm != null) {
          combinedResults.delta_uut_ppm = (parseFloat(fwdPpm) + parseFloat(revPpm)) / 2;
        } else {
          combinedResults.delta_uut_ppm = null;
        }

        setCalResults(combinedResults);
      } else {
        setCalResults(null);
        setCalReadings(null);
      }
    } else {
      const pointForDirection =
        activeDirection === "Forward" ? focusedTP?.forward : focusedTP?.reverse;
      setCalResults(pointForDirection?.results || null);
      setCalReadings(pointForDirection?.readings || null);
    }
  }, [focusedTP, activeDirection]);

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
          {!focusedTP ? (
            <div className="cal-results-empty" role="status">
              <div className="cal-results-empty-card">
                <h3 className="cal-results-empty-title">Select a test point</h3>
                <p className="cal-results-empty-text">
                  Choose a point in the sidebar to view AC–DC results,
                  summaries, and raw readings for this session.
                </p>
              </div>
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
                        {overviewStats.combined != null && (
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
                                {overviewStats.combined.toFixed(3)}
                              </span>
                              <span className="cal-calc-kpi-unit">ppm</span>
                            </div>
                          </button>
                        )}

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
                    <div className="cal-results-kpi-wrap">
                      <ResultsKpi
                        title="AC–DC difference (UUT)"
                        value={calResults?.delta_uut_ppm}
                        formula={
                          activeDirection === "Combined"
                            ? `$$ \\text{Avg} = (\\delta_{Fwd} + \\delta_{Rev}) / 2 $$`
                            : `$$ \\delta_{${activeDirection === "Forward"
                              ? "Fwd"
                              : "Rev"
                            }} $$`
                        }
                      />
                    </div>

                    {activeDirection !== "Combined" && (
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

                    {activeDirection !== "Combined" && (
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
        </main>
      )}
    </div>
  );
}

export default CalibrationResults;