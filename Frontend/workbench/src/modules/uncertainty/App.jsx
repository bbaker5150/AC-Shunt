/**
 * src/App.jsx
 */
import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { v4 as uuidv4 } from "uuid";

// --- Components ---
import Analysis from "./features/analysis/Analysis";
import NotificationModal from "./components/modals/NotificationModal";
import AddTestPointModal from "./features/testPoints/components/AddTestPointModal";
import TestPointDetailView from "./features/testPoints/components/TestPointDetailView";
import ToleranceToolModal from "./features/testPoints/components/ToleranceToolModal";
// OverviewModal Removed
import ContextMenu from "./components/common/ContextMenu";
import FullBreakdownModal from "./features/analysis/components/BreakdownModals/FullBreakdownModal";
import TestPointInfoModal from "./features/testPoints/components/TestPointInfoModal";
import UniversalInstrumentModal from "./features/instruments/components/UniversalInstrumentModal";
import UnresolvedToleranceModal from "./features/testPoints/components/UnresolvedToleranceModal";
import HelpModal from "./components/common/HelpModal";
import BugReportModal from "./components/modals/BugReportModal";

// --- Brand emblem (shared 3D medallion recipe) ---
import HeaderEmblem from "./components/HeaderEmblem";

// --- Floating Tools ---
import FloatingNotepad from "./components/tools/FloatingNotepad";
import FloatingImagesPanel from "./components/tools/FloatingImagesPanel";
import UnitConverter from "./components/tools/UnitConverter";
import ReverseTraceabilityTool from "./components/tools/ReverseTraceabilityTool";

// --- Workbench shared layers (theme + toast live at the shell root) ---
import { useTheme } from "../../shared/ThemeContext";
import { useNotifications } from "../../shared/NotificationContext";

// --- Utils & Hooks ---
import useSessionManager from "./hooks/useSessionManager";
import { saveSessionToPdf, parseSessionPdf } from "./utils/fileIo";
import "./App.css";

// --- Icons ---
import appLogo from "./assets/icon.svg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faEdit,
  faTrashAlt,
  faBug,
  faQuestionCircle,
  faLayerGroup,
  faMicroscope,
  faRulerCombined,
  faEye,
  faEyeSlash,
  faRadio,
  faHistory,
  faImages,
  faStickyNote,
  faRightLeft,
  faSave,
  faFolderOpen,
  faCopy,
  faPaste,
  faCheckCircle,
  faSlidersH,
  faChevronDown,
  faChevronRight,
  faExpandArrowsAlt,
  faCompressArrowsAlt,
} from "@fortawesome/free-solid-svg-icons";

import ThemeContext from "./context/ThemeContext";

import {
  getToleranceErrorSummary,
  getAbsoluteLimits,
} from "./utils/uncertaintyMath";
import { computeRiskMetricsMap } from "./utils/riskCompute";

const getSidebarGridTemplate = (visibleColumns) => {
  const parts = [];
  // Fixed widths for stable columns
  if (visibleColumns.section) parts.push("50px");
  if (visibleColumns.value) parts.push("80px");
  if (visibleColumns.tolerance) parts.push("minmax(80px, 1fr)");

  // Split Limits Columns
  if (visibleColumns.lowLimit) parts.push("minmax(60px, 0.8fr)");
  if (visibleColumns.highLimit) parts.push("minmax(60px, 0.8fr)");

  // Fixed widths for Risk Columns
  if (visibleColumns.pfa) parts.push("55px");
  if (visibleColumns.pfr) parts.push("55px");
  if (visibleColumns.tur) parts.push("55px");
  if (visibleColumns.tar) parts.push("55px");

  // Guardband columns
  if (visibleColumns.gbPfa) parts.push("60px");
  if (visibleColumns.gbPfr) parts.push("60px");
  if (visibleColumns.gbMult) parts.push("60px");
  if (visibleColumns.gbLow) parts.push("minmax(60px, 0.8fr)");
  if (visibleColumns.gbHigh) parts.push("minmax(60px, 0.8fr)");

  if (parts.length === 0) return "1fr";
  return parts.join(" ");
};

// Helper to calculate minimum sidebar width based on visible columns
const getMinSidebarWidth = (visibleColumns) => {
  // Base width for padding, indentation, tree structure, etc.
  let width = 80; // Base padding/margin

  // Add width for each visible column (use minimum values from grid template)
  if (visibleColumns.section) width += 55;
  if (visibleColumns.value) width += 85;
  if (visibleColumns.tolerance) width += 90;
  if (visibleColumns.lowLimit) width += 70;
  if (visibleColumns.highLimit) width += 70;
  if (visibleColumns.pfa) width += 60;
  if (visibleColumns.pfr) width += 60;
  if (visibleColumns.tur) width += 60;
  if (visibleColumns.tar) width += 60;
  if (visibleColumns.gbPfa) width += 65;
  if (visibleColumns.gbPfr) width += 65;
  if (visibleColumns.gbMult) width += 65;
  if (visibleColumns.gbLow) width += 70;
  if (visibleColumns.gbHigh) width += 70;

  // Add extra buffer for gaps (4px per column gap)
  const columnCount = Object.values(visibleColumns).filter(Boolean).length;
  width += columnCount * 4;

  return width;
};

const parseSortableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPointToleranceSortValue = (point) => {
  const summary = getToleranceErrorSummary(
    point.uutTolerance,
    point.testPointInfo?.parameter,
  );
  return parseSortableNumber(summary);
};

const getPointLimitSortValue = (point, key) => {
  const limits = getAbsoluteLimits(
    point.uutTolerance,
    point.testPointInfo?.parameter,
  );
  if (!limits || limits.low === "N/A") return null;
  return parseSortableNumber(key === "lowLimit" ? limits.low : limits.high);
};

// --- HELPER COMPONENT: Sidebar Point Item (Supports Inline Editing) ---
const SidebarPointItem = ({
  point,
  isSelected,
  isTableSelected,
  liveRiskMetrics = null,
  isLiveRiskTarget = false,
  onSelect,
  onModalOpen,
  onSave,
  onContextMenu,
  onDragStart,
  onShowRiskBreakdown,
  visibleColumns = {
    section: true,
    value: true,
    tolerance: true,
    lowLimit: true,
    highLimit: true,
    pfa: false,
    pfr: false,
    tur: false,
    tar: false,
  },
}) => {
  const [editingField, setEditingField] = useState(null); // 'section' | 'value' | null
  const [tempValue, setTempValue] = useState("");

  const startEdit = (e, field, currentVal) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingField(field);
    setTempValue(
      currentVal !== undefined && currentVal !== null ? currentVal : "",
    );
  };

  const handleSingleClickEdit = (e, field, currentVal) => {
    if (isSelected) {
      startEdit(e, field, currentVal);
    }
  };

  // Clicking a risk metric selects this point and requests its breakdown. The
  // modal is opened by Analysis once the point's full riskResults are computed.
  const handleMetricClick = (e, metricKey) => {
    e.stopPropagation();
    onSelect?.(e);
    onShowRiskBreakdown?.(metricKey);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setTempValue("");
  };

  const commitEdit = () => {
    if (editingField === "section") {
      onSave({ ...point, section: tempValue });
    } else if (editingField === "value") {
      const prevInfo = point.testPointInfo || {};
      const prevParam = prevInfo.parameter || {};

      const newInfo = {
        ...prevInfo,
        parameter: { ...prevParam, value: tempValue },
      };
      onSave({ ...point, testPointInfo: newInfo });
    }
    setEditingField(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.target.blur(); // Triggers onBlur which commits
    }
    if (e.key === "Escape") cancelEdit();
  };

  // Safe Accessors
  const displayValue = point.testPointInfo?.parameter?.value;
  // Prefer the live, reactively-computed metrics (always current with the
  // session inputs); fall back to the persisted backend snapshot only if the
  // point can't currently be evaluated (#1).
  const risk = liveRiskMetrics || point.riskMetrics || {};

  // --- COLOR LOGIC (Matches UncertaintyPanel) ---
  const getPfaColor = (val) => {
    if (val === undefined || val === null) return "var(--text-color-muted)";
    if (val > 5) return "var(--status-bad)"; // Red (> 5%)
    if (val > 2) return "var(--status-warning)"; // Yellow (2% - 5%)
    return "var(--status-good)"; // Green (< 2%)
  };

  const getPfrColor = (val) => {
    // PFR usually follows PFA logic or is purely informational (Blue/Muted)
    // Adjust logic here if you have specific thresholds for PFR
    if (val === undefined || val === null) return "var(--text-color-muted)";
    return "var(--text-color-muted)";
  };

  const getTurColor = (val) => {
    if (val === undefined || val === null) return "var(--text-color-muted)";
    if (val < 4) return "var(--status-warning)"; // Yellow (< 4:1)
    if (val < 1) return "var(--status-bad)"; // Red (< 1:1) - Optional strict check
    return "var(--status-good)"; // Green (>= 4:1)
  };

  const getTarColor = (val) => {
    // TAR matches TUR logic generally
    if (val === undefined || val === null) return "var(--text-color-muted)";
    if (val < 4) return "var(--status-warning)";
    return "var(--status-good)";
  };

  // Calculate Metrics
  const toleranceSummary = React.useMemo(() => {
    const ptParam = point.testPointInfo?.parameter;
    return getToleranceErrorSummary(point.uutTolerance, ptParam);
  }, [point.uutTolerance, point.testPointInfo]);

  const limitsData = React.useMemo(() => {
    const ptParam = point.testPointInfo?.parameter;
    const limits = getAbsoluteLimits(point.uutTolerance, ptParam);
    if (!limits || limits.low === "N/A") return { low: "-", high: "-" };
    const shortLow = limits.low.split(" ")[0];
    const shortHigh = limits.high.split(" ")[0];
    return { low: shortLow, high: shortHigh };
  }, [point.uutTolerance, point.testPointInfo]);

  return (
    <div
      draggable={!editingField}
      className={`point-grid-item ${isSelected ? "active" : ""} ${isTableSelected ? "table-highlight" : ""}`}
      style={{ gridTemplateColumns: getSidebarGridTemplate(visibleColumns) }}
      onClick={(e) => {
        if (!editingField) {
          e.stopPropagation();
          onSelect(e, point);
        }
      }}
      onDragStart={(e) => onDragStart(e, point.id)}
      onDoubleClick={(e) => {
        if (!editingField) {
          e.preventDefault();
          onModalOpen(point);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, point)}
    >
      {/* Col 1: Section */}
      {visibleColumns.section &&
        (editingField === "section" ? (
          <input
            autoFocus
            className="sidebar-inline-input section"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="-"
          />
        ) : (
          <span
            className="point-section"
            onClick={(e) => handleSingleClickEdit(e, "section", point.section)}
            title="Click to edit Section"
          >
            {point.section || "-"}
          </span>
        ))}

      {/* Col 2: Value */}
      {visibleColumns.value &&
        (editingField === "value" ? (
          <div className="sidebar-inline-input-wrapper">
            <input
              autoFocus
              className="sidebar-inline-input value"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <span
            className="point-value"
            onClick={(e) => handleSingleClickEdit(e, "value", displayValue)}
            title="Click to edit Value"
          >
            {displayValue || <span className="point-placeholder">-</span>}
          </span>
        ))}

      {/* Col 3: Tolerance */}
      {visibleColumns.tolerance && (
        <span className="point-metric" title={toleranceSummary}>
          {toleranceSummary !== "Not Set" &&
          toleranceSummary !== "Not Calculated"
            ? toleranceSummary
            : "-"}
        </span>
      )}

      {/* Col 4: Low Limit */}
      {visibleColumns.lowLimit && (
        <span className="point-metric" title={`Low: ${limitsData.low}`}>
          {limitsData.low}
        </span>
      )}

      {/* Col 5: High Limit */}
      {visibleColumns.highLimit && (
        <span className="point-metric" title={`High: ${limitsData.high}`}>
          {limitsData.high}
        </span>
      )}

      {/* Col 5-8 Risk Columns. Clicking a metric selects the point and opens
          that metric's risk breakdown (handled in Analysis once the point's
          riskResults are ready). */}
      {visibleColumns.pfa && (
        <span
          className="point-risk-metric point-risk-metric-clickable"
          style={{ color: getPfaColor(risk.pfa), fontWeight: 600 }}
          title="PFA — click for breakdown"
          onClick={(e) => handleMetricClick(e, "pfa")}
        >
          {risk.pfa !== undefined ? `${Number(risk.pfa).toFixed(2)}%` : "-"}
        </span>
      )}
      {visibleColumns.pfr && (
        <span
          className="point-risk-metric point-risk-metric-clickable"
          style={{ color: getPfrColor(risk.pfr) }}
          title="PFR — click for breakdown"
          onClick={(e) => handleMetricClick(e, "pfr")}
        >
          {risk.pfr !== undefined ? `${Number(risk.pfr).toFixed(2)}%` : "-"}
        </span>
      )}
      {visibleColumns.tur && (
        <span
          className="point-risk-metric point-risk-metric-clickable"
          style={{ color: getTurColor(risk.tur), fontWeight: 600 }}
          title="TUR — click for breakdown"
          onClick={(e) => handleMetricClick(e, "tur")}
        >
          {risk.tur !== undefined ? `${Number(risk.tur).toFixed(1)}` : "-"}
        </span>
      )}
      {visibleColumns.tar && (
        <span
          className="point-risk-metric point-risk-metric-clickable"
          style={{ color: getTarColor(risk.tar) }}
          title="TAR — click for breakdown"
          onClick={(e) => handleMetricClick(e, "tar")}
        >
          {risk.tar !== undefined ? `${Number(risk.tar).toFixed(1)}` : "-"}
        </span>
      )}
      {visibleColumns.gbPfa && (
        <span
          className="point-risk-metric point-risk-metric-clickable"
          style={{ color: getPfaColor(risk.gbPfa), fontWeight: 600 }}
          title="PFA w/ Guardband — click for breakdown"
          onClick={(e) => handleMetricClick(e, "gbpfa")}
        >
          {risk.gbPfa !== undefined ? `${Number(risk.gbPfa).toFixed(2)}%` : "-"}
        </span>
      )}
      {visibleColumns.gbPfr && (
        <span
          className="point-risk-metric point-risk-metric-clickable"
          style={{ color: getPfrColor(risk.gbPfr) }}
          title="PFR w/ Guardband — click for breakdown"
          onClick={(e) => handleMetricClick(e, "gbpfr")}
        >
          {risk.gbPfr !== undefined ? `${Number(risk.gbPfr).toFixed(2)}%` : "-"}
        </span>
      )}
      {visibleColumns.gbMult && (
        <span
          className="point-risk-metric point-risk-metric-clickable"
          title="Guardband Multiplier — click for breakdown"
          onClick={(e) => handleMetricClick(e, "gbmult")}
        >
          {risk.gbMult !== undefined ? `${Number(risk.gbMult).toFixed(1)}%` : "-"}
        </span>
      )}
      {visibleColumns.gbLow && (
        <span
          className="point-metric point-risk-metric-clickable"
          title="Guardband Low Limit — click for breakdown"
          onClick={(e) => handleMetricClick(e, "gblow")}
        >
          {risk.gbLow !== undefined ? Number(risk.gbLow).toPrecision(4) : "-"}
        </span>
      )}
      {visibleColumns.gbHigh && (
        <span
          className="point-metric point-risk-metric-clickable"
          title="Guardband High Limit — click for breakdown"
          onClick={(e) => handleMetricClick(e, "gbhigh")}
        >
          {risk.gbHigh !== undefined ? Number(risk.gbHigh).toPrecision(4) : "-"}
        </span>
      )}
    </div>
  );
};

// --- HELPER: Extract All Ranges from UUT ---
const getAllUutRanges = (uut) => {
  if (!uut) return [];

  let ranges = [];

  // 1. Custom defined ranges on the UUT instance
  if (Array.isArray(uut.ranges) && uut.ranges.length > 0) {
    ranges = uut.ranges.map((r) => ({ ...r, source: "custom" }));
  }
  // 2. Instrument Library: Functions (e.g. "DC Voltage", "Resistance")
  else if (uut.instrument?.functions) {
    ranges = uut.instrument.functions.flatMap((fn) =>
      (fn.ranges || []).map((r) => ({
        ...r,
        functionName: fn.name,
        unit: fn.unit || r.unit,
        source: "function",
      })),
    );
  }
  // 3. Instrument Library: Flat Ranges
  else if (uut.instrument?.ranges) {
    ranges = uut.instrument.ranges.map((r) => ({ ...r, source: "simple" }));
  }
  // 4. Single Tolerance
  else if (uut.tolerance) {
    ranges = [{ ...uut.tolerance, source: "single", isSingle: true }];
  }

  // Add a display label for the sidebar
  const finalRanges = ranges.map((r, index) => {
    let label = "";
    // Prioritize explicit Min/Max range display
    if (r.min !== undefined && r.max !== undefined) {
      label = `${r.min} to ${r.max}`;
    } else {
      label = r.range || "Range";
    }

    // Add Unit to label if not present
    if (r.unit && !label.includes(r.unit)) {
      label += ` ${r.unit}`;
    }

    // Prepend Function Name if available
    if (r.functionName) {
      label = `${r.functionName}: ${label}`;
    }

    return { ...r, _id: index, label };
  });

  return finalRanges;
};

// --- HELPER: Find & Normalize Matching Range (Used for selection logic) ---
const findMatchingRange = (uut, value, unit) => {
  if (!uut || value === null || value === undefined) return null;
  const allRanges = getAllUutRanges(uut);
  const numericValue = parseFloat(value);
  if (isNaN(numericValue)) return allRanges[0] || null;

  const match = allRanges.find((r) => {
    const min = parseFloat(r.min);
    const max = parseFloat(r.max);
    // Case-insensitive unit check
    const unitMatch =
      !unit || !r.unit || unit.toLowerCase() === r.unit.toLowerCase();

    if (!isNaN(min) && !isNaN(max)) {
      return unitMatch && numericValue >= min && numericValue <= max;
    }
    return unitMatch;
  });

  return match || allRanges[0] || null;
};

// --- HELPER COMPONENT: Sidebar Session Header (Inline Editing) ---
const SidebarSessionHeader = ({
  sessionData,
  onUpdate,
  isActive,
  onSelect,
}) => {
  const [editingField, setEditingField] = useState(null);
  const [tempValue, setTempValue] = useState("");
  const [isSessionInfoOpen, setIsSessionInfoOpen] = useState(true);
  const [isRequirementsOpen, setIsRequirementsOpen] = useState(true);

  if (!sessionData) return null;

  const startEdit = (e, field, val) => {
    e.stopPropagation();
    setEditingField(field);
    setTempValue(val || "");
  };

  const commitEdit = () => {
    if (editingField) {
      if (!editingField.startsWith("uncReq.")) {
        onUpdate({ ...sessionData, [editingField]: tempValue });
      }
      setEditingField(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      commitEdit();
    }
    if (e.key === "Escape") {
      setEditingField(null);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return "-";
    const [y, m, d] = isoString.split("-");
    return `${m}/${d}/${y}`;
  };

  const updateRequirement = (field, value) => {
    const reqKey = field.slice("uncReq.".length);
    onUpdate({
      ...sessionData,
      uncReq: { ...(sessionData.uncReq || {}), [reqKey]: value },
    });
  };

  const renderEditableField = (field, value, label, inputType = "text") => {
    const isRequirement = field.startsWith("uncReq.");
    return (
      <div className="session-header-field">
        <span className="session-header-label">{label}</span>
        {editingField === field ? (
          <input
            type={inputType}
            autoFocus
            value={isRequirement ? value ?? "" : tempValue}
            onChange={(e) => {
              if (isRequirement) {
                updateRequirement(field, e.target.value);
              } else {
                setTempValue(e.target.value);
              }
            }}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="session-header-input"
          />
        ) : (
          <div
            onClick={(e) => startEdit(e, field, value)}
            className="session-header-value"
            title={`Edit ${label}`}
          >
            {inputType === "date" ? formatDate(value) : value || "-"}
          </div>
        )}
      </div>
    );
  };

  const requirements = sessionData.uncReq || {};

  return (
    <div
      className={`sidebar-session-header-organic ${isActive ? "active" : ""}`}
      title="Click to select Session Overview"
      onClick={onSelect}
    >
      <div className="session-collapsible-block session-info-block">
        <button
          type="button"
          className="session-section-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setIsSessionInfoOpen((open) => !open);
          }}
          aria-expanded={isSessionInfoOpen}
        >
          <span>Session Info</span>
          <FontAwesomeIcon icon={isSessionInfoOpen ? faChevronDown : faChevronRight} />
        </button>

        {isSessionInfoOpen && (
          <div className="session-info-content">
            {/* TITLE / NAME */}
            <div style={{ marginBottom: "4px" }}>
              {editingField === "name" ? (
                <input
                  autoFocus
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="session-header-input session-header-name-input"
                  placeholder="Session Name"
                />
              ) : (
                <div
                  onClick={(e) => startEdit(e, "name", sessionData.name)}
                  className="session-header-value session-header-name"
                  title="Edit Session Name"
                >
                  {sessionData.name || "Untitled Session"}
                </div>
              )}
            </div>

            {/* 2x2 GRID FOR ORG, ANALYST, DOC, DATE */}
            <div className="session-header-grid">
              {renderEditableField("organization", sessionData.organization, "Organization")}
              {renderEditableField("analyst", sessionData.analyst, "Analyst")}
              {renderEditableField("document", sessionData.document, "Doc ID")}
              {renderEditableField("documentDate", sessionData.documentDate, "Date", "date")}
            </div>
          </div>
        )}
      </div>

      <div className="session-collapsible-block session-requirements-block">
        <button
          type="button"
          className="session-section-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setIsRequirementsOpen((open) => !open);
          }}
          aria-expanded={isRequirementsOpen}
        >
          <span>Uncertainty Requirements</span>
          <FontAwesomeIcon icon={isRequirementsOpen ? faChevronDown : faChevronRight} />
        </button>
        {isRequirementsOpen && (
          <div className="session-requirements-grid">
            {renderEditableField(
              "uncReq.uncertaintyConfidence",
              requirements.uncertaintyConfidence,
              "Confidence %",
              "number",
            )}
            {renderEditableField("uncReq.reliability", requirements.reliability, "Meas Rel %", "number")}
            {renderEditableField("uncReq.calInt", requirements.calInt, "Cal Interval", "number")}
            {renderEditableField(
              "uncReq.measRelCalcAssumed",
              requirements.measRelCalcAssumed,
              "Calc/Assumed %",
              "number",
            )}
            {renderEditableField("uncReq.neededTUR", requirements.neededTUR, "Needed TUR", "number")}
            {renderEditableField("uncReq.reqPFA", requirements.reqPFA, "Req PFA %", "number")}
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const {
    sessions,
    instruments,
    bugReports,
    saveInstrument,
    saveBugReport,
    deleteBugReport,
    deleteInstrument,
    selectedSessionId,
    setSelectedSessionId,
    selectedTestPointId,
    setSelectedTestPointId,
    currentSessionData,
    currentTestPoints,
    defaultTestPoint,
    addSession,
    deleteSession,
    updateSession,
    importSession,
    saveTestPoint,
    updateTestPointData,
    decrementTmdeQuantity,
    loadSessionImages,
    deleteSessionImage,
  } = useSessionManager();

  // Theme + toasts are provided by the workbench shell (global light/dark
  // toggle in WorkbenchTopBar; toast stack at the shell root). The module no
  // longer owns its own dark-mode/theme state or a local toast.
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTestPoint, setEditingTestPoint] = useState(null);
  const [isToleranceModalOpen, setIsToleranceModalOpen] = useState(false);

  const [breakdownPoint, setBreakdownPoint] = useState(null);
  const [infoModalPoint, setInfoModalPoint] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState(null);
  const [appNotification, setAppNotification] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [unresolvedToleranceModal, setUnresolvedToleranceModal] =
    useState(null);

  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isImagesOpen, setIsImagesOpen] = useState(false);
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [isTraceabilityOpen, setIsTraceabilityOpen] = useState(false);

  // Instrument Manager Modal State
  // We use this boolean to open the modal in 'library' mode from the Tools menu.
  // Editing specific instances (UUT/TMDE) is handled via handlers passed to Analysis.
  const [isInstrumentBuilderOpen, setIsInstrumentBuilderOpen] = useState(false);
  const [instrumentModalConfig, setInstrumentModalConfig] = useState({
    mode: "library",
    data: null,
  });

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);

  const [sessionImageCache, setSessionImageCache] = useState(new Map());
  const [riskResults, setRiskResults] = useState(null);
  // A risk metric key (e.g. "pfa", "gbpfa") requested from a sidebar row click.
  // Analysis opens the matching breakdown once the clicked point becomes active
  // and its riskResults are computed, then clears this.
  const [pendingRiskBreakdown, setPendingRiskBreakdown] = useState(null);

  const [sidebarWidth, setSidebarWidth] = useState(550);
  const isResizingRef = useRef(false);
  // The flex row that holds the sidebar + main pane. The resize math measures
  // the pointer against this element's box (not the viewport) so the divider
  // tracks the cursor exactly regardless of the container's padding or the
  // vertical scrollbar width — which differs between a browser (classic
  // scrollbars reserve width) and Electron (overlay scrollbars reserve none).
  const resultsContainerRef = useRef(null);

  // --- SIDEBAR PREFERENCES ---
  const [sidebarColumns, setSidebarColumns] = useState({
    section: true,
    value: true,
    tolerance: true,
    lowLimit: true,
    highLimit: true,
    pfa: true,
    pfr: true,
    tur: false,
    tar: false,
    // Guardband columns (off by default; guardband is only computed when at
    // least one of these is enabled — see pointRiskMap below).
    gbPfa: false,
    gbPfr: false,
    gbMult: false,
    gbLow: false,
    gbHigh: false,
  });
  const [sidebarSort, setSidebarSort] = useState({
    key: "section",
    direction: "asc",
  });
  const hasAnySectionedPoint = useMemo(
    () =>
      (currentTestPoints || []).some((point) =>
        Boolean(String(point.section || "").trim()),
      ),
    [currentTestPoints],
  );
  const visibleSidebarColumns = useMemo(
    () => ({
      ...sidebarColumns,
      section: sidebarColumns.section && hasAnySectionedPoint,
    }),
    [hasAnySectionedPoint, sidebarColumns],
  );
  // Reactive per-point risk metrics for the sidebar columns. Recomputed purely
  // in memory (no DB hits) whenever the points or the session's requirements /
  // shared tolerance change, so every row reflects the latest inputs without
  // needing to be clicked (#1).
  // Guardband is iterative/expensive, so only compute it for the sidebar when at
  // least one guardband column is actually enabled in the filter.
  const guardbandColumnsEnabled =
    sidebarColumns.gbPfa ||
    sidebarColumns.gbPfr ||
    sidebarColumns.gbMult ||
    sidebarColumns.gbLow ||
    sidebarColumns.gbHigh;
  const pointRiskMap = useMemo(
    () =>
      computeRiskMetricsMap(
        currentTestPoints,
        currentSessionData,
        guardbandColumnsEnabled,
      ),
    [
      currentTestPoints,
      currentSessionData?.uncReq,
      currentSessionData?.uutTolerance,
      guardbandColumnsEnabled,
    ],
  );

  const handleSidebarSort = useCallback((key) => {
    setSidebarSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const getSidebarSortValue = useCallback(
    (point, key) => {
      const risk = pointRiskMap[point.id] || point.riskMetrics || {};
      switch (key) {
        case "section":
          return point.section || "";
        case "value":
          return parseSortableNumber(point.testPointInfo?.parameter?.value);
        case "tolerance":
          return getPointToleranceSortValue(point);
        case "lowLimit":
        case "highLimit":
          return getPointLimitSortValue(point, key);
        case "pfa":
        case "pfr":
        case "tur":
        case "tar":
        case "gbPfa":
        case "gbPfr":
        case "gbMult":
        case "gbLow":
        case "gbHigh":
          return risk[key];
        default:
          return "";
      }
    },
    [pointRiskMap],
  );

  const sortSidebarPoints = useCallback(
    (points) => {
      const directionMultiplier = sidebarSort.direction === "asc" ? 1 : -1;
      return [...points].sort((a, b) => {
        const aValue = getSidebarSortValue(a, sidebarSort.key);
        const bValue = getSidebarSortValue(b, sidebarSort.key);
        const aNumber = parseSortableNumber(aValue);
        const bNumber = parseSortableNumber(bValue);
        const aMissing =
          aValue === undefined || aValue === null || String(aValue) === "";
        const bMissing =
          bValue === undefined || bValue === null || String(bValue) === "";

        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;

        if (aNumber !== null && bNumber !== null) {
          return (aNumber - bNumber) * directionMultiplier;
        }

        return String(aValue).localeCompare(String(bValue), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * directionMultiplier;
      });
    },
    [getSidebarSortValue, sidebarSort],
  );

  const renderSidebarSortHeader = useCallback(
    (key, label, { align = "left" } = {}) => {
      const isActive = sidebarSort.key === key;
      const directionLabel = sidebarSort.direction === "asc" ? "ascending" : "descending";
      return (
        <button
          type="button"
          className={`sidebar-sort-header ${isActive ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            handleSidebarSort(key);
          }}
          title={`Sort by ${label}${isActive ? ` (${directionLabel})` : ""}`}
          aria-label={`Sort by ${label}`}
          aria-sort={isActive ? directionLabel : "none"}
          style={{ textAlign: align }}
        >
          <span>{label}</span>
          {isActive && (
            <span className="sidebar-sort-indicator" aria-hidden="true">
              {sidebarSort.direction === "asc" ? "ASC" : "DESC"}
            </span>
          )}
        </button>
      );
    },
    [handleSidebarSort, sidebarSort],
  );

  const [isGlobalExpanded, setIsGlobalExpanded] = useState(false);
  const [isMeasurementPointsOpen, setIsMeasurementPointsOpen] = useState(true);

  // Resize Effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingRef.current) return;

      const container = resultsContainerRef.current;
      if (!container) return;

      // --- CONFIGURATION ---
      const MIN_SIDEBAR_WIDTH = 300;
      const MAX_SIDEBAR_WIDTH = 750; // 1. Hard Cap: Never wider than this
      const MIN_CONTENT_WIDTH = 600; // 2. Safety Margin: Reserve this much space for the main panel

      // Measure against the container's own box, not the viewport. The sidebar
      // is laid out inside this padded element, so the desired width is the
      // pointer's distance from the sidebar's left (content) edge:
      //   sidebarWidth = clientX - rect.left - paddingLeft
      // Clamping against the container's inner width (rect.width minus its
      // horizontal padding) — instead of window.innerWidth — keeps the divider
      // under the cursor and immune to scrollbar width + padding, so it behaves
      // identically in a browser and in Electron. Padding is read live so it
      // stays correct if the CSS padding changes.
      const rect = container.getBoundingClientRect();
      const cs = window.getComputedStyle(container);
      const paddingLeft = parseFloat(cs.paddingLeft) || 0;
      const paddingRight = parseFloat(cs.paddingRight) || 0;
      const innerWidth = rect.width - paddingLeft - paddingRight;

      const pointer = e.clientX - rect.left - paddingLeft;

      // The available width for the sidebar reserves MIN_CONTENT_WIDTH for the
      // main panel, capped by the hard maximum.
      const dynamicMaxWidth = innerWidth - MIN_CONTENT_WIDTH;
      const effectiveLimit = Math.min(MAX_SIDEBAR_WIDTH, dynamicMaxWidth);

      // Apply constraints
      const newWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(pointer, effectiveLimit),
      );

      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const startResizing = (e) => {
    e.preventDefault(); // Prevent text selection start
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none"; // Disable text selection while dragging
  };

  // Unified button handler
  const handleToggleExpandAll = () => {
    if (isGlobalExpanded) {
      // Collapse Logic
      setExpandedAreas(new Set());
      setExpandedUuts(new Set());
      setExpandedRanges(new Set());
      setIsGlobalExpanded(false);
    } else {
      // Expand Logic
      const allAreaIds = new Set(sidebarData.map((area) => area.id));
      const allUutIds = new Set();
      const allRangeKeys = new Set();

      sidebarData.forEach((area) => {
        area.uutGroups.forEach((group) => {
          allUutIds.add(group.id);
          group.rangeGroups.forEach((range) => {
            allRangeKeys.add(`${group.id}-${range._id}`);
          });
        });
      });

      setExpandedAreas(allAreaIds);
      setExpandedUuts(allUutIds);
      setExpandedRanges(allRangeKeys);
      setIsGlobalExpanded(true);

      // Auto-resize sidebar to fit expanded columns if too narrow
      const minRequiredWidth = getMinSidebarWidth(visibleSidebarColumns);
      if (sidebarWidth < minRequiredWidth) {
        setSidebarWidth(minRequiredWidth);
      }
    }
  };

  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target)
      ) {
        setIsColumnMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- SELECTION & VIRTUAL STATE ---
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [selectedUutId, setSelectedUutId] = useState(null);
  const [selectedRangeContext, setSelectedRangeContext] = useState(null); // { uutId, range }
  const [virtualPoint, setVirtualPoint] = useState(null);
  const [activeRangeIndices, setActiveRangeIndices] = useState({});

  // UPDATED: Tracks which UUTs are explicitly SHOWING all ranges.
  const [uutsShowingAllRanges, setUutsShowingAllRanges] = useState(new Set());

  // --- SIDEBAR EXPANSION STATE (Simple accordion control) ---
  const [expandedAreas, setExpandedAreas] = useState(new Set());
  const [expandedUuts, setExpandedUuts] = useState(new Set());
  const [expandedRanges, setExpandedRanges] = useState(new Set());

  // Tracks which UUT "folder" was clicked in the sidebar to enforce context
  const [selectedTestPointContextUutId, setSelectedTestPointContextUutId] =
    useState(null);

  // ---  Table Selection State ---
  const [selectedTablePointIds, setSelectedTablePointIds] = useState([]);

  // --- NEW: Sidebar Multi-Select State ---
  const [selectedSidebarPointIds, setSelectedSidebarPointIds] = useState([]);

  // --- Global UUT Selection State ---
  const [currentUutSelection, setCurrentUutSelection] = useState([]);

  // --- DRAG AND DROP & CLIPBOARD STATE ---
  const [draggedPointId, setDraggedPointId] = useState(null);
  const [dragOverTargetId, setDragOverTargetId] = useState(null);
  const [clipboardPoint, setClipboardPoint] = useState(null);
  const [clipboardUut, setClipboardUut] = useState(null);

  // Toast Helper — delegates to the shared workbench toast stack so toasts
  // render globally (above all modules) with consistent styling.
  const { showNotification } = useNotifications();
  const showToast = useCallback(
    (message, type = "success") => {
      showNotification(message, type);
    },
    [showNotification]
  );

  const handleExpandAll = () => {
    // 1. Collect all Area IDs
    const allAreaIds = new Set(sidebarData.map((area) => area.id));

    // 2. Collect all UUT IDs and Range Keys
    const allUutIds = new Set();
    const allRangeKeys = new Set();

    sidebarData.forEach((area) => {
      area.uutGroups.forEach((group) => {
        allUutIds.add(group.id);
        group.rangeGroups.forEach((range) => {
          const rangeKey = `${group.id}-${range._id}`;
          allRangeKeys.add(rangeKey);
        });
      });
    });

    setExpandedAreas(allAreaIds);
    setExpandedUuts(allUutIds);
    setExpandedRanges(allRangeKeys);
  };

  const handleCollapseAll = () => {
    setExpandedAreas(new Set());
    setExpandedUuts(new Set());
    setExpandedRanges(new Set());
  };

  // --- DELETE HELPER (Defined before useEffect so it can be used inside) ---
  const handleDeleteTestPoint = useCallback(
    (idOrIds, immediate = false) => {
      const idsToDelete = Array.isArray(idOrIds) ? idOrIds : [idOrIds];

      const performDelete = () => {
        if (currentSessionData && currentSessionData.testPoints) {
          const idsSet = new Set(idsToDelete);
          const updatedTestPoints = currentSessionData.testPoints.filter(
            (tp) => !idsSet.has(tp.id),
          );

          updateSession({
            ...currentSessionData,
            testPoints: updatedTestPoints,
          });
        }
        setAppNotification(null);
        // If the selected point was deleted, clear selection
        if (idsToDelete.includes(selectedTestPointId)) {
          setSelectedTestPointId(null);
        }
        // Clear multi-select
        setSelectedSidebarPointIds((prev) =>
          prev.filter((id) => !idsToDelete.includes(id)),
        );
      };

      if (immediate) {
        performDelete();
        return;
      }

      const message =
        idsToDelete.length > 1
          ? `Are you sure you want to delete these ${idsToDelete.length} measurement points?`
          : "Are you sure you want to delete this measurement point?";

      setAppNotification({
        title:
          idsToDelete.length > 1 ? "Batch Delete" : "Delete Measurement Point",
        message: message,
        confirmText: "Delete",
        isIconConfirm: true,
        onConfirm: performDelete,
      });
    },
    [
      currentSessionData,
      updateSession,
      selectedTestPointId,
      setSelectedTestPointId,
    ],
  );

  // --- COPY / PASTE HANDLERS (Moved up for scope access in useEffect) ---
  const handleCopyPoint = useCallback((pointOrPoints) => {
    const points = Array.isArray(pointOrPoints)
      ? pointOrPoints
      : [pointOrPoints];
    setClipboardPoint(points); // Now stores array
    showToast(
      `${points.length} Measurement point${points.length > 1 ? "s" : ""} copied to clipboard`,
    );
    setContextMenu(null);
  }, []);

  const handlePastePoint = useCallback(
    (targetUutId, targetAreaId, targetRange = null) => {
      if (!clipboardPoint || clipboardPoint.length === 0) return;

      const pointsToPaste = Array.isArray(clipboardPoint)
        ? clipboardPoint
        : [clipboardPoint];
      const targetUut = currentSessionData.uuts.find(
        (u) => u.id === targetUutId,
      );

      let resolvedAreaId = targetAreaId;
      if (!resolvedAreaId && targetUut) {
        resolvedAreaId = targetUut.measurementAreaId;
        // Fallback: Try finding area by name if ID is missing (common with imported legacy sessions)
        if (!resolvedAreaId && targetUut.measurementArea) {
          const area = currentSessionData.measurementAreas?.find(
            (a) => a.name === targetUut.measurementArea,
          );
          if (area) resolvedAreaId = area.id;
        }
      }

      const newPoints = [];

      // RANGE CHECK HELPER
      const isValueInRange = (val, unit, range) => {
        if (!range) return true; // No range specified = compatible (default behavior)
        const numVal = parseFloat(val);
        if (isNaN(numVal)) return true; // Non-numeric = pass

        const min = parseFloat(range.min);
        const max = parseFloat(range.max);

        // Unit check (relaxed)
        const unitMatch =
          !unit ||
          !range.unit ||
          unit.toLowerCase() === range.unit.toLowerCase();

        if (!isNaN(min) && !isNaN(max)) {
          return unitMatch && numVal >= min && numVal <= max;
        }
        return unitMatch;
      };

      let errorCount = 0;

      pointsToPaste.forEach((pt) => {
        // Create new point object (Clean ID)
        const newPointData = { ...pt };
        delete newPointData.id;
        newPointData.measurementAreaId = resolvedAreaId;
        newPointData.associatedUutIds = [targetUutId];

        const val = newPointData.testPointInfo?.parameter?.value;
        const unit = newPointData.testPointInfo?.parameter?.unit;

        // Resolve Tolerance
        if (targetRange) {
          // Strict Check if pasting into specific Range
          if (!isValueInRange(val, unit, targetRange)) {
            errorCount++;
            return;
          }
          newPointData.uutTolerance = targetRange;
        } else if (targetUut) {
          // Auto-Resolve
          const matched = findMatchingRange(targetUut, val, unit);
          newPointData.uutTolerance = matched || null;
        }
        newPoints.push(newPointData);
      });

      if (errorCount > 0) {
        showToast(
          `Skipped ${errorCount} point(s) outside target range.`,
          "error",
        );
      }

      if (newPoints.length > 0) {
        saveTestPoint(newPoints, null);
        showToast(`${newPoints.length} point(s) pasted processing.`);
        setSelectedTestPointContextUutId(targetUutId);
      }
    },
    [
      clipboardPoint,
      currentSessionData,
      saveTestPoint,
      setSelectedTestPointContextUutId,
    ],
  );

  const handleCopyUut = useCallback((uut) => {
    setClipboardUut(uut);
    showToast(`UUT "${uut.model || "Item"}" copied to clipboard`);
    setContextMenu(null);
  }, []);

  const handlePasteUut = useCallback(
    (targetAreaId) => {
      if (!clipboardUut || !currentSessionData) return;

      // Create Clone
      const newUut = {
        ...clipboardUut,
        id: uuidv4(),
        measurementAreaId: targetAreaId,
        measurementArea:
          currentSessionData.measurementAreas.find((a) => a.id === targetAreaId)
            ?.name || "",
        // Note: This duplicates the UUT definition only, not its test points (deep clone logic would go here)
      };

      const updatedUuts = [...(currentSessionData.uuts || []), newUut];
      updateSession({ ...currentSessionData, uuts: updatedUuts });
      showToast(`Pasted UUT "${newUut.model}"`);
      setContextMenu(null);
    },
    [clipboardUut, currentSessionData, updateSession],
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+C for Copy Point
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (
          document.activeElement.tagName !== "INPUT" &&
          document.activeElement.tagName !== "TEXTAREA"
        ) {
          if (selectedSidebarPointIds.length > 0) {
            const points = currentTestPoints.filter((p) =>
              selectedSidebarPointIds.includes(p.id),
            );
            if (points.length > 0) {
              e.preventDefault();
              handleCopyPoint(points);
            }
          } else if (selectedTestPointId) {
            const point = currentTestPoints.find(
              (p) => p.id === selectedTestPointId,
            );
            if (point) {
              e.preventDefault();
              handleCopyPoint(point);
            }
          }
        }
      }

      // 3. Ctrl+V for Paste Point
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        // (Paste logic remains mostly same, just checking clipboard array)
        if (
          clipboardPoint &&
          document.activeElement.tagName !== "INPUT" &&
          document.activeElement.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          // Determine target from selection state
          let targetUutId = null;
          let targetAreaId = selectedAreaId;
          let targetRange = null;

          // Priority 0: Selected Range
          if (selectedRangeContext) {
            targetUutId = selectedRangeContext.uutId;
            targetRange = selectedRangeContext.range;
          }
          // Priority 1: Selected UUT Folder
          else if (selectedUutId) {
            targetUutId = selectedUutId;
          }
          // Priority 2: Selected Point's Context UUT
          else if (selectedTestPointId && selectedTestPointContextUutId) {
            targetUutId = selectedTestPointContextUutId;
          }

          if (targetUutId) {
            // Find area if needed
            if (!targetAreaId) {
              const uut = currentSessionData?.uuts?.find(
                (u) => u.id === targetUutId,
              );
              if (uut) targetAreaId = uut.measurementAreaId;
            }
            handlePastePoint(targetUutId, targetAreaId, targetRange);
          }
        }
      }

      // 4. Delete Key
      if (e.key === "Delete" || e.key === "Backspace") {
        if (e.key === "Delete") {
          if (
            document.activeElement.tagName !== "INPUT" &&
            document.activeElement.tagName !== "TEXTAREA"
          ) {
            if (selectedSidebarPointIds.length > 0) {
              e.preventDefault();
              handleDeleteTestPoint(selectedSidebarPointIds);
            } else if (selectedTestPointId) {
              e.preventDefault();
              handleDeleteTestPoint(selectedTestPointId);
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedTestPointId,
    selectedUutId,
    selectedSidebarPointIds,
    selectedTestPointContextUutId,
    clipboardPoint,
    currentTestPoints,
    currentSessionData,
    selectedAreaId,
    selectedRangeContext,
    handleCopyPoint,
    handleDeleteTestPoint,
    handlePastePoint,
  ]);

  useEffect(() => {
    const handleZoom = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (window.require) {
          try {
            const { webFrame } = window.require("electron");
            const currentZoom = webFrame.getZoomFactor();
            let newZoom = currentZoom;
            if (e.deltaY < 0) {
              newZoom += 0.1;
            } else {
              newZoom -= 0.1;
            }
            newZoom = Math.max(0.5, Math.min(newZoom, 3.0));
            webFrame.setZoomFactor(newZoom);
            showToast(`Zoom Level: ${Math.round(newZoom * 100)}%`);
          } catch (error) {
            console.warn("Zoom adjustment failed", error);
          }
        }
      }
    };

    window.addEventListener("wheel", handleZoom, { passive: false });
    return () => window.removeEventListener("wheel", handleZoom);
  }, []);

  // --- DRAG AND DROP HANDLERS (AUTO-MOVE) ---

  const handleDragStart = (e, pointId) => {
    // If dragging an item that is NOT in the selection, make it the only selection
    if (!selectedSidebarPointIds.includes(pointId)) {
      setSelectedSidebarPointIds([pointId]);
      setDraggedPointId(pointId);
    } else {
      // Dragging a selected item = dragging the group
      setDraggedPointId(pointId); // Still track primary for generic logic
    }

    e.dataTransfer.effectAllowed = "move";
    // Optional: Set drag preview size/text if multiple
  };

  const handleDragOver = (e, targetId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTargetId !== targetId) {
      setDragOverTargetId(targetId);
    }
  };

  const handleDragLeave = () => {
    // Optional cleanup
  };

  const handleDrop = (e, targetUutId, targetAreaId, targetRange = null) => {
    e.preventDefault();
    setDragOverTargetId(null);

    // Identify points to move
    let pointsToMoveIds = [];
    if (draggedPointId && selectedSidebarPointIds.includes(draggedPointId)) {
      pointsToMoveIds = [...selectedSidebarPointIds];
    } else if (draggedPointId) {
      pointsToMoveIds = [draggedPointId];
    }

    if (pointsToMoveIds.length === 0) return;

    const targetUut = currentSessionData.uuts.find((u) => u.id === targetUutId);

    // FIX: Robust Area ID Lookup
    let resolvedAreaId = targetAreaId;
    if (!resolvedAreaId && targetUut) {
      resolvedAreaId = targetUut.measurementAreaId;
      if (!resolvedAreaId && targetUut.measurementArea) {
        const area = currentSessionData.measurementAreas?.find(
          (a) => a.name === targetUut.measurementArea,
        );
        if (area) resolvedAreaId = area.id;
      }
    }

    // --- RANGE CHECK FUNCTION ---
    const isValueInRange = (val, unit, range) => {
      if (!range) return true;
      const numVal = parseFloat(val);
      if (isNaN(numVal)) return true;

      const min = parseFloat(range.min);
      const max = parseFloat(range.max);
      const unitMatch =
        !unit || !range.unit || unit.toLowerCase() === range.unit.toLowerCase();

      if (!isNaN(min) && !isNaN(max)) {
        return unitMatch && numVal >= min && numVal <= max;
      }
      return unitMatch;
    };

    const updatesToSave = [];
    let errorCount = 0;

    pointsToMoveIds.forEach((pId) => {
      const pointToProcess = currentTestPoints.find((p) => p.id === pId);
      if (!pointToProcess) return;

      const val = pointToProcess.testPointInfo?.parameter?.value;
      const unit = pointToProcess.testPointInfo?.parameter?.unit;

      // CHECK VALIDITY
      if (targetRange) {
        if (!isValueInRange(val, unit, targetRange)) {
          errorCount++;
          return;
        }
      }

      const updatedPointData = {
        ...pointToProcess,
        measurementAreaId: resolvedAreaId, // Use resolved ID
        associatedUutIds: [targetUutId],
      };

      // Tolerance Logic
      if (targetRange) {
        updatedPointData.uutTolerance = targetRange;
      } else if (targetUut) {
        const matched = findMatchingRange(targetUut, val, unit);
        updatedPointData.uutTolerance = matched || null;
      }

      updatesToSave.push(updatedPointData);
    });

    if (errorCount > 0) {
      showToast(
        `Move rejected: ${errorCount} point(s) do not fit in target range.`,
        "error",
      );
    }

    if (updatesToSave.length > 0) {
      saveTestPoint(updatesToSave, null);
      showToast(
        `Moved ${updatesToSave.length} measurement point${updatesToSave.length > 1 ? "s" : ""}`,
      );
      setSelectedTestPointContextUutId(targetUutId);
    }

    setDraggedPointId(null);
  };

  // --- SELECTION HANDLERS ---
  const handleSelectSession = (newId) => {
    setRiskResults(null);
    setSelectedSessionId(newId);
    setSelectedTestPointId(null);
    setSelectedAreaId(null);
    setSelectedUutId(null);
    setSelectedRangeContext(null); // Clear range
    setVirtualPoint(null);
    setSelectedTestPointContextUutId(null);
    setCurrentUutSelection([]);
    setSelectedTablePointIds([]);
    setSelectedSidebarPointIds([]);
  };

  // --- TOGGLE EXPANSION HANDLERS ---
  const toggleAreaExpand = (e, areaId) => {
    e.stopPropagation();
    setExpandedAreas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(areaId)) newSet.delete(areaId);
      else newSet.add(areaId);
      return newSet;
    });
  };

  const toggleUutExpand = (e, uutId) => {
    e.stopPropagation();
    setExpandedUuts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uutId)) newSet.delete(uutId);
      else newSet.add(uutId);
      return newSet;
    });
  };

  const toggleRangeExpand = (e, rangeKey) => {
    e.stopPropagation();
    setExpandedRanges((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rangeKey)) newSet.delete(rangeKey);
      else newSet.add(rangeKey);
      return newSet;
    });
  };

  const handleSelectArea = (areaId) => {
    // Set selection for the main panel
    setRiskResults(null);
    setSelectedAreaId(areaId);
    setSelectedUutId(null);
    setSelectedRangeContext(null);
    setSelectedTestPointId(null);
    setSelectedTestPointContextUutId(null);
    setCurrentUutSelection([]);
    setVirtualPoint(null);
    setSelectedTablePointIds([]);
    setSelectedSidebarPointIds([]);
  };

  const handleSelectUut = (uutId, areaId) => {
    // Set selection for the main panel
    setRiskResults(null);
    setSelectedUutId(uutId);
    setSelectedAreaId(areaId);
    setSelectedRangeContext(null);
    setSelectedTestPointId(null);
    setSelectedTestPointContextUutId(null);
    setCurrentUutSelection([uutId]);
    setVirtualPoint(null);
    setSelectedTablePointIds([]);
    setSelectedSidebarPointIds([]);
  };

  // ---  Handle Range Selection ---
  const handleSelectRange = (uutId, range, areaId) => {
    // Set selection for the main panel
    setRiskResults(null);
    setSelectedRangeContext({ uutId, range });
    setSelectedUutId(null);
    setSelectedTestPointId(null);
    setVirtualPoint(null);
    setSelectedAreaId(areaId);
    setSelectedTablePointIds([]);
    setSelectedSidebarPointIds([]);

    // Auto-select the UUT so the "Add Point" button knows what to link to
    setCurrentUutSelection([uutId]);
    // Set the active range index so the "Add Point" modal pre-selects this range
    setActiveRangeIndices((prev) => ({ ...prev, [uutId]: range._id }));
  };

  const handleSelectTestPoint = (e, tpId, contextUutId = null) => {
    setRiskResults(null);
    // Multi-Select Logic
    let newSelection = [];
    if (e && (e.ctrlKey || e.metaKey)) {
      if (selectedSidebarPointIds.includes(tpId)) {
        newSelection = selectedSidebarPointIds.filter((id) => id !== tpId);
      } else {
        newSelection = [...selectedSidebarPointIds, tpId];
      }
    } else if (e && e.shiftKey && selectedSidebarPointIds.length > 0) {
      // Shift Select (Simple range logic within visual list is hard without flat index,
      // but we can try basic or just fallback to additive).
      // For now, implementing additive or last-selected.
      // User asked "similar to UUT / TMDE tables". Table usually does range.
      // Since the tree is nested, linear index is tricky.
      // We'll treat shift as "add to selection" for simplicity unless we flat map the tree.
      // A better shift would be: if we have a lastSelectedId, find range.
      // Giving the complexity of tree, let's stick to Ctrl toggle first, or simple append.
      newSelection = [...selectedSidebarPointIds, tpId];
    } else {
      newSelection = [tpId];
    }

    setSelectedSidebarPointIds(newSelection);

    // Update Single Selection State (Legacy/Detail View)
    // If multiple selected, detail view usually shows the LAST one or clears.
    // Existing logic expects `selectedTestPointId` to be a string.
    if (newSelection.length === 1) {
      setSelectedTestPointId(newSelection[0]);
    } else {
      // If multiple, maybe clear detail view or show "X points selected"?
      // UncertaintyPanel expects single ID.
      // We'll keep selectedTestPointId as the *last* clicked logic or null.
      setSelectedTestPointId(tpId);
    }

    setSelectedRangeContext(null); // Clear range
    setSelectedAreaId(null);
    setSelectedUutId(null);
    setVirtualPoint(null);
    setSelectedTestPointContextUutId(contextUutId);
    setCurrentUutSelection([]);
    setSelectedTablePointIds([]);
  };

  const handleAddNewSession = () => {
    const newSession = addSession();
    if (newSession?.id) {
      setSelectedSessionId(newSession.id);
      handleSelectSession(newSession.id);
    }
  };

  const toggleUutEmptyRanges = (uutId) => {
    const newSet = new Set(uutsShowingAllRanges);
    if (newSet.has(uutId)) {
      newSet.delete(uutId);
    } else {
      newSet.add(uutId);
    }
    setUutsShowingAllRanges(newSet);
  };

  const handleAddNewTestPoint = (arg1 = null, arg2 = null, arg3 = null) => {
    let areaId = null;
    let uutIds = [];
    let specificRange = null;

    // Detect Source: Analysis Dashboard passes ([ids], rangeObj)
    if (Array.isArray(arg1)) {
      uutIds = arg1;
      specificRange = arg2;

      // Attempt to resolve Area ID from the first UUT
      if (uutIds.length > 0) {
        const uut = currentSessionData?.uuts?.find((u) => u.id === uutIds[0]);
        if (uut) areaId = uut.measurementAreaId;
      } else {
        areaId = selectedAreaId;
      }
    }
    // Detect Source: Sidebar passes (areaId, uutId, rangeObj?)
    else {
      areaId = arg1;
      const specificUutId = arg2;
      specificRange = arg3;
      if (specificUutId) uutIds = [specificUutId];
    }

    // Logic to build Initial Data
    let initialData = {};
    const applyUutDefaults = (data, targetUutIds, range) => {
      const primaryUut = currentSessionData?.uuts?.find(
        (u) => u.id === targetUutIds?.[0],
      );
      const fallbackRange =
        range ||
        (primaryUut ? getAllUutRanges(primaryUut)[activeRangeIndices[primaryUut.id] || 0] : null);
      const functionName =
        fallbackRange?.functionName ||
        primaryUut?.instrument?.functions?.[0]?.name ||
        "Measurement";
      const unit =
        fallbackRange?.unit ||
        primaryUut?.instrument?.functions?.[0]?.unit ||
        "";

      return {
        ...data,
        uutTolerance: data.uutTolerance || range || null,
        testPointInfo: {
          ...(data.testPointInfo || {}),
          parameter: {
            ...(data.testPointInfo?.parameter || {}),
            name: data.testPointInfo?.parameter?.name || functionName,
            unit: data.testPointInfo?.parameter?.unit || unit,
          },
        },
      };
    };

    if (uutIds.length > 0 && specificRange) {
      initialData = applyUutDefaults({
        measurementAreaId: areaId,
        associatedUutIds: uutIds,
        uutTolerance: specificRange,
        testPointInfo: {
          parameter: {
            value: "",
            unit: specificRange.unit || "",
          },
        },
      }, uutIds, specificRange);
      // Ensure context is set so it opens in the right folder visually
      setSelectedTestPointContextUutId(uutIds[0]);
      if (specificRange._id !== undefined) {
        setActiveRangeIndices((prev) => ({
          ...prev,
          [uutIds[0]]: specificRange._id,
        }));
      }
    } else if (uutIds.length > 0) {
      initialData = applyUutDefaults({
        measurementAreaId: areaId,
        associatedUutIds: uutIds,
      }, uutIds, null);
      setSelectedTestPointContextUutId(uutIds[0]);
    } else if (currentUutSelection.length > 0) {
      // Fallback to global selection if no args passed (e.g. main add button)
      initialData = applyUutDefaults({
        measurementAreaId: areaId || selectedAreaId,
        associatedUutIds: currentUutSelection,
      }, currentUutSelection, null);

      const primaryUutId = currentUutSelection[0];
      const primaryUut = currentSessionData?.uuts?.find(
        (u) => u.id === primaryUutId,
      );

      if (primaryUut && currentUutSelection.length === 1) {
        const availableRanges = getAllUutRanges(primaryUut);
        const selectedIndex = activeRangeIndices[primaryUutId];

        if (selectedIndex !== undefined && availableRanges[selectedIndex]) {
          initialData.uutTolerance = availableRanges[selectedIndex];
        } else if (availableRanges.length > 0) {
          initialData.uutTolerance = availableRanges[0];
        }
      }
    } else {
      const contextUuts = areaId
        ? (currentSessionData?.uuts || []).filter(
            (u) => u.measurementAreaId === areaId,
          )
        : currentSessionData?.uuts || [];
      if (contextUuts.length === 1) {
        initialData = applyUutDefaults({
          measurementAreaId: contextUuts[0].measurementAreaId || areaId,
          associatedUutIds: [contextUuts[0].id],
        }, [contextUuts[0].id], null);
        setSelectedTestPointContextUutId(contextUuts[0].id);
      } else {
        setAppNotification({
          title: "Select a UUT",
          message: "Choose a UUT or UUT range before adding measurement points.",
        });
        return;
      }
    }

    setEditingTestPoint(initialData);
    setIsAddModalOpen(true);
  };

  const handleDeleteSession = (sessionId) => {
    setConfirmationModal({
      title: "Delete Session",
      message:
        "Are you sure you want to delete this session and all its measurement points?",
      onConfirm: () => {
        deleteSession(sessionId);
        setConfirmationModal(null);
      },
    });
  };

  const handleDeleteBugReport = (reportId) => {
    setAppNotification({
      title: "Delete Report",
      message:
        "Are you sure you want to delete this report? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      isIconConfirm: false,
      onConfirm: () => {
        deleteBugReport(reportId);
        setAppNotification(null);
      },
    });
  };

  const handleUpdateNotes = (newNotes) => {
    if (!currentSessionData) return;
    const updatedSession = { ...currentSessionData, notes: newNotes };
    updateSession(updatedSession);
  };

  // --- NEW HANDLERS to Open Modal in Correct Mode ---
  const handleEditUut = (uut = null) => {
    let dataWithColor = uut;

    // FIX: If editing an existing UUT, look up its area color so the modal
    // initializes with the correct color instead of defaulting to Blue.
    if (uut && uut.measurementAreaId && currentSessionData?.measurementAreas) {
      const area = currentSessionData.measurementAreas.find(
        (a) => a.id === uut.measurementAreaId,
      );
      if (area) {
        dataWithColor = { ...uut, measurementAreaColor: area.color };
      }
    } else if (
      uut &&
      uut.measurementArea &&
      currentSessionData?.measurementAreas
    ) {
      // Fallback: Lookup by name if ID is missing
      const area = currentSessionData.measurementAreas.find(
        (a) => a.name === uut.measurementArea,
      );
      if (area) {
        dataWithColor = { ...uut, measurementAreaColor: area.color };
      }
    }

    setInstrumentModalConfig({ mode: "uut", data: dataWithColor });
    setIsInstrumentBuilderOpen(true);
  };

  const handleAddTmde = () => {
    setInstrumentModalConfig({ mode: "tmde", data: null });
    setIsInstrumentBuilderOpen(true);
  };

  const handleEditTmde = (tmde) => {
    setInstrumentModalConfig({ mode: "tmde", data: tmde });
    setIsInstrumentBuilderOpen(true);
  };

  const handleOpenLibrary = () => {
    setInstrumentModalConfig({ mode: "library", data: null });
    setIsInstrumentBuilderOpen(true);
  };

  // When a master TMDE is edited (tolerances, distribution, range, etc.), the
  // per-point tmdeTolerance instances are independent snapshots and would
  // otherwise keep stale specs — so the budget/risk "UI calc" wouldn't update
  // (#6). Re-flatten every referencing instance from the saved master, mirroring
  // the inline handleSaveTmde logic, while preserving per-point data
  // (measurementPoint, variableType, quantity, selected range index).
  const refreshTmdeInstances = (testPoints, savedTmde) => {
    return (testPoints || []).map((tp) => {
      const tols = tp.tmdeTolerances || [];
      let changed = false;
      const next = tols.map((t) => {
        if (t.id !== savedTmde.id && t.sourceId !== savedTmde.id) return t;
        changed = true;

        const newInstDef = savedTmde.instrument || savedTmde;
        let funcName = t.functionName || "";
        let func = null;
        if (newInstDef.functions?.length > 0) {
          if (funcName)
            func = newInstDef.functions.find((f) => f.name === funcName);
          if (!func) func = newInstDef.functions[0];
          funcName = func ? func.name : "";
        }
        const newRanges = func ? func.ranges || [] : newInstDef.ranges || [];
        const activeIndex =
          t._index !== undefined && newRanges[t._index] ? t._index : 0;
        const newActiveRange = newRanges[activeIndex] || {};
        const flattenedSpecs = {
          ...newActiveRange,
          ...(newActiveRange.tolerances || newActiveRange.tolerance || {}),
        };

        /* eslint-disable no-unused-vars */
        const {
          reading,
          readings_iv,
          range,
          floor,
          db,
          tolerance,
          tolerances,
          min,
          max,
          unit,
          resolution,
          ...safeInstanceMeta
        } = t;
        /* eslint-enable no-unused-vars */

        return {
          ...safeInstanceMeta,
          ...savedTmde,
          ...flattenedSpecs,
          id: t.id,
          sourceId: savedTmde.id,
          functionName: funcName,
          _index: activeIndex,
          measurementPoint: t.measurementPoint,
          variableType: t.variableType,
          quantity: t.quantity,
        };
      });
      return changed ? { ...tp, tmdeTolerances: next } : tp;
    });
  };

  const handleUniversalModalSave = (data) => {
    // LOGGING TO VERIFY EXECUTION
    console.log("[App.jsx] handleUniversalModalSave CALLED with:", data);

    if (!currentSessionData) return;

    // CASE 1: Saving a UUT (New or Edit)
    if (data.type === "uut") {
      const rawName = data.measurementArea || "";
      const cleanName = rawName.trim();
      let resolvedAreaId = data.measurementAreaId || selectedAreaId || null;
      let updatedMeasurementAreas = [
        ...(currentSessionData.measurementAreas || []),
      ];

      // Handle Measurement Area Logic
      if (cleanName) {
        const existingAreaIndex = updatedMeasurementAreas.findIndex(
          (a) => a.name.toLowerCase() === cleanName.toLowerCase(),
        );

        if (existingAreaIndex >= 0) {
          resolvedAreaId = updatedMeasurementAreas[existingAreaIndex].id;

          // FIX: Explicitly update the area color if the modal sent a new one
          if (data.measurementAreaColor) {
            console.log(
              `[App.jsx] Updating area '${cleanName}' color to ${data.measurementAreaColor}`,
            );
            updatedMeasurementAreas[existingAreaIndex] = {
              ...updatedMeasurementAreas[existingAreaIndex],
              color: data.measurementAreaColor,
            };
          }
        } else {
          // FIX: Create New Area with the specific color from the modal
          console.log(
            `[App.jsx] Creating new area '${cleanName}' with color ${data.measurementAreaColor}`,
          );
          const newArea = {
            id: uuidv4(),
            name: cleanName,
            color: data.measurementAreaColor || "#3498db",
          };
          updatedMeasurementAreas.push(newArea);
          resolvedAreaId = newArea.id;
        }
      }

      const newUut = {
        id: data.id || uuidv4(),
        description: data.description || data.name,
        measurementArea: cleanName,
        measurementAreaId: resolvedAreaId,
        instrument: data.instrument,
      };

      // Update Session UUTs (Replace if ID exists, otherwise append)
      const existingUutIndex = (currentSessionData.uuts || []).findIndex(
        (u) => u.id === newUut.id,
      );
      const updatedUuts = [...(currentSessionData.uuts || [])];

      if (existingUutIndex >= 0) {
        updatedUuts[existingUutIndex] = newUut;
      } else {
        updatedUuts.push(newUut);
      }

      updateSession({
        ...currentSessionData,
        uuts: updatedUuts,
        measurementAreas: updatedMeasurementAreas,
      });
    }

    // CASE 2: Saving a TMDE
    else if (
      data.type === "tmde" ||
      (data.type === "library" && data.useAs === "tmde")
    ) {
      let newTmde = {};
      if (data.type === "library") {
        newTmde = {
          id: uuidv4(),
          name: `${data.manufacturer} ${data.model}`,
          quantity: 1,
          assetId: "",
          instrument: { ...data },
          isInstrumentBased: true,
        };
        delete newTmde.instrument.useAs;
      } else {
        newTmde = {
          id: data.id || uuidv4(),
          name: data.name,
          quantity: data.quantity,
          assetId: data.assetId,
          instrument: data.instrument,
          isInstrumentBased: true,
        };
      }
      const existingTmdeIndex = (currentSessionData.tmdes || []).findIndex(
        (t) => t.id === newTmde.id,
      );
      const updatedTmdes = [...(currentSessionData.tmdes || [])];
      if (existingTmdeIndex >= 0) {
        updatedTmdes[existingTmdeIndex] = newTmde;
      } else {
        updatedTmdes.push(newTmde);
      }
      // Editing an existing TMDE: propagate the new specs to its per-point
      // instances so budgets/risk recompute. (No-op for brand new TMDEs.)
      const refreshedTestPoints =
        existingTmdeIndex >= 0
          ? refreshTmdeInstances(currentSessionData.testPoints, newTmde)
          : currentSessionData.testPoints;
      updateSession({
        ...currentSessionData,
        tmdes: updatedTmdes,
        testPoints: refreshedTestPoints,
      });
    }

    // CASE 3: Library Item used as UUT
    else if (data.type === "library" && data.useAs === "uut") {
      let resolvedAreaId = selectedAreaId;
      let updatedMeasurementAreas = [
        ...(currentSessionData.measurementAreas || []),
      ];

      if (!resolvedAreaId) {
        const defaultArea = updatedMeasurementAreas.find(
          (a) => a.name === "General",
        );
        if (defaultArea) {
          resolvedAreaId = defaultArea.id;
        } else {
          const newArea = { id: uuidv4(), name: "General", color: "#3498db" };
          updatedMeasurementAreas.push(newArea);
          resolvedAreaId = newArea.id;
        }
      }

      const newUut = {
        id: uuidv4(),
        description: `${data.manufacturer} ${data.model}`,
        measurementArea:
          updatedMeasurementAreas.find((a) => a.id === resolvedAreaId)?.name ||
          "General",
        measurementAreaId: resolvedAreaId,
        instrument: { ...data },
      };
      delete newUut.instrument.useAs;

      updateSession({
        ...currentSessionData,
        uuts: [...(currentSessionData.uuts || []), newUut],
        measurementAreas: updatedMeasurementAreas,
      });
    }
    // CASE 4: Standard Library Save
    else {
      saveInstrument(data);
    }

    setIsInstrumentBuilderOpen(false);
  };

  const handleOpenSessionEditor = async () => {
    if (currentSessionData) {
      handleSelectSession(currentSessionData.id);
    }
  };

  const handleSaveTestPoint = (formData) => {
    const resolvePointForUut = (point, uutId) => {
      const uut = currentSessionData?.uuts?.find((u) => u.id === uutId);
      const value = point.testPointInfo?.parameter?.value;
      const unit = point.testPointInfo?.parameter?.unit;
      return {
        ...point,
        associatedUutIds: [uutId],
        measurementAreaId:
          point.measurementAreaId || uut?.measurementAreaId || selectedAreaId,
        uutTolerance: point.uutTolerance || (uut ? findMatchingRange(uut, value, unit) : null),
      };
    };

    const normalizePoint = (point) => {
      const finalData = { ...point };
      if (!finalData.measurementAreaId && selectedAreaId)
        finalData.measurementAreaId = selectedAreaId;

      if (
        (!finalData.associatedUutIds ||
          finalData.associatedUutIds.length === 0) &&
        currentUutSelection.length > 0
      ) {
        finalData.associatedUutIds = currentUutSelection;
      }

      if (
        !finalData.id &&
        finalData.associatedUutIds &&
        finalData.associatedUutIds.length > 1
      ) {
        return finalData.associatedUutIds.map((uutId) =>
          resolvePointForUut(finalData, uutId),
        );
      }

      if (!finalData.id && finalData.associatedUutIds?.length === 1) {
        return resolvePointForUut(finalData, finalData.associatedUutIds[0]);
      }

      return finalData;
    };

    const normalized = Array.isArray(formData)
      ? formData.flatMap(normalizePoint)
      : normalizePoint(formData);

    saveTestPoint(normalized, null);

    const firstPoint = Array.isArray(normalized) ? normalized[0] : normalized;
    if (firstPoint?.associatedUutIds && firstPoint.associatedUutIds.length > 0) {
      setSelectedTestPointContextUutId(firstPoint.associatedUutIds[0]);
    }
    setIsAddModalOpen(false);
    setEditingTestPoint(null);
    setCurrentUutSelection([]);
  };

  // ---  Inline update handler for sidebar edits ---
  const handleInlinePointUpdate = (updatedPoint) => {
    saveTestPoint(updatedPoint, null);
  };

  const handleAnalysisDataSave = useCallback((updates) => {
    if (selectedTestPointId) {
      updateTestPointData(updates);
    } else {
      setVirtualPoint((prev) => {
        if (!prev) return prev;
        return { ...prev, ...updates };
      });
    }
  }, [selectedTestPointId, updateTestPointData]);

  const handleDeleteTmdeDefinition = (idOrIds) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setAppNotification({
      title: ids.length > 1 ? "Delete TMDEs" : "Delete TMDE",
      message:
        ids.length > 1
          ? `Are you sure you want to delete these ${ids.length} TMDE definitions?`
          : "Are you sure you want to delete this entire TMDE definition (all instances)?",
      confirmText: "Delete",
      isIconConfirm: true,
      onConfirm: () => {
        // The TMDE tables (summary + detailed) list the session-level master
        // TMDEs (currentSessionData.tmdes). Deleting must remove the master
        // definition AND scrub any per-point tmdeTolerance instances that were
        // derived from it (matched by id or sourceId). The old behavior only
        // pruned the active point's tolerances, so the master row never left
        // the table — that's the "delete doesn't work" bug.
        if (currentSessionData) {
          const idsSet = new Set(ids);
          const updatedTmdes = (currentSessionData.tmdes || []).filter(
            (t) => !idsSet.has(t.id),
          );
          const updatedTestPoints = (currentSessionData.testPoints || []).map(
            (tp) => {
              const tols = tp.tmdeTolerances || [];
              const nextTols = tols.filter(
                (t) => !idsSet.has(t.id) && !idsSet.has(t.sourceId),
              );
              return nextTols.length === tols.length
                ? tp
                : { ...tp, tmdeTolerances: nextTols };
            },
          );
          updateSession({
            ...currentSessionData,
            tmdes: updatedTmdes,
            testPoints: updatedTestPoints,
          });
        }
        setAppNotification(null);
      },
    });
  };

  const handleDeleteUut = (idOrIds) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setAppNotification({
      title: ids.length > 1 ? "Delete UUTs" : "Delete UUT",
      message:
        ids.length > 1
          ? `Are you sure you want to delete these ${ids.length} UUT definitions?`
          : "Are you sure you want to delete this UUT definition?",
      confirmText: "Delete",
      isIconConfirm: true,
      onConfirm: () => {
        if (currentSessionData) {
          const idsSet = new Set(ids);
          const updatedUuts = (currentSessionData.uuts || []).filter(
            (u) => !idsSet.has(u.id),
          );
          updateSession({
            ...currentSessionData,
            uuts: updatedUuts,
            // Clear legacy if the 'current' legacy UI matches one of the deleted
            ...(idsSet.has(currentSessionData.id)
              ? {
                  uutDescription: "",
                  uutTolerance: {},
                  uutInstrument: null,
                }
              : {}),
          });
        }
        setAppNotification(null);
      },
    });
  };

  const handleDeleteArea = (areaId) => {
    if (!currentSessionData) return;
    const area = (currentSessionData.measurementAreas || []).find(
      (a) => a.id === areaId,
    );
    // Guard: only allow deleting an area once it has been emptied of UUTs.
    const hasUuts = (currentSessionData.uuts || []).some(
      (u) =>
        u.measurementAreaId === areaId ||
        (area && u.measurementArea && u.measurementArea === area.name),
    );
    if (hasUuts) {
      setAppNotification({
        title: "Area Not Empty",
        message:
          "Remove all UUTs from this measurement area before deleting it.",
      });
      return;
    }

    setAppNotification({
      title: "Delete Measurement Area",
      message: `Delete measurement area "${area?.name || "this area"}"? Any leftover measurement points assigned to it will also be removed.`,
      confirmText: "Delete",
      isIconConfirm: true,
      onConfirm: () => {
        const updatedAreas = (currentSessionData.measurementAreas || []).filter(
          (a) => a.id !== areaId,
        );
        const updatedTestPoints = (currentSessionData.testPoints || []).filter(
          (tp) => tp.measurementAreaId !== areaId,
        );
        updateSession({
          ...currentSessionData,
          measurementAreas: updatedAreas,
          testPoints: updatedTestPoints,
        });
        if (selectedAreaId === areaId) {
          setSelectedAreaId(null);
          handleSelectSession(currentSessionData.id);
        }
        setAppNotification(null);
      },
    });
  };

  const handleSaveToFile = async () => {
    if (!currentSessionData) return;
    const sessionCache = sessionImageCache.get(currentSessionData.id);
    try {
      await saveSessionToPdf(currentSessionData, sessionCache);
    } catch (error) {
      console.error("PDF Save Error:", error);
      setAppNotification({
        title: "Save Failed",
        message: `Failed to save PDF: ${error.message}`,
      });
    }
  };

  const handleLoadFromFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const { session, images } = await parseSessionPdf(file);
      importSession(session);
      setSessionImageCache((prevCache) => {
        const newCache = new Map(prevCache);
        newCache.set(session.id, images);
        return newCache;
      });
      setAppNotification({
        title: "Success",
        message: `Session "${session.name}" loaded successfully.`,
      });
    } catch (error) {
      console.error("PDF Load Error:", error);
      setAppNotification({ title: "Load Failed", message: error.message });
    }
    event.target.value = null;
  };

  // --- DATA PROCESSING: Sidebar Hierarchy ---
  const sidebarData = useMemo(() => {
    if (!currentSessionData) return [];

    const areas = currentSessionData.measurementAreas || [];
    const uuts = currentSessionData.uuts || [];
    const points = currentTestPoints;

    return areas.map((area) => {
      const areaUuts = uuts.filter(
        (u) =>
          u.measurementAreaId === area.id ||
          (u.measurementArea && u.measurementArea === area.name),
      );

      const uutGroups = areaUuts.map((uut) => {
        const associatedPoints = points.filter(
          (tp) =>
            tp.associatedUutIds &&
            tp.associatedUutIds.some((id) => String(id) === String(uut.id)),
        );

        const availableRanges = getAllUutRanges(uut);

        const categorizedPoints = new Set();
        const rangesWithPoints = availableRanges.map((range) => {
          const pointsInRange = associatedPoints.filter((tp) => {
            if (categorizedPoints.has(tp.id)) return false;

            // 1. Explicit Assignment: Check if tolerance is set
            if (tp.uutTolerance && Object.keys(tp.uutTolerance).length > 0) {
              const t = tp.uutTolerance;
              const minMatch = t.min == range.min;
              const maxMatch = t.max == range.max;
              const unitMatch = (t.unit || "") === (range.unit || "");
              const funcMatch = range.functionName
                ? t.functionName === range.functionName
                : true;

              if (minMatch && maxMatch && unitMatch && funcMatch) {
                categorizedPoints.add(tp.id);
                return true;
              }
              return false;
            }

            // 2. Implicit Assignment: Value Check
            const val = parseFloat(tp.testPointInfo?.parameter?.value);
            const unit = tp.testPointInfo?.parameter?.unit;
            if (isNaN(val)) return false;
            const min = parseFloat(range.min);
            const max = parseFloat(range.max);
            const unitMatch =
              !unit ||
              !range.unit ||
              unit.toLowerCase() === range.unit.toLowerCase();
            const inRange =
              !isNaN(min) &&
              !isNaN(max) &&
              unitMatch &&
              val >= min &&
              val <= max;
            if (inRange) categorizedPoints.add(tp.id);
            return inRange;
          });
          return { ...range, points: pointsInRange };
        });

        const uncategorizedPoints = associatedPoints.filter(
          (tp) => !categorizedPoints.has(tp.id),
        );

        return {
          ...uut,
          rangeGroups: rangesWithPoints,
          uncategorizedPoints,
        };
      });

      const unassignedPoints = points.filter((tp) => {
        if (tp.measurementAreaId !== area.id) return false;
        const hasParent = tp.associatedUutIds && tp.associatedUutIds.length > 0;
        const parentExistsInArea =
          hasParent &&
          areaUuts.some((u) =>
            tp.associatedUutIds.some((id) => String(id) === String(u.id)),
          );
        return !parentExistsInArea;
      });

      return { ...area, uutGroups, unassignedPoints };
    });
  }, [currentSessionData, currentTestPoints]);

  // --- LOGIC: Compute Data to Display ---
  const displayData = useMemo(() => {
    if (!currentSessionData) return null;

    if (selectedTestPointId) {
      const pointData = currentTestPoints.find(
        (p) => p.id === selectedTestPointId,
      );
      if (!pointData) return null;

      let effectiveUutTolerance =
        pointData.uutTolerance !== null &&
        pointData.uutTolerance !== undefined &&
        Object.keys(pointData.uutTolerance).length > 0
          ? pointData.uutTolerance
          : currentSessionData.uutTolerance;

      let effectiveUutDescription =
        pointData.uutDescription ||
        (pointData.associatedUutIds?.length > 0
          ? currentSessionData.uuts?.find(
              (u) => u.id === pointData.associatedUutIds[0],
            )?.description
          : currentSessionData.uutDescription);

      let activeUutId = null;

      if (selectedTestPointContextUutId) {
        const contextUut = currentSessionData.uuts?.find(
          (u) => u.id === selectedTestPointContextUutId,
        );
        if (contextUut) {
          effectiveUutDescription = contextUut.description;
          activeUutId = contextUut.id;

          if (
            !pointData.uutTolerance ||
            Object.keys(pointData.uutTolerance).length === 0
          ) {
            const pointValue = pointData.testPointInfo?.parameter?.value;
            const pointUnit = pointData.testPointInfo?.parameter?.unit;
            if (pointValue !== undefined && pointValue !== "") {
              const matchedRange = findMatchingRange(
                contextUut,
                pointValue,
                pointUnit,
              );
              if (matchedRange) {
                effectiveUutTolerance = matchedRange;
              }
            }
          }
        }
      }

      if (
        !activeUutId &&
        pointData.associatedUutIds &&
        pointData.associatedUutIds.length > 0
      ) {
        activeUutId = pointData.associatedUutIds[0];
        if (
          !pointData.uutTolerance ||
          Object.keys(pointData.uutTolerance).length === 0
        ) {
          const fallbackUut = currentSessionData.uuts?.find(
            (u) => u.id === activeUutId,
          );
          if (fallbackUut) {
            const pointValue = pointData.testPointInfo?.parameter?.value;
            const pointUnit = pointData.testPointInfo?.parameter?.unit;
            if (pointValue !== undefined && pointValue !== "") {
              const matchedRange = findMatchingRange(
                fallbackUut,
                pointValue,
                pointUnit,
              );
              if (matchedRange) {
                effectiveUutTolerance = matchedRange;
              }
            }
          }
        }
      }

      return {
        ...pointData,
        viewMode: "point",
        uutDescription: effectiveUutDescription,
        uutTolerance: effectiveUutTolerance,
        activeUutId: activeUutId,
      };
    }

    if (virtualPoint) {
      let activeUutId = null;
      if (
        virtualPoint.associatedUutIds &&
        virtualPoint.associatedUutIds.length > 0
      ) {
        activeUutId = virtualPoint.associatedUutIds[0];
      }
      return {
        ...virtualPoint,
        viewMode: "point",
        activeUutId: activeUutId,
      };
    }

    // ---  Range View Mode ---
    if (selectedRangeContext) {
      return {
        viewMode: "range",
        id: `${selectedRangeContext.uutId}-${selectedRangeContext.range._id}`,
        rangeData: selectedRangeContext.range,
        uutId: selectedRangeContext.uutId,
        measurementAreaId: selectedAreaId,
      };
    }

    if (selectedUutId) {
      return { viewMode: "uut", id: selectedUutId };
    }

    if (selectedAreaId) {
      return { viewMode: "area", id: selectedAreaId };
    }

    if (selectedSessionId) {
      return { viewMode: "session", id: selectedSessionId };
    }

    return null;
  }, [
    currentSessionData,
    selectedTestPointId,
    currentTestPoints,
    virtualPoint,
    selectedTestPointContextUutId,
    selectedUutId,
    selectedAreaId,
    selectedSessionId,
    selectedRangeContext,
  ]);

  return (
    <ThemeContext.Provider value={isDarkMode}>
      <div className="App uncertainty-module">
        {/* ... (Existing Modals) ... */}
        {appNotification && (
          <NotificationModal
            isOpen={true}
            onClose={() => {
              if (appNotification?.onClose) appNotification.onClose();
              setAppNotification(null);
            }}
            title={appNotification.title}
            message={appNotification.message}
            confirmText={appNotification.confirmText}
            cancelText={appNotification.cancelText}
            isIconConfirm={appNotification.isIconConfirm}
            onConfirm={appNotification.onConfirm}
          />
        )}

        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        <BugReportModal
          isOpen={isBugReportOpen}
          onClose={() => setIsBugReportOpen(false)}
          reports={bugReports}
          onSave={saveBugReport}
          onDelete={handleDeleteBugReport}
        />
        {currentSessionData && (
          <>
            {" "}
            <FloatingNotepad
              isOpen={isNotepadOpen}
              onClose={() => setIsNotepadOpen(false)}
              notes={currentSessionData.notes || ""}
              onSave={handleUpdateNotes}
            />{" "}
            <FloatingImagesPanel
              isOpen={isImagesOpen}
              onClose={() => setIsImagesOpen(false)}
              sessionData={currentSessionData}
              sessionImageCache={sessionImageCache}
              onSessionSave={updateSession}
              onImageCacheChange={setSessionImageCache}
              onLoadImages={loadSessionImages}
              onDeleteImage={deleteSessionImage}
            />{" "}
            <UnitConverter
              isOpen={isConverterOpen}
              onClose={() => setIsConverterOpen(false)}
            />{" "}
            <ReverseTraceabilityTool
              isOpen={isTraceabilityOpen}
              onClose={() => setIsTraceabilityOpen(false)}
            />{" "}
          </>
        )}
        <UnresolvedToleranceModal
          isOpen={!!unresolvedToleranceModal}
          matches={unresolvedToleranceModal?.matches}
          instrumentName={unresolvedToleranceModal?.instrumentName}
          onSelect={(selected) => {
            unresolvedToleranceModal.onSelect(selected);
          }}
          onClose={() => setUnresolvedToleranceModal(null)}
        />

        {/* Global Library Modal (Instrument Manager) */}
        <UniversalInstrumentModal
          isOpen={isInstrumentBuilderOpen}
          onClose={() => setIsInstrumentBuilderOpen(false)}
          onSave={handleUniversalModalSave}
          onDelete={deleteInstrument}
          instruments={instruments}
          mode={instrumentModalConfig.mode}
          initialData={instrumentModalConfig.data}
        />

        {confirmationModal && (
          <div className="modal-overlay" style={{ zIndex: 2001 }}>
            {" "}
            <div className="modal-content">
              {" "}
              <button
                onClick={() => setConfirmationModal(null)}
                className="modal-close-button"
              >
                {" "}
                &times;{" "}
              </button>{" "}
              <h3>{confirmationModal.title}</h3>{" "}
              <p>{confirmationModal.message}</p>{" "}
              <div
                className="modal-actions"
                style={{ justifyContent: "center", gap: "15px" }}
              >
                {" "}
                <button
                  className="button"
                  style={{ backgroundColor: "var(--status-bad)" }}
                  onClick={confirmationModal.onConfirm}
                >
                  {" "}
                  Delete{" "}
                </button>{" "}
              </div>{" "}
            </div>{" "}
          </div>
        )}
        <AddTestPointModal
          isOpen={isAddModalOpen || !!editingTestPoint}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingTestPoint(null);
          }}
          onSave={handleSaveTestPoint}
          initialData={
            editingTestPoint ||
            (selectedAreaId ? { measurementAreaId: selectedAreaId } : null)
          }
          hasExistingPoints={currentTestPoints.length > 0}
          sessionData={currentSessionData}
          previousTestPointData={
            currentTestPoints.length > 0
              ? currentTestPoints[currentTestPoints.length - 1]
              : null
          }
        />
        {displayData && displayData.id && displayData.viewMode === "point" && (
          <ToleranceToolModal
            isOpen={isToleranceModalOpen}
            onClose={() => setIsToleranceModalOpen(false)}
            onSave={(data) => {
              updateTestPointData(data);
            }}
            testPointData={displayData}
          />
        )}
        <FullBreakdownModal
          isOpen={!!breakdownPoint}
          breakdownData={breakdownPoint}
          onClose={() => setBreakdownPoint(null)}
        />
        <TestPointInfoModal
          isOpen={!!infoModalPoint}
          testPoint={infoModalPoint}
          onClose={() => setInfoModalPoint(null)}
        />
        {contextMenu && (
          <ContextMenu
            menu={contextMenu}
            onClose={() => setContextMenu(null)}
          />
        )}

        <div className="content-area uncertainty-analysis-page">
          {/* Module chrome — mirrors the AC-Shunt module's .app-chrome header
              (brand block on the left, a meta-icon tool cluster on the right).
              The floating draggable toolbar was removed; the global window
              chrome + theme toggle live in the workbench top bar above. */}
          <header className="app-chrome">
            <div className="app-chrome-bar">
              <div className="app-chrome-brand">
                <div
                  className="app-chrome-brand-mark"
                  role="img"
                  aria-label="Uncertalytics"
                >
                  <span className="app-chrome-brand-mark-plate">
                    <div className="app-chrome-brand-mark-img">
                      <HeaderEmblem />
                    </div>
                  </span>
                </div>
                <div className="app-chrome-brand-text">
                  <span className="app-chrome-brand-name">
                    Uncertalytics
                  </span>
                  <div className="app-chrome-brand-eyebrow">
                    <span className="app-chrome-brand-sub">
                      Uncertainty &amp; Risk Analysis Tool
                    </span>
                    <span className="app-chrome-brand-version">v1.0</span>
                  </div>
                </div>
              </div>

              <div
                className="app-chrome-meta app-chrome-meta--nav"
                role="group"
                aria-label="Tools"
              >
                <div
                  className="app-chrome-meta-group app-chrome-meta-group--tools"
                  aria-label="Session tools"
                >
                  <button
                    type="button"
                    className={`app-chrome-meta-icon${isInstrumentBuilderOpen ? " is-active" : ""}`}
                    onClick={() => handleOpenLibrary()}
                    title="Instrument builder"
                    aria-label="Instrument builder"
                  >
                    <FontAwesomeIcon icon={faRadio} />
                  </button>
                  <button
                    type="button"
                    className={`app-chrome-meta-icon${isTraceabilityOpen ? " is-active" : ""}`}
                    onClick={() => setIsTraceabilityOpen((o) => !o)}
                    title="Reverse traceability"
                    aria-label="Reverse traceability"
                  >
                    <FontAwesomeIcon icon={faHistory} />
                  </button>
                  <button
                    type="button"
                    className={`app-chrome-meta-icon${isNotepadOpen ? " is-active" : ""}`}
                    onClick={() => setIsNotepadOpen((o) => !o)}
                    title="Session notes"
                    aria-label="Session notes"
                  >
                    <FontAwesomeIcon icon={faStickyNote} />
                  </button>
                  <button
                    type="button"
                    className={`app-chrome-meta-icon${isImagesOpen ? " is-active" : ""}`}
                    onClick={() => setIsImagesOpen((o) => !o)}
                    title="Session images"
                    aria-label="Session images"
                  >
                    <FontAwesomeIcon icon={faImages} />
                  </button>
                  <button
                    type="button"
                    className={`app-chrome-meta-icon${isConverterOpen ? " is-active" : ""}`}
                    onClick={() => setIsConverterOpen((o) => !o)}
                    title="Unit converter"
                    aria-label="Unit converter"
                  >
                    <FontAwesomeIcon icon={faRightLeft} />
                  </button>
                </div>

                <span className="app-chrome-meta-sep" aria-hidden="true" />

                <div
                  className="app-chrome-meta-group app-chrome-meta-group--tools"
                  aria-label="Import and export"
                >
                  <button
                    type="button"
                    className="app-chrome-meta-icon"
                    onClick={handleSaveToFile}
                    title="Export session to PDF"
                    aria-label="Export session to PDF"
                  >
                    <FontAwesomeIcon icon={faSave} />
                  </button>
                  <label
                    className="app-chrome-meta-icon"
                    htmlFor="uncertainty-load-pdf"
                    title="Import session from PDF"
                  >
                    <FontAwesomeIcon icon={faFolderOpen} />
                  </label>
                  <input
                    type="file"
                    id="uncertainty-load-pdf"
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={handleLoadFromFile}
                  />
                </div>

                <span className="app-chrome-meta-sep" aria-hidden="true" />

                <div
                  className="app-chrome-meta-group app-chrome-meta-group--tools"
                  aria-label="Help and feedback"
                >
                  <button
                    type="button"
                    className="app-chrome-meta-icon"
                    onClick={() => setIsBugReportOpen(true)}
                    title="Report an issue"
                    aria-label="Report an issue"
                  >
                    <FontAwesomeIcon icon={faBug} />
                  </button>
                  <button
                    type="button"
                    className="app-chrome-meta-icon"
                    onClick={() => setIsHelpOpen(true)}
                    title="Help & tutorial"
                    aria-label="Help and tutorial"
                  >
                    <FontAwesomeIcon icon={faQuestionCircle} />
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div className="results-workflow-container" ref={resultsContainerRef}>
            <aside
              className="results-sidebar"
              style={{
                width: `${sidebarWidth}px`,
                minWidth: `${sidebarWidth}px`,
                maxWidth: `${sidebarWidth}px`,
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* NEW: DRAG HANDLE */}
              <div
                className="sidebar-resizer"
                onMouseDown={startResizing}
                title="Drag to resize sidebar"
              />
              <div
                className="sidebar-header"
                style={{ alignItems: "flex-end" }}
              >
                <div className="session-controls">
                  <label htmlFor="session-select">Analysis Session</label>
                  <select
                    id="session-select"
                    className="session-selector"
                    value={selectedSessionId || ""}
                    onChange={(e) =>
                      handleSelectSession(Number(e.target.value))
                    }
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sidebar-view-controls">
                  <button
                    onClick={handleAddNewSession}
                    title="Add New Session"
                    className="sidebar-action-button"
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </button>
                  <button
                    onClick={() => handleDeleteSession(selectedSessionId)}
                    title="Delete Session"
                    className="sidebar-action-button delete"
                  >
                    <FontAwesomeIcon icon={faTrashAlt} />
                  </button>
                </div>
              </div>

              {/* === SIDEBAR LIST === */}
              <div className="measurement-point-list">
                {/* 1. DASHBOARD HOME BUTTON */}
                <SidebarSessionHeader
                  sessionData={currentSessionData}
                  onUpdate={updateSession}
                  isActive={
                    selectedSessionId &&
                    !selectedAreaId &&
                    !selectedTestPointId &&
                    !selectedRangeContext
                  }
                  onSelect={() => handleSelectSession(selectedSessionId)}
                />

                {/* 2. GLOBAL ACTIONS ROW (Refined & Organic) */}
                <div className="sidebar-global-actions">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={() =>
                      setIsMeasurementPointsOpen((open) => !open)
                    }
                    aria-expanded={isMeasurementPointsOpen}
                  >
                    <FontAwesomeIcon
                      icon={
                        isMeasurementPointsOpen
                          ? faChevronDown
                          : faChevronRight
                      }
                    />
                    <span className="sidebar-section-title">
                    Measurement Points
                    </span>
                  </button>

                  <div className="sidebar-actions-group">
                    {/* Eyeball Button Removed - Moved to HeaderToolbox */}

                    {/* Expand/Collapse All */}
                    <button
                      onClick={handleToggleExpandAll}
                      title={isGlobalExpanded ? "Collapse All" : "Expand All"}
                      className="sidebar-action-btn-organic"
                    >
                      <FontAwesomeIcon
                        icon={
                          isGlobalExpanded
                            ? faCompressArrowsAlt
                            : faExpandArrowsAlt
                        }
                      />
                    </button>

                    {/* Column Filter Menu */}
                    <div style={{ position: "relative" }} ref={columnMenuRef}>
                      <button
                        onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                        title="Filter visible columns"
                        className={`sidebar-action-btn-organic ${isColumnMenuOpen ? "active" : ""}`}
                      >
                        <FontAwesomeIcon icon={faSlidersH} />
                      </button>

                      {isColumnMenuOpen && (
                        <div
                          className="sidebar-filter-dropdown"
                          style={{ top: "100%", right: 0, left: "auto" }}
                        >
                          {[
                            {
                              group: "Measurement",
                              cols: [
                                { key: "section", label: "Section" },
                                { key: "value", label: "Value" },
                                { key: "tolerance", label: "Tolerance" },
                                { key: "lowLimit", label: "Low Limit" },
                                { key: "highLimit", label: "High Limit" },
                              ],
                            },
                            {
                              group: "Risk",
                              cols: [
                                { key: "pfa", label: "PFA" },
                                { key: "pfr", label: "PFR" },
                                { key: "tur", label: "TUR" },
                                { key: "tar", label: "TAR" },
                              ],
                            },
                            {
                              group: "Guardband",
                              cols: [
                                { key: "gbPfa", label: "PFA w/ GB" },
                                { key: "gbPfr", label: "PFR w/ GB" },
                                { key: "gbMult", label: "GB Multiplier" },
                                { key: "gbLow", label: "GB Low Limit" },
                                { key: "gbHigh", label: "GB High Limit" },
                              ],
                            },
                          ].map((section) => (
                            <div
                              key={section.group}
                              className="filter-option-group"
                            >
                              <div className="filter-option-group-title">
                                {section.group}
                              </div>
                              {section.cols.map((col) => (
                                <label
                                  key={col.key}
                                  className="filter-option"
                                >
                                  <input
                                    type="checkbox"
                                    checked={sidebarColumns[col.key]}
                                    onChange={() =>
                                      setSidebarColumns((prev) => ({
                                        ...prev,
                                        [col.key]: !prev[col.key],
                                      }))
                                    }
                                  />
                                  <span>{col.label}</span>
                                </label>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isMeasurementPointsOpen && sidebarData.map((areaData) => {
                  const isAreaActive =
                    selectedAreaId === areaData.id &&
                    !selectedUutId &&
                    !selectedTestPointId &&
                    !selectedRangeContext;

                  // Pure accordion: only expandedAreas Set determines visibility
                  const isAreaExpanded = expandedAreas.has(areaData.id);

                  return (
                    <div
                      key={areaData.id}
                      className="measurement-group-container"
                    >
                      <div
                        className={`area-header-sticky ${isAreaActive ? "active" : ""}`}
                        onClick={() => handleSelectArea(areaData.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.pageX,
                            y: e.pageY,
                            items: [
                              {
                                label: "Paste UUT Here",
                                action: () => handlePasteUut(areaData.id),
                                icon: faPaste,
                                className: !clipboardUut ? "disabled" : "",
                              },
                              {
                                label: "Delete Measurement Area",
                                action: () => handleDeleteArea(areaData.id),
                                icon: faTrashAlt,
                                className:
                                  areaData.uutGroups.length > 0
                                    ? "disabled"
                                    : "destructive",
                              },
                            ],
                          });
                        }}
                      >
                        <FontAwesomeIcon
                          icon={isAreaExpanded ? faChevronDown : faChevronRight}
                          onClick={(e) => toggleAreaExpand(e, areaData.id)}
                          style={{
                            opacity: 0.6,
                            marginRight: "8px",
                            fontSize: "0.75em",
                            width: "10px",
                          }}
                        />
                        <FontAwesomeIcon
                          icon={faLayerGroup}
                          style={{
                            color: isAreaActive
                              ? "var(--primary-color)"
                              : areaData.color || "var(--primary-color)",
                            opacity: isAreaActive ? 1 : 0.7,
                          }}
                          size="sm"
                        />
                        <span className="area-label">{areaData.name}</span>
                      </div>

                      {isAreaExpanded && (
                        <div className="tree-branch">
                          {areaData.uutGroups.map((group) => {
                            // Pure accordion: only expandedUuts Set determines visibility
                            const isUutExpanded = expandedUuts.has(group.id);

                            const isUutSelected =
                              selectedUutId === group.id &&
                              !selectedTestPointId &&
                              !selectedRangeContext;
                            const isShowingAll = uutsShowingAllRanges.has(
                              group.id,
                            );
                            const isDragOver = dragOverTargetId === group.id;

                            return (
                              <div
                                key={group.id}
                                style={{ marginBottom: "10px" }}
                              >
                                <div
                                  className={`uut-row ${isUutSelected ? "active" : ""} ${isDragOver ? "drag-over" : ""}`}
                                  onClick={() =>
                                    handleSelectUut(
                                      group.id,
                                      areaData.id,
                                      group,
                                    )
                                  }
                                  onDragOver={(e) =>
                                    handleDragOver(e, group.id)
                                  }
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) =>
                                    handleDrop(e, group.id, areaData.id)
                                  }
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({
                                      x: e.pageX,
                                      y: e.pageY,
                                      items: [
                                        {
                                          label: "Paste Point Here",
                                          action: () =>
                                            handlePastePoint(
                                              group.id,
                                              areaData.id,
                                            ),
                                          icon: faPaste,
                                          className: !clipboardPoint
                                            ? "disabled"
                                            : "",
                                        },
                                        {
                                          label: "Copy UUT",
                                          action: () => handleCopyUut(group),
                                          icon: faCopy,
                                        },
                                        {
                                          label: "Edit UUT",
                                          action: () => handleEditUut(group),
                                          icon: faEdit,
                                        },
                                        {
                                          label: "Delete UUT",
                                          action: () =>
                                            handleDeleteUut(group.id),
                                          icon: faTrashAlt,
                                          className: "destructive",
                                        },
                                      ],
                                    });
                                  }}
                                >
                                  <div className="uut-info">
                                    <FontAwesomeIcon
                                      icon={
                                        isUutExpanded
                                          ? faChevronDown
                                          : faChevronRight
                                      }
                                      onClick={(e) =>
                                        toggleUutExpand(e, group.id)
                                      }
                                      style={{
                                        opacity: 0.6,
                                        marginRight: "8px",
                                        fontSize: "0.75em",
                                        width: "10px",
                                      }}
                                    />
                                    <FontAwesomeIcon
                                      icon={faMicroscope}
                                      style={{ opacity: 0.6 }}
                                    />
                                    <span>{group.description}</span>
                                  </div>
                                  <div className="uut-actions-group">
                                    <button
                                      className={`btn-icon-only small ${isShowingAll ? "active" : ""}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleUutEmptyRanges(group.id);
                                      }}
                                      title={
                                        isShowingAll
                                          ? "Hide Empty Ranges"
                                          : "Show All Ranges"
                                      }
                                    >
                                      <FontAwesomeIcon
                                        icon={isShowingAll ? faEyeSlash : faEye}
                                        size="xs"
                                      />
                                    </button>
                                    <button
                                      className="btn-icon-only small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddNewTestPoint(
                                          areaData.id,
                                          group.id,
                                        );
                                      }}
                                      title="Add Point"
                                    >
                                      <FontAwesomeIcon
                                        icon={faPlus}
                                        size="xs"
                                      />
                                    </button>
                                  </div>
                                </div>

                                {isUutExpanded && (
                                  <div style={{ paddingLeft: "15px" }}>
                                    {group.rangeGroups.map((range) => {
                                      if (
                                        !isShowingAll &&
                                        range.points.length === 0
                                      )
                                        return null;
                                      const rangeKey = `${group.id}-${range._id}`;
                                      const isRangeDragOver =
                                        dragOverTargetId === rangeKey;
                                      const isRangeExpanded =
                                        expandedRanges.has(rangeKey);

                                      const isRangeSelected =
                                        selectedRangeContext &&
                                        selectedRangeContext.uutId ===
                                          group.id &&
                                        selectedRangeContext.range._id ===
                                          range._id;
                                      const sortedRangePoints =
                                        sortSidebarPoints(range.points);

                                      return (
                                        <div
                                          key={`range-${range._id}`}
                                          style={{ marginBottom: "8px" }}
                                        >
                                          <div
                                            className={`range-label-row ${isRangeDragOver ? "drag-over" : ""} ${isRangeSelected ? "active" : ""}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSelectRange(
                                                group.id,
                                                range,
                                                areaData.id,
                                              );
                                            }}
                                            onDragOver={(e) =>
                                              handleDragOver(e, rangeKey)
                                            }
                                            onDrop={(e) =>
                                              handleDrop(
                                                e,
                                                group.id,
                                                areaData.id,
                                                range,
                                              )
                                            }
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              setContextMenu({
                                                x: e.pageX,
                                                y: e.pageY,
                                                items: [
                                                  {
                                                    label:
                                                      "Paste Point in Range",
                                                    action: () =>
                                                      handlePastePoint(
                                                        group.id,
                                                        areaData.id,
                                                        range,
                                                      ),
                                                    icon: faPaste,
                                                    className: !clipboardPoint
                                                      ? "disabled"
                                                      : "",
                                                  },
                                                ],
                                              });
                                            }}
                                          >
                                            <FontAwesomeIcon
                                              icon={
                                                isRangeExpanded
                                                  ? faChevronDown
                                                  : faChevronRight
                                              }
                                              onClick={(e) =>
                                                toggleRangeExpand(e, rangeKey)
                                              }
                                              style={{
                                                opacity: 0.6,
                                                marginRight: "8px",
                                                fontSize: "0.7em",
                                                width: "8px",
                                              }}
                                            />
                                            <FontAwesomeIcon
                                              icon={faRulerCombined}
                                              size="xs"
                                              style={{
                                                opacity: isRangeSelected
                                                  ? 1
                                                  : 0.5,
                                              }}
                                            />
                                            <span>{range.label}</span>
                                            {range.points.length > 0 && (
                                              <span
                                                style={{
                                                  marginLeft: "auto",
                                                  opacity: 0.5,
                                                  fontSize: "0.75em",
                                                }}
                                              >
                                                ({range.points.length})
                                              </span>
                                            )}
                                          </div>

                                          {/* Points only show when range is expanded */}
                                          {isRangeExpanded &&
                                          range.points.length === 0 ? (
                                            <div className="empty-branch-msg"></div>
                                          ) : (
                                            isRangeExpanded && (
                                              <>
                                                {/* Horizontal scroll wrapper for future column expansion */}
                                                <div className="sidebar-points-scroll-wrapper">
                                                  {/* Column Headers - Using CSS class */}
                                                  <div
                                                    className="sidebar-column-headers"
                                                    style={{
                                                      display: "grid",
                                                      gridTemplateColumns:
                                                        getSidebarGridTemplate(
                                                          visibleSidebarColumns,
                                                        ),
                                                      gap: "4px",
                                                      padding:
                                                        "4px 8px 4px 12px",
                                                      fontSize: "0.7rem",
                                                      fontWeight: "bold",
                                                      color:
                                                        "var(--text-color-muted)",
                                                      borderBottom:
                                                        "1px solid var(--border-color)",
                                                      width: "100%",
                                                      minWidth: "min-content",
                                                    }}
                                                  >
                                                    {visibleSidebarColumns.section &&
                                                      renderSidebarSortHeader(
                                                        "section",
                                                        "Sect.",
                                                      )}
                                                    {visibleSidebarColumns.value &&
                                                      renderSidebarSortHeader(
                                                        "value",
                                                        "Value",
                                                      )}
                                                    {visibleSidebarColumns.tolerance &&
                                                      renderSidebarSortHeader(
                                                        "tolerance",
                                                        "Tolerance",
                                                      )}
                                                    {visibleSidebarColumns.lowLimit &&
                                                      renderSidebarSortHeader(
                                                        "lowLimit",
                                                        "Low",
                                                      )}
                                                    {visibleSidebarColumns.highLimit &&
                                                      renderSidebarSortHeader(
                                                        "highLimit",
                                                        "High",
                                                      )}
                                                    {visibleSidebarColumns.pfa &&
                                                      renderSidebarSortHeader(
                                                        "pfa",
                                                        "PFA",
                                                        { align: "center" },
                                                      )}
                                                    {visibleSidebarColumns.pfr &&
                                                      renderSidebarSortHeader(
                                                        "pfr",
                                                        "PFR",
                                                        { align: "center" },
                                                      )}
                                                    {visibleSidebarColumns.tur &&
                                                      renderSidebarSortHeader(
                                                        "tur",
                                                        "TUR",
                                                        { align: "center" },
                                                      )}
                                                    {visibleSidebarColumns.tar &&
                                                      renderSidebarSortHeader(
                                                        "tar",
                                                        "TAR",
                                                        { align: "center" },
                                                      )}
                                                    {visibleSidebarColumns.gbPfa &&
                                                      renderSidebarSortHeader(
                                                        "gbPfa",
                                                        "PFA GB",
                                                        { align: "center" },
                                                      )}
                                                    {visibleSidebarColumns.gbPfr &&
                                                      renderSidebarSortHeader(
                                                        "gbPfr",
                                                        "PFR GB",
                                                        { align: "center" },
                                                      )}
                                                    {visibleSidebarColumns.gbMult &&
                                                      renderSidebarSortHeader(
                                                        "gbMult",
                                                        "GBx",
                                                        { align: "center" },
                                                      )}
                                                    {visibleSidebarColumns.gbLow &&
                                                      renderSidebarSortHeader(
                                                        "gbLow",
                                                        "GB Low",
                                                      )}
                                                    {visibleSidebarColumns.gbHigh &&
                                                      renderSidebarSortHeader(
                                                        "gbHigh",
                                                        "GB High",
                                                      )}
                                                  </div>
                                                  {sortedRangePoints.map((tp) => {
                                                    const isSelected =
                                                      selectedTestPointId ===
                                                      tp.id;
                                                    return (
                                                      <SidebarPointItem
                                                        key={tp.id}
                                                        point={tp}
                                                        isSelected={selectedSidebarPointIds.includes(
                                                          tp.id,
                                                        )}
                                                        isTableSelected={selectedTablePointIds.includes(
                                                          tp.id,
                                                        )}
                                                        liveRiskMetrics={
                                                          pointRiskMap[tp.id]
                                                        }
                                                        isLiveRiskTarget={true}
                                                        visibleColumns={
                                                          visibleSidebarColumns
                                                        }
                                                        onSelect={(e) =>
                                                          handleSelectTestPoint(
                                                            e,
                                                            tp.id,
                                                            group.id,
                                                          )
                                                        }
                                                        onShowRiskBreakdown={(
                                                          key,
                                                        ) =>
                                                          setPendingRiskBreakdown(
                                                            key,
                                                          )
                                                        }
                                                        onModalOpen={(p) => {
                                                          setEditingTestPoint(
                                                            p,
                                                          );
                                                          setIsAddModalOpen(
                                                            true,
                                                          );
                                                        }}
                                                        onSave={
                                                          handleInlinePointUpdate
                                                        }
                                                        onDragStart={
                                                          handleDragStart
                                                        }
                                                        onContextMenu={(
                                                          e,
                                                          p,
                                                        ) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          setContextMenu({
                                                            x: e.pageX,
                                                            y: e.pageY,
                                                            items: [
                                                              {
                                                                label:
                                                                  "Copy Point",
                                                                action: () =>
                                                                  handleCopyPoint(
                                                                    p,
                                                                  ),
                                                                icon: faCopy,
                                                              },
                                                              {
                                                                label:
                                                                  "Delete Point",
                                                                action: () =>
                                                                  handleDeleteTestPoint(
                                                                    p.id,
                                                                  ),
                                                                icon: faTrashAlt,
                                                                className:
                                                                  "destructive",
                                                              },
                                                            ],
                                                          });
                                                        }}
                                                      />
                                                    );
                                                  })}
                                                </div>
                                              </>
                                            )
                                          )}
                                        </div>
                                      );
                                    })}

                                    {/* UNCATEGORIZED POINTS */}
                                    {group.uncategorizedPoints &&
                                      group.uncategorizedPoints.length > 0 && (
                                        <div style={{ marginTop: "8px" }}>
                                          <div
                                            className="range-label-row"
                                            style={{
                                              color: "var(--status-warning)",
                                            }}
                                          >
                                            <FontAwesomeIcon
                                              icon={faLayerGroup}
                                              size="xs"
                                            />
                                            <span>Other Points</span>
                                          </div>
                                          {group.uncategorizedPoints.map(
                                            (tp) => (
                                              <SidebarPointItem
                                                key={tp.id}
                                                point={tp}
                                                visibleColumns={
                                                  visibleSidebarColumns
                                                }
                                                isSelected={selectedSidebarPointIds.includes(
                                                  tp.id,
                                                )}
                                                isTableSelected={selectedTablePointIds.includes(
                                                  tp.id,
                                                )}
                                                liveRiskMetrics={
                                                  pointRiskMap[tp.id]
                                                }
                                                isLiveRiskTarget={true}
                                                onSelect={(e) =>
                                                  handleSelectTestPoint(
                                                    e,
                                                    tp.id,
                                                    group.id,
                                                  )
                                                }
                                                onShowRiskBreakdown={(key) =>
                                                  setPendingRiskBreakdown(key)
                                                }
                                                onModalOpen={(p) => {
                                                  setEditingTestPoint(p);
                                                  setIsAddModalOpen(true);
                                                }}
                                                onSave={handleInlinePointUpdate}
                                                onDragStart={handleDragStart}
                                                onContextMenu={(e, p) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setContextMenu({
                                                    x: e.pageX,
                                                    y: e.pageY,
                                                    items: [
                                                      {
                                                        label: "Copy Point",
                                                        action: () =>
                                                          handleCopyPoint(p),
                                                        icon: faCopy,
                                                      },
                                                      {
                                                        label: "Delete Point",
                                                        action: () =>
                                                          handleDeleteTestPoint(
                                                            p.id,
                                                          ),
                                                        icon: faTrashAlt,
                                                        className:
                                                          "destructive",
                                                      },
                                                    ],
                                                  });
                                                }}
                                              />
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* UNASSIGNED POINTS IN AREA */}
                          {areaData.unassignedPoints.length > 0 && (
                            <div
                              style={{ marginTop: "15px", paddingLeft: "10px" }}
                            >
                              <div
                                className="range-label-row"
                                style={{ color: "var(--text-color-muted)" }}
                              >
                                <FontAwesomeIcon
                                  icon={faLayerGroup}
                                  size="xs"
                                  style={{ opacity: 0.5 }}
                                />
                                <span>Unassigned Points</span>
                              </div>
                              {areaData.unassignedPoints.map((tp) => (
                                <SidebarPointItem
                                  key={tp.id}
                                  point={tp}
                                  visibleColumns={visibleSidebarColumns}
                                  isSelected={selectedSidebarPointIds.includes(
                                    tp.id,
                                  )}
                                  isTableSelected={selectedTablePointIds.includes(
                                    tp.id,
                                  )}
                                  liveRiskMetrics={pointRiskMap[tp.id]}
                                  isLiveRiskTarget={true}
                                  onSelect={(e) =>
                                    handleSelectTestPoint(e, tp.id, null)
                                  }
                                  onShowRiskBreakdown={(key) =>
                                    setPendingRiskBreakdown(key)
                                  }
                                  onModalOpen={(p) => {
                                    setEditingTestPoint(p);
                                    setIsAddModalOpen(true);
                                  }}
                                  onSave={handleInlinePointUpdate}
                                  onDragStart={handleDragStart}
                                  onContextMenu={(e, p) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setContextMenu({
                                      x: e.pageX,
                                      y: e.pageY,
                                      items: [
                                        {
                                          label: "Copy Point",
                                          action: () => handleCopyPoint(p),
                                          icon: faCopy,
                                        },
                                        {
                                          label: "Delete Point",
                                          action: () =>
                                            handleDeleteTestPoint(p.id),
                                          icon: faTrashAlt,
                                          className: "destructive",
                                        },
                                      ],
                                    });
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>

            <main className="results-content">
              {displayData ? (
                <TestPointDetailView
                  key={displayData.id || `view-${displayData.viewMode}`}
                  testPointData={displayData}
                >
                  <Analysis
                    sessionData={currentSessionData}
                    testPointData={displayData}
                    onDataSave={handleAnalysisDataSave}
                    onSessionSave={updateSession}
                    onSaveTestPoint={handleSaveTestPoint}
                    onEditUut={handleEditUut}
                    onAddTmde={handleAddTmde}
                    onEditTmde={handleEditTmde}
                    defaultTestPoint={defaultTestPoint}
                    setContextMenu={setContextMenu}
                    setBreakdownPoint={setBreakdownPoint}
                    handleOpenSessionEditor={handleOpenSessionEditor}
                    riskResults={riskResults}
                    setRiskResults={setRiskResults}
                    pendingRiskBreakdown={pendingRiskBreakdown}
                    onConsumePendingRiskBreakdown={() =>
                      setPendingRiskBreakdown(null)
                    }
                    onDeleteTmdeDefinition={handleDeleteTmdeDefinition}
                    onDecrementTmdeQuantity={decrementTmdeQuantity}
                    onDeleteUut={handleDeleteUut}
                    instruments={instruments}
                    onDeleteTestPoint={handleDeleteTestPoint}
                    currentUutSelection={currentUutSelection}
                    setCurrentUutSelection={setCurrentUutSelection}
                    activeRangeIndices={activeRangeIndices}
                    onRangeSelectionChange={setActiveRangeIndices}
                    selectedTablePointIds={selectedTablePointIds}
                    setSelectedTablePointIds={setSelectedTablePointIds}
                    onSelectUut={handleSelectUut}
                    onSelectTestPoint={handleSelectTestPoint}
                    onDefineTestPoint={handleAddNewTestPoint}
                  />
                </TestPointDetailView>
              ) : (
                <div className="placeholder-content">
                  {currentSessionData ? (
                    <>
                      <h3>No measurement point selected.</h3>
                      <p>
                        Select a UUT Range or Measurement Area from the sidebar.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => handleAddNewTestPoint()}
                      >
                        <FontAwesomeIcon icon={faPlus} /> Add New Point
                      </button>
                    </>
                  ) : (
                    <>
                      <h3>No Session Available</h3>
                      <p>Create a new session to begin your analysis.</p>
                    </>
                  )}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </ThemeContext.Provider>
  );
}

export default App;
