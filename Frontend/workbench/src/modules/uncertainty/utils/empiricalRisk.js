// Layer 3: empirical (GUM-S1) decision risk for Monte Carlo-mode points.
//
// The closed-form risk chain (PFA_Core / PFR_Core in uncertaintyMath.js)
// models BOTH the UUT's true bias and the measurement error as normal, then
// integrates a bivariate normal over the accept/reject × in/out-of-tolerance
// quadrants. At a stationary point the measurement-error distribution is NOT
// normal (it can be one-sided), so this module replaces only that half of the
// integral: the UUT bias prior stays normal (deconvolved from the EOPR
// reliability exactly as the closed form does, via uutUnc), while measurement
// errors are resampled from the empirical output distribution the MC engine
// produced (a compact quantile table persisted on the point as mcSummary).
//
// The normalization mirrors the VBA chain step for step (getTolInfo →
// calRelwTUR → vbaUutUnc symmetrization) so that, when the error distribution
// actually IS normal, the quadrant counts converge to PFAMgr/PFRMgr — that
// equivalence is pinned by tests.
//
// Everything is seeded and deterministic. Stage-B draws are cheap (no
// equation evaluations — just a table lookup and an add per trial), which is
// what lets limit/reliability edits recompute risk instantly without
// re-simulating.

import { uutUnc, vbNormSDist } from "./uncertaintyMath";
import {
  createSeededRandom,
  makeGaussian,
  computeMcInputsHash,
} from "./monteCarlo";

export const EMPIRICAL_RISK_DRAWS = 400000;
const RISK_SEED = 0x715c;

// ==========================================
// mcSummary freshness
// ==========================================

/**
 * Return the point's persisted Monte Carlo summary when it is usable for
 * risk: MC mode is on, a quantile table exists, and the stored hash matches
 * the point's CURRENT inputs (reconciled TMDE list required, same as the
 * hook). Returns null otherwise — callers then fall back to the closed-form
 * path and may flag the row as stale.
 */
export function getFreshMcSummary(point, reconciledTmdeTolerances) {
  if (!point || point.propagationMode !== "montecarlo") return null;
  const summary = point.mcSummary;
  if (
    !summary ||
    !Array.isArray(summary.quantiles) ||
    summary.quantiles.length < 2 ||
    !Number.isFinite(summary.uBase) ||
    !Number.isFinite(summary.meanBase)
  ) {
    return null;
  }
  const hash = computeMcInputsHash({
    equationString: point.equationString,
    variableMappings: point.variableMappings,
    correlations: point.inputCorrelations,
    tmdeTolerances: reconciledTmdeTolerances,
    manualComponents: point.components,
    maxSamples: point.mcMaxSamples,
  });
  return hash && summary.hash === hash ? summary : null;
}

// ==========================================
// Quantile-table sampling
// ==========================================

// Inverse-CDF draw from an evenly spaced quantile table (p_k = k/(m-1)),
// linear interpolation between grid points.
export function drawFromQuantiles(quantiles, p) {
  const m = quantiles.length;
  const pos = p * (m - 1);
  const k = Math.floor(pos);
  if (k >= m - 1) return quantiles[m - 1];
  const frac = pos - k;
  return quantiles[k] + frac * (quantiles[k + 1] - quantiles[k]);
}

// ==========================================
// VBA-chain normalization (two-sided case)
// ==========================================

// Mirror of getTolInfo's "NotThreshold" branch + vbaUutUnc's symmetrization:
// re-center on the band midpoint (or the average, when it lies inside the
// band), then collapse to a symmetric ±L truth frame. Returns null when the
// limits don't form a valid two-sided band (threshold cases stay closed-form).
// Exported so the risk visualizer can draw its Monte Carlo cloud in the SAME
// truth frame the quadrant counting uses — otherwise the plotted FA/FR
// fractions drift from the reported empirical PFA/PFR.
export function normalizeTwoSided(average, LLow, LUp) {
  if (!Number.isFinite(LLow) || !Number.isFinite(LUp) || LLow >= LUp) {
    return null;
  }
  let dNominal = (LLow + LUp) / 2;
  if (Number.isFinite(average) && average !== dNominal) {
    if (average > LLow && average < LUp) dNominal = average;
  }
  const tolLow = LLow - dNominal;
  const tolUp = LUp - dNominal;
  // vbaUutUnc recenters the (possibly asymmetric) band onto its own midpoint.
  const tolMid = (tolLow + tolUp) / 2;
  const L = (tolUp - tolLow) / 2;
  // Absolute center of the symmetric truth frame.
  const center = dNominal + tolMid;
  return { dNominal, center, L, tolLow, tolUp };
}

// Mirror of calRelwTUR's "NotThreshold" branch: when a required TUR is
// configured, the assumed EOPR reliability is re-derived for the actual TUR.
function adjustReliabilityForTur(reliability, uCal, tolLow, tolUp, tur, reqTur) {
  const dReqTur = parseFloat(reqTur);
  const dTur = parseFloat(tur);
  if (!Number.isFinite(dReqTur) || dReqTur <= 0 || !Number.isFinite(dTur)) {
    return reliability;
  }
  const dCalUnc = (uCal * dTur) / dReqTur;
  const biasUnc = uutUnc(reliability, dCalUnc, tolLow, tolUp);
  const L = (tolUp - tolLow) / 2;
  const devUnc = Math.sqrt(uCal * uCal + biasUnc * biasUnc);
  if (!(devUnc > 0)) return reliability;
  return vbNormSDist(L / devUnc) - vbNormSDist(-L / devUnc);
}

// ==========================================
// Empirical PFA / PFR (quadrant counting)
// ==========================================

/**
 * Quadrant-count false-accept / false-reject probabilities.
 *
 * @param {Object} o
 * @param {number} o.average        risk average (calculated nominal), native
 * @param {number} o.LLow,o.LUp     tolerance limits (absolute, native)
 * @param {number} [o.accLow,o.accUp] acceptance limits (guard band); default
 *                                  = tolerance limits
 * @param {number} o.uCal           MC combined standard uncertainty (native)
 * @param {Array}  o.errorQuantiles CENTERED measurement-error quantile table
 *                                  (native units, zero mean)
 * @param {number} o.reliability    EOPR as 0..1
 * @param {*}      [o.tur,o.reqTur] for the calRelwTUR reliability adjustment
 * @param {number} [o.draws,o.seed]
 * @returns {{pfa,pfr,pfaLow,pfaHigh,pfrLow,pfrHigh,uUUT,uDev,correlation}|null}
 *          null when the configuration is degenerate (no UUT bias spread) or
 *          not a two-sided band — callers fall back to the closed form.
 */
export function computeEmpiricalRisk({
  average,
  LLow,
  LUp,
  accLow = null,
  accUp = null,
  uCal,
  errorQuantiles,
  reliability,
  tur = null,
  reqTur = null,
  draws = EMPIRICAL_RISK_DRAWS,
  seed = RISK_SEED,
}) {
  if (!Array.isArray(errorQuantiles) || errorQuantiles.length < 2) return null;
  if (!Number.isFinite(uCal) || uCal < 0) return null;
  if (!(reliability > 0 && reliability < 1)) return null;

  const frame = normalizeTwoSided(average, LLow, LUp);
  if (!frame) return null;

  const rel = adjustReliabilityForTur(
    reliability,
    uCal,
    frame.tolLow,
    frame.tolUp,
    tur,
    reqTur
  );
  if (!(rel > 0 && rel < 1)) return null;

  const uUUT = uutUnc(rel, uCal, -frame.L, frame.L);
  if (!(uUUT > 0)) return null; // mirrors PFAMgr's dUUTUnc <= 0 bail-out

  // Acceptance band in the truth frame.
  const aLow = (Number.isFinite(accLow) ? accLow : LLow) - frame.center;
  const aUp = (Number.isFinite(accUp) ? accUp : LUp) - frame.center;
  if (!(aLow < aUp)) return null;

  const rng = createSeededRandom(seed);
  const gauss = makeGaussian(rng);
  const L = frame.L;
  let pfaLow = 0;
  let pfaHigh = 0;
  let pfrLow = 0;
  let pfrHigh = 0;
  for (let i = 0; i < draws; i++) {
    const t = uUUT * gauss(); // true UUT deviation
    const e = drawFromQuantiles(errorQuantiles, rng()); // measurement error
    const obs = t + e;
    const accepted = obs >= aLow && obs <= aUp;
    if (t < -L) {
      if (accepted) pfaLow++;
    } else if (t > L) {
      if (accepted) pfaHigh++;
    } else if (!accepted) {
      if (obs < aLow) pfrLow++;
      else pfrHigh++;
    }
  }

  const uDev = Math.sqrt(uUUT * uUUT + uCal * uCal);
  return {
    pfa: (pfaLow + pfaHigh) / draws,
    pfaLow: pfaLow / draws,
    pfaHigh: pfaHigh / draws,
    pfr: (pfrLow + pfrHigh) / draws,
    pfrLow: pfrLow / draws,
    pfrHigh: pfrHigh / draws,
    uUUT,
    uDev,
    correlation: uDev > 0 ? uUUT / uDev : 0,
  };
}

// ==========================================
// Empirical guard band (asymmetric)
// ==========================================

/**
 * Find acceptance limits meeting the required PFA by guarding each tolerance
 * limit proportionally to the measurement-error mass that can push an
 * out-of-tolerance unit PAST it:
 *
 *   gbLow(t) = LLow + t·W⁺   (positive errors carry low-side units upward
 *                             into acceptance)
 *   gbUp(t)  = LUp  − t·W⁻   (negative errors carry high-side units downward)
 *
 * with W⁺/W⁻ the 97.5%/2.5% magnitudes of the centered error distribution.
 * For a symmetric distribution this reduces to the familiar symmetric
 * guard-band multiplier; for a one-sided distribution (stationary point) the
 * guarding lands almost entirely on one limit. Solved by bisection on t with
 * common random numbers (fixed seed), so PFA(t) is monotone and the result
 * deterministic.
 *
 * @returns {{ gbLow, gbUp, mult, met }|null} absolute limits (unsnapped),
 *          the multiplier t, and whether the required PFA was achieved.
 */
export function findEmpiricalGuardBand({
  pfaRequired,
  average,
  LLow,
  LUp,
  uCal,
  errorQuantiles,
  reliability,
  tur = null,
  reqTur = null,
  draws = 150000,
  seed = RISK_SEED,
}) {
  if (!(pfaRequired > 0)) return null;
  if (!Array.isArray(errorQuantiles) || errorQuantiles.length < 2) return null;

  const wPlus = Math.max(0, drawFromQuantiles(errorQuantiles, 0.975));
  const wMinus = Math.max(0, -drawFromQuantiles(errorQuantiles, 0.025));
  if (wPlus === 0 && wMinus === 0) {
    return { gbLow: LLow, gbUp: LUp, mult: 0, met: true };
  }

  const pfaAt = (t) => {
    const result = computeEmpiricalRisk({
      average,
      LLow,
      LUp,
      accLow: LLow + t * wPlus,
      accUp: LUp - t * wMinus,
      uCal,
      errorQuantiles,
      reliability,
      tur,
      reqTur,
      draws,
      seed, // common random numbers across t
    });
    return result ? result.pfa : null;
  };

  const pfa0 = pfaAt(0);
  if (pfa0 === null) return null;
  if (pfa0 <= pfaRequired) {
    return { gbLow: LLow, gbUp: LUp, mult: 0, met: true };
  }

  // Largest t that keeps a non-collapsed acceptance band.
  const span = LUp - LLow;
  const shrinkPerT = wPlus + wMinus;
  const tMax = Math.min(6, shrinkPerT > 0 ? (0.98 * span) / shrinkPerT : 6);
  const pfaMax = pfaAt(tMax);
  if (pfaMax === null) return null;
  if (pfaMax > pfaRequired) {
    // Even a near-closed band can't reach the requirement (mirrors the
    // closed-form managers' failed-solve case).
    return {
      gbLow: LLow + tMax * wPlus,
      gbUp: LUp - tMax * wMinus,
      mult: tMax,
      met: false,
    };
  }

  let lo = 0;
  let hi = tMax;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    const p = pfaAt(mid);
    if (p === null) return null;
    if (p > pfaRequired) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-4) break;
  }

  return {
    gbLow: LLow + hi * wPlus,
    gbUp: LUp - hi * wMinus,
    mult: hi,
    met: true,
  };
}
