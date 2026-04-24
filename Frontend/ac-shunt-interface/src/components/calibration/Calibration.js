// src/components/Calibration/Calibration.js

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import axios from "axios";
import {
  FaCalculator,
  FaCheck,
  FaDownload,
  FaTimes,
  FaSave,
} from "react-icons/fa";
import { LuSaveAll } from "react-icons/lu";
import { useInstruments } from "../../contexts/InstrumentContext";
import { useTheme } from "../../contexts/ThemeContext";
import CalibrationChart from "./CalibrationChart";
import ConfigurationSummaryModal from "./ConfigurationSummaryModal";
import LiveStatisticsTracker from "./LiveStatisticsTracker";
import CalibrationStatusBar from "./CalibrationStatusBar";
import { downloadFullSessionExcel } from "./sessionExcelExport";
import {
  AVAILABLE_FREQUENCIES,
  AVAILABLE_CURRENTS,
  READING_TYPES,
  NPLC_OPTIONS,
  API_BASE_URL,
} from "../../constants/constants";

const CorrectionFactorsModal = ({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  onInputChange,
  isReadOnly = false,
}) => {
  if (!isOpen) return null;

  const isFormValid = Object.values(initialValues).every(
    (val) => val !== "" && !isNaN(parseFloat(val))
  );

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{ maxWidth: "600px", textAlign: "left" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--border-color)",
            paddingBottom: "10px",
            marginBottom: "20px"
          }}
        >
          <h3 style={{ margin: 0 }}>Correction Factor Inputs</h3>
          <button
            onClick={onClose}
            className="modal-close-button"
            style={{ position: "static" }}
            title="Close"
          >
            <FaTimes />
          </button>
        </div>

        <p style={{ marginBottom: "20px" }}>
          Enter known correction factors. These will be applied to all completed
          directions.
        </p>

        <div className="modal-form-grid">
          <div className="form-group">
            <label htmlFor="eta_std">η Standard (Gain Factor)</label>
            <input
              type="number"
              step="any"
              id="eta_std"
              name="eta_std"
              value={initialValues.eta_std}
              onChange={onInputChange}
              disabled={isReadOnly}
              placeholder="e.g., 1.00012"
            />
          </div>
          <div className="form-group">
            <label htmlFor="eta_ti">η Test Instrument (Gain Factor)</label>
            <input
              type="number"
              step="any"
              id="eta_ti"
              name="eta_ti"
              value={initialValues.eta_ti}
              onChange={onInputChange}
              disabled={isReadOnly}
              placeholder="e.g., 0.99987"
            />
          </div>
          <div className="form-group">
            <label htmlFor="delta_std">δ Standard (TVC AC-DC Difference)</label>
            <input
              type="number"
              step="any"
              id="delta_std"
              name="delta_std"
              value={initialValues.delta_std}
              onChange={onInputChange}
              disabled={isReadOnly}
              placeholder="e.g., -1"
            />
          </div>
          <div className="form-group">
            <label htmlFor="delta_ti">
              δ Test Instrument (TVC AC-DC Difference)
            </label>
            <input
              type="number"
              step="any"
              id="delta_ti"
              name="delta_ti"
              value={initialValues.delta_ti}
              onChange={onInputChange}
              disabled={isReadOnly}
              placeholder="e.g., -2"
            />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="delta_std_known">δ Standard (PPM)</label>
            <input
              type="number"
              step="any"
              id="delta_std_known"
              name="delta_std_known"
              value={initialValues.delta_std_known}
              onChange={onInputChange}
              disabled={isReadOnly}
              placeholder="e.g., 5.5"
            />
          </div>
        </div>

        <div className="form-section-action-icons" style={{ marginTop: "20px" }}>
          <button
            type="button"
            onClick={() => onSubmit(initialValues)}
            className="sidebar-action-button"
            disabled={!isFormValid || isReadOnly}
            title={isReadOnly ? "View only (running or remote session)" : "Calculate & Save"}
          >
            <FaSave />
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmationModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  confirmButtonClass = "",
  eyebrow,
}) => {
  if (!isOpen) return null;
  const isDanger = /danger/.test(confirmButtonClass);
  const eyebrowText = eyebrow ?? (isDanger ? "Warning" : "Confirm");
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calibration-confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="confirm-modal-header">
          <div className="confirm-modal-header-text">
            <span className="confirm-modal-eyebrow">{eyebrowText}</span>
            <h3
              id="calibration-confirm-modal-title"
              className="confirm-modal-title"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="cal-results-excel-icon-btn"
            title="Cancel"
            aria-label="Cancel"
          >
            <FaTimes aria-hidden />
          </button>
        </header>
        <div className="confirm-modal-body">
          <p className="confirm-modal-message">{message}</p>
        </div>
        <footer className="confirm-modal-footer confirm-modal-footer--icon">
          <button
            type="button"
            onClick={onConfirm}
            className={`cal-results-excel-icon-btn${isDanger ? " cal-results-excel-icon-btn--danger" : ""
              }`}
            title={confirmText}
            aria-label={confirmText}
          >
            <FaCheck aria-hidden />
          </button>
        </footer>
      </div>
    </div>
  );
};

const SubNav = ({ activeTab, setActiveTab }) => (
  <div className="sub-nav">
    <button
      onClick={() => setActiveTab("settings")}
      className={activeTab === "settings" ? "active" : ""}
    >
      Settings
    </button>
    <button
      onClick={() => setActiveTab("readings")}
      className={activeTab === "readings" ? "active" : ""}
    >
      Readings
    </button>
    <button
      onClick={() => setActiveTab("calculate")}
      className={activeTab === "calculate" ? "active" : ""}
    >
      Calculations
    </button>
  </div>
);

// DirectionToggle component definition removed

// Remembers the last sub-tab the user was viewing in the Calibration pane
// (Settings / Readings / Calculations) so that navigating away to another
// main tab and coming back restores their place. Module scope keeps it
// alive across unmount/remount for the app session without any persistence.
let rememberedCalSubTab = "settings";

function Calibration({
  showNotification,
  orderedTestPoints,
  sharedFocusedTestPoint: focusedTP,
  setSharedFocusedTestPoint: setFocusedTP,
  sharedSelectedTPs: selectedTPs,
  onDataUpdate,
  activeDirection,
  onOpenResultsDirection,
  isRemoteViewer,
}) {
  const {
    selectedSessionId,
    selectedSessionName,
    liveReadings,
    tiLiveReadings,
    initialLiveReadings,
    discoveredInstruments,
    stdInstrumentAddress,
    stdReaderModel,
    stdReaderSN,
    tiInstrumentAddress,
    tiReaderModel,
    tiReaderSN,
    acSourceAddress,
    acSourceSN,
    dcSourceAddress,
    dcSourceSN,
    isCollecting,
    collectionProgress,
    startReadingCollection,
    stopReadingCollection,
    activeCollectionDetails,
    readingWsState,
    collectionStatus,
    switchDriverAddress,
    switchDriverSN,
    clearLiveReadings,
    amplifierAddress,
    lastMessage,
    sendWsCommand,
    stabilizationStatus,
    slidingWindowStatus,
    timerState,
    bulkRunProgress: bulkRunProgressFromContext,
    focusedTPKey,
    dataRefreshTrigger,
    setFailedTPKeys,
    hostSessionKnown,
  } = useInstruments();
  const { theme } = useTheme();

  const [activeTab, setActiveTabState] = useState(rememberedCalSubTab);
  const setActiveTab = useCallback((value) => {
    rememberedCalSubTab = value;
    setActiveTabState(value);
  }, []);
  const [calibrationConfigurations, setCalibrationConfigurations] = useState(
    {}
  );
  const [calibrationSettings, setCalibrationSettings] = useState({
    initial_warm_up_time: 0,
    num_samples: 35,
    settling_time: 120,
    nplc: 20,
    stability_check_method: 'sliding_window',
    stability_window: 30,
    stability_threshold_ppm: 10,
    stability_max_attempts: 10,
    iqr_filter_ppm_threshold: 15,
    ignore_instability_after_lock: false,
    characterize_test_first: false,
    characterization_source: "DC",
  });
  const [correctionInputs, setCorrectionInputs] = useState({
    eta_std: "",
    eta_ti: "",
    delta_std: "",
    delta_ti: "",
    delta_std_known: "",
  });
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  // activeDirection state removed
  const [lastCollectionDirection, setLastCollectionDirection] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { },
  });
  const [amplifierModal, setAmplifierModal] = useState({
    isOpen: false,
    range: null,
    onConfirm: () => { },
  });
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const collectionPromise = useRef(null);
  const lastAutoFocusedKey = useRef(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerInterval = useRef(null);
  const [isCalculatingAverages, setIsCalculatingAverages] = useState(false);
  const prevIsBulkRunning = useRef(isBulkRunning);
  const [activeChartView, setActiveChartView] = useState("calibration");

  const uniqueTestPoints = useMemo(
    () => orderedTestPoints,
    [orderedTestPoints]
  );

  const handleExportSessionExcel = useCallback(async () => {
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
  }, [
    uniqueTestPoints,
    selectedSessionName,
    selectedSessionId,
    showNotification,
  ]);

  const livePpm = useMemo(() => {
    if (!isCollecting || !activeCollectionDetails?.stage) return null;
    const currentReadings = liveReadings[activeCollectionDetails.stage];
    if (!currentReadings || currentReadings.length < 2) return null;

    // 1. Enforce the sliding window
    const windowSize = calibrationSettings.stability_window || 30;
    const values = currentReadings.slice(-windowSize).map((p) => p.y);

    if (values.length < 2) return null;

    // 2. Use Welford's Algorithm for high-precision variance
    let mean = 0;
    let M2 = 0;
    values.forEach((val, index) => {
      const delta = val - mean;
      mean += delta / (index + 1);
      M2 += delta * (val - mean);
    });

    const variance = M2 / (values.length - 1);
    const stdDev = Math.sqrt(variance);
    const ppm = (stdDev / Math.abs(mean)) * 1e6;

    return ppm;
  }, [liveReadings, isCollecting, activeCollectionDetails, calibrationSettings.stability_window]);

  const latestStdReading = useMemo(() => {
    if (!isCollecting || !activeCollectionDetails?.stage) return null;
    const stageReadings = liveReadings[activeCollectionDetails.stage];
    if (!stageReadings || stageReadings.length === 0) return null;
    return stageReadings[stageReadings.length - 1];
  }, [liveReadings, isCollecting, activeCollectionDetails]);

  const latestTiReading = useMemo(() => {
    if (!isCollecting || !activeCollectionDetails?.stage) return null;
    const stageReadings = tiLiveReadings[activeCollectionDetails.stage];
    if (!stageReadings || stageReadings.length === 0) return null;
    return stageReadings[stageReadings.length - 1];
  }, [tiLiveReadings, isCollecting, activeCollectionDetails]);

  useEffect(() => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }

    if (timerState.isActive && timerState.targetTime) {

      // Define the calculation logic
      const updateTimer = () => {
        const now = Date.now();
        const remainingMs = timerState.targetTime - now;
        const remainingSec = Math.ceil(remainingMs / 1000);

        if (remainingSec <= 0) {
          setCountdown(0);
          clearInterval(timerInterval.current);
        } else {
          setCountdown(remainingSec);
        }
      };

      // Run once immediately so we don't see a flash of '0s' or old time
      updateTimer();

      // Start the interval
      timerInterval.current = setInterval(updateTimer, 500); // Check every 500ms for smoother updates
    } else {
      setCountdown(0);
    }

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [timerState.isActive, timerState.targetTime]);

  useEffect(() => {
    if (focusedTPKey && focusedTPKey !== lastAutoFocusedKey.current) {
      const pointToFocus = uniqueTestPoints.find((p) => p.key === focusedTPKey);
      if (pointToFocus) {
        setFocusedTP(pointToFocus);
        lastAutoFocusedKey.current = focusedTPKey;
      }
    }
  }, [focusedTPKey, uniqueTestPoints, setFocusedTP]);

  useEffect(() => {
    if (
      collectionStatus === "collection_finished" ||
      collectionStatus === "collection_stopped"
    ) {
      if (collectionPromise.current) {
        collectionPromise.current.resolve(collectionStatus);
        collectionPromise.current = null;
      }
    } else if (collectionStatus === "error") {
      if (collectionPromise.current) {
        collectionPromise.current.reject(
          new Error("Collection failed with an error.")
        );
        collectionPromise.current = null;
      }
    }
  }, [collectionStatus]);

  // useEffect(() => {
  //   if (lastMessage?.type === "warning") {
  //     showNotification(lastMessage.message, "warning");
  //   }
  // }, [lastMessage, showNotification]);

  const waitForCollection = () => {
    return new Promise((resolve, reject) => {
      collectionPromise.current = { resolve, reject };
    });
  };

  useEffect(() => {
    // Never surface operator-confirmation prompts on a remote viewer — they
    // can't act on them and the backend rejects amplifier_confirmed /
    // operation_cancelled from remote sockets anyway (Phase 3 role gate).
    // The host window is the only surface that should prompt.
    //
    // NOTE: we use a functional updater for the remote-side close so this
    // effect does NOT need ``amplifierModal.isOpen`` in its dep array —
    // including it made the effect re-run every time we opened the modal
    // on the host, which contributed to "Maximum update depth" cascades.
    if (isRemoteViewer) {
      setAmplifierModal((prev) => (prev.isOpen ? { isOpen: false } : prev));
      return;
    }
    if (lastMessage?.type === "awaiting_amplifier_confirmation") {
      const range = lastMessage.range;
      setAmplifierModal({
        isOpen: true,
        range: range,
        onConfirm: () => {
          sendWsCommand({ command: "amplifier_confirmed" });
          setAmplifierModal({ isOpen: false });
        },
        onCancel: () => {
          sendWsCommand({ command: "operation_cancelled" });
          setAmplifierModal({ isOpen: false });
        },
      });
    }
  }, [lastMessage, sendWsCommand, isRemoteViewer]);

  const prevCollectionStatusRef = useRef(collectionStatus);
  useEffect(() => {
    const prevStatus = prevCollectionStatusRef.current;
    const isNewStopEvent =
      collectionStatus === "collection_stopped" &&
      prevStatus !== "collection_stopped";

    if (isNewStopEvent) {
      showNotification("Reading collection stopped by user.", "warning");
    }

    prevCollectionStatusRef.current = collectionStatus;
  }, [collectionStatus, showNotification]);

  useEffect(() => {
    if (!lastMessage) return;

    // Show warnings as UI notifications
    if (lastMessage.type === "warning") {
      showNotification(lastMessage.message, "warning");
    }

    // The flagging logic was moved to InstrumentContext.js!
  }, [lastMessage, showNotification]);

  const getInstrumentIdentityByAddress = (address, serial, model) => {
    if (!address) {
      return "Not Assigned";
    }
    if (model) {
      if (serial) {
        return `${model}, S/N ${serial} (${address})`;
      }
      return `${model} (${address})`;
    }
    const instrument = discoveredInstruments.find(
      (inst) => inst.address === address
    );
    if (instrument) {
      return `${instrument.identity} (${instrument.address})`;
    }
    return address;
  };

  const refreshComponentData = useCallback(async () => {
    if (!selectedSessionId) return;
    try {
      const infoResponse = await axios.get(
        `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`
      );
      setCalibrationConfigurations(infoResponse.data.configurations || {});
    } catch (error) {
      showNotification(
        "Could not refresh calibration configurations.",
        "error"
      );
    }
  }, [selectedSessionId, showNotification]);

  useEffect(() => {
    // The master refresh function
    const handleWakeUp = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        console.log("System wake/focus detected. Refreshing data...");

        // Small delay to allow network stack to stabilize
        setTimeout(() => {
          refreshComponentData();
          if (onDataUpdate) onDataUpdate();
        }, 1000);
      }
    };

    // --- EVENT LISTENERS ---
    document.addEventListener("visibilitychange", handleWakeUp);
    window.addEventListener("focus", handleWakeUp);
    window.addEventListener("pageshow", handleWakeUp); // Handle bfcache
    window.addEventListener("online", handleWakeUp);   // Handle network recovery

    // --- HEARTBEAT CHECK (FAILSAFE) ---
    // Checks for "time jumps" indicating the CPU was suspended
    const HEARTBEAT_INTERVAL = 2000; // Check every 2 seconds
    const SLEEP_THRESHOLD = 5000;    // If >5 seconds passed, we slept
    let lastTick = Date.now();

    const heartbeat = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;

      if (delta > SLEEP_THRESHOLD) {
        console.log(`Sleep detected (Time drift: ${delta}ms). Triggering wake-up...`);
        handleWakeUp();
      }

      lastTick = now;
    }, HEARTBEAT_INTERVAL);

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleWakeUp);
      window.removeEventListener("focus", handleWakeUp);
      window.removeEventListener("pageshow", handleWakeUp);
      window.removeEventListener("online", handleWakeUp);
      clearInterval(heartbeat);
    };
  }, [refreshComponentData, onDataUpdate]);

  useEffect(() => {
    if (dataRefreshTrigger > 0) {
      console.log("WebSocket sync received. Refreshing data...");
      refreshComponentData();
      if (onDataUpdate) {
        onDataUpdate();
      }
    }
  }, [dataRefreshTrigger, refreshComponentData, onDataUpdate]);

  const handleMarkStability = useCallback(async (stabilityData, instrumentType) => {
    if (isRemoteViewer) return;
    if (!focusedTP || !selectedSessionId) {
      showNotification("No focused test point selected.", "error");
      return;
    }

    const pointForDirection = activeDirection === "Forward"
      ? focusedTP.forward
      : focusedTP.reverse;

    if (!pointForDirection || !pointForDirection.id) {
      showNotification("No valid test point created for this direction.", "error");
      return;
    }

    const prefix = instrumentType === "std" ? "std_" : "ti_";
    const readingType = READING_TYPES.find(rt => rt.label === stabilityData.type);

    if (!readingType) {
      showNotification("Invalid reading type selected.", "error");
      return;
    }

    const reading_key = `${prefix}${readingType.key}_readings`;

    const payload = {
      reading_key: reading_key,
      start_index: parseInt(stabilityData.start, 10),
      end_index: parseInt(stabilityData.end, 10),
      is_stable: stabilityData.mark_as === 'stable'
    };

    try {
      await axios.post(
        `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${pointForDirection.id}/mark-readings-stability/`,
        payload
      );
      showNotification(`Readings ${payload.start_index}-${payload.end_index} marked as ${stabilityData.mark_as}. Averages recalculated.`, "success");

      setFailedTPKeys((prev) => {
        const newSet = new Set(prev);
        newSet.delete(focusedTP.key);
        return newSet;
      });

      await onDataUpdate();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Failed to update reading stability.";
      showNotification(errorMsg, "error");
      console.error(error);
    }
  }, [focusedTP, selectedSessionId, activeDirection, onDataUpdate, showNotification, setFailedTPKeys, isRemoteViewer]);

  const parseStabilizationStatus = useCallback(
    (statusString) => {
      if (!statusString) return null;
      // Matches "Stdev: 5.20 PPM [2/50]" format from backend
      const ppmMatch = statusString.match(/Stdev: ([\d.]+|Calculating...) PPM/);
      const countMatch = statusString.match(/\[(\d+)\/(\d+)\]/);

      const ppm = ppmMatch && ppmMatch[1] !== "Calculating..."
        ? parseFloat(ppmMatch[1])
        : null;
      const count = countMatch ? `${countMatch[1]}/${countMatch[2]}` : "";

      return { ppm, count };
    },
    []
  );

  // This call resolves the ESLint warning and provides data to the status bar
  const stabilizationInfo = useMemo(
    () => parseStabilizationStatus(stabilizationStatus),
    [stabilizationStatus, parseStabilizationStatus]
  );

  const hasAllReadings = useCallback((point) => {
    if (!point?.readings) return false;
    return [
      "std_ac_open_readings",
      "std_dc_pos_readings",
      "std_dc_neg_readings",
      "std_ac_close_readings",
      "ti_ac_open_readings",
      "ti_dc_pos_readings",
      "ti_dc_neg_readings",
      "ti_ac_close_readings",
    ].every((k) => point.readings[k]?.length > 0);
  }, []);

  // Check if a point has ANY readings at all
  const hasSomeReadings = useCallback((point) => {
    if (!point?.readings) return false;
    return [
      "std_ac_open_readings",
      "std_dc_pos_readings",
      "std_dc_neg_readings",
      "std_ac_close_readings",
      "ti_ac_open_readings",
      "ti_dc_pos_readings",
      "ti_dc_neg_readings",
      "ti_ac_close_readings",
    ].some((k) => point.readings[k]?.length > 0);
  }, []);

  // Determine if it was started but abandoned
  const isPartial = useCallback((point) => {
    return hasSomeReadings(point) && !hasAllReadings(point);
  }, [hasSomeReadings, hasAllReadings]);

  // Hoist formatters so they can be used in the warning locks
  const formatFrequency = useCallback((value) => {
    return (
      AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
        text: `${value}Hz`,
      }
    ).text;
  }, []);

  const formatCurrent = useCallback((value) => {
    const numValue = parseFloat(value);
    const epsilon = 1e-9;
    const found = AVAILABLE_CURRENTS.find(
      (c) => Math.abs(c.value - numValue) < epsilon
    );
    return found ? found.text : `${numValue}`;
  }, []);

  useEffect(() => {
    prevIsBulkRunning.current = isBulkRunning;
  }, [isBulkRunning]);

  useEffect(() => {
    const wasBulkRunning = prevIsBulkRunning.current;
    if (wasBulkRunning && !isBulkRunning) {
      const processCompletedPoints = async () => {
        console.log(
          "Post-batch processing triggered: searching for points needing average calculation."
        );
        const averagePromises = [];
        uniqueTestPoints.forEach((point) => {
          const checkAndQueueAvgCalc = (directionData) => {
            if (!directionData || !directionData.id) return;
            const readingsAreComplete = hasAllReadings(directionData);
            const averagesAreMissing =
              !directionData.results ||
              directionData.results.std_ac_open_avg === null;
            if (readingsAreComplete && averagesAreMissing) {
              console.log(
                `Queueing average calculation for Test Point ID: ${directionData.id}`
              );
              averagePromises.push(
                axios.post(
                  `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${directionData.id}/calculate-averages/`
                )
              );
            }
          };
          checkAndQueueAvgCalc(point.forward);
          checkAndQueueAvgCalc(point.reverse);
        });
        if (averagePromises.length > 0) {
          showNotification(
            `Found ${averagePromises.length} new reading set(s). Calculating averages...`,
            "info"
          );
          try {
            await Promise.all(averagePromises);
            console.log("All average calculation requests sent successfully.");
            onDataUpdate();
          } catch (error) {
            showNotification(
              "An error occurred during the batch average calculation.",
              "error"
            );
            console.error("Batch average calculation failed:", error);
          }
        } else {
          console.log("No new points required average calculation.");
        }
      };
      setTimeout(processCompletedPoints, 200);
    }
  }, [
    uniqueTestPoints,
    isBulkRunning,
    selectedSessionId,
    hasAllReadings,
    onDataUpdate,
    showNotification,
  ]);

  useEffect(() => {
    if (!focusedTP || !selectedSessionId) return;
    const triggerAverageCalculationIfNeeded = async (pointDirection) => {
      if (!pointDirection || !pointDirection.id) return;
      const readingsAreComplete = hasAllReadings(pointDirection);
      const averagesAreMissing =
        !pointDirection.results ||
        pointDirection.results.std_ac_open_avg === null;
      if (readingsAreComplete && averagesAreMissing && !isCalculatingAverages) {
        try {
          setIsCalculatingAverages(true);
          await axios.post(
            `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${pointDirection.id}/calculate-averages/`
          );
          await onDataUpdate();
        } catch (error) {
          showNotification(
            `Failed to trigger average calculation for ${pointDirection.direction}.`,
            "error"
          );
        } finally {
          setIsCalculatingAverages(false);
        }
      }
    };
    triggerAverageCalculationIfNeeded(focusedTP.forward);
    triggerAverageCalculationIfNeeded(focusedTP.reverse);
  }, [
    focusedTP,
    selectedSessionId,
    hasAllReadings,
    onDataUpdate,
    showNotification,
    isCalculatingAverages
  ]);

  // Pure derivations from focusedTP + active direction. These used to live
  // in React state populated by a post-mount useEffect, which caused a
  // visible flicker when toggling between test points — the first paint
  // rendered stale readings / KPI from the previous focus before the
  // effect reconciled them. useMemo makes the first render after a
  // focusedTP change already correct.
  const { historicalReadings, tiHistoricalReadings } = useMemo(() => {
    const formatReadingsForChart = (readingsArray) => {
      if (!readingsArray) return [];
      return readingsArray.map((point, index) => {
        if (typeof point !== "object" || point === null) {
          return { x: index + 1, y: point, t: null, is_stable: true };
        }
        return {
          ...point,
          x: index + 1,
          y: point.value,
          t: point.timestamp ? new Date(point.timestamp * 1000) : null,
        };
      });
    };

    const currentFocusedTP = focusedTP
      ? orderedTestPoints.find((p) => p.key === focusedTP.key)
      : null;
    const pointForDirection = currentFocusedTP
      ? activeDirection === "Forward"
        ? currentFocusedTP.forward
        : currentFocusedTP.reverse
      : null;

    if (!pointForDirection?.readings) {
      return {
        historicalReadings: initialLiveReadings,
        tiHistoricalReadings: initialLiveReadings,
      };
    }

    const r = pointForDirection.readings;
    return {
      historicalReadings: {
        char_plus1: formatReadingsForChart(r.std_char_plus1_readings),
        char_minus: formatReadingsForChart(r.std_char_minus_readings),
        char_plus2: formatReadingsForChart(r.std_char_plus2_readings),
        ac_open: formatReadingsForChart(r.std_ac_open_readings),
        dc_pos: formatReadingsForChart(r.std_dc_pos_readings),
        dc_neg: formatReadingsForChart(r.std_dc_neg_readings),
        ac_close: formatReadingsForChart(r.std_ac_close_readings),
      },
      tiHistoricalReadings: {
        char_plus1: formatReadingsForChart(r.ti_char_plus1_readings),
        char_minus: formatReadingsForChart(r.ti_char_minus_readings),
        char_plus2: formatReadingsForChart(r.ti_char_plus2_readings),
        ac_open: formatReadingsForChart(r.ti_ac_open_readings),
        dc_pos: formatReadingsForChart(r.ti_dc_pos_readings),
        dc_neg: formatReadingsForChart(r.ti_dc_neg_readings),
        ac_close: formatReadingsForChart(r.ti_ac_close_readings),
      },
    };
  }, [focusedTP, activeDirection, orderedTestPoints, initialLiveReadings]);

  const averagedPpmDifference = useMemo(() => {
    if (!focusedTP) return null;
    const forwardResult = focusedTP.forward?.results?.delta_uut_ppm;
    const reverseResult = focusedTP.reverse?.results?.delta_uut_ppm;
    if (forwardResult == null || reverseResult == null) return null;
    const averagePpm =
      (parseFloat(forwardResult) + parseFloat(reverseResult)) / 2;
    return averagePpm.toFixed(3);
  }, [focusedTP]);

  // Settings are user-editable (sliders, number inputs) so they have to
  // live in state. Use useLayoutEffect for the per-test-point reset so the
  // update lands before the browser paints — avoids the "stale settings
  // flash" when toggling between test points.
  useLayoutEffect(() => {
    const currentFocusedTP = focusedTP
      ? orderedTestPoints.find((p) => p.key === focusedTP.key)
      : null;
    if (!currentFocusedTP) return;

    const isFirstTestPoint =
      orderedTestPoints.length > 0 &&
      currentFocusedTP.key === orderedTestPoints[0].key;

    const defaultSettings = {
      initial_warm_up_time: isFirstTestPoint ? 7200 : 0,
      num_samples: 35,
      settling_time: 120,
      nplc: 20,
      stability_check_method: 'sliding_window',
      stability_window: 30,
      stability_threshold_ppm: 10,
      stability_max_attempts: 10,
      iqr_filter_ppm_threshold: 15,
      ignore_instability_after_lock: false,
    };

    const pointForDirection =
      activeDirection === "Forward"
        ? currentFocusedTP.forward
        : currentFocusedTP.reverse;

    if (pointForDirection?.settings && Object.keys(pointForDirection.settings).length > 0) {
      setCalibrationSettings({ ...defaultSettings, ...pointForDirection.settings });
    } else {
      setCalibrationSettings(defaultSettings);
    }
  }, [focusedTP, activeDirection, orderedTestPoints]);

  const handleCorrectionInputChange = (e) =>
    setCorrectionInputs((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));

  const handleOpenCorrectionModal = () => {
    const primaryPoint = activeDirection === "Forward" ? focusedTP.forward : focusedTP.reverse;
    const existingResults = primaryPoint?.results || {};

    setCorrectionInputs({
      eta_std: existingResults.eta_std || "",
      eta_ti: existingResults.eta_ti || "",
      delta_std: existingResults.delta_std ?? "",
      delta_ti: existingResults.delta_ti ?? "",
      delta_std_known: existingResults.delta_std_known ?? "",
    });

    setIsCorrectionModalOpen(true);
  };

  const validateInstrumentAssignments = useCallback((operationLabel = "start calibration") => {
    const missingRoles = [];

    if (!stdInstrumentAddress) missingRoles.push("Standard Reader");
    if (!tiInstrumentAddress) missingRoles.push("Test Reader");
    if (!acSourceAddress) missingRoles.push("AC Source");
    if (!dcSourceAddress) missingRoles.push("DC Source");

    if (missingRoles.length > 0) {
      showNotification(
        `Cannot ${operationLabel}. Missing instrument assignments: ${missingRoles.join(", ")}. Assign these in Instrument Status first.`,
        "error"
      );
      return false;
    }

    return true;
  }, [
    stdInstrumentAddress,
    tiInstrumentAddress,
    acSourceAddress,
    dcSourceAddress,
    showNotification,
  ]);

  const runMeasurement = useCallback(
    async (
      testPointToRun,
      runType,
      baseReadingKey = null,
      bypassAmplifierConfirmation = false
    ) => {
      if (!testPointToRun) return;
      if (!validateInstrumentAssignments("start collection")) {
        return Promise.reject(new Error("Missing required instrument assignments."));
      }
      const ampRange = calibrationConfigurations.amplifier_range;

      if (amplifierAddress && !ampRange) {
        showNotification(
          "An amplifier is assigned, but its range is not set. Please set it in the Test Point Editor.",
          "error"
        );
        return Promise.reject(new Error("Amplifier range not set."));
      }

      let pointData =
        activeDirection === "Forward"
          ? testPointToRun.forward
          : testPointToRun.reverse;
      if (!pointData) {
        try {
          const response = await axios.post(
            `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`,
            {
              current: testPointToRun.current,
              frequency: testPointToRun.frequency,
              direction: activeDirection,
            }
          );
          pointData = response.data;
          await onDataUpdate();
        } catch (error) {
          showNotification(
            `Error creating ${activeDirection} configuration.`,
            "error"
          );
          return Promise.reject(error);
        }
      }

      clearLiveReadings();

      const runSettings = calibrationSettings;

      let params;
      if (runType === "full") {
        params = {
          command: "start_full_calibration",
          num_samples: parseInt(runSettings.num_samples, 10),
          settling_time: parseFloat(runSettings.settling_time),
        };
      } else {
        params = {
          command: "start_collection",
          reading_type: baseReadingKey,
          num_samples: parseInt(runSettings.num_samples, 10),
          settling_time: parseFloat(runSettings.settling_time),
        };
      }

      Object.assign(params, {
        nplc: parseFloat(runSettings.nplc),
        initial_warm_up_time: parseFloat(runSettings.initial_warm_up_time),
        measurement_params: {
          stability_check_method: runSettings.stability_check_method,
          window: parseInt(runSettings.stability_window, 10),
          threshold_ppm: parseFloat(runSettings.stability_threshold_ppm),
          max_attempts: parseInt(runSettings.stability_max_attempts, 10),
          ppm_threshold: parseFloat(runSettings.iqr_filter_ppm_threshold),
          ignore_instability_after_lock: runSettings.ignore_instability_after_lock || false,
        },
        test_point: {
          current: testPointToRun.current,
          frequency: testPointToRun.frequency,
          direction: activeDirection,
        },
        test_point_id: pointData.id,
        std_reader_model: stdReaderModel,
        ti_reader_model: tiReaderModel,
        amplifier_range: ampRange,
      });

      if (amplifierAddress) {
        params.amplifier_range = ampRange;
      }

      if (bypassAmplifierConfirmation) {
        params.bypass_amplifier_confirmation = true;
      }

      if (startReadingCollection(params)) {
        return waitForCollection();
      } else {
        showNotification(
          "WebSocket is not connected. Please refresh the page.",
          "error"
        );
        return Promise.reject(new Error("WebSocket not connected."));
      }
    },
    [
      activeDirection,
      amplifierAddress,
      calibrationConfigurations.amplifier_range,
      clearLiveReadings,
      onDataUpdate,
      selectedSessionId,
      showNotification,
      startReadingCollection,
      stdReaderModel,
      tiReaderModel,
      calibrationSettings,
      validateInstrumentAssignments,
    ]
  );

  const handleRunSelectedPoints = async () => {
    if (selectedTPs.size === 0) {
      showNotification("No test points selected.", "warning");
      return;
    }
    if (!validateInstrumentAssignments("start batch calibration")) {
      return;
    }
    setFailedTPKeys(new Set());

    const runBatchSequence = async () => {
      setActiveChartView("calibration");
      const selectedOrderedTPs = orderedTestPoints.filter((p) =>
        selectedTPs.has(p.key)
      );
      const pointsToRunData = selectedOrderedTPs.map((p) => {
        const pointForDirection =
          activeDirection === "Forward" ? p.forward : p.reverse;
        return {
          id: pointForDirection?.id,
          current: p.current,
          frequency: p.frequency,
          direction: activeDirection,
        };
      });

      if (pointsToRunData.length === 0) {
        showNotification(
          `No test points were selected for the batch run.`,
          "error"
        );
        return;
      }

      const firstPointInBatch = selectedOrderedTPs[0];

      // Settings must follow the *active* direction. Preferring
      // forward over reverse was wrong: a reverse run would always
      // use the forward test point's saved `initial_warm_up_time` (and
      // the rest) even when the user had set distinct reverse values.
      const dirKey = activeDirection === "Forward" ? "forward" : "reverse";
      const firstPointForDir = firstPointInBatch?.[dirKey];
      const firstPointSettings =
        firstPointForDir?.settings &&
        Object.keys(firstPointForDir.settings).length > 0
          ? firstPointForDir.settings
          : calibrationSettings;

      // Pre-run hook: if the user opted in, characterize the Test TVC first
      // so its η is fresh before the batch/single run uses it downstream.
      if (calibrationSettings.characterize_test_first && firstPointInBatch) {
        showNotification("Characterizing Test TVC first…", "info");
        const charResult = await handleCharacterizationRequest("TI", {
          silent: true,
          testPoint: firstPointInBatch,
        });
        if (
          charResult === "collection_stopped" ||
          charResult === "error"
        ) {
          showNotification(
            "Test TVC characterization did not complete. Batch aborted.",
            "warning"
          );
          return;
        }
        // Swap the chart view back to the main calibration view for the
        // actual run that follows the characterization.
        setActiveChartView("calibration");
      }

      if (firstPointInBatch) {
        setFocusedTP(firstPointInBatch);
      }

      setIsBulkRunning(true);

      const params = {
        command: "start_full_calibration_batch",
        test_points: pointsToRunData,
        direction: activeDirection,
        num_samples: parseInt(firstPointSettings.num_samples, 10),
        settling_time: parseFloat(firstPointSettings.settling_time),
        nplc: parseFloat(firstPointSettings.nplc),
        initial_warm_up_time: parseFloat(
          firstPointSettings.initial_warm_up_time
        ),
        measurement_params: {
          stability_check_method: firstPointSettings.stability_check_method,
          window: parseInt(firstPointSettings.stability_window, 10),
          threshold_ppm: parseFloat(firstPointSettings.stability_threshold_ppm),
          max_attempts: parseInt(firstPointSettings.stability_max_attempts, 10),
          ppm_threshold: parseFloat(firstPointSettings.iqr_filter_ppm_threshold),
          ignore_instability_after_lock: firstPointSettings.ignore_instability_after_lock || false,
        },
        std_reader_model: stdReaderModel,
        ti_reader_model: tiReaderModel,
        amplifier_range: calibrationConfigurations.amplifier_range,
        bypass_amplifier_confirmation: false,
      };

      if (startReadingCollection(params)) {
        waitForCollection()
          .then((result) => {
            if (result === "collection_stopped" || result === "error") {
              showNotification(`Batch sequence stopped.`, "warning");
            } else {
              showNotification("Batch sequence finished.", "success");
            }
          })
          .catch((error) => {
            showNotification(
              `Operation failed: ${error.message || "An unknown error occurred."
              }`,
              "error"
            );
          })
          .finally(() => {
            setIsBulkRunning(false);
            onDataUpdate();
          });
      } else {
        showNotification(
          "WebSocket is not connected. Please refresh the page.",
          "error"
        );
        setIsBulkRunning(false);
      }
    };

    // --- NEW TARGETED LOCK LOGIC ---
    const oppositeDirection = activeDirection === "Forward" ? "reverse" : "forward";
    const partialPoints = [];

    // Check ONLY the selected points for abandoned opposite directions
    orderedTestPoints.filter(p => selectedTPs.has(p.key)).forEach(p => {
      const oppositeData = p[oppositeDirection];
      if (isPartial(oppositeData)) {
        partialPoints.push(`${formatCurrent(p.current)}A @ ${formatFrequency(p.frequency)}`);
      }
    });

    let warningMessage = "";
    if (partialPoints.length > 0) {
      warningMessage = `The following test point(s) have incomplete ${oppositeDirection === "forward" ? "Forward" : "Reverse"} readings:\n\n${partialPoints.map(p => `• ${p}`).join("\n")}\n\nAre you sure you want to bypass the lock and proceed to ${activeDirection}?`;
    }

    // Hardware change check
    const changingHardware = activeDirection !== lastCollectionDirection && lastCollectionDirection !== null;
    if (changingHardware) {
      if (warningMessage) warningMessage += "\n\n";
      warningMessage += `Please ensure you have physically configured the hardware for the '${activeDirection}' direction.`;
    }

    if (warningMessage) {
      setConfirmationModal({
        isOpen: true,
        title: partialPoints.length > 0 ? "Bypass Completion Lock?" : "Confirm Hardware Change",
        message: warningMessage,
        onConfirm: () => {
          setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
          setLastCollectionDirection(activeDirection);
          runBatchSequence();
        },
        onCancel: () => setConfirmationModal((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }

    // No warnings needed, just run
    setLastCollectionDirection(activeDirection);
    runBatchSequence();
  };

  const handleCollectReadingsRequest = useCallback(
    (baseReadingKey) => {
      const run = () => {
        setActiveChartView("calibration");
        setFailedTPKeys(new Set());
        setLastCollectionDirection(activeDirection);
        runMeasurement(focusedTP, "single", baseReadingKey)
          .then((result) => {
            const message = `${baseReadingKey.replace(/_/g, " ")} readings`;
            if (result === "collection_stopped") {
              showNotification("Sequence stopped by user.", "warning");
            } else if (result === "collection_finished") {
              showNotification(`${message} complete!`, "success");
            }
          })
          .catch((error) => {
            showNotification(
              `Operation failed: ${error.message || "An unknown error occurred."
              }`,
              "error"
            );
            console.error("Measurement run error:", error);
          })
          .finally(() => {
            onDataUpdate();
          });
      };

      // --- NEW TARGETED LOCK LOGIC ---
      const oppositeDirection = activeDirection === "Forward" ? "reverse" : "forward";
      const oppositeData = focusedTP?.[oppositeDirection];

      let warningMessage = "";
      if (isPartial(oppositeData)) {
        warningMessage = `The test point ${formatCurrent(focusedTP?.current)}A @ ${formatFrequency(focusedTP?.frequency)} has incomplete ${oppositeDirection === "forward" ? "Forward" : "Reverse"} readings.\n\nAre you sure you want to bypass the lock and proceed to ${activeDirection}?`;
      }

      const changingHardware = activeDirection !== lastCollectionDirection && lastCollectionDirection !== null;
      if (changingHardware) {
        if (warningMessage) warningMessage += "\n\n";
        warningMessage += `Please ensure you have physically configured the hardware for the '${activeDirection}' direction.`;
      }

      if (warningMessage) {
        setConfirmationModal({
          isOpen: true,
          title: isPartial(oppositeData) ? "Bypass Completion Lock?" : "Confirm Hardware Change",
          message: warningMessage,
          onConfirm: () => {
            setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
            run();
          },
          onCancel: () => setConfirmationModal((prev) => ({ ...prev, isOpen: false })),
        });
      } else {
        run();
      }
    },
    [
      activeDirection,
      lastCollectionDirection,
      focusedTP,
      runMeasurement,
      showNotification,
      onDataUpdate,
      setFailedTPKeys,
      isPartial,
      formatCurrent,
      formatFrequency
    ]
  );

  const handleCharacterizationRequest = useCallback(async (
    target_tvc = "BOTH",
    { silent = false, testPoint: overrideTP = null } = {}
  ) => {
    if (!validateInstrumentAssignments("start TVC characterization")) {
      return "error";
    }

    const tp = overrideTP || focusedTP;
    if (!tp) return "error";
    setActiveChartView("characterization");

    // 1. Initialize the point in the DB if it hasn't been run before
    let pointData = activeDirection === "Forward" ? tp.forward : tp.reverse;
    if (!pointData) {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`,
          {
            current: tp.current,
            frequency: tp.frequency,
            direction: activeDirection,
          }
        );
        pointData = response.data;
        await onDataUpdate();
      } catch (error) {
        showNotification(`Error creating ${activeDirection} configuration.`, "error");
        return "error";
      }
    }

    clearLiveReadings();

    // 2. Package the parameters
    const params = {
      command: "tvc_characterization",
      target_tvc: target_tvc, // <-- Pass the target to the backend
      // AC or DC selects the source used for the ppm-shift sensitivity (η)
      // measurement. DC is the default and is more stable; AC is available
      // for legacy/per-frequency characterization when a user explicitly
      // opts in from the Characterization section of Settings.
      characterization_source:
        calibrationSettings.characterization_source === "AC" ? "AC" : "DC",
      test_point: {
        id: pointData.id,
        current: tp.current,
        frequency: tp.frequency,
        direction: activeDirection,
      },
      test_point_id: pointData.id,
      num_samples: parseInt(calibrationSettings.num_samples, 10),
      settling_time: parseFloat(calibrationSettings.settling_time),
      initial_warm_up_time: parseFloat(calibrationSettings.initial_warm_up_time),
      amplifier_range: calibrationConfigurations.amplifier_range,
      nplc: parseFloat(calibrationSettings.nplc),
      measurement_params: {
        stability_check_method: calibrationSettings.stability_check_method,
        window: parseInt(calibrationSettings.stability_window, 10),
        threshold_ppm: parseFloat(calibrationSettings.stability_threshold_ppm),
        max_attempts: parseInt(calibrationSettings.stability_max_attempts, 10),
        ppm_threshold: parseFloat(calibrationSettings.iqr_filter_ppm_threshold),
        ignore_instability_after_lock: calibrationSettings.ignore_instability_after_lock || false,
      },
      std_reader_model: stdReaderModel,
      ti_reader_model: tiReaderModel,
    };

    // 3. Trigger the standard collection flow so the UI activates
    if (!startReadingCollection(params)) {
      showNotification("WebSocket not connected.", "error");
      return "error";
    }

    try {
      const result = await waitForCollection();
      if (result === "collection_stopped" || result === "error") {
        if (!silent) showNotification("Characterization stopped or failed.", "warning");
      } else {
        if (!silent) showNotification("Characterization complete!", "success");
      }
      return result;
    } catch (err) {
      if (!silent) showNotification(`Operation failed: ${err.message}`, "error");
      return "error";
    } finally {
      onDataUpdate();
    }
  }, [
    focusedTP,
    activeDirection,
    calibrationSettings,
    calibrationConfigurations.amplifier_range,
    startReadingCollection,
    showNotification,
    onDataUpdate,
    clearLiveReadings,
    selectedSessionId,
    stdReaderModel,
    tiReaderModel,
    validateInstrumentAssignments
  ]);

  const handleRunSingleStageOnSelected = useCallback(
    async (readingKey) => {
      if (selectedTPs.size === 0) {
        showNotification("No test points selected for batch run.", "warning");
        return;
      }
      if (!validateInstrumentAssignments("start batch stage collection")) {
        return;
      }

      const runBatchStageSequence = async () => {
        setActiveChartView("calibration");
        setFailedTPKeys(new Set());

        const pointsToRunData = orderedTestPoints
          .filter((p) => selectedTPs.has(p.key))
          .map((p) => {
            const pointForDirection =
              activeDirection === "Forward" ? p.forward : p.reverse;
            return {
              id: pointForDirection?.id,
              current: p.current,
              frequency: p.frequency,
              direction: activeDirection,
            };
          });

        if (pointsToRunData.length === 0) {
          showNotification(
            `No valid test points could be prepared for the ${activeDirection} direction.`,
            "error"
          );
          return;
        }

        setIsBulkRunning(true);

        const firstPointToRun = uniqueTestPoints.find(
          (p) => p.key === pointsToRunData[0].key
        );
        if (firstPointToRun) {
          setFocusedTP(firstPointToRun);
        }

        const stageDirKey = activeDirection === "Forward" ? "forward" : "reverse";
        const firstForActiveDir = firstPointToRun?.[stageDirKey];
        const firstPointSettings =
          firstForActiveDir?.settings &&
          Object.keys(firstForActiveDir.settings).length > 0
            ? firstForActiveDir.settings
            : calibrationSettings;

        const params = {
          command: "start_single_stage_batch",
          reading_type: readingKey,
          test_points: pointsToRunData,
          direction: activeDirection,
          initial_warm_up_time:
            parseFloat(firstPointSettings.initial_warm_up_time) || 0,
          num_samples: parseInt(firstPointSettings.num_samples, 10),
          settling_time: parseFloat(firstPointSettings.settling_time),
          nplc: parseFloat(firstPointSettings.nplc),
          measurement_params: {
            stability_check_method: firstPointSettings.stability_check_method,
            window: parseInt(firstPointSettings.stability_window, 10),
            threshold_ppm: parseFloat(firstPointSettings.stability_threshold_ppm),
            max_attempts: parseInt(firstPointSettings.stability_max_attempts, 10),
            ppm_threshold: parseFloat(firstPointSettings.iqr_filter_ppm_threshold),
            ignore_instability_after_lock: firstPointSettings.ignore_instability_after_lock || false,
          },
          std_reader_model: stdReaderModel,
          ti_reader_model: tiReaderModel,
          amplifier_range: calibrationConfigurations.amplifier_range,
        };

        if (startReadingCollection(params)) {
          try {
            const result = await waitForCollection();
            if (result === "collection_stopped" || result === "error") {
              showNotification(`Batch sequence stopped.`, "warning");
            } else {
              showNotification("Batch sequence finished.", "success");
            }
          } catch (error) {
            showNotification(
              `Operation failed: ${error.message || "An unknown error occurred."
              }`,
              "error"
            );
          } finally {
            setIsBulkRunning(false);
            onDataUpdate();
          }
        } else {
          showNotification(
            "WebSocket is not connected. Please refresh the page.",
            "error"
          );
          setIsBulkRunning(false);
        }
      };

      // --- NEW TARGETED LOCK LOGIC ---
      const oppositeDirection = activeDirection === "Forward" ? "reverse" : "forward";
      const partialPoints = [];

      orderedTestPoints.filter(p => selectedTPs.has(p.key)).forEach(p => {
        const oppositeData = p[oppositeDirection];
        if (isPartial(oppositeData)) {
          partialPoints.push(`${formatCurrent(p.current)}A @ ${formatFrequency(p.frequency)}`);
        }
      });

      let warningMessage = "";
      if (partialPoints.length > 0) {
        warningMessage = `The following test point(s) have incomplete ${oppositeDirection === "forward" ? "Forward" : "Reverse"} readings:\n\n${partialPoints.map(p => `• ${p}`).join("\n")}\n\nAre you sure you want to bypass the lock and proceed to ${activeDirection}?`;
      }

      const changingHardware = activeDirection !== lastCollectionDirection && lastCollectionDirection !== null;
      if (changingHardware) {
        if (warningMessage) warningMessage += "\n\n";
        warningMessage += `Please ensure you have physically configured the hardware for the '${activeDirection}' direction.`;
      }

      if (warningMessage) {
        setConfirmationModal({
          isOpen: true,
          title: partialPoints.length > 0 ? "Bypass Completion Lock?" : "Confirm Hardware Change",
          message: warningMessage,
          onConfirm: () => {
            setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
            setLastCollectionDirection(activeDirection);
            runBatchStageSequence();
          },
          onCancel: () => setConfirmationModal((prev) => ({ ...prev, isOpen: false })),
        });
      } else {
        setLastCollectionDirection(activeDirection);
        runBatchStageSequence();
      }
    },
    [
      selectedTPs,
      orderedTestPoints,
      activeDirection,
      lastCollectionDirection,
      calibrationSettings,
      stdReaderModel,
      tiReaderModel,
      calibrationConfigurations.amplifier_range,
      startReadingCollection,
      showNotification,
      onDataUpdate,
      uniqueTestPoints,
      setFocusedTP,
      setFailedTPKeys,
      isPartial,
      formatCurrent,
      formatFrequency,
      validateInstrumentAssignments
    ]
  );

  const buildChartData = (readings) => {
    // Determine which keys to show based on the active view
    const activeKeys = activeChartView === "characterization"
      ? ["char_plus1", "char_minus", "char_plus2"]
      : ["ac_open", "dc_pos", "dc_neg", "ac_close"];

    // Filter READING_TYPES so the legend and datasets only show active keys
    const filteredTypes = READING_TYPES.filter(type => activeKeys.includes(type.key));

    return {
      labels: [
        ...new Set(
          Object.values(readings).flatMap((arr) =>
            arr ? arr.map((point) => point.x) : []
          )
        ),
      ].sort((a, b) => a - b),
      datasets: filteredTypes.map((type) => {
        return {
          label: type.label,
          data: readings[type.key] || [],
          borderColor: type.color,
          backgroundColor: type.color,
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 3,
          pointHoverRadius: 5,
        };
      }),
    };
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    if (isRemoteViewer) return;
    if (!focusedTP || !selectedSessionId) {
      return showNotification("No test point selected.", "error");
    }

    const newSettings = {
      initial_warm_up_time:
        parseFloat(calibrationSettings.initial_warm_up_time) || 0,
      num_samples: parseInt(calibrationSettings.num_samples, 10) || 8,
      settling_time: parseFloat(calibrationSettings.settling_time) || 5,
      nplc: parseFloat(calibrationSettings.nplc) || 20,
      stability_check_method: calibrationSettings.stability_check_method,
      stability_window: parseInt(calibrationSettings.stability_window, 10) || 5,
      stability_threshold_ppm:
        parseFloat(calibrationSettings.stability_threshold_ppm) || 10,
      stability_max_attempts:
        parseInt(calibrationSettings.stability_max_attempts, 10) || 50,
      iqr_filter_ppm_threshold: parseFloat(calibrationSettings.iqr_filter_ppm_threshold) || 15,
      ignore_instability_after_lock: calibrationSettings.ignore_instability_after_lock || false,
      characterize_test_first: calibrationSettings.characterize_test_first || false,
      characterization_source:
        calibrationSettings.characterization_source === "AC" ? "AC" : "DC",
    };

    let pointToUpdate =
      activeDirection === "Forward" ? focusedTP.forward : focusedTP.reverse;
    const directionName = activeDirection;

    try {
      if (!pointToUpdate) {
        pointToUpdate = (
          await axios.post(
            `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`,
            {
              current: focusedTP.current,
              frequency: focusedTP.frequency,
              direction: directionName,
            }
          )
        ).data;
      }

      await axios.patch(
        `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${pointToUpdate.id}/`,
        { settings: newSettings }
      );

      showNotification(
        `Settings saved for the ${directionName} direction!`,
        "success"
      );
      onDataUpdate();
    } catch (error) {
      showNotification("Error saving settings.", "error");
    }
  };

  const handleApplySettingsToAll = () => {
    if (isRemoteViewer) return;
    const confirmAction = async () => {
      if (!focusedTP || !selectedSessionId) {
        showNotification(
          "No focused test point to get settings from.",
          "warning"
        );
        return;
      }

      const fullSettingsPayload = {
        initial_warm_up_time:
          parseFloat(calibrationSettings.initial_warm_up_time) || 0,
        num_samples: parseInt(calibrationSettings.num_samples, 10) || 8,
        settling_time: parseFloat(calibrationSettings.settling_time) || 5,
        nplc: parseFloat(calibrationSettings.nplc) || 20,
        stability_check_method: calibrationSettings.stability_check_method,
        stability_window:
          parseInt(calibrationSettings.stability_window, 10) || 5,
        stability_threshold_ppm:
          parseFloat(calibrationSettings.stability_threshold_ppm) || 10,
        stability_max_attempts:
          parseInt(calibrationSettings.stability_max_attempts, 10) || 50,
        iqr_filter_ppm_threshold: parseFloat(calibrationSettings.iqr_filter_ppm_threshold) || 15,
        ignore_instability_after_lock: calibrationSettings.ignore_instability_after_lock || false,
        characterize_test_first: calibrationSettings.characterize_test_first || false,
        characterization_source:
          calibrationSettings.characterization_source === "AC" ? "AC" : "DC",
      };

      try {
        let { forward, reverse } = focusedTP;
        if (!forward) {
          forward = (
            await axios.post(
              `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`,
              {
                current: focusedTP.current,
                frequency: focusedTP.frequency,
                direction: "Forward",
              }
            )
          ).data;
        }
        if (!reverse) {
          reverse = (
            await axios.post(
              `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`,
              {
                current: focusedTP.current,
                frequency: focusedTP.frequency,
                direction: "Reverse",
              }
            )
          ).data;
        }

        const sourcePointId =
          activeDirection === "Forward" ? forward.id : reverse.id;

        await axios.post(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/actions/apply-settings-to-all/`,
          {
            settings: fullSettingsPayload,
            focused_test_point_id: sourcePointId,
          }
        );

        showNotification(
          "Settings applied to all test points successfully!",
          "success"
        );
        onDataUpdate();
      } catch (error) {
        showNotification("An error occurred while applying settings.", "error");
      } finally {
        setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
      }
    };

    setConfirmationModal({
      isOpen: true,
      title: "Apply Settings to All?",
      message:
        "This will apply the common settings (Samples, Settling Time, etc.) to ALL test points.\n\nThe 'Initial Warm-up Wait' will only be saved for this specific point and will not affect others.",
      onConfirm: confirmAction,
      onCancel: () =>
        setConfirmationModal((prev) => ({ ...prev, isOpen: false })),
    });
  };

  const pointForDirection = focusedTP
    ? activeDirection === "Forward"
      ? focusedTP.forward
      : focusedTP.reverse
    : null;

  const isCurrentTPActive =
    isCollecting &&
    String(activeCollectionDetails?.tpId) === String(pointForDirection?.id);

  const activeStageKey = isCurrentTPActive 
    ? (activeCollectionDetails?.stage || activeCollectionDetails?.readingKey) 
    : null;

  const mergeDataSource = (historical, live, activeStage) => {
    const merged = { ...historical };
    Object.keys(live).forEach((key) => {
      if (activeStage && key === activeStage) {
        // Always use live data for the active stage (even if empty, to clear the chart for the new run)
        merged[key] = live[key];
      } else if (live[key] && live[key].length > 0) {
        // For inactive stages, only overwrite historical if live actually has data
        merged[key] = live[key];
      }
    });
    return merged;
  };

  const stdChartDataSource = isCurrentTPActive
    ? mergeDataSource(historicalReadings, liveReadings, activeStageKey)
    : historicalReadings;
    
  const tiChartDataSource = isCurrentTPActive
    ? mergeDataSource(tiHistoricalReadings, tiLiveReadings, activeStageKey)
    : tiHistoricalReadings;

  const stdChartData = buildChartData(stdChartDataSource);
  const tiChartData = buildChartData(tiChartDataSource);
  const showStdChart =
    isCurrentTPActive ||
    Object.values(historicalReadings).some((arr) => arr && arr.length > 0);
  const showTiChart =
    isCurrentTPActive ||
    Object.values(tiHistoricalReadings).some((arr) => arr && arr.length > 0);

  const getStageName = () => {
    const stageKey =
      activeCollectionDetails?.stage || activeCollectionDetails?.readingKey;
    if (!stageKey) return "Initializing...";
    const readingType = READING_TYPES.find((rt) => rt.key === stageKey);
    return readingType ? readingType.label : stageKey.replace(/_/g, " ");
  };

  const isCalculationReady =
    focusedTP &&
    (hasAllReadings(focusedTP.forward) || hasAllReadings(focusedTP.reverse));
  const isNplcInstrumentInUse =
    stdReaderModel === "34420A" ||
    tiReaderModel === "34420A" ||
    stdReaderModel === "3458A" ||
    tiReaderModel === "3458A";

  const dropdownOptions = useMemo(() => {
    // Characterization is a single-point operation regardless of how many
    // test points the user has checkboxed in the sidebar: per the
    // "Option A" design, one characterization runs on the focused point
    // and the resulting η is reused for the whole batch that follows.
    // So these options always appear, independent of selection count.
    const charOptions = [
      {
        key: "tvc_char_both",
        label: "Characterize Both TVCs (η)",
        onClick: () => handleCharacterizationRequest("BOTH"),
      },
      {
        key: "tvc_char_std",
        label: "Characterize STD TVC (η)",
        onClick: () => handleCharacterizationRequest("STD"),
      },
      {
        key: "tvc_char_ti",
        label: "Characterize TI TVC (η)",
        onClick: () => handleCharacterizationRequest("TI"),
      },
    ];

    // Filter out internal characterization stages from the individual "Take" options
    const visibleReadingTypes = READING_TYPES.filter(
      (type) => !type.key.startsWith("char_")
    );

    const takeOptions =
      selectedTPs.size > 1
        ? visibleReadingTypes.map(({ key, label }) => ({
            key: key,
            label: `Take ${label} on ${selectedTPs.size} Points`,
            onClick: () => handleRunSingleStageOnSelected(key),
          }))
        : visibleReadingTypes.map(({ key, label }) => ({
            key: key,
            label: `Take ${label} Readings`,
            onClick: () => handleCollectReadingsRequest(key),
          }));

    return [...charOptions, ...takeOptions];
  }, [
    selectedTPs.size,
    handleCollectReadingsRequest,
    handleRunSingleStageOnSelected,
    handleCharacterizationRequest,
  ]);

  const displayPpm = slidingWindowStatus?.ppm ?? livePpm;

  // Derive the count directly from the live chart data
  const currentLiveReadingCount = isCollecting && activeCollectionDetails?.stage
    ? (liveReadings[activeCollectionDetails.stage]?.length || 0)
    : 0;

  const activeWindowCount = Math.min(
    currentLiveReadingCount,
    calibrationSettings.stability_window
  );

  // Cleanly capture retry metrics from context state
  const instabilityCount = slidingWindowStatus?.instability_events || 0;
  const maxRetries = slidingWindowStatus?.max_retries || calibrationSettings.stability_max_attempts;

  // Determine the exact phase of the sliding window for intuitive UI feedback
  let windowPhaseText = "";
  if (collectionProgress.count > 0) {
    // Phase 3: Initial stability achieved, now locking in the required samples
    windowPhaseText = `Monitoring (Last ${activeWindowCount})`;
  } else if (instabilityCount > 0) {
    // Phase 2: Window is full but unstable. Currently sliding and testing new points.
    windowPhaseText = `Searching (Sliding ${calibrationSettings.stability_window})`;
  } else {
    // Phase 1: Gathering the very first batch of points for the window
    windowPhaseText = `Filling (${activeWindowCount}/${calibrationSettings.stability_window})`;
  }

  const isStableNow = useMemo(() => {
    if (slidingWindowStatus) {
      return slidingWindowStatus.is_stable;
    }
    if (livePpm !== null) {
      return livePpm < calibrationSettings.stability_threshold_ppm;
    }
    return true;
  }, [
    slidingWindowStatus,
    livePpm,
    calibrationSettings.stability_threshold_ppm,
  ]);

  const activeRunningTP = useMemo(() => {
    if ((isCollecting || isBulkRunning) && activeCollectionDetails?.tpId) {
      return orderedTestPoints.find(p =>
        String(p.forward?.id) === String(activeCollectionDetails.tpId) ||
        String(p.reverse?.id) === String(activeCollectionDetails.tpId)
      ) || focusedTP;
    }
    return focusedTP;
  }, [isCollecting, isBulkRunning, activeCollectionDetails, orderedTestPoints, focusedTP]);

  const handleSaveCorrections = async (currentCorrectionInputs) => {
    if (isRemoteViewer) {
      return;
    }
    if (isCollecting || isBulkRunning) {
      showNotification(
        "Corrections are view-only while calibration is running.",
        "info"
      );
      return;
    }

    try {
      const pointToUpdate = activeDirection === "Forward" ? focusedTP.forward : focusedTP.reverse;

      if (!pointToUpdate || !pointToUpdate.id) return;

      // Push the user's manual overrides to the backend
      await axios.put(
        `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${pointToUpdate.id}/update-results/`,
        currentCorrectionInputs
      );

      showNotification(`Corrections updated and recalculated!`, "success");
      onDataUpdate(); // Refreshes the UI to show the newly calculated delta_uut_ppm
      setIsCorrectionModalOpen(false);
    } catch (error) {
      showNotification("Error saving corrections.", "error");
    }
  };

  return (
    <>
      <ConfigurationSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        configurations={calibrationConfigurations}
        uniqueTestPoints={uniqueTestPoints}
        getInstrumentIdentity={getInstrumentIdentityByAddress}
        stdInstrumentAddress={stdInstrumentAddress}
        stdReaderModel={stdReaderModel}
        stdReaderSN={stdReaderSN}
        tiInstrumentAddress={tiInstrumentAddress}
        tiReaderModel={tiReaderModel}
        tiReaderSN={tiReaderSN}
        acSourceAddress={acSourceAddress}
        acSourceSN={acSourceSN}
        dcSourceAddress={dcSourceAddress}
        dcSourceSN={dcSourceSN}
        switchDriverAddress={switchDriverAddress}
        switchDriverSN={switchDriverSN}
      />
      <CorrectionFactorsModal
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
        onSubmit={handleSaveCorrections}
        initialValues={correctionInputs}
        onInputChange={handleCorrectionInputChange}
        isReadOnly={isCollecting || isBulkRunning || isRemoteViewer}
      />
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.title}
        message={confirmationModal.message}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal({ isOpen: false })}
        confirmText="Ready"
      />
      <ConfirmationModal
        isOpen={amplifierModal.isOpen}
        eyebrow="Amplifier"
        title="Verify 8100 range"
        message={`Set the 8100 range to ${amplifierModal.range} A before continuing. An incorrect range can damage equipment.\n\nConfirm 5730A calibrator outputs, place the 8100 in operate, then use the check control. Cancel with the close control in the header or by clicking outside this dialog.`}
        onConfirm={amplifierModal.onConfirm}
        onCancel={amplifierModal.onCancel}
        confirmText="Proceed — range verified"
      />

      {!selectedSessionId ? (
        <div className="content-area form-section-warning">
          {isRemoteViewer ? (
            // Three distinct states for a remote viewer with no session:
            //   1. host-sync WS still in flight → "Connecting…" (transient)
            //   2. host-sync confirmed no session → explicit "host is idle"
            //   3. Fallback copy (should rarely be hit)
            // Keeping these separate prevents the old bug where a reconnect
            // briefly flashed "no test points" while the session_changed
            // message was still on the wire.
            !hostSessionKnown ? (
              <p>Connecting to host — waiting for the current session…</p>
            ) : (
              <p>
                The host isn't in a calibration session right now. This view
                will refresh automatically when they open one.
              </p>
            )
          ) : (
            <p>Please select a session to run a calibration.</p>
          )}
        </div>
      ) : uniqueTestPoints && uniqueTestPoints.length === 0 ? (
        <div className="content-area form-section-warning">
          <p>
            {isRemoteViewer
              ? "This session doesn't have any test points yet. The view will update as soon as the host adds them."
              : 'This session has no test points. Please go to the "Test Point Editor" to generate them.'}
          </p>
        </div>
      ) : (
        <>
          {/* --- STANDALONE STATUS BAR --- */}
          <div style={{ marginBottom: "20px" }}>
            <CalibrationStatusBar
              activeRunningTP={activeRunningTP}
              focusedTP={focusedTP}
              formatCurrent={formatCurrent}
              formatFrequency={formatFrequency}
              isCollecting={isCollecting}
              isBulkRunning={isBulkRunning}
              bulkRunProgress={bulkRunProgressFromContext}
              timerState={timerState}
              countdown={countdown}
              stabilizationStatus={stabilizationStatus}
              stabilizationInfo={stabilizationInfo}
              collectionProgress={collectionProgress}
              getStageName={getStageName}
              latestStdReading={latestStdReading}
              latestTiReading={latestTiReading}
              calibrationSettings={calibrationSettings}
              displayPpm={displayPpm}
              isStableNow={isStableNow}
              windowPhaseText={windowPhaseText}
              instabilityCount={instabilityCount}
              maxRetries={maxRetries}
              stopReadingCollection={stopReadingCollection}
              handleRunSelectedPoints={handleRunSelectedPoints}
              readingWsState={readingWsState}
              selectedTPs={selectedTPs}
              dropdownOptions={dropdownOptions}
              isRemoteViewer={isRemoteViewer}
            />
          </div>

          <div className="content-area">
            <div className="calibration-workflow-container">
              <div className="test-point-content">
                {!focusedTP ? (
                  <div className="placeholder-content">
                    <h3>Select a Test Point</h3>
                    <p>
                      Please select a test point from the list on the left to
                      begin.
                    </p>
                  </div>
                ) : (
                  <>
                    <SubNav activeTab={activeTab} setActiveTab={setActiveTab} />

                    <div className="sub-tab-content">
                      {activeTab === "settings" && (
                        <form
                          onSubmit={handleSettingsSubmit}
                          className="settings-form"
                        >
                          {isRemoteViewer && (
                            <p className="bug-report-browse-intro" style={{ marginTop: 0, marginBottom: "1rem" }}>
                              Viewing the host&apos;s settings — read only.
                            </p>
                          )}
                          <div className="settings-form-group">
                            <span className="settings-form-group-eyebrow">
                              General
                            </span>
                            <div className="form-section-group">
                              <div className="form-section">
                                <label htmlFor="initial_warm_up_time">
                                  Initial warm-up wait (sec)
                                </label>
                                <input
                                  type="number"
                                  id="initial_warm_up_time"
                                  name="initial_warm_up_time"
                                  value={
                                    calibrationSettings.initial_warm_up_time || 0
                                  }
                                  onChange={(e) =>
                                    setCalibrationSettings((prev) => ({
                                      ...prev,
                                      initial_warm_up_time: e.target.value,
                                    }))
                                  }
                                  disabled={isRemoteViewer}
                                />
                              </div>
                              <div className="form-section">
                                <label htmlFor="num_samples"># of samples</label>
                                <input
                                  type="number"
                                  id="num_samples"
                                  name="num_samples"
                                  required
                                  min="2"
                                  value={calibrationSettings.num_samples || ""}
                                  onChange={(e) => {
                                    const newSamples = parseInt(e.target.value, 10) || 0;
                                    setCalibrationSettings((prev) => ({
                                      ...prev,
                                      num_samples: e.target.value,
                                      stability_window: prev.stability_window > newSamples && newSamples > 0
                                        ? newSamples
                                        : prev.stability_window,
                                    }));
                                  }}
                                  disabled={isRemoteViewer}
                                />
                              </div>
                              <div className="form-section">
                                <label htmlFor="settling_time">
                                  Settling time (sec)
                                </label>
                                <input
                                  type="number"
                                  id="settling_time"
                                  name="settling_time"
                                  required
                                  value={calibrationSettings.settling_time || 5}
                                  onChange={(e) =>
                                    setCalibrationSettings((prev) => ({
                                      ...prev,
                                      settling_time: e.target.value,
                                    }))
                                  }
                                  disabled={isRemoteViewer}
                                />
                              </div>
                              {isNplcInstrumentInUse && (
                                <div className="form-section">
                                  <label htmlFor="nplc">
                                    Reader integration (NPLC)
                                  </label>
                                  <select
                                    id="nplc"
                                    name="nplc"
                                    value={calibrationSettings.nplc || 20}
                                    onChange={(e) =>
                                      setCalibrationSettings((prev) => ({
                                        ...prev,
                                        nplc: parseFloat(e.target.value),
                                      }))
                                    }
                                    disabled={isRemoteViewer}
                                  >
                                    {NPLC_OPTIONS.map((val) => (
                                      <option key={val} value={val}>
                                        {val} PLC
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="settings-form-group">
                            <span className="settings-form-group-eyebrow">
                              Stability
                            </span>
                            <div className="form-section-group">
                              <div className="form-section">
                                <label htmlFor="stability_check_method">
                                  Check method
                                </label>
                                <select
                                  id="stability_check_method"
                                  name="stability_check_method"
                                  value={calibrationSettings.stability_check_method}
                                  onChange={(e) =>
                                    setCalibrationSettings((prev) => ({
                                      ...prev,
                                      stability_check_method: e.target.value,
                                    }))
                                  }
                                  disabled={isRemoteViewer}
                                >
                                  <option value="sliding_window">
                                    Sliding window
                                  </option>
                                  <option value="iqr_filter">IQR filter</option>
                                </select>
                              </div>

                              {calibrationSettings.stability_check_method ===
                                "sliding_window" && (
                                <>
                                  <div className="form-section">
                                    <label htmlFor="stability_window">
                                      Stability window (# samples)
                                    </label>
                                    <input
                                      type="number"
                                      id="stability_window"
                                      name="stability_window"
                                      min="2"
                                      max={calibrationSettings.num_samples || 35}
                                      value={
                                        calibrationSettings.stability_window || ""
                                      }
                                      onChange={(e) => {
                                        const newWindow = parseInt(e.target.value, 10) || 0;
                                        const currentSamples = parseInt(calibrationSettings.num_samples, 10) || 35;
                                        setCalibrationSettings((prev) => ({
                                          ...prev,
                                          stability_window: newWindow > currentSamples ? currentSamples : newWindow,
                                        }));
                                      }}
                                      disabled={isRemoteViewer}
                                    />
                                  </div>
                                  <div className="form-section">
                                    <label htmlFor="stability_threshold_ppm">
                                      Stability threshold (PPM)
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      id="stability_threshold_ppm"
                                      name="stability_threshold_ppm"
                                      placeholder="e.g., 10"
                                      value={
                                        calibrationSettings.stability_threshold_ppm ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        setCalibrationSettings((prev) => ({
                                          ...prev,
                                          stability_threshold_ppm: e.target.value,
                                        }))
                                      }
                                      disabled={isRemoteViewer}
                                    />
                                  </div>
                                  <div className="form-section">
                                    <label htmlFor="stability_max_attempts">
                                      Max stability attempts
                                    </label>
                                    <input
                                      type="number"
                                      id="stability_max_attempts"
                                      name="stability_max_attempts"
                                      value={
                                        calibrationSettings.stability_max_attempts ||
                                        50
                                      }
                                      onChange={(e) =>
                                        setCalibrationSettings((prev) => ({
                                          ...prev,
                                          stability_max_attempts: parseInt(
                                            e.target.value,
                                            10
                                          ),
                                        }))
                                      }
                                      disabled={isRemoteViewer}
                                    />
                                  </div>
                                  <div className="form-section form-section--checkbox full-width">
                                    <label className="form-section-checkbox-label">
                                      <input
                                        type="checkbox"
                                        className="form-section-checkbox-input"
                                        checked={calibrationSettings.ignore_instability_after_lock || false}
                                        onChange={(e) =>
                                          setCalibrationSettings((prev) => ({
                                            ...prev,
                                            ignore_instability_after_lock: e.target.checked,
                                          }))
                                        }
                                        disabled={isRemoteViewer}
                                      />
                                      <span>Bypass stability attempts (post initial)</span>
                                    </label>
                                  </div>
                                </>
                              )}

                              {calibrationSettings.stability_check_method ===
                                "iqr_filter" && (
                                <div className="form-section">
                                  <label htmlFor="iqr_filter_ppm_threshold">
                                    IQR filter threshold (PPM)
                                  </label>
                                  <input
                                    type="number"
                                    step="any"
                                    id="iqr_filter_ppm_threshold"
                                    name="iqr_filter_ppm_threshold"
                                    value={
                                      calibrationSettings.iqr_filter_ppm_threshold ||
                                      15
                                    }
                                    onChange={(e) =>
                                      setCalibrationSettings((prev) => ({
                                        ...prev,
                                        iqr_filter_ppm_threshold: e.target.value,
                                      }))
                                    }
                                    disabled={isRemoteViewer}
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="settings-form-group">
                            <span className="settings-form-group-eyebrow">
                              Characterization
                            </span>
                            <div className="form-section-group">
                              <div className="form-section">
                                <label htmlFor="characterization_source">
                                  Source
                                </label>
                                <select
                                  id="characterization_source"
                                  name="characterization_source"
                                  value={
                                    calibrationSettings.characterization_source ||
                                    "DC"
                                  }
                                  onChange={(e) =>
                                    setCalibrationSettings((prev) => ({
                                      ...prev,
                                      characterization_source: e.target.value,
                                    }))
                                  }
                                  disabled={isRemoteViewer}
                                >
                                  <option value="DC">DC</option>
                                  <option value="AC">AC</option>
                                </select>
                              </div>
                              <div className="form-section form-section--checkbox full-width">
                                <label className="form-section-checkbox-label">
                                  <input
                                    type="checkbox"
                                    className="form-section-checkbox-input"
                                    checked={
                                      calibrationSettings.characterize_test_first ||
                                      false
                                    }
                                    onChange={(e) =>
                                      setCalibrationSettings((prev) => ({
                                        ...prev,
                                        characterize_test_first: e.target.checked,
                                      }))
                                    }
                                    disabled={isRemoteViewer}
                                  />
                                  <span>
                                    Characterize Test TVC before run
                                  </span>
                                </label>
                              </div>
                            </div>
                          </div>

                          <div className="form-section-action-icons">
                            <button
                              type="button"
                              onClick={handleApplySettingsToAll}
                              className="sidebar-action-button"
                              aria-label="Apply to all test points"
                              title="Apply to all test points"
                              disabled={isRemoteViewer}
                            >
                              <LuSaveAll />
                            </button>
                            <button
                              type="submit"
                              className="sidebar-action-button"
                              aria-label="Save settings for this point"
                              title="Save settings for this point"
                              disabled={isRemoteViewer}
                            >
                              <FaSave />
                            </button>
                          </div>
                        </form>
                      )}
                      {activeTab === "readings" && (
                        <>
                          {showStdChart && (
                            <div className="chart-container">
                              <CalibrationChart
                                title="Standard Instrument Readings"
                                chartData={stdChartData}
                                theme={theme}
                                chartType="line"
                                onHover={setHoveredIndex}
                                syncedHoverIndex={hoveredIndex}
                                comparisonData={tiChartData.datasets}
                                instrumentType="std"
                                onMarkStability={isRemoteViewer ? null : handleMarkStability}
                                activeChartView={activeChartView}
                                setActiveChartView={setActiveChartView}
                              />
                              <LiveStatisticsTracker
                                title="Standard Instrument Statistics"
                                readings={stdChartDataSource}
                                activeStage={
                                  isCurrentTPActive
                                    ? activeCollectionDetails?.stage ||
                                    activeCollectionDetails?.readingKey
                                    : null
                                }
                              />
                            </div>
                          )}
                          {showTiChart && (
                            <div className="chart-container">
                              <CalibrationChart
                                title="Test Instrument Readings"
                                chartData={tiChartData}
                                theme={theme}
                                chartType="line"
                                onHover={setHoveredIndex}
                                syncedHoverIndex={hoveredIndex}
                                comparisonData={stdChartData.datasets}
                                instrumentType="ti"
                                onMarkStability={isRemoteViewer ? null : handleMarkStability}
                                activeChartView={activeChartView}
                                setActiveChartView={setActiveChartView}
                              />
                              <LiveStatisticsTracker
                                title="Test Instrument Statistics"
                                readings={tiChartDataSource}
                                activeStage={
                                  isCurrentTPActive
                                    ? activeCollectionDetails?.stage ||
                                    activeCollectionDetails?.readingKey
                                    : null
                                }
                              />
                            </div>
                          )}
                        </>
                      )}
                      {activeTab === "calculate" && (
                        <section className="cal-calc-panel">
                          <header className="cal-calc-bar">
                            <div className="cal-calc-bar-meta" aria-live="polite">
                              <span className="cal-calc-bar-amps">
                                {focusedTP.current} A
                              </span>
                              <span className="cal-calc-bar-freq">
                                {formatFrequency(focusedTP.frequency)}
                              </span>
                            </div>
                            <div className="cal-calc-bar-actions">
                              <button
                                type="button"
                                onClick={handleOpenCorrectionModal}
                                disabled={
                                  isCalculatingAverages ||
                                  !isCalculationReady
                                }
                                className="cal-results-excel-icon-btn"
                                aria-label="Calculate AC-DC difference"
                                title={
                                  isCollecting || isBulkRunning
                                    ? "View correction inputs (editing disabled while running)"
                                    : "View or Edit Correction Inputs"
                                }
                              >
                                <FaCalculator aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="cal-results-excel-icon-btn"
                                aria-label="Export session to Excel"
                                title="Export session to Excel — AC–DC summary and all raw readings"
                                disabled={!uniqueTestPoints?.length}
                                onClick={handleExportSessionExcel}
                              >
                                <FaDownload aria-hidden />
                              </button>
                            </div>
                          </header>

                          {averagedPpmDifference != null && (
                            <button
                              type="button"
                              className="cal-calc-kpi cal-calc-kpi--primary cal-results-overview-card"
                              onClick={() =>
                                onOpenResultsDirection &&
                                onOpenResultsDirection("Combined")
                              }
                              title="View combined results"
                              aria-label="View combined results"
                            >
                              <p className="cal-calc-kpi-label">
                                Final averaged AC–DC difference
                              </p>
                              <div className="cal-calc-kpi-value-row">
                                <span className="cal-calc-kpi-num">
                                  {parseFloat(averagedPpmDifference).toFixed(3)}
                                </span>
                                <span className="cal-calc-kpi-unit">ppm</span>
                              </div>
                            </button>
                          )}

                          {(focusedTP.forward?.results?.delta_uut_ppm != null ||
                            focusedTP.reverse?.results?.delta_uut_ppm != null) && (
                              <div className="cal-calc-direction-grid">
                                {focusedTP.forward?.results?.delta_uut_ppm !=
                                  null && (
                                    <button
                                      type="button"
                                      className="cal-calc-kpi cal-results-overview-card"
                                      onClick={() =>
                                        onOpenResultsDirection &&
                                        onOpenResultsDirection("Forward")
                                      }
                                      title="View forward results"
                                      aria-label="View forward results"
                                    >
                                      <p className="cal-calc-kpi-label">
                                        Forward · δ UUT
                                      </p>
                                      <div className="cal-calc-kpi-value-row">
                                        <span className="cal-calc-kpi-num">
                                          {parseFloat(
                                            focusedTP.forward.results.delta_uut_ppm
                                          ).toFixed(3)}
                                        </span>
                                        <span className="cal-calc-kpi-unit">
                                          ppm
                                        </span>
                                      </div>
                                    </button>
                                  )}

                                {focusedTP.reverse?.results?.delta_uut_ppm !=
                                  null && (
                                    <button
                                      type="button"
                                      className="cal-calc-kpi cal-results-overview-card"
                                      onClick={() =>
                                        onOpenResultsDirection &&
                                        onOpenResultsDirection("Reverse")
                                      }
                                      title="View reverse results"
                                      aria-label="View reverse results"
                                    >
                                      <p className="cal-calc-kpi-label">
                                        Reverse · δ UUT
                                      </p>
                                      <div className="cal-calc-kpi-value-row">
                                        <span className="cal-calc-kpi-num">
                                          {parseFloat(
                                            focusedTP.reverse.results.delta_uut_ppm
                                          ).toFixed(3)}
                                        </span>
                                        <span className="cal-calc-kpi-unit">
                                          ppm
                                        </span>
                                      </div>
                                    </button>
                                  )}
                              </div>
                            )}

                          {!(
                            focusedTP.forward?.results?.delta_uut_ppm ||
                            focusedTP.reverse?.results?.delta_uut_ppm
                          ) && (
                              <div className="cal-calc-empty">
                                <h3 className="cal-calc-empty-title">
                                  No results yet
                                </h3>
                                <p className="cal-calc-empty-text">
                                  Finish readings for a direction, then use the
                                  Calculate button above to compute the AC–DC
                                  difference.
                                </p>
                              </div>
                            )}
                        </section>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default Calibration;