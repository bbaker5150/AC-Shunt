import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { API_BASE_URL, AVAILABLE_FREQUENCIES } from '../../constants/constants';

const ShuntCorrections = ({ dataType = 'correction', showNotification }) => {
    const [data, setData] = useState({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingData, setEditingData] = useState({});

    const endpoint = dataType === 'correction' ? 'correction' : 'uncertainty';
    const valueKey = dataType === 'correction' ? 'correction' : 'uncertainty';
    const headerTitle = dataType === 'correction' ? 'Corrections' : 'Uncertainties';

    const fetchData = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/${endpoint}/`);
            setData(response.data);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        }
    }, [endpoint]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = () => {
        setEditingData(JSON.parse(JSON.stringify(data)));
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleCellChange = useCallback((rangeKey, currentKey, freqKey, newValue) => {
        setEditingData(prev => ({
            ...prev,
            [rangeKey]: {
                ...prev[rangeKey],
                [currentKey]: {
                    ...(prev[rangeKey]?.[currentKey]),
                    [freqKey]: newValue
                }
            }
        }));
    }, []);

    const handleSaveChanges = async () => {
        const allData = [];
        Object.keys(editingData).forEach(rangeKey => {
            Object.keys(editingData[rangeKey]).forEach(currentKey => {
                Object.keys(editingData[rangeKey][currentKey]).forEach(freqKey => {
                    const value = editingData[rangeKey][currentKey][freqKey];
                    if (value !== null) {
                        const payload = {
                            range: parseFloat(rangeKey),
                            current: parseFloat(currentKey),
                            frequency: parseFloat(freqKey),
                            [valueKey]: value === '' ? '' : parseFloat(value),
                        };
                        allData.push(payload);
                    }
                });
            });
        });

        try {
            await axios.post(`${API_BASE_URL}/${endpoint}/`, allData);
            showNotification("Saved successfully.");
        } catch (err) {
            console.error("Save failed:", err);
        }

        fetchData();
        handleCloseModal();
    };

    const handleReset = async () => {
        try {
            await axios.post(`${API_BASE_URL}/${endpoint}/reset/`);
            showNotification("Data has been reset to default values.");
        } catch (err) {
            console.error("Save failed:", err);
        }
        fetchData();
        handleCloseModal();
    };

    return (
        <>
            <button onClick={handleOpenModal} className="button button-primary">
                View {headerTitle}
            </button>
            <DataModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                dataToEdit={editingData}
                onCellChange={handleCellChange}
                onSave={handleSaveChanges}
                onReset={handleReset}
                headerTitle={headerTitle}
            />
        </>
    );
};

const DataModal = ({ isOpen, onClose, dataToEdit, onCellChange, onSave, onReset, headerTitle }) => {
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    if (!isOpen) return null;

    const handleOpenConfirmModal = () => {
        setIsConfirmModalOpen(true);
    };

    const handleCloseConfirmModal = () => {
        setIsConfirmModalOpen(false);
    };

    const handleConfirmAndReset = () => {
        handleCloseConfirmModal();
        onReset();
    };

    const confirmModal = isConfirmModalOpen && (
        <div className="reset-modal-overlay">
            <div className="reset-modal-content">
                <h3>Reset to Default Values?</h3>
                <p>This action will permanently replace all data with default values and cannot be undone.</p>
                <div className="button-group">
                    <button className="button button-secondary" onClick={handleCloseConfirmModal}>Cancel</button>
                    <button className="button button-danger" onClick={handleConfirmAndReset}>Confirm Reset</button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="modal-overlay">
            <div className="data-table-modal-content">
                <div className="data-table-modal-header">
                    <h2>{headerTitle}</h2>
                    <button onClick={onClose} className="data-table-close-button">&times;</button>
                </div>
                <div className="data-table-modal-body">
                    <DataTable dataToEdit={dataToEdit} onCellChange={onCellChange} />
                </div>
                <div className="data-table-modal-footer">
                    <button className="button button-success" onClick={onSave}>Save Changes</button>
                    <button className="button button-secondary" onClick={onClose}>Cancel</button>
                    <button className="button button-danger" onClick={handleOpenConfirmModal}>Reset</button>
                    {ReactDOM.createPortal(confirmModal, document.body)}
                </div>
            </div>
        </div>
    );
};

const DataInput = React.memo(({ value, rangeKey, currentKey, freqKey, onCellChange }) => {
    const handleChange = (e) => {
        onCellChange(rangeKey, currentKey, freqKey, e.target.value);
    };

    return (
        <input
            type="number"
            step="any"
            className="data-table-input"
            value={value ?? ''}
            onChange={handleChange}
        />
    );
});

const DataTable = React.memo(({ dataToEdit, onCellChange }) => {
    const allFrequenciesText = AVAILABLE_FREQUENCIES.map(frequency => frequency.text);
    return (
        <div className="data-table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <th className="data-table-header">Range</th>
                        <th className="data-table-header">Input</th>
                        {allFrequenciesText.map(freqText => (
                            <th key={freqText} className="data-table-header data-table-header-cell">{freqText}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(dataToEdit).map(([rangeKey, rangeValue]) => (
                        <React.Fragment key={rangeKey}>
                            {Object.entries(rangeValue).map(([currentKey, currentValue], currentIdx) => (
                                <tr key={`${rangeKey}-${currentKey}`}>
                                    {currentIdx === 0 && (
                                        <td rowSpan={Object.keys(rangeValue).length} className="data-table-row-header data-table-cell">{rangeKey} A</td>
                                    )}
                                    <td className="data-table-row-header data-table-cell">{currentKey} A</td>
                                    {AVAILABLE_FREQUENCIES.map(freqObj => {
                                        const freqLookupKey = String(freqObj.value);
                                        const value = currentValue?.[freqLookupKey] ?? '';
                                        return (
                                            <td key={`${rangeKey}-${currentKey}-${freqLookupKey}`} className="data-table-cell">
                                                <DataInput value={value} onCellChange={onCellChange} rangeKey={rangeKey} currentKey={currentKey} freqKey={freqLookupKey} />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
});

export default ShuntCorrections;