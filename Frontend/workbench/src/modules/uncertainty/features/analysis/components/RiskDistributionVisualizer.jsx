import React, { useId, useMemo, useState } from "react";

const WIDTH = 920;
const HEIGHT = 330;
const PLOT_LEFT = 56;
const PLOT_RIGHT = 892;
const BASELINE = 252;
const CURVE_HEIGHT = 154;

const finite = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatNumber = (value, digits = 5) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  if (number === 0) return "0";
  if (Math.abs(number) >= 10000 || Math.abs(number) < 0.001) {
    return number.toExponential(3);
  }
  return Number(number.toPrecision(digits)).toString();
};

const distributionKind = (label = "") => {
  const normalized = String(label).toLowerCase();
  if (normalized.includes("rect") || normalized.includes("uniform")) return "uniform";
  if (normalized.includes("triang")) return "triangular";
  if (normalized.includes("u-shaped") || normalized.includes("ushaped")) return "ushaped";
  return "normal";
};

const distributionDivisor = (component) => {
  const explicit = Number(component?.distributionDivisor);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const label = String(component?.distribution || "").toLowerCase();
  const match = label.match(/k\s*=\s*([\d.]+)/);
  if (match) return Number(match[1]);
  if (label.includes("rect") || label.includes("uniform")) return Math.sqrt(3);
  if (label.includes("triang")) return Math.sqrt(6);
  if (label.includes("u-shaped") || label.includes("ushaped")) return Math.sqrt(2);
  if (label.includes("95")) return 1.96;
  if (label.includes("99")) return 2.576;
  return component?.type === "A" ? 1 : 2;
};

const divisorDescription = (distribution, divisor) => {
  const label = distribution || "Normal";
  const normalized = String(label).toLowerCase();
  const value = formatNumber(divisor);
  if (normalized.includes("rect") || normalized.includes("uniform")) {
    return `${label} (sqrt 3) - ${value}`;
  }
  if (normalized.includes("triang")) return `${label} (sqrt 6) - ${value}`;
  if (normalized.includes("u-shaped") || normalized.includes("ushaped")) {
    return `${label} (sqrt 2) - ${value}`;
  }
  if (normalized.includes("normal")) return `${label} - k=${value}`;
  return `${label} - divisor ${value}`;
};

const densityAt = (kind, normalizedX) => {
  if (kind === "uniform") return Math.abs(normalizedX) <= 1 ? 0.64 : 0;
  if (kind === "triangular") return Math.max(0, 1 - Math.abs(normalizedX));
  if (kind === "ushaped") {
    if (Math.abs(normalizedX) >= 1) return 0;
    return Math.min(1, 0.24 / Math.sqrt(Math.max(0.025, 1 - normalizedX ** 2)));
  }
  return Math.exp(-0.5 * normalizedX ** 2);
};

const buildCurve = ({ kind, center, spread, domainLow, domainHigh }) => {
  const safeSpread = Math.max(Math.abs(spread), (domainHigh - domainLow) / 1000);
  const points = [];
  for (let i = 0; i <= 180; i += 1) {
    const value = domainLow + ((domainHigh - domainLow) * i) / 180;
    points.push({ value, density: densityAt(kind, (value - center) / safeSpread) });
  }
  return points;
};

const curvePath = (points, toX, heightScale = 1) => {
  if (!points.length) return "";
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${toX(point.value).toFixed(2)} ${(
          BASELINE -
          point.density * CURVE_HEIGHT * heightScale
        ).toFixed(2)}`,
    )
    .join(" ");
  return `${line} L ${toX(points.at(-1).value).toFixed(2)} ${BASELINE} L ${toX(
    points[0].value,
  ).toFixed(2)} ${BASELINE} Z`;
};

const flattenComponents = (calcResults, nativeUnit) => {
  const groups = calcResults?.calculatedBudgetGroups || [];
  const seen = new Set();
  const options = [];

  groups.forEach((group) => {
    (group.components || []).forEach((component, index) => {
      const id = `${group.id || group.kind}-${component.id || index}`;
      if (seen.has(id)) return;
      seen.add(id);

      const native = Number(component.value_native);
      const contribution = Number(component.contribution);
      const raw = Number(component.value);
      const standardUncertainty = Number.isFinite(native)
        ? Math.abs(native)
        : Number.isFinite(contribution)
          ? Math.abs(contribution)
          : Math.abs(raw);

      if (!Number.isFinite(standardUncertainty) || standardUncertainty <= 0) return;

      options.push({
        id,
        name: component.name || "Uncertainty component",
        source: component.sourcePointLabel || group.label || "Budget component",
        distribution: component.distribution || "Normal",
        divisor: distributionDivisor(component),
        standardUncertainty,
        unit: component.unit_native || component.unit || group.unit || nativeUnit,
        type: component.type || "B",
        quantity: Number(component.quantity) || 1,
      });
    });
  });

  return options;
};

const MetricPill = ({ label, value, tone = "neutral", onClick }) => (
  <button
    type="button"
    className={`risk-viz-metric ${tone} ${onClick ? "clickable" : ""}`}
    onClick={onClick}
  >
    <span>{label}</span>
    <strong>{value}</strong>
  </button>
);

const LimitMarker = ({ x, label, value, unit, kind, top, testId }) => (
  <g className="risk-viz-limit-marker" data-testid={testId}>
    <line
      x1={x}
      x2={x}
      y1={top + 20}
      y2={BASELINE + 5}
      className={`risk-viz-limit-line ${kind}`}
    />
    <text x={x} y={top} textAnchor="middle" className={`risk-viz-limit-label ${kind}`}>
      {label}
    </text>
    <text x={x} y={top + 14} textAnchor="middle" className="risk-viz-limit-value">
      {formatNumber(value)} {unit}
    </text>
  </g>
);

const RiskDistributionVisualizer = ({
  results,
  calcResults,
  onShowBreakdown,
  activeModals = [],
}) => {
  const gradientId = useId().replace(/:/g, "");
  const [mode, setMode] = useState("decision");
  const [showGuardband, setShowGuardband] = useState(false);
  const componentOptions = useMemo(
    () => flattenComponents(calcResults, results.nativeUnit),
    [calcResults, results.nativeUnit],
  );
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const selectedComponent =
    componentOptions.find((component) => component.id === selectedComponentId) ||
    componentOptions[0];

  const guardbandAvailable =
    Number.isFinite(Number(results.gbResults?.GBLOW)) &&
    Number.isFinite(Number(results.gbResults?.GBUP));
  const guardbandEnabled = showGuardband && guardbandAvailable;
  const nominal = finite(
    results.nominalValue,
    (finite(results.LLow) + finite(results.LUp)) / 2,
  );
  const toleranceLow = finite(results.LLow);
  const toleranceHigh = finite(results.LUp);
  const acceptanceLow = guardbandEnabled
    ? finite(results.gbResults.GBLOW)
    : finite(results.ALow, results.LLow);
  const acceptanceHigh = guardbandEnabled
    ? finite(results.gbResults.GBUP)
    : finite(results.AUp, results.LUp);
  // Acceptance limits usually coincide with the tolerance limits; only draw
  // them separately when they actually differ.
  const acceptanceDistinct =
    acceptanceLow !== toleranceLow || acceptanceHigh !== toleranceHigh;

  const decisionChart = useMemo(() => {
    const trueSigma = Math.max(Math.abs(finite(results.uUUT)), 1e-12);
    const observedSigma = Math.max(Math.abs(finite(results.uDev)), trueSigma);
    const widestSigma = Math.max(trueSigma, observedSigma);
    const domainLow = Math.min(toleranceLow, acceptanceLow, nominal - widestSigma * 4.2);
    const domainHigh = Math.max(toleranceHigh, acceptanceHigh, nominal + widestSigma * 4.2);
    const paddedSpan = Math.max(domainHigh - domainLow, widestSigma * 8, 1e-12);
    const low = domainLow - paddedSpan * 0.08;
    const high = domainHigh + paddedSpan * 0.08;
    const toX = (value) =>
      PLOT_LEFT + ((value - low) / (high - low)) * (PLOT_RIGHT - PLOT_LEFT);

    return {
      low,
      high,
      toX,
      truePath: curvePath(
        buildCurve({
          kind: "normal",
          center: nominal,
          spread: trueSigma,
          domainLow: low,
          domainHigh: high,
        }),
        toX,
        0.82,
      ),
      observedPath: curvePath(
        buildCurve({
          kind: "normal",
          center: nominal,
          spread: observedSigma,
          domainLow: low,
          domainHigh: high,
        }),
        toX,
        1,
      ),
    };
  }, [acceptanceHigh, acceptanceLow, nominal, results, toleranceHigh, toleranceLow]);

  const componentChart = useMemo(() => {
    if (!selectedComponent) return null;
    const kind = distributionKind(selectedComponent.distribution);
    const standard = selectedComponent.standardUncertainty;
    const limit = standard * selectedComponent.divisor;
    const shapeSpread = kind === "normal" ? standard : limit;
    const domainLimit = kind === "normal" ? Math.max(limit, standard * 4) : limit * 1.22;
    const low = -domainLimit;
    const high = domainLimit;
    const toX = (value) =>
      PLOT_LEFT + ((value - low) / (high - low)) * (PLOT_RIGHT - PLOT_LEFT);
    return {
      limit,
      standard,
      toX,
      path: curvePath(
        buildCurve({
          kind,
          center: 0,
          spread: shapeSpread,
          domainLow: low,
          domainHigh: high,
        }),
        toX,
      ),
    };
  }, [selectedComponent]);

  const pfa = guardbandEnabled ? results.gbResults.GBPFA : results.pfa;
  const pfr = guardbandEnabled ? results.gbResults.GBPFR : results.pfr;

  return (
    <section className="risk-viz-shell">
      <header className="risk-viz-header">
        <div>
          <span className="risk-viz-eyebrow">Decision confidence</span>
          <h3>Tolerance &amp; Uncertainty Visualizer</h3>
          <p>
            See how measurement uncertainty interacts with specification and
            acceptance limits.
          </p>
        </div>
        <div className="risk-viz-mode-switch" aria-label="Visualizer mode">
          <button
            type="button"
            className={mode === "decision" ? "active" : ""}
            onClick={() => setMode("decision")}
          >
            Risk View
          </button>
          <button
            type="button"
            className={mode === "component" ? "active" : ""}
            onClick={() => setMode("component")}
            disabled={!componentOptions.length}
          >
            Component View
          </button>
        </div>
      </header>

      {mode === "decision" ? (
        <>
          <div className="risk-viz-toolbar">
            <div className="risk-viz-legend">
              <span className="true"><i /> True UUT error</span>
              <span className="observed"><i /> Observed result</span>
              <span className="tolerance"><i /> Tolerance</span>
              {acceptanceDistinct && (
                <span className="acceptance">
                  <i /> {guardbandEnabled ? "Guardband acceptance" : "Acceptance"}
                </span>
              )}
            </div>
            <label
              className={`risk-viz-guardband ${!guardbandAvailable ? "disabled" : ""}`}
              title={
                guardbandAvailable
                  ? "Compare calculated guardband limits"
                  : "No converged guardband limits are available"
              }
            >
              <input
                type="checkbox"
                checked={guardbandEnabled}
                disabled={!guardbandAvailable}
                onChange={(event) => setShowGuardband(event.target.checked)}
              />
              <span className="risk-viz-toggle-track"><span /></span>
              Apply guardband
            </label>
          </div>

          <div className="risk-viz-main-grid">
            <div className="risk-viz-chart-card">
              <svg
                className="risk-viz-svg"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                role="img"
                aria-label="Tolerance, acceptance, true error, and observed result distributions"
              >
                <defs>
                  <linearGradient id={`${gradientId}-observed`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.52" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.03" />
                  </linearGradient>
                  <linearGradient id={`${gradientId}-true`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                <rect
                  x={decisionChart.toX(toleranceLow)}
                  y="52"
                  width={Math.max(
                    0,
                    decisionChart.toX(toleranceHigh) - decisionChart.toX(toleranceLow),
                  )}
                  height="200"
                  className="risk-viz-tolerance-band"
                />
                {acceptanceDistinct && (
                  <rect
                    x={decisionChart.toX(acceptanceLow)}
                    y="86"
                    width={Math.max(
                      0,
                      decisionChart.toX(acceptanceHigh) -
                        decisionChart.toX(acceptanceLow),
                    )}
                    height="166"
                    className={`risk-viz-acceptance-band ${guardbandEnabled ? "guardbanded" : ""}`}
                  />
                )}

                <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={BASELINE} y2={BASELINE} className="risk-viz-axis" />
                <line
                  x1={decisionChart.toX(nominal)}
                  x2={decisionChart.toX(nominal)}
                  y1="42"
                  y2={BASELINE + 8}
                  className="risk-viz-center-line"
                />

                <path
                  d={decisionChart.truePath}
                  fill={`url(#${gradientId}-true)`}
                  className="risk-viz-true-curve"
                />
                <path
                  d={decisionChart.observedPath}
                  fill={`url(#${gradientId}-observed)`}
                  className="risk-viz-observed-curve"
                />

                <LimitMarker
                  x={decisionChart.toX(toleranceLow)}
                  label="LTL"
                  value={toleranceLow}
                  unit={results.nativeUnit}
                  kind="tolerance"
                  top={30}
                  testId="risk-limit-tolerance-ltl"
                />
                <LimitMarker
                  x={decisionChart.toX(toleranceHigh)}
                  label="UTL"
                  value={toleranceHigh}
                  unit={results.nativeUnit}
                  kind="tolerance"
                  top={30}
                  testId="risk-limit-tolerance-utl"
                />
                {acceptanceDistinct && (
                  <>
                    <LimitMarker
                      x={decisionChart.toX(acceptanceLow)}
                      label={guardbandEnabled ? "GBL" : "LAL"}
                      value={acceptanceLow}
                      unit={results.nativeUnit}
                      kind="acceptance"
                      top={66}
                      testId={`risk-limit-acceptance-${guardbandEnabled ? "gbl" : "lal"}`}
                    />
                    <LimitMarker
                      x={decisionChart.toX(acceptanceHigh)}
                      label={guardbandEnabled ? "GBU" : "UAL"}
                      value={acceptanceHigh}
                      unit={results.nativeUnit}
                      kind="acceptance"
                      top={66}
                      testId={`risk-limit-acceptance-${guardbandEnabled ? "gbu" : "ual"}`}
                    />
                  </>
                )}

                <text x={decisionChart.toX(nominal)} y="282" className="risk-viz-axis-label" textAnchor="middle">
                  {formatNumber(nominal)} {results.nativeUnit}
                </text>
                <text x={decisionChart.toX(nominal)} y="307" className="risk-viz-nominal-label" textAnchor="middle">
                  Nominal / calculated mean
                </text>
              </svg>
              <div className="risk-viz-chart-caption">
                <span>
                  <strong>True error</strong> models expected UUT population spread.
                </span>
                <span>
                  <strong>Observed result</strong> includes calibration uncertainty.
                </span>
              </div>
            </div>

            <aside className="risk-viz-outcomes">
              <div className="risk-viz-outcomes-heading">
                <span>Decision outcomes</span>
                <strong>{guardbandEnabled ? "Guardbanded" : "As specified"}</strong>
              </div>
              <button
                type="button"
                className={`risk-viz-outcome false-accept ${activeModals.includes(
                  guardbandEnabled ? "gbpfa" : "pfa",
                ) ? "active" : ""}`}
                onClick={() => onShowBreakdown(guardbandEnabled ? "gbpfa" : "pfa")}
              >
                <span className="risk-viz-outcome-icon">FA</span>
                <span>
                  <small>False accept probability</small>
                  <strong>{formatNumber(pfa, 4)}%</strong>
                  <em>Bad unit reported as passing</em>
                </span>
              </button>
              <button
                type="button"
                className={`risk-viz-outcome false-reject ${activeModals.includes(
                  guardbandEnabled ? "gbpfr" : "pfr",
                ) ? "active" : ""}`}
                onClick={() => onShowBreakdown(guardbandEnabled ? "gbpfr" : "pfr")}
              >
                <span className="risk-viz-outcome-icon">FR</span>
                <span>
                  <small>False reject probability</small>
                  <strong>{formatNumber(pfr, 4)}%</strong>
                  <em>Good unit reported as failing</em>
                </span>
              </button>
              <div className="risk-viz-reading-guide">
                <p>Click a probability for the full calculation breakdown.</p>
              </div>
            </aside>
          </div>

          <div className="risk-viz-metrics">
            <MetricPill
              label="Combined standard uncertainty"
              value={`${formatNumber(results.uCal)} ${results.nativeUnit}`}
              onClick={() => onShowBreakdown("inputs")}
            />
            <MetricPill
              label="Expanded uncertainty"
              value={`+/- ${formatNumber(results.expandedUncertainty)} ${results.nativeUnit}`}
            />
            <MetricPill
              label="Tolerance used"
              value={`${formatNumber(results.LUp - results.LLow)} ${results.nativeUnit}`}
            />
            <MetricPill
              label={guardbandEnabled ? "Guardband acceptance width" : "Acceptance width"}
              value={`${formatNumber(acceptanceHigh - acceptanceLow)} ${results.nativeUnit}`}
              tone={guardbandEnabled ? "guardband" : "neutral"}
            />
          </div>
        </>
      ) : (
        <div className="risk-viz-component-view">
          <div className="risk-viz-component-controls">
            <label htmlFor="risk-component-select">Budget component</label>
            <select
              id="risk-component-select"
              value={selectedComponent?.id || ""}
              onChange={(event) => setSelectedComponentId(event.target.value)}
            >
              {componentOptions.map((component) => (
                <option key={component.id} value={component.id}>
                  {component.name} - {component.source}
                </option>
              ))}
            </select>
            {selectedComponent && (
              <div className="risk-viz-component-meta">
                <span><small>Distribution</small><strong>{selectedComponent.distribution}</strong></span>
                <span><small>Type</small><strong>Type {selectedComponent.type}</strong></span>
                <span><small>Quantity</small><strong>{selectedComponent.quantity}</strong></span>
              </div>
            )}
          </div>

          {selectedComponent && componentChart && (
            <div className="risk-viz-component-chart">
              <svg
                className="risk-viz-svg component"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                role="img"
                aria-label={`${selectedComponent.name} uncertainty distribution`}
              >
                <defs>
                  <linearGradient id={`${gradientId}-component`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.48" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                <rect
                  x={componentChart.toX(-componentChart.limit)}
                  y="52"
                  width={
                    componentChart.toX(componentChart.limit) -
                    componentChart.toX(-componentChart.limit)
                  }
                  height="200"
                  className="risk-viz-component-limit-band"
                />
                <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={BASELINE} y2={BASELINE} className="risk-viz-axis" />
                <line
                  x1={componentChart.toX(0)}
                  x2={componentChart.toX(0)}
                  y1="42"
                  y2={BASELINE + 8}
                  className="risk-viz-center-line"
                />
                <path
                  d={componentChart.path}
                  fill={`url(#${gradientId}-component)`}
                  className="risk-viz-component-curve"
                />
                <LimitMarker
                  x={componentChart.toX(-componentChart.limit)}
                  label="- limit"
                  value={-componentChart.limit}
                  unit={selectedComponent.unit}
                  kind="tolerance"
                  top={30}
                  testId="component-limit-lower"
                />
                <LimitMarker
                  x={componentChart.toX(componentChart.limit)}
                  label="+ limit"
                  value={componentChart.limit}
                  unit={selectedComponent.unit}
                  kind="tolerance"
                  top={30}
                  testId="component-limit-upper"
                />
                <text x={componentChart.toX(0)} y="282" className="risk-viz-axis-label" textAnchor="middle">0</text>
                <text x={componentChart.toX(0)} y="307" className="risk-viz-nominal-label" textAnchor="middle">
                  Error relative to nominal
                </text>
              </svg>
              <div className="risk-viz-component-readouts">
                <MetricPill
                  label="Tolerance / error limit"
                  value={`+/- ${formatNumber(componentChart.limit)} ${selectedComponent.unit}`}
                />
                <MetricPill
                  label="Distribution divisor"
                  value={divisorDescription(
                    selectedComponent.distribution,
                    selectedComponent.divisor,
                  )}
                />
                <MetricPill
                  label="Standard uncertainty"
                  value={`${formatNumber(componentChart.standard)} ${selectedComponent.unit}`}
                  tone="primary"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default RiskDistributionVisualizer;
