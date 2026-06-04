import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  correlationKey,
  getCorrelation,
  combineWithCorrelation,
  normalQuantile,
  snapLimitsToResolution,
} from "./uncertaintyMath";
import { computePointRiskMetrics } from "./riskCompute";

// Signed base-SI contributions for BRG-3100 section 4.1.9 (T = W * L), using the
// workbook's Normal k=1.96 divisor on the beam (Length) and weight specs.
const cL = (0.002 / 1.9599639845) * 0.017637; // ≈ 1.79973e-5
const cW = (2.53968254e-5 / 1.9599639845) * 2.127; // ≈ 2.75612e-5
const cR = 2.8867513459481293e-6 * 1; // ≈ 2.88675e-6
const list = [
  { id: "Length", contribution: cL },
  { id: "Weight", contribution: cW },
  { id: "TI Resolution", contribution: cR },
];

describe("correlationKey / getCorrelation", () => {
  test("key is order-independent", () => {
    expect(correlationKey("Weight", "Length")).toBe("Length|Weight");
    expect(correlationKey("Length", "Weight")).toBe("Length|Weight");
  });

  test("self-correlation is 1, missing pair is 0", () => {
    expect(getCorrelation({}, "Weight", "Weight")).toBe(1);
    expect(getCorrelation({}, "Weight", "Length")).toBe(0);
    expect(getCorrelation({ "Length|Weight": 0.5 }, "Weight", "Length")).toBe(0.5);
  });
});

describe("combineWithCorrelation", () => {
  test("identity map reduces to RSS", () => {
    const rss = Math.sqrt(cL * cL + cW * cW + cR * cR);
    expect(combineWithCorrelation(list, {})).toBeCloseTo(rss, 12);
  });

  test("reproduces Excel 4.1.9 with rho(W,L)=1 and rho(W,R)=1", () => {
    const u_c = combineWithCorrelation(list, {
      "Length|Weight": 1,
      "TI Resolution|Weight": 1,
    });
    // Workbook reports 4.7360706e-5.
    expect(u_c).toBeCloseTo(4.73607e-5, 9);
  });

  test("positive correlation on opposing sensitivities reduces u_c (ratio)", () => {
    const ratio = [
      { id: "V1", contribution: 0.0049 },
      { id: "V2", contribution: -0.0048 },
    ];
    const indep = combineWithCorrelation(ratio, {});
    const corr = combineWithCorrelation(ratio, { "V1|V2": 1 });
    expect(corr).toBeLessThan(indep);
  });

  test("over-correlated matrix clamps to >= 0 (no NaN)", () => {
    const out = combineWithCorrelation(
      [
        { id: "A", contribution: 1 },
        { id: "B", contribution: 1 },
      ],
      { "A|B": -1 },
    );
    expect(Number.isFinite(out)).toBe(true);
    expect(out).toBeGreaterThanOrEqual(0);
  });
});

describe("normalQuantile", () => {
  test("matches the workbook coverage factor k=1.959964 at 95%", () => {
    // simple-statistics probit returned ~1.95716 — 0.14% short. The workbook
    // uses 1.9599639845.
    expect(normalQuantile(0.975)).toBeCloseTo(1.9599639845, 9);
    expect(normalQuantile(0.95)).toBeCloseTo(1.6448536269, 9);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 12);
  });
});

describe("snapLimitsToResolution", () => {
  test("rounds the band inward to the resolution grid (Excel)", () => {
    const r = snapLimitsToResolution(0.037264, 0.037764, 1e-5);
    expect(r.low).toBeCloseTo(0.03727, 9); // ceil up
    expect(r.high).toBeCloseTo(0.03776, 9); // floor down
  });

  test("no/invalid resolution leaves the band untouched", () => {
    expect(snapLimitsToResolution(0.037264, 0.037764, 0)).toEqual({
      low: 0.037264,
      high: 0.037764,
    });
  });

  test("a band-collapsing resolution is ignored", () => {
    // Resolution coarser than the band would invert it -> keep raw.
    const r = snapLimitsToResolution(0.0372, 0.0378, 0.01);
    expect(r).toEqual({ low: 0.0372, high: 0.0378 });
  });
});

describe("BRG-3100 4.1.9 full Excel mirror (riskCompute)", () => {
  test("PFA/PFR/TUR match the workbook", () => {
    const fp = path.resolve(
      __dirname,
      "../../../../../../Backend/ac_shunt/uncertainty/fixtures/mock/Derived.json",
    );
    const session = JSON.parse(fs.readFileSync(fp, "utf8"));
    const sessionData = {
      uncReq: session.uncReq,
      uutTolerance: session.uutTolerance,
    };
    const tp = session.testPoints.find((p) => p.section === "4.1.9");
    const m = computePointRiskMetrics(tp, sessionData);
    expect(m.tur).toBeCloseTo(2.6394, 2); // Excel 2.639367
    expect(m.pfa).toBeCloseTo(2.384, 1); // Excel 2.38%
    expect(m.pfr).toBeCloseTo(3.96, 1); // Excel 3.96%
  });
});
