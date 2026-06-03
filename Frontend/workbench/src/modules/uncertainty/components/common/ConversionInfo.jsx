import React, { useMemo } from "react";
import { convertToPPM } from "../../utils/uncertaintyMath";

const ConversionInfo = ({ value, unit, nominal }) => {
  const { explanation, warning } = useMemo(() => {
    if (
      !value ||
      !unit ||
      unit === "ppm" ||
      !nominal ||
      !nominal.value ||
      !nominal.unit
    ) {
      return { explanation: null, warning: null };
    }
    return convertToPPM(value, unit, nominal.value, nominal.unit, true);
  }, [value, unit, nominal]);

  if (warning) {
    return <div className="conversion-warning">⚠️ {warning}</div>;
  }

  if (explanation) {
    return <div className="conversion-info">↳ {explanation}</div>;
  }

  return null;
};

export default ConversionInfo;