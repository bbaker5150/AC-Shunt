import React from "react";

/**
 * Instrument-bench readout gauge for the risk dashboards.
 *
 * Mirrors the `.metric-pod` language used in the budget panel: a matte slate
 * face with a tinted status rail along the top, a soft-breathing status LED, a
 * tracked uppercase label and a monospace tabular readout. The accent color is
 * driven by a single class (`status` / `accent`) so the rail, LED, hover ring
 * and value stay in sync.
 *
 * Optionally renders a muted explanation `note` or a two-row `breakdown` list
 * beneath the value.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.label   - Short metric name (rendered uppercase).
 * @param {React.ReactNode} props.value   - The readout value.
 * @param {string} [props.status]         - Status accent: neutral|status-good|status-warning|status-bad.
 * @param {string} [props.accent]         - Extra accent class: accent-primary|accent-guardband.
 * @param {React.ReactNode} [props.note]  - Optional one-line explanation.
 * @param {Array<{label: React.ReactNode, value: React.ReactNode}>} [props.breakdown]
 * @param {boolean} [props.active]        - Highlight when its breakdown modal is open.
 * @param {Function} [props.onClick]      - Click handler (opens the breakdown).
 */
const RiskGauge = ({
  label,
  value,
  status = "neutral",
  accent,
  note,
  breakdown,
  active = false,
  onClick,
}) => {
  const classes = [
    "risk-gauge",
    status,
    accent || "",
    onClick ? "clickable" : "",
    active ? "active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} onClick={onClick}>
      <span className="risk-gauge-label">{label}</span>
      <span className="risk-gauge-value">{value}</span>
      {note && <span className="risk-gauge-note">{note}</span>}
      {breakdown && breakdown.length > 0 && (
        <ul className="risk-gauge-breakdown">
          {breakdown.map((row, i) => (
            <li key={i}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
};

export default RiskGauge;
