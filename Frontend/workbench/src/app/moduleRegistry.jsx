import { lazy } from "react";

// ---------------------------------------------------------------------
// Workbench module registry
// ---------------------------------------------------------------------
// The single source of truth for what tools the Metrology Workbench
// offers. Both the router (app/routes.jsx) and the launcher
// (app/HomeLauncher.jsx) read from this list, so adding a new module is
// a one-line edit here — the only routinely-shared surface across teams.
//
// Each entry:
//   id        stable kebab-case module key used by the launcher
//   route     user-facing URL segment (/<route>/*)
//   title     launcher card title
//   subtitle  launcher card supporting line
//   path      absolute route the launcher navigates to
//   status    'ready' (mountable) | 'coming-soon' (disabled card)
//   Component lazily-loaded module root, or null while not yet built.
//             Lazy loading keeps each module in its own chunk so a dev
//             editing one module rarely triggers a rebuild of another.
// ---------------------------------------------------------------------
export const MODULES = [
  {
    id: "ac-shunt",
    route: "ac-shunt",
    title: "Run Calibration",
    subtitle: "AC Shunt calibration & data collection",
    path: "/ac-shunt",
    status: "ready",
    Component: lazy(() => import("../modules/ac-shunt/AcShuntApp")),
  },
  {
    id: "uncertainty",
    route: "uncertalytics",
    title: "Uncertainty Budget",
    subtitle: "Assemble an uncertainty budget",
    path: "/uncertalytics",
    status: "ready",
    Component: lazy(() => import("../modules/uncertainty/UncertaintyApp")),
  },
  {
    id: "reports",
    route: "report-of-calibration",
    title: "Report of Calibration",
    subtitle: "Generate a calibration report",
    path: "/report-of-calibration",
    status: "ready",
    Component: lazy(() => import("../modules/reports/ReportsApp")),
  },
];
