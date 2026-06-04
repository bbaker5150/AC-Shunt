import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faProjectDiagram, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { correlationKey, getCorrelation } from "../../../utils/uncertaintyMath";

/**
 * Editor for the input correlation matrix of a derived test point.
 *
 * `components` is the ordered list of contributing budget items
 *   [{ id, label, signedContribution }]
 * where `id` is the stable identity used as the correlation key (variableType
 * for equation inputs, name for non-mapped manual components) and
 * `signedContribution` is its signed base-SI contribution (used only for the
 * informational sign-reduction note).
 *
 * Correlations are stored sparsely as { "<idA>|<idB>": rho } with sorted keys;
 * an empty map means independent inputs (RSS).
 */
const CorrelationMatrixModal = ({ isOpen, onClose, components = [], correlations = {}, onSave }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [matrix, setMatrix] = useState({});

  useEffect(() => {
    if (isOpen) {
      setMatrix({ ...(correlations || {}) });
      const width = 720;
      const height = 480;
      const x = typeof window !== "undefined" ? Math.max(0, (window.innerWidth - width) / 2) : 0;
      const y = typeof window !== "undefined" ? Math.max(0, (window.innerHeight - height) / 2) : 0;
      setPosition({ x, y });
    }
  }, [isOpen, correlations]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const setCell = (idRow, idCol, raw) => {
    const key = correlationKey(idRow, idCol);
    setMatrix((prev) => {
      const next = { ...prev };
      let n = parseFloat(raw);
      if (!Number.isFinite(n)) n = 0;
      n = Math.max(-1, Math.min(1, n));
      // Keep storage identity-clean: drop pairs that round back to zero.
      if (Math.abs(n) < 1e-9) delete next[key];
      else next[key] = n;
      return next;
    });
  };

  // Informational: a positive correlation on inputs whose signed contributions
  // have opposite signs (or a negative correlation on same-sign) REDUCES u_c.
  const reductionPairs = useMemo(() => {
    const out = [];
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const rho = getCorrelation(matrix, components[i].id, components[j].id);
        if (rho === 0) continue;
        const ci = components[i].signedContribution;
        const cj = components[j].signedContribution;
        if (Number.isFinite(ci) && Number.isFinite(cj) && rho * ci * cj < 0) {
          out.push(`${components[i].label} ↔ ${components[j].label}`);
        }
      }
    }
    return out;
  }, [matrix, components]);

  if (!isOpen) return null;

  const cellInput = {
    width: "64px",
    padding: "4px 6px",
    background: "var(--input-bg, rgba(255,255,255,0.04))",
    color: "inherit",
    border: "1px solid var(--border-color)",
    borderRadius: "4px",
    textAlign: "center",
  };
  const th = {
    padding: "6px 8px",
    fontSize: "0.8rem",
    color: "var(--text-color-muted)",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  return ReactDOM.createPortal(
    <div
      className="modal-content floating-window-content"
      style={{
        maxWidth: "95vw",
        width: "720px",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: position.y,
        left: position.x,
        margin: 0,
        zIndex: 9999,
        height: "auto",
        maxHeight: "90vh",
      }}
    >
      {/* DRAGGABLE HEADER */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "15px",
          cursor: "move",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              backgroundColor: "var(--primary-color-light)",
              color: "var(--primary-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
            }}
          >
            <FontAwesomeIcon icon={faProjectDiagram} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.3rem" }}>Input Correlation Matrix</h3>
            <div style={{ fontSize: "0.85rem", color: "var(--text-color-muted)" }}>
              Enter correlations between input errors (lower triangle). 0 = independent, 1 = fully correlated.
            </div>
          </div>
        </div>
        <button onClick={onClose} className="modal-close-button" style={{ position: "static", transform: "none" }}>
          &times;
        </button>
      </div>

      {/* CONTENT */}
      <div style={{ overflow: "auto", paddingRight: "5px" }}>
        {components.length < 2 ? (
          <div className="form-section-info" style={{ color: "var(--text-color-muted)" }}>
            At least two budget components are required to set correlations.
          </div>
        ) : (
          <table style={{ borderCollapse: "collapse", margin: "0 auto" }}>
            <thead>
              <tr>
                <th style={th}></th>
                {components.map((c) => (
                  <th key={c.id} style={th} title={c.label}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {components.map((rowC, rIdx) => (
                <tr key={rowC.id}>
                  <th style={{ ...th, textAlign: "right" }} title={rowC.label}>
                    {rowC.label}
                  </th>
                  {components.map((colC, cIdx) => {
                    if (cIdx === rIdx) {
                      return (
                        <td key={colC.id} style={{ padding: "4px", textAlign: "center", color: "var(--text-color-muted)" }}>
                          1.00
                        </td>
                      );
                    }
                    if (cIdx > rIdx) {
                      // Upper triangle: mirror, read-only display.
                      const rho = getCorrelation(matrix, rowC.id, colC.id);
                      return (
                        <td key={colC.id} style={{ padding: "4px", textAlign: "center", color: "var(--text-color-faint, #6b7280)" }}>
                          {rho ? rho.toFixed(2) : "0.00"}
                        </td>
                      );
                    }
                    // Lower triangle: editable.
                    const rho = getCorrelation(matrix, rowC.id, colC.id);
                    return (
                      <td key={colC.id} style={{ padding: "4px", textAlign: "center" }}>
                        <input
                          type="number"
                          step="0.1"
                          min="-1"
                          max="1"
                          value={rho}
                          onChange={(e) => setCell(rowC.id, colC.id, e.target.value)}
                          style={cellInput}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {reductionPairs.length > 0 && (
          <div className="form-section-info" style={{ marginTop: "14px", fontSize: "0.85rem", color: "var(--text-color-muted)" }}>
            Note: the correlation on {reductionPairs.join(", ")} <em>reduces</em> the combined uncertainty
            (the inputs have opposing sensitivities). This is valid but uncommon — double-check it is intended.
          </div>
        )}

        <div
          className="modal-actions"
          style={{ marginTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <button
            onClick={() => onSave({})}
            title="Reset all correlations to zero (independent)"
            style={{
              background: "transparent",
              border: "1px solid var(--border-color)",
              color: "var(--text-color-muted)",
              cursor: "pointer",
              borderRadius: "6px",
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FontAwesomeIcon icon={faRotateLeft} /> Reset
          </button>
          <button
            onClick={() => onSave(matrix)}
            title="Apply correlations"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--primary-color)",
              cursor: "pointer",
              fontSize: "1.5rem",
              transition: "transform 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <FontAwesomeIcon icon={faCheck} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CorrelationMatrixModal;
