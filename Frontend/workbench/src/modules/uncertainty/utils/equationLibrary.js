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
      {
        name: "Four-terminal resistance (lead-corrected)",
        expression: "V / Idc - Rlead",
        description:
          "Resistance from a sourced current and measured drop, minus a residual lead/contact correction.",
        variables: { V: "Voltage", Idc: "Current", Rlead: "Lead Resistance" },
      },
      {
        name: "Capacitive reactance",
        expression: "1 / (2 * pi * fr * C)",
        description: "Xc = 1/(2πfC).",
        variables: { fr: "Frequency", C: "Capacitance" },
      },
      {
        name: "Inductive reactance",
        expression: "2 * pi * fr * Lh",
        description: "Xl = 2πfL.",
        variables: { fr: "Frequency", Lh: "Inductance" },
      },
      {
        name: "Power factor",
        expression: "Preal / (V * Irms)",
        description: "PF = P / (V·I): real over apparent power.",
        variables: { Preal: "Real Power", V: "Voltage", Irms: "Current" },
      },
      {
        name: "Attenuator output voltage",
        expression: "Vin * 10^(-dB / 20)",
        description: "Output of an attenuator specified in dB.",
        variables: { Vin: "Input Voltage", dB: "Attenuation (dB)" },
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
      {
        name: "Three-wire thread pitch diameter",
        expression: "Mw - 3 * w + 0.866025 * Ptc",
        description:
          "E = M − 3w + 0.866025·P for 60° threads measured over wires.",
        variables: {
          Mw: "Measurement Over Wires",
          w: "Wire Diameter",
          Ptc: "Thread Pitch",
        },
      },
      {
        name: "Length comparison (differential expansion)",
        expression: "Ls + dL + Ls * (alphaS * dTs - alphaU * dTu)",
        description:
          "Comparator measurement against a standard with per-artifact thermal corrections.",
        variables: {
          Ls: "Standard Length",
          dL: "Measured Difference",
          alphaS: "Standard Exp. Coefficient",
          dTs: "Standard Temp. Deviation",
          alphaU: "UUT Exp. Coefficient",
          dTu: "UUT Temp. Deviation",
        },
      },
      {
        name: "Angle from rise over run",
        expression: "atan(rise / run)",
        description: "Small-angle measurement from a height difference and base length.",
        variables: { rise: "Rise (Height)", run: "Run (Base Length)" },
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
      {
        name: "Conventional mass (air buoyancy)",
        expression: "mr * (1 + (rhoA - 1.2) * (1 / rhoW - 1 / 8000))",
        description:
          "OIML conventional-mass correction for air density vs the 8000 kg/m³ reference.",
        variables: {
          mr: "Reference Mass",
          rhoA: "Air Density",
          rhoW: "Weight Density",
        },
      },
      {
        name: "Torque at an angle",
        expression: "F * Larm * cos(theta)",
        description:
          "T = F·L·cos(θ): lever-arm torque with an off-perpendicular loading angle. At θ = 0 the angle sensitivity vanishes — use Monte Carlo there.",
        variables: { F: "Force", Larm: "Arm Length", theta: "Loading Angle" },
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
      {
        name: "Deadweight pressure (buoyancy-corrected)",
        expression: "m * g * (1 - rhoA / rhoM) / Ap",
        description:
          "Piston-gauge pressure including the air-buoyancy correction on the masses.",
        variables: {
          m: "Applied Mass",
          g: "Local Gravity",
          rhoA: "Air Density",
          rhoM: "Mass Density",
          Ap: "Effective Piston Area",
        },
      },
      {
        name: "Orifice mass flow",
        expression: "Cd * Ao * sqrt(2 * rho * dP) / sqrt(1 - betaR^4)",
        description:
          "Differential-pressure flow through an orifice plate (β = d/D diameter ratio).",
        variables: {
          Cd: "Discharge Coefficient",
          Ao: "Orifice Area",
          rho: "Fluid Density",
          dP: "Differential Pressure",
          betaR: "Diameter Ratio",
        },
      },
      {
        name: "Volumetric flow (collected volume)",
        expression: "Vol / tElapsed",
        description: "Q = V/t from a timed collection.",
        variables: { Vol: "Collected Volume", tElapsed: "Collection Time" },
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
      {
        name: "Callendar–Van Dusen resistance (t ≥ 0 °C)",
        expression: "R0 * (1 + Ac * t + Bc * t^2)",
        description:
          "PRT resistance from temperature with the A and B coefficients (above 0 °C).",
        variables: {
          R0: "Resistance at 0 °C",
          Ac: "CVD A Coefficient",
          Bc: "CVD B Coefficient",
          t: "Temperature (°C)",
        },
      },
      {
        name: "Thermocouple temperature (linearized)",
        expression: "(emf - emf0) / seebeck",
        description:
          "Temperature difference from measured EMF using a local Seebeck coefficient.",
        variables: {
          emf: "Measured EMF",
          emf0: "Reference-Junction EMF",
          seebeck: "Seebeck Coefficient",
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
      {
        name: "Return loss (dB)",
        expression: "-20 * log(G) / log(10)",
        description: "RL = −20·log₁₀|Γ| (ln-based so it stays differentiable).",
        variables: { G: "Reflection Magnitude" },
      },
      {
        name: "Attenuation from power ratio (dB)",
        expression: "10 * log(Pin / Pout) / log(10)",
        description: "Insertion loss / attenuation from input and output power.",
        variables: { Pin: "Input Power", Pout: "Output Power" },
      },
      {
        name: "Mismatch factor",
        expression: "(1 - G1 * G2)^2",
        description:
          "Power-transfer mismatch between source and load reflection magnitudes (worst-case phase aligned).",
        variables: { G1: "Source Reflection", G2: "Load Reflection" },
      },
    ],
  },
  {
    area: "Time / Frequency",
    equations: [
      {
        name: "Fractional frequency offset",
        expression: "(fMeas - fRef) / fRef",
        description: "Δf/f of a device under test against a reference.",
        variables: { fMeas: "Measured Frequency", fRef: "Reference Frequency" },
      },
      {
        name: "Period from frequency",
        expression: "1 / fMeas",
        description: "T = 1/f.",
        variables: { fMeas: "Measured Frequency" },
      },
    ],
  },
  {
    area: "Acoustics / Vibration",
    equations: [
      {
        name: "Sound pressure level (dB SPL)",
        expression: "20 * log(p / 0.00002) / log(10)",
        description: "SPL re 20 µPa (ln-based so it stays differentiable).",
        variables: { p: "Sound Pressure (Pa)" },
      },
      {
        name: "Accelerometer sensitivity",
        expression: "Vout / accel",
        description: "S = V/a from a back-to-back vibration comparison.",
        variables: { Vout: "Output Voltage", accel: "Applied Acceleration" },
      },
    ],
  },
  {
    area: "Optical / Photometric",
    equations: [
      {
        name: "Inverse-square illuminance",
        expression: "Iv / d^2",
        description: "E = I/d² for a point source at distance d.",
        variables: { Iv: "Luminous Intensity", d: "Distance" },
      },
      {
        name: "Refractive index (Snell)",
        expression: "sin(theta1) / sin(theta2)",
        description:
          "n₂/n₁ from incidence and refraction angles. Near normal incidence both sensitivities shrink — consider Monte Carlo.",
        variables: { theta1: "Incidence Angle", theta2: "Refraction Angle" },
      },
    ],
  },
  {
    area: "Humidity / Environmental",
    equations: [
      {
        name: "Saturation vapor pressure (Magnus)",
        expression: "6.112 * exp(17.62 * t / (243.12 + t))",
        description: "Magnus form over water, hPa from °C.",
        variables: { t: "Air Temperature (°C)" },
      },
      {
        name: "Relative humidity from vapor pressures",
        expression: "100 * pv / psat",
        description: "%RH from partial and saturation vapor pressure.",
        variables: { pv: "Vapor Pressure", psat: "Saturation Vapor Pressure" },
      },
    ],
  },
  {
    area: "Chemical / Analytical",
    equations: [
      {
        name: "Dilution concentration",
        expression: "C1 * V1 / V2",
        description: "C₂ = C₁·V₁/V₂ for a single-step dilution.",
        variables: {
          C1: "Stock Concentration",
          V1: "Aliquot Volume",
          V2: "Final Volume",
        },
      },
      {
        name: "Molar concentration",
        expression: "mSol / (MW * VolL)",
        description: "c = m/(M·V) from solute mass, molar mass, and volume.",
        variables: {
          mSol: "Solute Mass",
          MW: "Molar Mass",
          VolL: "Solution Volume",
        },
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
