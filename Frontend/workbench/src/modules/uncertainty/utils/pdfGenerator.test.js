import { describe, expect, it } from "vitest";
import { buildSessionReportModel } from "./pdfGenerator";

const helpers = {
  getToleranceErrorSummary: () => "+/- 0.5 in-oz",
  getAbsoluteLimits: () => ({
    low: "9.5 in-oz",
    high: "10.5 in-oz",
  }),
};

describe("buildSessionReportModel", () => {
  it("preserves area, UUT, range, and point hierarchy with all risk fields", () => {
    const session = {
      name: "Torque Session",
      measurementAreas: [{ id: "area-1", name: "Torque" }],
      uuts: [
        {
          id: "uut-1",
          name: "Torque Analyzer",
          description: "Primary UUT",
          measurementAreaId: "area-1",
          ranges: [
            {
              id: "range-1",
              min: 6.000000001,
              max: 20,
              unit: "in-oz",
            },
          ],
        },
      ],
      testPoints: [
        {
          id: "point-1",
          section: "4.1",
          measurementAreaId: "area-1",
          associatedUutIds: ["uut-1"],
          uutTolerance: {
            min: 6.000000001,
            max: 20,
            unit: "in-oz",
          },
          testPointInfo: {
            parameter: { value: 10, unit: "in-oz" },
          },
        },
      ],
    };
    const risk = {
      "point-1": {
        pfa: 1.25,
        pfr: 0.5,
        tur: 4.2,
        tar: 5.1,
        gbPfa: 0.9,
        gbPfr: 0.4,
        gbMult: 87.5,
        gbLow: 9.6,
        gbHigh: 10.4,
      },
    };

    const report = buildSessionReportModel(session, risk, helpers);
    const area = report.areas[0];
    const uut = area.uuts[0];
    const range = uut.ranges[0];
    const row = range.rows[0];

    expect(area.name).toBe("Torque");
    expect(uut.name).toBe("Torque Analyzer");
    expect(range.label).toBe("6 to 20 in-oz");
    expect(row).toMatchObject({
      section: "4.1",
      value: "10",
      unit: "in-oz",
      tolerance: "+/- 0.5 in-oz",
      lowLimit: "9.5",
      highLimit: "10.5",
      pfa: "1.25",
      pfr: "0.50",
      tur: "4.20",
      tar: "5.10",
      gbPfa: "0.90",
      gbPfr: "0.40",
      gbMult: "87.50",
      gbLow: "9.6",
      gbHigh: "10.4",
    });
  });
});
