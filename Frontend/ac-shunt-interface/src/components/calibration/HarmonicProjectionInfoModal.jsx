// src/components/calibration/HarmonicProjectionInfoModal.js
// Explainer for the "Harmonic projection" LF AC measurement setting.

import React from "react";
import { FaTimes } from "react-icons/fa";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

const SectionHeading = ({ children }) => (
  <h4 style={{ margin: "1.4rem 0 0.5rem", fontSize: "1.05rem", fontWeight: 600 }}>
    {children}
  </h4>
);

const StatusLine = ({ children }) => (
  <div
    style={{
      fontFamily: "'JetBrains Mono', 'Fira Mono', Consolas, monospace",
      padding: "0.6rem 0.9rem",
      margin: "0.4rem 0 0.8rem",
      borderRadius: "6px",
      background: "var(--color-surface-2, rgba(127,127,127,0.08))",
      borderLeft: "3px solid var(--color-accent, #4f8cff)",
      fontSize: "0.88rem",
      lineHeight: 1.5,
      whiteSpace: "pre-wrap",
    }}
  >
    {children}
  </div>
);

const HarmonicViz = () => {
  const W = 640, H = 180;
  const padL = 16, padR = 16, padT = 22, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const tMin = -4, tMax = 4;
  const a = 0.5, b = 0.006, rippleAmp = 0.14, omegaR = Math.PI;

  const model = t => a + b * t + rippleAmp * Math.cos(omegaR * t);

  const yMin = 0.18, yMax = 0.82;
  const sx = t  => padL + (t - tMin) / (tMax - tMin) * plotW;
  const sy = y  => padT + (yMax - y) / (yMax - yMin) * plotH;

  const noiseVals = [
     0.018, -0.022,  0.014, -0.019,  0.021, -0.016,  0.013, -0.024,
     0.020, -0.017,  0.023, -0.015,  0.016, -0.021,  0.019, -0.013,
     0.022, -0.018,  0.015, -0.023,  0.017, -0.020,  0.011, -0.016,
  ];
  const samples = noiseVals.map((n, i) => {
    const t = tMin + (i + 0.5) * (tMax - tMin) / noiseVals.length;
    return { t, y: model(t) + n };
  });

  const curvePath = Array.from({ length: 300 }, (_, i) => {
    const t = tMin + i * (tMax - tMin) / 299;
    return `${i === 0 ? "M" : "L"}${sx(t).toFixed(1)},${sy(model(t)).toFixed(1)}`;
  }).join(" ");

  const dcY  = sy(a);
  const midX = sx(0);

  return (
    <div style={{ margin: "1rem 0 0.5rem" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", width: "100%", maxWidth: W, margin: "0 auto", overflow: "visible" }}
        aria-label="Harmonic projection visualisation"
      >
        {/* Axis lines */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />

        {/* Window boundary ticks */}
        <line x1={padL}    y1={H - padB} x2={padL}    y2={H - padB + 5} stroke="currentColor" strokeOpacity={0.4} strokeWidth={1} />
        <line x1={midX}    y1={H - padB} x2={midX}    y2={H - padB + 5} stroke="currentColor" strokeOpacity={0.4} strokeWidth={1} />
        <line x1={W - padR} y1={H - padB} x2={W - padR} y2={H - padB + 5} stroke="currentColor" strokeOpacity={0.4} strokeWidth={1} />

        {/* Midpoint vertical guide */}
        <line x1={midX} y1={padT} x2={midX} y2={H - padB} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4,4" strokeWidth={1} />

        {/* Recovered DC line */}
        <line x1={padL} y1={dcY} x2={W - padR} y2={dcY} stroke="#4f8cff" strokeWidth={1.5} strokeDasharray="7,4" strokeOpacity={0.9} />

        {/* Fitted model curve */}
        <path d={curvePath} fill="none" stroke="#ff9f40" strokeWidth={2} strokeOpacity={0.85} />

        {/* Raw sample dots */}
        {samples.map((s, i) => (
          <circle key={i} cx={sx(s.t).toFixed(1)} cy={sy(s.y).toFixed(1)} r={3.5}
            fill="currentColor" fillOpacity={0.55} />
        ))}

        {/* Axis labels */}
        <text x={padL}     y={H - padB + 16} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.45}>−T/2</text>
        <text x={midX}     y={H - padB + 16} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.45}>0</text>
        <text x={W - padR} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.45}>+T/2</text>
        <text x={W / 2}    y={H - padB + 28} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.35} fontStyle="italic">t′</text>

        {/* DC label inline */}
        <text x={W - padR - 5} y={dcY - 5} textAnchor="end" fontSize={10} fill="#4f8cff" fillOpacity={0.9}>
          recovered DC (a)
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", fontSize: "0.8rem", opacity: 0.65, marginTop: "0.25rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <svg width={14} height={10}><circle cx={7} cy={5} r={3.5} fill="currentColor" fillOpacity={0.6} /></svg>
          raw samples
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <svg width={24} height={10}><line x1={0} y1={5} x2={24} y2={5} stroke="#ff9f40" strokeWidth={2} /></svg>
          fitted model
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <svg width={24} height={10}><line x1={0} y1={5} x2={24} y2={5} stroke="#4f8cff" strokeWidth={1.5} strokeDasharray="6,3" /></svg>
          recovered DC
        </span>
      </div>
    </div>
  );
};

const HarmonicProjectionInfoModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "780px", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Harmonic Projection — LF AC measurement method</h3>
          <button onClick={onClose} className="modal-close-button" aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div style={{ padding: "0.5rem 0.25rem 1rem", lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            On low-frequency AC test points (≤ 40 Hz), the TVC output is{" "}
            <strong>not</strong> a clean DC voltage — it is a DC level{" "}
            <strong>plus a coherent thermal ripple at exactly twice the source
            frequency</strong>. The following sections explain the physical
            origin of that ripple and how the harmonic-projection algorithm
            eliminates it.
          </p>

          <SectionHeading>1. Why the TVC produces ripple at 2f</SectionHeading>
          <p>
            A single-junction thermal voltage converter is a heater wire whose
            temperature is read by a thermocouple. The heater dissipates
            instantaneous power proportional to <InlineMath math="v^2(t)" />.
            For a sinusoidal drive <InlineMath math="v(t) = V_{pk}\sin(\omega t)" />,
            the cosine-squared identity gives:
          </p>
          <BlockMath math={`p(t) = \\frac{V_{pk}^2}{2R}\\bigl(1 - \\cos(2\\omega t)\\bigr)`} />
          <p>
            The dissipated power is therefore a DC component (the quantity of
            interest) plus a tone at exactly{" "}
            <strong>2× the source frequency</strong>. The thermocouple's thermal
            mass acts as a single-pole low-pass filter at roughly{" "}
            <InlineMath math="1/(2\pi\tau_{thermal})" />. For typical SJTVCs
            (τ ≈ 100 ms) the cutoff is near 1.5 Hz, so a 10 Hz drive produces
            a 20 Hz ripple attenuated by only ~12×, leaving a few-percent
            residual riding on the DC output.
          </p>

          <SectionHeading>2. What harmonic projection does</SectionHeading>
          <p>
            After the capture window closes, the timestamped samples are treated
            as observations of a known-shape signal and <strong>fitted
            directly</strong>. The model is:
          </p>
          <BlockMath math={`y(t) = a + b\\,t' + c\\cos(2\\omega t) + d\\sin(2\\omega t) + e\\cos(4\\omega t) + f\\sin(4\\omega t)`} />
          <p>
            where <InlineMath math="t' = t - T/2" /> is time measured from the
            window midpoint, and <InlineMath math="T" /> is the total window
            duration. The coefficients are solved via least-squares. Only the
            DC coefficient <InlineMath math="a" /> is reported — it gives the
            DC equivalent at the <em>window midpoint</em>, the most
            representative estimate when the TVC is still slowly settling. All
            other coefficients (drift slope, ripple amplitude and phase) are
            discarded.
          </p>

          <HarmonicViz />

          <p>
            This is mathematically equivalent to a single-bin DFT evaluated on
            a non-uniform time grid. Four properties are significant in practice:
          </p>
          <ul style={{ marginLeft: "1.2rem" }}>
            <li>
              <strong>Insensitive to start phase.</strong> Whatever phase the
              ripple carries when the window opens is absorbed into{" "}
              <InlineMath math="c" /> and <InlineMath math="d" />. Repeated
              captures of the same test point produce reproducible DC estimates
              rather than wandering with the wall clock.
            </li>
            <li>
              <strong>Captures thermal drift during the window.</strong> Cold
              TVCs — running below rated voltage, or at partial shunt load —
              may continue settling even after the minimum dwell time. The
              linear <InlineMath math="b\,t'" /> term absorbs this slow drift
              so it cannot bias <InlineMath math="a" />. Without it, an
              uncorrected drift would be partially aliased into the ripple
              coefficients, shifting the recovered DC.
            </li>
            <li>
              <strong>Insensitive to NPLC alignment.</strong> Each sample is
              an observation of DC + drift + ripple; the blur imposed by NPLC
              integration is independent zero-mean noise that the fit averages
              over.
            </li>
            <li>
              <strong>Composes with the 11 Hz analog filter.</strong> The
              filter reduces ripple amplitude before the ADC; the fit removes
              whatever remains. The cos/sin basis vectors absorb the filter's
              phase shift automatically. DC passes the filter unchanged, so no
              bias is introduced.
            </li>
          </ul>

          <SectionHeading>3. Cycle snapping and midpoint timestamps</SectionHeading>
          <p>
            Two details work together to keep the fit well-conditioned without
            constraining the NPLC selection:
          </p>
          <ul style={{ marginLeft: "1.2rem" }}>
            <li>
              <strong>Cycle snapping.</strong> The capture window is extended
              to the nearest integer number of 2f ripple periods. An
              exact-period window makes the cos/sin columns of the design
              matrix orthogonal to each other and to the drift column, reducing
              the condition number and stabilising the least-squares solve. The
              fit remains valid without this — the solver handles non-orthogonal
              matrices — but snapping provides free conditioning improvement and
              is always applied.
            </li>
            <li>
              <strong>Midpoint timestamps.</strong> Each 34420A reading is
              timestamped at the <em>centre of its NPLC integration aperture</em>{" "}
              rather than at the reading-complete event. This places every
              observation at the true temporal midpoint of the ADC measurement,
              so the model columns accurately describe the signal integrated by
              the instrument rather than one that had already concluded.
            </li>
          </ul>
          <p>
            More samples always reduce the variance of the recovered DC — the
            fit's standard error scales as{" "}
            <InlineMath math="\sigma_{noise}/\!\sqrt{N}" />. If NPLC is set
            high enough that fewer than 10 samples fit in the requested window,
            the window is automatically extended and reported in the status feed
            (e.g.{" "}
            <em>"NPLC=200 needs 35.0 s window (extended from 4.0 s) for the harmonic fit"</em>).
            The NPLC setting is never silently overridden.
          </p>

          <SectionHeading>4. Residual ppm and AC-DC difference uncertainty</SectionHeading>
          <p>
            After every capture the status feed prints a line of the form:
          </p>
          <StatusLine>STD: harmonic fit DC = 0.008134 (residual 4.21 ppm, N=120, 2 harmonics)</StatusLine>
          <p>
            The fundamental quantity in a TVC-based AC voltage calibration is
            the <strong>AC-DC difference</strong>:
          </p>
          <BlockMath math={`\\delta = \\frac{V_{ac} - V_{dc}}{V_{dc}} \\times 10^{6} \\quad [\\text{ppm}]`} />
          <p>
            The harmonic fit recovers <InlineMath math="a" /> as{" "}
            <InlineMath math="V_{ac}" /> — the DC equivalent of the AC input at
            the window midpoint. The reported residual is:
          </p>
          <BlockMath math={`\\text{residual} = \\frac{1}{|a|}\\sqrt{\\frac{SSR}{N - K}} \\times 10^{6} \\quad [\\text{ppm}]`} />
          <p>
            where <InlineMath math="K" /> is the parameter count: 4 for 1
            harmonic pair, 6 for 2 (default), 8 for 3. This is the RMS of
            everything the model could <strong>not</strong> explain — Johnson
            noise, mains pickup that passed the analog filter, source
            instability — expressed in ppm of the recovered DC.
          </p>
          <p>
            Because the ripple and thermal drift are explicit terms in the
            model, they contribute <strong>nothing</strong> to the residual.
            The result is a <em>clean noise floor on{" "}
            <InlineMath math="V_{ac}" /></em> that propagates directly into the
            AC-DC difference uncertainty. A residual of 4 ppm represents a
            ±4 ppm random uncertainty contribution to <InlineMath math="\delta" />,
            before combining with DC reference stability, thermocouple EMF
            drift, and other terms in the uncertainty budget.
          </p>
          <ul style={{ marginLeft: "1.2rem" }}>
            <li>
              <strong>Below ~5 ppm:</strong> near the instrument noise floor at
              the selected NPLC — this contribution to the AC-DC difference
              uncertainty budget is negligible.
            </li>
            <li>
              <strong>5–30 ppm:</strong> typical for LF AC on the bench.
              Increase <InlineMath math="N" /> (longer window or lower NPLC)
              if the uncertainty budget requires a tighter bound.
            </li>
            <li>
              <strong>Above ~100 ppm:</strong> indicates an extraneous noise
              source — possible candidates include amplifier drift, a guard
              issue, or a TVC that has not yet reached thermal equilibrium (try
              extending the Low-Frequency Settling time). The ripple itself is
              fully accounted for by this point.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default HarmonicProjectionInfoModal;
