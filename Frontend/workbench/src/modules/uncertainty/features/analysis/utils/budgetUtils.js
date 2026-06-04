/**
 * * This utility file contains helper functions for breaking down tolerance objects
 * * into individual uncertainty budget components.
 */

import { 
  unitSystem, 
  convertToPPM, 
  errorDistributions 
} from "../../../utils/uncertaintyMath";

export const oldErrorDistributions = [
  { value: "1.732", label: "Rectangular" },
  { value: "3.464", label: "Rectangular (Resolution)" },
  { value: "2.449", label: "Triangular" },
  { value: "1.414", label: "U Shaped" },
  { value: "1.645", label: "Normal (90%, k=1.645)" },
  { value: "1.960", label: "Normal (95%, k=1.960)" },
  { value: "2.000", label: "Normal (95.45%, k=2)" },
  { value: "2.576", label: "Normal (99%, k=2.576)" },
  { value: "3.000", label: "Normal (99.73%, k=3)" },
  { value: "4.179", label: "Rayleigh" },
  { value: "1.000", label: "Standard Uncertainty (Input is uᵢ)" },
];

export const getBudgetComponentsFromTolerance = (
  rawToleranceObject,
  referenceMeasurementPoint
) => {

  // --- 1. STRUCTURE NORMALIZATION ---
  let toleranceObject = rawToleranceObject;
  
  if (Array.isArray(toleranceObject)) {
    toleranceObject = toleranceObject[0];
  }

  // NOTE: Automatic resolution handling removed. 
  // Resolution must now be added as a manual component if desired in the budget.

  if (toleranceObject && typeof toleranceObject === 'object') {
     if (toleranceObject.tolerance) {
        toleranceObject = toleranceObject.tolerance;
     } else if (toleranceObject.tolerances) {
        toleranceObject = toleranceObject.tolerances;
     }
  }

  const hasValidValue = referenceMeasurementPoint && 
                        referenceMeasurementPoint.value !== null && 
                        referenceMeasurementPoint.value !== undefined && 
                        referenceMeasurementPoint.value !== "";

  if (
    !toleranceObject ||
    !referenceMeasurementPoint ||
    !hasValidValue ||
    !referenceMeasurementPoint.unit
  ) {
    return [];
  }

  const budgetComponents = [];
  const nominalValue = parseFloat(referenceMeasurementPoint.value);
  const nominalUnit = referenceMeasurementPoint.unit;
  const prefix = toleranceObject.name || "TMDE";

  // --- ACCUMULATORS FOR LINEAR SUM ---
  let totalAccuracyHalfSpan_Base = 0;
  let activeDistributionDivisor = 1.732; // Default to Rectangular
  let activeDistributionLabel = "Rectangular";
  // Canonical divisor string (matches an errorDistributions value, e.g.
  // "1.960"). The budget-table dropdown round-trips on this exact string.
  let activeDistributionRaw = "1.732";
  let hasAccuracyComponents = false;

  const calculateComponentSpan = (
    tolComp,
    name,
    baseValueForRelative
  ) => {
    // Check for missing data
    if (!tolComp) return 0;
    if (typeof tolComp !== 'object') return 0;

    // Capture distribution from the first valid component we find. Normalize
    // to a canonical errorDistributions entry so the divisor, label, and the
    // round-trip string the dropdown uses all agree.
    if (!hasAccuracyComponents) {
        const distEntry = errorDistributions.find(
          (d) => parseFloat(d.value) === parseFloat(tolComp.distribution)
        );
        activeDistributionRaw = distEntry
          ? distEntry.value
          : tolComp.distribution != null
          ? String(tolComp.distribution)
          : "1.732";
        activeDistributionDivisor = parseFloat(activeDistributionRaw) || 1.732;
        activeDistributionLabel = distEntry?.label || "Rectangular";
    }

    const high = parseFloat(tolComp?.high || 0);
    let low = parseFloat(tolComp?.low || -high);

    // --- FIX: HANDLE POSITIVE LOW VALUES ---
    if (tolComp.symmetric && low > 0) {
        low = -Math.abs(low);
    } else if (low > 0 && high > 0 && Math.abs(high - low) < 1e-9) {
        low = -Math.abs(low);
    }
    
    const halfSpan = (high - low) / 2;
    if (halfSpan === 0) return 0;

    const unit = tolComp.unit;
    let valueInBaseUnits = 0;

    if (["%", "ppm", "ppb"].includes(unit)) {
      let multiplier = 0;
      if (unit === "%") multiplier = 0.01;
      else if (unit === "ppm") multiplier = 1e-6;
      else if (unit === "ppb") multiplier = 1e-9;

      if (isNaN(baseValueForRelative)) return 0;
      
      const absoluteValueInNominalUnit = halfSpan * multiplier * baseValueForRelative;
      valueInBaseUnits = unitSystem.toBaseUnit(absoluteValueInNominalUnit, nominalUnit);
      
    } else {
      valueInBaseUnits = unitSystem.toBaseUnit(halfSpan, unit);
    }

    hasAccuracyComponents = true;
    return valueInBaseUnits;
  };
  
  // --- 1. ACCUMULATE ACCURACY COMPONENTS ---
  // Reading
  totalAccuracyHalfSpan_Base += calculateComponentSpan(
      toleranceObject.reading, "Reading", nominalValue
  );

  // Range (Relative to Full Scale)
  const rangeFS = parseFloat(toleranceObject.max) || parseFloat(toleranceObject.range?.value);
  totalAccuracyHalfSpan_Base += calculateComponentSpan(
    toleranceObject.range, "Range", rangeFS
  );

  // Floor
  totalAccuracyHalfSpan_Base += calculateComponentSpan(
      toleranceObject.floor, "Floor", nominalValue
  );
  
  // Readings IV
  totalAccuracyHalfSpan_Base += calculateComponentSpan(
      toleranceObject.readings_iv, "Readings (IV)", nominalValue
  );

  // --- 2. CREATE THE UNIFIED ACCURACY COMPONENT ---
  if (hasAccuracyComponents && totalAccuracyHalfSpan_Base > 0) {
      
      // Calculate Standard Uncertainty (u_i) in Base Units
      const u_i_base = totalAccuracyHalfSpan_Base / activeDistributionDivisor;
      
      // Convert u_i back to Nominal Units for display
      const u_i_native = unitSystem.fromBaseUnit(u_i_base, nominalUnit);
      
      // --- CRITICAL FIX: CONVERT TO PPM FOR CALCULATOR ---
      // The useUncertaintyCalculation hook expects 'value' to be in PPM for Direct Measurements.
      // We calculate PPM here so the RSS summation works correctly.
      
      const nominalBase = unitSystem.toBaseUnit(nominalValue, nominalUnit);
      let finalValuePPM = NaN;
      let isBaseUnitValue = false;

      if (nominalBase !== 0 && !isNaN(nominalBase)) {
          finalValuePPM = (u_i_base / Math.abs(nominalBase)) * 1e6;
          // value is PPM
          isBaseUnitValue = false; 
      } else {
          // Fallback for 0 Nominal (Calculator might struggle, but this keeps data accurate)
          finalValuePPM = u_i_base;
          isBaseUnitValue = true;
      }
      
      const uniqueSuffix = toleranceObject.id ? `_${toleranceObject.id}` : '';
      const componentId = `${prefix}_accuracy${uniqueSuffix}`;

      budgetComponents.push({
        id: componentId,
        name: `${prefix} - Accuracy`,
        type: "B",
        value: finalValuePPM,        // Passing PPM to calculation engine
        isBaseUnitValue: isBaseUnitValue, 
        value_native: u_i_native,    // Passing Absolute to Table Display
        unit_native: nominalUnit,
        dof: Infinity,
        isCore: true,
        distribution: activeDistributionLabel,
        distributionDivisor: activeDistributionRaw,
      });
  }

  // --- 3. HANDLE dB ---
  if (toleranceObject.db && !isNaN(parseFloat(toleranceObject.db.high))) {
      const highDb = parseFloat(toleranceObject.db.high || 0);
      const lowDb = parseFloat(toleranceObject.db.low || -highDb);
      const dbTol = (highDb - lowDb) / 2;

      if (dbTol > 0 && nominalValue > 0) {
        const dbMult = parseFloat(toleranceObject.db.multiplier) || 20;
        const dbRef = parseFloat(toleranceObject.db.ref) || 1;
        
        const dbNominal = dbMult * Math.log10(nominalValue / dbRef);
        const centerDb = (highDb + lowDb) / 2;
        const nominalAtCenterTol = dbRef * Math.pow(10, (dbNominal + centerDb) / dbMult);
        const upperValue = dbRef * Math.pow(10, (dbNominal + highDb) / dbMult);
        const absoluteDeviation = Math.abs(upperValue - nominalAtCenterTol);
  
        const ppm = convertToPPM(absoluteDeviation, nominalUnit, nominalValue, nominalUnit);

        // Use the dB component's own distribution (falling back to the
        // accumulated accuracy distribution). The prior code referenced
        // undefined `distributionDivisor`/`distributionLabel` and threw.
        const dbDistEntry = errorDistributions.find(
          (d) => parseFloat(d.value) === parseFloat(toleranceObject.db.distribution)
        );
        const dbDistRaw = dbDistEntry ? dbDistEntry.value : activeDistributionRaw;
        const dbDivisor = parseFloat(dbDistRaw) || activeDistributionDivisor;
        const dbLabel = dbDistEntry?.label || activeDistributionLabel;

        if (!isNaN(ppm)) {
          const u_i = Math.abs(ppm / dbDivisor);

          budgetComponents.push({
            id: `${prefix}_db_${toleranceObject.id || "manual"}`,
            name: `${prefix} - dB`,
            type: "B",
            value: u_i,
            value_native: absoluteDeviation / dbDivisor,
            unit_native: nominalUnit,
            dof: Infinity,
            isCore: true,
            distribution: dbLabel,
            distributionDivisor: dbDistRaw,
          });
        }
     }
  }

  // --- 4. OPTIONAL: RESOLUTION COMPONENT ---
  // Only included when the instrument/UUT explicitly opted in (#10). Modeled as
  // a rectangular distribution spanning one least-significant-digit, i.e.
  // u = LSD / (2*sqrt(3)).
  const resVal = parseFloat(toleranceObject.measuringResolution);
  if (
    toleranceObject.includeResolutionInBudget &&
    !isNaN(resVal) &&
    resVal > 0
  ) {
    const resUnit = toleranceObject.measuringResolutionUnit || nominalUnit;
    const resBase = unitSystem.toBaseUnit(resVal, resUnit);
    if (!isNaN(resBase) && resBase > 0) {
      const u_i_base = resBase / (2 * Math.sqrt(3));
      const u_i_native = unitSystem.fromBaseUnit(u_i_base, nominalUnit);
      const nominalBase = unitSystem.toBaseUnit(nominalValue, nominalUnit);

      let finalValuePPM = NaN;
      let isBaseUnitValue = false;
      if (nominalBase !== 0 && !isNaN(nominalBase)) {
        finalValuePPM = (u_i_base / Math.abs(nominalBase)) * 1e6;
      } else {
        finalValuePPM = u_i_base;
        isBaseUnitValue = true;
      }

      budgetComponents.push({
        id: `${prefix}_resolution${toleranceObject.id ? `_${toleranceObject.id}` : ""}`,
        name: `${prefix} - Resolution`,
        type: "B",
        value: finalValuePPM,
        isBaseUnitValue,
        value_native: u_i_native,
        unit_native: nominalUnit,
        dof: Infinity,
        isCore: true,
        distribution: "Rectangular",
      });
    }
  }

  return budgetComponents;
};