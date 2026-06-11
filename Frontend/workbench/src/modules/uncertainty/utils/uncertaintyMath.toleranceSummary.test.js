import { describe, expect, it } from "vitest";
import {
  errorDistributions,
  getToleranceErrorSummary,
} from "./uncertaintyMath";

describe("getToleranceErrorSummary", () => {
  it("ignores a textual range label when calculating point tolerance", () => {
    const tolerance = {
      range: "100 V Range",
      min: 10.000000001,
      max: 100,
      unit: "V",
      reading: {
        high: 0.0045,
        low: -0.0045,
        unit: "%",
        symmetric: true,
        distribution: "1.7320508075688772",
      },
    };

    expect(
      getToleranceErrorSummary(tolerance, { value: 15, unit: "V" }),
    ).toBe("±0.000675 V");
  });
});

describe("errorDistributions", () => {
  it("offers a normal distribution with k=1", () => {
    expect(errorDistributions).toContainEqual({
      value: "1.000",
      label: "Normal (k=1)",
    });
  });
});
