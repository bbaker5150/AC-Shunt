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
  faRedo,
  faProjectDiagram,
} from "@fortawesome/free-solid-svg-icons";

const DIST_OPTIONS = [
  "Normal",
  "Rectangular",
  "Triangular",
  "U-Shaped",
  "Lognormal",
  "Rayleigh",
];

const DIST_SELECT_STYLE = {
  width: "100%",
  padding: "2px 4px",
  backgroundColor: "transparent",
  color: "inherit",
  border: "1px solid transparent",
  borderRadius: "4px",
  fontSize: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const formatNumber = (value, sigFigs = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return n.toPrecision(sigFigs);
};

const formatDof = (dof) => {
  const n = Number(dof);
  if (dof === Infinity || !Number.isFinite(n)) return "Not used";
  return formatNumber(n, 4);
};

const getComponentStdUncertainty = (component, fallbackUnit) => {
  if (component.value_native !== undefined && component.unit_native) {
    return {
      value: component.value_native,
      unit: component.unit_native,
    };
  }

  if (component.isBaseUnitValue && Number.isFinite(Number(component.value))) {
    const unit = component.unit_native || component.unit || fallbackUnit;
    const nativeUnitInfo = unitSystem.units[unit];
    if (nativeUnitInfo?.to_si) {
      return {
        value: Number(component.value) / nativeUnitInfo.to_si,
        unit,
      };
    }
  }

  return {
    value: component.value,
    unit: component.unit_native || component.unit || fallbackUnit || "ppm",
  };
};

const ResultsCard = ({ title = "Results", results, unit, sigFigs, isFinal }) => {
  const rows = [
    ["Combined Uncertainty", results?.combined],
    ["Effective DOF", formatDof(results?.effective_dof), true],
    ["Coverage Factor (k)", results?.k_value],
    ["Expanded Uncertainty", results?.expanded],
  ];

  return (
    <aside className={`budget-results-card ${isFinal ? "final" : ""}`}>
      <div className="budget-results-title">{title}</div>
      {rows.map(([label, value, alreadyFormatted]) => (
        <div className="budget-results-row" key={label}>
          <span>{label}</span>
          <strong>
            {alreadyFormatted ? value : formatNumber(value, sigFigs)}
            {!alreadyFormatted && label !== "Coverage Factor (k)" && unit
              ? ` ${unit}`
              : ""}
          </strong>
        </div>
      ))}
    </aside>
  );
};

const UncertaintyBudgetTable = ({
  components,
  onRemove,
  onEdit,
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
  onComponentUpdate,
  onOpenCorrelation,
}) => {
  const confidencePercent = parseFloat(uncertaintyConfidence) || 95;
  const derivedUnit = referencePoint?.unit || "Units";
  const derivedName = referencePoint?.name || "Derived";
  const isDirect = measurementType === "direct";
  const [showGuardband, setShowGuardband] = useState(false);
  const [uiSigFigs, setUiSigFigs] = useState(4);
  const [expandedSigFigs, setExpandedSigFigs] = useState(5);
  const [riskSigFigs, setRiskSigFigs] = useState(4);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const derivedSymbol = useMemo(() => {
    if (measurementType !== "derived" || !equationString) return null;
    const eqParts = equationString.split("=");
    return eqParts.length > 1 ? eqParts[0].trim() : null;
  }, [equationString, measurementType]);

  const groups = useMemo(() => {
    if (calcResults?.calculatedBudgetGroups?.length) {
      return calcResults.calculatedBudgetGroups;
    }
    if (!components?.length) return [];
    return [
      {
        id: "final_budget",
        kind: "final",
        label: `${derivedName || "Final"} Uncertainty Budget`,
        unit: derivedUnit,
        components,
        results: {
          combined: calcResults?.combined_uncertainty,
          effective_dof: calcResults?.effective_dof,
          k_value: calcResults?.k_value,
          expanded: calcResults?.expanded_uncertainty,
        },
      },
    ];
  }, [calcResults, components, derivedName, derivedUnit]);

  const getPfaClass = (pfa) => {
    if (pfa > 5) return "status-bad";
    if (pfa > 2) return "status-warning";
    return "status-good";
  };

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

  const renderDistributionCell = (component) => {
    if (component.originalInput !== undefined) {
      if (component.type === "A") {
        return <span>{component.distribution || "Normal"}</span>;
      }
      return (
        <select
          className="mini-select"
          value={component.originalInput.errorDistributionDivisor || "1.732"}
          onChange={(e) =>
            onComponentUpdate?.(component.id, { distribution: e.target.value }, component)
          }
          style={DIST_SELECT_STYLE}
        >
          {oldErrorDistributions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      );
    }

    if (component.distributionDivisor !== undefined) {
      return (
        <select
          className="mini-select"
          value={component.distributionDivisor}
          onChange={(e) =>
            onComponentUpdate?.(component.id, { distribution: e.target.value }, component)
          }
          style={DIST_SELECT_STYLE}
        >
          {errorDistributions
            .filter((d) => d.label !== "Std. Uncertainty")
            .map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
        </select>
      );
    }

    if (component.distribution === "Other (Std. Unc.)") {
      return <span>Other (Std. Unc.)</span>;
    }

    return (
      <select
        className="mini-select"
        value={component.distribution || "Normal"}
        onChange={(e) =>
          onComponentUpdate?.(component.id, { distribution: e.target.value }, component)
        }
        style={DIST_SELECT_STYLE}
      >
        {DIST_OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    );
  };

  const renderActions = (component) => {
    if (component.isCore) return null;
    return (
      <div className="budget-row-actions">
        <span
          onClick={(e) => onEdit?.(e, component)}
          className="action-icon"
          title="Edit Component"
        >
          <FontAwesomeIcon icon={faPencilAlt} />
        </span>
        <span
          onClick={() => onRemove?.(component.id)}
          className="delete-action"
          title="Remove Component"
        >
          x
        </span>
      </div>
    );
  };

  const renderComponentTable = (group) => (
    <table className="uncertainty-budget-table">
      <thead>
        <tr>
          <th>Error Source Name</th>
          <th>Source / Nominal</th>
          <th>Error Limit (or Std. Unc.)</th>
          <th>Error Limit Distribution</th>
          <th>Type (A/B)</th>
          <th>DOF</th>
          <th>Standard Uncertainty</th>
          <th></th>
        </tr>
      </thead>
      <tbody className="component-group-tbody">
        {(group.components || []).map((component) => {
          const std = getComponentStdUncertainty(component, group.unit);
          const quantity = component.quantity || 1;
          const displayName =
            quantity > 1 ? `${component.name} (Qty: ${quantity})` : component.name;
          return (
            <tr
              key={component.id}
              onContextMenu={(e) => onRowContextMenu?.(e, component)}
            >
              <td>{displayName}</td>
              <td>{component.sourcePointLabel || "N/A"}</td>
              <td>
                {formatNumber(std.value, uiSigFigs)} {std.unit}
              </td>
              <td>{renderDistributionCell(component)}</td>
              <td>{component.type || "B"}</td>
              <td>{formatDof(component.dof)}</td>
              <td>
                {formatNumber(std.value, uiSigFigs)} {std.unit}
              </td>
              <td className="action-cell">{renderActions(component)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderEquationTable = (group) => (
    <table className="uncertainty-budget-table">
      <thead>
        <tr>
          <th>Input Variable</th>
          <th>Nominal Value</th>
          <th>DOF</th>
          <th>Standard Uncertainty</th>
          <th>Sensitivity Coefficient</th>
          <th>
            <Latex>{"Contribution ($|c_i \\times u_i|$)"}</Latex>
          </th>
          <th></th>
        </tr>
      </thead>
      <tbody className="component-group-tbody">
        {(group.rows || []).map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
            <td>{row.nominalValue || "N/A"}</td>
            <td>{formatDof(row.dof)}</td>
            <td>
              {formatNumber(row.standardUncertainty, uiSigFigs)} {row.unit}
            </td>
            <td>{formatNumber(row.sensitivityCoefficient, 4)}</td>
            <td>
              {formatNumber(row.contribution, uiSigFigs)} {derivedUnit}
            </td>
            <td className="action-cell">
              <span
                onClick={onShowDerivedBreakdown}
                className="action-icon"
                title="View Calculation Breakdown"
              >
                <FontAwesomeIcon icon={faCalculator} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const handleGuardbandToggle = (isChecked) => {
    setShowGuardband(isChecked);
    if (!isChecked) return;

    const gbLowValid =
      riskResults?.gbResults?.GBLOW !== undefined &&
      !isNaN(riskResults.gbResults.GBLOW);
    const gbUpValid =
      riskResults?.gbResults?.GBUP !== undefined &&
      !isNaN(riskResults.gbResults.GBUP);
    if (gbLowValid && gbUpValid) return;

    setNotification?.({
      title: "Convergence Failure",
      isFloating: true,
      message:
        "The math engine could not converge on guard band limits because the calculated TUR is significantly lower than the required TUR. Increase the required TUR or improve the uncertainty budget to allow a viable solution.",
    });
  };

  const renderToolbar = () => (
    <div className="budget-stack-toolbar">
      {!isDirect && onOpenCorrelation && components?.length >= 2 && (
        <button type="button" onClick={onOpenCorrelation} title="Input Correlation Matrix">
          <FontAwesomeIcon icon={faProjectDiagram} />
        </button>
      )}
      <button type="button" onClick={onAddManualComponent} title="Add Manual Component">
        <FontAwesomeIcon icon={faPlus} />
      </button>
      <button type="button" onClick={(e) => onOpenRepeatability?.(e)} title="Repeatability Calculator">
        <FontAwesomeIcon icon={faRedo} />
      </button>
      <div ref={settingsRef} className="budget-settings-wrap">
        <button type="button" onClick={() => setShowSettings(!showSettings)} title="Table Settings">
          <FontAwesomeIcon icon={faCog} />
        </button>
        {showSettings && (
          <div className="budget-settings-menu">
            <h5>Precision Settings</h5>
            <label>
              u_i Sig Figs
              <input
                type="number"
                min="1"
                max="10"
                value={uiSigFigs}
                onChange={(e) => setUiSigFigs(Math.max(1, parseInt(e.target.value) || 2))}
              />
            </label>
            <label>
              Expanded Unc (U) Sig Figs
              <input
                type="number"
                min="1"
                max="10"
                value={expandedSigFigs}
                onChange={(e) =>
                  setExpandedSigFigs(Math.max(1, parseInt(e.target.value) || 2))
                }
              />
            </label>
            <label>
              Risk Sig Figs
              <input
                type="number"
                min="1"
                max="10"
                value={riskSigFigs}
                onChange={(e) =>
                  setRiskSigFigs(Math.max(1, parseInt(e.target.value) || 2))
                }
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );

  const renderRiskMetrics = () => {
    if (!riskResults) return null;
    const riskPods = [
      ["pfa", "PFA", `${riskResults.pfa.toPrecision(riskSigFigs)} %`, getPfaClass(riskResults.pfa)],
      ["pfr", "PFR", `${riskResults.pfr.toPrecision(riskSigFigs)} %`, "pfr"],
      ["tur", "TUR", `${riskResults.tur.toFixed(2)} : 1`, "tur"],
    ];
    if (isDirect) {
      riskPods.push(["tar", "TAR", `${riskResults.tar.toFixed(2)} : 1`, "tar"]);
    }

    return (
      <div className="budget-risk-metrics">
        <div className="metrics-row">
          {riskPods.map(([key, label, value, klass]) => (
            <div
              key={key}
              className={`metric-pod ${klass} clickable`}
              onClick={() => onShowRiskBreakdown?.(key)}
              title={`Show ${label} Breakdown`}
            >
              <span className="metric-pod-label">{label}</span>
              <span className="metric-pod-value">{value}</span>
            </div>
          ))}
        </div>
        {showGuardband && riskResults.gbResults && (
          <>
            <div className="metrics-separator">
              <span>Guardband Analysis</span>
            </div>
            <div className="metrics-row">
              {[
                ["gblow", "GB LOW", riskResults.gbResults.GBLOW],
                ["gbhigh", "GB HIGH", riskResults.gbResults.GBUP],
                ["gbmult", "GB Multiplier", riskResults.gbResults.GBMULT],
                ["gbpfa", "PFA w/ GB", riskResults.gbResults.GBPFA],
                ["gbpfr", "PFR w/ GB", riskResults.gbResults.GBPFR],
              ].map(([key, label, value]) => (
                <div
                  key={key}
                  className="metric-pod clickable"
                  onClick={() => onShowRiskBreakdown?.(key)}
                >
                  <span className="metric-pod-label">{label}</span>
                  <span className="metric-pod-value">
                    {Number.isFinite(Number(value))
                      ? Number(value).toPrecision(riskSigFigs)
                      : "N/A"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const finalGroup = groups.find((group) => group.kind === "final");
  const finalExpanded = finalGroup?.results?.expanded;

  return (
    <div className="budget-stack">
      <div className="budget-stack-header">
        <div>
          <h3 className="panel-section-title">
            {derivedSymbol
              ? `${derivedName} (${derivedSymbol}) Budget Stack`
              : `${derivedName} Budget Stack`}
          </h3>
        </div>
        {renderToolbar()}
      </div>

      {groups.map((group) => (
        <section
          className={`budget-stack-section ${group.kind === "final" ? "final" : ""}`}
          key={group.id}
        >
          <div className="budget-section-title-row">
            <h4>{group.label}</h4>
            <span>{group.kind === "equation" ? "Propagation" : group.unit}</span>
          </div>
          <div className="budget-section-grid">
            <div className="budget-section-table-wrap">
              {group.kind === "equation"
                ? renderEquationTable(group)
                : renderComponentTable(group)}
            </div>
            <ResultsCard
              title={group.kind === "final" ? "Final Results" : "Results"}
              results={group.results}
              unit={group.unit}
              sigFigs={group.kind === "final" ? expandedSigFigs : uiSigFigs}
              isFinal={group.kind === "final"}
            />
          </div>
        </section>
      ))}

      {calcResults && (
        <div className="final-result-display budget-stack-final-display">
          <div className="budget-final-toggles">
            <label>
              <span>Show Contribution</span>
              <span className="dark-mode-toggle">
                <input
                  type="checkbox"
                  checked={showContribution}
                  onChange={(e) => setShowContribution(e.target.checked)}
                />
                <span className="slider"></span>
              </span>
            </label>
            <label>
              <span>Show Guardband</span>
              <span className="dark-mode-toggle">
                <input
                  type="checkbox"
                  checked={showGuardband}
                  onChange={(e) => handleGuardbandToggle(e.target.checked)}
                />
                <span className="slider"></span>
              </span>
            </label>
          </div>
          <span className="final-result-label">Expanded Uncertainty (U)</span>
          <div className="final-result-value">
            +/- {formatNumber(finalExpanded, expandedSigFigs)}
            <span className="final-result-unit">{derivedUnit}</span>
          </div>
          <span className="final-result-confidence-note">
            The reported expanded uncertainty uses k=
            {formatNumber(finalGroup?.results?.k_value, 4)} at {confidencePercent}%.
          </span>
          {renderRiskMetrics()}
        </div>
      )}
    </div>
  );
};

export default UncertaintyBudgetTable;
