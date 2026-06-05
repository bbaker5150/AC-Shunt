/**
 * src/features/analysis/components/UncertaintyPanel.jsx
 */
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import Select from "react-select";
import * as math from "mathjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faTrashAlt,
  faTimes,
  faExclamationTriangle,
  faCheckCircle,
  faTimesCircle,
  faMicroscope,
  faCube,
  faArrowRight,
  faRulerCombined,
  faTools,
} from "@fortawesome/free-solid-svg-icons";

// --- Constants ---
const customUnitSelectStyles = {
  control: (provided) => ({
    ...provided,
    minHeight: "30px",
    height: "30px",
    fontSize: "0.85rem",
    backgroundColor: "var(--input-background)",
    borderColor: "var(--border-color)",
    color: "var(--text-color)",
    boxShadow: "none",
    "&:hover": {
      borderColor: "var(--primary-color)",
    },
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 9999,
    backgroundColor: "var(--header-background)",
    border: "1px solid var(--border-color)",
    boxShadow: "var(--box-shadow-glow)",
  }),
  singleValue: (provided) => ({
    ...provided,
    color: "var(--text-color)",
  }),
  input: (provided) => ({
    ...provided,
    color: "var(--text-color)",
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected
      ? "var(--primary-color)"
      : state.isFocused
        ? "var(--primary-color-light)"
        : "transparent",
    color: state.isSelected ? "#ffffff" : "var(--text-color)",
    cursor: "pointer",
    fontSize: "0.85rem",
  }),
};

const symbolCategories = [
  {
    name: "Operators",
    symbols: ["+", "-", "*", "/", "(", ")", "^", "sqrt"],
  },
  {
    name: "Greek",
    symbols: ["alpha", "beta", "delta", "theta", "sigma", "pi"],
  },
];

// Sub-components
import UncertaintyBudgetTable from "./UncertaintyBudgetTable";
import PercentageBarGraph from "./ContributionPlot";

// Utils
import {
  getToleranceSummary,
  getToleranceErrorSummary,
  getAbsoluteLimits,
  calculateUncertaintyFromToleranceObject,
  convertPpmToUnit,
  unitSystem,
  unitCategories,
} from "../../../utils/uncertaintyMath";
import { oldErrorDistributions } from "../utils/budgetUtils";

// Small inline button used by the equation "f(x)" symbol popout. This was
// previously referenced but never defined, which threw once the popout
// rendered. `symbol` here is a plain string (see symbolCategories above).
const SymbolButton = ({ symbol, title, onSymbolClick }) => (
  <button
    type="button"
    className="symbol-button"
    title={title || `Insert ${symbol}`}
    onClick={() => onSymbolClick(symbol)}
  >
    {symbol}
  </button>
);

const handleRowSelection = (e, id, currentSelected, setSelected) => {
  if (e.ctrlKey || e.metaKey) {
    // Toggle selection if modifier key is held
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  } else {
    // Single select if simply clicked
    setSelected([id]);
  }
};

// --- HELPER: Decompose Tolerance into Rows (Intuitive Format) ---
// --- HELPER: Decompose Tolerance into Rows (Intuitive Format) ---
const getSpecRows = (tolerance) => {
  if (!tolerance) return ["-"];
  const rows = [];

  // Helper to format a single component part (similar to uncertaintyMath utils)
  const formatPart = (part, suffix = "") => {
    if (
      !part ||
      (isNaN(parseFloat(part.high)) &&
        isNaN(parseFloat(part.low)) &&
        isNaN(parseFloat(part.value)))
    )
      return null;

    // Handle "value" property legacy/alternative
    if (part.high === undefined && part.value !== undefined) {
      return `± ${part.value} ${part.unit || ""} ${suffix}`.trim();
    }

    const high = parseFloat(part.high || 0);
    const low = parseFloat(part.low || -high);
    const unit = part.unit || "";

    let valStr = "";
    if (Math.abs(high + low) < 1e-9 && high > 0) {
      valStr = `± ${high}`;
    } else {
      valStr = `+${high}/${low}`;
    }

    return `${valStr} ${unit} ${suffix}`.trim();
  };

  // 1. Explicit sub-components (recursion)
  if (Array.isArray(tolerance.tolerances) && tolerance.tolerances.length > 0) {
    tolerance.tolerances.forEach((t) => {
      rows.push(...getSpecRows(t));
    });
    return rows;
  }

  // 2. Standard Components - Check for existence and format
  let foundComponent = false;

  // Reading
  if (tolerance.reading) {
    const txt = formatPart(tolerance.reading, "of Reading");
    if (txt) {
      rows.push(txt);
      foundComponent = true;
    }
  }

  // Readings (IV)
  if (tolerance.readings_iv) {
    const txt = formatPart(tolerance.readings_iv, "of Reading (IV)");
    if (txt) {
      rows.push(txt);
      foundComponent = true;
    }
  }

  // Range (Full Scale)
  if (tolerance.range) {
    // Some structures might use 'range' as the value wrapper
    const txt = formatPart(tolerance.range, "of Range");
    if (txt) {
      rows.push(txt);
      foundComponent = true;
    }
  }

  // Floor
  if (tolerance.floor) {
    const txt = formatPart(tolerance.floor, "Floor");
    if (txt) {
      rows.push(txt);
      foundComponent = true;
    }
  }

  // Offset
  if (tolerance.offset) {
    const txt = formatPart(tolerance.offset, "Offset");
    if (txt) {
      rows.push(txt);
      foundComponent = true;
    }
  }

  // Linearity
  if (tolerance.linearity) {
    const txt = formatPart(tolerance.linearity, "Linearity");
    if (txt) {
      rows.push(txt);
      foundComponent = true;
    }
  }

  // dB
  if (tolerance.db) {
    const txt = formatPart(tolerance.db, ""); // unit usually inside
    if (txt) {
      rows.push(txt);
      foundComponent = true;
    }
  }

  // 3. Fallback
  if (!foundComponent || rows.length === 0) {
    const summary = getToleranceSummary(tolerance);
    return [summary];
  }

  return rows;
};

// --- SHARED HELPER: Resolve UUT Range ---
const resolveUutRangeHelper = (
  uut,
  activeRangeIndices,
  savedTolerance,
  uutNominal,
) => {
  // 1. Normalize Ranges
  let allRanges = [];
  if (Array.isArray(uut.ranges) && uut.ranges.length > 0) {
    allRanges = uut.ranges.map((r) => ({
      ...r,
      ...(r.tolerances || r.tolerance || {}),
    }));
  } else if (
    Array.isArray(uut.instrument?.functions) &&
    uut.instrument.functions.length > 0
  ) {
    allRanges = uut.instrument.functions.flatMap((fn) =>
      (fn.ranges || []).map((r) => ({
        ...r,
        ...(r.tolerances || {}),
        functionName: fn.name,
        unit: fn.unit || r.unit,
      })),
    );
  } else if (
    Array.isArray(uut.instrument?.ranges) &&
    uut.instrument.ranges.length > 0
  ) {
    allRanges = uut.instrument.ranges.map((r) => ({
      ...r,
      ...(r.tolerances || {}),
    }));
  } else {
    const baseTolerance = uut.tolerance || uut.instrument?.tolerance || {};
    allRanges = [{ id: "default", range: "Default", ...baseTolerance }];
  }
  allRanges = allRanges.map((r, i) => ({ ...r, _index: i }));

  // Helper: fit check
  const doesRangeFit = (r) => {
    const val = parseFloat(uutNominal?.value);
    if (isNaN(val)) return false;
    const min = parseFloat(r.min);
    const max = parseFloat(r.max);

    // Check unit
    const unitMatch =
      !r.unit ||
      !uutNominal?.unit ||
      r.unit.toLowerCase() === uutNominal.unit.toLowerCase();
    if (!unitMatch) return false;

    // Check value bounds
    if (!isNaN(min) && !isNaN(max)) return val >= min && val <= max;

    // If no bounds, assume fit
    return true;
  };

  // 2. Identify Display Ranges
  const userHasValue = uutNominal && !isNaN(parseFloat(uutNominal.value));
  let displayRanges = allRanges;

  // FILTER: Only show ranges that fit the value (if value exists)
  if (userHasValue) {
    const fittingRanges = allRanges.filter((r) => doesRangeFit(r));
    if (fittingRanges.length > 0) {
      displayRanges = fittingRanges;
    }
  }

  // 3. Determine Active Index (in displayRanges)
  let activeIndex = -1;

  // Priority A: Manual Selection (UI State)
  if (activeRangeIndices && activeRangeIndices[uut.id] !== undefined) {
    const uiIndex = activeRangeIndices[uut.id];
    if (displayRanges[uiIndex]) {
      activeIndex = uiIndex;
    }
  }

  // Priority B: Saved Tolerance (Robust Match)
  if (activeIndex === -1 && savedTolerance) {
    activeIndex = displayRanges.findIndex((r) => {
      // ID Match (Best)
      if (r.id && savedTolerance.id && r.id === savedTolerance.id) return true;

      // Name Match
      if (savedTolerance.range && r.range && savedTolerance.range === r.range) {
        return savedTolerance.functionName
          ? savedTolerance.functionName === r.functionName
          : true;
      }

      // Props Match (Fallback)
      const minMatch = r.min == savedTolerance.min;
      const maxMatch = r.max == savedTolerance.max;
      const unitMatch = (r.unit || "") === (savedTolerance.unit || "");
      const funcMatch = r.functionName === savedTolerance.functionName; // strict function name

      // Looser function match if one is missing? No, stay strict.
      return (
        minMatch && maxMatch && unitMatch && (!r.functionName || funcMatch)
      );
    });
  }

  // Priority C: Default (First Item)
  if (activeIndex === -1) {
    activeIndex = 0;
  }

  return {
    ranges: displayRanges,
    activeIndex: activeIndex,
    activeRange: displayRanges[activeIndex] || {},
  };
};

// --- SHARED HELPER: Calculate Tolerance & Limits (Core Logic) ---
const calculateToleranceMetrics = (activeTolerance, nominalObj) => {
  const nominalVal = parseFloat(nominalObj?.value);

  if (!activeTolerance || Object.keys(activeTolerance).length === 0) {
    return {
      numericTolerance: null,
      limits: { low: "-", high: "-" },
      display: "No Range / Spec",
    };
  }

  if (isNaN(nominalVal)) {
    return {
      numericTolerance: null,
      limits: { low: "-", high: "-" },
      display: "No Value",
    };
  }

  // 1. Try Meticulous Calculation (Complex Objects: Reading + Floor)
  const getComponentValue = (comp) => {
    if (comp === undefined || comp === null) return 0;
    if (typeof comp === "object") {
      const valStr = comp.high || comp.value || comp.tolerance;
      const parsed = parseFloat(valStr);
      return isNaN(parsed) ? 0 : parsed;
    }
    const parsed = parseFloat(comp);
    return isNaN(parsed) ? 0 : parsed;
  };

  let total = 0;
  let found = false;

  // Reading
  const readingComp =
    activeTolerance.reading || activeTolerance.tolerances?.reading;
  if (readingComp) {
    const readingPcn = getComponentValue(readingComp);
    if (readingPcn !== 0) {
      total += Math.abs(nominalVal * (readingPcn / 100));
      found = true;
    }
  }

  // Floor
  const floorComp = activeTolerance.floor || activeTolerance.tolerances?.floor;
  if (floorComp) {
    const floorVal = getComponentValue(floorComp);
    if (floorVal !== 0) {
      total += Math.abs(floorVal);
      found = true;
    }
  }

  // Generic (Single Value)
  if (!found && (activeTolerance.tolerance || activeTolerance.value)) {
    const tolVal = getComponentValue(activeTolerance);
    if (tolVal !== 0) {
      total += Math.abs(tolVal);
      found = true;
    }
  }

  // Range (% of Full Scale) - FIX
  const rangeComp = activeTolerance.range || activeTolerance.tolerances?.range;
  if (rangeComp) {
    const rangePcn = getComponentValue(rangeComp);

    // FIX: Prioritize explicit "Range Value" (Manual FS) over "Range Max"
    const manualFS = parseFloat(rangeComp.value);
    const rangeMax = parseFloat(activeTolerance.max);
    const fs = !isNaN(manualFS) ? manualFS : rangeMax;

    if (rangePcn !== 0 && !isNaN(fs)) {
      // Basic % of Range calculation
      total += Math.abs(fs * (rangePcn / 100));
      found = true;
    }
  }

  let numericTolerance = null;

  if (found) {
    numericTolerance = total;
  } else {
    // 2. Fallback: Parse Standard Utility String
    const utilResult = getToleranceErrorSummary(activeTolerance, nominalObj);
    if (
      utilResult &&
      utilResult !== "Not Calculated" &&
      utilResult !== "± -" &&
      !utilResult.includes("NaN")
    ) {
      const match = utilResult.match(/±\s*([\d.]+)/);
      if (match && match[1]) {
        numericTolerance = parseFloat(match[1]);
      }
    }
  }

  // Format Results
  if (numericTolerance !== null) {
    const low = nominalVal - numericTolerance;
    const high = nominalVal + numericTolerance;
    return {
      numericTolerance,
      limits: { low: low.toPrecision(6), high: high.toPrecision(6) },
      display: `± ${Number(numericTolerance.toPrecision(4))} ${nominalObj?.unit || ""}`,
    };
  }

  return {
    numericTolerance: null,
    limits: { low: "-", high: "-" },
    display: "No Range / Spec",
  };
};

// --- HELPERS FOR EQUATION EDITOR ---

// --- RE-INSERTED EDITABLE CELL COMPONENT ---
const EditableCell = ({
  value,
  onSave,
  type = "text",
  suffix = "",
  style = {},
  placeholder = "",
  className = "",
}) => {
  const [isEditing, setIsEditing] = useState(false);

  // FIX: Default to "" if value is null/undefined
  const [currentValue, setCurrentValue] = useState(value ?? "");

  // FIX: Update effect to also handle null/undefined
  useEffect(() => {
    setCurrentValue(value ?? "");
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    const cleanVal =
      typeof currentValue === "string" ? currentValue.trim() : currentValue;
    if (cleanVal != value) {
      onSave(cleanVal);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleBlur();
    }
  };

  if (isEditing) {
    return (
      <input
        autoFocus
        type={type}
        // FIX: Ensure value is never undefined in the input tag
        value={currentValue ?? ""}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        style={{
          width: "100%",
          padding: "4px",
          boxSizing: "border-box",
          ...style,
        }}
      />
    );
  }
  return (
    <div
      onClick={() => setIsEditing(true)}
      style={{
        cursor: "text",
        minHeight: "20px",
        borderBottom: "1px dashed var(--border-color)",
        paddingBottom: "2px",
        color: !value && placeholder ? "var(--text-color-muted)" : "inherit",
        ...style,
      }}
      className={`editable-cell-display ${className}`}
      title="Click to edit"
    >
      {value || placeholder} {suffix}
    </div>
  );
};

// ---  Inline Quick Add Row Component ---
const QuickAddRow = ({
  selectedUuts,
  localRangeIndices,
  resolveRangeHelper,
  onSave,
  showAreaColumn,
  sessionData,
  // NEW PROPS
  viewMode,
  rangeData,
  contextId, // usually the UUT ID in range view
  hoveredCell,
  setHoveredCell,
}) => {
  // Local state for the inputs
  const [val, setVal] = useState("");
  const [unit, setUnit] = useState("");
  const [section, setSection] = useState("");

  // Determine effective selection based on View Mode
  const effectiveSelectedUuts = useMemo(() => {
    if (viewMode === "range" && contextId) {
      const uut = sessionData.uuts.find((u) => u.id === contextId);
      return uut ? [uut] : [];
    }
    return selectedUuts;
  }, [viewMode, contextId, selectedUuts, sessionData.uuts]);

  const isDisabled = effectiveSelectedUuts.length === 0;

  // Auto-detect unit from selected UUT when selection changes
  useEffect(() => {
    if (effectiveSelectedUuts.length > 0) {
      const primaryUut = effectiveSelectedUuts[0];

      // If in Range View, use the specific range passed down
      if (viewMode === "range" && rangeData?.unit) {
        if (!unit) setTimeout(() => setUnit(rangeData.unit), 0);
      }
      // Otherwise resolve normally
      else {
        const { activeRange } = resolveRangeHelper(
          primaryUut,
          localRangeIndices,
          null,
          null,
        );
        if (activeRange?.unit && !unit) {
          setTimeout(() => setUnit(activeRange.unit), 0);
        }
      }
    }
  }, [
    effectiveSelectedUuts,
    localRangeIndices,
    resolveRangeHelper,
    unit,
    viewMode,
    rangeData,
  ]);

  // Real-time Preview Calculation
  const previewMetrics = useMemo(() => {
    if (!val) return { display: "-", limits: { low: "-", high: "-" } };

    let activeTolerance = {};

    // If in Range View, FORCE the specific range
    if (viewMode === "range" && rangeData) {
      activeTolerance = rangeData;
    }
    // Otherwise use selection logic
    else if (effectiveSelectedUuts.length > 0) {
      const primaryUut = effectiveSelectedUuts[0];
      const nominalObj = { value: val, unit: unit };
      const { activeRange } = resolveRangeHelper(
        primaryUut,
        localRangeIndices,
        null,
        nominalObj,
      );
      activeTolerance = activeRange || {};
    }

    // Calculate limits
    return calculateToleranceMetrics(activeTolerance, {
      value: val,
      unit: unit,
    });
  }, [
    val,
    unit,
    effectiveSelectedUuts,
    localRangeIndices,
    resolveRangeHelper,
    viewMode,
    rangeData,
  ]);

  const handleSave = () => {
    if (!val || !unit) return;

    // Determine Measurement Area ID (Robust Lookup)
    let areaId = null;
    if (effectiveSelectedUuts.length > 0) {
      const primaryUut = effectiveSelectedUuts[0];
      if (primaryUut.measurementAreaId) {
        areaId = primaryUut.measurementAreaId;
      } else if (primaryUut.measurementArea && sessionData?.measurementAreas) {
        const matchedArea = sessionData.measurementAreas.find(
          (a) => a.name === primaryUut.measurementArea,
        );
        if (matchedArea) areaId = matchedArea.id;
      }
    }

    // Construct payload
    const newPoint = {
      section: section,
      measurementType: "direct",
      testPointInfo: {
        parameter: { name: "Measurement", value: val, unit: unit },
      },
      associatedUutIds: effectiveSelectedUuts.map((u) => u.id),
      measurementAreaId: areaId,
    };

    // CRITICAL FIX: If in Range View, inject the specific tolerance
    if (viewMode === "range" && rangeData) {
      newPoint.uutTolerance = rangeData;
    }

    onSave(newPoint);
    setVal("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
  };

  return (
    <tr
      style={{
        borderBottom: "1px solid var(--border-color)",
        backgroundColor: "var(--background-secondary)",
        transition: "background-color 0.2s ease",
      }}
    >
      <td
        className={`cell-section ${hoveredCell?.tableId === "points" && hoveredCell?.colIndex === 0 ? "col-hovered" : ""}`}
        onMouseEnter={() =>
          setHoveredCell && setHoveredCell({ tableId: "points", colIndex: 0 })
        }
        style={{ padding: "4px 8px" }}
      >
        <input
          type="text"
          placeholder="Section"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          className="quick-add-input organic-input"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            padding: "6px 0",
            fontSize: "0.9rem",
            color: "var(--text-color)",
            outline: "none",
            borderBottom: "1px solid transparent",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) =>
            (e.target.style.borderBottom = "1px solid var(--primary-color)")
          }
          onBlur={(e) =>
            (e.target.style.borderBottom = "1px solid transparent")
          }
        />
      </td>
      <td
        className={`cell-value ${hoveredCell?.tableId === "points" && hoveredCell?.colIndex === 1 ? "col-hovered" : ""}`}
        onMouseEnter={() =>
          setHoveredCell && setHoveredCell({ tableId: "points", colIndex: 1 })
        }
        style={{ padding: "4px 8px" }}
      >
        <input
          type="text"
          placeholder={isDisabled ? "Select UUT..." : "Value..."}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          className="quick-add-input organic-input"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            padding: "6px 0",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: "var(--primary-color)",
            outline: "none",
            borderBottom: "1px solid transparent",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) =>
            (e.target.style.borderBottom = "1px solid var(--primary-color)")
          }
          onBlur={(e) =>
            (e.target.style.borderBottom = "1px solid transparent")
          }
        />
      </td>
      <td
        className={`cell-unit ${hoveredCell?.tableId === "points" && hoveredCell?.colIndex === 2 ? "col-hovered" : ""}`}
        onMouseEnter={() =>
          setHoveredCell && setHoveredCell({ tableId: "points", colIndex: 2 })
        }
        style={{ padding: "4px 8px" }}
      >
        <input
          type="text"
          placeholder="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          className="quick-add-input organic-input"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            padding: "6px 0",
            fontSize: "0.9rem",
            color: "var(--text-color-muted)",
            outline: "none",
            borderBottom: "1px solid transparent",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) =>
            (e.target.style.borderBottom = "1px solid var(--primary-color)")
          }
          onBlur={(e) =>
            (e.target.style.borderBottom = "1px solid transparent")
          }
        />
      </td>
      {/* Live Preview Columns */}
      <td
        className={`cell-tolerance ${hoveredCell?.tableId === "points" && hoveredCell?.colIndex === 3 ? "col-hovered" : ""}`}
        onMouseEnter={() =>
          setHoveredCell && setHoveredCell({ tableId: "points", colIndex: 3 })
        }
        style={{
          padding: "4px 8px",
          verticalAlign: "middle",
          fontSize: "0.85rem",
          fontStyle: "italic",
          color: "var(--text-color-muted)",
        }}
      >
        {previewMetrics.display}
      </td>
      <td
        className={`cell-limit ${hoveredCell?.tableId === "points" && hoveredCell?.colIndex === 4 ? "col-hovered" : ""}`}
        onMouseEnter={() =>
          setHoveredCell && setHoveredCell({ tableId: "points", colIndex: 4 })
        }
        style={{
          padding: "4px 8px",
          verticalAlign: "middle",
          fontSize: "0.85rem",
          color: "var(--text-color-muted)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            {previewMetrics.limits.low !== "-" ? (
              <>
                <span style={{ opacity: 0.7 }}>
                  {previewMetrics.limits.low}
                </span>
                <span style={{ margin: "0 4px", fontSize: "0.75rem" }}>→</span>
                <span style={{ opacity: 0.7 }}>
                  {previewMetrics.limits.high}
                </span>
              </>
            ) : (
              "-"
            )}
          </span>
          {!showAreaColumn && !isDisabled && val && (
            <button
              onClick={handleSave}
              className="btn-icon-only"
              style={{
                color: "var(--primary-color)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                marginLeft: "8px",
              }}
            >
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
          )}
        </div>
      </td>
      {showAreaColumn && (
        <td className="cell-area">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span></span>
            {!isDisabled && val && (
              <button
                onClick={handleSave}
                className="btn-icon-only"
                style={{
                  color: "var(--primary-color)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <FontAwesomeIcon icon={faArrowRight} />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
};

// --- UPDATED: SUMMARY DASHBOARD ---
const SummaryDashboard = ({
  viewMode,
  contextId,
  sessionData,
  onDeleteTestPoint,
  rangeData,
  uutId,
  onSaveTestPoint,
  onEditSession,
  selectedPointIds,
  setSelectedPointIds,
  onSelectUut,
  onSelectTestPoint,
  // NEW PROPS PASSED DOWN FROM APP/ANALYSIS
  onDeleteUut,
  onDeleteTmdeDefinition,
  onEditUut,
  onAddTmde,
  onEditTmde,
  // Global UUT Selection (synced with sidebar Quick Add)
  currentUutSelection = [],
  setCurrentUutSelection,
}) => {
  // --- SELECTION STATE ---
  // Use global UUT selection for sync with sidebar Quick Add
  const selectedUutIds = currentUutSelection || [];
  const setSelectedUutIds = setCurrentUutSelection || (() => {});
  const [selectedTmdeIds, setSelectedTmdeIds] = useState([]);

  const [localRangeIndices, setLocalRangeIndices] = useState({});
  const [tmdeRangeIndices, setTmdeRangeIndices] = useState({});

  // Industry Grade Highlighting State
  const [hoveredCell, setHoveredCell] = useState({
    tableId: null,
    colIndex: null,
  });
  const [hoveredRowId, setHoveredRowId] = useState(null);

  // Filter Data based on Hierarchy
  const {
    filteredUuts,
    filteredPoints,
    filteredTmdes,
    title,
    subtitle,
    showAreaColumn,
  } = useMemo(() => {
    let uuts = sessionData.uuts || [];
    let points = sessionData.testPoints || [];
    let displayTitle = "Session Overview";
    let displaySubtitle = "All Measurement Areas";

    const isSessionView = viewMode === "session";

    if (viewMode === "area") {
      const area = sessionData.measurementAreas?.find(
        (a) => a.id === contextId,
      );
      displayTitle = area?.name || "Measurement Area";
      displaySubtitle = "Area Summary";
      uuts = uuts.filter((u) => {
        const idMatch = u.measurementAreaId === contextId;
        const nameMatch =
          area && u.measurementArea && u.measurementArea === area.name;
        return idMatch || nameMatch;
      });
      points = points.filter((tp) => tp.measurementAreaId === contextId);
    } else if (viewMode === "uut") {
      const uut = uuts.find((u) => u.id === contextId);
      displayTitle = uut?.description || "UUT Detail";
      displaySubtitle = `${uut?.manufacturer || ""} ${uut?.model || ""}`;
      uuts = uut ? [uut] : [];
      points = points.filter(
        (tp) => tp.associatedUutIds && tp.associatedUutIds.includes(contextId),
      );
    } else if (viewMode === "range") {
      const uut = uuts.find((u) => u.id === uutId);
      uuts = uut ? [uut] : [];
      points = points.filter((tp) => {
        if (!tp.associatedUutIds || !tp.associatedUutIds.includes(uutId))
          return false;
        const ptTol = tp.uutTolerance;
        if (!ptTol) return false;
        if (rangeData._id !== undefined && ptTol._id !== undefined) {
          if (rangeData._id === ptTol._id) return true;
        }
        const minMatch = ptTol.min == rangeData.min;
        const maxMatch = ptTol.max == rangeData.max;
        const unitMatch = (ptTol.unit || "") === (rangeData.unit || "");
        const funcMatch = rangeData.functionName
          ? ptTol.functionName === rangeData.functionName
          : true;
        return minMatch && maxMatch && unitMatch && funcMatch;
      });
      displayTitle = rangeData.label || "Range Detail";
      displaySubtitle = `${uut?.description || "UUT"} (${uut?.model || ""})`;
    }

    return {
      filteredUuts: uuts,
      filteredPoints: points,
      filteredTmdes: sessionData.tmdes || [], // Always show all TMDEs
      title: displayTitle,
      subtitle: displaySubtitle,
      showAreaColumn: isSessionView,
    };
  }, [viewMode, contextId, sessionData, rangeData, uutId]);

  // --- HANDLERS ---

  // Selection Handlers (Wrapped)
  // Selection Handlers (Wrapped)
  const handleUutClick = (e, id) =>
    handleRowSelection(e, id, selectedUutIds, setSelectedUutIds);
  const handleTmdeClick = (e, id) =>
    handleRowSelection(e, id, selectedTmdeIds, setSelectedTmdeIds);

  // NEW: Batch Delete for UUTs
  const handleDeleteSelectedUuts = useCallback(() => {
    if (onDeleteUut && selectedUutIds.length > 0) {
      onDeleteUut(selectedUutIds);
      setSelectedUutIds([]);
    }
  }, [onDeleteUut, selectedUutIds]);

  // NEW: Batch Delete for TMDEs
  const handleDeleteSelectedTmdes = useCallback(() => {
    if (onDeleteTmdeDefinition && selectedTmdeIds.length > 0) {
      onDeleteTmdeDefinition(selectedTmdeIds);
      setSelectedTmdeIds([]);
    }
  }, [onDeleteTmdeDefinition, selectedTmdeIds]);

  // Keyboard Listener for Delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Determine context based on what is selected
        if (
          document.activeElement.tagName !== "INPUT" &&
          document.activeElement.tagName !== "TEXTAREA"
        ) {
          if (selectedUutIds.length > 0) {
            e.preventDefault();
            handleDeleteSelectedUuts();
          } else if (selectedTmdeIds.length > 0) {
            e.preventDefault();
            handleDeleteSelectedTmdes();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedUutIds,
    selectedTmdeIds,
    handleDeleteSelectedUuts,
    handleDeleteSelectedTmdes,
  ]);

  const resolveRangeWrapper = (uut, indices, savedTol, nominal) => {
    return resolveUutRangeHelper(uut, indices, savedTol, nominal);
  };

  return (
    <div className="configuration-panel">
      {/* Header */}
      <div
        style={{
          paddingBottom: "10px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.3rem" }}>
          {viewMode === "range" && (
            <FontAwesomeIcon
              icon={faRulerCombined}
              style={{ marginRight: "10px", color: "var(--primary-color)" }}
            />
          )}
          {title}
        </h2>
        <div
          style={{
            color: "var(--text-color-muted)",
            fontSize: "0.85rem",
            marginTop: "4px",
          }}
        >
          {subtitle}
        </div>
      </div>

      {/* UUT TABLE */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <FontAwesomeIcon icon={faMicroscope} />
            <span>Units Under Test ({filteredUuts.length})</span>
          </div>
          <div className="panel-card-actions">
            {selectedUutIds.length > 0 && (
              <button
                className="btn-delete-selection"
                onClick={handleDeleteSelectedUuts}
                title={`Delete ${selectedUutIds.length} Selected UUTs`}
              >
                <FontAwesomeIcon icon={faTrashAlt} size="xs" />
              </button>
            )}
            <button
              className="btn-add-item"
              onClick={() => onEditUut && onEditUut(null)}
              title="Add New UUT"
            >
              <FontAwesomeIcon icon={faPlus} size="xs" />
            </button>
          </div>
        </div>
        <div className="panel-table-container">
          <table
            className="instrument-summary-table industry-table"
            onMouseLeave={() => {
              setHoveredCell({ tableId: null, colIndex: null });
              setHoveredRowId(null);
            }}
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: showAreaColumn ? "34%" : "42%" }} />
              <col style={{ width: showAreaColumn ? "26%" : "30%" }} />
              <col style={{ width: showAreaColumn ? "25%" : "28%" }} />
              {showAreaColumn && <col style={{ width: "15%" }} />}
            </colgroup>
            <thead>
              <tr>
                <th>Description</th>
                <th>Range</th>
                <th>Specification</th>
                {showAreaColumn && <th>Area</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUuts.length === 0 ? (
                <tr className="panel-empty-row">
                  <td colSpan={showAreaColumn ? 4 : 3}>
                    No UUTs found in this context.
                  </td>
                </tr>
              ) : (
                filteredUuts.map((uut) => {
                  let resolution = resolveUutRangeHelper(
                    uut,
                    localRangeIndices,
                    null,
                    null,
                  );

                  if (
                    viewMode === "range" &&
                    rangeData &&
                    localRangeIndices[uut.id] === undefined
                  ) {
                    const matchIndex = resolution.ranges.findIndex((r) => {
                      if (rangeData._id !== undefined && r._index !== undefined)
                        return r._index === rangeData._id;
                      const minMatch = r.min == rangeData.min;
                      const maxMatch = r.max == rangeData.max;
                      const unitMatch =
                        (r.unit || "") === (rangeData.unit || "");
                      return minMatch && maxMatch && unitMatch;
                    });

                    if (matchIndex !== -1) {
                      resolution = {
                        ...resolution,
                        activeIndex: matchIndex,
                        activeRange: resolution.ranges[matchIndex],
                      };
                    }
                  }

                  const { ranges, activeIndex, activeRange } = resolution;
                  const specRows = getSpecRows(activeRange);
                  const rowSpan = specRows.length > 0 ? specRows.length : 1;
                  const isSelected = selectedUutIds.includes(uut.id);

                  const area = sessionData.measurementAreas?.find(
                    (a) =>
                      a.id === uut.measurementAreaId ||
                      a.name === uut.measurementArea,
                  );
                  const areaName = area
                    ? area.name
                    : uut.measurementArea || "-";
                  const areaColor = area?.color || "var(--text-color-muted)";

                  return (
                    <React.Fragment key={uut.id}>
                      <tr
                        className={`${isSelected ? "selected-row" : ""} ${hoveredRowId === uut.id ? "row-hovered" : ""}`}
                        onClick={(e) => handleUutClick(e, uut.id)}
                        onMouseEnter={() => setHoveredRowId(uut.id)}
                        onDoubleClick={() => onEditUut && onEditUut(uut)}
                        style={{
                          cursor: "pointer",
                          borderBottom:
                            specRows.length > 1 ? "none" : undefined,
                        }}
                      >
                        <td
                          rowSpan={rowSpan}
                          className={`cell-description ${hoveredCell.tableId === "uut" && hoveredCell.colIndex === 0 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "uut", colIndex: 0 })
                          }
                          title={uut.description}
                        >
                          {uut.description}
                        </td>
                        <td
                          rowSpan={rowSpan}
                          className={`cell-value ${hoveredCell.tableId === "uut" && hoveredCell.colIndex === 1 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "uut", colIndex: 1 })
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            className="session-selector"
                            value={activeIndex}
                            onChange={(e) =>
                              setLocalRangeIndices((prev) => ({
                                ...prev,
                                [uut.id]: parseInt(e.target.value),
                              }))
                            }
                          >
                            {ranges.map((range, idx) => {
                              const rangeLabel =
                                (typeof range.range === "string"
                                  ? range.range
                                  : null) ||
                                (range.min !== undefined
                                  ? `${range.min} to ${range.max}`
                                  : "Full Range");
                              return (
                                <option
                                  key={idx}
                                  value={idx}
                                >{`${rangeLabel} ${range.unit || ""}`}</option>
                              );
                            })}
                          </select>
                        </td>
                        <td
                          className={`cell-tolerance ${hoveredCell.tableId === "uut" && hoveredCell.colIndex === 2 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "uut", colIndex: 2 })
                          }
                          title={specRows[0]}
                        >
                          {specRows[0]}
                        </td>
                        {showAreaColumn && (
                          <td
                            rowSpan={rowSpan}
                            className={`cell-area ${hoveredCell.tableId === "uut" && hoveredCell.colIndex === 3 ? "col-hovered" : ""}`}
                            onMouseEnter={() =>
                              setHoveredCell({ tableId: "uut", colIndex: 3 })
                            }
                            title={areaName}
                          >
                            <span style={{ color: areaColor }}>{areaName}</span>
                          </td>
                        )}
                      </tr>
                      {specRows.slice(1).map((specComp, sIdx) => (
                        <tr
                          key={`${uut.id}-spec-${sIdx}`}
                          className={`${isSelected ? "selected-row spec-row" : "spec-row"} ${hoveredRowId === uut.id ? "row-hovered" : ""}`}
                          onMouseEnter={() => setHoveredRowId(uut.id)}
                          style={{ cursor: "pointer" }}
                          onClick={(e) => handleUutClick(e, uut.id)}
                          onDoubleClick={() => onEditUut && onEditUut(uut)}
                        >
                          <td
                            className={`cell-tolerance ${hoveredCell.tableId === "uut" && hoveredCell.colIndex === 2 ? "col-hovered" : ""}`}
                            onMouseEnter={() =>
                              setHoveredCell({ tableId: "uut", colIndex: 2 })
                            }
                            title={specComp}
                          >
                            {specComp}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TMDE TABLE */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <FontAwesomeIcon icon={faTools} />
            <span>
              Test Measurement Device Equipment ({filteredTmdes.length})
            </span>
          </div>
          <div className="panel-card-actions">
            {selectedTmdeIds.length > 0 && (
              <button
                className="btn-delete-selection"
                onClick={handleDeleteSelectedTmdes}
                title={`Delete ${selectedTmdeIds.length} Selected TMDEs`}
              >
                <FontAwesomeIcon icon={faTrashAlt} size="xs" />
              </button>
            )}
            <button
              className="btn-add-item"
              onClick={onAddTmde}
              title="Add New TMDE"
            >
              <FontAwesomeIcon icon={faPlus} size="xs" />
            </button>
          </div>
        </div>
        <div className="panel-table-container">
          <table
            className="instrument-summary-table industry-table"
            onMouseLeave={() => {
              setHoveredCell({ tableId: null, colIndex: null });
              setHoveredRowId(null);
            }}
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "42%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "28%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Description</th>
                <th>Range</th>
                <th>Specification</th>
              </tr>
            </thead>
            <tbody>
              {filteredTmdes.length === 0 ? (
                <tr className="panel-empty-row">
                  <td colSpan={3}>No TMDEs found in session.</td>
                </tr>
              ) : (
                filteredTmdes.map((tmde, idx) => {
                  const resolution = resolveUutRangeHelper(
                    tmde,
                    tmdeRangeIndices,
                    null,
                    null,
                  );
                  const { ranges, activeIndex, activeRange } = resolution;
                  const specRows = getSpecRows(activeRange);
                  const rowSpan = specRows.length > 0 ? specRows.length : 1;
                  const isSelected = selectedTmdeIds.includes(tmde.id);

                  return (
                    <React.Fragment key={tmde.id || idx}>
                      <tr
                        className={`${isSelected ? "selected-row" : ""} ${hoveredRowId === tmde.id ? "row-hovered" : ""}`}
                        onClick={(e) => handleTmdeClick(e, tmde.id)}
                        onMouseEnter={() => setHoveredRowId(tmde.id)}
                        onDoubleClick={() => onEditTmde && onEditTmde(tmde)}
                        style={{
                          cursor: "pointer",
                          borderBottom:
                            specRows.length > 1 ? "none" : undefined,
                        }}
                      >
                        <td
                          rowSpan={rowSpan}
                          className={`cell-description ${hoveredCell.tableId === "tmde" && hoveredCell.colIndex === 0 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "tmde", colIndex: 0 })
                          }
                          title={tmde.name}
                        >
                          <div style={{ fontWeight: 600 }}>{tmde.name}</div>
                          {tmde.instrument && (
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--text-color-muted)",
                                marginTop: "2px",
                              }}
                            >
                              {tmde.instrument.manufacturer}{" "}
                              {tmde.instrument.model}
                            </div>
                          )}
                        </td>
                        <td
                          rowSpan={rowSpan}
                          className={`cell-value ${hoveredCell.tableId === "tmde" && hoveredCell.colIndex === 1 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "tmde", colIndex: 1 })
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            className="session-selector"
                            value={activeIndex}
                            onChange={(e) =>
                              setTmdeRangeIndices((prev) => ({
                                ...prev,
                                [tmde.id]: parseInt(e.target.value),
                              }))
                            }
                          >
                            {ranges.map((range, rIdx) => {
                              const rangeLabel =
                                (typeof range.range === "string"
                                  ? range.range
                                  : null) ||
                                (range.min !== undefined
                                  ? `${range.min} to ${range.max}`
                                  : "Full Range");
                              return (
                                <option
                                  key={rIdx}
                                  value={rIdx}
                                >{`${rangeLabel} ${range.unit || ""}`}</option>
                              );
                            })}
                          </select>
                        </td>
                        <td
                          className={`cell-tolerance ${hoveredCell.tableId === "tmde" && hoveredCell.colIndex === 2 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "tmde", colIndex: 2 })
                          }
                          title={specRows[0]}
                        >
                          {specRows[0]}
                        </td>
                      </tr>
                      {specRows.slice(1).map((specComp, sIdx) => (
                        <tr
                          key={`${tmde.id}-spec-${sIdx}`}
                          className={`${isSelected ? "selected-row spec-row" : "spec-row"} ${hoveredRowId === tmde.id ? "row-hovered" : ""}`}
                          style={{ cursor: "pointer" }}
                          onClick={(e) => handleTmdeClick(e, tmde.id)}
                          onMouseEnter={() => setHoveredRowId(tmde.id)}
                          onDoubleClick={() => onEditTmde && onEditTmde(tmde)}
                        >
                          <td
                            className={`cell-tolerance ${hoveredCell.tableId === "tmde" && hoveredCell.colIndex === 2 ? "col-hovered" : ""}`}
                            onMouseEnter={() =>
                              setHoveredCell({ tableId: "tmde", colIndex: 2 })
                            }
                            title={specComp}
                          >
                            {specComp}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function DetailedView({
  testPointData,
  sessionData,
  calcResults,
  calculationError,
  uutNominal,
  uutToleranceData: propUutToleranceData,
  tmdeTolerancesData,
  onAddManualComponent,
  onEditManualComponent,
  onRemoveComponent,
  onInlineUutUpdate,
  onInlineTmdeUpdate,
  onBudgetRowContextMenu,
  onDefineTestPoint,
  onShowDerivedBreakdown,
  onShowRiskBreakdown,
  showContribution,
  setShowContribution,
  onOpenRepeatability,
  onOpenCorrelation,
  onUpdateTestPoint,
  riskResults,
  setNotification,
  onToggleUut,
  onDeleteTestPoint,
  currentUutSelection = [],
  activeRangeIndices = {},
  onRangeSelectionChange,

  // NEW PROPS FOR ACTIONS
  onAddTmde,
  onEditUut,
  onEditTmde,
  onDeleteUut,
  onDeleteTmdeDefinition,
}) {
  const [isSymbolMenuOpen, setIsSymbolMenuOpen] = useState(false);
  const [tmdeRangeIndices, setTmdeRangeIndices] = useState({});

  // --- NEW: Local Selection State ---
  const [selectedUutIds, setSelectedUutIds] = useState([]);
  const [selectedTmdeIds, setSelectedTmdeIds] = useState([]);

  // Industry Grade Highlighting State
  // Industry Grade Highlighting State
  const [hoveredCell, setHoveredCell] = useState({
    tableId: null,
    colIndex: null,
  });
  const [hoveredRowId, setHoveredRowId] = useState(null);

  const equationInputRef = useRef(null);
  const symbolMenuRef = useRef(null);
  const symbolButtonRef = useRef(null);

  // --- NEW: Row Selection Handlers ---
  const handleRowSelectionLocal = (e, id, currentSelected, setSelected) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    } else {
      setSelected([id]);
    }
  };

  const handleUutClick = (e, id) =>
    handleRowSelectionLocal(e, id, selectedUutIds, setSelectedUutIds);
  const handleTmdeClick = (e, id) =>
    handleRowSelectionLocal(e, id, selectedTmdeIds, setSelectedTmdeIds);

  const handleDeleteSelectedUuts = () => {
    if (onDeleteUut && selectedUutIds.length > 0) {
      onDeleteUut(selectedUutIds);
      setSelectedUutIds([]);
    }
  };

  const handleDeleteSelectedTmdes = () => {
    if (onDeleteTmdeDefinition && selectedTmdeIds.length > 0) {
      onDeleteTmdeDefinition(selectedTmdeIds);
      setSelectedTmdeIds([]);
    }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        symbolMenuRef.current &&
        !symbolMenuRef.current.contains(event.target) &&
        symbolButtonRef.current &&
        !symbolButtonRef.current.contains(event.target)
      ) {
        setIsSymbolMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const uutToleranceData = useMemo(() => {
    const isUnassigned =
      !testPointData.associatedUutIds ||
      testPointData.associatedUutIds.length === 0;
    if (isUnassigned) return {};
    return propUutToleranceData || {};
  }, [propUutToleranceData, testPointData.associatedUutIds]);

  // --- RESOLUTION HELPER WITH DEBUG LOGS ---
  const resolveUutRange = useCallback(
    (uut) => {
      const resolution = resolveUutRangeHelper(
        uut,
        activeRangeIndices,
        uutToleranceData,
        uutNominal,
      );
      return resolution;
    },
    [activeRangeIndices, uutToleranceData, uutNominal],
  );

  const groupedUnitOptions = useMemo(() => {
    const allSupportedUnits = Object.keys(unitSystem.units);
    const options = [];
    const usedUnits = new Set();

    Object.entries(unitCategories).forEach(([category, units]) => {
      const validUnits = units.filter((u) => allSupportedUnits.includes(u));
      if (validUnits.length > 0) {
        options.push({
          label: category,
          options: validUnits.map((u) => {
            usedUnits.add(u);
            return { value: u, label: u };
          }),
        });
      }
    });

    const leftovers = allSupportedUnits
      .filter((u) => !usedUnits.has(u))
      .sort()
      .map((u) => ({ value: u, label: u }));

    if (leftovers.length > 0) {
      options.push({ label: "Other", options: leftovers });
    }

    return options;
  }, []);

  const activeMeasurementAreaId = testPointData.measurementAreaId;

  // We read directly from sessionData to ensure we catch mutations/updates from the modal
  const relevantUuts = sessionData.uuts || [];

  const associatedUutIds = testPointData.associatedUutIds || [];
  const isDerived = testPointData.measurementType === "derived";
  const isUnassigned = associatedUutIds.length === 0;

  const availableVariables = useMemo(() => {
    if (!isDerived) return [];
    if (
      testPointData.variableMappings &&
      Object.values(testPointData.variableMappings).length > 0
    ) {
      const vars = Object.values(testPointData.variableMappings)
        .map((v) => (v ? String(v).trim() : "")) // <--- FIX: Ensure it is a string first
        .filter((v) => v !== "");
      return [...new Set(vars)];
    }
    return [];
  }, [testPointData, isDerived]);

  // --- HANDLERS ---
  const handleUutCheckboxChange = (uutId) => {
    onToggleUut(uutId);
  };

  const handleRangeChange = (uutId, newIndex, ranges) => {
    if (onRangeSelectionChange) {
      onRangeSelectionChange((prev) => ({ ...prev, [uutId]: newIndex }));
    }
  };

  const handleActionAdd = () => {
    if (!currentUutSelection || currentUutSelection.length === 0) {
      onDefineTestPoint([], null);
      return;
    }

    const primaryUutId = currentUutSelection[0];
    const primaryUut = relevantUuts.find((u) => u.id === primaryUutId);
    let resolvedTolerance = null;

    if (primaryUut) {
      const { activeRange } = resolveUutRange(primaryUut);
      resolvedTolerance = activeRange;
    }

    onDefineTestPoint(currentUutSelection, resolvedTolerance);
  };

  const handleActionRemove = () => {
    if (!testPointData.id) {
      if (onDeleteTestPoint) onDeleteTestPoint(null);
      return;
    }

    setNotification({
      title: "Delete Measurement Point",
      message: "Are you sure you want to delete this measurement point?",
      confirmText: "Delete",
      isIconConfirm: true,
      onConfirm: () => {
        if (onDeleteTestPoint) onDeleteTestPoint(testPointData.id);
      },
    });
  };

  const handleEquationChange = (newEquationString) => {
    let variables = [];
    try {
      if (newEquationString && newEquationString.trim()) {
        let expressionToParse = newEquationString.trim();
        const equalsIndex = expressionToParse.indexOf("=");
        if (equalsIndex !== -1) {
          expressionToParse = expressionToParse
            .substring(equalsIndex + 1)
            .trim();
        }

        const node = math.parse(expressionToParse);
        const varsSet = new Set();
        node.traverse(function (node) {
          if (
            node.isSymbolNode &&
            !math[node.name] &&
            !["e", "pi", "i"].includes(node.name.toLowerCase())
          ) {
            varsSet.add(node.name);
          }
        });
        variables = Array.from(varsSet).sort();
      }
    } catch {
      /* ignore */
    }

    const currentMappings = testPointData.variableMappings || {};
    const newMappings = {};
    variables.forEach((v) => {
      newMappings[v] = currentMappings[v] || "";
    });

    if (onUpdateTestPoint) {
      onUpdateTestPoint({
        equationString: newEquationString,
        variableMappings: newMappings,
      });
    }
  };

  const handleSymbolClick = (symbol) => {
    const input = equationInputRef.current;
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const currentValue = input.value;
    const selectedText = currentValue.substring(start, end);

    let newValue;
    let newCursorPos;

    const isFunction = symbol.endsWith("()");

    if (isFunction) {
      const funcName = symbol.slice(0, -2);
      const textToInsert = `${funcName}(${selectedText})`;
      newValue =
        currentValue.substring(0, start) +
        textToInsert +
        currentValue.substring(end);
      newCursorPos =
        start + (selectedText ? textToInsert.length + 1 : funcName.length + 1);
    } else {
      newValue =
        currentValue.substring(0, start) + symbol + currentValue.substring(end);
      newCursorPos = start + symbol.length;
    }

    handleEquationChange(newValue);

    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleVariableMappingChange = (symbol, newName) => {
    const cleanedName = newName ? newName.trim() : "";
    const newMappings = {
      ...testPointData.variableMappings,
      [symbol]: cleanedName,
    };
    if (onUpdateTestPoint) {
      onUpdateTestPoint({ variableMappings: newMappings });
    }
  };

  // Write a distribution divisor (e.g. "1.960") onto every tolerance
  // sub-component of a TMDE instance. getBudgetComponentsFromTolerance reads
  // `.distribution` off these sub-components, so this re-derives the budget and
  // (via the tmdeTolerances dependency) the risk metrics.
  const applyDistributionToTmde = (tmdeInstance, divisor) => {
    const compKeys = ["reading", "readings_iv", "range", "floor", "db"];
    const writeOn = (obj) => {
      const next = { ...obj };
      compKeys.forEach((k) => {
        if (next[k] && typeof next[k] === "object") {
          next[k] = { ...next[k], distribution: divisor };
        }
      });
      return next;
    };

    const next = { ...tmdeInstance };
    if (next.tolerance && typeof next.tolerance === "object") {
      next.tolerance = writeOn(next.tolerance);
    } else if (
      next.tolerances &&
      typeof next.tolerances === "object" &&
      !Array.isArray(next.tolerances)
    ) {
      next.tolerances = writeOn(next.tolerances);
    } else {
      // Flattened instance: sub-components live directly on the instance.
      compKeys.forEach((k) => {
        if (next[k] && typeof next[k] === "object") {
          next[k] = { ...next[k], distribution: divisor };
        }
      });
    }
    return next;
  };

  const handleComponentUpdate = (id, updates, component) => {
    // Distribution change on the UUT's own resolution row. This component is
    // synthesized from the UUT tolerance (it has no sourceTmdeId and isn't a
    // manual or TMDE component), so without this branch the change fell through
    // and the dropdown appeared frozen. Route the divisor back to the UUT
    // tolerance's resolution distribution so the budget + risk recompute.
    if (
      updates.distribution !== undefined &&
      (component?.componentId === "UUT Resolution" || id === "uut_resolution")
    ) {
      onUpdateTestPoint({
        uutTolerance: {
          ...uutToleranceData,
          measuringResolutionDistribution: updates.distribution,
        },
      });
      return;
    }

    // Distribution change on a TMDE-derived accuracy row: route the divisor
    // back to the originating TMDE instance so the budget + risk recompute (#6).
    if (updates.distribution !== undefined && component?.sourceTmdeId) {
      const divisor = updates.distribution;
      const targetId = component.sourceTmdeId;
      const updatedTmdes = tmdeTolerancesData.map((t) => {
        if (t.id !== targetId && t.sourceId !== targetId) return t;
        // A Resolution row targets the resolution's own divisor, not the
        // accuracy sub-components (otherwise it would corrupt the accuracy
        // distribution with this value).
        return component.isResolution
          ? { ...t, measuringResolutionDistribution: divisor }
          : applyDistributionToTmde(t, divisor);
      });
      onUpdateTestPoint({ tmdeTolerances: updatedTmdes });
      return;
    }

    // 1. Try Manual Components
    const currentManualComponents = testPointData.components || [];
    const manualComp = currentManualComponents.find((c) => c.id === id);

    // 1a. Distribution change on a manual Type B / Resolution component. Its
    // standard uncertainty was precomputed as (input / divisor), so changing
    // the divisor must recompute the value — it scales as 1/divisor. (Type A
    // has no divisor; its distribution is fixed Normal.)
    if (
      updates.distribution !== undefined &&
      manualComp &&
      manualComp.originalInput &&
      manualComp.type !== "A"
    ) {
      const oldDiv =
        parseFloat(manualComp.originalInput.errorDistributionDivisor) || 1;
      const newDivStr = String(updates.distribution);
      const newDiv = parseFloat(newDivStr);
      if (!isNaN(newDiv) && newDiv > 0 && oldDiv > 0) {
        const scale = oldDiv / newDiv;
        const baseLabel =
          oldErrorDistributions.find((d) => d.value === newDivStr)?.label ||
          newDivStr;
        const updated = {
          ...manualComp,
          value:
            typeof manualComp.value === "number"
              ? manualComp.value * scale
              : manualComp.value,
          value_native:
            typeof manualComp.value_native === "number"
              ? manualComp.value_native * scale
              : manualComp.value_native,
          distribution: manualComp.originalInput.isResolution
            ? `${baseLabel} (Res)`
            : baseLabel,
          originalInput: {
            ...manualComp.originalInput,
            errorDistributionDivisor: newDivStr,
          },
        };
        const updatedComponents = currentManualComponents.map((c) =>
          c.id === id ? updated : c,
        );
        onUpdateTestPoint({ components: updatedComponents });
      }
      return;
    }

    if (manualComp) {
      const updatedComponents = currentManualComponents.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      );
      onUpdateTestPoint({ components: updatedComponents });
      return;
    }
    // 2. Try TMDE Components
    if (tmdeTolerancesData.some((t) => t.id === id)) {
      const updatedTmdes = tmdeTolerancesData.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      );
      onUpdateTestPoint({ tmdeTolerances: updatedTmdes });
    }
  };

  const handleAssignTmdeToVariable = (symbol, tmdeIdStr) => {
    const varName = testPointData.variableMappings?.[symbol] || "";
    if (!varName) return;

    // The "Assigned Source" dropdown is a picker: it chooses which TMDE backs a
    // variable. It must NOT spawn a new table instance on every selection.
    // We always start from a copy where any prior holder of this variable is
    // cleared, then either re-tag an existing instance or add the target once.
    let nextTolerances = tmdeTolerancesData.map((t) =>
      t.variableType === varName ? { ...t, variableType: "" } : t,
    );

    // Clearing the source ("-- No Source --").
    if (!tmdeIdStr) {
      onUpdateTestPoint({ tmdeTolerances: nextTolerances });
      return;
    }

    const targetTmde =
      sessionData.tmdes?.find((t) => t.id == tmdeIdStr) ||
      tmdeTolerancesData.find((t) => t.id == tmdeIdStr);
    if (!targetTmde) return;
    const realTmdeId = targetTmde.id;

    // Is this TMDE already present in the budget (by id or sourceId)? If so,
    // just tag it with the variable rather than appending a duplicate.
    const existing = nextTolerances.find(
      (t) => t.id === realTmdeId || t.sourceId === realTmdeId,
    );

    if (existing) {
      nextTolerances = nextTolerances.map((t) =>
        t.id === existing.id ? { ...t, variableType: varName } : t,
      );
    } else {
      nextTolerances = [
        ...nextTolerances,
        {
          ...targetTmde,
          variableType: varName,
          quantity: 1,
          measurementPoint: targetTmde.measurementPoint || {
            value: "",
            unit: "",
          },
        },
      ];
    }

    onUpdateTestPoint({ tmdeTolerances: nextTolerances });
  };

  const handleToggleTmdeUsage = (tmdeId, isChecked) => {
    if (isChecked) {
      const sourceTmde = sessionData.tmdes.find((t) => t.id === tmdeId);
      if (sourceTmde) {
        const resolution = resolveUutRangeHelper(
          sourceTmde,
          tmdeRangeIndices,
          null,
          null,
        );
        const activeRange = resolution.activeRange || {};
        const { id: rangeId, ...rangeSpecs } = activeRange;

        const newInstance = {
          ...sourceTmde,
          ...rangeSpecs,
          id: sourceTmde.id,
          sourceId: sourceTmde.id,
          quantity: 1,
        };

        const newTolerances = [...tmdeTolerancesData, newInstance];
        onUpdateTestPoint({ tmdeTolerances: newTolerances });
      }
    } else {
      const newTolerances = tmdeTolerancesData.filter(
        (t) => t.id !== tmdeId && t.sourceId !== tmdeId,
      );
      onUpdateTestPoint({ tmdeTolerances: newTolerances });
    }
  };

  const handleTmdeRangeChange = (tmde, newIndex, ranges) => {
    setTmdeRangeIndices((prev) => ({ ...prev, [tmde.id]: newIndex }));

    const activeInstance = tmdeTolerancesData.find((t) => t.id === tmde.id);
    if (activeInstance && onUpdateTestPoint) {
      const selectedRange = ranges[newIndex] || {};
      const { id: rangeId, ...rangeSpecs } = selectedRange;

      const updatedInstance = {
        ...activeInstance,
        ...rangeSpecs,
        id: activeInstance.id,
      };

      const updatedTolerances = tmdeTolerancesData.map((t) =>
        t.id === tmde.id ? updatedInstance : t,
      );
      onUpdateTestPoint({ tmdeTolerances: updatedTolerances });
    }
  };

  const equationDisplayData = useMemo(() => {
    if (!isDerived) return null;

    const currentMappings = testPointData.variableMappings || {};
    const vars = Object.keys(currentMappings)
      .sort()
      .map((symbol) => {
        const name = currentMappings[symbol];
        const assignedTmde = tmdeTolerancesData.find(
          (t) =>
            t.variableType &&
            name &&
            String(t.variableType).trim() === String(name).trim(),
        );

        return {
          symbol,
          name,
          isAssigned: !!assignedTmde,
          value: assignedTmde?.measurementPoint?.value,
          unit: assignedTmde?.measurementPoint?.unit,
          // --- FIX: Add fallback for name to prevent crash ---
          instrumentName: assignedTmde?.name || "Unknown Device",
          tmdeId: assignedTmde?.id,
        };
      });

    return {
      equation: testPointData.equationString || "",
      variables: vars,
    };
  }, [isDerived, testPointData, tmdeTolerancesData]);

  const hasMeasurementPoint =
    isDerived ||
    (uutNominal &&
      uutNominal.value !== undefined &&
      uutNominal.value !== "" &&
      uutNominal.value !== null);
  // This detailed table shows a single active point, so the Section column is
  // driven purely by whether THIS point has a section. If it was left blank
  // when the point was added, no Section column is shown (#4).
  const showSectionColumn = useMemo(
    () => Boolean(String(testPointData.section || "").trim()),
    [testPointData.section],
  );
  const hasUnassignedVariables =
    isDerived && equationDisplayData?.variables.some((v) => !v.isAssigned);

  const isBackendMappingError =
    calculationError &&
    (calculationError.includes("Variable mappings are missing") ||
      calculationError.includes("Input data missing") ||
      calculationError.includes("Internal error"));

  const calculatedNominal = calcResults?.calculatedNominalValue;
  const targetNominal = parseFloat(uutNominal?.value);

  const getCalculatedStatus = () => {
    if (isNaN(calculatedNominal) || isNaN(targetNominal)) return "neutral";
    const diff = Math.abs(calculatedNominal - targetNominal);
    const tolerance = Math.max(Math.abs(targetNominal * 0.0001), 1e-9);
    return diff <= tolerance ? "match" : "mismatch";
  };

  const calcStatus = getCalculatedStatus();

  const calcStatusStyle = {
    match: {
      borderColor: "var(--status-good)",
      backgroundColor: "rgba(76, 175, 80, 0.1)",
      color: "var(--status-good)",
      icon: faCheckCircle,
    },
    mismatch: {
      borderColor: "var(--status-bad)",
      backgroundColor: "rgba(255, 82, 82, 0.1)",
      color: "var(--status-bad)",
      icon: faTimesCircle,
    },
    neutral: {
      borderColor: "var(--border-color)",
      backgroundColor: "transparent",
      color: "var(--text-color-muted)",
      icon: null,
    },
  }[calcStatus];

  const primaryUutId = testPointData.associatedUutIds?.[0];
  const primaryUut = relevantUuts.find((u) => u.id === primaryUutId);

  const activeResolvedTolerance = useMemo(() => {
    if (!primaryUut) return uutToleranceData;
    const { activeRange } = resolveUutRange(primaryUut);
    return activeRange && Object.keys(activeRange).length > 0
      ? activeRange
      : uutToleranceData;
  }, [primaryUut, resolveUutRange, uutToleranceData]);

  // Auto-Save Effect
  useEffect(() => {
    if (activeResolvedTolerance && uutToleranceData) {
      const isDifferent =
        activeResolvedTolerance.range !== uutToleranceData.range ||
        activeResolvedTolerance.min != uutToleranceData.min ||
        activeResolvedTolerance.max != uutToleranceData.max ||
        activeResolvedTolerance.unit !== uutToleranceData.unit;

      if (isDifferent && onUpdateTestPoint) {
        onUpdateTestPoint({ uutTolerance: activeResolvedTolerance });
      }
    }
  }, [activeResolvedTolerance, uutToleranceData, onUpdateTestPoint]);

  const calculatedToleranceDisplay = useMemo(() => {
    const result = calculateToleranceMetrics(
      activeResolvedTolerance,
      uutNominal,
    );
    return result.display;
  }, [activeResolvedTolerance, uutNominal]);

  return (
    <div className="configuration-panel">
      <div className="uut-measurement-grid">
        {/* 1. UUT INFORMATION */}
        <div className="panel-card uut-detail-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <FontAwesomeIcon icon={faMicroscope} />
            <span>Unit Under Test</span>
          </div>
          <div className="panel-card-actions">
            {selectedUutIds.length > 0 && (
              <button
                className="btn-delete-selection"
                onClick={handleDeleteSelectedUuts}
                title={`Delete ${selectedUutIds.length} Selected UUTs`}
              >
                <FontAwesomeIcon icon={faTrashAlt} size="xs" />
              </button>
            )}
            <button
              className="btn-add-item"
              onClick={() => onEditUut && onEditUut(null)}
              title="Add New UUT"
            >
              <FontAwesomeIcon icon={faPlus} size="xs" />
            </button>
          </div>
        </div>
        <div className="panel-table-container" style={{ maxHeight: "300px" }}>
          <table
            className="instrument-summary-table industry-table"
            onMouseLeave={() => {
              setHoveredCell({ tableId: null, colIndex: null });
              setHoveredRowId(null);
            }}
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "40%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "30%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Description</th>
                <th>Range</th>
                <th>Specification</th>
              </tr>
            </thead>
            <tbody>
              {relevantUuts.length === 0 ? (
                <tr className="panel-empty-row">
                  <td colSpan="3">No associated UUTs found.</td>
                </tr>
              ) : (
                relevantUuts.map((uut) => {
                  const { ranges, activeIndex, activeRange } =
                    resolveUutRange(uut);
                  const isLinked =
                    testPointData.associatedUutIds &&
                    testPointData.associatedUutIds.includes(uut.id);
                  const specRows = getSpecRows(activeRange);
                  const rowSpan = specRows.length > 0 ? specRows.length : 1;
                  const isSelected = selectedUutIds.includes(uut.id);

                  return (
                    <React.Fragment key={uut.id}>
                      <tr
                        className={`${isSelected ? "selected-row" : ""} ${hoveredRowId === uut.id ? "row-hovered" : ""}`}
                        onMouseEnter={() => setHoveredRowId(uut.id)}
                        style={{
                          borderLeft:
                            isLinked || isSelected
                              ? "4px solid var(--primary-color)"
                              : "4px solid transparent",
                          cursor: "pointer",
                        }}
                        onClick={(e) => handleUutClick(e, uut.id)}
                        onDoubleClick={() => onEditUut && onEditUut(uut)}
                        title="Click to select, Double-click to edit UUT details"
                      >
                        <td
                          rowSpan={rowSpan}
                          className={`cell-description ${hoveredCell.tableId === "uut_det" && hoveredCell.colIndex === 0 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "uut_det", colIndex: 0 })
                          }
                          style={{
                            color: isLinked
                              ? "var(--primary-color)"
                              : undefined,
                          }}
                        >
                          {uut.description}
                        </td>

                        <td
                          rowSpan={rowSpan}
                          className={`cell-value ${hoveredCell.tableId === "uut_det" && hoveredCell.colIndex === 1 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "uut_det", colIndex: 1 })
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            className="session-selector"
                            value={activeIndex}
                            onChange={(e) =>
                              handleRangeChange(
                                uut.id,
                                parseInt(e.target.value),
                                ranges,
                              )
                            }
                          >
                            {ranges.map((range, idx) => {
                              let rangeText =
                                typeof range.range === "string"
                                  ? range.range
                                  : null;
                              if (!rangeText) {
                                if (
                                  range.min !== undefined &&
                                  range.max !== undefined
                                ) {
                                  rangeText = `${range.min} to ${range.max}`;
                                } else {
                                  rangeText = "Full Range";
                                }
                              }
                              const label = `${rangeText} ${range.unit || ""}`;
                              return (
                                <option key={idx} value={idx}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        </td>

                        <td
                          className={`cell-tolerance ${hoveredCell.tableId === "uut_det" && hoveredCell.colIndex === 2 ? "col-hovered" : ""}`}
                          onMouseEnter={() =>
                            setHoveredCell({ tableId: "uut_det", colIndex: 2 })
                          }
                          title={specRows[0]}
                        >
                          {specRows[0]}
                        </td>
                      </tr>

                      {specRows.slice(1).map((specComp, sIdx) => (
                        <tr
                          key={`${uut.id}-spec-${sIdx}`}
                          className={`${isSelected ? "selected-row spec-row" : "spec-row"} ${hoveredRowId === uut.id ? "row-hovered" : ""}`}
                          onMouseEnter={() => setHoveredRowId(uut.id)}
                          style={{
                            borderLeft:
                              isLinked || isSelected
                                ? "4px solid var(--primary-color)"
                                : "4px solid transparent",
                            cursor: "pointer",
                          }}
                        >
                          <td
                            className={`cell-spec ${hoveredCell.tableId === "uut_det" && hoveredCell.colIndex === 2 ? "col-hovered" : ""}`}
                            onMouseEnter={() =>
                              setHoveredCell({
                                tableId: "uut_det",
                                colIndex: 2,
                              })
                            }
                            style={{
                              borderTop: "1px dashed var(--border-color)",
                            }}
                            title={specComp}
                          >
                            {specComp}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>

        {/* 2. MEASUREMENT POINT TABLE */}
        <div className="panel-card measurement-point-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <FontAwesomeIcon icon={faRulerCombined} />
            <span>Measurement Point</span>
          </div>
          <div className="panel-card-actions">
            {!hasMeasurementPoint && (
              <button
                className="btn-add-item"
                onClick={handleActionAdd}
                title="Add Measurement Point"
              >
                <FontAwesomeIcon icon={faPlus} size="xs" />
              </button>
            )}
          </div>
        </div>
        <div className="panel-table-container">
          <table
            className="instrument-summary-table industry-table"
            style={{ width: "100%", tableLayout: "fixed" }}
          >
            <colgroup>
              {showSectionColumn && <col style={{ width: "22%" }} />}
              <col style={{ width: showSectionColumn ? "22%" : "28%" }} />
              <col style={{ width: showSectionColumn ? "14%" : "16%" }} />
              <col style={{ width: showSectionColumn ? "30%" : "44%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                {showSectionColumn && <th style={{ paddingLeft: "20px" }}>Section</th>}
                <th>Point</th>
                <th>Unit</th>
                <th>Tolerance</th>
                <th style={{ textAlign: "center", paddingRight: "20px" }}></th>
              </tr>
            </thead>
            <tbody>
              {hasMeasurementPoint ? (
                <tr>
                  {showSectionColumn && (
                    <td style={{ paddingLeft: "20px" }}>
                      <div
                        style={{ fontWeight: 600, color: "var(--text-color)" }}
                      >
                        <EditableCell
                          value={testPointData.section}
                          onSave={(val) =>
                            onUpdateTestPoint &&
                            onUpdateTestPoint({ section: val })
                          }
                          placeholder="General"
                        />
                      </div>
                    </td>
                  )}

                  <td style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {/* Match the Section cell's weight/size so the two inline
                        inputs read as one cohesive set; the point keeps the
                        primary color to signal it's the nominal value. */}
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--primary-color)",
                      }}
                    >
                      <EditableCell
                        value={uutNominal?.value}
                        onSave={(val) =>
                          onInlineUutUpdate && onInlineUutUpdate("nominal", val)
                        }
                        type="number"
                        placeholder="0.00"
                      />
                    </div>
                  </td>

                  <td>
                    <div style={{ fontWeight: 600, paddingLeft: "4px" }}>
                      {uutNominal?.unit}
                    </div>
                  </td>

                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      {isUnassigned &&
                      (!activeResolvedTolerance ||
                        Object.keys(activeResolvedTolerance).length === 0) ? (
                        <span
                          style={{
                            fontWeight: 400,
                            color: "var(--text-color-muted)",
                            fontStyle: "italic",
                          }}
                        >
                          No UUT / Spec
                        </span>
                      ) : (
                        <span
                          style={{
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: "var(--text-color)",
                          }}
                        >
                          {calculatedToleranceDisplay}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="action-cell" style={{ paddingRight: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <span
                        className="action-icon"
                        onClick={handleActionRemove}
                        title="Delete or Unassign"
                        style={{
                          cursor: "pointer",
                          color: "var(--status-bad)",
                          fontSize: "0.9rem",
                        }}
                      >
                        <FontAwesomeIcon icon={faTrashAlt} />
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr className="panel-empty-row">
                  <td colSpan={showSectionColumn ? 5 : 4}>
                    No active point. Select a UUT range on the left and define a
                    point.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* --- MIDDLE ROW: EQUATION --- */}
      <div className="measurement-equation-section">
        {isDerived && equationDisplayData && (
          <div className="measurement-equation-block">
            <h3 className="panel-section-title">Measurement Equation</h3>
            <div className="measurement-equation-card">
              <div className="input-with-symbol-button">
                <input
                  ref={equationInputRef}
                  type="text"
                  className="measurement-equation-input"
                  value={equationDisplayData.equation}
                  onChange={(e) => handleEquationChange(e.target.value)}
                  placeholder="e.g. V / R or W * L"
                />
                <button
                  type="button"
                  className="symbol-toggle-button"
                  title="Show Symbols"
                  ref={symbolButtonRef}
                  onClick={() => setIsSymbolMenuOpen(!isSymbolMenuOpen)}
                >
                  f(x)
                </button>

                {isSymbolMenuOpen && (
                  <div
                    className="symbol-popout"
                    ref={symbolMenuRef}
                    style={{ maxHeight: "300px", overflowY: "auto" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "10px",
                        paddingBottom: "5px",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                        Math Symbols
                      </span>
                      <span
                        onClick={() => setIsSymbolMenuOpen(false)}
                        style={{ cursor: "pointer" }}
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </span>
                    </div>
                    {symbolCategories.map((category) => (
                      <div key={category.name} className="symbol-category">
                        <h5 className="symbol-category-title">
                          {category.name}
                        </h5>
                        <div className="symbol-category-grid">
                          {category.symbols.map((sym) => (
                            <SymbolButton
                              key={sym}
                              symbol={sym}
                              onSymbolClick={handleSymbolClick}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {calcStatus !== "neutral" && (
                <div
                  className="measurement-equation-status"
                  style={{
                    border: `1px solid ${calcStatusStyle.borderColor}`,
                    backgroundColor: calcStatusStyle.backgroundColor,
                    color: calcStatusStyle.color,
                  }}
                >
                  <div className="measurement-equation-status-main">
                    <FontAwesomeIcon icon={calcStatusStyle.icon} />
                    <span>
                      Calculated:{" "}
                      <strong>
                        {calculatedNominal?.toPrecision(6)} {uutNominal?.unit}
                      </strong>
                    </span>
                  </div>
                  <div className="measurement-equation-status-target">
                    (Target: {targetNominal?.toPrecision(6)} {uutNominal?.unit})
                  </div>
                </div>
              )}

              <div className="var-map-grid measurement-equation-var-grid">
                {equationDisplayData.variables.map((v) => (
                  <div
                    key={v.symbol}
                    className={`var-card-modern ${v.isAssigned ? "assigned" : "unassigned"}`}
                  >
                    <div className="var-card-header">
                      <div className="var-symbol-badge">{v.symbol}</div>
                      <input
                        type="text"
                        className="var-name-input"
                        value={v.name || ""}
                        placeholder="Map to (e.g. Volts)..."
                        onChange={(e) =>
                          handleVariableMappingChange(v.symbol, e.target.value)
                        }
                      />
                    </div>

                    <div className="var-card-body">
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--text-color-muted)",
                            marginBottom: "5px",
                          }}
                        >
                          ASSIGNED SOURCE
                        </label>
                        <select
                          className="var-source-select"
                          value={v.tmdeId || ""}
                          onChange={(e) =>
                            handleAssignTmdeToVariable(v.symbol, e.target.value)
                          }
                          disabled={!v.name}
                        >
                          <option value="">
                            -- No Source (Manual Entry) --
                          </option>
                          {sessionData.tmdes?.map((tmde) => (
                            <option key={tmde.id} value={tmde.id}>
                              {tmde.name || "Unnamed TMDE"}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--text-color-muted)",
                            marginBottom: "5px",
                          }}
                        >
                          VALUE
                        </label>
                        {v.isAssigned ? (
                          <div className="var-value-display">
                            <EditableCell
                              value={v.value}
                              type="number"
                              onSave={(val) =>
                                onInlineTmdeUpdate &&
                                onInlineTmdeUpdate(v.tmdeId, "nominal", val)
                              }
                              style={{
                                fontFamily: "'Consolas', monospace",
                                fontSize: "1.1rem",
                                fontWeight: 700,
                                color: "var(--primary-color)",
                                backgroundColor: "transparent",
                                border: "none",
                                padding: 0,
                                width: "100px",
                              }}
                            />
                            <div
                              style={{
                                width: "85px",
                                marginLeft: "5px",
                                borderBottom: "1px dashed var(--border-color)",
                              }}
                            >
                              <Select
                                options={groupedUnitOptions}
                                value={
                                  groupedUnitOptions
                                    .flatMap((g) => g.options)
                                    .find((opt) => opt.value === v.unit) ||
                                  (v.unit
                                    ? { value: v.unit, label: v.unit }
                                    : null)
                                }
                                onChange={(opt) =>
                                  onInlineTmdeUpdate &&
                                  opt &&
                                  onInlineTmdeUpdate(
                                    v.tmdeId,
                                    "unit",
                                    opt.value,
                                  )
                                }
                                styles={customUnitSelectStyles}
                                placeholder="Unit"
                                menuPortalTarget={document.body}
                                isSearchable={true}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            className="var-value-display"
                            style={{
                              backgroundColor: "var(--input-background)",
                            }}
                          >
                            <span
                              style={{
                                color: "var(--text-color-muted)",
                                fontSize: "0.9rem",
                                fontStyle: "italic",
                              }}
                            >
                              <FontAwesomeIcon
                                icon={faExclamationTriangle}
                                style={{
                                  color: "var(--status-warning)",
                                  marginRight: "6px",
                                }}
                              />
                              Map source above
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- BOTTOM ROW: TMDEs (Kept as is) --- */}
      <div style={{ marginBottom: "30px" }}>
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <FontAwesomeIcon icon={faTools} />
              <span>Measurement Standards (TMDE)</span>
            </div>
            <div className="panel-card-actions">
              {selectedTmdeIds.length > 0 && (
                <button
                  className="btn-delete-selection"
                  onClick={handleDeleteSelectedTmdes}
                  title={`Delete ${selectedTmdeIds.length} Selected TMDEs`}
                >
                  <FontAwesomeIcon icon={faTrashAlt} size="xs" />
                </button>
              )}
              <button
                className="btn-add-item"
                onClick={onAddTmde}
                title="Add New TMDE"
              >
                <FontAwesomeIcon icon={faPlus} size="xs" />
              </button>
            </div>
          </div>

          <div className="panel-table-container">
            <table
              className="instrument-summary-table industry-table"
              onMouseLeave={() => {
                setHoveredCell({ tableId: null, colIndex: null });
                setHoveredRowId(null);
              }}
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                {/* The "Use" checkbox column is redundant for derived points —
                    assigning a TMDE to an equation variable is the inclusion
                    action there — so it's only shown for direct measurements. */}
                {!isDerived && <col style={{ width: "50px" }} />}
                <col style={{ width: "40%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "30%" }} />
              </colgroup>
              <thead>
                <tr>
                  {!isDerived && <th style={{ textAlign: "center" }}>Use</th>}
                  <th>Description</th>
                  <th>Range</th>
                  <th>Specification</th>
                </tr>
              </thead>
              <tbody>
                {!sessionData.tmdes || sessionData.tmdes.length === 0 ? (
                  <tr className="panel-empty-row">
                    <td colSpan={isDerived ? 3 : 4}>
                      No TMDEs defined in Session.
                    </td>
                  </tr>
                ) : (
                  sessionData.tmdes.map((masterTmde) => {
                    // Check selection state
                    const isSelectedRow = selectedTmdeIds.includes(
                      masterTmde.id,
                    );

                    const activeInstances = tmdeTolerancesData.filter(
                      (t) =>
                        t.id === masterTmde.id ||
                        (t.sourceId && t.sourceId === masterTmde.id),
                    );
                    const rowsToRender =
                      activeInstances.length > 0
                        ? activeInstances
                        : [masterTmde];

                    return rowsToRender.map((tmdeInstance, idx) => {
                      const isChecked = activeInstances.includes(tmdeInstance);
                      // const referencePoint = tmdeInstance.measurementPoint || { value: '', unit: '' }; // Removed unused reference

                      const savedTolerance = isChecked ? tmdeInstance : null;
                      const resolution = resolveUutRangeHelper(
                        masterTmde,
                        tmdeRangeIndices,
                        savedTolerance,
                        null,
                      );
                      const { ranges, activeIndex, activeRange } = resolution;

                      const effectiveTolerance = activeRange;
                      const specRows = getSpecRows(effectiveTolerance);
                      const rowSpan = specRows.length > 0 ? specRows.length : 1;

                      const safeDescription =
                        masterTmde.description ||
                        masterTmde.name ||
                        (masterTmde.instrument
                          ? `${masterTmde.instrument.manufacturer} ${masterTmde.instrument.model}`
                          : "Unknown TMDE");

                      return (
                        <React.Fragment key={`${masterTmde.id}-${idx}`}>
                          <tr
                            className={`tmde-row ${isSelectedRow ? "selected-row" : ""} ${hoveredRowId === masterTmde.id ? "row-hovered" : ""}`}
                            onMouseEnter={() => setHoveredRowId(masterTmde.id)}
                            style={{
                              // Apply Selection Highlight
                              borderLeft: isSelectedRow
                                ? "4px solid var(--primary-color)"
                                : "4px solid transparent",
                              opacity: isChecked ? 1 : isSelectedRow ? 1 : 0.7,
                              cursor: "pointer",
                            }}
                            // Click Handlers
                            onClick={(e) => handleTmdeClick(e, masterTmde.id)}
                            onDoubleClick={() =>
                              onEditTmde && onEditTmde(masterTmde)
                            }
                            title="Click to select, Double-click to edit TMDE details"
                          >
                            {!isDerived && (
                              <td
                                rowSpan={rowSpan}
                                style={{
                                  textAlign: "center",
                                  verticalAlign: "top",
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={`${hoveredCell.tableId === "tmde_det" && hoveredCell.colIndex === 0 ? "col-hovered" : ""}`}
                                onMouseEnter={() =>
                                  setHoveredCell({
                                    tableId: "tmde_det",
                                    colIndex: 0,
                                  })
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) =>
                                    handleToggleTmdeUsage(
                                      masterTmde.id,
                                      e.target.checked,
                                    )
                                  }
                                  style={{ cursor: "pointer" }}
                                />
                              </td>
                            )}

                            <td
                              rowSpan={rowSpan}
                              className={`cell-description ${hoveredCell.tableId === "tmde_det" && hoveredCell.colIndex === 1 ? "col-hovered" : ""}`}
                              onMouseEnter={() =>
                                setHoveredCell({
                                  tableId: "tmde_det",
                                  colIndex: 1,
                                })
                              }
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: "var(--text-color)",
                                }}
                              >
                                {safeDescription}
                              </div>
                            </td>

                            <td
                              rowSpan={rowSpan}
                              className={`cell-value ${hoveredCell.tableId === "tmde_det" && hoveredCell.colIndex === 2 ? "col-hovered" : ""}`}
                              onMouseEnter={() =>
                                setHoveredCell({
                                  tableId: "tmde_det",
                                  colIndex: 2,
                                })
                              }
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                className="session-selector"
                                value={activeIndex}
                                onChange={(e) =>
                                  handleTmdeRangeChange(
                                    masterTmde,
                                    parseInt(e.target.value),
                                    ranges,
                                  )
                                }
                              >
                                {ranges.map((range, rIdx) => {
                                  let rangeText =
                                    typeof range.range === "string"
                                      ? range.range
                                      : null;
                                  if (!rangeText) {
                                    if (
                                      range.min !== undefined &&
                                      range.max !== undefined
                                    )
                                      rangeText = `${range.min} to ${range.max}`;
                                    else rangeText = "Full Range";
                                  }
                                  const label = `${rangeText} ${range.unit || ""}`;
                                  return (
                                    <option key={rIdx} value={rIdx}>
                                      {label}
                                    </option>
                                  );
                                })}
                              </select>
                            </td>

                            <td
                              className={`cell-tolerance ${hoveredCell.tableId === "tmde_det" && hoveredCell.colIndex === 3 ? "col-hovered" : ""}`}
                              onMouseEnter={() =>
                                setHoveredCell({
                                  tableId: "tmde_det",
                                  colIndex: 3,
                                })
                              }
                              title={specRows[0]}
                            >
                              {specRows[0]}
                            </td>
                          </tr>

                          {specRows.slice(1).map((specComp, sIdx) => (
                            <tr
                              key={`${masterTmde.id}-${idx}-spec-${sIdx}`}
                              className={`${isSelectedRow ? "selected-row spec-row" : "spec-row"} ${hoveredRowId === masterTmde.id ? "row-hovered" : ""}`}
                              style={{
                                borderLeft: isSelectedRow
                                  ? "4px solid var(--primary-color)"
                                  : "4px solid transparent",
                                opacity: isChecked ? 1 : 0.7,
                              }}
                            >
                              <td
                                className={`${hoveredCell.tableId === "tmde_det" && hoveredCell.colIndex === 3 ? "col-hovered" : ""}`}
                                onMouseEnter={() =>
                                  setHoveredCell({
                                    tableId: "tmde_det",
                                    colIndex: 3,
                                  })
                                }
                                style={{
                                  borderTop: "1px dashed var(--border-color)",
                                }}
                                title={specComp}
                              >
                                {specComp}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    });
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {hasMeasurementPoint ? (
        hasUnassignedVariables || isBackendMappingError ? (
          <div
            className="placeholder-content"
            style={{ padding: "20px", color: "var(--text-color-muted)" }}
          >
            {hasUnassignedVariables
              ? "Map all equation variables to a TMDE above to calculate budget."
              : "Complete the equation configuration to calculate budget."}
          </div>
        ) : calculationError ? (
          <div className="form-section-warning">
            <p>Calculation Error: {calculationError}</p>
          </div>
        ) : (
          <>
            <UncertaintyBudgetTable
              components={calcResults?.calculatedBudgetComponents || []}
              onRemove={onRemoveComponent}
              onComponentUpdate={handleComponentUpdate}
              calcResults={calcResults}
              referencePoint={uutNominal}
              uncertaintyConfidence={sessionData.uncReq.uncertaintyConfidence}
              onRowContextMenu={onBudgetRowContextMenu}
              equationString={testPointData.equationString}
              measurementType={testPointData.measurementType}
              riskResults={riskResults}
              onShowDerivedBreakdown={onShowDerivedBreakdown}
              onShowRiskBreakdown={onShowRiskBreakdown}
              showContribution={showContribution}
              setShowContribution={setShowContribution}
              hasTmde={tmdeTolerancesData.length > 0}
              onAddManualComponent={onAddManualComponent}
              onEdit={onEditManualComponent}
              onOpenRepeatability={onOpenRepeatability}
              onOpenCorrelation={onOpenCorrelation}
              setNotification={setNotification}
              onBudgetSettingsChange={onUpdateTestPoint}
              useEffectiveDofByGroup={
                testPointData.useEffectiveDofByGroup || {}
              }
            />
            {showContribution &&
              calcResults?.calculatedBudgetComponents?.length > 0 && (
                <PercentageBarGraph
                  type={testPointData.measurementType === "derived"}
                  unit={uutNominal?.unit || "Units"}
                  data={Object.fromEntries(
                    calcResults.calculatedBudgetComponents.map((item) => {
                      const value =
                        testPointData.measurementType === "derived"
                          ? item.contribution || 0
                          : item.value_native || item.value || 0;
                      const label = item.name.startsWith("Input: ")
                        ? item.name.substring(7)
                        : item.name;
                      return [label, value];
                    }),
                  )}
                />
              )}
          </>
        )
      ) : (
        <div
          className="placeholder-content"
          style={{
            marginTop: "30px",
            borderTop: "1px solid var(--border-color)",
            paddingTop: "30px",
          }}
        >
          <h3>Ready to Measure</h3>
          <p>
            Select a UUT Specification Range (top left) and define a Measurement
            Point (top right) to begin analysis.
          </p>
        </div>
      )}
    </div>
  );
}

const UncertaintyPanel = (props) => {
  const {
    testPointData,
    sessionData,
    onDefineTestPoint,
    onDeleteTestPoint,
    onSaveTestPoint,
  } = props;
  const viewMode = testPointData.viewMode || "point";

  if (viewMode !== "point") {
    return (
      <SummaryDashboard
        viewMode={viewMode}
        contextId={testPointData.id}
        rangeData={testPointData.rangeData}
        uutId={testPointData.uutId}
        sessionData={sessionData}
        onDefineTestPoint={onDefineTestPoint}
        onDeleteTestPoint={onDeleteTestPoint}
        onSaveTestPoint={onSaveTestPoint}
        onEditSession={props.handleOpenSessionEditor}
        selectedPointIds={props.selectedTablePointIds || []}
        setSelectedPointIds={props.setSelectedTablePointIds || (() => {})}
        // Global UUT Selection for Sidebar Quick Add
        currentUutSelection={props.currentUutSelection}
        setCurrentUutSelection={props.setCurrentUutSelection}
        // Navigation Handlers
        onSelectUut={props.onSelectUut}
        onSelectTestPoint={props.onSelectTestPoint}
        // New Actions Passed Down
        onDeleteUut={props.onDeleteUut}
        onDeleteTmdeDefinition={props.onDeleteTmdeDefinition}
        onEditUut={props.onEditUut}
        onEditTmde={props.onEditTmde}
        onAddTmde={props.onAddTmde}
      />
    );
  }

  return (
    <DetailedView
      {...props}
      onAddTmde={props.onAddTmde}
      onEditUut={props.onEditUut}
      onEditTmde={props.onEditTmde}
      onDeleteUut={props.onDeleteUut}
      onDeleteTmdeDefinition={props.onDeleteTmdeDefinition}
    />
  );
};

export default UncertaintyPanel;
