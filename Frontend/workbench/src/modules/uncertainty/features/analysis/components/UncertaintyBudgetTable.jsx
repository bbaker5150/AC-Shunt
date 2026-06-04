import React, { useState, useMemo, useEffect, useRef } from "react";
import Latex from "../../../components/common/Latex"; 
import { unitSystem, errorDistributions } from "../../../utils/uncertaintyMath";
import { oldErrorDistributions } from "../utils/budgetUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faCalculator, 
  faCog, 
  faPlus, 
  faPencilAlt, 
  faRedo 
} from "@fortawesome/free-solid-svg-icons"; 

const UncertaintyBudgetTable = ({
  components,
  onRemove,
  onEdit, // Updated to expect (event, component)
  calcResults,
  referencePoint,
  uncertaintyConfidence,
  onRowContextMenu,
  equationString,
  measurementType,
  riskResults,
  onShowDerivedBreakdown,
  onShowRiskBreakdown,
  showContribution,
  setShowContribution,
  hasTmde,
  onAddManualComponent,
  onOpenRepeatability, 
  setNotification,
  onComponentUpdate
}) => {
  const DIST_OPTIONS = ["Normal", "Rectangular", "Triangular", "U-Shaped", "Lognormal", "Rayleigh"];
  const DIST_SELECT_STYLE = {
    width: '100%',
    padding: '2px 4px',
    backgroundColor: 'transparent',
    color: 'inherit',
    border: '1px solid transparent',
    borderRadius: '4px',
    fontSize: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
  };
  const confidencePercent = parseFloat(uncertaintyConfidence) || 95;
  const derivedUnit = referencePoint?.unit || "Units";
  const derivedName = referencePoint?.name || "Derived";

  const isDirect = measurementType === "direct";
  const headerColSpan = isDirect ? 6 : 8;
  const finalColSpan = isDirect ? 3 : 5;

  const [showGuardband, setShowGuardband] = useState(false);

  // --- Settings State ---
  const [uiSigFigs, setUiSigFigs] = useState(4);
  const [expandedSigFigs, setExpandedSigFigs] = useState(5);
  const [riskSigFigs, setRiskSigFigs] = useState(4);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  // Close settings menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [settingsRef]);

  const getPfaClass = (pfa) => {
    if (pfa > 5) return "status-bad";
    if (pfa > 2) return "status-warning";
    return "status-good";
  };

  const derivedSymbol = useMemo(() => {
    if (measurementType !== "derived" || !equationString) {
      return null;
    }
    const eqParts = equationString.split("=");
    if (eqParts.length > 1) {
      return eqParts[0].trim();
    }
    return null;
  }, [equationString, measurementType]);

  const derivedDisplayName = useMemo(() => {
    if (derivedSymbol) {
      return `${derivedName} (${derivedSymbol})`;
    }
    return derivedName;
  }, [derivedName, derivedSymbol]);

  let combinedUncertaintyInDerivedUnit = NaN;
  let expandedUncertaintyInDerivedUnit = NaN;
  const targetUnitInfo = unitSystem.units[derivedUnit];

  if (calcResults && targetUnitInfo?.to_si) {
    if (!isNaN(calcResults.combined_uncertainty_absolute_base)) {
      combinedUncertaintyInDerivedUnit =
        calcResults.combined_uncertainty_absolute_base / targetUnitInfo.to_si;
    }
    if (!isNaN(calcResults.expanded_uncertainty_absolute_base)) {
      expandedUncertaintyInDerivedUnit =
        calcResults.expanded_uncertainty_absolute_base / targetUnitInfo.to_si;
    }
  } else if (calcResults && derivedUnit === "ppm") {
    combinedUncertaintyInDerivedUnit = calcResults.combined_uncertainty;
    expandedUncertaintyInDerivedUnit = calcResults.expanded_uncertainty;
  }

  // --- EMPTY STATE CHECK ---
  if (!hasTmde) {
    return (
      <div
        className="placeholder-content"
        style={{ marginTop: "20px", minHeight: "150px" }}
      >
        <h3 style={{ marginBottom: "10px" }}>No TMDE Selected</h3>
        <p>
          Add a Test Measurement Device (TMDE) to begin the uncertainty budget
          calculation.
        </p>
      </div>
    );
  }

  const inputComponents = components.filter((c) => c.name.startsWith("Input:"));
  const directComponents = components.filter(
    (c) => !c.name.startsWith("Input:")
  );
  const showDerivedInputs =
    inputComponents.length > 0 &&
    calcResults?.combined_uncertainty_inputs_native !== undefined;

  const renderComponentRows = (filteredComponents) => {
    if (filteredComponents.length === 0) return null;

    return (
      <>
        {filteredComponents.map((c) => {
          let formattedValueUi = "N/A";
          let displayValueUnitUi = "";
          let formattedContribution = "N/A";
          let displayContributionUnit = derivedUnit;
          const quantity = c.quantity || 1;
          const displayName =
            quantity > 1 ? `${c.name} (Qty: ${quantity})` : c.name;

          // --- UNIT MISMATCH FIX START ---
          // Determine if we can recalculate the native value from SI to ensure it matches unit_native.
          let calculatedNativeValue = null;
          if (c.isBaseUnitValue && !isNaN(c.value) && c.unit_native) {
            const nativeUnitInfo = unitSystem.units[c.unit_native];
            if (nativeUnitInfo && nativeUnitInfo.to_si) {
              calculatedNativeValue = c.value / nativeUnitInfo.to_si;
            }
          }

          if (calculatedNativeValue !== null) {
            // Priority 1: Recalculated value matches the label (Fixes in-lb vs ft-lb issue)
            formattedValueUi = calculatedNativeValue.toPrecision(uiSigFigs);
            displayValueUnitUi = c.unit_native;
          } else if (c.value_native !== undefined && c.unit_native) {
            // Priority 2: Use provided native value
            formattedValueUi = c.value_native.toPrecision(uiSigFigs);
            displayValueUnitUi = c.unit_native;
          } else if (c.isBaseUnitValue && !isNaN(c.value) && c.unit) {
            // Priority 3: Fallback to base unit conversion
            const inputUnitInfo = unitSystem.units[c.unit];
            if (inputUnitInfo?.to_si) {
              const valueInOriginalUnit = c.value / inputUnitInfo.to_si;
              formattedValueUi = valueInOriginalUnit.toPrecision(uiSigFigs);
              displayValueUnitUi = c.unit;
            } else {
              formattedValueUi = "Conv Err";
            }
          } else if (!c.isBaseUnitValue && !isNaN(c.value)) {
            // Priority 4: PPM or Dimensionless
            formattedValueUi = c.value.toPrecision(uiSigFigs);
            displayValueUnitUi = "ppm";
          }
          // --- UNIT MISMATCH FIX END ---

          const formattedCi =
            typeof c.sensitivityCoefficient === "number"
              ? c.sensitivityCoefficient.toPrecision(4)
              : c.sensitivityCoefficient
              ? String(c.sensitivityCoefficient)
              : "N/A";

          if (typeof c.contribution === "number" && !isNaN(c.contribution)) {
            formattedContribution = c.contribution.toPrecision(uiSigFigs);

            if (isDirect) {
              displayContributionUnit = displayValueUnitUi;
            }
          }

          return (
            <tr
              key={c.id}
              onContextMenu={(e) => {
                if (onRowContextMenu) {
                  onRowContextMenu(e, c);
                }
              }}
            >
              <td>{displayName}</td>
              <td>{c.sourcePointLabel || "N/A"}</td>
              <td>{c.type}</td>
              <td>
                {formattedValueUi} {displayValueUnitUi}
              </td>

              {!isDirect && <td>{formattedCi}</td>}
              {!isDirect && (
                <td>
                  {formattedContribution} {displayContributionUnit}
                </td>
              )}

              <td>
                  {/* Three cases:
                      - Manual Type B / Resolution rows (have originalInput): a
                        divisor dropdown that recomputes the component's value
                        from the new divisor. (Type A has no divisor -> label.)
                      - TMDE/UUT-derived rows (distributionDivisor + sourceTmdeId):
                        round-trip on the divisor and write back to the tolerance.
                      - Anything else: simple label list. */}
                  {c.originalInput !== undefined ? (
                    c.type === "A" ? (
                      <span style={{ color: "var(--text-color-muted)" }}>
                        {c.distribution || "Normal"}
                      </span>
                    ) : (
                      <select
                        className="mini-select"
                        value={c.originalInput.errorDistributionDivisor || "1.732"}
                        onChange={(e) => onComponentUpdate && onComponentUpdate(c.id, { distribution: e.target.value }, c)}
                        style={DIST_SELECT_STYLE}
                        onFocus={(e) => e.target.style.borderColor = 'var(--primary-color)'}
                        onBlur={(e) => e.target.style.borderColor = 'transparent'}
                      >
                        {oldErrorDistributions.map((d) => (
                          <option key={d.value} value={d.value} style={{ backgroundColor: 'var(--component-bg)', color: 'var(--text-color)' }}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    )
                  ) : c.distributionDivisor !== undefined ? (
                    <select
                      className="mini-select"
                      value={c.distributionDivisor}
                      onChange={(e) => onComponentUpdate && onComponentUpdate(c.id, { distribution: e.target.value }, c)}
                      style={DIST_SELECT_STYLE}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary-color)'}
                      onBlur={(e) => e.target.style.borderColor = 'transparent'}
                    >
                      {errorDistributions
                        .filter((d) => d.label !== "Std. Uncertainty")
                        .map((d) => (
                          <option key={d.value} value={d.value} style={{ backgroundColor: 'var(--component-bg)', color: 'var(--text-color)' }}>
                            {d.label}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <select
                      className="mini-select"
                      value={c.distribution || "Normal"}
                      onChange={(e) => onComponentUpdate && onComponentUpdate(c.id, { distribution: e.target.value }, c)}
                      style={DIST_SELECT_STYLE}
                      onFocus={(e) => e.target.style.borderColor = 'var(--primary-color)'}
                      onBlur={(e) => e.target.style.borderColor = 'transparent'}
                    >
                      {DIST_OPTIONS.map(d => (
                          <option key={d} value={d} style={{ backgroundColor: 'var(--component-bg)', color: 'var(--text-color)' }}>
                              {d}
                          </option>
                      ))}
                    </select>
                  )}
              </td>

              <td className="action-cell">
                {!c.isCore && (
                  <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
                    {/* FIXED: Pass 'e' (event) to onEdit for cursor tracking */}
                    <span
                        onClick={(e) => onEdit(e, c)}
                        className="action-icon"
                        title="Edit Component"
                        style={{ cursor: "pointer", color: "var(--primary-color)", fontSize: "0.9rem" }}
                    >
                        <FontAwesomeIcon icon={faPencilAlt} />
                    </span>
                    <span
                        onClick={() => onRemove(c.id)}
                        className="delete-action"
                        title="Remove Component"
                        style={{fontSize: '1.2rem', lineHeight: '0.8'}}
                    >
                        ×
                    </span>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </>
    );
  };

  return (
    <table className="uncertainty-budget-table">
      <thead>
        <tr>
          <th>Uncertainty Component</th>
          <th>Source / Nominal</th>
          <th>Type</th>
          <th>uᵢ</th>

          {!isDirect && <th>Sens. Coeff (cᵢ)</th>}
          {!isDirect && (
            <th>
              <Latex>{"Contribution ($|c_i \\times u_i|$)"}</Latex>
            </th>
          )}

          <th>Distribution</th>

          {/* --- Settings Header Column with Actions --- */}
          <th style={{ width: "120px", position: "relative" }}>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                
                {/* 1. Add Manual Component */}
                <span
                  onClick={onAddManualComponent}
                  className="action-icon"
                  title="Add Manual Component"
                  style={{
                    cursor: "pointer",
                    color: "var(--text-color-muted)",
                    display: "flex",
                    justifyContent: "center",
                    transition: "color 0.2s ease",
                    fontSize: '0.9rem'
                  }}
                   onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--primary-color)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--text-color-muted)")
                  }
                >
                  <FontAwesomeIcon icon={faPlus} />
                </span>

                {/* 2. Add Repeatability */}
                <span
                  // FIXED: Pass 'e' (event) to allow positioning the modal
                  onClick={(e) => onOpenRepeatability(e)}
                  className="action-icon"
                  title="Repeatability Calculator"
                  style={{
                    cursor: "pointer",
                    color: "var(--text-color-muted)",
                    display: "flex",
                    justifyContent: "center",
                    transition: "color 0.2s ease",
                    fontSize: '0.9rem'
                  }}
                   onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--primary-color)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--text-color-muted)")
                  }
                >
                  <FontAwesomeIcon icon={faRedo} />
                </span>

                {/* 3. Settings Dropdown */}
                <div ref={settingsRef} style={{position: 'relative'}}>
                    <span
                    onClick={() => setShowSettings(!showSettings)}
                    className="action-icon"
                    title="Table Settings"
                    style={{
                        cursor: "pointer",
                        color: "var(--text-color-muted)",
                        display: "flex",
                        justifyContent: "center",
                        transition: "color 0.2s ease",
                        fontSize: '0.9rem'
                    }}
                    onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--primary-color)")
                    }
                    onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--text-color-muted)")
                    }
                    >
                    <FontAwesomeIcon icon={faCog} />
                    </span>

                    {/* --- Settings Dropdown Menu --- */}
                    {showSettings && (
                    <div
                        style={{
                        position: "absolute",
                        top: "100%",
                        right: "0",
                        zIndex: 1010,
                        backgroundColor: "var(--header-background)", 
                        backdropFilter: "blur(16px)",                
                        WebkitBackdropFilter: "blur(16px)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        boxShadow: "var(--box-shadow-glow)",
                        padding: "15px",
                        minWidth: "220px",
                        marginTop: "8px",
                        textAlign: "left",
                        animation: "context-menu-fade-in 0.1s ease-out",
                        }}
                    >
                        <h5
                        style={{
                            margin: "0 0 10px 0",
                            fontSize: "0.75rem",
                            color: "var(--text-color-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            borderBottom: "1px solid var(--border-color)",
                            paddingBottom: "8px",
                        }}
                        >
                        Precision Settings
                        </h5>
                        <div style={{ marginBottom: "15px" }}>
                        <label
                            style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            marginBottom: "6px",
                            color: "var(--text-color)",
                            }}
                        >
                            uᵢ Sig Figs
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={uiSigFigs}
                            onChange={(e) =>
                            setUiSigFigs(Math.max(1, parseInt(e.target.value) || 2))
                            }
                            style={{
                            width: "100%",
                            padding: "8px",
                            fontSize: "0.9rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            backgroundColor: "var(--input-background)",
                            color: "var(--text-color)",
                            }}
                        />
                        </div>
                        <div style={{ marginBottom: "15px" }}>
                        <label
                            style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            marginBottom: "6px",
                            color: "var(--text-color)",
                            }}
                        >
                            Expanded Unc (U) Sig Figs
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={expandedSigFigs}
                            onChange={(e) =>
                            setExpandedSigFigs(
                                Math.max(1, parseInt(e.target.value) || 2)
                            )
                            }
                            style={{
                            width: "100%",
                            padding: "8px",
                            fontSize: "0.9rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            backgroundColor: "var(--input-background)",
                            color: "var(--text-color)",
                            }}
                        />
                        </div>
                        <div>
                        <label
                            style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            marginBottom: "6px",
                            color: "var(--text-color)",
                            }}
                        >
                            Risk (PFA/PFR) Sig Figs
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={riskSigFigs}
                            onChange={(e) =>
                            setRiskSigFigs(
                                Math.max(1, parseInt(e.target.value) || 2)
                            )
                            }
                            style={{
                            width: "100%",
                            padding: "8px",
                            fontSize: "0.9rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            backgroundColor: "var(--input-background)",
                            color: "var(--text-color)",
                            }}
                        />
                        </div>
                    </div>
                    )}
                </div>
             </div>
          </th>
        </tr>
      </thead>

      {showDerivedInputs && (
        <tbody className="component-group-tbody informational-group">
          <tr className="category-header">
            <td colSpan={headerColSpan}>Input Variables (Informational)</td>
          </tr>
          {renderComponentRows(inputComponents)}
        </tbody>
      )}

      <tbody className="component-group-tbody">
        {showDerivedInputs ? (
          <tr className="category-header">
            <td colSpan={headerColSpan}>
              Direct Uncertainty Components (Final Budget)
            </td>
          </tr>
        ) : (
          <tr className="category-header"></tr>
        )}

        {showDerivedInputs && (
          <tr className="propagated-unc-row" key="propagated_unc">
            <td>{`Derived: ${derivedDisplayName}`}</td>
            <td>(From Inputs)</td>
            <td>B</td>
            <td>
              {calcResults.combined_uncertainty_inputs_native.toPrecision(
                uiSigFigs
              )}{" "}
              {derivedUnit}
            </td>

            {!isDirect && <td>1.000</td>}
            {!isDirect && (
              <td>
                {calcResults.combined_uncertainty_inputs_native.toPrecision(
                  uiSigFigs
                )}{" "}
                {derivedUnit}
              </td>
            )}

            <td>Calculated</td>

            <td className="action-cell">
              <span
                onClick={onShowDerivedBreakdown}
                className="action-icon"
                title="View Calculation Breakdown"
                style={{ cursor: "pointer", color: "var(--primary-color)" }}
              >
                <FontAwesomeIcon icon={faCalculator} />
              </span>
            </td>
          </tr>
        )}

        {renderComponentRows(showDerivedInputs ? directComponents : components)}
      </tbody>

      <tfoot>
        <tr>
          <td colSpan={finalColSpan}>{"Combined Standard Uncertainty (uₑ)"}</td>
          <td>
            {!isNaN(combinedUncertaintyInDerivedUnit)
              ? `${combinedUncertaintyInDerivedUnit.toPrecision(
                  uiSigFigs
                )} ${derivedUnit}`
              : "N/A"}
          </td>
          <td colSpan="2"></td>
        </tr>
        {calcResults && (
            <>
            <tr className="final-uncertainty-row">
              <td colSpan={headerColSpan}>
                <div
                  className="final-result-display"
                  style={{ position: "relative" }}
                >
                  {/* Absolute Toggle Switch: Contribution */}
                  <div
                    style={{
                      position: "absolute",
                      top: "20px",
                      left: "20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: "600",
                        color: "var(--text-color-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Show Contribution
                    </span>
                    <label className="dark-mode-toggle" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={showContribution}
                        onChange={(e) => setShowContribution(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  {/* Absolute Toggle Switch: Guardband */}
                  <div
                    style={{
                      position: "absolute",
                      top: "20px",
                      right: "20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: "600",
                        color: "var(--text-color-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Show Guardband
                    </span>
                    <label className="dark-mode-toggle" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={showGuardband}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setShowGuardband(isChecked);

                          if (isChecked) {
                            // Check if Guardband results are valid numbers
                            const gbLowValid = riskResults?.gbResults?.GBLOW !== undefined && !isNaN(riskResults.gbResults.GBLOW);
                            const gbUpValid = riskResults?.gbResults?.GBUP !== undefined && !isNaN(riskResults.gbResults.GBUP);

                            if (!gbLowValid || !gbUpValid) {
                                if (setNotification) {
                                    const inputs = riskResults?.gbInputs || {};
                                    const reqTUR = inputs.reqTUR || "N/A";
                                    const achievedTUR = inputs.turVal ? inputs.turVal.toFixed(2) : "N/A";
                                    const uCal = inputs.combUnc ? inputs.combUnc.toPrecision(4) : "N/A";
                                    const unit = inputs.nominalUnit || "";

                                    // Find Top Contributor
                                    let topContributorString = "N/A";
                                    if (calcResults && calcResults.calculatedBudgetComponents) {
                                        const sortedComponents = [...calcResults.calculatedBudgetComponents].sort((a, b) => 
                                            Math.abs(b.contribution || 0) - Math.abs(a.contribution || 0)
                                        );
                                        const topComp = sortedComponents[0];
                                        if (topComp && typeof topComp.contribution === 'number') {
                                            topContributorString = `${topComp.name} (${topComp.contribution.toPrecision(4)} ${unit})`;
                                        }
                                    }

                                    setNotification({
                                        title: "Convergence Failure",
                                        isFloating: true,
                                        message: `The math engine could not converge on guard band limits because the calculated TUR is significantly lower than the required TUR, causing the calculated Uncertainty to exceed allowable limits.

Diagnostic Data:
• Required TUR: ${reqTUR}
• Achieved TUR: ${achievedTUR}
• Total Uncertainty (u_cal): ${uCal} ${unit}

Primary Contributor:
• ${topContributorString}

Please increase the required TUR or improve your uncertainty to allow for a viable solution.`
                                    });
                                }
                            }
                          }
                        }}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <span className="final-result-label">
                    Expanded Uncertainty (U)
                  </span>
                  <div className="final-result-value">
                    ±{" "}
                    {!isNaN(expandedUncertaintyInDerivedUnit)
                      ? expandedUncertaintyInDerivedUnit.toPrecision(
                          expandedSigFigs
                        )
                      : "N/A"}
                    <span className="final-result-unit">{derivedUnit}</span>
                  </div>
                  <span className="final-result-confidence-note">
                    The reported expanded uncertainty... k≈
                    {calcResults.k_value.toFixed(3)}... {confidencePercent}%.
                  </span>

                  {/* Risk Metrics Dashboard */}
                  {riskResults && (
                    <div className="budget-risk-metrics">
                      {/* Row 1: Core Risk Metrics */}
                      <div className="metrics-row">
                        <div
                          className={`metric-pod ${getPfaClass(
                            riskResults.pfa
                          )} clickable`}
                          onClick={() =>
                            onShowRiskBreakdown && onShowRiskBreakdown("pfa")
                          }
                          title="Show PFA Breakdown"
                        >
                          <span className="metric-pod-label">PFA</span>
                          <span className="metric-pod-value">
                            {riskResults.pfa.toPrecision(riskSigFigs)} %
                          </span>
                        </div>
                        <div
                          className="metric-pod pfr clickable"
                          onClick={() =>
                            onShowRiskBreakdown && onShowRiskBreakdown("pfr")
                          }
                          title="Show PFR Breakdown"
                        >
                          <span className="metric-pod-label">PFR</span>
                          <span className="metric-pod-value">
                            {riskResults.pfr.toPrecision(riskSigFigs)} %
                          </span>
                        </div>
                        <div
                          className="metric-pod tur clickable"
                          onClick={() =>
                            onShowRiskBreakdown && onShowRiskBreakdown("tur")
                          }
                          title="Show TUR Breakdown"
                        >
                          <span className="metric-pod-label">TUR</span>
                          <span className="metric-pod-value">
                            {riskResults.tur.toFixed(2)} : 1
                          </span>
                        </div>
                        {isDirect && (
                          <div
                            className="metric-pod tar clickable"
                            onClick={() =>
                              onShowRiskBreakdown && onShowRiskBreakdown("tar")
                            }
                            title="Show TAR Breakdown"
                          >
                            <span className="metric-pod-label">TAR</span>
                            <span className="metric-pod-value">
                              {riskResults.tar.toFixed(2)} : 1
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Optional Guardband Section */}
                      {showGuardband && riskResults.gbResults ? (
                        <>
                          <div className="metrics-separator">
                            <span>Guardband Analysis</span>
                          </div>

                          {/* Row 2: Guardband Limits & Multiplier */}
                          <div className="metrics-row">
                            <div
                              className="metric-pod gblow clickable"
                              onClick={() => onShowRiskBreakdown("gblow")}
                            >
                              <span className="metric-pod-label">GB LOW</span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.GBLOW === 'number'
                                  ? riskResults.gbResults.GBLOW.toFixed(
                                      (riskResults.uutResolution || 2) + 1
                                    )
                                  : "N/A"}
                              </span>
                            </div>
                            <div
                              className="metric-pod gbhigh clickable"
                              onClick={() => onShowRiskBreakdown("gbhigh")}
                            >
                              <span className="metric-pod-label">GB HIGH</span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.GBUP === 'number'
                                  ? riskResults.gbResults.GBUP.toFixed(
                                      (riskResults.uutResolution || 2) + 1
                                    )
                                  : "N/A"}
                              </span>
                            </div>
                            <div
                              className="metric-pod gbmult clickable"
                              onClick={() => onShowRiskBreakdown("gbmult")}
                            >
                              <span className="metric-pod-label">
                                GB Multiplier
                              </span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.GBMULT === 'number'
                                  ? riskResults.gbResults.GBMULT.toFixed(4) + " %"
                                  : "N/A"}
                              </span>
                            </div>
                          </div>

                          {/* Row 3: Guardband Risk */}
                          <div className="metrics-row">
                            <div
                              className="metric-pod gbpfa clickable"
                              onClick={() => onShowRiskBreakdown("gbpfa")}
                            >
                              <span className="metric-pod-label">
                                PFA w/ GB
                              </span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.GBPFA === 'number'
                                  ? riskResults.gbResults.GBPFA.toPrecision(riskSigFigs) + " %"
                                  : "N/A"}
                              </span>
                            </div>
                            <div
                              className="metric-pod gbpfr clickable"
                              onClick={() => onShowRiskBreakdown("gbpfr")}
                            >
                              <span className="metric-pod-label">
                                PFR w/ GB
                              </span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.GBPFR === 'number'
                                  ? riskResults.gbResults.GBPFR.toPrecision(riskSigFigs) + " %"
                                  : "N/A"}
                              </span>
                            </div>
                          </div>

                          {/* Row 4: Intervals & Reliability */}
                          <div className="metrics-row">
                            <div
                              className="metric-pod gbcalint clickable"
                              onClick={() => onShowRiskBreakdown("gbcalint")}
                            >
                              <span className="metric-pod-label">
                                CAL INT w/ GB
                              </span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.GBCALINT === 'number'
                                  ? riskResults.gbResults.GBCALINT.toFixed(4)
                                  : "N/A"}
                              </span>
                            </div>
                            <div
                              className="metric-pod calint clickable"
                              onClick={() => onShowRiskBreakdown("calint")}
                            >
                              <span className="metric-pod-label">
                                CAL INT w/o GB
                              </span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.NOGBCALINT === 'number'
                                  ? riskResults.gbResults.NOGBCALINT.toFixed(4)
                                  : "N/A"}
                              </span>
                            </div>
                            <div
                              className="metric-pod measrel clickable"
                              onClick={() => onShowRiskBreakdown("measrel")}
                            >
                              <span className="metric-pod-label">
                                REL w/o GB
                              </span>
                              <span className="metric-pod-value">
                                {typeof riskResults.gbResults.NOGBMEASREL === 'number'
                                  ? riskResults.gbResults.NOGBMEASREL.toFixed(4) + " %"
                                  : "N/A"}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : showGuardband ? (
                         <div className="metrics-separator" style={{color: 'var(--status-bad)', fontSize: '0.85rem'}}>
                            <span>Guardband Data Unavailable</span>
                         </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </td>
            </tr>
            </>
        )}
      </tfoot>
    </table>
  );
};

export default UncertaintyBudgetTable;