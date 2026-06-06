import { describe, expect, it } from "vitest";
import { calculateDerivedUncertainty } from "./uncertaintyMath";

const makeTmde = (id) => ({
  id,
  variableType: "Length",
  measurementPoint: { value: 10, unit: "V" },
  floor: {
    high: 1,
    low: -1,
    unit: "V",
    symmetric: true,
    distribution: "1.7320508075688772",
  },
});

describe("calculateDerivedUncertainty input contributors", () => {
  it("combines multiple TMDE variances assigned to one derived input", () => {
    const result = calculateDerivedUncertainty(
      "y = x",
      { x: "Length" },
      [makeTmde("tmde-a"), makeTmde("tmde-b")],
      { value: 10, unit: "V" },
    );

    expect(result.error).toBeNull();
    expect(result.nominalResult).toBeCloseTo(10, 10);
    expect(result.combinedUncertaintyNative).toBeCloseTo(
      Math.sqrt(2 / 3),
      8,
    );
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].type).toBe("Length");
  });
});
