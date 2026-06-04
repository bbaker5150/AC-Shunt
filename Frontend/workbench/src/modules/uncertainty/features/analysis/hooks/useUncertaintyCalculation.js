import { useState, useEffect } from "react";
import {
  unitSystem,
  getKValueFromTDistribution,
  calculateDerivedUncertainty,
  combineWithCorrelation,
  normalQuantile
} from "../../../utils/uncertaintyMath";
import { getBudgetComponentsFromTolerance } from "../utils/budgetUtils";

export const useUncertaintyCalculation = (
  testPointData,
  sessionData,
  tmdeTolerancesData,
  uutToleranceData,
  uutNominal,
  manualComponents,
  onDataSave
) => {
  const [calcResults, setCalcResults] = useState(null);
  const [calculationError, setCalculationError] = useState(null);

  useEffect(() => {
    let combinedUncertaintyPPM = NaN;
    let combinedUncertaintyAbsoluteBase = NaN;
    let effectiveDof = Infinity;
    const componentsForBudgetTable = [];
    let calculatedNominalResult = NaN;
    let derivedUcInputs_Native = 0;
    let derivedUcInputs_Base = 0;

    try {
      setCalculationError(null);

      // --- 1. EARLY EXIT: EMPTY STATE ---
      if (!uutNominal || 
          uutNominal.value === "" || 
          uutNominal.value === null || 
          uutNominal.value === undefined || 
          !uutNominal.unit) {
            
        setCalcResults(null);
        
        if (testPointData.is_detailed_uncertainty_calculated) {
          onDataSave({
            combined_uncertainty: null,
            effective_dof: null,
            k_value: null,
            expanded_uncertainty: null,
            is_detailed_uncertainty_calculated: false,
            calculatedBudgetComponents: [],
            calculatedNominalValue: null,
          });
        }
        return; 
      }

      const hasVariables =
        testPointData.variableMappings &&
        Object.keys(testPointData.variableMappings).length > 0;
      const noTmdes = !tmdeTolerancesData || tmdeTolerancesData.length === 0;

      const noManuals = !manualComponents || manualComponents.length === 0;

      if (
        testPointData.measurementType === "derived" &&
        hasVariables &&
        noTmdes && 
        noManuals
      ) {
        setCalcResults(null);
        if (testPointData.is_detailed_uncertainty_calculated) {
          onDataSave({
            combined_uncertainty: null,
            effective_dof: null,
            k_value: null,
            expanded_uncertainty: null,
            is_detailed_uncertainty_calculated: false,
            calculatedBudgetComponents: [],
            calculatedNominalValue: null,
          });
        }
        return;
      }

      // --- 2. VALIDATION: UNIT COMPATIBILITY ---
      const derivedNominalValue = parseFloat(uutNominal.value);
      const derivedNominalUnit = uutNominal.unit;
      const targetUnitInfo = unitSystem.units[derivedNominalUnit];

      if (!targetUnitInfo || isNaN(targetUnitInfo.to_si)) {
        throw new Error(
          `Derived unit '${derivedNominalUnit}' is not valid or has no SI conversion.`
        );
      }

      if (testPointData.measurementType === "derived") {
        
        // --- FIX START: PRE-CALCULATION GUARD ---
        // Check for mapped TMDEs with empty/invalid values to prevent Math Engine crash.
        const activeMappedVars = Object.values(testPointData.variableMappings || {}).filter(v => v);
        const mappedTmdes = tmdeTolerancesData.filter(t => 
            t.variableType && activeMappedVars.includes(t.variableType)
        );

        const hasInvalidValues = mappedTmdes.some(t => {
            const val = t.measurementPoint?.value;
            // Allow 0, but reject "" (empty string), null, undefined, or non-numeric strings
            return val === "" || val === null || val === undefined || isNaN(parseFloat(val));
        });

        if (hasInvalidValues) {
             setCalcResults(null);
             // Return silently. This is a "User is typing" state, not a system error.
             if (testPointData.is_detailed_uncertainty_calculated) {
                onDataSave({
                    combined_uncertainty: null,
                    effective_dof: null,
                    k_value: null,
                    expanded_uncertainty: null,
                    is_detailed_uncertainty_calculated: false,
                    calculatedBudgetComponents: [],
                    calculatedNominalValue: null,
                });
             }
             return; 
        }
        // --- FIX END ---

        const derivedCalculationResult = calculateDerivedUncertainty(
          testPointData.equationString,
          testPointData.variableMappings,
          tmdeTolerancesData,
          uutNominal,
          manualComponents
        );

        if (derivedCalculationResult.missingInputs) {
          setCalcResults(null);
          setCalculationError(null); 
          
          if (testPointData.is_detailed_uncertainty_calculated) {
            onDataSave({
              combined_uncertainty: null,
              effective_dof: null,
              k_value: null,
              expanded_uncertainty: null,
              is_detailed_uncertainty_calculated: false,
              calculatedBudgetComponents: [],
              calculatedNominalValue: null,
            });
          }
          return;
        }

        const {
          combinedUncertaintyNative,
          breakdown: derivedBreakdown,
          nominalResult,
          error: calcError,
        } = derivedCalculationResult;
        
        if (calcError) {
          throw new Error(calcError);
        }
        if (isNaN(combinedUncertaintyNative)) {
          throw new Error(
            "Derived uncertainty calculation (inputs) resulted in NaN."
          );
        }
        derivedUcInputs_Native = combinedUncertaintyNative;
        derivedUcInputs_Base = derivedUcInputs_Native * targetUnitInfo.to_si;

        calculatedNominalResult = nominalResult;

        // Unified list of SIGNED contributions in base SI units (equation inputs
        // + non-mapped manual components). combineWithCorrelation applies the
        // optional correlation matrix; an empty map yields the prior RSS.
        const inputCorrelations = testPointData.inputCorrelations || {};
        const signedContribsBase = [];

        derivedBreakdown.forEach((item, index) => {
            signedContribsBase.push({
                id: item.componentId,
                contribution: item.contribution_base_signed,
            });

            const contributingTmde = tmdeTolerancesData.find(
                (tmde) => tmde.variableType === item.type
            );
            
            const contributingManual = !contributingTmde 
                ? manualComponents.find(m => (m.variableType || m.name) === item.type) 
                : null;

            let distributionLabel = "N/A";
            let distributionDivisor;
            if (contributingTmde) {
                // Capture both the display label AND the canonical divisor so the
                // budget-table distribution dropdown can round-trip and write the
                // change back to this TMDE (mirrors the direct path).
                const tmdeBudgetComp = getBudgetComponentsFromTolerance(
                    contributingTmde,
                    contributingTmde.measurementPoint
                )[0];
                distributionLabel = tmdeBudgetComp?.distribution || "N/A";
                distributionDivisor = tmdeBudgetComp?.distributionDivisor;
            } else if (contributingManual) {
                distributionLabel = contributingManual.distribution || "Normal (k=2)";
            }

            const allContributingTmdes = tmdeTolerancesData.filter(
                (tmde) => tmde.variableType === item.type
            );
            const totalQuantity = allContributingTmdes.length > 0 
                ? allContributingTmdes.reduce((sum, tmde) => sum + (tmde.quantity || 1), 0)
                : 1;

            componentsForBudgetTable.push({
                id: `derived_${item.variable}_${index}`,
                componentId: item.componentId, // correlation-map identity
                name: `Input: ${item.type} (${item.variable})`,
                type: "B",
                value: item.ui_absolute_base,
                unit: item.unit,
                isBaseUnitValue: true,
                sensitivityCoefficient: item.ci,
                derivativeString: item.derivativeString,
                contribution: item.contribution_native,
                dof: Infinity,
                isCore: true,
                distribution: distributionLabel,
                distributionDivisor: distributionDivisor,
                // Link back to the contributing TMDE so a distribution change in
                // the budget table recalculates this derived input row too (#6).
                sourceTmdeId: contributingTmde?.id,
                sourcePointLabel: `${item.nominal} ${item.unit || ""}`,
                quantity: totalQuantity,
            });
        });

        if (manualComponents && manualComponents.length > 0) {
            manualComponents.forEach((comp, idx) => {
                const varType = comp.variableType || comp.name;
                const isMappedVariable = Object.values(testPointData.variableMappings || {}).includes(varType);

                if (!isMappedVariable) {
                    const absUncNative = (comp.value / 1e6) * Math.abs(derivedNominalValue);
                    const absUncBase = absUncNative * targetUnitInfo.to_si;

                    if (!isNaN(absUncNative)) {
                        signedContribsBase.push({
                            id: varType,
                            contribution: absUncBase,
                        });

                        componentsForBudgetTable.push({
                            ...comp,
                            id: comp.id || `manual_derived_${idx}`,
                            componentId: varType, // correlation-map identity
                            sourcePointLabel: "Manual",
                            value: absUncBase, 
                            unit: derivedNominalUnit,
                            isBaseUnitValue: true,
                            sensitivityCoefficient: 1, 
                            contribution: absUncNative,
                            dof: comp.dof || Infinity,
                            isCore: false
                        });
                    }
                }
            });
        }

        combinedUncertaintyAbsoluteBase = combineWithCorrelation(
          signedContribsBase,
          inputCorrelations
        );

        if (
          !isNaN(derivedNominalValue) &&
          derivedNominalUnit &&
          derivedNominalValue !== 0
        ) {
          const derivedNominalInBase = unitSystem.toBaseUnit(
            derivedNominalValue,
            derivedNominalUnit
          );
          if (!isNaN(derivedNominalInBase) && derivedNominalInBase !== 0) {
            combinedUncertaintyPPM =
              (combinedUncertaintyAbsoluteBase /
                Math.abs(derivedNominalInBase)) *
              1e6;
          }
        }

        effectiveDof = Infinity;
      } else {
        // --- DIRECT MEASUREMENT LOGIC ---
        
        let totalVariancePPM = 0;

        tmdeTolerancesData.forEach((tmde, tmdeIndex) => {
          if (uutNominal && uutNominal.value) {
            const quantity = tmde.quantity || 1;
            const toleranceSource = tmde.tolerance || tmde;

            const components = getBudgetComponentsFromTolerance(
              toleranceSource,
              uutNominal 
            ).map((c, compIndex) => ({
              ...c,
              id: `${c.id}_${tmdeIndex}_${compIndex}`,
              // Keep a link back to the originating TMDE instance so the budget
              // table's distribution dropdown can write the divisor back to the
              // tolerance and trigger a recalculation (#6).
              sourceTmdeId: tmde.id,
              sourcePointLabel: `${uutNominal.value} ${uutNominal.unit}`,
              quantity: quantity,
            }));

            componentsForBudgetTable.push(...components);

            components.forEach((comp) => {
              totalVariancePPM += comp.value ** 2 * quantity;
            });
          }
        });

        const manual = manualComponents.map((c) => ({
          ...c,
          sourcePointLabel: "Manual",
        }));
        manual.forEach((comp) => {
          totalVariancePPM += comp.value ** 2;
          componentsForBudgetTable.push(comp);
        });

        combinedUncertaintyPPM = Math.sqrt(totalVariancePPM);

        const numerator = Math.pow(combinedUncertaintyPPM, 4);
        const denominator = componentsForBudgetTable.reduce((sum, comp) => {
          const dof =
            comp.dof === Infinity ||
            comp.dof == null ||
            isNaN(parseFloat(comp.dof))
              ? Infinity
              : parseFloat(comp.dof);
          return dof === Infinity ||
            dof <= 0 ||
            isNaN(comp.value) ||
            comp.value === 0
            ? sum
            : sum + Math.pow(comp.value, 4) / dof;
        }, 0);
        effectiveDof = denominator > 0 ? numerator / denominator : Infinity;

        if (
          !isNaN(combinedUncertaintyPPM) &&
          !isNaN(derivedNominalValue) &&
          derivedNominalUnit &&
          derivedNominalValue !== 0
        ) {
          const derivedNominalInBase = unitSystem.toBaseUnit(
            derivedNominalValue,
            derivedNominalUnit
          );
          if (!isNaN(derivedNominalInBase) && derivedNominalInBase !== 0) {
            combinedUncertaintyAbsoluteBase =
              (combinedUncertaintyPPM / 1e6) * Math.abs(derivedNominalInBase);
            componentsForBudgetTable.forEach((comp) => {
              const compBase =
                (comp.value / 1e6) * Math.abs(derivedNominalInBase);
              comp.contribution = compBase / targetUnitInfo.to_si;
            });
          }
        }
      }

      if (
        (isNaN(combinedUncertaintyPPM) &&
          isNaN(combinedUncertaintyAbsoluteBase)) ||
        componentsForBudgetTable.length === 0
      ) {
        setCalcResults(null);
        if (testPointData.is_detailed_uncertainty_calculated) {
          onDataSave({
            combined_uncertainty: null,
            effective_dof: null,
            k_value: null,
            expanded_uncertainty: null,
            is_detailed_uncertainty_calculated: false,
            calculatedBudgetComponents: [],
          });
        }
        return;
      }

      const confidencePercent =
        parseFloat(sessionData.uncReq.uncertaintyConfidence) || 95;
      const probability = 1 - (1 - confidencePercent / 100) / 2;
      const kValue =
        effectiveDof === Infinity || isNaN(effectiveDof)
          ? normalQuantile(probability)
          : getKValueFromTDistribution(effectiveDof);

      const expandedUncertaintyPPM = !isNaN(combinedUncertaintyPPM)
        ? kValue * combinedUncertaintyPPM
        : NaN;
      const expandedUncertaintyAbsoluteBase = !isNaN(
        combinedUncertaintyAbsoluteBase
      )
        ? kValue * combinedUncertaintyAbsoluteBase
        : NaN;

      const newResults = {
        combined_uncertainty: combinedUncertaintyPPM,
        combined_uncertainty_absolute_base: combinedUncertaintyAbsoluteBase,
        combined_uncertainty_inputs_native: derivedUcInputs_Native,
        combined_uncertainty_inputs_base: derivedUcInputs_Base,
        effective_dof: effectiveDof,
        k_value: kValue,
        expanded_uncertainty: expandedUncertaintyPPM,
        expanded_uncertainty_absolute_base: expandedUncertaintyAbsoluteBase,
        is_detailed_uncertainty_calculated: true,
        calculatedBudgetComponents: componentsForBudgetTable,
        calculatedNominalValue: calculatedNominalResult,
      };

      setCalcResults(newResults);

      const resultsHaveChanged =
        !testPointData.is_detailed_uncertainty_calculated ||
        Math.abs(
          (testPointData.expanded_uncertainty || 0) -
            (newResults.expanded_uncertainty || 0)
        ) > 1e-9 ||
        Math.abs(
          (testPointData.expanded_uncertainty_absolute_base || 0) -
            (newResults.expanded_uncertainty_absolute_base || 0)
        ) > 1e-9 ||
        JSON.stringify(testPointData.calculatedBudgetComponents) !==
          JSON.stringify(newResults.calculatedBudgetComponents);

      if (resultsHaveChanged) {
        onDataSave({
          combined_uncertainty: newResults.combined_uncertainty,
          combined_uncertainty_absolute_base:
            newResults.combined_uncertainty_absolute_base,
          combined_uncertainty_inputs_native:
            newResults.combined_uncertainty_inputs_native,
          combined_uncertainty_inputs_base:
            newResults.combined_uncertainty_inputs_base,
          effective_dof: newResults.effective_dof,
          k_value: newResults.k_value,
          expanded_uncertainty: newResults.expanded_uncertainty,
          expanded_uncertainty_absolute_base:
            newResults.expanded_uncertainty_absolute_base,
          is_detailed_uncertainty_calculated:
            newResults.is_detailed_uncertainty_calculated,
          calculatedBudgetComponents: newResults.calculatedBudgetComponents,
          calculatedNominalValue: newResults.calculatedNominalValue,
        });
      }
    } catch (error) {
      console.error("Error during uncertainty calculation useEffect:", error);
      setCalculationError(error.message);
      setCalcResults(null);
      if (testPointData.is_detailed_uncertainty_calculated) {
        onDataSave({
          combined_uncertainty: null,
          effective_dof: null,
          k_value: null,
          expanded_uncertainty: null,
          is_detailed_uncertainty_calculated: false,
          calculatedBudgetComponents: [],
          calculatedNominalValue: null,
        });
      }
    }
  }, [
    testPointData.id,
    testPointData.measurementType,
    testPointData.equationString,
    testPointData.variableMappings,
    testPointData.inputCorrelations,
    tmdeTolerancesData,
    uutToleranceData,
    uutNominal,
    manualComponents,
    sessionData.uncReq.uncertaintyConfidence,
    onDataSave,
    testPointData.is_detailed_uncertainty_calculated,
    testPointData.expanded_uncertainty,
    testPointData.calculatedBudgetComponents,
    testPointData.expanded_uncertainty_absolute_base
  ]);

  return { calcResults, calculationError };
};