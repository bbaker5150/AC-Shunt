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
  it("additively composes multiple TMDEs assigned to one derived input", () => {
    const result = calculateDerivedUncertainty(
      "y = x",
      { x: "Length" },
      [makeTmde("tmde-a"), makeTmde("tmde-b")],
      { value: 20, unit: "V" },
    );

    expect(result.error).toBeNull();
    // Two TMDEs each reading 10 compose ADDITIVELY into the variable: 10+10=20.
    // (Previously only the first TMDE's value was kept, giving 10.)
    expect(result.nominalResult).toBeCloseTo(20, 10);
    // Combined uncertainty is absolute, so the two independent ±1 V floors still
    // RSS to √(1/3 + 1/3) = √(2/3) regardless of the summed nominal.
    expect(result.combinedUncertaintyNative).toBeCloseTo(
      Math.sqrt(2 / 3),
      8,
    );
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].type).toBe("Length");
  });
});
