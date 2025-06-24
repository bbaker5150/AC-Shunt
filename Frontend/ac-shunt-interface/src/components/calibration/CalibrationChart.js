import React, { useRef } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register all necessary components and the new plugin
ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement, LineElement,
    Title, Tooltip, Legend, zoomPlugin
);

function CalibrationChart({ title, chartData, theme, chartType }) {
    const chartRef = useRef(null); // Create a ref to access the chart instance

    if (!chartData || !chartData.datasets || chartData.datasets.every(ds => ds.data.length === 0)) {
        return <p style={{ textAlign: 'center', padding: '20px' }}>No data available to display the chart.</p>;
    }

    const isDarkMode = theme === 'dark';
    const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#333';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
                labels: { color: textColor }
            },
            title: {
                display: true,
                text: title,
                color: textColor,
                font: { size: 18 }
            },
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'xy',
                },
                zoom: {
                    wheel: {
                        enabled: true,
                    },
                    pinch: {
                        enabled: true
                    },
                    mode: 'xy',
                }
            }
        },
        scales: {
            y: {
                beginAtZero: false,
                title: { display: true, text: 'Value', color: textColor },
                ticks: { color: textColor },
                grid: { color: gridColor }
            },
            x: {
                title: { display: true, text: chartType === 'bar' ? 'Measurement Type' : 'Sample Number', color: textColor },
                ticks: { color: textColor },
                grid: { color: gridColor }
            }
        }
    };

    const handleResetZoom = () => {
        if (chartRef.current) {
            chartRef.current.resetZoom();
        }
    };

    const ChartComponent = chartType === 'bar' ? Bar : Line;

    return (
        <div>
            <ChartComponent ref={chartRef} options={options} data={chartData} />
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button className="button button-secondary button-small" onClick={handleResetZoom}>
                    Reset Zoom
                </button>
            </div>
        </div>
    );
}

export default CalibrationChart;