import { describe, expect, it } from "vitest";
import {
  computeEmpiricalRisk,
  findEmpiricalGuardBand,
  getFreshMcSummary,
  drawFromQuantiles,
} from "./empiricalRisk";
import { PFAMgr, PFRMgr, normalQuantile } from "./uncertaintyMath";
import { computeMcInputsHash } from "./monteCarlo";

// Build an evenly spaced quantile table (m points, p_k = k/(m-1)) for a
// zero-mean normal with std u. Endpoints use the effective tail of a 400k
// sample set, matching what the MC engine produces from finite samples.
const normalQuantiles = (u, m = 513) => {
  const q = new Array(m);
  for (let k = 0; k < m; k++) {
    const p =
      k === 0 ? 0.5 / 400000 : k === m - 1 ? 1 - 0.5 / 400000 : k / (m - 1);
    q[k] = u * normalQuantile(p);
  }
  return q;
};

// Centered half-normal (the |N(0,σ)| − mean shape a squared/abs equation
// produces): strictly bounded below, long upper tail.
const halfNormalQuantiles = (sigma, m = 513) => {
  const mean = sigma * Math.sqrt(2 / Math.PI);
  const q = new Array(m);
  for (let k = 0; k < m; k++) {
    const p =
      k === 0 ? 0.5 / 400000 : k === m - 1 ? 1 - 0.5 / 400000 : k / (m - 1);
    q[k] = sigma * normalQuantile((p + 1) / 2) - mean;
  }
  return q;
};

const baseCase = {
  average: 10,
  LLow: 9.8,
  LUp: 10.2,
  uCal: 0.05,
  reliability: 0.9,
};

describe("drawFromQuantiles", () => {
  it("interpolates linearly between grid points", () => {
    const q = [0, 10, 20];
    expect(drawFromQuantiles(q, 0)).toBe(0);
    expect(drawFromQuantiles(q, 0.25)).toBeCloseTo(5, 12);
    expect(drawFromQuantiles(q, 0.5)).toBe(10);
    expect(drawFromQuantiles(q, 1)).toBe(20);
  });
});

describe("computeEmpiricalRisk vs closed-form (normal errors)", () => {
  it("matches PFAMgr/PFRMgr when the error distribution is normal", () => {
    const emp = computeEmpiricalRisk({
      ...baseCase,
      errorQuantiles: normalQuantiles(baseCase.uCal),
    });
    const [pfaClosed, , , uUUTClosed] = PFAMgr(
      10,
      10,
      9.8,
      10.2,
      baseCase.uCal,
      baseCase.reliability,
      "",
      "",
    );
    const [pfrClosed] = PFRMgr(
      10,
      10,
      9.8,
      10.2,
      baseCase.uCal,
      baseCase.reliability,
      "",
      "",
    );

    expect(emp).not.toBeNull();
    // Same deconvolution formula → identical uUUT.
    expect(emp.uUUT).toBeCloseTo(uUUTClosed, 10);
    // Quadrant counts converge to the bivariate-normal integrals. 400k draws
    // give a binomial SE of ~2e-4 at these probabilities.
    expect(Math.abs(emp.pfa - pfaClosed)).toBeLessThan(8e-4);
    expect(Math.abs(emp.pfr - pfrClosed)).toBeLessThan(8e-4);
  });

  it("respects guard-banded acceptance limits (PFA drops, PFR rises)", () => {
    const errorQuantiles = normalQuantiles(baseCase.uCal);
    const open = computeEmpiricalRisk({ ...baseCase, errorQuantiles });
    const guarded = computeEmpiricalRisk({
      ...baseCase,
      errorQuantiles,
      accLow: 9.85,
      accUp: 10.15,
    });
    expect(guarded.pfa).toBeLessThan(open.pfa);
    expect(guarded.pfr).toBeGreaterThan(open.pfr);
  });

  it("returns null for degenerate configurations (closed-form fallback)", () => {
    // Reliability so high that uutUnc deconvolves to zero bias spread.
    const emp = computeEmpiricalRisk({
      ...baseCase,
      reliability: 0.999999,
      errorQuantiles: normalQuantiles(0.2),
      uCal: 0.2,
    });
    expect(emp).toBeNull();
  });
});

describe("findEmpiricalGuardBand", () => {
  it("guards symmetrically for a symmetric error distribution and meets the requirement", () => {
    const errorQuantiles = normalQuantiles(baseCase.uCal);
    const required = 0.005;
    const gb = findEmpiricalGuardBand({
      ...baseCase,
      pfaRequired: required,
      errorQuantiles,
    });
    expect(gb.met).toBe(true);
    const lowShift = gb.gbLow - baseCase.LLow;
    const highShift = baseCase.LUp - gb.gbUp;
    expect(lowShift).toBeGreaterThan(0);
    // Symmetric distribution → both limits guarded equally (within a couple
    // of percent from the quantile-table discretization).
    expect(Math.abs(lowShift - highShift)).toBeLessThan(0.03 * lowShift);
    // The guarded band actually achieves the requirement.
    const check = computeEmpiricalRisk({
      ...baseCase,
      errorQuantiles,
      accLow: gb.gbLow,
      accUp: gb.gbUp,
    });
    expect(check.pfa).toBeLessThanOrEqual(required * 1.15);
  });

  it("guards asymmetrically for a one-sided error distribution", () => {
    const errorQuantiles = halfNormalQuantiles(0.05);
    const gb = findEmpiricalGuardBand({
      ...baseCase,
      uCal: 0.05 * Math.sqrt(1 - 2 / Math.PI), // std of centered half-normal
      pfaRequired: 0.002,
      errorQuantiles,
    });
    expect(gb.met).toBe(true);
    const lowShift = gb.gbLow - baseCase.LLow;
    const highShift = baseCase.LUp - gb.gbUp;
    // Positive-error mass dominates → the LOW limit takes most of the guard.
    expect(lowShift).toBeGreaterThan(highShift * 1.5);
  });

  it("returns the open band when the requirement is already met", () => {
    const gb = findEmpiricalGuardBand({
      ...baseCase,
      uCal: 0.005, // tiny uncertainty → negligible PFA
      pfaRequired: 0.02,
      errorQuantiles: normalQuantiles(0.005),
    });
    expect(gb.mult).toBe(0);
    expect(gb.gbLow).toBe(baseCase.LLow);
    expect(gb.gbUp).toBe(baseCase.LUp);
  });
});

describe("getFreshMcSummary", () => {
  const tmdes = [{ id: "t1", variableType: "Length" }];
  const makePoint = (overrides = {}) => {
    const point = {
      propagationMode: "montecarlo",
      equationString: "y = x",
      variableMappings: { x: "Length" },
      inputCorrelations: {},
      components: [],
      ...overrides,
    };
    point.mcSummary = {
      hash: computeMcInputsHash({
        equationString: point.equationString,
        variableMappings: point.variableMappings,
        correlations: point.inputCorrelations,
        tmdeTolerances: tmdes,
        manualComponents: point.components,
      }),
      uBase: 0.5,
      meanBase: 10,
      intervalLowBase: 9,
      intervalHighBase: 11,
      quantiles: [9, 10, 11],
      ...(overrides.mcSummary || {}),
    };
    return point;
  };

  it("returns the summary when mode is MC and the hash matches", () => {
    expect(getFreshMcSummary(makePoint(), tmdes)).not.toBeNull();
  });

  it("returns null when inputs changed since the simulation", () => {
    const point = makePoint();
    point.equationString = "y = 2 * x";
    expect(getFreshMcSummary(point, tmdes)).toBeNull();
  });

  it("returns null in linear mode or without a summary", () => {
    expect(getFreshMcSummary(makePoint({ propagationMode: "linear" }), tmdes)).toBeNull();
    const noSummary = makePoint();
    delete noSummary.mcSummary;
    expect(getFreshMcSummary(noSummary, tmdes)).toBeNull();
  });
});
