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
import { FaCog, FaCalculator, FaChevronDown } from "react-icons/fa";
import { FaRightLeft } from "react-icons/fa6";
import { BsFiletypePng } from "react-icons/bs";
import { TbZoomReset } from "react-icons/tb";

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

const calculateRangeStats = (originalChartData, typeLabel, start, end) => {
  if (!originalChartData || !typeLabel || start > end || start < 1) return null;

  const targetDataset = originalChartData.datasets.find(
    (ds) => ds.label === typeLabel
  );
  if (!targetDataset || !targetDataset.data) return null;

  const startIndex = start - 1;
  const endIndex = end;

  if (startIndex < 0 || endIndex > targetDataset.data.length) return null;

  const dataSlice = targetDataset.data
    .slice(startIndex, endIndex)
    .filter((p) => p.is_stable !== false)
    .map((p) => p.y);
  if (dataSlice.length < 2) return null;

  const sum = dataSlice.reduce((acc, val) => acc + val, 0);
  const mean = sum / dataSlice.length;

  const sumSqDiff = dataSlice.reduce(
    (acc, val) => acc + Math.pow(val - mean, 2),
    0
  );
  const variance = sumSqDiff / (dataSlice.length - 1);
  const stdDevVolts = Math.sqrt(variance);
  const stdDevPpm = mean === 0 ? 0 : (stdDevVolts / Math.abs(mean)) * 1e6;

  return { stdDevVolts, stdDevPpm, mean };
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
}) {
  const chartRef = useRef(null);
  const [yAxisUnit, setYAxisUnit] = useState("voltage");
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsMenuRef = useRef(null);
  const [hideUnstableReadings, setHideUnstableReadings] = useState(false);
  const [voltSigFigs, setVoltSigFigs] = useState(4);
  const [voltSigFigsError, setVoltSigFigsError] = useState("");
  const [ppmDecimalPlaces, setPpmDecimalPlaces] = useState(2);
  const [ppmDecimalPlacesError, setPpmDecimalPlacesError] = useState("");
  const [analysisOptions, setAnalysisOptions] = useState({
    type: "",
    start: 1,
    end: 1,
  });
  const [analysisResult, setAnalysisResult] = useState(null);

  useEffect(() => {
    const primaryDataset = chartData?.datasets?.find(
      (ds) => ds.data && ds.data.length > 0
    );
    if (primaryDataset) {
      setAnalysisOptions({
        type: primaryDataset.label,
        start: 1,
        end: primaryDataset.data.length,
      });
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
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [optionsMenuRef]);

  const { processedChartData, processedComparisonData } = useMemo(() => {
    const processDatasets = (dataToProcess) => {
      if (!dataToProcess || !dataToProcess.datasets) return [];
      return dataToProcess.datasets.map((ds) => {
        let processedData = ds.data || [];

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
          const originalMean =
            (ds.data || []).reduce((acc, curr) => acc + curr.y, 0) /
            (ds.data.length || 1);

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
      processedChartData: { labels: finalLabels, datasets: finalChartDatasets },
      processedComparisonData: finalComparisonDatasets,
    };
  }, [chartData, comparisonData, yAxisUnit, hideUnstableReadings]);

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

  const handleAnalysisInputChange = (e) => {
    const { name, value } = e.target;
    setAnalysisOptions((prev) => ({ ...prev, [name]: value }));
    setAnalysisResult(null);
  };

  const handleCalculateRange = () => {
    const { type, start, end } = analysisOptions;
    const result = calculateRangeStats(
      chartData,
      type,
      parseInt(start, 10),
      parseInt(end, 10)
    );
    setAnalysisResult(result);
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
          pointStyle: 'circle',
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

            const timestamp =
              chartData.datasets[datasetIndex]?.data[dataIndex]?.t;
            if (timestamp) {
              if (footerLines.length > 0) footerLines.push(" ");
              footerLines.push(`Time: ${timestamp.toLocaleTimeString()}`);
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
        radius: (context) => {
          return context.raw?.is_stable === false ? 6 : 3;
        },
        pointStyle: (context) => {
          if (context.raw?.is_stable === false) {
            return "crossRot";
          }
          return "circle";
        },
        borderColor: (context) => {
          if (context.raw?.is_stable === false) {
            return unstableColor;
          }
          return context.dataset.borderColor;
        },
        backgroundColor: (context) => {
          if (context.raw?.is_stable === false) {
            return unstableBgColor;
          }
          return context.dataset.backgroundColor;
        }
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: yAxisUnit === "voltage" ? "Voltage (V)" : "Difference (PPM)",
          color: textColor,
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
    <div>
      <div className="summary-table-header" style={{ paddingBottom: "15px" }}>
        <h4 style={{ color: textColor }}>{title}</h4>
        
        <div className="chart-header-actions">
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
  
                <Accordion title="Range Analysis">
                  <div className="chart-options-section">
                    <div className="chart-options-form-group">
                      <label>Measurement Type</label>
                      <select
                        name="type"
                        value={analysisOptions.type}
                        onChange={handleAnalysisInputChange}
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
                          value={analysisOptions.start}
                          onChange={handleAnalysisInputChange}
                        />
                      </div>
                      <div className="chart-options-form-group">
                        <label>End Sample</label>
                        <input
                          name="end"
                          type="number"
                          value={analysisOptions.end}
                          onChange={handleAnalysisInputChange}
                        />
                      </div>
                    </div>
                    <div
                      className="chart-options-form-group"
                      style={{ display: "flex", gap: "8px" }}
                    >
                      <button
                        className="button button-secondary button-small"
                        onClick={handleCalculateRange}
                        style={{ flex: 1 }}
                      >
                        <FaCalculator style={{ marginRight: "8px" }} />
                        Calculate
                      </button>
                      {onRunFullAnalysis && (
                        <button
                          className="button button-primary button-small"
                          onClick={() => onRunFullAnalysis(analysisOptions)}
                          style={{ flex: 1 }}
                          title="Run a full analysis on the selected range and view detailed results in a new window."
                        >
                          <FaRightLeft style={{ marginRight: "8px" }} />
                          Analyze
                        </button>
                      )}
                    </div>
                    {analysisResult && (
                      <div className="chart-options-result">
                        <strong>Std Dev:</strong>{" "}
                        {analysisResult.stdDevVolts.toPrecision(4)} V (
                        {analysisResult.stdDevPpm.toFixed(2)} PPM)
                        <br />
                        <strong>Mean:</strong>{" "}
                        {analysisResult.mean.toPrecision(8)} V
                      </div>
                    )}
                  </div>
                </Accordion>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: "350px" }}>
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