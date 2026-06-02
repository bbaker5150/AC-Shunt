import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------
// Custom window caption controls (Electron / Windows).
// ---------------------------------------------------------------------
// Lives in the shared workbench top bar so EVERY route — including the
// launcher — can move/min/max/close the frameless Electron window. On
// non-Electron environments (browser dev, future web build) the IPC
// bridge is absent and this renders nothing.
// ---------------------------------------------------------------------
const getIpcRenderer = () => {
  try {
    if (typeof window !== "undefined" && typeof window.require === "function") {
      return window.require("electron").ipcRenderer;
    }
  } catch (_) {
    // Not running inside Electron (e.g. plain browser dev). Swallow.
  }
  return null;
};

export default function CaptionControls() {
  const ipcRendererRef = useRef(getIpcRenderer());
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const ipc = ipcRendererRef.current;
    if (!ipc) return;
    let cancelled = false;

    ipc
      .invoke("window-is-maximized")
      .then((value) => {
        if (!cancelled) setIsMaximized(Boolean(value));
      })
      .catch(() => {});

    const onState = (_event, value) => setIsMaximized(Boolean(value));
    ipc.on("window-maximize-state", onState);
    return () => {
      cancelled = true;
      ipc.removeListener("window-maximize-state", onState);
    };
  }, []);

  const ipc = ipcRendererRef.current;
  if (!ipc) return null;

  return (
    <div className="workbench-caption" aria-label="Window controls">
      <button
        type="button"
        className="workbench-caption-btn"
        onClick={() => ipc.send("window-minimize")}
        aria-label="Minimize"
        title="Minimize"
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5 H10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </button>
      <button
        type="button"
        className="workbench-caption-btn"
        onClick={() => ipc.send("window-maximize-toggle")}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? (
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
            <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="workbench-caption-btn workbench-caption-btn--close"
        onClick={() => ipc.send("window-close")}
        aria-label="Close"
        title="Close"
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1.1" fill="none" />
        </svg>
      </button>
    </div>
  );
}
