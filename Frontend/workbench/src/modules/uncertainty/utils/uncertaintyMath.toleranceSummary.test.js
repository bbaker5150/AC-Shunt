import { describe, expect, it } from "vitest";
import { getToleranceErrorSummary } from "./uncertaintyMath";

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
