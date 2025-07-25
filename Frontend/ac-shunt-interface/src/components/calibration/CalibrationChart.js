import React, { useRef } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

// Custom plugin to draw a vertical crosshair line
const crosshairPlugin = {
    id: 'crosshair',
    afterDraw: (chart, args, options) => {
        const { syncedHoverIndex } = options;
        if (syncedHoverIndex === null || syncedHoverIndex === undefined) {
            return;
        }
        const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
        const xCoord = x.getPixelForValue(syncedHoverIndex); // Use the 0-based index

        if (xCoord >= left && xCoord <= right) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xCoord, top);
            ctx.lineTo(xCoord, bottom);
            ctx.lineWidth = 1;
            ctx.strokeStyle = options.color || 'rgba(150, 150, 150, 0.7)';
            ctx.stroke();
            ctx.restore();
        }
    }
};

ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement, LineElement,
    Title, Tooltip, Legend, zoomPlugin, crosshairPlugin
);

function CalibrationChart({ title, chartData, theme, chartType, onHover, syncedHoverIndex, comparisonData }) {
    const chartRef = useRef(null);

    if (!chartData || !chartData.datasets || chartData.datasets.every(ds => ds.data.length === 0)) {
        return <p style={{ textAlign: 'center', padding: '20px' }}>No data available to display the chart.</p>;
    }

    const isDarkMode = theme === 'dark';
    const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#333';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const crosshairColor = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        parsing: { xAxisKey: 'x', yAxisKey: 'y' },
        onHover: (event, chartElement) => {
            if (onHover) {
                onHover(chartElement.length > 0 ? chartElement[0].index : null);
            }
        },
        plugins: {
            legend: { position: 'top', labels: { color: textColor } },
            title: { display: true, text: title, color: textColor, font: { size: 18 } },
            tooltip: {
                callbacks: {
                    title: (tooltipItems) => `Sample #${tooltipItems[0]?.raw?.x || ''}`,
                    label: () => '', // All data is now shown in the footer.
                    footer: (tooltipItems) => {
                        const activePoint = tooltipItems[0];
                        if (!activePoint) return [];

                        const dataIndex = activePoint.dataIndex;
                        const datasetIndex = activePoint.datasetIndex;
                        const footerLines = [];

                        // --- Data from the current chart ---
                        const currentChartDatasets = activePoint.chart.data.datasets;
                        const currentDataset = currentChartDatasets[datasetIndex];
                        const currentValue = currentDataset.data[dataIndex]?.y;
                        const currentLabel = currentDataset.label;
                        
                        const currentChartTitle = title.includes('Standard') ? 'Standard Instrument' : 'Test Instrument';
                        if (currentValue !== undefined) {
                            footerLines.push(`${currentChartTitle}: ${currentValue.toPrecision(8)} V`);
                        }

                        // --- Data from the comparison chart ---
                        if (comparisonData) {
                            // Find the dataset in the other chart that has the same label
                            const comparisonDataset = comparisonData.find(d => d.label === currentLabel);
                            if (comparisonDataset) {
                                const comparisonValue = comparisonDataset.data[dataIndex]?.y;
                                if (comparisonValue !== undefined) {
                                    const comparisonChartTitle = title.includes('Standard') ? 'Test Instrument' : 'Standard Instrument';
                                    footerLines.push(`${comparisonChartTitle}: ${comparisonValue.toPrecision(8)} V`);
                                }
                            }
                        }
                        
                        // --- Timestamp ---
                        const timestamp = activePoint?.raw?.t;
                        if (timestamp) {
                            footerLines.push(' ', `Time: ${timestamp.toLocaleTimeString()}`);
                        }

                        return footerLines;
                    }
                }
            },
            zoom: {
                pan: { enabled: true, mode: 'xy' },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
            },
            crosshair: { syncedHoverIndex, color: crosshairColor }
        },
        scales: {
            y: {
                beginAtZero: false,
                title: { display: true, text: 'Voltage (V)', color: textColor },
                ticks: { color: textColor },
                grid: { color: gridColor }
            },
            x: {
                title: { display: true, text: 'Sample Number', color: textColor },
                ticks: { color: textColor },
                grid: { color: gridColor }
            }
        }
    };

    const handleResetZoom = () => chartRef.current?.resetZoom();
    const handleExportChart = () => {
        if (chartRef.current) {
            const link = document.createElement('a');
            link.download = `${title.replace(/\s+/g, '_') || 'chart'}.png`;
            link.href = chartRef.current.toBase64Image('image/png', 1);
            link.click();
        }
    };

    const ChartComponent = chartType === 'bar' ? Bar : Line;

    return (
        <div>
            <div style={{ height: '350px' }}>
                <ChartComponent ref={chartRef} options={options} data={chartData} />
            </div>
            <div style={{ textAlign: 'center', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button className="button button-secondary button-small" onClick={handleResetZoom}>Reset Zoom</button>
                <button className="button button-secondary button-small" onClick={handleExportChart}>Export as PNG</button>
            </div>
        </div>
    );
}

export default CalibrationChart;