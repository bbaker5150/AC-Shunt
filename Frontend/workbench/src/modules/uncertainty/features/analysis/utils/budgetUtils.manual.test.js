import { describe, test, expect } from "vitest";
import { getBudgetComponentsFromTolerance } from "./budgetUtils";

// Manual Type B components authored in the instrument builder are stored on
// tolerance.manualComponents and resolved into the budget against the point's
// nominal at budget time (so a reused instrument range scales correctly).
describe("getBudgetComponentsFromTolerance - manual Type B components", () => {
  const ref = { value: "10", unit: "psig" };

  test("absolute tolerance limit is divided by the distribution divisor", () => {
    const comps = getBudgetComponentsFromTolerance(
      {
        name: "UUT",
        manualComponents: [
          {
            id: "m1",
            name: "Cal Cert",
            unit: "psig",
            inputMode: "tolerance",
            toleranceLimit: "0.001",
            distribution: "1.732",
          },
        ],
      },
      ref,
    );
    const mc = comps.find((c) => c.isManual);
    expect(mc).toBeTruthy();
    expect(mc.name).toBe("UUT - Cal Cert");
    expect(mc.type).toBe("B");
    expect(mc.dof).toBe(Infinity);
    // 0.001 psig / 1.732 = 5.774e-4 psig of u_i; relative to 10 psig = 57.74 ppm
    expect(mc.value).toBeCloseTo(57.737, 2);
    expect(mc.value_native).toBeCloseTo(5.7737e-4, 7);
  });

  test("relative standard uncertainty is used directly (divisor 1)", () => {
    const comps = getBudgetComponentsFromTolerance(
      {
        name: "UUT",
        manualComponents: [
          {
            id: "m2",
            name: "Drift",
            unit: "%",
            inputMode: "standard",
            standardUncertainty: "0.05",
          },
        ],
      },
      ref,
    );
    const mc = comps.find((c) => c.isManual);
    // 0.05% of reading entered as a standard uncertainty -> 500 ppm
    expect(mc.value).toBeCloseTo(500, 3);
  });

  test("incomplete or non-positive components are skipped", () => {
    const comps = getBudgetComponentsFromTolerance(
      {
        name: "UUT",
        manualComponents: [
          { id: "a", name: "blank", unit: "psig", inputMode: "tolerance" },
          {
            id: "b",
            name: "zero",
            unit: "psig",
            inputMode: "tolerance",
            toleranceLimit: "0",
            distribution: "1.732",
          },
        ],
      },
      ref,
    );
    expect(comps.filter((c) => c.isManual)).toHaveLength(0);
  });
});
