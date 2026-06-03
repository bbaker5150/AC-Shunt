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
import Select from "react-select";

// --- Components ---
import Analysis from "./features/analysis/Analysis";
import NotificationModal from "./components/modals/NotificationModal";
import AddTestPointModal from "./features/testPoints/components/AddTestPointModal";
import TestPointDetailView from "./features/testPoints/components/TestPointDetailView";
import ToleranceToolModal from "./features/testPoints/components/ToleranceToolModal";
import EditSessionModal from "./features/session/components/EditSessionModal";
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
import UnitConverter from "./components/tools/UnitConverter";
import ReverseTraceabilityTool from "./components/tools/ReverseTraceabilityTool";

// --- Workbench shared layers (theme + toast live at the shell root) ---
import { useTheme } from "../../shared/ThemeContext";
import { useNotifications } from "../../shared/NotificationContext";

// --- Utils & Hooks ---
import useSessionManager from "./hooks/useSessionManager";
import { saveSessionToPdf, parseSessionPdf } from "./utils/fileIo";
import { unitCategories } from "./utils/uncertaintyMath";
import "./App.css";

const groupedUnitOptions = Object.entries(unitCategories).map(
  ([category, units]) => ({
    label: category,
    options: units.map((u) => ({ value: u, label: u })),
  }),
);

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
  faStickyNote,
  faRightLeft,
  faSave,
  faFolderOpen,
  faClipboardList,
  faCopy,
  faPaste,
  faCheckCircle,
  faCheck,
  faFilter,
  faSlidersH,
  faChevronDown,
  faChevronRight,
  faExpandArrowsAlt,
  faCompressArrowsAlt,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";

import ThemeContext from "./context/ThemeContext";

import {
  getToleranceErrorSummary,
  getAbsoluteLimits,
} from "./utils/uncertaintyMath";

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

  // Add extra buffer for gaps (4px per column gap)
  const columnCount = Object.values(visibleColumns).filter(Boolean).length;
  width += columnCount * 4;

  return width;
};

// --- HELPER COMPONENT: Sidebar Point Item (Supports Inline Editing) ---
const SidebarPointItem = ({
  point,
  isSelected,
  isTableSelected,
  onSelect,
  onModalOpen,
  onSave,
  onContextMenu,
  onDragStart,
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
  const risk = point.riskMetrics || {};

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

      {/* Col 5-8 Risk Columns */}
      {visibleColumns.pfa && (
        <span
          className="point-risk-metric"
          style={{ color: getPfaColor(risk.pfa), fontWeight: 600 }}
          title={`PFA: ${risk.pfa}%`}
        >
          {risk.pfa !== undefined ? `${Number(risk.pfa).toFixed(2)}%` : "-"}
        </span>
      )}
      {visibleColumns.pfr && (
        <span
          className="point-risk-metric"
          style={{ color: getPfrColor(risk.pfr) }}
          title={`PFR: ${risk.pfr}%`}
        >
          {risk.pfr !== undefined ? `${Number(risk.pfr).toFixed(2)}%` : "-"}
        </span>
      )}
      {visibleColumns.tur && (
        <span
          className="point-risk-metric"
          style={{ color: getTurColor(risk.tur), fontWeight: 600 }}
          title={`TUR: ${risk.tur}:1`}
        >
          {risk.tur !== undefined ? `${Number(risk.tur).toFixed(1)}` : "-"}
        </span>
      )}
      {visibleColumns.tar && (
        <span
          className="point-risk-metric"
          style={{ color: getTarColor(risk.tar) }}
          title={`TAR: ${risk.tar}:1`}
        >
          {risk.tar !== undefined ? `${Number(risk.tar).toFixed(1)}` : "-"}
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

  if (!sessionData) return null;

  const startEdit = (e, field, val) => {
    e.stopPropagation();
    setEditingField(field);
    setTempValue(val || "");
  };

  const commitEdit = () => {
    if (editingField) {
      onUpdate({ ...sessionData, [editingField]: tempValue });
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

  return (
    <div
      className={`sidebar-session-header-organic ${isActive ? "active" : ""}`}
      title="Click to select Session Overview"
      onClick={onSelect}
    >
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
        {/* Organization */}
        <div className="session-header-field">
          <span className="session-header-label">Organization</span>
          {editingField === "organization" ? (
            <input
              autoFocus
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="session-header-input"
            />
          ) : (
            <div
              onClick={(e) =>
                startEdit(e, "organization", sessionData.organization)
              }
              className="session-header-value"
            >
              {sessionData.organization || "-"}
            </div>
          )}
        </div>

        {/* Analyst */}
        <div className="session-header-field">
          <span className="session-header-label">Analyst</span>
          {editingField === "analyst" ? (
            <input
              autoFocus
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="session-header-input"
            />
          ) : (
            <div
              onClick={(e) => startEdit(e, "analyst", sessionData.analyst)}
              className="session-header-value"
            >
              {sessionData.analyst || "-"}
            </div>
          )}
        </div>

        {/* Doc ID */}
        <div className="session-header-field">
          <span className="session-header-label">Doc ID</span>
          {editingField === "document" ? (
            <input
              autoFocus
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="session-header-input"
            />
          ) : (
            <div
              onClick={(e) => startEdit(e, "document", sessionData.document)}
              className="session-header-value"
            >
              {sessionData.document || "-"}
            </div>
          )}
        </div>

        {/* Date */}
        <div className="session-header-field">
          <span className="session-header-label">Date</span>
          {editingField === "documentDate" ? (
            <input
              type="date"
              autoFocus
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="session-header-input"
            />
          ) : (
            <div
              onClick={(e) =>
                startEdit(e, "documentDate", sessionData.documentDate)
              }
              className="session-header-value"
            >
              {formatDate(sessionData.documentDate)}
            </div>
          )}
        </div>
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
    deleteTmdeDefinition,
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
  const [isQuickAddSuccess, setIsQuickAddSuccess] = useState(false);
  const [editingTestPoint, setEditingTestPoint] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [isToleranceModalOpen, setIsToleranceModalOpen] = useState(false);

  const [breakdownPoint, setBreakdownPoint] = useState(null);
  const [infoModalPoint, setInfoModalPoint] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState(null);
  const [appNotification, setAppNotification] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [unresolvedToleranceModal, setUnresolvedToleranceModal] =
    useState(null);

  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
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

  const [initialSessionTab, setInitialSessionTab] = useState("details");
  const [sessionImageCache, setSessionImageCache] = useState(new Map());
  const [riskResults, setRiskResults] = useState(null);

  const [sidebarWidth, setSidebarWidth] = useState(550);
  const isResizingRef = useRef(false);

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
  });
  const [isGlobalExpanded, setIsGlobalExpanded] = useState(false);

  // Resize Effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingRef.current) return;

      // --- CONFIGURATION ---
      const MIN_SIDEBAR_WIDTH = 300;
      const MAX_SIDEBAR_WIDTH = 750; // 1. Hard Cap: Never wider than this
      const MIN_CONTENT_WIDTH = 600; // 2. Safety Margin: Reserve this much space for the main panel

      // Calculate the available width for the sidebar based on window size
      const dynamicMaxWidth = window.innerWidth - MIN_CONTENT_WIDTH;

      // The effective limit is the smaller of the hard cap or the dynamic limit
      const effectiveLimit = Math.min(MAX_SIDEBAR_WIDTH, dynamicMaxWidth);

      // Apply constraints
      const newWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(e.clientX, effectiveLimit),
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
      const minRequiredWidth = getMinSidebarWidth(sidebarColumns);
      if (sidebarWidth < minRequiredWidth) {
        setSidebarWidth(minRequiredWidth);
      }
    }
  };

  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef(null);

  // --- QUICK ADD STATE (Sidebar) ---
  const [quickAddSection, setQuickAddSection] = useState("");
  const [quickAddValue, setQuickAddValue] = useState("");
  const [quickAddUnit, setQuickAddUnit] = useState("");

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
    setEditingSession(newSession);
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

    if (uutIds.length > 0 && specificRange) {
      initialData = {
        measurementAreaId: areaId,
        associatedUutIds: uutIds,
        uutTolerance: specificRange,
        testPointInfo: {
          parameter: {
            value: "",
            unit: specificRange.unit || "",
          },
        },
      };
      // Ensure context is set so it opens in the right folder visually
      setSelectedTestPointContextUutId(uutIds[0]);
      if (specificRange._id !== undefined) {
        setActiveRangeIndices((prev) => ({
          ...prev,
          [uutIds[0]]: specificRange._id,
        }));
      }
    } else if (uutIds.length > 0) {
      initialData = {
        measurementAreaId: areaId,
        associatedUutIds: uutIds,
      };
      setSelectedTestPointContextUutId(uutIds[0]);
    } else if (currentUutSelection.length > 0) {
      // Fallback to global selection if no args passed (e.g. main add button)
      initialData = {
        measurementAreaId: areaId || selectedAreaId,
        associatedUutIds: currentUutSelection,
      };

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
      initialData =
        virtualPoint ||
        (areaId ? { measurementAreaId: areaId, associatedUutIds: [] } : null);
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

  const handleSessionChange = async (updatedSession, newImageFiles = []) => {
    updateSession(updatedSession, newImageFiles);
    if (newImageFiles.length > 0) {
      setSessionImageCache((prevCache) => {
        const newCache = new Map(prevCache);
        const sessionCache = new Map(newCache.get(updatedSession.id) || []);
        newImageFiles.forEach((img) =>
          sessionCache.set(img.id, img.fileObject),
        );
        newCache.set(updatedSession.id, sessionCache);
        return newCache;
      });
    }
    setEditingSession(null);
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
      updateSession({ ...currentSessionData, tmdes: updatedTmdes });
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

  const handleOpenSessionEditor = async (initialTab = "details") => {
    setInitialSessionTab(initialTab);

    if (currentSessionData) {
      setEditingSession(currentSessionData);
      const cachedMap = sessionImageCache.get(currentSessionData.id);
      if (!cachedMap || cachedMap.size === 0) {
        try {
          const imagesFromDb = await loadSessionImages(currentSessionData.id);
          if (imagesFromDb && imagesFromDb.length > 0) {
            setSessionImageCache((prev) => {
              const newCache = new Map(prev);
              const sessionMap = new Map();
              imagesFromDb.forEach((img) => sessionMap.set(img.id, img.data));
              newCache.set(currentSessionData.id, sessionMap);
              return newCache;
            });
          }
        } catch (e) {
          console.error("Failed to load images", e);
        }
      }
    }
  };

  const handleSaveTestPoint = (formData) => {
    if (
      !formData.id &&
      formData.associatedUutIds &&
      formData.associatedUutIds.length > 1
    ) {
      const batchPoints = formData.associatedUutIds.map((uutId) => ({
        ...formData,
        associatedUutIds: [uutId],
        uutTolerance: null,
      }));
      saveTestPoint(batchPoints, null);
      setSelectedTestPointContextUutId(formData.associatedUutIds[0]);
    } else {
      const finalData = { ...formData };
      if (!finalData.measurementAreaId && selectedAreaId)
        finalData.measurementAreaId = selectedAreaId;

      if (
        (!finalData.associatedUutIds ||
          finalData.associatedUutIds.length === 0) &&
        currentUutSelection.length > 0
      ) {
        finalData.associatedUutIds = currentUutSelection;
      }

      saveTestPoint(finalData, null);

      if (finalData.associatedUutIds && finalData.associatedUutIds.length > 0) {
        setSelectedTestPointContextUutId(finalData.associatedUutIds[0]);
      }
    }
    setIsAddModalOpen(false);
    setEditingTestPoint(null);
    setCurrentUutSelection([]);
  };

  // ---  Inline update handler for sidebar edits ---
  const handleInlinePointUpdate = (updatedPoint) => {
    saveTestPoint(updatedPoint, null);
  };

  // --- Quick Add handler for sidebar toolbar ---
  const handleQuickAddPoint = () => {
    if (!quickAddValue || !quickAddUnit) return;

    // Determine which UUTs to add the point to
    // Priority: 1) selectedUutId (UUT view) 2) currentUutSelection (Session/Area view)
    const targetUutIds = selectedUutId
      ? [selectedUutId]
      : currentUutSelection.length > 0
        ? currentUutSelection
        : [];

    if (targetUutIds.length === 0) return;

    // Get measurement area from first UUT or selected area
    const firstUut = currentSessionData?.uuts?.find(
      (u) => u.id === targetUutIds[0],
    );
    const areaId = firstUut?.measurementAreaId || selectedAreaId;

    // Helper to create point with resolved tolerance
    const createPointForUut = (uutId) => {
      const uut = currentSessionData?.uuts?.find((u) => u.id === uutId);
      // Resolve tolerance from UUT instrument definition
      const resolvedTolerance = uut
        ? findMatchingRange(uut, quickAddValue, quickAddUnit)
        : null;

      return {
        section: quickAddSection,
        measurementType: "direct",
        testPointInfo: {
          parameter: {
            name: "Measurement",
            value: quickAddValue,
            unit: quickAddUnit,
          },
        },
        associatedUutIds: [uutId],
        measurementAreaId: uut?.measurementAreaId || areaId,
        uutTolerance: resolvedTolerance,
      };
    };

    if (targetUutIds.length === 1) {
      // Single UUT - create one point
      saveTestPoint(createPointForUut(targetUutIds[0]), null);
    } else {
      // Multiple UUTs - create a point for each with resolved tolerance
      const batchPoints = targetUutIds.map(createPointForUut);
      saveTestPoint(batchPoints, null);
    }

    setQuickAddSection("");
    setQuickAddValue("");
    setQuickAddUnit("");
    setIsQuickAddSuccess(true);
    setTimeout(() => setIsQuickAddSuccess(false), 2000);
    showToast(
      `Point${targetUutIds.length > 1 ? "s" : ""} added to ${targetUutIds.length} UUT${targetUutIds.length > 1 ? "s" : ""}`,
    );
  };

  const handleAnalysisDataSave = (updates) => {
    if (selectedTestPointId) {
      updateTestPointData(updates);
    } else {
      setVirtualPoint((prev) => {
        if (!prev) return prev;
        return { ...prev, ...updates };
      });
    }
  };

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
        // Assume deleteTmdeDefinition can handle array or we loop here?
        // deleteTmdeDefinition comes from useSessionManager. Let's assume we need to update session manually if the hook doesn't support batch.
        // Actually, checking useSessionManager usage (line 286), it is destructured. Let's see what it does.
        // If deleteTmdeDefinition only takes one ID, we might need to loop INSIDE the confirm.
        ids.forEach((id) => deleteTmdeDefinition(id));
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
          previousTestPointData={
            currentTestPoints.length > 0
              ? currentTestPoints[currentTestPoints.length - 1]
              : null
          }
        />
        <EditSessionModal
          isOpen={!!editingSession}
          onClose={() => {
            setEditingSession(null);
            setInitialSessionTab("details");
          }}
          sessionData={editingSession}
          onSave={handleSessionChange}
          onSaveToFile={handleSaveToFile}
          handleLoadFromFile={handleLoadFromFile}
          initialSection={initialSessionTab}
          sessionImageCache={sessionImageCache}
          onImageCacheChange={setSessionImageCache}
          onRemoveImageFile={deleteSessionImage}
          instruments={instruments}
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
                    Uncert<span className="app-chrome-brand-dot">·</span>alytics
                  </span>
                  <div className="app-chrome-brand-eyebrow">
                    <span className="app-chrome-brand-sub">
                      Uncertainty &amp; Risk
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

          <div className="results-workflow-container">
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
                    onClick={() => handleOpenSessionEditor("details")}
                    title="Edit Session"
                    className="sidebar-action-button"
                  >
                    <FontAwesomeIcon icon={faEdit} />
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

                {/* Sidebar Toolbar: Quick Add ONLY (Cleaned) */}
                <div className="sidebar-quick-add-container">
                  <span className="sidebar-section-title">Quick Add Point</span>

                  <div
                    className="sidebar-quick-add"
                    style={{ marginTop: "4px" }}
                  >
                    {/* Section Input */}
                    <input
                      type="text"
                      placeholder="Section"
                      value={quickAddSection}
                      onChange={(e) => setQuickAddSection(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleQuickAddPoint()
                      }
                      className="quick-add-input section"
                    />

                    {/* Value Input */}
                    <input
                      type="text"
                      placeholder="Value"
                      value={quickAddValue}
                      onChange={(e) => setQuickAddValue(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleQuickAddPoint()
                      }
                      className="quick-add-input"
                    />

                    {/* Unit Selector */}
                    <div
                      style={{ width: "90px", zIndex: 1001 }}
                      className="quick-add-unit-wrapper"
                    >
                      <Select
                        options={groupedUnitOptions}
                        value={
                          quickAddUnit
                            ? { value: quickAddUnit, label: quickAddUnit }
                            : null
                        }
                        onChange={(opt) =>
                          setQuickAddUnit(opt ? opt.value : "")
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleQuickAddPoint();
                          }
                        }}
                        placeholder="Unit"
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{
                          control: (base, state) => ({
                            ...base,
                            backgroundColor: "rgba(255, 255, 255, 0.04)",
                            borderColor: state.isFocused
                              ? "var(--primary-color)"
                              : "transparent",
                            color: "var(--text-color)",
                            minHeight: "28px",
                            height: "28px",
                            fontSize: "0.85rem",
                            borderRadius: "4px",
                            boxShadow: "none",
                            transition: "all 0.2s ease",
                            "&:hover": {
                              borderColor: state.isFocused
                                ? "var(--primary-color)"
                                : "var(--border-color)",
                            },
                          }),
                          valueContainer: (base) => ({
                            ...base,
                            padding: "0 4px",
                            height: "28px",
                          }),
                          input: (base) => ({
                            ...base,
                            margin: 0,
                            padding: 0,
                            color: "var(--text-color)",
                          }),
                          singleValue: (base) => ({
                            ...base,
                            color: "var(--text-color)",
                          }),
                          placeholder: (base) => ({
                            ...base,
                            color: "var(--text-color-muted)",
                          }),
                          dropdownIndicator: (base) => ({
                            ...base,
                            padding: "0 2px",
                            color: "var(--text-color-muted)",
                          }),
                          indicatorsContainer: (base) => ({
                            ...base,
                            height: "28px",
                          }),
                          groupHeading: (base) => ({
                            ...base,
                            color: "var(--text-color-muted)",
                            fontSize: "0.7rem",
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            padding: "4px 8px",
                          }),
                          menu: (base) => ({
                            ...base,
                            backgroundColor: "var(--component-bg)",
                            zIndex: 9999,
                            border: "1px solid var(--border-color)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                          }),
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          option: (base, state) => ({
                            ...base,
                            backgroundColor: state.isFocused
                              ? "var(--primary-color-light)"
                              : "var(--component-bg)",
                            color: "var(--text-color)",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            padding: "4px 8px",
                          }),
                          menuList: (base) => ({
                            ...base,
                            overflowX: "hidden",
                          }),
                        }}
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      onClick={handleQuickAddPoint}
                      disabled={
                        !quickAddValue ||
                        !quickAddUnit ||
                        (!selectedUutId && currentUutSelection.length === 0)
                      }
                      className={`quick-add-submit ${isQuickAddSuccess ? "success" : ""}`}
                      title={
                        !selectedUutId && currentUutSelection.length === 0
                          ? "Select UUT(s) from panel first"
                          : `Add point to ${selectedUutId ? "1" : currentUutSelection.length} UUT${!selectedUutId && currentUutSelection.length > 1 ? "s" : ""} (Enter)`
                      }
                    >
                      <FontAwesomeIcon icon={faCheck} />
                    </button>
                  </div>
                </div>

                {/* 2. GLOBAL ACTIONS ROW (Refined & Organic) */}
                <div className="sidebar-global-actions">
                  <span className="sidebar-section-title">
                    Measurement Points
                  </span>

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
                            { key: "section", label: "Section" },
                            { key: "value", label: "Value" },
                            { key: "tolerance", label: "Tolerance" },
                            { key: "lowLimit", label: "Low Limit" },
                            { key: "highLimit", label: "High Limit" },
                            { key: "pfa", label: "PFA" },
                            { key: "pfr", label: "PFR" },
                            { key: "tur", label: "TUR" },
                            { key: "tar", label: "TAR" },
                          ].map((col) => (
                            <label key={col.key} className="filter-option">
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
                      )}
                    </div>
                  </div>
                </div>

                {sidebarData.map((areaData) => {
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
                                                          sidebarColumns,
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
                                                    {sidebarColumns.section && (
                                                      <span>Sect.</span>
                                                    )}
                                                    {sidebarColumns.value && (
                                                      <span>Value</span>
                                                    )}
                                                    {sidebarColumns.tolerance && (
                                                      <span>Tolerance</span>
                                                    )}
                                                    {sidebarColumns.lowLimit && (
                                                      <span>Low</span>
                                                    )}
                                                    {sidebarColumns.highLimit && (
                                                      <span>High</span>
                                                    )}
                                                    {sidebarColumns.pfa && (
                                                      <span
                                                        style={{
                                                          textAlign: "center",
                                                        }}
                                                      >
                                                        PFA
                                                      </span>
                                                    )}
                                                    {sidebarColumns.pfr && (
                                                      <span
                                                        style={{
                                                          textAlign: "center",
                                                        }}
                                                      >
                                                        PFR
                                                      </span>
                                                    )}
                                                    {sidebarColumns.tur && (
                                                      <span
                                                        style={{
                                                          textAlign: "center",
                                                        }}
                                                      >
                                                        TUR
                                                      </span>
                                                    )}
                                                    {sidebarColumns.tar && (
                                                      <span
                                                        style={{
                                                          textAlign: "center",
                                                        }}
                                                      >
                                                        TAR
                                                      </span>
                                                    )}
                                                  </div>
                                                  {range.points.map((tp) => {
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
                                                        visibleColumns={
                                                          sidebarColumns
                                                        }
                                                        onSelect={(e) =>
                                                          handleSelectTestPoint(
                                                            e,
                                                            tp.id,
                                                            group.id,
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
                                                isSelected={selectedSidebarPointIds.includes(
                                                  tp.id,
                                                )}
                                                isTableSelected={selectedTablePointIds.includes(
                                                  tp.id,
                                                )}
                                                onSelect={(e) =>
                                                  handleSelectTestPoint(
                                                    e,
                                                    tp.id,
                                                    group.id,
                                                  )
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
                                  isSelected={selectedSidebarPointIds.includes(
                                    tp.id,
                                  )}
                                  isTableSelected={selectedTablePointIds.includes(
                                    tp.id,
                                  )}
                                  onSelect={(e) =>
                                    handleSelectTestPoint(e, tp.id, null)
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
