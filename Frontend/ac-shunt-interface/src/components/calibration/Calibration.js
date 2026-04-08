// src/components/Calibration/Calibration.js

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import axios from "axios";
import {
  FaStop,
  FaCalculator,
  FaTimes,
  FaPlay,
  FaHourglassHalf,
  FaCrosshairs,
  FaStream,
  FaSave,
  FaChevronDown,
} from "react-icons/fa";
import { LuSaveAll } from "react-icons/lu";
import { useInstruments } from "../../contexts/InstrumentContext";
import { useTheme } from "../../contexts/ThemeContext";
import CalibrationChart from "./CalibrationChart";
import ConfigurationSummaryModal from "./ConfigurationSummaryModal";
import LiveStatisticsTracker from "./LiveStatisticsTracker";
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
  onGetCorrection,
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
          }}
        >
          <h3>Correction Factor Inputs</h3>
          <button
            onClick={onClose}
            className="modal-close-button"
            style={{ position: "static" }}
          >
            <FaTimes />
          </button>
        </div>
        <p>
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
              placeholder="e.g., 5.5"
            />
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={onGetCorrection}
            className="button button-secondary"
          >
            Fetch Corrections
          </button>
          <div className="modal-actions-right">
            <button onClick={onClose} className="button button-secondary">
              Cancel
            </button>
            <button
              onClick={() => onSubmit(initialValues)}
              className="button button-primary"
              disabled={!isFormValid}
            >
              Calculate & Save
            </button>
          </div>
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
}) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{title}</h3>
        <p
          style={{
            marginBottom: "25px",
            whiteSpace: "pre-wrap",
            lineHeight: "1.6",
          }}
        >
          {message}
        </p>
        <div className="modal-actions">
          <button onClick={onCancel} className="button button-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="button">
            {confirmText}
          </button>
        </div>
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

function Calibration({
  showNotification,
  orderedTestPoints,
  sharedFocusedTestPoint: focusedTP,
  setSharedFocusedTestPoint: setFocusedTP,
  sharedSelectedTPs: selectedTPs,
  onDataUpdate,
  activeDirection, // Receive as prop now
}) {
  const {
    selectedSessionId,
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
    standardInstrumentSerial,
    standardTvcSn: standardTvcSerial,
    testTvcSn: testTvcSerial,
    dataRefreshTrigger,
  } = useInstruments();
  const { theme } = useTheme();

  const [activeTab, setActiveTab] = useState("settings");
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
  });
  const [correctionInputs, setCorrectionInputs] = useState({
    eta_std: "",
    eta_ti: "",
    delta_std: "",
    delta_ti: "",
    delta_std_known: "",
  });
  const [averagedPpmDifference, setAveragedPpmDifference] = useState(null);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  // activeDirection state removed
  const [lastCollectionDirection, setLastCollectionDirection] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [amplifierModal, setAmplifierModal] = useState({
    isOpen: false,
    range: null,
    onConfirm: () => {},
  });
  const [historicalReadings, setHistoricalReadings] =
    useState(initialLiveReadings);
  const [tiHistoricalReadings, setTiHistoricalReadings] =
    useState(initialLiveReadings);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [shuntsData, setShuntsData] = useState([]);
  const [tvcsData, setTvcsData] = useState([]);
  const collectionPromise = useRef(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerInterval = useRef(null);
  const [isCalculatingAverages, setIsCalculatingAverages] = useState(false);
  const [isRunDropdownOpen, setIsRunDropdownOpen] = useState(false);
  const runDropdownRef = useRef(null);
  const prevIsBulkRunning = useRef(isBulkRunning);

  const uniqueTestPoints = useMemo(
    () => orderedTestPoints,
    [orderedTestPoints]
  );

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
    const handleClickOutside = (event) => {
      if (
        runDropdownRef.current &&
        !runDropdownRef.current.contains(event.target)
      ) {
        setIsRunDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
    if (focusedTPKey) {
      const pointToFocus = uniqueTestPoints.find((p) => p.key === focusedTPKey);
      if (pointToFocus) {
        setFocusedTP(pointToFocus);
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

  useEffect(() => {
    if (lastMessage?.type === "warning") {
      showNotification(lastMessage.message, "warning");
    }
  }, [lastMessage, showNotification]);

  const waitForCollection = () => {
    return new Promise((resolve, reject) => {
      collectionPromise.current = { resolve, reject };
    });
  };

  useEffect(() => {
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
  }, [lastMessage, sendWsCommand]);

  useEffect(() => {
    const fetchCorrectionData = async () => {
      try {
        const [shuntsRes, tvcsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/shunts/`),
          axios.get(`${API_BASE_URL}/tvcs/`),
        ]);
        setShuntsData(shuntsRes.data || []);
        setTvcsData(tvcsRes.data || []);
      } catch (error) {
        showNotification(
          "Could not fetch correction data from the database.",
          "warning"
        );
      }
    };
    fetchCorrectionData();
  }, [showNotification]);

  useEffect(() => {
    if (collectionStatus === "collection_stopped") {
      showNotification("Reading collection stopped by user.", "warning");
    }
  }, [collectionStatus, showNotification]);

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

      const reading_key = `${prefix}${readingType.key}_readings`; // Fixed key name

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
        await onDataUpdate();
      } catch (error) {
        const errorMsg = error.response?.data?.detail || "Failed to update reading stability.";
        showNotification(errorMsg, "error");
        console.error(error);
      }
  }, [focusedTP, selectedSessionId, activeDirection, onDataUpdate, showNotification]);

  useEffect(() => {
    if (!isCollecting && !isBulkRunning) {
      refreshComponentData();
    }
  }, [isCollecting, isBulkRunning, refreshComponentData, orderedTestPoints]);

  const parseStabilizationStatus = useCallback(
    (statusString) => {
      if (!statusString) return null;
      const ppmMatch = statusString.match(/Stdev: ([\d.]+|Calculating...) PPM/);
      const countMatch = statusString.match(/\[(\d+)\/(\d+)\]/);
      const ppm =
        ppmMatch && ppmMatch[1] !== "Calculating..."
          ? parseFloat(ppmMatch[1])
          : null;
      const count = countMatch ? `${countMatch[1]}/${countMatch[2]}` : "";
      const isStable =
        ppm !== null &&
        ppm < (calibrationSettings.stability_threshold_ppm || 10);
      return { ppm, count, isStable };
    },
    [calibrationSettings.stability_threshold_ppm]
  );
  const stabilizationInfo = parseStabilizationStatus(stabilizationStatus);

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

  const getShuntCorrection = useCallback(() => {
    if (
      !focusedTP ||
      !calibrationConfigurations.ac_shunt_range ||
      !standardInstrumentSerial ||
      shuntsData.length === 0
    ) {
      return null;
    }
    const range = parseFloat(calibrationConfigurations.ac_shunt_range);
    const current = parseFloat(focusedTP.current);
    const frequency = parseFloat(focusedTP.frequency);
    const relevantShunt = shuntsData.find(
      (s) =>
        s.serial_number === String(standardInstrumentSerial) &&
        parseFloat(s.range) === range &&
        parseFloat(s.current) === current
    );
    if (!relevantShunt) return null;
    const correctionEntry = relevantShunt.corrections.find(
      (c) => parseFloat(c.frequency) === frequency
    );
    return correctionEntry ? correctionEntry.correction : null;
  }, [
    focusedTP,
    calibrationConfigurations.ac_shunt_range,
    standardInstrumentSerial,
    shuntsData,
  ]);

  const getTVCCorrection = useCallback(() => {
    if (!focusedTP || tvcsData.length === 0) return [null, null];
    const targetFreq = parseFloat(focusedTP.frequency);
    const findCorrectionForSerial = (serial) => {
      if (!serial) return null;
      const relevantTvc = tvcsData.find(
        (t) => String(t.serial_number) === String(serial)
      );
      if (
        !relevantTvc ||
        !Array.isArray(relevantTvc.corrections) ||
        relevantTvc.corrections.length === 0
      ) {
        return null;
      }
      const sorted = [...relevantTvc.corrections].sort(
        (a, b) => a.frequency - b.frequency
      );
      const exactMatch = sorted.find((m) => m.frequency === targetFreq);
      if (exactMatch) {
        return exactMatch.ac_dc_difference;
      }
      if (targetFreq < 1000) {
        const next = sorted.find((m) => m.frequency > targetFreq);
        return next ? next.ac_dc_difference : null;
      }
      let lower = null;
      let upper = null;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (
          sorted[i].frequency < targetFreq &&
          sorted[i + 1].frequency > targetFreq
        ) {
          lower = sorted[i];
          upper = sorted[i + 1];
          break;
        }
      }
      if (lower && upper) {
        const { frequency: f1, ac_dc_difference: d1 } = lower;
        const { frequency: f2, ac_dc_difference: d2 } = upper;
        const interpolated = d1 + ((targetFreq - f1) * (d2 - d1)) / (f2 - f1);
        return interpolated;
      } else {
        if (sorted.length >= 2) {
          if (targetFreq < sorted[0].frequency) {
            const { frequency: f1, ac_dc_difference: d1 } = sorted[0];
            const { frequency: f2, ac_dc_difference: d2 } = sorted[1];
            const extrapolated =
              d1 + ((targetFreq - f1) * (d2 - d1)) / (f2 - f1);
            return extrapolated;
          } else if (targetFreq > sorted[sorted.length - 1].frequency) {
            const { frequency: f1, ac_dc_difference: d1 } =
              sorted[sorted.length - 2];
            const { frequency: f2, ac_dc_difference: d2 } =
              sorted[sorted.length - 1];
            const extrapolated =
              d2 + ((targetFreq - f2) * (d2 - d1)) / (f2 - f1);
            return extrapolated;
          }
        }
      }
      return null;
    };
    const stdCorrection = findCorrectionForSerial(standardTvcSerial);
    const testCorrection = findCorrectionForSerial(testTvcSerial);
    return [stdCorrection, testCorrection];
  }, [focusedTP, tvcsData, standardTvcSerial, testTvcSerial]);

  useEffect(() => {
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

    // 1. DEFINE currentFocusedTP FIRST
    const currentFocusedTP = focusedTP
      ? orderedTestPoints.find((p) => p.key === focusedTP.key)
      : null;

    // 2. NOW CHECK IF IT IS THE FIRST POINT
    const isFirstTestPoint = 
      currentFocusedTP && 
      orderedTestPoints.length > 0 && 
      currentFocusedTP.key === orderedTestPoints[0].key;

    // 3. APPLY SETTINGS
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
    };

    setHistoricalReadings(initialLiveReadings);
    setTiHistoricalReadings(initialLiveReadings);

    if (currentFocusedTP) {
      const pointForDirection =
        activeDirection === "Forward"
          ? currentFocusedTP.forward
          : currentFocusedTP.reverse;

      if (pointForDirection) {
        if (
          pointForDirection.settings &&
          Object.keys(pointForDirection.settings).length > 0
        ) {
          setCalibrationSettings({
            ...defaultSettings,
            ...pointForDirection.settings,
          });
        } else {
          setCalibrationSettings(defaultSettings);
        }

        if (pointForDirection.readings) {
          setHistoricalReadings({
            ac_open: formatReadingsForChart(
              pointForDirection.readings.std_ac_open_readings
            ),
            dc_pos: formatReadingsForChart(
              pointForDirection.readings.std_dc_pos_readings
            ),
            dc_neg: formatReadingsForChart(
              pointForDirection.readings.std_dc_neg_readings
            ),
            ac_close: formatReadingsForChart(
              pointForDirection.readings.std_ac_close_readings
            ),
          });
          setTiHistoricalReadings({
            ac_open: formatReadingsForChart(
              pointForDirection.readings.ti_ac_open_readings
            ),
            dc_pos: formatReadingsForChart(
              pointForDirection.readings.ti_dc_pos_readings
            ),
            dc_neg: formatReadingsForChart(
              pointForDirection.readings.ti_dc_neg_readings
            ),
            ac_close: formatReadingsForChart(
              pointForDirection.readings.ti_ac_close_readings
            ),
          });
        }
      } else {
        setCalibrationSettings(defaultSettings);
      }
    }
  }, [focusedTP, activeDirection, initialLiveReadings, orderedTestPoints]);

  useEffect(() => {
    if (!focusedTP) {
      setAveragedPpmDifference(null);
      return;
    }
    const forwardResult = focusedTP.forward?.results?.delta_uut_ppm;
    const reverseResult = focusedTP.reverse?.results?.delta_uut_ppm;
    const existingAverage = focusedTP.forward?.results?.delta_uut_ppm_avg;

    if (
      forwardResult !== undefined &&
      forwardResult !== null &&
      reverseResult !== undefined &&
      reverseResult !== null
    ) {
      const averagePpm =
        (parseFloat(forwardResult) + parseFloat(reverseResult)) / 2;
      const averagePpmFormatted = averagePpm.toFixed(3);
      setAveragedPpmDifference(averagePpmFormatted);

      if (String(existingAverage) !== averagePpmFormatted) {
        const saveAverage = async () => {
          try {
            const forwardPayload = {
              ...focusedTP.forward.results,
              delta_uut_ppm_avg: averagePpmFormatted,
            };
            const reversePayload = {
              ...focusedTP.reverse.results,
              delta_uut_ppm_avg: averagePpmFormatted,
            };
            await Promise.all([
              axios.put(
                `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${focusedTP.forward.id}/update-results/`,
                forwardPayload
              ),
              axios.put(
                `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${focusedTP.reverse.id}/update-results/`,
                reversePayload
              ),
            ]);
            showNotification(
              `Saved Averaged δ UUT: ${averagePpmFormatted} PPM`,
              "success"
            );
            onDataUpdate();
          } catch (error) {
            showNotification("Error saving the averaged result.", "error");
          }
        };
        saveAverage();
      }
    } else {
      setAveragedPpmDifference(null);
    }
  }, [focusedTP, selectedSessionId, showNotification, onDataUpdate]);

  const handleCorrectionInputChange = (e) =>
    setCorrectionInputs((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));

  const performFinalCalculation = useCallback(
    async (currentCorrectionInputs) => {
      const calculatePpmFor = (point) => {
        const fetchedResults = point?.results;
        if (
          !point ||
          !fetchedResults ||
          ![
            "std_dc_pos_avg",
            "std_dc_neg_avg",
            "std_ac_open_avg",
            "std_ac_close_avg",
            "ti_dc_pos_avg",
            "ti_dc_neg_avg",
            "ti_ac_open_avg",
            "ti_ac_close_avg",
          ].every((key) => fetchedResults[key] != null)
        ) {
          return null;
        }
        const V_DCSTD =
          (Math.abs(fetchedResults.std_dc_pos_avg) +
            Math.abs(fetchedResults.std_dc_neg_avg)) /
          2;
        const V_ACSTD =
          (Math.abs(fetchedResults.std_ac_open_avg) +
            Math.abs(fetchedResults.std_ac_close_avg)) /
          2;
        const V_DCUUT =
          (Math.abs(fetchedResults.ti_dc_pos_avg) +
            Math.abs(fetchedResults.ti_dc_neg_avg)) /
          2;
        const V_ACUUT =
          (Math.abs(fetchedResults.ti_ac_open_avg) +
            Math.abs(fetchedResults.ti_ac_close_avg)) /
          2;
        const { eta_std, eta_ti, delta_std, delta_ti, delta_std_known } =
          Object.fromEntries(
            Object.entries(currentCorrectionInputs).map(([k, v]) => [
              k,
              parseFloat(v),
            ])
          );
        const term_STD = ((V_ACSTD - V_DCSTD) * 1000000) / (eta_std * V_DCSTD);
        const term_UUT = ((V_ACUUT - V_DCUUT) * 1000000) / (eta_ti * V_DCUUT);
        return (
          delta_std_known +
          term_STD -
          term_UUT +
          delta_std -
          delta_ti
        ).toFixed(3);
      };

      const newForwardPpm = hasAllReadings(focusedTP.forward)
        ? calculatePpmFor(focusedTP.forward)
        : null;
      const newReversePpm = hasAllReadings(focusedTP.reverse)
        ? calculatePpmFor(focusedTP.reverse)
        : null;

      if (hasAllReadings(focusedTP.forward) && newForwardPpm === null) {
        showNotification(
          "Forward calculation failed: required average values are missing.",
          "error"
        );
      }
      if (hasAllReadings(focusedTP.reverse) && newReversePpm === null) {
        showNotification(
          "Reverse calculation failed: required average values are missing.",
          "error"
        );
      }

      if (newForwardPpm === null && newReversePpm === null) {
        return showNotification(
          "No directions have complete readings to calculate.",
          "warning"
        );
      }

      try {
        const updatePromises = [];
        const sharedPayload = { ...currentCorrectionInputs };

        if (focusedTP.forward && focusedTP.forward.id) {
          const forwardPayload = {
            ...(focusedTP.forward.results || {}),
            ...sharedPayload,
          };
          if (newForwardPpm !== null) {
            forwardPayload.delta_uut_ppm = newForwardPpm;
          }
          updatePromises.push(
            axios.put(
              `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${focusedTP.forward.id}/update-results/`,
              forwardPayload
            )
          );
        }

        if (focusedTP.reverse && focusedTP.reverse.id) {
          const reversePayload = {
            ...(focusedTP.reverse.results || {}),
            ...sharedPayload,
          };
          if (newReversePpm !== null) {
            reversePayload.delta_uut_ppm = newReversePpm;
          }
          updatePromises.push(
            axios.put(
              `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${focusedTP.reverse.id}/update-results/`,
              reversePayload
            )
          );
        }

        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          showNotification(`AC-DC Difference successfully saved!`, "success");
        }

        onDataUpdate();
        setIsCorrectionModalOpen(false);
      } catch (error) {
        showNotification("Error saving results.", "error");
        console.error(
          "Error saving calculation results:",
          error.response ? error.response.data : error.message
        );
      }
    },
    [
      focusedTP,
      hasAllReadings,
      onDataUpdate,
      selectedSessionId,
      showNotification,
    ]
  );

  useEffect(() => {
    const attemptAutoCalculation = async () => {
      if (!focusedTP) return;

      const averagesArePresent = (point) => {
        const results = point?.results;
        if (!results) return false;
        return [
          "std_dc_pos_avg",
          "std_dc_neg_avg",
          "std_ac_open_avg",
          "std_ac_close_avg",
          "ti_dc_pos_avg",
          "ti_dc_neg_avg",
          "ti_ac_open_avg",
          "ti_ac_close_avg",
        ].every((key) => results[key] != null);
      };

      const hasFwdReadings = hasAllReadings(focusedTP.forward);
      const hasRevReadings = hasAllReadings(focusedTP.reverse);
      const fwdAveragesPresent = averagesArePresent(focusedTP.forward);
      const revAveragesPresent = averagesArePresent(focusedTP.reverse);
      const fwdPpmMissing =
        focusedTP.forward?.results?.delta_uut_ppm === undefined ||
        focusedTP.forward?.results?.delta_uut_ppm === null;
      const revPpmMissing =
        focusedTP.reverse?.results?.delta_uut_ppm === undefined ||
        focusedTP.reverse?.results?.delta_uut_ppm === null;

      const isReadyForAutoCalc =
        hasFwdReadings &&
        hasRevReadings &&
        fwdAveragesPresent &&
        revAveragesPresent &&
        fwdPpmMissing &&
        revPpmMissing;

      if (isReadyForAutoCalc) {
        const [stdTVC, tiTVC] = getTVCCorrection();
        const shuntCorrection = getShuntCorrection();

        const autoCorrectionInputs = {
          eta_std: focusedTP.forward?.results?.eta_std || "1",
          eta_ti: focusedTP.forward?.results?.eta_ti || "1",
          delta_std: stdTVC !== null ? String(stdTVC) : "0",
          delta_ti: tiTVC !== null ? String(tiTVC) : "0",
          delta_std_known:
            shuntCorrection !== null ? String(shuntCorrection) : "0",
        };

        showNotification(
          "Forward and Reverse readings complete. Automatically calculating results...",
          "info"
        );

        await performFinalCalculation(autoCorrectionInputs);
      }
    };

    attemptAutoCalculation();
  }, [
    focusedTP,
    hasAllReadings,
    getTVCCorrection,
    getShuntCorrection,
    performFinalCalculation,
    showNotification,
  ]);

  const handleOpenCorrectionModal = () => {
    const primaryPoint = focusedTP.forward || focusedTP.reverse;
    const existingResults = primaryPoint?.results || {};
    const tvcCorrection = getTVCCorrection();
    const shuntCorrection = getShuntCorrection();

    setCorrectionInputs({
      eta_std: existingResults.eta_std || "1",
      eta_ti: existingResults.eta_ti || "1",
      delta_std:
        existingResults.delta_std !== undefined
          ? existingResults.delta_std
          : tvcCorrection[0] !== null
          ? tvcCorrection[0]
          : "",
      delta_ti:
        existingResults.delta_ti !== undefined
          ? existingResults.delta_ti
          : tvcCorrection[1] !== null
          ? tvcCorrection[1]
          : "",
      delta_std_known:
        existingResults.delta_std_known !== undefined
          ? existingResults.delta_std_known
          : shuntCorrection !== null
          ? shuntCorrection
          : "",
    });

    setIsCorrectionModalOpen(true);
  };

  const handleGetCorrection = () => {
    const [stdTVC, tiTVC] = getTVCCorrection();
    const shuntCorrection = getShuntCorrection();

    const updatedFieldDetails = [];
    if (stdTVC !== null)
      updatedFieldDetails.push(`Standard TVC (${stdTVC.toFixed(3)})`);
    if (tiTVC !== null)
      updatedFieldDetails.push(`Test TVC (${tiTVC.toFixed(3)})`);
    if (shuntCorrection !== null)
      updatedFieldDetails.push(`Shunt correction (${shuntCorrection})`);

    if (updatedFieldDetails.length === 0) {
      showNotification(
        "No correction found for the selected test point parameters.",
        "info"
      );
    } else {
      setCorrectionInputs((prev) => ({
        ...prev,
        delta_std: stdTVC ?? prev.delta_std,
        delta_ti: tiTVC ?? prev.delta_ti,
        delta_std_known: shuntCorrection ?? prev.delta_std_known,
      }));

      const successMessage = `Successfully updated: ${updatedFieldDetails.join(
        ", "
      )}.`;
      showNotification(successMessage, "success");
    }
  };

  const runMeasurement = useCallback(
    async (
      testPointToRun,
      runType,
      baseReadingKey = null,
      bypassAmplifierConfirmation = false
    ) => {
      if (!testPointToRun) return;
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
    ]
  );

  const handleRunSelectedPoints = async () => {
    if (selectedTPs.size === 0) {
      showNotification("No test points selected.", "warning");
      return;
    }

    const runBatchSequence = () => {
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
          `No test points were selected for the batch run.`,
          "error"
        );
        return;
      }

      const firstPointInBatch = orderedTestPoints.find(
        (p) => p.key === pointsToRunData[0].key
      );
      if (firstPointInBatch) {
        setFocusedTP(firstPointInBatch);
      }

      const firstPointSettings =
        firstPointInBatch?.forward?.settings ||
        firstPointInBatch?.reverse?.settings ||
        calibrationSettings;

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
              `Operation failed: ${
                error.message || "An unknown error occurred."
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

    if (
      activeDirection !== lastCollectionDirection &&
      lastCollectionDirection !== null
    ) {
      setConfirmationModal({
        isOpen: true,
        title: "Confirm Hardware Change",
        message: `Please ensure you have physically configured the hardware for the '${activeDirection}' direction before proceeding.`,
        onConfirm: () => {
          setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
          setLastCollectionDirection(activeDirection);
          runBatchSequence();
        },
        onCancel: () =>
          setConfirmationModal((prev) => ({ ...prev, isOpen: false })),
      });
    } else {
      setLastCollectionDirection(activeDirection);
      runBatchSequence();
    }
  };

  const handleCollectReadingsRequest = useCallback(
    (baseReadingKey) => {
      const run = () => {
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
              `Operation failed: ${
                error.message || "An unknown error occurred."
              }`,
              "error"
            );
            console.error("Measurement run error:", error);
          })
          .finally(() => {
            onDataUpdate();
          });
      };

      if (
        activeDirection !== lastCollectionDirection &&
        lastCollectionDirection !== null
      ) {
        setConfirmationModal({
          isOpen: true,
          title: "Confirm Hardware Change",
          message: `Please ensure you have physically configured the hardware for the '${activeDirection}' direction before proceeding.`,
          onConfirm: () => {
            setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
            run();
          },
          onCancel: () =>
            setConfirmationModal((prev) => ({ ...prev, isOpen: false })),
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
    ]
  );

  const handleRunSingleStageOnSelected = useCallback(
    async (readingKey) => {
      if (selectedTPs.size === 0) {
        showNotification("No test points selected for batch run.", "warning");
        return;
      }

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

      const firstPointSettings =
        firstPointToRun?.forward?.settings ||
        firstPointToRun?.reverse?.settings ||
        calibrationSettings;

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
            `Operation failed: ${
              error.message || "An unknown error occurred."
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
    },
    [
      selectedTPs,
      orderedTestPoints,
      activeDirection,
      calibrationSettings,
      stdReaderModel,
      tiReaderModel,
      calibrationConfigurations.amplifier_range,
      startReadingCollection,
      showNotification,
      onDataUpdate,
      uniqueTestPoints,
      setFocusedTP,
    ]
  );

  const buildChartData = (readings) => ({
    labels: [
      ...new Set(
        Object.values(readings).flatMap((arr) =>
          arr ? arr.map((point) => point.x) : []
        )
      ),
    ].sort((a, b) => a - b),
    datasets: READING_TYPES.map((type) => {
      const baseColor = type.color;

      return {
        label: type.label,
        data: readings[type.key],
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
        },
      };
    }),
  });

  const formatFrequency = useCallback((value) => {
    return (
      AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
        text: `${value}Hz`,
      }
    ).text;
  }, []);

  const formatCurrent = (value) => {
    const numValue = parseFloat(value);
    const epsilon = 1e-9;
    const found = AVAILABLE_CURRENTS.find(
      (c) => Math.abs(c.value - numValue) < epsilon
    );
    return found ? found.text : `${numValue}`;
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
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

  // [FIX] Convert both IDs to strings to prevent type mismatches (e.g. 123 vs "123")
  const isCurrentTPActive = 
    isCollecting && 
    String(activeCollectionDetails?.tpId) === String(pointForDirection?.id);

  // [DEBUG] Add this effect to see exactly why it locks or unlocks
  useEffect(() => {
    if (isCollecting) {
      console.log("[DEBUG_UI_LOCK] Check:", {
        collecting: isCollecting,
        activeTpId: activeCollectionDetails?.tpId,
        activeTpIdType: typeof activeCollectionDetails?.tpId,
        currentPointId: pointForDirection?.id,
        currentPointIdType: typeof pointForDirection?.id,
        MATCH: isCurrentTPActive
      });
    }
  }, [isCollecting, activeCollectionDetails, pointForDirection, isCurrentTPActive]);

  const stdChartDataSource = isCurrentTPActive
    ? { ...historicalReadings, ...liveReadings }
    : historicalReadings;
  const tiChartDataSource = isCurrentTPActive
    ? { ...tiHistoricalReadings, ...tiLiveReadings }
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
    if (selectedTPs.size > 1) {
      return READING_TYPES.map(({ key, label }) => ({
        key: key,
        label: `Take ${label} on ${selectedTPs.size} Points`,
        onClick: () => handleRunSingleStageOnSelected(key),
      }));
    } else {
      return READING_TYPES.map(({ key, label }) => ({
        key: key,
        label: `Take ${label} Readings`,
        onClick: () => handleCollectReadingsRequest(key),
      }));
    }
  }, [
    selectedTPs.size,
    handleCollectReadingsRequest,
    handleRunSingleStageOnSelected,
  ]);

  const displayPpm = slidingWindowStatus?.ppm ?? livePpm;

  const isWindowMature =
    collectionProgress.count >= calibrationSettings.stability_window;

  const currentFillCount =
    collectionProgress.count % calibrationSettings.stability_window;
  const displayFillCount =
    currentFillCount === 0 && collectionProgress.count > 0
      ? calibrationSettings.stability_window
      : currentFillCount;

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
        onSubmit={performFinalCalculation}
        initialValues={correctionInputs}
        onInputChange={handleCorrectionInputChange}
        onGetCorrection={handleGetCorrection}
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
        title="Confirm Amplifier Range"
        message={`Please ensure the 8100 Amplifier range is set to ${amplifierModal.range} A. Incorrect range setting may damage the equipment.\n\nVerify 5730A calibrators voltage output are correct. Once verified, set the 8100 to operate and click Proceed.`}
        onConfirm={amplifierModal.onConfirm}
        onCancel={amplifierModal.onCancel}
        confirmText="Proceed"
      />
      {!selectedSessionId ? (
        <div className="content-area form-section-warning">
          <p>Please select a session to run a calibration.</p>
        </div>
      ) : uniqueTestPoints && uniqueTestPoints.length === 0 ? (
        <div className="content-area form-section-warning">
          <p>
            This session has no test points. Please go to the "Test Point
            Editor" to generate them.
          </p>
        </div>
      ) : (
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
                  {/* SubNav comes BEFORE the status bar */}
                  <SubNav activeTab={activeTab} setActiveTab={setActiveTab} />

                  {/* --- STATUS BAR NOW PERMANENT & AT THE TOP --- */}
                  <div className="status-bar">
                    <div className="status-bar-content">
                      {/* --- NEW READOUT SECTION --- */}
                      <div className="status-section readout-section">
                        <span className="status-label">Test Point</span>
                        <span className="status-value">
                          {formatCurrent(focusedTP.current)}
                        </span>
                        <span className="status-detail">
                          {formatFrequency(focusedTP.frequency)}
                        </span>
                      </div>
                      <div style={{ flexGrow: 1 }}></div>

                      {/* --- DYNAMIC SECTIONS (Only show when collecting/running) --- */}
                      {(isCollecting || isBulkRunning) && (
                        <>
                          {isBulkRunning && (
                            <div
                              className="status-section"
                              style={{ flexGrow: 1.5, borderRight: '1px solid var(--border-color)' }} // Added border here
                            >
                              <span className="status-label">
                                Batch Progress
                              </span>
                              <span className="status-value">{`Point ${bulkRunProgressFromContext.current} of ${bulkRunProgressFromContext.total}`}</span>
                              <span className="status-detail">{`${formatCurrent(
                                focusedTP?.current
                              )} @ ${formatFrequency(
                                focusedTP?.frequency
                              )}`}</span>
                            </div>
                          )}
                          <div className="status-section">
                            <span className="status-label">
                              {timerState.isActive ? (
                                <>
                                  <FaHourglassHalf /> {timerState.label}
                                </>
                              ) : stabilizationStatus ? (
                                <>
                                  <FaCrosshairs /> Stabilizing
                                </>
                              ) : (
                                <>
                                  <FaStream /> Collecting
                                </>
                              )}
                            </span>
                            <span className="status-value">
                              {timerState.isActive
                                ? `${countdown}s`
                                : getStageName()}
                            </span>
                            <span className="status-detail">
                              {stabilizationStatus && stabilizationInfo
                                ? `Attempt: ${stabilizationInfo.count}`
                                : `${collectionProgress.count} / ${collectionProgress.total} Samples`}
                            </span>
                          </div>

                          {/* --- NEW LIVE READINGS SECTION --- */}
                          {!timerState.isActive && (latestStdReading || latestTiReading) && (
                            <div className="status-section live-readout-section">
                              <span className="status-label">
                                <FaStream /> Live Readings
                              </span>
                              <span className="status-value">
                                {latestStdReading
                                  ? `STD: ${latestStdReading.y.toPrecision(7)} V`
                                  : "STD: ..."}
                              </span>
                              <span className="status-detail">
                                {latestTiReading
                                  ? `TI: ${latestTiReading.y.toPrecision(7)} V`
                                  : "TI: ..."}
                              </span>
                            </div>
                          )}
                          {/* --- END NEW LIVE READINGS SECTION --- */}

                          {!timerState.isActive &&
                            calibrationSettings.stability_check_method ===
                              "sliding_window" && (
                              <div className="status-section window-stability-section">
                                <span className="status-label">
                                  <FaCrosshairs /> Window Stability
                                </span>
                                <span
                                  className={`window-ppm-value ${
                                    isStableNow
                                      ? "status-good"
                                      : "status-bad"
                                  }`}
                                >
                                  {displayPpm != null
                                    ? `${displayPpm.toFixed(2)} PPM`
                                    : "..."}
                                </span>
                                <span className="status-detail">
                                  {isWindowMature
                                    ? `Threshold: ${calibrationSettings.stability_threshold_ppm} PPM`
                                    : `${displayFillCount} / ${calibrationSettings.stability_window} Samples`}
                                </span>
                              </div>
                            )}
                        </>
                      )}
                      {/* --- END DYNAMIC SECTIONS --- */}
                    </div>

                    {/* --- CONDITIONAL PROGRESS BAR, STOP BUTTON, OR PLAY BUTTON --- */}
                    {(isCollecting || isBulkRunning) ? (
                      <>
                        <div className="status-bar-progress-container">
                          <div
                            className="status-bar-progress"
                            style={{
                              width: `${
                                collectionProgress.total > 0 ? (collectionProgress.count / collectionProgress.total) * 100 : 0
                              }%`,
                            }}
                          ></div>
                        </div>
                        <div className="status-bar-action">
                          <button
                            onClick={stopReadingCollection}
                            className="button-stop"
                            title="Stop Collection"
                          >
                            <FaStop />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="status-bar-action">
                        <div
                          className="premium-action-button-container"
                          ref={runDropdownRef}
                        >
                          <div className="premium-action-button-wrapper">
                            <button
                              className="button premium-action-button-primary"
                              onClick={handleRunSelectedPoints}
                              disabled={
                                !focusedTP ||
                                readingWsState !== WebSocket.OPEN ||
                                selectedTPs.size === 0
                              }
                              title={
                                selectedTPs.size > 0
                                  ? `Run ${selectedTPs.size} Selected Point(s) (Full)`
                                  : "Select points to run"
                              }
                            >
                              <FaPlay />
                            </button>
                            <button
                              className="button premium-action-button-caret"
                              onClick={() =>
                                setIsRunDropdownOpen((prev) => !prev)
                              }
                              disabled={
                                !focusedTP ||
                                readingWsState !== WebSocket.OPEN
                              }
                              title="More run options"
                            >
                              <FaChevronDown />
                            </button>
                          </div>
                          {isRunDropdownOpen && (
                            <div className="premium-action-button-menu">
                              {dropdownOptions.map((opt) => (
                                <button
                                  key={opt.key}
                                  onClick={() => {
                                    opt.onClick();
                                    setIsRunDropdownOpen(false);
                                  }}
                                  className="premium-action-button-item"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* --- END CONDITIONAL ELEMENTS --- */}
                  </div>
                  {/* --- END STATUS BAR --- */}

                  {/* Sub-tab content comes AFTER SubNav */}
                  <div className="sub-tab-content">
                     {activeTab === "settings" && (
                       <form onSubmit={handleSettingsSubmit}>
                         <h4>Calibration Settings</h4>
                         <div className="config-grid">
                            <div className="form-section">
                              <label htmlFor="initial_warm_up_time">
                                Initial Warm-up Wait (sec)
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
                              />
                            </div>
                            <div className="form-section">
                              <label htmlFor="num_samples"># of Samples</label>
                              <input
                                type="number"
                                id="num_samples"
                                name="num_samples"
                                required
                                value={calibrationSettings.num_samples || 8}
                                onChange={(e) =>
                                  setCalibrationSettings((prev) => ({
                                    ...prev,
                                    num_samples: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="form-section">
                              <label htmlFor="settling_time">
                                Settling Time (sec)
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
                              />
                            </div>
                            {isNplcInstrumentInUse && (
                              <div className="form-section">
                                <label htmlFor="nplc">
                                  Reader Integration (NPLC)
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
                                >
                                  {NPLC_OPTIONS.map((val) => (
                                    <option key={val} value={val}>
                                      {val} PLC
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div className="form-section">
                              <label htmlFor="stability_check_method">
                                Stability Check Method
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
                              >
                                <option value="sliding_window">
                                  Sliding Window
                                </option>
                                <option value="iqr_filter">IQR Filter</option>
                              </select>
                            </div>

                            {calibrationSettings.stability_check_method ===
                              "sliding_window" && (
                              <>
                                <div className="form-section">
                                  <label htmlFor="stability_window">
                                    Stability Window (# Samples)
                                  </label>
                                  <input
                                    type="number"
                                    id="stability_window"
                                    name="stability_window"
                                    value={
                                      calibrationSettings.stability_window || 5
                                    }
                                    onChange={(e) =>
                                      setCalibrationSettings((prev) => ({
                                        ...prev,
                                        stability_window: parseInt(
                                          e.target.value,
                                          10
                                        ),
                                      }))
                                    }
                                  />
                                </div>
                                <div className="form-section">
                                  <label htmlFor="stability_threshold_ppm">
                                    Stability Threshold (PPM)
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
                                  />
                                </div>
                                <div className="form-section">
                                  <label htmlFor="stability_max_attempts">
                                    Max Stability Attempts
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
                                  />
                                </div>
                              </>
                            )}

                            {calibrationSettings.stability_check_method ===
                              "iqr_filter" && (
                              <div className="form-section">
                                <label htmlFor="iqr_filter_ppm_threshold">
                                  IQR Filter Threshold (PPM)
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
                                />
                              </div>
                            )}
                         </div>
                         <div className="form-section-action-icons">
                           <button
                             type="button"
                             onClick={handleApplySettingsToAll}
                             className="sidebar-action-button"
                             title="Apply to All Test Points"
                           >
                             <LuSaveAll />
                           </button>
                           <button
                             type="submit"
                             className="sidebar-action-button"
                             title="Save Settings for This Point"
                           >
                             <FaSave />
                           </button>
                         </div>
                       </form>
                     )}
                     {activeTab === "readings" && (
                       <>
                         {/* --- RUN BUTTONS MOVED TO STATUS BAR --- */}
                         
                         {/* Chart and Stats sections remain */}
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
                               onMarkStability={handleMarkStability}
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
                               onMarkStability={handleMarkStability}
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
                       <div className="results-container">
                          <div
                             className="form-section"
                             style={{
                               textAlign: "center",
                               paddingBottom: "20px",
                               borderBottom: "1px solid var(--border-color)",
                             }}
                           >
                             <button
                               onClick={handleOpenCorrectionModal}
                               disabled={
                                 isCollecting ||
                                 isCalculatingAverages ||
                                 !isCalculationReady
                               }
                               className="button button-success button-icon-only"
                               title="Calculate AC-DC Difference"
                             >
                               <FaCalculator />
                             </button>
                           </div>

                           {averagedPpmDifference && (
                             <div
                               className="final-result-card"
                               style={{
                                 marginBottom: "20px",
                                 background: "var(--success-color)",
                               }}
                             >
                               <h4>Final Averaged AC-DC Difference</h4>
                               <p>{averagedPpmDifference} PPM</p>
                             </div>
                           )}

                           <div
                             className="reading-group"
                             style={{
                               gridTemplateColumns: "1fr 1fr",
                               alignItems: "start",
                             }}
                           >
                             {focusedTP.forward?.results?.delta_uut_ppm !== null &&
                               focusedTP.forward?.results?.delta_uut_ppm !==
                                 undefined && (
                                 <div className="reading">
                                   <h4>Forward Direction</h4>
                                   <div
                                     className="reading-group"
                                     style={{ gridTemplateColumns: "1fr" }}
                                   >
                                     <div className="reading">
                                       <h3>δ UUT (PPM):</h3>
                                       <p
                                         style={{
                                           fontSize: "1.5em",
                                           fontWeight: "bold",
                                           color: "var(--primary-color)",
                                         }}
                                       >
                                         {parseFloat(
                                           focusedTP.forward.results.delta_uut_ppm
                                         ).toFixed(3)}
                                       </p>
                                     </div>
                                   </div>
                                 </div>
                               )}

                             {focusedTP.reverse?.results?.delta_uut_ppm !== null &&
                               focusedTP.reverse?.results?.delta_uut_ppm !==
                                 undefined && (
                                 <div className="reading">
                                   <h4>Reverse Direction</h4>
                                   <div
                                     className="reading-group"
                                     style={{ gridTemplateColumns: "1fr" }}
                                   >
                                     <div className="reading">
                                       <h3>δ UUT (PPM):</h3>
                                       <p
                                         style={{
                                           fontSize: "1.5em",
                                           fontWeight: "bold",
                                           color: "var(--primary-color)",
                                         }}
                                       >
                                         {parseFloat(
                                           focusedTP.reverse.results.delta_uut_ppm
                                         ).toFixed(3)}
                                       </p>
                                     </div>
                                   </div>
                                 </div>
                               )}
                           </div>
                           {!(
                             focusedTP.forward?.results?.delta_uut_ppm ||
                             focusedTP.reverse?.results?.delta_uut_ppm
                           ) && (
                             <div
                               className="placeholder-content"
                               style={{ minHeight: "200px" }}
                             >
                               <h3>No Results Calculated</h3>
                               <p>
                                 Complete readings for a direction and click the
                                 "Calculate" button above.
                               </p>
                             </div>
                           )}
                       </div>
                    )}
                  </div>
                </>
              )} {/* Closing tag for the focusedTP check */}
            </div> {/* Closing tag for test-point-content */}
          </div> {/* Closing tag for calibration-workflow-container */}
        </div> /* Closing tag for content-area */
      )}
    </>
  );
}

export default Calibration;