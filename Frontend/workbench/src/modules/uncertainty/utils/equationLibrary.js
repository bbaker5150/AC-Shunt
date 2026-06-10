// Curated measurement equations for the derived-point equation editor,
// organized by metrology field. Each entry is a plain mathjs expression (no
// "y =" prefix) plus suggested display names for its variables, so inserting
// one pre-fills the variable map and the user only has to assign TMDEs.
//
// Symbol naming rule: a symbol must NOT exist on the mathjs namespace
// (math[name] truthy) or the editor's variable extraction will silently drop
// it — that's why phase angle is `theta`, not `phi` (mathjs defines phi as
// the golden ratio). The unit test enforces this for every entry, and also
// checks each expression parses and is symbolically differentiable per
// variable (so the linear engine can build sensitivities).

export const equationLibrary = [
  {
    area: "Electrical",
    equations: [
      {
        // NB: the symbol can't be plain `I` — mathjs defines math.I, so the
        // editor's variable extraction would drop it (test-enforced).
        name: "AC real power",
        expression: "V * Irms * cos(theta)",
        description:
          "P = V·I·cos(θ). At unity power factor (θ = 0) the phase sensitivity vanishes — a stationary point; use Monte Carlo there.",
        variables: { V: "Voltage", Irms: "Current", theta: "Phase Angle" },
      },
      {
        name: "Resistance (Ohm's law)",
        expression: "V / Idc",
        description: "R = V/I from a sourced current and measured voltage drop.",
        variables: { V: "Voltage", Idc: "Current" },
      },
      {
        name: "Voltage divider",
        expression: "Vin * R2 / (R1 + R2)",
        description: "Output of a two-resistor divider.",
        variables: { Vin: "Input Voltage", R1: "Resistor 1", R2: "Resistor 2" },
      },
      {
        name: "Power across a resistance",
        expression: "V^2 / R",
        description: "P = V²/R, e.g. dissipation in a shunt.",
        variables: { V: "Voltage", R: "Resistance" },
      },
    ],
  },
  {
    area: "Dimensional",
    equations: [
      {
        name: "Thermal expansion",
        expression: "L0 * (1 + alpha * dT)",
        description: "Length corrected for temperature deviation from 20 °C.",
        variables: {
          L0: "Reference Length",
          alpha: "Expansion Coefficient",
          dT: "Temperature Deviation",
        },
      },
      {
        name: "Sine bar height",
        expression: "L * sin(theta)",
        description:
          "Gauge-block stack height for a sine bar of length L at angle θ.",
        variables: { L: "Bar Length", theta: "Angle" },
      },
    ],
  },
  {
    area: "Mass / Force / Torque",
    equations: [
      {
        name: "Force from mass",
        expression: "m * g",
        description: "F = m·g with local gravity.",
        variables: { m: "Mass", g: "Local Gravity" },
      },
      {
        name: "Torque",
        expression: "F * L",
        description: "T = F·L, force applied at a lever arm.",
        variables: { F: "Force", L: "Arm Length" },
      },
      {
        name: "Deadweight pressure",
        expression: "F / A",
        description: "P = F/A for a deadweight tester piston.",
        variables: { F: "Force", A: "Piston Area" },
      },
    ],
  },
  {
    area: "Pressure / Flow",
    equations: [
      {
        name: "Hydrostatic head",
        expression: "rho * g * h",
        description: "P = ρ·g·h for a liquid column.",
        variables: { rho: "Fluid Density", g: "Local Gravity", h: "Column Height" },
      },
    ],
  },
  {
    area: "Temperature",
    equations: [
      {
        name: "RTD temperature (linear)",
        expression: "(R / R0 - 1) / alpha",
        description: "Linearized RTD: T from measured resistance ratio.",
        variables: {
          R: "Measured Resistance",
          R0: "Resistance at 0 °C",
          alpha: "Temperature Coefficient",
        },
      },
    ],
  },
  {
    area: "RF / Power ratio",
    equations: [
      {
        name: "Power in dBm",
        expression: "10 * log(P / 0.001) / log(10)",
        description: "Convert watts to dBm (ln-based so it stays differentiable).",
        variables: { P: "Power (W)" },
      },
      {
        name: "VSWR from reflection",
        expression: "(1 + G) / (1 - G)",
        description: "Voltage standing-wave ratio from reflection magnitude |Γ|.",
        variables: { G: "Reflection Magnitude" },
      },
    ],
  },
  {
    area: "AC waveform",
    equations: [
      {
        name: "RMS from peak (sine)",
        expression: "Vp / sqrt(2)",
        description: "Sine-wave RMS from peak amplitude.",
        variables: { Vp: "Peak Voltage" },
      },
      {
        name: "THD (first harmonics)",
        expression: "sqrt(h2^2 + h3^2 + h5^2) / V1",
        description:
          "Total harmonic distortion from harmonic amplitudes. Near-zero harmonics are stationary points — use Monte Carlo there.",
        variables: {
          h2: "2nd Harmonic",
          h3: "3rd Harmonic",
          h5: "5th Harmonic",
          V1: "Fundamental",
        },
      },
    ],
  },
];
