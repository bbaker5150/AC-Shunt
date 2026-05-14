import React, { useState, useMemo } from 'react';

const calculateStats = (data) => {
    if (!data || data.length === 0) {
        return { mean: null, stdDev: null, stdDevPpm: null, count: 0 };
    }

    const stableData = data.filter(p => p.is_stable !== false);
    const stableCount = stableData.length;

    if (stableCount < 2) {
        const mean = stableCount > 0 ? stableData[0].y : null;
        return { mean, stdDev: null, stdDevPpm: null, count: stableCount };
    }

    const values = stableData.map(p => p.y);

    // 2. Use Welford's Algorithm here as well
    let mean = 0;
    let M2 = 0;
    values.forEach((val, index) => {
        const delta = val - mean;
        mean += delta / (index + 1);
        M2 += delta * (val - mean);
    });

    const variance = M2 / (values.length - 1);
    const stdDev = Math.sqrt(variance);
    const stdDevPpm = mean === 0 ? 0 : (stdDev / Math.abs(mean)) * 1e6;

    return { mean, stdDev, stdDevPpm, count: stableCount };
};

const READING_TYPES = [
    { key: 'ac_open', label: 'AC Open' },
    { key: 'dc_pos', label: 'DC+' },
    { key: 'dc_neg', label: 'DC-' },
    { key: 'ac_close', label: 'AC Close' }
];

const StatCard = ({ title, stats, unit, isActive }) => (
    <div className={`stat-card ${isActive ? 'active' : ''}`}>
        <h6>{title}</h6>
        <div className="stat-details">
            <div>
                <strong>Count:</strong>
                <span>{stats.count}</span>
            </div>
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

function LiveStabilityTracker({ title, readings, activeStage, activeCycle = null }) {
    const [isOpen, setIsOpen] = useState(false);
    const [unit, setUnit] = useState('PPM');

    // Restrict the stats to the cycle currently being captured. Earlier
    // cycles linger in the readings array (so the chart cycle-picker can
    // still display them) but the live tracker should reflect ONLY what's
    // in flight right now — otherwise std-dev gets inflated by cross-cycle
    // variation that's already accounted for at the pair level (u_A).
    //
    // When activeCycle is null (legacy single-pass, characterization, or
    // an idle chart), pass everything through unchanged.
    const cycleReadings = useMemo(() => {
        if (activeCycle == null) return readings || {};
        const filtered = {};
        Object.entries(readings || {}).forEach(([stageKey, list]) => {
            filtered[stageKey] = (list || []).filter((p) => {
                const c = Number.isFinite(p?.cycle) ? Number(p.cycle) : 1;
                return c === activeCycle;
            });
        });
        return filtered;
    }, [readings, activeCycle]);

    const stats = useMemo(() => {
        const calculated = {};
        READING_TYPES.forEach(({ key }) => {
            calculated[key] = calculateStats(cycleReadings[key]);
        });
        return calculated;
    }, [cycleReadings]);

    const availableStats = READING_TYPES.filter(({ key }) => stats[key]?.count > 0);

    if (availableStats.length === 0) {
        return null;
    }

    return (
        <div className="accordion-card" style={{ marginTop: '20px' }}>
            <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
                <h4>
                    {title}
                    {activeCycle != null && (
                        <span className="accordion-header-cycle">Cycle {activeCycle}</span>
                    )}
                </h4>
                <div className="header-controls">
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
                                unit={unit}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default LiveStabilityTracker;