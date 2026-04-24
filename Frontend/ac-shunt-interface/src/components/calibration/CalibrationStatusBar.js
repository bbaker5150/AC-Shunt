import React, { useState, useEffect, useRef } from "react";
import {
  FaStop,
  FaPlay,
  FaChevronDown,
  FaHourglassHalf,
  FaCrosshairs,
  FaStream,
} from "react-icons/fa";

const CalibrationStatusBar = ({
  activeRunningTP,
  focusedTP,
  formatCurrent,
  formatFrequency,
  isCollecting,
  isBulkRunning,
  bulkRunProgress,
  timerState,
  countdown,
  stabilizationStatus,
  stabilizationInfo,
  collectionProgress,
  getStageName,
  latestStdReading,
  latestTiReading,
  calibrationSettings,
  displayPpm,
  isStableNow,
  windowPhaseText,
  instabilityCount,
  maxRetries,
  stopReadingCollection,
  handleRunSelectedPoints,
  readingWsState,
  selectedTPs,
  dropdownOptions,
  isRemoteViewer,
}) => {
  const [isRunDropdownOpen, setIsRunDropdownOpen] = useState(false);
  const runDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        runDropdownRef.current &&
        !runDropdownRef.current.contains(event.target)
      ) {
        setIsRunDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (!activeRunningTP) return null;

  // Hosts optimistically set isCollecting in startReadingCollection() before
  // warm-up; remotes only flip isCollecting on calibration_stage_update (after
  // warm-up). Include an active pre-measurement timer so observers still see
  // Warm-up / Settling in the status bar.
  const showRunActivity =
    isCollecting || isBulkRunning || Boolean(timerState?.isActive);

  return (
    <div className="status-bar">
      <div className="status-bar-content">
        {/* --- READOUT SECTION --- */}
        <div className="status-section readout-section">
          <span className="status-label">
            {showRunActivity ? "Running Test Point" : "Test Point"}
          </span>
          <span className="status-value">
            {formatCurrent(activeRunningTP.current)}
          </span>
          <span className="status-detail">
            {formatFrequency(activeRunningTP.frequency)}
          </span>
        </div>
        <div style={{ flexGrow: 1 }}></div>

        {/* --- DYNAMIC SECTIONS (Only show when collecting/running) --- */}
        {showRunActivity && (
          <>
            {isBulkRunning && (
              <div
                className="status-section"
                style={{ flexGrow: 1.5, borderRight: "1px solid var(--border-color)" }}
              >
                <span className="status-label">Batch Progress</span>
                <span className="status-value">{`Point ${bulkRunProgress.current} of ${bulkRunProgress.total}`}</span>
                <span className="status-detail">{`${formatCurrent(
                  activeRunningTP?.current
                )} @ ${formatFrequency(activeRunningTP?.frequency)}`}</span>
              </div>
            )}
            <div className="status-section">
              <span className="status-label">
                {timerState.isActive ? (
                  <>
                    <FaHourglassHalf /> {timerState.label}
                  </>
                ) : stabilizationStatus ? (
                  <>
                    <FaCrosshairs /> Stabilizing
                  </>
                ) : (
                  <>
                    <FaStream /> Collecting
                  </>
                )}
              </span>
              <span className="status-value">
                {timerState.isActive ? `${countdown}s` : getStageName()}
              </span>
              <span className="status-detail">
                {timerState.isActive
                  ? null
                  : stabilizationStatus && stabilizationInfo
                    ? `Attempt: ${stabilizationInfo.count}`
                    : `${collectionProgress.count} / ${collectionProgress.total} Samples`}
              </span>
            </div>

            {/* --- LIVE READINGS SECTION --- */}
            {!timerState.isActive && (latestStdReading || latestTiReading) && (
              <div className="status-section live-readout-section">
                <span className="status-label">
                  <FaStream /> Live Readings
                </span>
                <span className="status-value">
                  {latestStdReading
                    ? `STD: ${latestStdReading.y.toPrecision(7)} V`
                    : "STD: ..."}
                </span>
                <span className="status-detail">
                  {latestTiReading
                    ? `TI: ${latestTiReading.y.toPrecision(7)} V`
                    : "TI: ..."}
                </span>
              </div>
            )}

            {!timerState.isActive &&
              calibrationSettings.stability_check_method === "sliding_window" && (
                <div className="status-section window-stability-section">
                  <span className="status-label">
                    <FaCrosshairs /> Window Stability
                  </span>
                  <span
                    className={`window-ppm-value ${isStableNow ? "status-good" : "status-bad"
                      }`}
                  >
                    {displayPpm != null ? `${displayPpm.toFixed(2)} PPM` : "..."}
                  </span>
                  <span className="status-detail">
                    {`${windowPhaseText} | Retries: ${instabilityCount}/${maxRetries} | Thresh: ${calibrationSettings.stability_threshold_ppm} PPM`}
                  </span>
                </div>
              )}
          </>
        )}
      </div>

      {/* --- CONDITIONAL PROGRESS BAR, STOP BUTTON, OR PLAY BUTTON --- */}
      {/*
        Remote viewers intentionally get no action affordance here. The
        header's "OBSERVING" pill and dimmed sidebar toolbar already signal
        the read-only state, so repeating "Observing — controls disabled"
        next to the progress bar was visual noise. We just omit the action
        slot entirely and let the progress bar (or live readout) breathe.
      */}
      {showRunActivity ? (
        <>
          <div className="status-bar-progress-container">
            <div
              className="status-bar-progress"
              style={{
                width: `${collectionProgress.total > 0
                    ? (collectionProgress.count / collectionProgress.total) * 100
                    : 0
                  }%`,
              }}
            ></div>
          </div>
          {!isRemoteViewer && (
            <div className="status-bar-action">
              <button
                onClick={stopReadingCollection}
                className="button-stop"
                title="Stop Collection"
              >
                <FaStop />
              </button>
            </div>
          )}
        </>
      ) : isRemoteViewer ? null : (
        <div className="status-bar-action">
          <div className="premium-action-button-container" ref={runDropdownRef}>
            <div className="premium-action-button-wrapper">
              <button
                className="button premium-action-button-primary"
                onClick={handleRunSelectedPoints}
                disabled={
                  !focusedTP ||
                  readingWsState !== WebSocket.OPEN ||
                  selectedTPs.size === 0
                }
                title="Run Selected Points"
              >
                <FaPlay />
              </button>
              <button
                className="button premium-action-button-caret"
                onClick={() => setIsRunDropdownOpen((prev) => !prev)}
                disabled={!focusedTP || readingWsState !== WebSocket.OPEN}
                title="More run options"
              >
                <FaChevronDown />
              </button>
            </div>
            {isRunDropdownOpen && (
              <div className="premium-action-button-menu">
                {dropdownOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      opt.onClick();
                      setIsRunDropdownOpen(false);
                    }}
                    className="premium-action-button-item"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalibrationStatusBar;