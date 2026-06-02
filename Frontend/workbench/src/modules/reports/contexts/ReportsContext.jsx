// src/modules/reports/contexts/ReportsContext.jsx
//
// Module-private context for the Report of Calibration tool. Lives entirely
// inside this module — the shell and other modules never import it. Phase 2+
// will hang the report state, API calls, and pipeline auto-pull guard off
// this provider; for now it is a thin skeleton so the module root has a
// provider to wrap and a hook to grow into.
import React, { createContext, useContext, useMemo } from "react";

const ReportsContext = createContext(null);

export const useReports = () => useContext(ReportsContext);

export function ReportsProvider({ children }) {
  // Placeholder value. Replace with real report state/actions as the module
  // is built out.
  const value = useMemo(() => ({}), []);

  return (
    <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>
  );
}
