/**
 * src/hooks/useRiskCalculation.js
 * * This hook manages the Risk Analysis state and logic.
 * It automatically calculates risk metrics (TAR, TUR, PFA, PFR) based on
 * the calculated uncertainty results and the session's risk requirements.
 * * Returns:
 * - riskResults: The calculated metrics object.
 * - riskInputs: State for manual overrides of limits (LLow, LUp).
 * - calculateRiskMetrics: Function to force recalculation.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { 
  unitSystem, 
  calculateUncertaintyFromToleranceObject, 
  calcTAR, 
  calcTUR, 
  PFAMgr,
  PFRMgr,
  resDwn,
  resUp,
  snapLimitsToResolution,
  resolveResolutionNative,
  gbLowMgr,
  gbUpMgr, 
  GBMultMgr, 
  PFAwGBMgr, 
  PFRwGBMgr, 
  CalIntwGBMgr, 
  CalIntMgr, 
  CalRelMgr 
} from "../../../utils/uncertaintyMath";

export const useRiskCalculation = (
  sessionData,
  testPointData,
  uutToleranceData,
  tmdeTolerancesData,
  uutNominal,
  calcResults, // Must come from useUncertaintyCalculation hook
  analysisMode,
  onRiskResultsChange
) => {
  const [riskInputs, setRiskInputs] = useState({
    LLow: "",
    LUp: "",
  });
  const [riskResults, setRiskResults] = useState(null);
  const [notification, setNotification] = useState(null); 
  
  // Ref to store the last calculated metrics to prevent infinite loops
  const prevRiskMetricsRef = useRef(null);

  // --- 1. Auto-Populate Limits from UUT Tolerance ---
  useEffect(() => {
    if (!uutToleranceData || !uutNominal || !uutNominal.value) {
      setRiskInputs((prev) => ({ ...prev, LLow: "", LUp: "" }));
      return;
    }

    const { breakdown } = calculateUncertaintyFromToleranceObject(
      uutToleranceData,
      uutNominal
    );

    const nominalValue = parseFloat(uutNominal.value);

    const specComponents = breakdown.filter(
      (comp) =>
        comp.absoluteHigh !== undefined && comp.absoluteLow !== undefined
    );

    if (specComponents.length === 0) {
      setRiskInputs((prev) => ({ ...prev, LLow: "", LUp: "" }));
      return;
    }

    const totalHighDeviation = specComponents.reduce((sum, comp) => {
      return sum + (comp.absoluteHigh - nominalValue);
    }, 0);

    const totalLowDeviation = specComponents.reduce((sum, comp) => {
      return sum + (comp.absoluteLow - nominalValue);
    }, 0);

    const finalHighLimit = nominalValue + totalHighDeviation;
    const finalLowLimit = nominalValue + totalLowDeviation;

    // Mirror the workbook: snap the acceptance band inward to the UUT's
    // measuring resolution so the limits (and resulting TUR/PFA) match Excel.
    const { low: snappedLow, high: snappedHigh } = snapLimitsToResolution(
      finalLowLimit,
      finalHighLimit,
      resolveResolutionNative(uutToleranceData, uutNominal.unit)
    );

    setRiskInputs((prev) => ({
      ...prev,
      LLow: snappedLow,
      LUp: snappedHigh,
    }));
  }, [uutToleranceData, uutNominal]);

  // --- 2. The Heavy Calculation Logic ---
  const calculateRiskMetrics = useCallback(() => {
    const LLow = parseFloat(riskInputs.LLow);
    const LUp = parseFloat(riskInputs.LUp);

    const pfaRequired = parseFloat(sessionData.uncReq.reqPFA) / 100;
    const reliability = parseFloat(sessionData.uncReq.reliability) / 100;
    const calInt = parseFloat(sessionData.uncReq.calInt);
    const measRelCalc = parseFloat(sessionData.uncReq.measRelCalcAssumed) / 100;
    const turNeeded = parseFloat(sessionData.uncReq.neededTUR);
    const uutName = sessionData.uutDescription || "UUT";

    if (isNaN(LLow) || isNaN(LUp) || LUp === LLow) {
      return;
    }
    if (isNaN(reliability) || reliability <= 0 || reliability >= 1) {
      return;
    }
    if (!calcResults) {
      return;
    }

    const nominalUnit = uutNominal?.unit;
    const targetUnitInfo = unitSystem.units[nominalUnit];
    const uCal_Base = calcResults.combined_uncertainty_absolute_base;
    const uCal_Native = uCal_Base / targetUnitInfo.to_si;
    const U_Base = calcResults.expanded_uncertainty_absolute_base;
    const U_Native = U_Base / targetUnitInfo.to_si;
    const calculatedAverage = parseFloat(calcResults.calculatedNominalValue);
    const riskAverage = Number.isFinite(calculatedAverage) ? calculatedAverage : 0;

    if (!targetUnitInfo || isNaN(targetUnitInfo.to_si)) {
      setNotification({
        title: "Calculation Error",
        message: `Invalid UUT unit (${nominalUnit}) for risk analysis.`,
      });
      return;
    }

    // ... [Logic: UUT Breakdown for TAR] ...
    const uutBreakdownResult = calculateUncertaintyFromToleranceObject(
      uutToleranceData,
      uutNominal
    );
    const uutSpecComponents = uutBreakdownResult.breakdown.filter(
      (comp) =>
        comp.absoluteHigh !== undefined && comp.absoluteLow !== undefined
    );

    const uutBreakdownForTar = uutSpecComponents.map((comp) => {
      const nominalValue = parseFloat(uutNominal.value);
      const highDeviation = comp.absoluteHigh - nominalValue;
      const lowDeviation = comp.absoluteLow - nominalValue;
      const span = highDeviation - lowDeviation;
      return {
        name: `${uutName} - ${comp.name}`,
        span: span,
      };
    });

    // ... [Logic: TMDE Breakdown for TAR] ...
    const tmdeBreakdownForTar = [];
    let missingTmdeRef = false;
    let tmdeToleranceHigh_Native = 0;
    let tmdeToleranceLow_Native = 0;

    if (tmdeTolerancesData.length > 0) {
      const tmdeTotals = tmdeTolerancesData.reduce(
        (acc, tmde) => {
          // Determine the effective reference point: TMDE's own point OR UUT Nominal
          // Must have BOTH value AND unit to be valid
          const hasTmdeMeasurementPoint = tmde.measurementPoint && 
              tmde.measurementPoint.value && 
              tmde.measurementPoint.unit;
          
          const refPoint = hasTmdeMeasurementPoint 
              ? tmde.measurementPoint 
              : uutNominal;

          if (!refPoint || !refPoint.value || !refPoint.unit) {
            missingTmdeRef = true;
            return acc;
          }

          // Handle potential nested tolerance object (same fix as useUncertaintyCalculation)
          const toleranceSource = tmde.tolerance || tmde;

          const { breakdown: tmdeBreakdown } =
            calculateUncertaintyFromToleranceObject(
              toleranceSource,
              refPoint
            );

          const tmdeNominal = parseFloat(refPoint.value);

          const tmdeSpecComponents = tmdeBreakdown.filter(
            (comp) =>
              comp.absoluteHigh !== undefined && comp.absoluteLow !== undefined
          );
          if (tmdeSpecComponents.length === 0) return acc;

          let totalTmdeHighDevInUutNative = 0;
          let totalTmdeLowDevInUutNative = 0;

          // FIX: Use the unit of the effective reference point, not necessarily the TMDE's own unit
          // This ensures that if we fell back to UUT Nominal, we use UUT Nominal's unit.
          const tmdeUnitInfo = unitSystem.units[refPoint.unit];
          if (!tmdeUnitInfo || isNaN(tmdeUnitInfo.to_si)) {
            missingTmdeRef = true;
            return acc;
          }

          tmdeSpecComponents.forEach((comp) => {
            const highDev = comp.absoluteHigh - tmdeNominal;
            const lowDev = comp.absoluteLow - tmdeNominal;
            const compSpan = highDev - lowDev;

            const compSpanInBase = compSpan * tmdeUnitInfo.to_si;
            const compSpanInUutNative = compSpanInBase / targetUnitInfo.to_si;

            if (compSpanInUutNative > 0) {
              tmdeBreakdownForTar.push({
                name: `${tmde.name || "TMDE"} - ${comp.name}`,
                span: compSpanInUutNative,
              });
            }

            const highDevInBase = highDev * tmdeUnitInfo.to_si;
            const highDevInUutNative = highDevInBase / targetUnitInfo.to_si;

            const lowDevInBase = lowDev * tmdeUnitInfo.to_si;
            const lowDevInUutNative = lowDevInBase / targetUnitInfo.to_si;

            totalTmdeHighDevInUutNative += highDevInUutNative;
            totalTmdeLowDevInUutNative += lowDevInUutNative;
          });

          const quantity = parseInt(tmde.quantity, 10) || 1;
          acc.totalHigh += totalTmdeHighDevInUutNative * quantity;
          acc.totalLow += totalTmdeLowDevInUutNative * quantity;

          return acc;
        },
        { totalHigh: 0, totalLow: 0 }
      );

      tmdeToleranceHigh_Native = tmdeTotals.totalHigh;
      tmdeToleranceLow_Native = tmdeTotals.totalLow;
    }

    const tmdeToleranceSpan_Native =
      tmdeToleranceHigh_Native - tmdeToleranceLow_Native;

    if (missingTmdeRef) {
      setNotification({
        title: "Missing Info",
        message: "TMDE missing Reference Point for TAR calculation.",
      });
    }

    // ... [Math Calculations] ...
    let tarResult = calcTAR(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      parseFloat(uutNominal.value) + tmdeToleranceLow_Native,
      parseFloat(uutNominal.value) + tmdeToleranceHigh_Native
    );
    let turResult = calcTUR(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      U_Native
    );
    let [pfaResult, pfa_term1, pfa_term2, uUUT, uDev, cor] = PFAMgr(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      uCal_Native,
      reliability,
      turResult,
      turNeeded
    );
    let [pfrResult, pfr_term1, pfr_term2] = PFRMgr(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      uCal_Native,
      reliability,
      turResult,
      turNeeded
    );

    // Sanitize outputs to prevent UI crashes (empty strings returned on math failure)
    const validateRiskNum = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    };

    pfaResult = validateRiskNum(pfaResult);
    pfa_term1 = validateRiskNum(pfa_term1);
    pfa_term2 = validateRiskNum(pfa_term2);
    uUUT = validateRiskNum(uUUT);
    uDev = validateRiskNum(uDev);
    cor = validateRiskNum(cor);

    pfrResult = validateRiskNum(pfrResult);
    pfr_term1 = validateRiskNum(pfr_term1);
    pfr_term2 = validateRiskNum(pfr_term2);

    // Measurement resolution is stored in its own unit; convert it into the
    // native nominal unit so the guard-band rounding grid (resUp/resDwn) matches
    // the unit the limits live in — mirroring Excel's FC, which is already in the
    // limit's unit. Without this the snap-to-resolution step would round on the
    // wrong grid (or be skipped) and the GB Mult would diverge from Excel.
    const safeRes = resolveResolutionNative(uutToleranceData, nominalUnit);

    let gbLow = resDwn(
      gbLowMgr(
        pfaRequired,
        uutNominal.value,
        riskAverage,
        LLow,
        LUp,
        uCal_Native,
        reliability
      )[0],
      safeRes
    );
    let gbLowMult =
      gbLowMgr(
        pfaRequired,
        uutNominal.value,
        riskAverage,
        LLow,
        LUp,
        uCal_Native,
        reliability
      )[1];
    let gbHigh = resUp(
      gbUpMgr(
        pfaRequired,
        uutNominal.value,
        riskAverage,
        LLow,
        LUp,
        uCal_Native,
        reliability
      )[0],
      safeRes
    );
    let gbHighMult =
      gbUpMgr(
        pfaRequired,
        uutNominal.value,
        riskAverage,
        LLow,
        LUp,
        uCal_Native,
        reliability
      )[1];
    let gbMult = GBMultMgr(
      pfaRequired,
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      gbLow,
      gbHigh
    );
    let [gbPFA, gbPFAT1, gbPFAT2, gbPFAuUUT, gbPFAuDev, gbPFACor] = PFAwGBMgr(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      uCal_Native,
      reliability,
      gbLow,
      gbHigh
    );
    let [gbPFR, gbPFRT1, gbPFRT2] = PFRwGBMgr(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      uCal_Native,
      reliability,
      gbLow,
      gbHigh
    );
    let [gbCalInt,gbCalIntObs,gbCalIntPred] = CalIntwGBMgr(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      uCal_Native,
      reliability,
      measRelCalc,
      gbLow,
      gbHigh,
      turResult,
      turNeeded,
      calInt
    );
    let [nogbCalInt,nogbCalIntObs,nogbCalIntPred] = CalIntMgr(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      uCal_Native,
      reliability,
      measRelCalc,
      turResult,
      turNeeded,
      calInt,
      pfaRequired
    );
    let [nogbMeasRel,nogbMeasRelOBS] = CalRelMgr(
      uutNominal.value,
      riskAverage,
      LLow,
      LUp,
      uCal_Native,
      reliability,
      measRelCalc,
      turResult,
      turNeeded,
      calInt,
      pfaRequired
    );
    let gbInputs = {
      nominal: parseFloat(uutNominal.value),
      uutLower: LLow,
      uutUpper: LUp,
      tmdeLower: parseFloat(uutNominal.value) + tmdeToleranceLow_Native,
      tmdeUpper: parseFloat(uutNominal.value) + tmdeToleranceHigh_Native,
      combUnc: uCal_Native,
      turVal: turResult,
      measRelTarget: reliability,
      calibrationInt: calInt,
      measrelCalcAssumed: measRelCalc,
      reqTUR: turNeeded,
      reqPFA: pfaRequired,
      nominalUnit: nominalUnit,
      safeRes: safeRes
    };
    let gbResults = {
      GBLOW: gbLow,
      GBLOWMULT: gbLowMult,
      GBUP: gbHigh,
      GBUPMULT: gbHighMult,
      GBMULT: gbMult * 100,
      GBPFA: gbPFA * 100,
      GBPFAT1: gbPFAT1 * 100,
      GBPFAT2: gbPFAT2 * 100,
      GBPFAUUUT: gbPFAuUUT, 
      GBPFAUDEV: gbPFAuDev, 
      GBPFACOR: gbPFACor,
      GBPFR: gbPFR * 100,
      GBPFRT1: gbPFRT1 * 100,
      GBPFRT2: gbPFRT2 * 100,
      GBCALINT: gbCalInt,
      GBCALINTOBS: gbCalIntObs,
      GBCALINTPRED: gbCalIntPred,
      NOGBCALINT: nogbCalInt,
      NOGBCALINTOBS: nogbCalIntObs,
      NOGBCALINTPRED: nogbCalIntPred,
      NOGBMEASREL: nogbMeasRel * 100,
      NOGBMEASRELOBS: nogbMeasRelOBS * 100,
    };

    const newRiskMetrics = {
      LLow: LLow,
      LUp: LUp,
      tur: turResult,
      tar: tarResult,
      pfa: pfaResult * 100,
      pfr: pfrResult * 100,
      pfa_term1: (isNaN(pfa_term1) ? 0 : pfa_term1) * 100,
      pfa_term2: (isNaN(pfa_term2) ? 0 : pfa_term2) * 100,
      pfr_term1: (isNaN(pfr_term1) ? 0 : pfr_term1) * 100,
      pfr_term2: (isNaN(pfr_term2) ? 0 : pfr_term2) * 100,
      uCal: uCal_Native,
      uUUT: uUUT,
      uDev: uDev,
      correlation: cor,
      ALow: LLow,
      AUp: LUp,
      expandedUncertainty: U_Native,
      tmdeToleranceSpan: tmdeToleranceSpan_Native,
      tmdeToleranceHigh: tmdeToleranceHigh_Native,
      tmdeToleranceLow: tmdeToleranceLow_Native,
      // Nominal anchor for the TMDE span (matches the value used by calcTAR
      // above). The displayed TMDE absolute limits must be centered on this,
      // NOT on the UUT acceptance-band midpoint, which can be off-nominal when
      // the UUT tolerance is asymmetric or snapped to resolution.
      nominalValue: parseFloat(uutNominal.value),
      uutBreakdownForTar: uutBreakdownForTar,
      tmdeBreakdownForTar: tmdeBreakdownForTar,
      nativeUnit: nominalUnit,
      gbInputs: gbInputs,
      gbResults: gbResults,
      // FIXED: Added safe navigation to prevent crash on deletion
      uutResolution: testPointData?.uutTolerance?.measuringResolution?.length || 0
    };

    // --- INFINITE LOOP FIX ---
    // Compare new results with previous results. Only update state/parent if different.
    const prevJSON = JSON.stringify(prevRiskMetricsRef.current);
    const newJSON = JSON.stringify(newRiskMetrics);

    if (prevJSON !== newJSON) {
        prevRiskMetricsRef.current = newRiskMetrics;
        setRiskResults(newRiskMetrics);
        onRiskResultsChange?.(newRiskMetrics);
    }
    
  }, [
    riskInputs.LLow,
    riskInputs.LUp,
    sessionData.uncReq.reqPFA,
    sessionData.uncReq.reliability,
    sessionData.uncReq.calInt,
    sessionData.uncReq.measRelCalcAssumed,
    sessionData.uncReq.neededTUR,
    sessionData.uutDescription,
    uutNominal,
    calcResults,
    uutToleranceData,
    tmdeTolerancesData,
    testPointData?.uutTolerance?.measuringResolution, // FIXED Dependency
    onRiskResultsChange,
  ]);

  // --- 3. Trigger Calculation ---
  useEffect(() => {
    const shouldCalculate =
      analysisMode === "risk" ||
      analysisMode === "uncertaintyTool" ||
      analysisMode === "riskmitigation";

    if (shouldCalculate && calcResults) {
      calculateRiskMetrics();
    }

    if (!shouldCalculate) {
      setRiskResults((prevResults) => {
        if (prevResults !== null) {
          onRiskResultsChange?.(null);
          return null;
        }
        return prevResults;
      });
    }
  }, [
    analysisMode,
    calcResults,
    sessionData.uncReq.reliability,
    sessionData.uncReq.guardBandMultiplier,
    sessionData.uncReq.reqPFA,
    sessionData.uncReq.neededTUR,
    sessionData.uncReq.calInt,
    sessionData.uncReq.measRelCalcAssumed,
    riskInputs.LLow,
    riskInputs.LUp,
    calculateRiskMetrics,
    onRiskResultsChange,
  ]);

  return { 
    riskResults, 
    setRiskResults, 
    riskInputs, 
    setRiskInputs, 
    calculateRiskMetrics,
    notification 
  };
};
