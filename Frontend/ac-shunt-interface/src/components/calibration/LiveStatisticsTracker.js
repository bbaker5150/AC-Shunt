import React, { useState, useMemo } from 'react';

// A helper function to calculate statistics from an array of reading objects
const calculateStats = (data) => {
    // Ensure we have enough data points to calculate standard deviation
    if (!data || data.length < 2) {
        return { mean: null, stdDev: null, stdDevPpm: null, count: data?.length || 0 };
    }
    const values = data.map(p => p.y);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (values.length - 1);
    const stdDev = Math.sqrt(variance);
    // Also calculate the standard deviation in PPM
    const stdDevPpm = mean === 0 ? 0 : (stdDev / Math.abs(mean)) * 1e6;

    return { mean, stdDev, stdDevPpm, count: values.length };
};

// Define the measurement types to be displayed
const READING_TYPES = [
    { key: 'ac_open', label: 'AC Open' },
    { key: 'dc_pos', label: 'DC+' },
    { key: 'dc_neg', label: 'DC-' },
    { key: 'ac_close', label: 'AC Close' }
];

// Reusable card component for displaying stats of a single measurement type
const StatCard = ({ title, stats, unit, isActive }) => (
    <div className={`stat-card ${isActive ? 'active' : ''}`}>
        <h6>{title}</h6>
        <div className="stat-details">
            <div>
                <strong>Count:</strong>
                <span>{stats.count}</span>
            </div>
            {/* Conditionally render the stats based on the selected unit */}
            {unit === 'V' ? (
                <>
                    <div>
                        <strong>Mean:</strong>
                        <span>{stats.mean !== null ? `${stats.mean.toPrecision(8)} V` : '---'}</span>
                    </div>
                    <div>
                        <strong>Std Dev:</strong>
                        <span>{stats.stdDev !== null ? `${stats.stdDev.toPrecision(4)} V` : '---'}</span>
                    </div>
                </>
            ) : (
                <>
                    <div>
                        <strong>Std Dev:</strong>
                        <span className="stat-value-ppm">{stats.stdDevPpm !== null ? `${stats.stdDevPpm.toFixed(2)} PPM` : '---'}</span>
                    </div>
                    <div>
                        <strong className="reference-mean">Ref Mean:</strong>
                        <span>{stats.mean !== null ? `${stats.mean.toPrecision(8)} V` : '---'}</span>
                    </div>
                </>
            )}
        </div>
    </div>
);


// The main tracker component, now functioning as a collapsible accordion
function LiveStatisticsTracker({ title, readings, activeStage }) {
    const [isOpen, setIsOpen] = useState(false); // Default to collapsed
    const [unit, setUnit] = useState('PPM'); // Default to PPM

    const stats = useMemo(() => {
        const calculated = {};
        READING_TYPES.forEach(({ key }) => {
            calculated[key] = calculateStats(readings[key]);
        });
        return calculated;
    }, [readings]);

    // Filter to get only the types that have readings
    const availableStats = READING_TYPES.filter(({ key }) => stats[key]?.count > 0);

    // Don't render the component at all if there are no stats to show
    if (availableStats.length === 0) {
        return null;
    }

    return (
        <div className="accordion-card" style={{ marginTop: '20px' }}>
            <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
                <h4>{title}</h4>
                <div className="header-controls">
                    {/* Unit Toggle now applies to the whole card's context */}
                    <div className="unit-toggle" onClick={(e) => e.stopPropagation()}>
                        <button title="Show Absolute Units (Volts)" className={unit === 'V' ? 'active' : ''} onClick={() => setUnit('V')}>V</button>
                        <button title="Show Relative Deviation (PPM)" className={unit === 'PPM' ? 'active' : ''} onClick={() => setUnit('PPM')}>PPM</button>
                    </div>
                    <span className={`accordion-icon ${isOpen ? 'open' : ''}`}>▼</span>
                </div>
            </div>
            {isOpen && (
                <div className="accordion-content">
                    <div className="stats-grid">
                        {availableStats.map(({ key, label }) => (
                            <StatCard
                                key={key}
                                title={label}
                                stats={stats[key]}
                                isActive={activeStage === key}
                                unit={unit} // Pass the selected unit down to the card
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default LiveStatisticsTracker;