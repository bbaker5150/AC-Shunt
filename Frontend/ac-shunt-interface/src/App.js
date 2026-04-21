// src/App.js
import React, { useState, useCallback, useEffect, useMemo } from "react";
import axios from "axios";
import SessionSetup from "./components/session/SessionSetup";
import InstrumentStatusTab from "./components/session/InstrumentStatusTab";
import Calibration from "./components/calibration/Calibration";
import CalibrationResults from "./components/calibration/CalibrationResults";
// import UncertaintyAnalysis from "./components/analysis/UncertaintyAnalysis";
import TestPointSidebar from "./components/shared/TestPointSidebar";
import ConfigurationModal from "./components/shared/ConfigurationModal";
import CorrectionsModal from "./components/calibration/CorrectionsModal";
import {
  InstrumentContextProvider,
  useInstruments,
} from "./contexts/InstrumentContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import "bootstrap/dist/css/bootstrap.min.css";
import { FaInfoCircle, FaTimes, FaSun, FaMoon } from "react-icons/fa";
import "./App.css";
import { arrayMove } from "@dnd-kit/sortable";
import { AVAILABLE_FREQUENCIES, API_BASE_URL } from "./constants/constants";

// Helper functions for corrections (getShuntCorrectionForPoint, getTVCCorrectionForPoint)
const getShuntCorrectionForPoint = (point, shuntRangeInAmps, shuntsData) => {
  if (!point || !shuntRangeInAmps || !shuntsData || shuntsData.length === 0)
    return { correction: "N/A", uncertainty: "N/A" };
  const pointCurrent = parseFloat(point.current);
  const epsilon = 1e-9;
  const shunt = shuntsData.find(
    (s) =>
      Math.abs(parseFloat(s.range) - shuntRangeInAmps) < epsilon &&
      Math.abs(parseFloat(s.current) - pointCurrent) < epsilon
  );
  if (shunt && shunt.corrections) {
    const correction = shunt.corrections.find(
      (c) => parseFloat(c.frequency) === point.frequency
    );
    return correction
      ? {
        correction: correction.correction,
        uncertainty: correction.uncertainty,
      }
      : { correction: "N/A", uncertainty: "N/A" };
  }
  return { correction: "N/A", uncertainty: "N/A" };
};
const getTVCCorrectionForPoint = (point, tvcSn, tvcsData) => {
  if (!point || !tvcsData || tvcsData.length === 0 || !tvcSn) return null;
  const tvc = tvcsData.find((t) => String(t.serial_number) === String(tvcSn));
  if (!tvc || !Array.isArray(tvc.corrections) || tvc.corrections.length === 0)
    return null;
  const targetFreq = point.frequency;
  const sorted = [...tvc.corrections].sort((a, b) => a.frequency - b.frequency);
  const exactMatch = sorted.find((m) => m.frequency === targetFreq);
  if (exactMatch) return exactMatch.ac_dc_difference;
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
    return d1 + ((targetFreq - f1) * (d2 - d1)) / (f2 - f1);
  }
  return null;
};

// CorrectionsDetailsModal Component
const CorrectionsDetailsModal = ({
  isOpen,
  point,
  onClose,
  tooltipData,
  standardTvcSn,
  testTvcSn,
}) => {
  if (!isOpen || !point) return null;

  const shuntCorr = getShuntCorrectionForPoint(
    point,
    tooltipData.shuntRangeInAmps,
    tooltipData.shuntsData
  );
  const stdTvcCorr = getTVCCorrectionForPoint(
    point,
    standardTvcSn,
    tooltipData.tvcsData
  );
  const tiTvcCorr = getTVCCorrectionForPoint(
    point,
    testTvcSn,
    tooltipData.tvcsData
  );

  const formatFrequency = (value) =>
    (
      AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
        text: `${value}Hz`,
      }
    ).text;

  const formatShunt = (val) =>
    val !== "N/A" && val !== null && val !== undefined
      ? `${val} PPM`
      : "N/A";
  const formatTvc = (val) =>
    val !== null && val !== undefined ? `${val.toFixed(2)} PPM` : "N/A";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="point-corrections-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="point-corrections-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="point-corrections-header">
          <div className="point-corrections-header-text">
            <span className="point-corrections-eyebrow">Test point</span>
            <h3
              id="point-corrections-title"
              className="point-corrections-title"
            >
              {point.current} A
              <span className="point-corrections-title-sep">·</span>
              {formatFrequency(point.frequency)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cal-results-excel-icon-btn"
            title="Close"
            aria-label="Close"
          >
            <FaTimes aria-hidden />
          </button>
        </header>

        <div className="point-corrections-body">
          <div className="point-corrections-row">
            <span className="point-corrections-label">Shunt correction</span>
            <span className="point-corrections-value">
              {formatShunt(shuntCorr.correction)}
            </span>
          </div>
          <div className="point-corrections-row">
            <span className="point-corrections-label">STD TVC correction</span>
            <span className="point-corrections-value">
              {formatTvc(stdTvcCorr)}
            </span>
          </div>
          <div className="point-corrections-row">
            <span className="point-corrections-label">TI TVC correction</span>
            <span className="point-corrections-value">
              {formatTvc(tiTvcCorr)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Confirmation modal — cohesive with the view-corrections / point-corrections
// modal design (eyebrow + title header, icon-only close, single action pinned
// at the bottom-right). The destructive variant gets a red action button.
const ConfirmationModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  confirmButtonClass = "",
}) => {
  if (!isOpen) return null;
  const isDanger = /danger/.test(confirmButtonClass);
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="confirm-modal-header">
          <div className="confirm-modal-header-text">
            <span className="confirm-modal-eyebrow">
              {isDanger ? "Destructive action" : "Confirm"}
            </span>
            <h3 id="confirm-modal-title" className="confirm-modal-title">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="cal-results-excel-icon-btn"
            title="Close"
            aria-label="Close"
          >
            <FaTimes aria-hidden />
          </button>
        </header>

        <div className="confirm-modal-body">
          <p className="confirm-modal-message">{message}</p>
        </div>

        <footer className="confirm-modal-footer">
          <button
            type="button"
            onClick={onConfirm}
            className={`confirm-modal-action${
              isDanger ? " confirm-modal-action--danger" : ""
            }`}
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
};
const Notification = ({ message, type, onDismiss }) => {
  if (!message) return null;
  return (
    <div className={`notification-bar notification-${type}`}>
      <span>{message}</span>
      <button onClick={onDismiss} className="dismiss">
        &times;
      </button>
    </div>
  );
};

function AppContent() {
  const [activeTab, setActiveTab] = useState("sessionSetup");
  const [sessionsList, setSessionsList] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [notification, setNotification] = useState({
    message: "",
    type: "info",
    key: 0,
  });
  const { theme, toggleTheme } = useTheme();

  const {
    selectedSessionName,
    selectedSessionId,
    isCollecting,
    activeCollectionDetails,
    bulkRunProgress,
    standardTvcSn,
    testTvcSn,
    setStandardInstrumentSerial,
    setTestInstrumentSerial,
    setStandardTvcSn,
    setTestTvcSn,
  } = useInstruments();

  const isBulkRunning = bulkRunProgress && bulkRunProgress.total > 0;

  const [tpData, setTPData] = useState({ points: [] });
  const [orderedTestPoints, setOrderedTestPoints] = useState([]);
  const [focusedTestPoint, setFocusedTestPoint] = useState(null);
  const [selectedTPs, setSelectedTPs] = useState(new Set());
  const [shuntsData, setShuntsData] = useState([]);
  const [tvcsData, setTvcsData] = useState([]);
  const [sessionInfo, setSessionInfo] = useState({});
  const [calibrationConfigs, setCalibrationConfigs] = useState({});
  const [clearConfirmationModal, setClearConfirmationModal] = useState({
    isOpen: false,
  });
  const [deleteConfirmationModal, setDeleteConfirmationModal] = useState({
    isOpen: false,
  });
  const [activeDirection, setActiveDirection] = useState("Forward");
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isCorrectionsModalOpen, setIsCorrectionsModalOpen] = useState(false);
  const [pointCorrectionsModal, setPointCorrectionsModal] = useState({
    isOpen: false,
    point: null,
  });
  const [dbInfo, setDbInfo] = useState(null);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/system_info/`);
        setDbInfo(response.data);
      } catch (error) {
        console.error("Failed to fetch system info.", error);
      }
    };

    fetchSystemInfo();
  }, []);

  useEffect(() => {
    setSelectedTPs(new Set());
  }, [selectedSessionId]);

  const showNotification = useCallback(
    (message, type = "info", duration = 4000) => {
      const newKey = Date.now();
      setNotification({ message, type, key: newKey });
      if (duration > 0) {
        setTimeout(() => {
          setNotification((prev) =>
            prev.key === newKey ? { message: "", type: "info", key: 0 } : prev
          );
        }, duration);
      }
    },
    []
  );

  const fetchSessionsList = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/calibration_sessions/`);
      setSessionsList(response.data || []);
    } catch (error) {
      showNotification('Failed to fetch sessions list.', 'error');
    } finally {
      setIsLoadingSessions(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchSessionsList();
  }, [fetchSessionsList]);

  const fetchSessionData = useCallback(async () => {
    if (!selectedSessionId) {
      setTPData({ points: [] });
      setShuntsData([]);
      setTvcsData([]);
      setSessionInfo({});
      setCalibrationConfigs({});
      setFocusedTestPoint(null);
      return;
    }
    try {
      const [tpRes, shuntsRes, tvcsRes, sessionRes, infoRes] =
        await Promise.all([
          axios.get(
            `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/`
          ),
          axios.get(`${API_BASE_URL}/shunts/`),
          axios.get(`${API_BASE_URL}/tvcs/`),
          axios.get(
            `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`
          ),
          axios.get(
            `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`
          ),
        ]);
      setTPData({ points: tpRes.data?.test_points || [] });
      setShuntsData(shuntsRes.data || []);
      setTvcsData(tvcsRes.data || []);

      const sessionData = sessionRes.data || {};
      setSessionInfo(sessionData);

      setStandardInstrumentSerial(sessionData.standard_instrument_serial);
      setTestInstrumentSerial(sessionData.test_instrument_serial);
      setStandardTvcSn(sessionData.standard_tvc_serial);
      setTestTvcSn(sessionData.test_tvc_serial);

      setCalibrationConfigs(infoRes.data.configurations || {});
      fetchSessionsList();
    } catch (error) {
      showNotification("Failed to load complete session data.", "error");
    }
  }, [
    selectedSessionId,
    showNotification,
    setStandardInstrumentSerial,
    setTestInstrumentSerial,
    setStandardTvcSn,
    setTestTvcSn,
    fetchSessionsList,
  ]);

  useEffect(() => {
    fetchSessionData();
  }, [fetchSessionData]);

  const uniqueTestPoints = useMemo(() => {
    if (!tpData?.points) return [];
    const pointMap = new Map();
    tpData.points.forEach((point) => {
      const key = `${point.current}-${point.frequency}`;
      if (!pointMap.has(key)) {
        pointMap.set(key, {
          key,
          current: point.current,
          frequency: point.frequency,
          forward: null,
          reverse: null,
        });
      }
      const entry = pointMap.get(key);
      if (point.direction === "Forward") entry.forward = point;
      else if (point.direction === "Reverse") entry.reverse = point;
    });
    return Array.from(pointMap.values());
  }, [tpData]);

  useEffect(() => {
    const newPointsMap = new Map(uniqueTestPoints.map((p) => [p.key, p]));

    setOrderedTestPoints((prevOrderedPoints) => {
      if (
        (!prevOrderedPoints || prevOrderedPoints.length === 0) &&
        uniqueTestPoints.length > 0
      ) {
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

    setFocusedTestPoint((prevFocusPoint) => {
      if (!prevFocusPoint) {
        return null;
      }
      const updatedFocusPoint = newPointsMap.get(prevFocusPoint.key);
      return updatedFocusPoint || null;
    });
  }, [uniqueTestPoints]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedTestPoints((items) => {
        const oldIndex = items.findIndex((item) => item.key === active.id);
        const newIndex = items.findIndex((item) => item.key === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        const orderedKeys = newOrder.map((item) => item.key);
        axios
          .post(
            `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/actions/update-order/`,
            { ordered_keys: orderedKeys }
          )
          .catch((error) => {
            showNotification(
              "Could not save the new test point order.",
              "error"
            );
          });
        return newOrder;
      });
    }
  };

  const hasAnyReadings = useCallback((point) => {
    if (!point?.readings) return false;
    return Object.values(point.readings).some(
      (arr) => Array.isArray(arr) && arr.length > 0
    );
  }, []);

  const performDeleteTestPoint = async (pointsToDelete) => {
    if (!pointsToDelete || pointsToDelete.length === 0) return;
    try {
      const deletePromises = pointsToDelete.map((p) =>
        axios.delete(
          `${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/${p.id}/`
        )
      );
      await Promise.all(deletePromises);
      showNotification(
        pointsToDelete.length > 1
          ? "Selected test points deleted."
          : "Test point deleted.",
        "success"
      );
      await fetchSessionData();
      setSelectedTPs(new Set());
    } catch (error) {
      showNotification(
        "An error occurred while deleting test points.",
        "error"
      );
    }
    setDeleteConfirmationModal({ isOpen: false });
  };

  const formatFrequency = useCallback((value) => {
    return (
      AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
        text: `${value}Hz`,
      }
    ).text;
  }, []);

  const promptDeleteTestPoint = (uniquePoint) => {
    const pointsToDelete = [uniquePoint.forward, uniquePoint.reverse].filter(
      Boolean
    );
    const hasReadingsCheck = pointsToDelete.some(hasAnyReadings);

    const message = hasReadingsCheck
      ? `This test point has existing readings. Deleting it will permanently remove all associated data.\n\nAre you sure you want to delete ${uniquePoint.current
      }A @ ${formatFrequency(uniquePoint.frequency)}?`
      : `Are you sure you want to delete the test point for ${uniquePoint.current
      }A @ ${formatFrequency(uniquePoint.frequency)}?`;

    setDeleteConfirmationModal({
      isOpen: true,
      title: "Confirm Deletion",
      message: message,
      confirmText: "Delete",
      confirmButtonClass: "button-danger",
      onConfirm: () => performDeleteTestPoint(pointsToDelete),
      onCancel: () => setDeleteConfirmationModal({ isOpen: false }),
    });
  };

  const promptDeleteSelectedTestPoints = () => {
    if (selectedTPs.size === 0) {
      showNotification("No test points selected to delete.", "warning");
      return;
    }
    const pointsToDelete = uniqueTestPoints
      .filter((p) => selectedTPs.has(p.key))
      .flatMap((p) => [p.forward, p.reverse].filter(Boolean));

    const message = `Are you sure you want to delete the ${selectedTPs.size} selected test point(s)? This action cannot be undone.`;

    setDeleteConfirmationModal({
      isOpen: true,
      title: `Delete ${selectedTPs.size} Test Point(s)`,
      message: message,
      confirmText: `Delete ${selectedTPs.size} Point(s)`,
      confirmButtonClass: "button-danger",
      onConfirm: () => performDeleteTestPoint(pointsToDelete),
      onCancel: () => setDeleteConfirmationModal({ isOpen: false }),
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
        await fetchSessionData();
      } catch (error) {
        showNotification("Failed to clear readings.", "error");
      } finally {
        setClearConfirmationModal({ isOpen: false });
      }
    },
    [selectedSessionId, showNotification, fetchSessionData]
  );

  const promptClearReadings = useCallback(
    (direction, point) => {
      const pointForDirection =
        direction === "Forward" ? point.forward : point.reverse;
      if (!pointForDirection) return;
      setClearConfirmationModal({
        isOpen: true,
        title: "Confirm Clear Readings",
        message: `Are you sure you want to permanently delete all readings for ${point.current
          }A @ ${formatFrequency(
            point.frequency
          )} in the ${direction} direction?`,
        onConfirm: () => handleClearReadings(pointForDirection.id, direction),
        onCancel: () => setClearConfirmationModal({ isOpen: false }),
      });
    },
    [handleClearReadings, formatFrequency]
  );

  const handleToggleSelectAll = () => {
    if (selectedTPs.size === uniqueTestPoints.length) {
      setSelectedTPs(new Set());
    } else {
      setSelectedTPs(new Set(uniqueTestPoints.map((p) => p.key)));
    }
  };

  const handleToggleSelect = (pointKey) => {
    const newSelected = new Set(selectedTPs);
    if (newSelected.has(pointKey)) newSelected.delete(pointKey);
    else newSelected.add(pointKey);
    setSelectedTPs(newSelected);
  };

  const dismissNotification = useCallback(() => {
    setNotification({ message: "", type: "info", key: 0 });
  }, []);

  const handleViewPointCorrections = (point) => {
    setPointCorrectionsModal({ isOpen: true, point: point });
  };

  return (
    <div className="App">
      <ConfigurationModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        showNotification={showNotification}
        onUpdate={fetchSessionData}
        uniqueTestPoints={uniqueTestPoints}
        sessionInfo={sessionInfo}
        calibrationConfigs={calibrationConfigs}
        selectedSessionId={selectedSessionId}
      />
      <CorrectionsModal
        isOpen={isCorrectionsModalOpen}
        onClose={() => setIsCorrectionsModalOpen(false)}
        onUpdate={fetchSessionData}
        showNotification={showNotification}
        uniqueTestPoints={uniqueTestPoints}
      />
      <CorrectionsDetailsModal
        isOpen={pointCorrectionsModal.isOpen}
        point={pointCorrectionsModal.point}
        onClose={() => setPointCorrectionsModal({ isOpen: false, point: null })}
        tooltipData={{
          shuntsData,
          tvcsData,
          shuntRangeInAmps: calibrationConfigs?.ac_shunt_range,
        }}
        standardTvcSn={standardTvcSn}
        testTvcSn={testTvcSn}
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
        isOpen={deleteConfirmationModal.isOpen}
        title={deleteConfirmationModal.title}
        message={deleteConfirmationModal.message}
        onConfirm={deleteConfirmationModal.onConfirm}
        onCancel={deleteConfirmationModal.onCancel}
        confirmText={deleteConfirmationModal.confirmText}
        confirmButtonClass={deleteConfirmationModal.confirmButtonClass}
      />
      {notification.message && (
        <Notification
          message={notification.message}
          type={notification.type}
          onDismiss={dismissNotification}
          key={notification.key}
        />
      )}

      <header className="app-chrome">
        <div className="app-chrome-bar">
          <div className="app-chrome-brand">
            <div className="app-chrome-brand-mark" aria-hidden="true">
              <span className="app-chrome-brand-mark-glyph">Ω</span>
            </div>
            <div className="app-chrome-brand-text">
              <span className="app-chrome-brand-name">
                AC<span className="app-chrome-brand-dot">·</span>Shunt
              </span>
              <span className="app-chrome-brand-sub">
                Calibration Platform
              </span>
            </div>
          </div>

          {/* Top row right-side is intentionally empty: on Windows this is
              where the native minimize / maximize / close caption buttons
              are drawn. All interactive meta controls (session info, db,
              theme toggle) live on the nav row below to avoid a collision. */}
        </div>

        <nav className="app-chrome-nav" role="tablist" aria-label="Primary">
          <div className="app-chrome-nav-tabs">
            <button
              role="tab"
              aria-selected={activeTab === "sessionSetup"}
              onClick={() => setActiveTab("sessionSetup")}
              className={`app-chrome-tab${activeTab === "sessionSetup" ? " is-active" : ""}`}
            >
              Session
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "instrumentStatus"}
              onClick={() => setActiveTab("instrumentStatus")}
              className={`app-chrome-tab${activeTab === "instrumentStatus" ? " is-active" : ""}`}
            >
              Instruments
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "runCalibration"}
              onClick={() => setActiveTab("runCalibration")}
              className={`app-chrome-tab${activeTab === "runCalibration" ? " is-active" : ""}`}
            >
              Calibration
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "calibrationResults"}
              onClick={() => setActiveTab("calibrationResults")}
              className={`app-chrome-tab${activeTab === "calibrationResults" ? " is-active" : ""}`}
            >
              Results
            </button>
          </div>

          <div className="app-chrome-meta app-chrome-meta--nav">
            {selectedSessionName && (
              <div className="tooltip-container session-info-popover">
                <button
                  type="button"
                  className="app-chrome-meta-icon"
                  aria-label="Session details"
                >
                  <FaInfoCircle aria-hidden />
                </button>
                <div
                  className="session-info-panel"
                  role="tooltip"
                  aria-label="Session details"
                >
                  <div className="session-info-panel-header">
                    <span className="session-info-panel-eyebrow">
                      Active session
                    </span>
                    <h4 className="session-info-panel-title" title={selectedSessionName}>
                      {selectedSessionName}
                    </h4>
                  </div>

                  <div className="session-info-panel-body">
                    <div className="session-info-panel-group">
                      <span className="session-info-group-label">Test instrument</span>
                      <div className="session-info-row">
                        <span className="session-info-row-label">Model</span>
                        <span className="session-info-row-value">
                          {sessionInfo?.test_instrument_model || "—"}
                        </span>
                      </div>
                      <div className="session-info-row">
                        <span className="session-info-row-label">Serial</span>
                        <span className="session-info-row-value">
                          {sessionInfo?.test_instrument_serial || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="session-info-panel-group">
                      <span className="session-info-group-label">Standard</span>
                      <div className="session-info-row">
                        <span className="session-info-row-label">Model</span>
                        <span className="session-info-row-value">
                          {sessionInfo?.standard_instrument_model || "—"}
                        </span>
                      </div>
                      <div className="session-info-row">
                        <span className="session-info-row-label">Serial</span>
                        <span className="session-info-row-value">
                          {sessionInfo?.standard_instrument_serial || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="session-info-panel-group">
                      <span className="session-info-group-label">Environment</span>
                      <div className="session-info-row">
                        <span className="session-info-row-label">Created</span>
                        <span className="session-info-row-value">
                          {sessionInfo?.created_at
                            ? new Date(sessionInfo.created_at).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      <div className="session-info-row">
                        <span className="session-info-row-label">Temperature</span>
                        <span className="session-info-row-value">
                          {sessionInfo?.temperature
                            ? `${sessionInfo.temperature} °C`
                            : "—"}
                        </span>
                      </div>
                      <div className="session-info-row">
                        <span className="session-info-row-label">Humidity</span>
                        <span className="session-info-row-value">
                          {sessionInfo?.humidity
                            ? `${sessionInfo.humidity} %RH`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {dbInfo && (
              <div className="db-indicator-pill" title={`Data source: ${dbInfo.database_type === 'sqlite3' ? 'SQLite' : 'MSSQL'}`}>
                <span className="db-status-dot"></span>
                <span className="db-name-text">
                  {dbInfo.database_type === 'sqlite3' ? 'SQLite' : 'MSSQL'}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="app-chrome-theme-btn"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <FaSun aria-hidden /> : <FaMoon aria-hidden />}
            </button>
          </div>
        </nav>
      </header>

      <div className={"main-layout-container with-sidebar"}>
        <aside className="app-sidebar">
          <TestPointSidebar
            orderedTestPoints={orderedTestPoints}
            uniqueTestPoints={uniqueTestPoints}
            tooltipData={{
              shuntsData,
              tvcsData,
              shuntRangeInAmps: calibrationConfigs?.ac_shunt_range,
            }}
            focusedTP={focusedTestPoint}
            selectedTPs={selectedTPs}
            isBulkRunning={isBulkRunning}
            isCollecting={isCollecting}
            activeCollectionDetails={activeCollectionDetails}
            bulkRunProgress={bulkRunProgress}
            activeDirection={activeDirection}
            setActiveDirection={setActiveDirection}
            onFocus={setFocusedTestPoint}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onDragEnd={handleDragEnd}
            onClearReadings={{
              prompt: promptClearReadings,
              hasAnyReadings: hasAnyReadings,
            }}
            onDeleteTestPoint={promptDeleteTestPoint}
            onDeleteSelected={promptDeleteSelectedTestPoints}
            onAddTestPoints={() => setIsConfigModalOpen(true)}
            onViewCorrections={() => setIsCorrectionsModalOpen(true)}
            onViewPointCorrections={handleViewPointCorrections}
          />
        </aside>

        <main className="main-content-area">
          {activeTab === "sessionSetup" && (
            <SessionSetup
              sessionsList={sessionsList}
              isLoadingSessions={isLoadingSessions}
              showNotification={showNotification}
              fetchSessionsList={fetchSessionsList}
            />
          )}
          {activeTab === "instrumentStatus" && (
            <InstrumentStatusTab showNotification={showNotification} />
          )}
          {activeTab === "runCalibration" && (
            <Calibration
              showNotification={showNotification}
              orderedTestPoints={orderedTestPoints}
              sharedFocusedTestPoint={focusedTestPoint}
              setSharedFocusedTestPoint={setFocusedTestPoint}
              sharedSelectedTPs={selectedTPs}
              onDataUpdate={fetchSessionData}
              activeDirection={activeDirection}
            />
          )}
          {activeTab === "calibrationResults" && (
            <CalibrationResults
              showNotification={showNotification}
              sharedFocusedTestPoint={focusedTestPoint}
              uniqueTestPoints={uniqueTestPoints}
              onDataUpdate={fetchSessionData}
            />
          )}
          {/* {activeTab === "uncertaintyAnalysis" && (
            <UncertaintyAnalysis
              showNotification={showNotification}
              sharedFocusedTestPoint={focusedTestPoint}
              setSharedFocusedTestPoint={setFocusedTestPoint}
              orderedTestPoints={orderedTestPoints}
              onDataUpdate={fetchSessionData}
            />
          )} */}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <InstrumentContextProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </InstrumentContextProvider>
  );
}

export default App;