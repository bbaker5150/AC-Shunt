import React, { useState } from 'react';
import { AVAILABLE_FREQUENCIES } from '../../constants/constants';

const CorrectionTableInput = ({ value, rangeKey, currentKey, freqKey }) => {
    const [localValue, setLocalValue] = useState(value ?? '');

    const handleChange = (e) => {
        setLocalValue(e.target.value);
    };

    return (
        <input
            type="number"
            step="any"
            className="correction-input"
            data-range={rangeKey}
            data-current={currentKey}
            data-freq={freqKey}
            value={localValue}
            onChange={handleChange}
        />
    );
};

const CorrectionTable = React.memo(({ dataToEdit, onCellChange }) => {
    const allFrequenciesText = AVAILABLE_FREQUENCIES.map(frequency => frequency.text);
    return (
        <table className="correction-table">
            <thead>
                <tr>
                    <th className="correction-table-header">Range</th>
                    <th className="correction-table-header">Input</th>
                    {allFrequenciesText.map(freqText => (
                        <th key={freqText} className="correction-table-header correction-table-cell">{freqText}</th>))}
                </tr>
            </thead>
            <tbody>
                {Object.entries(dataToEdit).map(([rangeKey, rangeValue]) => (
                    <React.Fragment key={rangeKey}>
                        {Object.entries(rangeValue).map(([currentKey, currentValue], currentIdx) => (
                            <tr key={`${rangeKey}-${currentKey}`}>
                                {currentIdx === 0 && (
                                    <td rowSpan={Object.keys(rangeValue).length} className="correction-table-row-header correction-table-cell" > {rangeKey} A </td>
                                )}
                                <td className="correction-table-row-header correction-table-cell"> {currentKey} A </td>
                                {AVAILABLE_FREQUENCIES.map(freqObj => {
                                    const freqLookupKey = String(freqObj.value);
                                    const value = currentValue[freqLookupKey] !== undefined ? currentValue[freqLookupKey] : '';
                                    return (
                                        <td key={`${rangeKey}-${currentKey}-${freqLookupKey}`} className="correction-table-cell">
                                            <CorrectionTableInput value={value} onCellChange={onCellChange} rangeKey={rangeKey} currentKey={currentKey} freqKey={freqLookupKey} />
                                        </td>
                                    );
                                })}
                            </tr>))}
                    </React.Fragment>))}
            </tbody>
        </table>
    );
});

export { CorrectionTable }