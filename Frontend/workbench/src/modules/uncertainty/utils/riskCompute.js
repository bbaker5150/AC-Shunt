// src/modules/uncertainty/utils/riskCompute.js
//
// Pure, side-effect-free risk computation used to keep the sidebar's per-point
// PFA / PFR / TUR / TAR columns always in sync with the latest inputs.
//
// Why this exists (#1): risk metrics used to be calculated only for the
// *selected* point (inside the stateful useUncertaintyCalculation +
// useRiskCalculation hooks). Every other row in the sidebar fell back to a
// stale `point.riskMetrics` snapshot loaded from the backend, so editing the
// uncertainty requirements, a tolerance/distribution, or a point value did not
// refresh the other rows until you clicked each one.
//
// This module mirrors the math of those two hooks but as plain functions, so
// App.jsx can memoize a {pointId -> metrics} map over all test points. It does
// NOT persist anything and makes no network calls — it is purely derived state
// recomputed in memory, so there are no extra database hits.

import {
  unitSystem,
  getKValueFromTDistribution,
  calculateDerivedUncertainty,
  calculateUncertaintyFromToleranceObject,
  combineWithCorrelation,
  normalQuantile,
  snapLimitsToResolution,
  resolveResolutionNative,
  calcTAR,
  calcTUR,
  PFAMgr,
  PFRMgr,
} from "./uncertaintyMath";
import {
  getBudgetComponentsFromTolerance,
  getUutResolutionComponent,
} from "../features/analysis/utils/budgetUtils";

const isFilledNumber = (v) =>
  v !== "" && v !== null && v !== undefined && !isNaN(parseFloat(v));

// --- Pure uncertainty (mirrors useUncertaintyCalculation, display fields only) ---
// Returns { combined_uncertainty_absolute_base, expanded_uncertainty_absolute_base }
// or null when the point isn't ready to evaluate.
function computeUncertaintyForPoint(point, sessionData) {
  const uutNominal = point.testPointInfo?.parameter;
  if (!uutNominal || !isFilledNumber(uutNominal.value) || !uutNominal.unit) {
    return null;
  }

  const tmdeTolerancesData = point.tmdeTolerances || [];
  const manualComponents = point.components || [];
  const derivedNominalValue = parseFloat(uutNominal.value);
  const derivedNominalUnit = uutNominal.unit;
  const targetUnitInfo = unitSystem.units[derivedNominalUnit];
  if (!targetUnitInfo || isNaN(targetUnitInfo.to_si)) return null;

  let combinedUncertaintyPPM = NaN;
  let combinedUncertaintyAbsoluteBase = NaN;
  let effectiveDof = Infinity;
  const componentsForBudgetTable = [];

  try {
    if (point.measurementType === "derived") {
      const hasVariables =
        point.variableMappings &&
        Object.keys(point.variableMappings).length > 0;
      if (
        hasVariables &&
        tmdeTolerancesData.length === 0 &&
        manualComponents.length === 0
      ) {
        return null;
      }

      const activeMappedVars = Object.values(point.variableMappings || {}).filter(
        (v) => v,
      );
      const mappedTmdes = tmdeTolerancesData.filter(
        (t) => t.variableType && activeMappedVars.includes(t.variableType),
      );
      const hasInvalidValues = mappedTmdes.some(
        (t) => !isFilledNumber(t.measurementPoint?.value),
      );
      if (hasInvalidValues) return null;

      const derivedCalculationResult = calculateDerivedUncertainty(
        point.equationString,
        point.variableMappings,
        tmdeTolerancesData,
        uutNominal,
        manualComponents,
      );
      if (
        derivedCalculationResult.missingInputs ||
        derivedCalculationResult.error
      ) {
        return null;
      }

      const { combinedUncertaintyNative, breakdown: derivedBreakdown } =
        derivedCalculationResult;
      if (isNaN(combinedUncertaintyNative)) return null;

      // Unified SIGNED contributions in base SI (equation inputs + non-mapped
      // manual components), combined with the optional correlation matrix. Must
      // stay identical to useUncertaintyCalculation so sidebar metrics match the
      // open point.
      const inputCorrelations = point.inputCorrelations || {};
      const signedContribsBase = [];
      derivedBreakdown.forEach((item) => {
        signedContribsBase.push({
          id: item.componentId,
          contribution: item.contribution_base_signed,
        });
      });
      (manualComponents || []).forEach((comp) => {
        const varType = comp.variableType || comp.name;
        const isMappedVariable = Object.values(
          point.variableMappings || {},
        ).includes(varType);
        if (!isMappedVariable) {
          const absUncBase =
            (comp.value / 1e6) * Math.abs(derivedNominalValue) * targetUnitInfo.to_si;
          if (!isNaN(absUncBase)) {
            signedContribsBase.push({ id: varType, contribution: absUncBase });
          }
        }
      });

      const uutResComp = getUutResolutionComponent(
        point.uutTolerance || sessionData.uutTolerance,
        uutNominal,
      );
      if (uutResComp) {
        const absUncBase =
          (uutResComp.value / 1e6) * Math.abs(derivedNominalValue) * targetUnitInfo.to_si;
        if (!isNaN(absUncBase)) {
          signedContribsBase.push({
            id: uutResComp.componentId,
            contribution: absUncBase,
          });
        }
      }

      combinedUncertaintyAbsoluteBase = combineWithCorrelation(
        signedContribsBase,
        inputCorrelations,
      );
      effectiveDof = Infinity;
    } else {
      // Direct measurement.
      let totalVariancePPM = 0;
      tmdeTolerancesData.forEach((tmde) => {
        const quantity = tmde.quantity || 1;
        const toleranceSource = tmde.tolerance || tmde;
        const components = getBudgetComponentsFromTolerance(
          toleranceSource,
          uutNominal,
        );
        components.forEach((comp) => {
          totalVariancePPM += comp.value ** 2 * quantity;
          componentsForBudgetTable.push({ ...comp, quantity });
        });
      });
      manualComponents.forEach((comp) => {
        totalVariancePPM += comp.value ** 2;
        componentsForBudgetTable.push(comp);
      });

      const uutResComp = getUutResolutionComponent(
        point.uutTolerance || sessionData.uutTolerance,
        uutNominal,
      );
      if (uutResComp) {
        totalVariancePPM += uutResComp.value ** 2;
        componentsForBudgetTable.push({ ...uutResComp, quantity: 1 });
      }

      if (componentsForBudgetTable.length === 0) return null;

      combinedUncertaintyPPM = Math.sqrt(totalVariancePPM);

      const numerator = Math.pow(combinedUncertaintyPPM, 4);
      const denominator = componentsForBudgetTable.reduce((sum, comp) => {
        const dof =
          comp.dof === Infinity ||
          comp.dof == null ||
          isNaN(parseFloat(comp.dof))
            ? Infinity
            : parseFloat(comp.dof);
        return dof === Infinity || dof <= 0 || isNaN(comp.value) || comp.value === 0
          ? sum
          : sum + Math.pow(comp.value, 4) / dof;
      }, 0);
      effectiveDof = denominator > 0 ? numerator / denominator : Infinity;

      if (
        !isNaN(combinedUncertaintyPPM) &&
        derivedNominalValue !== 0
      ) {
        const derivedNominalInBase = unitSystem.toBaseUnit(
          derivedNominalValue,
          derivedNominalUnit,
        );
        if (!isNaN(derivedNominalInBase) && derivedNominalInBase !== 0) {
          combinedUncertaintyAbsoluteBase =
            (combinedUncertaintyPPM / 1e6) * Math.abs(derivedNominalInBase);
        }
      }
    }

    if (isNaN(combinedUncertaintyAbsoluteBase)) return null;

    const confidencePercent =
      parseFloat(sessionData.uncReq?.uncertaintyConfidence) || 95;
    const probability = 1 - (1 - confidencePercent / 100) / 2;
    const manualCoverageFactor =
      point.coverageFactorMode === "manual"
        ? parseFloat(point.coverageFactorOverride)
        : null;
    const kValue =
      Number.isFinite(manualCoverageFactor) && manualCoverageFactor > 0
        ? manualCoverageFactor
        : effectiveDof === Infinity || isNaN(effectiveDof)
        ? normalQuantile(probability)
        : getKValueFromTDistribution(effectiveDof);

    return {
      combined_uncertainty_absolute_base: combinedUncertaintyAbsoluteBase,
      expanded_uncertainty_absolute_base: kValue * combinedUncertaintyAbsoluteBase,
      k_value: kValue,
    };
  } catch {
    return null;
  }
}

// --- Pure risk (mirrors useRiskCalculation limit derivation + core metrics) ---
// Returns { pfa, pfr, tur, tar } (pfa/pfr as percentages) or null.
export function computePointRiskMetrics(point, sessionData) {
  if (!point || !sessionData) return null;
  const uutNominal = point.testPointInfo?.parameter;
  if (!uutNominal || !isFilledNumber(uutNominal.value) || !uutNominal.unit) {
    return null;
  }

  const calcResults = computeUncertaintyForPoint(point, sessionData);
  if (!calcResults) return null;

  const uutToleranceData = point.uutTolerance || sessionData.uutTolerance || {};
  const nominalValue = parseFloat(uutNominal.value);

  // Derive acceptance limits from the UUT tolerance + nominal.
  let LLow;
  let LUp;
  try {
    const { breakdown } = calculateUncertaintyFromToleranceObject(
      uutToleranceData,
      uutNominal,
    );
    const specComponents = (breakdown || []).filter(
      (comp) =>
        comp.absoluteHigh !== undefined && comp.absoluteLow !== undefined,
    );
    if (specComponents.length === 0) return null;
    const totalHighDeviation = specComponents.reduce(
      (sum, comp) => sum + (comp.absoluteHigh - nominalValue),
      0,
    );
    const totalLowDeviation = specComponents.reduce(
      (sum, comp) => sum + (comp.absoluteLow - nominalValue),
      0,
    );
    LUp = nominalValue + totalHighDeviation;
    LLow = nominalValue + totalLowDeviation;
    // Mirror the workbook: snap the acceptance band inward to the UUT's
    // measuring resolution before computing risk.
    ({ low: LLow, high: LUp } = snapLimitsToResolution(
      LLow,
      LUp,
      resolveResolutionNative(uutToleranceData, uutNominal.unit),
    ));
  } catch {
    return null;
  }

  if (isNaN(LLow) || isNaN(LUp) || LUp === LLow) return null;

  const reliability = parseFloat(sessionData.uncReq?.reliability) / 100;
  const turNeeded = parseFloat(sessionData.uncReq?.neededTUR);
  if (isNaN(reliability) || reliability <= 0 || reliability >= 1) return null;

  const nominalUnit = uutNominal.unit;
  const targetUnitInfo = unitSystem.units[nominalUnit];
  if (!targetUnitInfo || isNaN(targetUnitInfo.to_si)) return null;

  const uCal_Native =
    calcResults.combined_uncertainty_absolute_base / targetUnitInfo.to_si;
  const U_Native =
    calcResults.expanded_uncertainty_absolute_base / targetUnitInfo.to_si;

  // TMDE tolerance span (for TAR), mirroring useRiskCalculation.
  let tmdeToleranceHigh_Native = 0;
  let tmdeToleranceLow_Native = 0;
  const tmdeTolerancesData = point.tmdeTolerances || [];
  if (tmdeTolerancesData.length > 0) {
    const totals = tmdeTolerancesData.reduce(
      (acc, tmde) => {
        const hasTmdeMeasurementPoint =
          tmde.measurementPoint &&
          tmde.measurementPoint.value &&
          tmde.measurementPoint.unit;
        const refPoint = hasTmdeMeasurementPoint
          ? tmde.measurementPoint
          : uutNominal;
        if (!refPoint || !refPoint.value || !refPoint.unit) return acc;

        const toleranceSource = tmde.tolerance || tmde;
        let breakdown;
        try {
          breakdown = calculateUncertaintyFromToleranceObject(
            toleranceSource,
            refPoint,
          ).breakdown;
        } catch {
          return acc;
        }
        const tmdeNominal = parseFloat(refPoint.value);
        const tmdeSpecComponents = (breakdown || []).filter(
          (comp) =>
            comp.absoluteHigh !== undefined && comp.absoluteLow !== undefined,
        );
        if (tmdeSpecComponents.length === 0) return acc;

        const tmdeUnitInfo = unitSystem.units[refPoint.unit];
        if (!tmdeUnitInfo || isNaN(tmdeUnitInfo.to_si)) return acc;

        let totalHighDev = 0;
        let totalLowDev = 0;
        tmdeSpecComponents.forEach((comp) => {
          const highDev = comp.absoluteHigh - tmdeNominal;
          const lowDev = comp.absoluteLow - tmdeNominal;
          totalHighDev +=
            (highDev * tmdeUnitInfo.to_si) / targetUnitInfo.to_si;
          totalLowDev += (lowDev * tmdeUnitInfo.to_si) / targetUnitInfo.to_si;
        });
        const quantity = parseInt(tmde.quantity, 10) || 1;
        acc.totalHigh += totalHighDev * quantity;
        acc.totalLow += totalLowDev * quantity;
        return acc;
      },
      { totalHigh: 0, totalLow: 0 },
    );
    tmdeToleranceHigh_Native = totals.totalHigh;
    tmdeToleranceLow_Native = totals.totalLow;
  }

  const tarResult = calcTAR(
    uutNominal.value,
    0,
    LLow,
    LUp,
    nominalValue + tmdeToleranceLow_Native,
    nominalValue + tmdeToleranceHigh_Native,
  );
  const turResult = calcTUR(uutNominal.value, 0, LLow, LUp, U_Native);
  const pfaArr = PFAMgr(
    uutNominal.value,
    0,
    LLow,
    LUp,
    uCal_Native,
    reliability,
    turResult,
    turNeeded,
  );
  const pfrArr = PFRMgr(
    uutNominal.value,
    0,
    LLow,
    LUp,
    uCal_Native,
    reliability,
    turResult,
    turNeeded,
  );

  const toNum = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  };

  const pfa = toNum(pfaArr?.[0]);
  const pfr = toNum(pfrArr?.[0]);
  const tur = toNum(turResult);
  const tar = toNum(tarResult);

  return {
    pfa: pfa !== undefined ? pfa * 100 : undefined,
    pfr: pfr !== undefined ? pfr * 100 : undefined,
    tur,
    tar,
  };
}

// Build a { pointId -> metrics } map for a list of points. Used by App.jsx with
// useMemo so the whole sidebar reflects the latest inputs in one pass.
export function computeRiskMetricsMap(points, sessionData) {
  const map = {};
  (points || []).forEach((p) => {
    map[p.id] = computePointRiskMetrics(p, sessionData);
  });
  return map;
}
