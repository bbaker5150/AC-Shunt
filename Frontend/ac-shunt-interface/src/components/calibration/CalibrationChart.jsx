import React, { useRef, useState, useMemo, useEffect } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import { FaCog, FaChevronDown, FaCheck } from "react-icons/fa";
import { BsFiletypePng } from "react-icons/bs";
import { TbZoomReset } from "react-icons/tb";
import { FiActivity } from "react-icons/fi";

const crosshairPlugin = {
  id: "crosshair",
  afterDraw: (chart, args, options) => {
    const { syncedHoverIndex } = options;
    if (syncedHoverIndex === null || syncedHoverIndex === undefined) {
      return;
    }
    const {
      ctx,
      chartArea: { top, bottom, left, right },
      scales: { x },
    } = chart;
    const xCoord = x.getPixelForValue(syncedHoverIndex);

    if (xCoord >= left && xCoord <= right) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xCoord, top);
      ctx.lineTo(xCoord, bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = options.color || "rgba(150, 150, 150, 0.7)";
      ctx.stroke();
      ctx.restore();
    }
  },
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin,
  crosshairPlugin
);

const Accordion = ({ title, children, initialOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <h3>{title}</h3>
        <FaChevronDown className={`accordion-icon ${isOpen ? "open" : ""}`} />
      </div>
      {isOpen && <div className="accordion-content">{children}</div>}
    </div>
  );
};

function CalibrationChart({
  title,
  chartData,
  theme,
  chartType,
  onHover,
  syncedHoverIndex,
  comparisonData,
  onRunFullAnalysis = null,
  onMarkStability = null,
  instrumentType = null,
  activeChartView,
  setActiveChartView,
}) {
  const chartRef = useRef(null);
  const [yAxisUnit, setYAxisUnit] = useState("voltage");
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsMenuRef = useRef(null);
  const [isStabilityOpen, setIsStabilityOpen] = useState(false);
  const stabilityMenuRef = useRef(null);
  const [hideUnstableReadings, setHideUnstableReadings] = useState(false);
  // Cycle filter: which N-cycle of the AC-DC sequence to render. `null` =
  // auto (live → currently-active cycle; otherwise the latest cycle in the
  // dataset). A user can pin a specific cycle via the chart options menu.
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [voltSigFigs, setVoltSigFigs] = useState(4);
  const [voltSigFigsError, setVoltSigFigsError] = useState("");
  const [ppmDecimalPlaces, setPpmDecimalPlaces] = useState(2);
  const [ppmDecimalPlacesError, setPpmDecimalPlacesError] = useState("");

  const [stabilityRange, setStabilityRange] = useState({
    type: "",
    start: 1,
    end: 1,
    mark_as: "unstable",
  });

  useEffect(() => {
    const primaryDataset = chartData?.datasets?.find(
      (ds) => ds.data && ds.data.length > 0
    );
    if (primaryDataset) {
      setStabilityRange((prev) => ({
        ...prev,
        type: primaryDataset.label,
        start: 1,
        end: primaryDataset.data.length,
      }));
    }
  }, [chartData]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        optionsMenuRef.current &&
        !optionsMenuRef.current.contains(event.target)
      ) {
        setIsOptionsOpen(false);
      }
      if (
        stabilityMenuRef.current &&
        !stabilityMenuRef.current.contains(event.target)
      ) {
        setIsStabilityOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [optionsMenuRef, stabilityMenuRef]);

  // Distinct cycle ordinals present across every dataset in chartData.
  // Treats untagged legacy readings as cycle 1 so older sessions still render.
  const availableCycles = useMemo(() => {
    const seen = new Set();
    (chartData?.datasets || []).forEach((ds) => {
      (ds.data || []).forEach((pt) => {
        const c = Number.isFinite(pt?.cycle) ? Number(pt.cycle) : 1;
        seen.add(c);
      });
    });
    return Array.from(seen).sort((a, b) => a - b);
  }, [chartData]);

  // Effective cycle: explicit user choice wins, else the latest cycle in
  // view (which during a live run is the currently-running one because
  // earlier cycles are already complete and later ones don't exist yet).
  const effectiveCycle = useMemo(() => {
    if (selectedCycle != null && availableCycles.includes(selectedCycle)) {
      return selectedCycle;
    }
    return availableCycles.length ? availableCycles[availableCycles.length - 1] : 1;
  }, [selectedCycle, availableCycles]);

  const { processedChartData, processedComparisonData } = useMemo(() => {
    const filterByCycle = (data) =>
      (data || []).filter((pt) => {
        const c = Number.isFinite(pt?.cycle) ? Number(pt.cycle) : 1;
        return c === effectiveCycle;
      });

    const processDatasets = (dataToProcess) => {
      if (!dataToProcess || !dataToProcess.datasets) return [];
      return dataToProcess.datasets.map((ds) => {
        // Filter to the chosen cycle first, then re-index so x is contiguous
        // within this cycle (mirrors the non-cycle behavior the chart had
        // for years).
        let processedData = filterByCycle(ds.data).map((point, index) => ({
          ...point,
          x: index + 1,
        }));

        if (hideUnstableReadings) {
          processedData = processedData
            .filter((point) => point.is_stable !== false)
            .map((point, index) => ({
              ...point,
              x: index + 1,
            }));
        }

        if (yAxisUnit === "ppm") {
          if (processedData.length === 0) return { ...ds, data: [] };
          // Reference mean for the PPM transform is computed over the
          // currently-selected cycle only — otherwise the deviation y-values
          // get pulled toward the cross-cycle mean which defeats the
          // purpose of cycle filtering.
          const cycleData = filterByCycle(ds.data);
          const originalMean =
            cycleData.reduce((acc, curr) => acc + curr.y, 0) /
            (cycleData.length || 1);

          return {
            ...ds,
            data: processedData.map((point) => ({
              ...point,
              y:
                originalMean === 0
                  ? 0
                  : ((point.y - originalMean) / Math.abs(originalMean)) * 1e6,
            })),
          };
        }
        return { ...ds, data: processedData };
      });
    };

    if (
      !chartData ||
      !chartData.datasets ||
      chartData.datasets.every((ds) => !ds.data || ds.data.length === 0)
    ) {
      return {
        processedChartData: { datasets: [] },
        processedComparisonData: [],
      };
    }

    const finalChartDatasets = processDatasets(chartData);
    const finalComparisonDatasets = processDatasets({
      datasets: comparisonData,
    });
    const allXLabels = finalChartDatasets.flatMap((ds) =>
      ds.data.map((d) => d.x)
    );
    const finalLabels = [...new Set(allXLabels)].sort((a, b) => a - b);

    return {
      processedChartData: {
        labels: finalLabels,
        datasets: finalChartDatasets,
      },
      processedComparisonData: finalComparisonDatasets,
    };
  }, [chartData, comparisonData, yAxisUnit, hideUnstableReadings, effectiveCycle]);

  const handleVoltSigFigChange = (e) => {
    const value = e.target.value;
    if (value === "") {
      setVoltSigFigs("");
      setVoltSigFigsError("Default precision will be used.");
      return;
    }
    const numValue = Number(value);
    if (!Number.isInteger(numValue)) {
      setVoltSigFigs(value);
      setVoltSigFigsError("Must be an integer.");
    } else if (numValue < 1 || numValue > 21) {
      setVoltSigFigs(numValue);
      setVoltSigFigsError("Range must be between 1 and 21.");
    } else {
      setVoltSigFigs(numValue);
      setVoltSigFigsError("");
    }
  };

  const handlePpmDecimalChange = (e) => {
    const value = e.target.value;
    if (value === "") {
      setPpmDecimalPlaces("");
      setPpmDecimalPlacesError("Default precision will be used.");
      return;
    }
    const numValue = Number(value);
    if (!Number.isInteger(numValue)) {
      setPpmDecimalPlaces(value);
      setPpmDecimalPlacesError("Must be an integer.");
    } else if (numValue < 0 || numValue > 15) {
      setPpmDecimalPlaces(numValue);
      setPpmDecimalPlacesError("Range must be between 0 and 15.");
    } else {
      setPpmDecimalPlaces(numValue);
      setPpmDecimalPlacesError("");
    }
  };

  const handleStabilityInputChange = (e) => {
    const { name, value } = e.target;
    setStabilityRange((prev) => ({ ...prev, [name]: value }));
  };

  const handleMarkStability = () => {
    if (onMarkStability) {
      onMarkStability(stabilityRange, instrumentType);
      setIsOptionsOpen(false);
    }
  };

  if (
    !chartData ||
    !chartData.datasets ||
    chartData.datasets.every((ds) => ds.data.length === 0)
  ) {
    return (
      <p style={{ textAlign: "center", padding: "20px" }}>
        No data available to display the chart.
      </p>
    );
  }

  const isDarkMode = theme === "dark";
  const textColor = isDarkMode ? "rgba(255, 255, 255, 0.85)" : "#333";
  const gridColor = isDarkMode
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.1)";
  const crosshairColor = isDarkMode
    ? "rgba(255, 255, 255, 0.5)"
    : "rgba(0, 0, 0, 0.5)";

  const unstableColor = "rgba(255, 0, 0, 1)";
  const unstableBgColor = "rgba(255, 0, 0, 1)";

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: { xAxisKey: "x", yAxisKey: "y" },
    onHover: (event, chartElement) => {
      if (onHover) {
        onHover(chartElement.length > 0 ? chartElement[0].index : null);
      }
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: textColor,
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 80, // Using boxWidth for spacing
          padding: 30,
        },
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          title: (tooltipItems) => {
            const point = tooltipItems[0]?.raw;
            const stableText = point?.is_stable === false ? " (Unstable)" : "";
            return `Sample #${point?.x || ""}${stableText}`;
          },
          label: () => "",
          footer: (tooltipItems) => {
            const activePoint = tooltipItems[0];
            if (!activePoint) return [];

            const dataIndex = activePoint.dataIndex;
            const datasetIndex = activePoint.datasetIndex;
            const rawPoint = activePoint.raw;
            const footerLines = [];
            const unitLabel = yAxisUnit === "ppm" ? "PPM" : "V";

            const finalVoltPrecision = (() => {
              const sigFigs = parseInt(voltSigFigs, 10);
              return !voltSigFigsError && !isNaN(sigFigs) ? sigFigs : 4;
            })();
            const finalPpmDecimals = (() => {
              const decimals = parseInt(ppmDecimalPlaces, 10);
              return !ppmDecimalPlacesError && !isNaN(decimals) ? decimals : 2;
            })();

            const formatValue = (val) =>
              yAxisUnit === "ppm"
                ? val.toFixed(finalPpmDecimals)
                : val.toPrecision(finalVoltPrecision);

            const mainDataset = processedChartData.datasets[datasetIndex];
            if (mainDataset) {
              const mainValue = mainDataset.data[dataIndex]?.y;
              if (mainValue !== undefined) {
                const chartTitle = title.includes("Standard")
                  ? "Standard Instrument"
                  : "Test Instrument";
                footerLines.push(
                  `${chartTitle}: ${formatValue(mainValue)} ${unitLabel}`
                );
              }
            }

            if (processedComparisonData && processedComparisonData.length > 0) {
              const mainLabel = mainDataset?.label;
              const comparisonDataset = processedComparisonData.find(
                (d) => d.label === mainLabel
              );
              const comparisonValue = comparisonDataset?.data[dataIndex]?.y;
              if (comparisonValue !== undefined) {
                const comparisonChartTitle = title.includes("Standard")
                  ? "Test Instrument"
                  : "Standard Instrument";
                footerLines.push(
                  `${comparisonChartTitle}: ${formatValue(
                    comparisonValue
                  )} ${unitLabel}`
                );
              }
            }

            const timestamp = rawPoint?.t;
            if (timestamp) {
              if (footerLines.length > 0) footerLines.push(" ");
              footerLines.push(`Date: ${timestamp.toLocaleDateString()}`);
              footerLines.push(`Time: ${timestamp.toLocaleTimeString()}`);
            }

            const cycleNum = Number.isFinite(rawPoint?.cycle) ? Number(rawPoint.cycle) : null;
            if (cycleNum != null) {
              footerLines.push(`Cycle: ${cycleNum}`);
            }

            return footerLines;
          },
        },
      },
      zoom: {
        pan: { enabled: true, mode: "xy" },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "xy",
        },
      },
      crosshair: { syncedHoverIndex, color: crosshairColor },
    },
    elements: {
      point: {
        radius: (context) => (context.raw?.is_stable === false ? 6 : 3),
        pointStyle: (context) =>
          context.raw?.is_stable === false ? "crossRot" : "circle",
        borderColor: (context) =>
          context.raw?.is_stable === false
            ? unstableColor
            : context.dataset.borderColor,
        backgroundColor: (context) =>
          context.raw?.is_stable === false
            ? unstableBgColor
            : context.dataset.backgroundColor,
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: yAxisUnit === "voltage" ? "Voltage (V)" : "Difference (PPM)",
          color: textColor,
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        ticks: {
          color: textColor,
          callback: (value) => {
            if (yAxisUnit === "ppm") {
              const decimals = parseInt(ppmDecimalPlaces, 10);
              if (!ppmDecimalPlacesError && !isNaN(decimals)) {
                return value.toFixed(decimals);
              }
              return value.toFixed(2);
            } else {
              const sigFigs = parseInt(voltSigFigs, 10);
              if (!voltSigFigsError && !isNaN(sigFigs)) {
                return value.toPrecision(sigFigs);
              }
              return value.toPrecision(4);
            }
          },
        },
        grid: { color: gridColor },
      },
      x: {
        title: { display: true, text: "Sample Number", color: textColor },
        ticks: { color: textColor },
        grid: { color: gridColor },
      },
    },
  };

  const handleResetZoom = () => chartRef.current?.resetZoom();
  const handleExportChart = () => {
    if (chartRef.current) {
      const link = document.createElement("a");
      link.download = `${title.replace(/\s+/g, "_") || "chart"}.png`;
      link.href = chartRef.current.toBase64Image("image/png", 1);
      link.click();
    }
  };

  const ChartComponent = chartType === "bar" ? Bar : Line;
  const availableMeasurementTypes = chartData.datasets
    .filter((ds) => ds.data && ds.data.length > 0)
    .map((ds) => ds.label);

  return (
    <div style={{ width: "100%", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div className="summary-table-header" style={{ paddingBottom: "15px" }}>
        <h4 style={{ color: textColor }}>{title}</h4>

        <div className="chart-header-actions">
          {onMarkStability && (
            <div className="chart-options-container" ref={stabilityMenuRef}>
              <button
                title="Update Reading Stability"
                className="chart-action-icon-button"
                onClick={() => setIsStabilityOpen((prev) => !prev)}
              >
                <FiActivity />
              </button>
              {isStabilityOpen && (
                <div className="chart-options-dropdown">
                  <Accordion
                    title="Update Reading Stability"
                    initialOpen={true}
                  >
                    <div className="chart-options-section">
                      <div className="chart-options-form-group checkbox-group">
                        <input
                          id="hideUnstableInput"
                          type="checkbox"
                          checked={hideUnstableReadings}
                          onChange={(e) =>
                            setHideUnstableReadings(e.target.checked)
                          }
                        />
                        <label htmlFor="hideUnstableInput">
                          Hide Unstable Readings
                        </label>
                      </div>
                      <div className="chart-options-form-group">
                        <label>Measurement Type</label>
                        <select
                          name="type"
                          value={stabilityRange.type}
                          onChange={handleStabilityInputChange}
                        >
                          {availableMeasurementTypes.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="chart-options-range-inputs">
                        <div className="chart-options-form-group">
                          <label>Start Sample</label>
                          <input
                            name="start"
                            type="number"
                            min="1"
                            value={stabilityRange.start}
                            onChange={handleStabilityInputChange}
                          />
                        </div>
                        <div className="chart-options-form-group">
                          <label>End Sample</label>
                          <input
                            name="end"
                            type="number"
                            min="1"
                            value={stabilityRange.end}
                            onChange={handleStabilityInputChange}
                          />
                        </div>
                      </div>
                      <div className="chart-options-form-group">
                        <label>Mark As</label>
                        <select
                          name="mark_as"
                          value={stabilityRange.mark_as}
                          onChange={handleStabilityInputChange}
                        >
                          <option value="unstable">Unstable</option>
                          <option value="stable">Stable</option>
                        </select>
                      </div>
                      <div
                        className="chart-options-form-group"
                        style={{ display: "flex", gap: "8px" }}
                      >
                        <button
                          className="button button-primary button-small"
                          onClick={() => {
                            handleMarkStability();
                            setIsStabilityOpen(false); // Close menu on apply
                          }}
                          style={{ flex: 1 }}
                        >
                          <FaCheck style={{ marginRight: "8px" }} />
                          Apply
                        </button>
                      </div>
                    </div>
                  </Accordion>
                </div>
              )}
            </div>
          )}

          <button
            title="Reset Zoom"
            className="chart-action-icon-button"
            onClick={handleResetZoom}
          >
            <TbZoomReset />
          </button>
          <button
            title="Export as PNG"
            className="chart-action-icon-button"
            onClick={handleExportChart}
          >
            <BsFiletypePng />
          </button>

          <div className="chart-options-container" ref={optionsMenuRef}>
            <button
              title="Chart Options"
              className="chart-options-button"
              onClick={() => setIsOptionsOpen((prev) => !prev)}
            >
              <FaCog />
            </button>
            {isOptionsOpen && (
              <div className="chart-options-dropdown">
                <Accordion title="Display Options" initialOpen={true}>
                  <div className="chart-options-section">

                    {setActiveChartView && (
                      <div className="chart-options-form-group">
                        <label>Data View</label>
                        <div className="unit-toggle">
                          <button
                            className={activeChartView === "calibration" ? "active" : ""}
                            onClick={() => setActiveChartView("calibration")}
                          >
                            Calibration
                          </button>
                          <button
                            className={activeChartView === "characterization" ? "active" : ""}
                            onClick={() => setActiveChartView("characterization")}
                          >
                            Characterization
                          </button>
                        </div>
                      </div>
                    )}

                    {availableCycles.length > 1 && (
                      <div className="chart-options-form-group">
                        <label>Cycle</label>
                        <div className="unit-toggle unit-toggle--wrap">
                          {availableCycles.map((c) => (
                            <button
                              key={c}
                              className={effectiveCycle === c ? "active" : ""}
                              onClick={() => setSelectedCycle(c)}
                              title={`Show readings from cycle ${c}`}
                            >
                              {c}
                            </button>
                          ))}
                          <button
                            className={selectedCycle == null ? "active" : ""}
                            onClick={() => setSelectedCycle(null)}
                            title="Track the latest cycle automatically (live)"
                          >
                            Auto
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="chart-options-form-group">
                      <label>Y-Axis Unit</label>
                      <div className="unit-toggle">
                        <button
                          className={yAxisUnit === "voltage" ? "active" : ""}
                          onClick={() => setYAxisUnit("voltage")}
                        >
                          Volts
                        </button>
                        <button
                          className={yAxisUnit === "ppm" ? "active" : ""}
                          onClick={() => setYAxisUnit("ppm")}
                        >
                          PPM
                        </button>
                      </div>
                    </div>
                    <div className="chart-options-form-group">
                      {yAxisUnit === "voltage" ? (
                        <>
                          <label htmlFor="voltSigFigsInput">
                            Y-Axis Sig Figs (Volts)
                          </label>
                          <input
                            id="voltSigFigsInput"
                            name="voltSigFigs"
                            type="number"
                            value={voltSigFigs}
                            onChange={handleVoltSigFigChange}
                            placeholder="e.g., 4"
                          />
                          {voltSigFigsError && (
                            <small
                              className="error-text"
                              style={{
                                color: "var(--status-bad)",
                                display: "block",
                                marginTop: "4px",
                              }}
                            >
                              {voltSigFigsError}
                            </small>
                          )}
                        </>
                      ) : (
                        <>
                          <label htmlFor="ppmDecimalInput">
                            Y-Axis Decimals (PPM)
                          </label>
                          <input
                            id="ppmDecimalInput"
                            name="ppmDecimals"
                            type="number"
                            value={ppmDecimalPlaces}
                            onChange={handlePpmDecimalChange}
                            placeholder="e.g., 2"
                          />
                          {ppmDecimalPlacesError && (
                            <small
                              className="error-text"
                              style={{
                                color: "var(--status-bad)",
                                display: "block",
                                marginTop: "4px",
                              }}
                            >
                              {ppmDecimalPlacesError}
                            </small>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Accordion>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="chart-canvas-wrapper">
        <ChartComponent
          ref={chartRef}
          options={options}
          data={processedChartData}
        />
      </div>
    </div>
  );
}

export default CalibrationChart;
