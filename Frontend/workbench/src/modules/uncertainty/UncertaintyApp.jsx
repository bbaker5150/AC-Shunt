// src/modules/uncertainty/UncertaintyApp.jsx
//
// Module root for the Uncertainty Budget tool. This default export is the
// React.lazy() target wired up in app/moduleRegistry.jsx — it is the module's
// sole public surface. Everything else under modules/uncertainty/ is private
// to this tree and is never imported by the shell or by other modules.
//
// Module-private providers wrap the tree here (not at the workbench root) so
// only this module pays for its own state. The router hands this module the
// wildcard path /uncertainty/*, so internal navigation lives in the <Routes>
// below and the shell never knows about it.
import React from "react";
import { Routes, Route } from "react-router-dom";
import { UncertaintyProvider } from "./contexts/UncertaintyContext";
import UncertaintyMain from "./components/UncertaintyMain";
import "./UncertaintyApp.css";

export default function UncertaintyApp() {
  return (
    <UncertaintyProvider>
      <Routes>
        <Route index element={<UncertaintyMain />} />
        {/* Future internal routes (e.g. :budgetId) go here. Unknown sub-paths
            fall through to the index placeholder for now. */}
        <Route path="*" element={<UncertaintyMain />} />
      </Routes>
    </UncertaintyProvider>
  );
}
