import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import axios from "axios";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FaStop,
  FaCalculator,
  FaTimes,
  FaPlay,
  FaEraser,
  FaHourglassHalf,
  FaCrosshairs,
  FaStream,
  FaGripVertical,
} from "react-icons/fa";
import { useInstruments } from "../../contexts/InstrumentContext";
import { useTheme } from "../../contexts/ThemeContext";
import CalibrationChart from "./CalibrationChart";
import SwitchControl from "./SwitchControl";
import ActionDropdownButton from "./ActionDropdownButton";
import LiveStatisticsTracker from "./LiveStatisticsTracker";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const READING_TYPES = [
  { key: "ac_open", label: "AC Open", color: "rgb(75, 192, 192)" },
  { key: "dc_pos", label: "DC Positive", color: "rgb(255, 99, 132)" },
  { key: "dc_neg", label: "DC Negative", color: "rgb(54, 162, 235)" },
  { key: "ac_close", label: "AC Closed", color: "rgb(255, 205, 86)" },
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

const NPLC_OPTIONS = [0.02, 0.2, 1, 2, 10, 20, 100, 200];

const normalizeKey = (value) => parseFloat(value).toString();

const normalizeCorrectionData = (rawData) => {
  const normalized = {};
  for (const range in rawData) {
    const normRange = parseFloat(range).toString();
    normalized[normRange] = {};
    for (const current in rawData[range]) {
      const normCurrent = parseFloat(current).toString();
      normalized[normRange][normCurrent] = {};
      for (const frequency in rawData[range][current]) {
        const normFreq = parseFloat(frequency).toString();
        normalized[normRange][normCurrent][normFreq] =
          rawData[range][current][frequency];
      }
    }
  }
  return normalized;
};

// MODAL FOR CORRECTION FACTOR INPUTS
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
      1. Settings
    </button>
    <button
      onClick={() => setActiveTab("readings")}
      className={activeTab === "readings" ? "active" : ""}
    >
      2. Take Readings
    </button>
    <button
      onClick={() => setActiveTab("calculate")}
      className={activeTab === "calculate" ? "active" : ""}
    >
      3. Calculate Results
    </button>
  </div>
);

const DirectionToggle = ({ activeDirection, setActiveDirection }) => (
  <div
    className="view-toggle"
    style={{ marginBottom: "1rem", justifyContent: "center" }}
  >
    <button
      className={activeDirection === "Forward" ? "active" : ""}
      onClick={() => setActiveDirection("Forward")}
    >
      Forward
    </button>
    <button
      className={activeDirection === "Reverse" ? "active" : ""}
      onClick={() => setActiveDirection("Reverse")}
    >
      Reverse
    </button>
  </div>
);

const SortableTestPointItem = ({
  point,
  isFocused,
  isSelected,
  isComplete,
  isCurrentlyExecuting,
  areControlsDisabled,
  onFocus,
  onToggle,
  onClearReadings,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: point.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasReadingsForward = onClearReadings.hasAnyReadings(point.forward);
  const hasReadingsReverse = onClearReadings.hasAnyReadings(point.reverse);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`test-point-item-selectable ${isFocused ? "active" : ""} ${
        isComplete ? "completed" : ""
      } ${isDragging ? "dragging" : ""}`}
      onClick={() => onFocus(point)}
      {...attributes}
    >
      <div
        className="drag-handle"
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <FaGripVertical />
      </div>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation();
          onToggle(point.key);
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={areControlsDisabled}
        className="tp-checkbox"
      />
      <div className="tp-label">
        <span className="test-point-name">
          {point.current}A @ {onClearReadings.formatFrequency(point.frequency)}
        </span>
        <div style={{ display: "flex", alignItems: "center" }}>
          {hasReadingsForward && (
            <button
              title="Clear Forward Readings"
              className="clear-readings-button"
              onClick={(e) => {
                e.stopPropagation();
                onClearReadings.prompt("Forward", point);
              }}
            >
              <FaEraser />
            </button>
          )}
          {hasReadingsReverse && (
            <button
              title="Clear Reverse Readings"
              className="clear-readings-button"
              onClick={(e) => {
                e.stopPropagation();
                onClearReadings.prompt("Reverse", point);
              }}
            >
              <FaEraser />
            </button>
          )}
          {/* Use the new prop for the status indicator */}
          {isCurrentlyExecuting && <span className="status-indicator"></span>}
          {/* Hide the checkmark if the point is running */}
          {isComplete && !isCurrentlyExecuting && (
            <span className="status-icon">✓</span>
          )}
        </div>
      </div>
    </div>
  );
};

function Calibration({ showNotification }) {
  const {
    selectedSessionId,
    liveReadings,
    tiLiveReadings,
    initialLiveReadings,
    discoveredInstruments,
    stdInstrumentAddress,
    stdReaderModel,
    tiInstrumentAddress,
    tiReaderModel,
    acSourceAddress,
    dcSourceAddress,
    isCollecting,
    collectionProgress,
    startReadingCollection,
    stopReadingCollection,
    activeCollectionDetails,
    readingWsState,
    collectionStatus,
    switchDriverAddress,
    clearLiveReadings,
    amplifierAddress,
    lastMessage,
    sendWsCommand,
    stabilizationStatus,
    timerState,
    bulkRunProgress,
    focusedTPKey,
  } = useInstruments();
  const { theme } = useTheme();

  const [activeTab, setActiveTab] = useState("settings");
  const [tpData, setTPData] = useState({ test_points: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [calibrationConfigurations, setCalibrationConfigurations] = useState(
    {}
  );
  const [calibrationSettings, setCalibrationSettings] = useState({
    initial_warm_up_time: 0,
    num_samples: 8,
    settling_time: 5,
    stability_window: 5,
    stability_threshold_ppm: 10,
    stability_max_attempts: 50,
  });
  const [correctionInputs, setCorrectionInputs] = useState({
    eta_std: "",
    eta_ti: "",
    delta_std: "",
    delta_ti: "",
    delta_std_known: "",
  });
  const [averagedPpmDifference, setAveragedPpmDifference] = useState(null);

  const [focusedTP, setFocusedTP] = useState(null);
  const [selectedTPs, setSelectedTPs] = useState(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  const [orderedTestPoints, setOrderedTestPoints] = useState([]);

  const [activeDirection, setActiveDirection] = useState("Forward");
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
  const [normalizeData, setNormalizeData] = useState({});
  const [tvcCorrections, setTVCCorrections] = useState({});
  const collectionPromise = useRef(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerInterval = useRef(null);
  const [clearConfirmationModal, setClearConfirmationModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const uniqueTestPoints = useMemo(() => {
    if (!tpData?.test_points) return [];
    const pointMap = new Map();
    tpData.test_points.forEach((point) => {
      const key = `${point.current}-${point.frequency}`;
      if (!pointMap.has(key))
        pointMap.set(key, {
          key,
          current: point.current,
          frequency: point.frequency,
          forward: null,
          reverse: null,
        });
      const entry = pointMap.get(key);
      if (point.direction === "Forward") entry.forward = point;
      else if (point.direction === "Reverse") entry.reverse = point;
    });
    return Array.from(pointMap.values());
  }, [tpData]);

  useEffect(() => {
    const newPointsMap = new Map(uniqueTestPoints.map((p) => [p.key, p]));

    setOrderedTestPoints((prevOrderedPoints) => {
      if (prevOrderedPoints.length === 0) {
        return uniqueTestPoints;
      }

      const updatedAndOrderedPoints = prevOrderedPoints
        .map((oldPoint) => newPointsMap.get(oldPoint.key))
        .filter(Boolean);

      const existingKeys = new Set(updatedAndOrderedPoints.map((p) => p.key));
      const newPointsToAdd = uniqueTestPoints.filter(
        (p) => !existingKeys.has(p.key)
      );

      return [...updatedAndOrderedPoints, ...newPointsToAdd];
    });
  }, [uniqueTestPoints]);

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedTestPoints((items) => {
        const oldIndex = items.findIndex((item) => item.key === active.id);
        const newIndex = items.findIndex((item) => item.key === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  useEffect(() => {
    if (timerState.isActive) {
      setCountdown(Math.ceil(timerState.duration));

      if (timerInterval.current) clearInterval(timerInterval.current);

      timerInterval.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerInterval.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerInterval.current) clearInterval(timerInterval.current);
      setCountdown(0);
    }

    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [timerState.isActive, timerState.duration]);

  useEffect(() => {
    if (focusedTPKey) {
      const pointToFocus = uniqueTestPoints.find((p) => p.key === focusedTPKey);
      if (pointToFocus) {
        setFocusedTP(pointToFocus);
      }
    }
  }, [focusedTPKey, uniqueTestPoints]);

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

  const fetchCorrections = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/correction/`);
      setNormalizeData(normalizeCorrectionData(response.data));
    } catch (error) {
      showNotification(
        "Could not fetch correction data from the database.",
        "warning"
      );
    }
  }, [showNotification]);

  useEffect(() => {
    fetchCorrections();
  }, [fetchCorrections]);

  useEffect(() => {
    if (collectionStatus === "collection_stopped") {
      showNotification("Reading collection stopped by user.", "warning");
    }
  }, [collectionStatus, showNotification]);

  const getInstrumentIdentityByAddress = (address, model) => {
    if (!address) return "Not Assigned";
    if (model) return `${model} (${address})`;
    const instrument = discoveredInstruments.find(
      (inst) => inst.address === address
    );
    return instrument
      ? `${instrument.identity} (${instrument.address})`
      : address;
  };

  const refreshTestPointList = useCallback(async () => {
    if (!selectedSessionId) return;
    try {
      const [tpResponse, infoResponse] = await Promise.all([
        axios.get(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`
        ),
        axios.get(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`
        ),
      ]);
      setTPData(tpResponse.data || { test_points: [] });
      setCalibrationConfigurations(infoResponse.data.configurations || {});
      setTVCCorrections(infoResponse.data.tvc_corrections || {});
    } catch (error) {
      showNotification("Could not refresh test point list.", "error");
    }
  }, [selectedSessionId, showNotification]);

  useEffect(() => {
    if (!isCollecting && !isBulkRunning) refreshTestPointList();
  }, [isCollecting, isBulkRunning, refreshTestPointList]);

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

  const hasAnyReadings = useCallback((point) => {
    if (!point?.readings) return false;
    const readingKeys = [
      "std_ac_open_readings",
      "std_dc_pos_readings",
      "std_dc_neg_readings",
      "std_ac_close_readings",
      "ti_ac_open_readings",
      "ti_dc_pos_readings",
      "ti_dc_neg_readings",
      "ti_ac_close_readings",
    ];
    return readingKeys.some((key) => point.readings[key]?.length > 0);
  }, []);

  const allForwardPointsComplete = useMemo(() => {
    if (uniqueTestPoints.length === 0) return false;
    return uniqueTestPoints.every(
      (p) => p.forward && hasAllReadings(p.forward)
    );
  }, [uniqueTestPoints, hasAllReadings]);

  useEffect(() => {
    if (focusedTP && uniqueTestPoints.length > 0) {
      const updatedFocusedTP = uniqueTestPoints.find(
        (p) => p.key === focusedTP.key
      );
      if (updatedFocusedTP) setFocusedTP(updatedFocusedTP);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueTestPoints]);

  useEffect(() => {
    if (selectedSessionId) {
      setIsLoading(true);
      refreshTestPointList().finally(() => setIsLoading(false));
    } else {
      setTPData({ test_points: [] });
      setCalibrationConfigurations({});
      setFocusedTP(null);
      setSelectedTPs(new Set());
      setIsLoading(false);
    }
  }, [selectedSessionId, refreshTestPointList]);

  const getShuntCorrection = useCallback(() => {
    if (focusedTP && calibrationConfigurations.ac_shunt_range) {
      const range = normalizeKey(calibrationConfigurations.ac_shunt_range);
      const current = normalizeKey(focusedTP.current);
      const frequency = normalizeKey(focusedTP.frequency);
      const correctionValue = normalizeData[range]?.[current]?.[frequency];
      if (correctionValue === undefined || correctionValue === null) {
        return null;
      }
      return correctionValue;
    }
    return null;
  }, [focusedTP, calibrationConfigurations, normalizeData]);

  const getTVCCorrection = useCallback(() => {
    const corrections = [];
    if (!focusedTP) return [null, null];

    const types = ["Standard", "Test"];

    for (const typeKey of types) {
      if (
        tvcCorrections &&
        tvcCorrections[typeKey] &&
        Array.isArray(tvcCorrections[typeKey].measurements)
      ) {
        const foundMeasurement = tvcCorrections[typeKey].measurements.find(
          (measurement) => measurement.frequency === focusedTP.frequency
        );

        if (foundMeasurement) {
          corrections.push(foundMeasurement.ac_dc_difference);
        } else {
          console.warn(
            `Frequency ${focusedTP.frequency} not found in measurements for type ${typeKey}.`
          );
          corrections.push(null);
        }
      } else {
        console.error(
          `Invalid or missing measurements data for type: ${typeKey}.`
        );
        corrections.push(null);
      }
    }
    return corrections;
  }, [focusedTP, tvcCorrections]);

  useEffect(() => {
    const formatReadingsForChart = (readingsArray) => {
      if (!readingsArray) return [];
      return readingsArray.map((point, index) => ({
        x: index + 1,
        y: typeof point === "object" ? point.value : point,
        t:
          typeof point === "object" && point.timestamp
            ? new Date(point.timestamp * 1000)
            : null,
      }));
    };
    setHistoricalReadings(initialLiveReadings);
    setTiHistoricalReadings(initialLiveReadings);

    if (focusedTP) {
      const pointForDirection =
        activeDirection === "Forward" ? focusedTP.forward : focusedTP.reverse;
      if (pointForDirection) {
        const defaultSettings = {
          initial_warm_up_time: 0,
          num_samples: 8,
          settling_time: 5,
          nplc: 20,
          stability_window: 5,
          stability_threshold_ppm: 10,
          stability_max_attempts: 50,
        };
        if (
          pointForDirection.settings &&
          Object.keys(pointForDirection.settings).length > 0
        ) {
          setCalibrationSettings({
            ...defaultSettings,
            ...pointForDirection.settings,
          });
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
      }
    }
  }, [focusedTP, activeDirection, initialLiveReadings]);

  useEffect(() => {
    if (!focusedTP) {
      setAveragedPpmDifference(null);
      return;
    }
    const forwardResult = focusedTP.forward?.results?.delta_uut_ppm;
    const reverseResult = focusedTP.reverse?.results?.delta_uut_ppm;

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
          if (averagedPpmDifference !== averagePpmFormatted) {
            showNotification(
              `Saved Averaged δ UUT: ${averagePpmFormatted} PPM`,
              "success"
            );
            refreshTestPointList();
          }
        } catch (error) {
          showNotification("Error saving the averaged result.", "error");
        }
      };
      saveAverage();
    } else {
      setAveragedPpmDifference(null);
    }
  }, [
    focusedTP,
    selectedSessionId,
    showNotification,
    averagedPpmDifference,
    refreshTestPointList,
  ]);

  const handleCorrectionInputChange = (e) =>
    setCorrectionInputs((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));

  const performFinalCalculation = async (currentCorrectionInputs) => {
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
        (fetchedResults.std_dc_pos_avg +
          Math.abs(fetchedResults.std_dc_neg_avg)) /
        2;
      const V_ACSTD =
        (fetchedResults.std_ac_open_avg + fetchedResults.std_ac_close_avg) / 2;
      const V_DCUUT =
        (fetchedResults.ti_dc_pos_avg +
          Math.abs(fetchedResults.ti_dc_neg_avg)) /
        2;
      const V_ACUUT =
        (fetchedResults.ti_ac_open_avg + fetchedResults.ti_ac_close_avg) / 2;
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

      await refreshTestPointList();
      setIsCorrectionModalOpen(false);
    } catch (error) {
      showNotification("Error saving results.", "error");
      console.error(
        "Error saving calculation results:",
        error.response ? error.response.data : error.message
      );
    }
  };

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
    const tvcCorrection = getTVCCorrection();
    const stdTVC = tvcCorrection[0];
    const tiTVC = tvcCorrection[1];
    const shuntCorrection = getShuntCorrection();

    const updates = {};
    let hasAnyCorrection = false;
    const updatedFieldDetails = [];

    if (stdTVC !== null) {
      updates.delta_std = stdTVC;
      hasAnyCorrection = true;
      updatedFieldDetails.push(`Standard TVC (${stdTVC})`);
    }
    if (tiTVC !== null) {
      updates.delta_ti = tiTVC;
      hasAnyCorrection = true;
      updatedFieldDetails.push(`Test TVC (${tiTVC})`);
    }
    if (shuntCorrection !== null) {
      updates.delta_std_known = shuntCorrection;
      hasAnyCorrection = true;
      updatedFieldDetails.push(`Shunt correction (${shuntCorrection})`);
    }

    if (!hasAnyCorrection) {
      showNotification(
        "No correction found for the selected test point parameters.",
        "info"
      );
    } else {
      setCorrectionInputs((prev) => ({ ...prev, ...updates }));
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
          await refreshTestPointList();
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
        // 'single'
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
        stability_params: {
          enabled: true,
          window: parseInt(runSettings.stability_window, 10),
          threshold_ppm: parseFloat(runSettings.stability_threshold_ppm),
          max_attempts: parseInt(runSettings.stability_max_attempts, 10),
        },
        test_point: {
          current: testPointToRun.current,
          frequency: testPointToRun.frequency,
          direction: activeDirection,
        },
        test_point_id: pointData.id,
        std_reader_model: stdReaderModel,
        ti_reader_model: tiReaderModel,
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
      refreshTestPointList,
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

    if (activeDirection === "Reverse" && !allForwardPointsComplete) {
      return showNotification(
        "Please complete all Forward readings before starting Reverse.",
        "error"
      );
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

      // Derive settings from the newly focused first point, falling back to existing state if needed.
      const firstPointSettings =
        firstPointInBatch?.forward?.settings ||
        firstPointInBatch?.reverse?.settings ||
        calibrationSettings;

      setIsBulkRunning(true);

      const params = {
        command: "start_full_calibration_batch",
        test_points: pointsToRunData,
        direction: activeDirection,
        // Use the synchronized settings
        num_samples: parseInt(firstPointSettings.num_samples, 10),
        settling_time: parseFloat(firstPointSettings.settling_time),
        nplc: parseFloat(firstPointSettings.nplc),
        initial_warm_up_time: parseFloat(
          firstPointSettings.initial_warm_up_time
        ),
        stability_params: {
          enabled: true,
          window: parseInt(firstPointSettings.stability_window, 10),
          threshold_ppm: parseFloat(firstPointSettings.stability_threshold_ppm),
          max_attempts: parseInt(firstPointSettings.stability_max_attempts, 10),
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
          .finally(async () => {
            setIsBulkRunning(false);
            await refreshTestPointList();
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
        // Use the synchronized settings
        initial_warm_up_time:
          parseFloat(firstPointSettings.initial_warm_up_time) || 0,
        num_samples: parseInt(firstPointSettings.num_samples, 10),
        settling_time: parseFloat(firstPointSettings.settling_time),
        nplc: parseFloat(firstPointSettings.nplc),
        stability_params: {
          enabled: true,
          window: parseInt(firstPointSettings.stability_window, 10),
          threshold_ppm: parseFloat(firstPointSettings.stability_threshold_ppm),
          max_attempts: parseInt(firstPointSettings.stability_max_attempts, 10),
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
          await refreshTestPointList();
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
      refreshTestPointList,
      uniqueTestPoints,
    ]
  );

  const handleToggleSelectAll = () => {
    if (selectedTPs.size === uniqueTestPoints.length) {
      setSelectedTPs(new Set());
    } else {
      const allPointKeys = uniqueTestPoints.map((p) => p.key);
      setSelectedTPs(new Set(allPointKeys));
    }
  };

  const handleRowFocus = (point) => {
    setFocusedTP(point);
    setActiveTab("settings");
  };

  const handleCheckboxToggle = (pointKey) => {
    const newSelected = new Set(selectedTPs);
    if (newSelected.has(pointKey)) {
      newSelected.delete(pointKey);
    } else {
      newSelected.add(pointKey);
    }
    setSelectedTPs(newSelected);
  };

  const buildChartData = (readings) => ({
    labels: [
      ...new Set(
        Object.values(readings).flatMap((arr) =>
          arr ? arr.map((point) => point.x) : []
        )
      ),
    ].sort((a, b) => a - b),
    datasets: READING_TYPES.map((type) => ({
      label: type.label,
      data: readings[type.key],
      borderColor: type.color,
      backgroundColor: type.color.replace(")", ", 0.5)").replace("rgb", "rgba"),
      tension: 0.1,
      fill: false,
    })),
  });

  const formatFrequency = useCallback((value) => {
    return (
      AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
        text: `${value}Hz`,
      }
    ).text;
  }, []);

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    if (!focusedTP || !selectedSessionId)
      return showNotification("No test point selected.", "error");
    const newSettings = {
      initial_warm_up_time:
        parseFloat(calibrationSettings.initial_warm_up_time) || 0,
      num_samples: parseInt(calibrationSettings.num_samples, 10) || 8,
      settling_time: parseFloat(calibrationSettings.settling_time) || 5,
      nplc: parseFloat(calibrationSettings.nplc) || 20,
      stability_window: parseInt(calibrationSettings.stability_window, 10) || 5,
      stability_threshold_ppm:
        parseFloat(calibrationSettings.stability_threshold_ppm) || 10,
      stability_max_attempts:
        parseInt(calibrationSettings.stability_max_attempts, 10) || 50,
    };
    let { forward, reverse } = focusedTP;
    try {
      if (!forward)
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
      if (!reverse)
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
      await axios.patch(
        `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${forward.id}/`,
        { settings: newSettings }
      );
      await axios.patch(
        `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${reverse.id}/`,
        { settings: newSettings }
      );
      showNotification("Settings saved for both directions!", "success");
      await refreshTestPointList();
      setActiveTab("readings");
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

      // 1. Define the complete settings payload for the focused point
      const fullSettingsPayload = {
        initial_warm_up_time:
          parseFloat(calibrationSettings.initial_warm_up_time) || 0,
        num_samples: parseInt(calibrationSettings.num_samples, 10) || 8,
        settling_time: parseFloat(calibrationSettings.settling_time) || 5,
        nplc: parseFloat(calibrationSettings.nplc) || 20,
        stability_window:
          parseInt(calibrationSettings.stability_window, 10) || 5,
        stability_threshold_ppm:
          parseFloat(calibrationSettings.stability_threshold_ppm) || 10,
        stability_max_attempts:
          parseInt(calibrationSettings.stability_max_attempts, 10) || 50,
      };

      const { initial_warm_up_time, ...commonSettingsPayload } = fullSettingsPayload;

      let { forward, reverse } = focusedTP;
      try {
        // 2. Ensure both forward/reverse exist for the focused point
        if (!forward) {
          forward = (
            await axios.post(
              `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`,
              { current: focusedTP.current, frequency: focusedTP.frequency, direction: "Forward" }
            )
          ).data;
        }
        if (!reverse) {
          reverse = (
            await axios.post(
              `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`,
              { current: focusedTP.current, frequency: focusedTP.frequency, direction: "Reverse" }
            )
          ).data;
        }

        // 3. Save the FULL settings payload to BOTH directions of the FOCUSED point
        await axios.patch(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${forward.id}/`,
          { settings: fullSettingsPayload }
        );
        await axios.patch(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${reverse.id}/`,
          { settings: fullSettingsPayload }
        );

        // 4. Apply only the COMMON settings to all other test points
        await axios.post(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/actions/apply-settings-to-all/`,
          {
            settings: commonSettingsPayload, // Send the payload WITHOUT the warm-up time
            focused_test_point_id: forward.id,
          }
        );
        showNotification(
          "Settings applied to all test points successfully!",
          "success"
        );
        await refreshTestPointList();
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

  const handleClearReadings = useCallback(
    async (testPointId, direction) => {
      try {
        await axios.post(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${testPointId}/clear_readings/`
        );
        showNotification(
          `Readings for the ${direction} direction have been cleared.`,
          "success"
        );
        refreshTestPointList();
      } catch (error) {
        showNotification(
          "Failed to clear readings. Please try again.",
          "error"
        );
        console.error("Error clearing readings:", error);
      } finally {
        setClearConfirmationModal({ isOpen: false });
      }
    },
    [selectedSessionId, showNotification, refreshTestPointList]
  );

  const promptClearReadings = useCallback(
    (direction, point) => {
      const pointForDirection =
        direction === "Forward" ? point.forward : point.reverse;
      if (!pointForDirection) return;

      setClearConfirmationModal({
        isOpen: true,
        title: "Confirm Clear Readings",
        message: `Are you sure you want to permanently delete all readings for ${
          point.current
        }A @ ${formatFrequency(
          point.frequency
        )} in the ${direction} direction?`,
        onConfirm: () => handleClearReadings(pointForDirection.id, direction),
        onCancel: () => setClearConfirmationModal({ isOpen: false }),
      });
    },
    [handleClearReadings, formatFrequency]
  );

  const pointForDirection = focusedTP
    ? activeDirection === "Forward"
      ? focusedTP.forward
      : focusedTP.reverse
    : null;
  const isCurrentTPActive =
    isCollecting && activeCollectionDetails?.tpId === pointForDirection?.id;

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
  const is34420AInUse =
    stdReaderModel === "34420A" || tiReaderModel === "34420A";

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
        label: `Take ${label} Readings (Focused)`,
        onClick: () => handleCollectReadingsRequest(key),
      }));
    }
  }, [
    selectedTPs.size,
    handleCollectReadingsRequest,
    handleRunSingleStageOnSelected,
  ]);

  return (
    <>
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
        onCancel={confirmationModal.onCancel}
        confirmText="Ready"
      />
      <ConfirmationModal
        isOpen={clearConfirmationModal.isOpen}
        title={clearConfirmationModal.title}
        message={clearConfirmationModal.message}
        onConfirm={clearConfirmationModal.onConfirm}
        onCancel={clearConfirmationModal.onCancel}
        confirmText="Clear Readings"
      />
      <ConfirmationModal
        isOpen={amplifierModal.isOpen}
        title="Confirm Amplifier Range"
        message={`Please ensure the 8100 Amplifier range is set to ${amplifierModal.range} A.\n\nIncorrect range may damage the equipment. Once verified, set 8100 to operate.`}
        onConfirm={amplifierModal.onConfirm}
        onCancel={amplifierModal.onCancel}
        confirmText="Range is Set"
      />
      {!selectedSessionId ? (
        <div className="content-area form-section-warning">
          <p>Please select a session to run a calibration.</p>
        </div>
      ) : isLoading ? (
        <div className="content-area">
          <p>Loading session data...</p>
        </div>
      ) : uniqueTestPoints.length === 0 ? (
        <div className="content-area form-section-warning">
          <p>
            This session has no test points. Please go to the "Test Point
            Editor" to generate them.
          </p>
        </div>
      ) : (
        <>
          <div className="content-area">
            <h2>Configuration Summary</h2>
            <div className="calibration-summary-bar">
              <div className="summary-item">
                <strong>AC Shunt Range:</strong>
                <span>
                  {calibrationConfigurations.ac_shunt_range || "N/A"} A
                </span>
              </div>
              <div className="summary-item">
                <strong>Amplifier Range:</strong>
                <span>
                  {calibrationConfigurations.amplifier_range || "N/A"} A
                </span>
              </div>
              <div className="summary-item">
                <strong>Input Current:</strong>
                <span>
                  {uniqueTestPoints?.[0]?.current
                    ? `${uniqueTestPoints[0].current} A`
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
          <div className="content-area">
            <h2>Sources & Readers</h2>
            <div
              className="calibration-summary-bar"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
              }}
            >
              <div className="summary-item" style={{ textAlign: "left" }}>
                <strong>Standard Instrument Reader:</strong>
                <span style={{ marginLeft: "8px" }}>
                  {getInstrumentIdentityByAddress(
                    stdInstrumentAddress,
                    stdReaderModel
                  )}
                </span>
              </div>
              <div className="summary-item" style={{ textAlign: "left" }}>
                <strong>Test Instrument Reader:</strong>
                <span style={{ marginLeft: "8px" }}>
                  {getInstrumentIdentityByAddress(
                    tiInstrumentAddress,
                    tiReaderModel
                  )}
                </span>
              </div>
              <div className="summary-item" style={{ textAlign: "left" }}>
                <strong>AC Source:</strong>
                <span style={{ marginLeft: "8px" }}>
                  {getInstrumentIdentityByAddress(acSourceAddress)}
                </span>
              </div>
              <div className="summary-item" style={{ textAlign: "left" }}>
                <strong>DC Source:</strong>
                <span style={{ marginLeft: "8px" }}>
                  {getInstrumentIdentityByAddress(dcSourceAddress)}
                </span>
              </div>
              {switchDriverAddress && <SwitchControl />}
            </div>
          </div>
          <div className="content-area">
            <div className="calibration-workflow-container">
              <div className="test-point-sidebar">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h4>Test Points</h4>
                  <button
                    onClick={handleToggleSelectAll}
                    className="button button-small button-secondary"
                    disabled={isBulkRunning || isCollecting}
                  >
                    {selectedTPs.size === uniqueTestPoints.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={orderedTestPoints.map((p) => p.key)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="test-point-list">
                      {orderedTestPoints.map((point) => {
                        const isFocused = focusedTP?.key === point.key;
                        const isSelected = selectedTPs.has(point.key);
                        const isComplete =
                          hasAllReadings(point.forward) &&
                          hasAllReadings(point.reverse);

                        // This variable is now used for the 'isCurrentlyExecuting' prop
                        const isPointCurrentlyExecuting =
                          (isCollecting &&
                            activeCollectionDetails?.tpId ===
                              (activeDirection === "Forward"
                                ? point.forward?.id
                                : point.reverse?.id)) ||
                          (isBulkRunning &&
                            bulkRunProgress.pointKey === point.key);

                        // This variable is now used for the 'areControlsDisabled' prop
                        const areControlsDisabled =
                          isBulkRunning || isCollecting;

                        return (
                          <SortableTestPointItem
                            key={point.key}
                            point={point}
                            isFocused={isFocused}
                            isSelected={isSelected}
                            isComplete={isComplete}
                            isCurrentlyExecuting={isPointCurrentlyExecuting} // Pass the specific status
                            areControlsDisabled={areControlsDisabled} // Pass the global disabled status
                            onFocus={handleRowFocus}
                            onToggle={handleCheckboxToggle}
                            onClearReadings={{
                              prompt: promptClearReadings,
                              hasAnyReadings: hasAnyReadings,
                              formatFrequency: formatFrequency,
                            }}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
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
                    <DirectionToggle
                      activeDirection={activeDirection}
                      setActiveDirection={setActiveDirection}
                    />
                    <SubNav activeTab={activeTab} setActiveTab={setActiveTab} />
                    <div className="sub-tab-content">
                      {activeTab === "settings" && (
                        <form onSubmit={handleSettingsSubmit}>
                          <h4>
                            Calibration Settings for {focusedTP.current}A @{" "}
                            {formatFrequency(focusedTP.frequency)}
                          </h4>
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
                            {is34420AInUse && (
                              <div className="form-section">
                                <label htmlFor="nplc">
                                  34420A Integration (NPLC)
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
                            {/* Stability Settings */}
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
                          </div>
                          <div
                            className="form-section-action"
                            style={{ display: "flex", gap: "10px" }}
                          >
                            <button
                              type="submit"
                              className="button button-primary"
                            >
                              Save for This Point
                            </button>
                            <button
                              type="button"
                              onClick={handleApplySettingsToAll}
                              className="button button-secondary"
                            >
                              Apply to All Points
                            </button>
                          </div>
                        </form>
                      )}
                      {activeTab === "readings" && (
                        <>
                          <div className="form-section">
                            <div className="readings-grid">
                              {isCollecting || isBulkRunning ? (
                                <div className="status-bar">
                                  <div className="status-bar-content">
                                    {isBulkRunning && (
                                      <div
                                        className="status-section"
                                        style={{ flexGrow: 1.5 }}
                                      >
                                        <span className="status-label">
                                          Batch Progress
                                        </span>
                                        <span className="status-value">{`Point ${bulkRunProgress.current} of ${bulkRunProgress.total}`}</span>
                                        <span className="status-detail">{`${
                                          focusedTP?.current
                                        }A @ ${formatFrequency(
                                          focusedTP?.frequency
                                        )}`}</span>
                                      </div>
                                    )}
                                    <div className="status-section">
                                      <span className="status-label">
                                        {timerState.isActive ? (
                                          <>
                                            <FaHourglassHalf />{" "}
                                            {timerState.label}
                                          </>
                                        ) : stabilizationStatus ? (
                                          <>
                                            <FaCrosshairs /> Stability
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
                                        {stabilizationStatus ||
                                          `${collectionProgress.count} / ${collectionProgress.total} Samples`}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="status-bar-progress-container">
                                    <div
                                      className="status-bar-progress"
                                      style={{
                                        width: `${
                                          (collectionProgress.count /
                                            collectionProgress.total) *
                                          100
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
                                </div>
                              ) : (
                                <ActionDropdownButton
                                  primaryText={
                                    selectedTPs.size > 0
                                      ? `Run ${selectedTPs.size} Selected Point(s) (Full)`
                                      : "Run Measurement(s)"
                                  }
                                  primaryIcon={<FaPlay />}
                                  onPrimaryClick={handleRunSelectedPoints}
                                  disabled={
                                    !focusedTP ||
                                    readingWsState !== WebSocket.OPEN ||
                                    selectedTPs.size === 0
                                  }
                                  options={dropdownOptions}
                                />
                              )}
                            </div>
                          </div>

                          {showStdChart && (
                            <div className="chart-container">
                              <CalibrationChart
                                title="Standard Instrument Readings"
                                chartData={stdChartData}
                                chartType="line"
                                theme={theme}
                                onHover={setHoveredIndex}
                                syncedHoverIndex={hoveredIndex}
                                comparisonData={tiChartData.datasets}
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
                                chartType="line"
                                theme={theme}
                                onHover={setHoveredIndex}
                                syncedHoverIndex={hoveredIndex}
                                comparisonData={stdChartData.datasets}
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
                              disabled={isCollecting || !isCalculationReady}
                              className="button button-success button-icon"
                              style={{
                                fontSize: "1.1rem",
                                padding: "12px 24px",
                              }}
                            >
                              <FaCalculator /> Calculate AC-DC Difference
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
                            {focusedTP.forward?.results?.delta_uut_ppm && (
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

                            {focusedTP.reverse?.results?.delta_uut_ppm && (
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
