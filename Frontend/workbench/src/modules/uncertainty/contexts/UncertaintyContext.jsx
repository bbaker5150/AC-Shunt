// src/modules/uncertainty/contexts/UncertaintyContext.jsx
//
// Module-private context for the Uncertainty Budget tool. Lives entirely
// inside this module — the shell and other modules never import it. Phase 2+
// will hang the budget state, API calls, and pipeline auto-pull guard off
// this provider; for now it is a thin skeleton so the module root has a
// provider to wrap and a hook to grow into.
import React, { createContext, useContext, useMemo } from "react";

const UncertaintyContext = createContext(null);

export const useUncertainty = () => useContext(UncertaintyContext);

export function UncertaintyProvider({ children }) {
  // Placeholder value. Replace with real budget state/actions as the module
  // is built out.
  const value = useMemo(() => ({}), []);

  return (
    <UncertaintyContext.Provider value={value}>
      {children}
    </UncertaintyContext.Provider>
  );
}
