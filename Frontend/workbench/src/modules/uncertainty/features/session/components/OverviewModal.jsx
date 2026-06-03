import React, { useState } from "react";
import ReactDOM from "react-dom";
import { useFloatingWindow } from "../../../hooks/useFloatingWindow";
import AddTmdeModal from "../../instruments/components/AddTmdeModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faPlus,
  faPencilAlt,
  faTrashAlt,
  faListAlt
} from "@fortawesome/free-solid-svg-icons";
import {
  getToleranceSummary,
  getAbsoluteLimits,
  calculateUncertaintyFromToleranceObject,
  convertPpmToUnit,
} from "../../../utils/uncertaintyMath";

const getPfaClass = (pfa) => {
  if (pfa == null) return "";
  if (pfa > 5) return "status-bad";
  if (pfa > 2) return "status-warning";
  return "status-good";
};

const OverviewModal = ({
  isOpen,
  onClose,
  sessionData,
  onUpdateTestPoint,
  onDeleteTmdeDefinition,
  onDecrementTmdeQuantity,
  instruments,
}) => {
  const [editingTmde, setEditingTmde] = useState(null);

  // Floating Window Logic
  const { position, handleMouseDown } = useFloatingWindow({
    isOpen,
    defaultWidth: 1100,
    defaultHeight: 800,
    initialPosition: typeof window !== 'undefined' ? {
      x: Math.max(0, (window.innerWidth - 1100) / 2),
      y: Math.max(0, (window.innerHeight - 800) / 2)
    } : null
  });

  if (!isOpen || !sessionData) return null;

  // --- Handlers ---

  const handleEditTmdeClick = (tmde, testPoint) => {
    setEditingTmde({ tmde, testPoint });
  };

  const handleAddTmdeClick = (testPoint) => {
    setEditingTmde({ tmde: null, testPoint });
  };

  const handleSaveTmde = (savedTmde) => {
    const testPoint = editingTmde.testPoint;
    const tolerances = testPoint.tmdeTolerances || [];
    const existingIndex = tolerances.findIndex((t) => t.id === savedTmde.id);

    let newTolerances;
    if (existingIndex > -1) {
      newTolerances = [...tolerances];
      newTolerances[existingIndex] = savedTmde;
    } else {
      newTolerances = [...tolerances, savedTmde];
    }

    onUpdateTestPoint(testPoint.id, { tmdeTolerances: newTolerances });
    setEditingTmde(null);
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content floating-window-content"
        style={{
          position: 'fixed',
          top: position.y,
          left: position.x,
          margin: 0,
          width: '1100px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2000,
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* --- Header --- */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '15px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--component-header-bg)',
            cursor: 'move',
            userSelect: 'none'
          }}
          onMouseDown={handleMouseDown}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FontAwesomeIcon icon={faListAlt} style={{ color: 'var(--primary-color)', fontSize: '1.2rem' }} />
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Session Overview</h3>
          </div>
          <button onClick={onClose} className="modal-close-button" style={{ position: 'static' }}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* --- Body --- */}
        <div className="modal-main-content" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          <div className="tmde-management-container">
            {sessionData.testPoints && sessionData.testPoints.length > 0 ? (
              sessionData.testPoints.map((tp, index) => (
                <div key={tp.id || index} style={{ marginBottom: "50px" }}>

                  {/* Test Point Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: "2px solid var(--border-color)",
                    paddingBottom: "10px",
                    marginBottom: "15px"
                  }}>
                    <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
                      <span style={{ color: "var(--primary-color)", fontWeight: 800 }}>TP {index + 1}:</span>
                      {tp.testPointInfo?.parameter?.value} {tp.testPointInfo?.parameter?.unit}
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-color-muted)', fontWeight: 400 }}>
                        ({tp.testPointInfo?.parameter?.name})
                      </span>
                    </h4>

                  </div>

                  {/* Instrument Table */}
                  <div className="instrument-table-container">
                    <table className="instrument-summary-table">
                      <thead>
                        <tr>
                          <th style={{ width: '90px' }}>Role</th>
                          <th>Instrument / Description</th>
                          <th>Parameter / Range</th>
                          <th>Tolerance Spec <span style={{ fontSize: '0.75em', fontWeight: 'normal', opacity: 0.8 }}></span></th>
                          <th>Std. Unc (k=1)</th>
                          <th>Limits</th>
                          <th style={{ width: '60px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* --- UUT ROW --- */}
                        <tr className="uut-row">
                          <td><span className="role-badge uut">UUT</span></td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{sessionData.uutDescription || "UUT"}</div>
                          </td>
                          <td>
                            {tp.measurementType === "derived" ? (
                              <span>Derived</span>
                            ) : (
                              <span>{tp.nominalValue} {tp.unit}</span>
                            )}
                          </td>
                          <td style={{ fontFamily: 'Consolas', fontWeight: 500 }}>
                            {getToleranceSummary(sessionData.uutTolerance)}
                          </td>
                          <td><span style={{ color: 'var(--text-color-muted)' }}>-</span></td>
                          <td>
                            {tp.measurementType !== "derived" ? (
                              <div className="limits-cell">
                                <span className="limit-val">
                                  {getAbsoluteLimits(sessionData.uutTolerance, { value: tp.nominalValue, unit: tp.unit }).low}
                                </span>
                                <span className="limit-sep">to</span>
                                <span className="limit-val">
                                  {getAbsoluteLimits(sessionData.uutTolerance, { value: tp.nominalValue, unit: tp.unit }).high}
                                </span>
                              </div>
                            ) : "-"}
                          </td>
                          <td></td>
                        </tr>

                        {/* --- TMDE ROWS --- */}
                        {(tp.tmdeTolerances || []).flatMap((tmde) => {
                          const quantity = tmde.quantity || 1;
                          return Array.from({ length: quantity }, (_, i) => {
                            const referencePoint = tmde.measurementPoint;
                            const isError = !referencePoint?.value || !referencePoint?.unit;
                            const key = `${tmde.id}-${i}`;

                            // Calculate Std Unc
                            let stdUncDisplay = "-";
                            if (!isError) {
                              const { standardUncertainty: uPpm } = calculateUncertaintyFromToleranceObject(tmde, referencePoint);
                              const uAbs = convertPpmToUnit(uPpm, referencePoint.unit, referencePoint);
                              stdUncDisplay = typeof uAbs === "number" ? `${uAbs.toPrecision(3)}` : uAbs;
                            }

                            return (
                              <tr key={key} className="tmde-row">
                                <td>
                                  <span className="role-badge tmde">TMDE {quantity > 1 ? `#${i + 1}` : ""}</span>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 500 }}>{tmde.name || "Unknown TMDE"}</div>
                                </td>
                                <td>
                                  {isError ? (
                                    <span className="status-bad">Missing Ref</span>
                                  ) : (
                                    <span>{referencePoint.value} {referencePoint.unit}</span>
                                  )}
                                </td>
                                <td
                                  className="clickable-spec-cell"
                                  onClick={() => handleEditTmdeClick(tmde, tp)}
                                  title="Edit TMDE"
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>{getToleranceSummary(tmde)}</span>
                                    <FontAwesomeIcon icon={faPencilAlt} className="edit-icon-hover" />
                                  </div>
                                </td>
                                <td>
                                  <strong>{stdUncDisplay}</strong> <span style={{ fontSize: '0.8rem', color: 'var(--text-color-muted)' }}>{!isError ? referencePoint.unit : ''}</span>
                                </td>
                                <td>
                                  {!isError ? (
                                    <div className="limits-cell">
                                      <span className="limit-val">{getAbsoluteLimits(tmde, referencePoint).low}</span>
                                      <span className="limit-sep">to</span>
                                      <span className="limit-val">{getAbsoluteLimits(tmde, referencePoint).high}</span>
                                    </div>
                                  ) : "-"}
                                </td>
                                <td className="action-cell">
                                  <div className="action-row">
                                    {quantity > 1 ? (
                                      <button
                                        className="icon-action-btn destructive"
                                        onClick={() => onDecrementTmdeQuantity(tp.id, tmde.id)}
                                        title="Remove Instance"
                                      >
                                        <FontAwesomeIcon icon={faTrashAlt} />
                                      </button>
                                    ) : (
                                      <button
                                        className="icon-action-btn destructive"
                                        onClick={() => onDeleteTmdeDefinition(tp.id, tmde.id)}
                                        title="Delete TMDE"
                                      >
                                        <FontAwesomeIcon icon={faTrashAlt} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })}

                        {(!tp.tmdeTolerances || tp.tmdeTolerances.length === 0) && (
                          <tr>
                            <td colSpan="7" style={{ textAlign: "center", padding: "20px", color: "var(--text-color-muted)", fontStyle: "italic" }}>
                              No TMDEs configured.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Risk Metrics Condensed Row */}
                  <div className="metric-pods-row-condensed" style={{ marginTop: "15px" }}>
                    {tp.riskMetrics ? (
                      <>
                        <div className={`metric-pod ${getPfaClass(tp.riskMetrics.pfa)}`}>
                          <span className="metric-pod-label">PFA</span>
                          <span className="metric-pod-value">
                            {typeof tp.riskMetrics.pfa === 'number' ? `${tp.riskMetrics.pfa.toFixed(4)} %` : '---'}
                          </span>
                        </div>
                        <div className="metric-pod pfr">
                          <span className="metric-pod-label">PFR</span>
                          <span className="metric-pod-value">
                            {typeof tp.riskMetrics.pfr === 'number' ? `${tp.riskMetrics.pfr.toFixed(4)} %` : '---'}
                          </span>
                        </div>
                        <div className="metric-pod tur">
                          <span className="metric-pod-label">TUR</span>
                          <span className="metric-pod-value">
                            {typeof tp.riskMetrics.tur === 'number' ? `${tp.riskMetrics.tur.toFixed(2)} : 1` : '---'}
                          </span>
                        </div>
                        <div className="metric-pod tar">
                          <span className="metric-pod-label">TAR</span>
                          <span className="metric-pod-value">
                            {typeof tp.riskMetrics.tar === 'number' ? `${tp.riskMetrics.tar.toFixed(2)} : 1` : '---'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <span className="risk-not-calculated">Risk metrics not calculated.</span>
                    )}
                  </div>

                </div>
              ))
            ) : (
              <div className="placeholder-content" style={{ minHeight: "200px" }}>
                <p>This session has no measurement points.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {editingTmde && (
        <div className="nested-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <AddTmdeModal
            isOpen={!!editingTmde}
            onClose={() => setEditingTmde(null)}
            onSave={handleSaveTmde}
            testPointData={editingTmde.testPoint}
            initialTmdeData={editingTmde.tmde}
            hasParentOverlay={true}
            instruments={instruments}
          />
        </div>
      )}
    </div>,
    document.body
  );
};

export default OverviewModal;