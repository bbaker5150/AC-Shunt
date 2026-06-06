import { describe, expect, test } from "vitest";
import {
  calcTUR,
  PFAMgr,
  PFRMgr,
  gbLowMgr,
  gbUpMgr,
  resDwn,
  resUp,
  GBMultMgr,
  PFAwGBMgr,
  PFRwGBMgr,
} from "./uncertaintyMath";

const rows = [
  {
    nominal: 0.050019,
    average: 0.050018532,
    low: 0.049770000000000009,
    high: 0.050260000000000006,
    uCal: 4.1020416382982683e-5,
    expanded: 8.0398538741482833e-5,
    resolution: 1e-5,
    expected: {
      pfa: 0.021358380657363896,
      pfr: 0.033220793149168676,
      gbLow: 0.049780000000000005,
      gbHigh: 0.050260000000000006,
      gbMult: 1,
      gbPfa: 0.01754690860955984,
      gbPfr: 0.037968603196303928,
    },
  },
  {
    nominal: 0.037514,
    average: 0.037513898999999996,
    low: 0.037270000000000005,
    high: 0.03776,
    uCal: 4.7360706371663446e-5,
    expanded: 9.2825278770836987e-5,
    resolution: 1e-5,
    expected: {
      pfa: 0.023843838926837127,
      pfr: 0.039585344680611242,
      gbLow: 0.037280000000000008,
      gbHigh: 0.037750000000000006,
      gbMult: 0.95936627644749151,
      gbPfa: 0.016315287062112077,
      gbPfr: 0.04948002901022841,
    },
  },
  {
    nominal: 0.025009266,
    average: 0.025009266,
    low: 0.02476,
    high: 0.02525,
    uCal: 2.588136245468495e-5,
    expanded: 5.0726538282009659e-5,
    resolution: 1e-5,
    expected: {
      pfa: 0.014622576954945787,
      pfr: 0.019382797220307862,
      gbLow: 0.02477,
      gbHigh: 0.02525,
      gbMult: 1,
      gbPfa: 0.011478996324238905,
      gbPfr: 0.024479059596255376,
    },
  },
  {
    nominal: 0.012505,
    average: 0.012504633,
    low: 0.01226,
    high: 0.012750000000000001,
    uCal: 2.3046935391466275e-5,
    expanded: 4.5171163321295424e-5,
    resolution: 1e-5,
    expected: {
      pfa: 0.013223974450893988,
      pfr: 0.0170027240574111,
      gbLow: 0.01226,
      gbHigh: 0.012740000000000001,
      gbMult: 0.95924472321053955,
      gbPfa: 0.009848296263423581,
      gbPfr: 0.02197658279372311,
    },
  },
];

describe("BRG-3100 workbook risk parity", () => {
  for (const row of rows) {
    test(`${row.nominal} matches VBA`, () => {
      const tur = calcTUR(
        row.nominal,
        row.average,
        row.low,
        row.high,
        row.expanded,
      );
      const pfa = PFAMgr(
        row.nominal,
        row.average,
        row.low,
        row.high,
        row.uCal,
        0.85,
        tur,
        4,
      )[0];
      const pfr = PFRMgr(
        row.nominal,
        row.average,
        row.low,
        row.high,
        row.uCal,
        0.85,
        tur,
        4,
      )[0];
      const gbLow = resDwn(
        gbLowMgr(
          0.02,
          row.nominal,
          row.average,
          row.low,
          row.high,
          row.uCal,
          0.85,
        )[0],
        row.resolution,
      );
      const gbHigh = resUp(
        gbUpMgr(
          0.02,
          row.nominal,
          row.average,
          row.low,
          row.high,
          row.uCal,
          0.85,
        )[0],
        row.resolution,
      );
      const gbMult = GBMultMgr(
        0.02,
        row.nominal,
        row.average,
        row.low,
        row.high,
        gbLow,
        gbHigh,
      );
      const gbPfa = PFAwGBMgr(
        row.nominal,
        row.average,
        row.low,
        row.high,
        row.uCal,
        0.85,
        gbLow,
        gbHigh,
      )[0];
      const gbPfr = PFRwGBMgr(
        row.nominal,
        row.average,
        row.low,
        row.high,
        row.uCal,
        0.85,
        gbLow,
        gbHigh,
      )[0];

      // Distribution implementations differ slightly, but must remain within
      // 0.005 percentage points of the workbook probabilities.
      expect(pfa).toBeCloseTo(row.expected.pfa, 4);
      expect(pfr).toBeCloseTo(row.expected.pfr, 4);
      expect(gbLow).toBeCloseTo(row.expected.gbLow, 12);
      expect(gbHigh).toBeCloseTo(row.expected.gbHigh, 12);
      expect(gbMult).toBeCloseTo(row.expected.gbMult, 10);
      expect(gbPfa).toBeCloseTo(row.expected.gbPfa, 4);
      expect(gbPfr).toBeCloseTo(row.expected.gbPfr, 4);
    });
  }
});
