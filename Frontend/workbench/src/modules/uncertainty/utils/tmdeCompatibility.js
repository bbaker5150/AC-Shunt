import { unitSystem } from "./uncertaintyMath";

const hasValue = (value) =>
  value !== undefined && value !== null && value !== "";

export const assessRangeCompatibility = (
  range,
  measurementPoint,
  rangeLabel = "range",
) => {
  const pointValue = Number(measurementPoint?.value);
  const pointUnit = measurementPoint?.unit;
  const rangeUnit = range?.unit;

  if (!Number.isFinite(pointValue) || !pointUnit) {
    return {
      compatible: false,
      reason: "Define the measurement point value and unit first.",
    };
  }

  if (!range || Object.keys(range).length === 0 || !rangeUnit) {
    return {
      compatible: false,
      reason: `Select a ${rangeLabel} with a defined unit.`,
    };
  }

  const pointQuantity = unitSystem.getQuantity(pointUnit);
  const rangeQuantity = unitSystem.getQuantity(rangeUnit);
  const unitsMatch = pointQuantity && rangeQuantity
    ? pointQuantity === rangeQuantity
    : pointUnit === rangeUnit;

  if (!unitsMatch) {
    return {
      compatible: false,
      reason: `${rangeUnit} is not compatible with the point unit ${pointUnit}.`,
    };
  }

  const pointInRangeUnit =
    pointUnit === rangeUnit
      ? pointValue
      : unitSystem.fromBaseUnit(
          unitSystem.toBaseUnit(pointValue, pointUnit),
          rangeUnit,
        );
  const min = Number(range.min);
  const max = Number(range.max);

  if (hasValue(range.min) && Number.isFinite(min) && pointInRangeUnit < min) {
    return {
      compatible: false,
      reason: `${pointValue} ${pointUnit} is below this ${rangeLabel}.`,
    };
  }

  if (hasValue(range.max) && Number.isFinite(max) && pointInRangeUnit > max) {
    return {
      compatible: false,
      reason: `${pointValue} ${pointUnit} exceeds this ${rangeLabel}.`,
    };
  }

  return { compatible: true, reason: "" };
};

export const assessTmdeCompatibility = (range, measurementPoint) =>
  assessRangeCompatibility(range, measurementPoint, "TMDE range");
