import React, { Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { FaBolt, FaCalculator, FaFileAlt, FaArrowRight } from "react-icons/fa";
import { MODULES } from "./moduleRegistry";
import "./HomeLauncher.css";

// The 3D medallion pulls in three.js, so load it lazily and fall back to
// the flat seal PNG for an instant first paint and graceful degradation.
const LauncherEmblem = lazy(() => import("./LauncherEmblem"));

// Icon per module id. Kept here (presentation concern) rather than in the
// registry so the registry stays a plain data manifest.
const MODULE_ICONS = {
  "ac-shunt": <FaBolt aria-hidden />,
  uncertainty: <FaCalculator aria-hidden />,
  reports: <FaFileAlt aria-hidden />,
};

export default function HomeLauncher() {
  const navigate = useNavigate();

  return (
    <div className="workbench-home">
      <header className="workbench-home-header">
        <div className="workbench-home-emblem">
          <Suspense
            fallback={
              <img
                src="/navair-seal.png"
                alt=""
                className="workbench-home-seal"
                aria-hidden
              />
            }
          >
            <LauncherEmblem />
          </Suspense>
        </div>
        <div className="workbench-home-heading">
          <span className="workbench-home-eyebrow">Navy Primary Standard Lab</span>
          <h1 className="workbench-home-title">Metrology Workbench</h1>
          <p className="workbench-home-subtitle">
            Choose a tool to get started
          </p>
        </div>
      </header>

      <div className="workbench-home-grid">
        {MODULES.map((m) => {
          const ready = m.status === "ready";
          return (
            <button
              key={m.id}
              type="button"
              className={`workbench-card${ready ? "" : " is-disabled"}`}
              onClick={() => ready && navigate(m.path)}
              disabled={!ready}
              aria-label={
                ready ? `Open ${m.title}` : `${m.title} — coming soon`
              }
            >
              <span className="workbench-card-icon">{MODULE_ICONS[m.id]}</span>
              <span className="workbench-card-body">
                <span className="workbench-card-title">{m.title}</span>
                <span className="workbench-card-subtitle">{m.subtitle}</span>
              </span>
              <span className="workbench-card-action">
                {ready ? (
                  <FaArrowRight aria-hidden />
                ) : (
                  <span className="workbench-card-soon">Coming soon</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
