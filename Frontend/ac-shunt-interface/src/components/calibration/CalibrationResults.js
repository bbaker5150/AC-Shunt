// src/components/calibration/CalibrationResults.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { useInstruments } from "../../contexts/InstrumentContext";
import {
  FaDownload,
  FaTable,
  FaChartBar,
  FaCalculator,
  FaBookOpen,
  FaChevronDown,
} from "react-icons/fa";
import CalibrationChart from "./CalibrationChart";
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

// Reusable Accordion Component
const Accordion = ({ title, children, initialOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <h3>{title}</h3>
        <FaChevronDown className={`accordion-icon ${isOpen ? "open" : ""}`} />
      </div>
      {isOpen && <div className="accordion-content">{children}</div>}
    </div>
  );
};

// Direction Dropdown Component
const DirectionDropdown = ({ activeDirection, setActiveDirection, point }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const hasBothDirections = point?.forward?.results && point?.reverse?.results;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (direction) => {
    setActiveDirection(direction);
    setIsOpen(false);
  };

  return (
    <div className="direction-dropdown-container" ref={dropdownRef}>
      <button
        className="direction-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          Direction: <strong>{activeDirection}</strong>
        </span>
        <FaChevronDown className={`chevron-icon ${isOpen ? "open" : ""}`} />
      </button>
      {isOpen && (
        <div className="direction-dropdown-menu">
          <button onClick={() => handleSelect("Forward")}>Forward</button>
          <button onClick={() => handleSelect("Reverse")}>Reverse</button>
          <button
            onClick={() => handleSelect("Combined")}
            disabled={!hasBothDirections}
            title={!hasBothDirections ? "Both directions must be complete" : ""}
          >
            Combined
          </button>
        </div>
      )}
    </div>
  );
};

const FinalResultCard = ({ title, value, formula }) => {
  const isCalculated = value !== null && value !== undefined;
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div className="final-result-card" style={{ flex: '1 1 400px', minWidth: '300px' }}>
        <h4>{title}</h4>
        <p>
          {isCalculated ? parseFloat(value).toFixed(3) : "---"}
          <span style={{ fontSize: "1.5rem", marginLeft: "10px", opacity: 0.8 }}>
            PPM
          </span>
        </p>
        {formula && (
          <span style={{ opacity: 0.7, fontSize: "0.9rem" }}>{formula}</span>
        )}
      </div>
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
      <div className="summary-table-header">
        <h4>Readings Summary</h4>
        <div className="unit-toggle">
          <button
            className={stdDevUnit === "ppm" ? "active" : ""}
            onClick={() => setStdDevUnit("ppm")}
          >
            PPM
          </button>
          <button
            className={stdDevUnit === "volts" ? "active" : ""}
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
  onDataUpdate
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
  const [showCalcDetails, setShowCalcDetails] = useState(false);
  const [activeDirection, setActiveDirection] = useState("Forward");
  
  useEffect(() => {
    if (window.MathJax && (showCalcDetails || activeTab === "summary")) {
      window.MathJax.typesetPromise?.().catch((err) =>
        console.error("MathJax typeset failed:", err)
      );
    }
  }, [showCalcDetails, calResults, activeTab, activeDirection]);

  // Refetch data when the WebSocket sends a 'connection_sync' signal
  useEffect(() => {
    if (onDataUpdate) {
      onDataUpdate();
    }
  }, [dataRefreshTrigger, onDataUpdate]);

  useEffect(() => {
    if (!focusedTP) {
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

        combinedResults.delta_uut_ppm = forward.results.delta_uut_ppm_avg;
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

  // Helper function to force Electron to trigger the native save dialog
  const triggerBrowserDownload = (wb, filename) => {
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportReadingsToXLSX = (instrumentType) => {
    if (!calReadings || !calResults) {
      showNotification("No data available to export.", "warning");
      return;
    }
    const wb = XLSX.utils.book_new();
    const prefix = instrumentType === "std" ? "std_" : "ti_";
    const instrumentName =
      instrumentType === "std" ? "Standard" : "Test_Instrument";

    // Reusable Welford's algorithm to perfectly match the LiveStatisticsTracker
    const calculateStats = (data) => {
      if (!data || data.length === 0) return { mean: null, stdDev: null, stdDevPpm: null };
      
      const stableData = data.filter(p => p.is_stable !== false);
      if (stableData.length < 2) {
        const mean = stableData.length > 0 ? (typeof stableData[0] === "object" ? stableData[0].value : stableData[0]) : null;
        return { mean, stdDev: null, stdDevPpm: null };
      }

      let mean = 0;
      let M2 = 0;
      stableData.forEach((point, index) => {
        const val = typeof point === "object" ? point.value : point;
        const delta = val - mean;
        mean += delta / (index + 1);
        M2 += delta * (val - mean);
      });

      const variance = M2 / (stableData.length - 1);
      const stdDev = Math.sqrt(variance);
      const stdDevPpm = mean === 0 ? 0 : (stdDev / Math.abs(mean)) * 1e6;

      return { mean, stdDev, stdDevPpm };
    };

    READING_TYPES.forEach((rt) => {
      const key = `${prefix}${rt.value}`;
      const readingsArray = calReadings[key] || [];

      if (readingsArray.length > 0) {
        const sheetData = [["Sample #", "Value", "Status", "Timestamp"]];
        
        readingsArray.forEach((point, index) => {
          const p = typeof point === "object" ? point : { value: point, is_stable: true, timestamp: null };
          const ts = p.timestamp ? new Date(p.timestamp * 1000).toLocaleString() : "N/A";
          const status = p.is_stable ? "Stable" : "Unstable";
          sheetData.push([index + 1, p.value, status, ts]);
        });
        
        sheetData.push([]);
        
        // Calculate stats on the fly to perfectly match the frontend UI
        const stats = calculateStats(readingsArray);
        
        sheetData.push(["Average (V):", stats.mean !== null ? stats.mean.toPrecision(8) : "N/A"]);
        sheetData.push(["Standard Deviation (V):", stats.stdDev !== null ? stats.stdDev.toPrecision(8) : "N/A"]);
        sheetData.push(["Standard Deviation (PPM):", stats.stdDevPpm !== null ? stats.stdDevPpm.toFixed(3) : "N/A"]);
        
        const sheet = XLSX.utils.aoa_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(wb, sheet, rt.label);
      }
    });

    if (calResults?.delta_uut_ppm != null) {
      const acdcData = [
        ["AC-DC Difference (ppm):", Number(calResults.delta_uut_ppm).toFixed(8)],
      ];
      const acdcSheet = XLSX.utils.aoa_to_sheet(acdcData);
      XLSX.utils.book_append_sheet(wb, acdcSheet, "AC-DC Difference");
    }

    if (wb.SheetNames.length > 0) {
      triggerBrowserDownload(
        wb,
        `${instrumentName}_Readings_${focusedTP.current}A_${formatFrequency(
          focusedTP.frequency
        )}_${activeDirection}.xlsx`
      );
    } else {
      showNotification(
        "No detailed readings to export for this instrument.",
        "warning"
      );
    }
  };

  const exportSummaryToXLSX = () => {
    if (!uniqueTestPoints || uniqueTestPoints.length === 0) {
      showNotification("No test points available to export.", "warning");
      return;
    }

    const wb = XLSX.utils.book_new();
    
    // Updated headers without Standard Deviation
    const headers = [
      "Current (A)",
      "Frequency (Hz)",
      "Forward AC-DC Diff",
      "Reverse AC-DC Diff",
      "Combined AC-DC Diff",
    ];

    const tiSheetData = [[...headers]];
    const stdSheetData = [[...headers]];

    // --- Fully Corrected Standard Calculation ---
    // Matches the metrology depth of the TI's delta_uut_ppm
    // Calculates the True AC-DC Difference of the applied signal
    const calcFullyCorrectedStandard = (results) => {
      if (!results) return null;
      
      const dcPos = results.std_dc_pos_avg;
      const dcNeg = results.std_dc_neg_avg;
      const acOpen = results.std_ac_open_avg;
      const acClose = results.std_ac_close_avg;
      
      // Ensure we have all voltage readings to proceed
      if (dcPos == null || dcNeg == null || acOpen == null || acClose == null) return null;

      const vDc = (Math.abs(dcPos) + Math.abs(dcNeg)) / 2;
      const vAc = (Math.abs(acOpen) + Math.abs(acClose)) / 2;
      
      const eta = results.eta_std || 1;
      const delta_std_known = results.delta_std_known != null ? Number(results.delta_std_known) : 0;
      const delta_std_tvc = results.delta_std != null ? Number(results.delta_std) : 0;

      // term_STD calculation identical to the CalculationBreakdown
      const term_STD = (((vAc - vDc) * 1000000) / (eta * vDc));

      // Standard True AC-DC Difference = Known Error + Measured Error + TVC Error
      return term_STD + delta_std_known + delta_std_tvc;
    };

    uniqueTestPoints.forEach((pt) => {
      // --- Test Instrument Data ---
      const tiFwdPpm = pt.forward?.results?.delta_uut_ppm;
      const tiRevPpm = pt.reverse?.results?.delta_uut_ppm;
      const tiCombPpm = pt.forward?.results?.delta_uut_ppm_avg;

      tiSheetData.push([
        pt.current,
        formatFrequency(pt.frequency).replace("Hz", ""),
        tiFwdPpm != null ? parseFloat(tiFwdPpm).toFixed(3) : "N/A",
        tiRevPpm != null ? parseFloat(tiRevPpm).toFixed(3) : "N/A",
        tiCombPpm != null ? parseFloat(tiCombPpm).toFixed(3) : "N/A",
      ]);

      // --- Standard Instrument Data ---
      const stdFwdVal = calcFullyCorrectedStandard(pt.forward?.results);
      const stdRevVal = calcFullyCorrectedStandard(pt.reverse?.results);
      
      let stdCombVal = null;
      if (stdFwdVal !== null && stdRevVal !== null) {
          stdCombVal = (stdFwdVal + stdRevVal) / 2;
      }

      stdSheetData.push([
        pt.current,
        formatFrequency(pt.frequency).replace("Hz", ""),
        stdFwdVal !== null ? stdFwdVal.toFixed(3) : "N/A",
        stdRevVal !== null ? stdRevVal.toFixed(3) : "N/A",
        stdCombVal !== null ? stdCombVal.toFixed(3) : "N/A",
      ]);
    });

    const tiWs = XLSX.utils.aoa_to_sheet(tiSheetData);
    const stdWs = XLSX.utils.aoa_to_sheet(stdSheetData);

    XLSX.utils.book_append_sheet(wb, tiWs, "Test Instrument");
    XLSX.utils.book_append_sheet(wb, stdWs, "Standard");

    // --- Dynamic Filename Generation ---
    const now = new Date();
    // Format: YYYY-MM-DD_HH-MM-SS
    const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    
    // Sanitize session name to be safe for filenames
    const safeSessionName = selectedSessionName 
      ? selectedSessionName.replace(/[^a-z0-9]/gi, '_') 
      : 'Session';

    const filename = `${safeSessionName}_${timestamp}.xlsx`;

    triggerBrowserDownload(wb, filename);
  };

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
    const appliedValues = `$$ \\delta_{UUT} \\approx ${
      results.delta_std_known
    } + \\left( \\frac{${V_ACSTD.toPrecision(8)} - ${V_DCSTD.toPrecision(8)}}{${
      results.eta_std
    } \\times ${V_DCSTD.toPrecision(
      8
    )}} \\right) \\times 10^6 - \\left( \\frac{${V_ACUUT.toPrecision(
      8
    )} - ${V_DCUUT.toPrecision(8)}}{${
      results.eta_ti
    } \\times ${V_DCUUT.toPrecision(8)}} \\right) \\times 10^6 + ${
      results.delta_std
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
      <div
        className="calculation-breakdown"
        style={{
          background: "var(--background-color)",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid var(--border-color)",
          marginTop: "20px",
        }}
      >
        <h4 style={{ marginTop: 0 }}>
          Calculation Breakdown for {activeDirection} Direction
        </h4>
        <p>
          <b>1. Full Formula:</b>
        </p>
        <p>{mainFormula}</p>
        <hr />
        <p>
          <b>2. Applied Values:</b>
        </p>
        <p style={{ overflowX: "auto", whiteSpace: "nowrap" }}>
          {appliedValues}
        </p>
        <hr />
        <p>
          <b>3. Intermediate Calculation:</b>
        </p>
        <p>{intermediateBreakdown}</p>
        <hr />
        <p>
          <b>4. Final Result:</b>
        </p>
        <p>{finalResult}</p>
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
            <div className="placeholder-content">
              <h3>Select a Test Point</h3>
              <p>
                Please select a test point from the list to view its results.
              </p>
            </div>
          ) : (
            <>
              <div className="results-main-header">
                <div className="results-header-left">
                  <DirectionDropdown
                    activeDirection={activeDirection}
                    setActiveDirection={setActiveDirection}
                    point={focusedTP}
                  />
                </div>
                
                {/* Updated Header Right with Global Export Button */}
                <div className="results-header-right" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    className="button button-text"
                    onClick={exportSummaryToXLSX}
                    title="Export All AC-DC Diff Data"
                  >
                    <FaDownload style={{ marginRight: "5px" }} />
                  </button>
                  
                  <div className="view-toggle icon-only-toggle">
                    <div className="tooltip-container">
                      <button
                        onClick={() => setActiveTab("summary")}
                        className={activeTab === "summary" ? "active" : ""}
                      >
                        <FaCalculator />
                      </button>
                      <span className="tooltip-text">Summary View</span>
                    </div>
                    <div className="tooltip-container">
                      <button
                        onClick={() => setActiveTab("details")}
                        className={activeTab === "details" ? "active" : ""}
                      >
                        <FaBookOpen />
                      </button>
                      <span className="tooltip-text">Detailed Readings</span>
                    </div>
                  </div>
                </div>
              </div>

              {activeTab === "summary" && (
                <div className="results-summary-container">
                  <div className="summary-header">
                    <div className="summary-header-main">
                      <FinalResultCard
                        title={"AC-DC Difference"}
                        value={calResults?.delta_uut_ppm}
                        formula={
                          activeDirection === "Combined"
                            ? `$$ \\text{Avg} = (\\delta_{Fwd} + \\delta_{Rev}) / 2 $$`
                            : `$$ \\delta_{${
                                activeDirection === "Forward" ? "Fwd" : "Rev"
                              }} $$`
                        }
                      />
                    </div>
                  </div>

                  {activeDirection !== "Combined" && (
                    <div className="summary-action-area">
                      <button
                        className="button button-text"
                        onClick={() => setShowCalcDetails(!showCalcDetails)}
                      >
                        {showCalcDetails
                          ? "Hide Calculation Details"
                          : "Show Calculation Details"}
                      </button>
                    </div>
                  )}

                  {showCalcDetails && activeDirection !== "Combined" && (
                    <CalculationBreakdown results={calResults} />
                  )}

                  <div className="summary-details-accordions">
                    <Accordion title="Standard Instrument Summary">
                      <SummaryTable results={calResults} prefix="std_" />
                    </Accordion>
                    <Accordion title="Test Instrument Summary">
                      <SummaryTable results={calResults} prefix="ti_" />
                    </Accordion>
                  </div>
                </div>
              )}

              {activeTab === "details" && (
                <div className="details-view-container">
                  <div className="details-view-header">
                    <div className="view-toggle" title="Select Instrument">
                      <button
                        className={activeInstrument === "std" ? "active" : ""}
                        onClick={() => setActiveInstrument("std")}
                      >
                        Standard
                      </button>
                      <button
                        className={activeInstrument === "ti" ? "active" : ""}
                        onClick={() => setActiveInstrument("ti")}
                      >
                        Test Instrument
                      </button>
                    </div>
                    <div className="action-group">
                      <div className="view-toggle">
                        <button
                          className={detailsView === "chart" ? "active" : ""}
                          onClick={() => setDetailsView("chart")}
                        >
                          <FaChartBar style={{ marginRight: "6px" }} /> Chart
                        </button>
                        <button
                          className={detailsView === "table" ? "active" : ""}
                          onClick={() => setDetailsView("table")}
                        >
                          <FaTable style={{ marginRight: "6px" }} /> Table
                        </button>
                      </div>

                      {/* Restored Original Single Export Button */}
                      <button
                        className="button button-text"
                        onClick={() => exportReadingsToXLSX(activeInstrument)}
                        title="Export Current Point Raw Data"
                      >
                        <FaDownload style={{ marginRight: "6px" }} />
                      </button>
                    </div>
                  </div>

                  {detailsView === "table" && (
                    <>
                      <div
                        className="form-section"
                        style={{ maxWidth: "300px" }}
                      >
                        <label>Measurement Type:</label>
                        <select
                          value={selectedReadingType}
                          onChange={(e) =>
                            setSelectedReadingType(e.target.value)
                          }
                        >
                          {READING_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <DetailedReadingsTable
                        readingsArray={
                          calReadings
                            ? calReadings[
                                `${activeInstrument}_${selectedReadingType}`
                              ]
                            : []
                        }
                      />
                    </>
                  )}

                  {detailsView === "chart" && (
                    <div
                      className="chart-container"
                      style={{ margin: 0, padding: 0, border: "none" }}
                    >
                      <CalibrationChart
                        title={`${
                          activeInstrument === "std" ? "Standard" : "Test"
                        } Instrument Readings (${activeDirection})`}
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
          )}
        </main>
      )}
    </div>
  );
}

export default CalibrationResults;