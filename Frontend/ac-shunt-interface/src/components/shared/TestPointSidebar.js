import React, { useCallback, useState, useEffect, useRef } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FaGripVertical,
  FaEraser,
  FaCheckSquare,
  FaMinusSquare,
  FaTrashAlt,
  FaPlus,
  FaEye,
} from "react-icons/fa";
import { IoDocumentText } from "react-icons/io5";
import { FaRegSquare } from "react-icons/fa6";
import {
  AVAILABLE_FREQUENCIES,
  AVAILABLE_CURRENTS,
} from "../../constants/constants";
import { useInstruments } from "../../contexts/InstrumentContext";
import DirectionToggle from '../shared/DirectionToggle'; // <-- Ensure this is imported

// Helper functions (getShuntCorrectionForPoint, getTVCCorrectionForPoint, etc.)
const getShuntCorrectionForPoint = (point, shuntRangeInAmps, shuntsData) => {
  if (!point || !shuntRangeInAmps || !shuntsData || shuntsData.length === 0) {
    return { correction: "N/A", uncertainty: "N/A" };
  }
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
      ? { correction: correction.correction, uncertainty: correction.uncertainty }
      : { correction: "N/A", uncertainty: "N/A" };
  }
  return { correction: "N/A", uncertainty: "N/A" };
};
const getTVCCorrectionForPoint = (point, tvcSn, tvcsData) => {
  if (!point || !tvcsData || tvcsData.length === 0 || !tvcSn) return null;
  const tvc = tvcsData.find((t) => String(t.serial_number) === String(tvcSn));
  if (!tvc || !Array.isArray(tvc.corrections) || tvc.corrections.length === 0) {
    return null;
  }
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
const formatFrequency = (value) =>
  (AVAILABLE_FREQUENCIES.find((f) => f.value === value) || {
    text: `${value} Hz`,
  }).text;
const formatCurrent = (value) => {
  const numValue = parseFloat(value);
  const epsilon = 1e-9;
  const found = AVAILABLE_CURRENTS.find(
    (c) => Math.abs(c.value - numValue) < epsilon
  );
  return found ? found.text : `${numValue}A`;
};

// Context Menu Component
const ContextMenu = ({
  menuState,
  onClose,
  onDelete,
  onClearReadings,
  onViewCorrections,
}) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  if (!menuState.isOpen) return null;

  const { x, y, point, hasCorrections } = menuState;
  const hasReadingsForward = onClearReadings.hasAnyReadings(point.forward);
  const hasReadingsReverse = onClearReadings.hasAnyReadings(point.reverse);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: `${y}px`, left: `${x}px` }}
    >
      <button
        className="context-menu-item"
        disabled={!hasCorrections}
        onClick={() => {
          onViewCorrections(point);
          onClose();
        }}
      >
        <FaEye /> View Corrections
      </button>
      <div className="context-menu-separator" />
      {(hasReadingsForward || hasReadingsReverse) && (
        <>
          <button
            className="context-menu-item"
            disabled={!hasReadingsForward}
            onClick={() => {
              onClearReadings.prompt("Forward", point);
              onClose();
            }}
          >
            <FaEraser /> Clear Forward Readings
          </button>
          <button
            className="context-menu-item"
            disabled={!hasReadingsReverse}
            onClick={() => {
              onClearReadings.prompt("Reverse", point);
              onClose();
            }}
          >
            <FaEraser /> Clear Reverse Readings
          </button>
          <div className="context-menu-separator" />
        </>
      )}
      <button
        className="context-menu-item danger"
        onClick={() => {
          onDelete(point);
          onClose();
        }}
      >
        <FaTrashAlt /> Delete Test Point
      </button>
    </div>
  );
};

// Sortable Test Point Item Component
const SortableTestPointItem = ({
  point,
  isFocused,
  isSelected,
  isComplete,
  isPartial,
  isCurrentlyExecuting,
  areControlsDisabled,
  onFocus,
  onToggle,
  onContextMenu,
  isContextMenuTarget,
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
    borderLeft: isComplete
      ? "4px solid var(--status-good)"
      : isPartial
      ? "4px solid var(--status-warning)"
      : "4px solid transparent",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`test-point-item-selectable ${isFocused ? "active" : ""} ${
        isComplete ? "completed" : ""
      } ${isDragging ? "dragging" : ""} ${
        isContextMenuTarget ? "context-active" : ""
      }`}
      onClick={() => onFocus(point)}
      onContextMenu={(e) => onContextMenu(e, point)}
      {...attributes}
    >
      <div
        className="drag-handle"
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
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
          {formatCurrent(point.current)} @ {formatFrequency(point.frequency)}
        </span>
        {isCurrentlyExecuting && <span className="status-indicator"></span>}
      </div>
    </div>
  );
};

// Test Point Sidebar Component
function TestPointSidebar({
  orderedTestPoints,
  uniqueTestPoints,
  tooltipData,
  focusedTP,
  selectedTPs,
  isBulkRunning,
  isCollecting,
  activeCollectionDetails,
  bulkRunProgress,
  activeDirection,
  setActiveDirection,
  onFocus,
  onToggleSelect,
  onToggleSelectAll,
  onDragEnd,
  onClearReadings,
  onDeleteTestPoint,
  onDeleteSelected,
  onAddTestPoints,
  onViewCorrections,
  onViewPointCorrections,
}) {
  const { selectedSessionId, standardTvcSn, testTvcSn } = useInstruments();
  const [contextMenu, setContextMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    point: null,
    hasCorrections: false,
  });

  const handleContextMenu = (event, point) => {
    event.preventDefault();
    if (isBulkRunning || isCollecting) return;

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
    const hasCorrections =
      shuntCorr.correction !== "N/A" ||
      stdTvcCorr !== null ||
      tiTvcCorr !== null;

    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      point: point,
      hasCorrections: hasCorrections,
    });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, x: 0, y: 0, point: null, hasCorrections: false });
  }, []);

  const hasAllReadings = useCallback(
    (point) =>
      point?.readings &&
      [
        "std_ac_open_readings",
        "std_dc_pos_readings",
        "std_dc_neg_readings",
        "std_ac_close_readings",
        "ti_ac_open_readings",
        "ti_dc_pos_readings",
        "ti_dc_neg_readings",
        "ti_ac_close_readings",
      ].every((key) => point.readings[key]?.length > 0),
    []
  );

  const hasAnyReadings = useCallback(
    (point) =>
      point?.readings &&
      Object.values(point.readings).some(
        (arr) => Array.isArray(arr) && arr.length > 0
      ),
    []
  );

  const getSelectAllState = () => {
    const selectedSize = selectedTPs.size;
    const totalSize = uniqueTestPoints.length;
    if (selectedSize === 0) return "none";
    if (selectedSize === totalSize) return "all";
    return "some";
  };

  const selectAllState = getSelectAllState();

  const SelectAllIcon = () => {
    if (selectAllState === "all") return <FaCheckSquare />;
    if (selectAllState === "some") return <FaMinusSquare />;
    return <FaRegSquare />;
  };

  const selectAllTooltip = {
    all: "Deselect All",
    some: "Select All",
    none: "Select All",
  }[selectAllState];

  return (
    <div className="test-point-sidebar-content">
      <div className="sidebar-header">
        <h4>{activeDirection === 'Forward' ? 'Forward' : 'Reverse'} Test Points</h4>
        <DirectionToggle
          activeDirection={activeDirection}
          setActiveDirection={setActiveDirection}
        />
      </div>

      {/* Actions Bar Below Header */}
      <div className="sidebar-actions-bar">
        <button
          onClick={onToggleSelectAll}
          className="sidebar-action-button"
          disabled={
            isBulkRunning || isCollecting || uniqueTestPoints.length === 0
          }
          title={selectAllTooltip}
        >
          <SelectAllIcon />
        </button>
        <button
          onClick={onDeleteSelected}
          className="sidebar-action-button"
          disabled={isBulkRunning || isCollecting || selectedTPs.size === 0}
          title="Delete Selected"
        >
          <FaTrashAlt />
        </button>
        <button
          onClick={onAddTestPoints}
          className="sidebar-action-button"
          disabled={isBulkRunning || isCollecting || !selectedSessionId}
          title="Add New Test Points"
        >
          <FaPlus />
        </button>
        {/* Spacer */}
        <div style={{ flexGrow: 1 }} />
        <button
          onClick={onViewCorrections}
          className="sidebar-action-button"
          disabled={isBulkRunning || isCollecting || !selectedSessionId}
          title="View Corrections Data"
        >
          <IoDocumentText />
        </button>
      </div>
      {/* End Actions Bar */}

      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={orderedTestPoints.map((p) => p.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="test-point-list">
            {orderedTestPoints.map((point) => {
              const isComplete =
                hasAllReadings(point.forward) && hasAllReadings(point.reverse);
              const isPartial =
                !isComplete &&
                (hasAnyReadings(point.forward) ||
                  hasAnyReadings(point.reverse));

              const isPointCurrentlyExecuting =
                (isCollecting &&
                  activeCollectionDetails?.tpId ===
                    (activeDirection === "Forward"
                      ? point.forward?.id
                      : point.reverse?.id)) ||
                (isBulkRunning && bulkRunProgress.pointKey === point.key);

              return (
                <SortableTestPointItem
                  key={point.key}
                  point={point}
                  isFocused={focusedTP?.key === point.key}
                  isSelected={selectedTPs.has(point.key)}
                  isComplete={isComplete}
                  isPartial={isPartial}
                  isCurrentlyExecuting={isPointCurrentlyExecuting}
                  areControlsDisabled={isBulkRunning || isCollecting}
                  onFocus={onFocus}
                  onToggle={onToggleSelect}
                  onContextMenu={handleContextMenu}
                  isContextMenuTarget={
                    contextMenu.isOpen && contextMenu.point?.key === point.key
                  }
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <ContextMenu
        menuState={contextMenu}
        onClose={closeContextMenu}
        onDelete={onDeleteTestPoint}
        onClearReadings={{ ...onClearReadings, hasAnyReadings }}
        onViewCorrections={onViewPointCorrections}
      />
    </div>
  );
}

export default TestPointSidebar;