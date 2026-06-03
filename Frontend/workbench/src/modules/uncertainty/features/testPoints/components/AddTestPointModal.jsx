import * as math from 'mathjs';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom'; // Import ReactDOM for Portals
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faPlus, faTrashAlt, faGripHorizontal } from '@fortawesome/free-solid-svg-icons';
import { unitSystem, unitCategories } from '../../../utils/uncertaintyMath';
import NotificationModal from '../../../components/modals/NotificationModal';

// --- Custom Styles ---
const customSelectStyles = {
    menuPortal: (base) => ({ ...base, zIndex: 99999 }),
    menu: (base) => ({ ...base, zIndex: 99999 }),
    control: (base) => ({
        ...base,
        minHeight: '38px',
        height: '38px',
    }),
    valueContainer: (base) => ({
        ...base,
        height: '38px',
        padding: '0 8px',
        display: 'flex',
        alignItems: 'center'
    }),
    input: (base) => ({
        ...base,
        margin: 0,
        padding: 0
    }),
    indicatorsContainer: (base) => ({
        ...base,
        height: '38px'
    })
};

const SymbolButton = ({ onSymbolClick, symbol, title }) => (
    <button
        type="button"
        className="symbol-button"
        title={title || `Insert ${symbol}`}
        onClick={() => onSymbolClick(symbol)}
    >
        {symbol.replace('()', '( )')}
    </button>
);

const AddTestPointModal = ({ isOpen, onClose, onSave, initialData, hasExistingPoints, previousTestPointData = null }) => {
    // --- Floating Window State ---
    const [position, setPosition] = useState(() => {
        if (typeof window === 'undefined') return { x: 0, y: 0 };
        return { 
            x: Math.max(0, (window.innerWidth - 800) / 2), 
            y: Math.max(0, (window.innerHeight - 800) / 2) 
        };
    });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                });
            }
        };
        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]);


    const getInitialFormData = () => ({
        section: '',
        paramName: '', paramValue: '', paramUnit: '',
        qualName: 'Frequency', qualValue: '', qualUnit: 'kHz',
        measurementType: 'direct',
        equationString: '',
        variableMappings: {},
    });

    const [formData, setFormData] = useState(getInitialFormData());
    const [hasQualifier, setHasQualifier] = useState(false);
    const [notification, setNotification] = useState(null);
    const [equationVariables, setEquationVariables] = useState([]);

    const equationInputRef = useRef(null);
    const [cursorPos, setCursorPos] = useState(null);
    const [isSymbolMenuOpen, setIsSymbolMenuOpen] = useState(false);
    const symbolButtonRef = useRef(null);
    const symbolMenuRef = useRef(null);

    const symbolCategories = {
        'Operators': [
            { symbol: '+', title: 'Add' },
            { symbol: '-', title: 'Subtract' },
            { symbol: '*', title: 'Multiply' },
            { symbol: '/', title: 'Divide' },
            { symbol: '^', title: 'Power' },
            { symbol: '()', title: 'Parentheses' },
            { symbol: '%', title: 'Percent (e.g., 5%)' },
            { symbol: '!', title: 'Factorial (e.g., 5!)' },
        ],
        'Functions': [
            { symbol: 'sqrt()', title: 'Square Root' },
            { symbol: 'abs()', title: 'Absolute Value' },
            { symbol: 'log()', title: 'Log (base 10)' },
            { symbol: 'ln()', title: 'Natural Log (base e)' },
            { symbol: 'exp()', title: 'Exponential (e^x)' },
            { symbol: 'mod()', title: 'Modulus (a mod b)' },
        ],
        'Trigonometry': [
            { symbol: 'sin()', title: 'Sine' },
            { symbol: 'cos()', title: 'Cosine' },
            { symbol: 'tan()', title: 'Tangent' },
            { symbol: 'asin()', title: 'Arcsine' },
            { symbol: 'acos()', title: 'Arccosine' },
            { symbol: 'atan()', title: 'Arctangent' },
        ],
        'Greek': [
            { symbol: 'α', title: 'Alpha' },
            { symbol: 'β', title: 'Beta' },
            { symbol: 'γ', title: 'Gamma' },
            { symbol: 'Δ', title: 'Delta (upper)' },
            { symbol: 'δ', title: 'Delta (lower)' },
            { symbol: 'ε', title: 'Epsilon' },
            { symbol: 'θ', title: 'Theta' },
            { symbol: 'λ', title: 'Lambda' },
            { symbol: 'μ', title: 'Mu' },
            { symbol: 'ρ', title: 'Rho' },
            { symbol: 'σ', title: 'Sigma' },
            { symbol: 'τ', title: 'Tau' },
            { symbol: 'Φ', title: 'Phi (upper)' },
            { symbol: 'φ', title: 'Phi (lower)' },
            { symbol: 'Ω', title: 'Omega (upper)' },
            { symbol: 'ω', title: 'Omega (lower)' },
        ],
        'Constants & Other': [
            { symbol: 'pi', title: 'Constant Pi' },
            { symbol: 'e', title: 'Constant e' },
            { symbol: 'i', title: 'Imaginary Unit' },
            { symbol: 'Infinity', title: 'Infinity' },
            { symbol: '∠', title: 'Angle (Phasor)' },
            { symbol: '°', title: 'Degrees' },
        ]
    };

    // --- Dynamic Unit Options Generation ---
    const groupedUnitOptions = useMemo(() => {
        const allSupportedUnits = Object.keys(unitSystem.units);
        const options = [];
        const usedUnits = new Set();

        // 1. Map defined categories
        Object.entries(unitCategories).forEach(([category, units]) => {
            const validUnits = units.filter(u => allSupportedUnits.includes(u));
            if (validUnits.length > 0) {
                options.push({
                    label: category,
                    options: validUnits.map(u => {
                        usedUnits.add(u);
                        return { value: u, label: u };
                    })
                });
            }
        });

        // 2. Catch "Other"
        const leftovers = allSupportedUnits
            .filter(u => !usedUnits.has(u))
            .sort()
            .map(u => ({ value: u, label: u }));

        if (leftovers.length > 0) {
            options.push({ label: "Other", options: leftovers });
        }

        return options;
    }, []);

    const updateEquationVariables = (equation) => {
        if (!equation) {
            setEquationVariables([]);
            setFormData(prev => ({ ...prev, variableMappings: {} }));
            return;
        }

        let expressionToParse = equation.trim(); 
        const equalsIndex = expressionToParse.indexOf('=');
        if (equalsIndex !== -1) {
             if (equalsIndex < expressionToParse.length - 1) {
                 expressionToParse = expressionToParse.substring(equalsIndex + 1).trim();
             } else {
                 expressionToParse = '';
             }
        }

        if (!expressionToParse) { 
            setEquationVariables([]);
            setFormData(prev => ({ ...prev, variableMappings: {} }));
            return;
        }

        try {
            const node = math.parse(expressionToParse); 
            const variables = new Set();
            node.traverse(function (node, path, parent) {
                if (node.isSymbolNode && !math[node.name] && !['e', 'pi', 'i'].includes(node.name.toLowerCase())) {
                    variables.add(node.name);
                }
            });
            const sortedVars = Array.from(variables).sort();
            setEquationVariables(sortedVars);

            setFormData(prev => {
                const newMappings = {};
                sortedVars.forEach(v => {
                    newMappings[v] = prev.variableMappings[v] || '';
                });
                return { ...prev, variableMappings: newMappings };
            });

        } catch (error) {
            setEquationVariables([]);
            setFormData(prev => ({ ...prev, variableMappings: {} }));
        }
    }

    useEffect(() => {
        if (cursorPos !== null && equationInputRef.current) {
            equationInputRef.current.focus();
            equationInputRef.current.setSelectionRange(cursorPos, cursorPos);
            setCursorPos(null); 
        }
    }, [cursorPos, formData.equationString]); 

    useEffect(() => {
        function handleClickOutside(event) {
            if (
                symbolMenuRef.current &&
                !symbolMenuRef.current.contains(event.target) &&
                symbolButtonRef.current &&
                !symbolButtonRef.current.contains(event.target)
            ) {
                setIsSymbolMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [symbolMenuRef, symbolButtonRef]);

    useEffect(() => {
        if (isOpen) {
            // MERGE LOGIC:
            // 1. Start with previous point data (to copy Section, Param Name, etc.)
            // 2. Override with specific initialData (specifically UUT IDs)
            // 3. Reset defaults if neither exist

            const baseData = previousTestPointData || {};
            const overrideData = initialData || {};

            // Helper: prefer override, then base, then default
            const getVal = (path, def = '') => {
                // Simple helper for top-level props
                return overrideData[path] !== undefined ? overrideData[path] : (baseData[path] !== undefined ? baseData[path] : def);
            };

            // Deep helper for testPointInfo
            const getTpInfo = (key, subKey, def = '') => {
                 const overrideVal = overrideData.testPointInfo?.[key]?.[subKey];
                 if (overrideVal !== undefined) return overrideVal;
                 
                 const baseVal = baseData.testPointInfo?.[key]?.[subKey];
                 if (baseVal !== undefined) return baseVal;
                 
                 return def;
            };

            // Determine if we are editing a full existing point (has ID)
            const isFullEdit = !!overrideData.id; 

            // If specifically editing a point (overrideData has ID), use it strictly.
            // If creating NEW (no ID), merge overrideData (UUTs) on top of baseData (Previous Point).
            const source = isFullEdit ? overrideData : { ...baseData, ...overrideData };
            
            // Logic for Qualifier existence
            const qualExists = !!source.testPointInfo?.qualifier?.value;
            setHasQualifier(qualExists);

            const initialMappings = source.variableMappings || {};
            
            setFormData({
                section: source.section || '',
                paramName: source.testPointInfo?.parameter?.name || '',
                // If creating new, clear the value. If editing, keep it.
                paramValue: isFullEdit ? (source.testPointInfo?.parameter?.value || '') : '', 
                paramUnit: source.testPointInfo?.parameter?.unit || '',
                
                qualName: source.testPointInfo?.qualifier?.name || 'Frequency',
                qualValue: isFullEdit ? (source.testPointInfo?.qualifier?.value || '') : '',
                qualUnit: source.testPointInfo?.qualifier?.unit || 'kHz',
                
                measurementType: source.measurementType || 'direct',
                equationString: source.equationString || '',
                variableMappings: { ...initialMappings }, 
            });

            if (source.measurementType === 'derived') {
                updateEquationVariables(source.equationString);
            } else {
                setEquationVariables([]);
            }
        }
    }, [initialData, isOpen, previousTestPointData]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const newValue = type === 'checkbox' ? checked : value;

        setFormData(prev => ({
            ...prev,
            [name]: newValue
        }));

        if (name === 'equationString') {
            updateEquationVariables(newValue);
        }
    };

    const handleSelectChange = (name, selectedOption) => {
        setFormData(prev => ({
            ...prev,
            [name]: selectedOption ? selectedOption.value : ''
        }));
    };
    
    const handleSymbolClick = (symbol) => {
        const input = equationInputRef.current;
        if (!input) return;

        input.focus();
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const currentValue = input.value;
        const selectedText = currentValue.substring(start, end);

        let newValue;
        let newCursorPos;

        const isFunction = symbol.endsWith('()');

        if (isFunction) {
            const funcName = symbol.slice(0, -2); 
            const textToInsert = `${funcName}(${selectedText})`;
            newValue = currentValue.substring(0, start) + textToInsert + currentValue.substring(end);
            
            if (selectedText) {
                newCursorPos = start + textToInsert.length + 1;
            } else {
                newCursorPos = start + funcName.length + 1;
            }
        } else {
            newValue = currentValue.substring(0, start) + symbol + currentValue.substring(end);
            newCursorPos = start + symbol.length;
        }
        
        handleChange({ target: { name: 'equationString', value: newValue } });
        setCursorPos(newCursorPos);
    };

    const handleMappingChange = (variableSymbol, userFriendlyName) => {
        setFormData(prev => ({
            ...prev,
            variableMappings: {
                ...prev.variableMappings,
                [variableSymbol]: userFriendlyName
            }
        }));
    };

    const handleSave = () => {
        if (!formData.section || !formData.paramUnit || !formData.paramValue ||
            (formData.measurementType === 'derived' && !formData.equationString) ||
            (formData.measurementType === 'derived' && equationVariables.some(v => !formData.variableMappings[v] || formData.variableMappings[v].trim() === ''))
        ) {
            setNotification({
                title: 'Missing Information',
                message: 'Please fill out all required (*) fields:\n' +
                    '- Section\n' +
                    '- Parameter Value (Nominal/Reference for derived)\n' +
                    '- Parameter Unit\n' +
                    (formData.measurementType === 'derived' ? '- Equation\n' : '') +
                    (formData.measurementType === 'derived' && equationVariables.some(v => !formData.variableMappings[v] || formData.variableMappings[v].trim() === '') ? '- All Variable Mappings must be named' : '')
            });
            return;
        }

        const qualifierData = hasQualifier ? { name: formData.qualName, value: formData.qualValue, unit: formData.qualUnit } : null;

        const resolvedAssociatedUuts = (initialData && initialData.associatedUutIds !== undefined)
            ? initialData.associatedUutIds
            : (previousTestPointData?.associatedUutIds || []);

        const finalData = {
            section: formData.section,
            testPointInfo: {
                parameter: { name: formData.paramName, value: formData.paramValue, unit: formData.paramUnit },
                qualifier: qualifierData,
            },
            measurementType: formData.measurementType,
            equationString: formData.equationString,
            variableMappings: formData.variableMappings,
            measurementAreaId: initialData?.measurementAreaId || previousTestPointData?.measurementAreaId || null,
            associatedUutIds: resolvedAssociatedUuts,
            uutTolerance: initialData?.uutTolerance || previousTestPointData?.uutTolerance || null,
        };

        if (initialData && initialData.id) {
            onSave({ id: initialData.id, ...finalData });
        } else {
            onSave(finalData);
        }
    };

    // Determine if we are strictly editing (has ID) or just have partial data
    const isEditing = initialData && initialData.id;

    return ReactDOM.createPortal(
        <>
            {notification && <NotificationModal isOpen={!!notification} onClose={() => setNotification(null)} title={notification.title} message={notification.message} />}
            
            <div 
                className="modal-content floating-window-content"
                style={{
                    position: 'fixed',
                    top: position.y,
                    left: position.x,
                    margin: 0,
                    width: '800px',
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 2000,
                    overflow: 'hidden'
                }}
            >
                {/* --- Draggable Header --- */}
                <div 
                    style={{
                        display:'flex', 
                        justifyContent:'space-between', 
                        alignItems:'center', 
                        paddingBottom: '10px', 
                        marginBottom: '10px', 
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'move',
                        userSelect: 'none'
                    }}
                    onMouseDown={handleMouseDown}
                >
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <h3 style={{margin:0, fontSize: '1.2rem'}}>
                            {isEditing ? 'Edit Measurement Point' : 'Add New Measurement Point'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="modal-close-button" style={{position:'static'}}>&times;</button>
                </div>

                {/* --- Scrollable Body --- */}
                <div style={{flex: 1, overflowY: 'auto', paddingRight: '5px'}}>
                    <div className="modal-form-grid">
                        <div className="modal-form-section">
                            <h4>Identification</h4>
                            <label>Section *</label>
                            <input type="text" name="section" value={formData.section} onChange={handleChange} placeholder="e.g., 4.1.a" />

                            <label style={{marginTop: '15px'}}>Measurement Type *</label>
                             <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
                                <label style={{ fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                    <input
                                        type="radio"
                                        name="measurementType"
                                        value="direct"
                                        checked={formData.measurementType === 'direct'}
                                        onChange={handleChange}
                                        style={{width: 'auto', height: 'auto', margin: 0}}
                                    /> Direct
                                </label>
                                <label style={{ fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                    <input
                                        type="radio"
                                        name="measurementType"
                                        value="derived"
                                        checked={formData.measurementType === 'derived'}
                                        onChange={handleChange}
                                         style={{width: 'auto', height: 'auto', margin: 0}}
                                    /> Derived
                                </label>
                            </div>
                        </div>

                        <div className="modal-form-section">
                            <h4>Parameter</h4>
                            <label>Parameter Name</label>
                            <input type="text" name="paramName" value={formData.paramName} onChange={handleChange} placeholder="e.g., DC Voltage, Resistance, Power"/>

                            <div className="input-group">
                                <div>
                                    <label>Value {formData.measurementType === 'derived' ? '(Nominal/Reference)' : ''} *</label>
                                    <input
                                        type="text"
                                        name="paramValue"
                                        value={formData.paramValue}
                                        onChange={handleChange}
                                        placeholder={formData.measurementType === 'derived' ? "Nominal result (e.g., 1)" : "e.g., 10"}
                                    />
                                </div>
                                <div>
                                    <label>Units *</label>
                                    <Select
                                        name="paramUnit"
                                        value={
                                            groupedUnitOptions
                                                .flatMap(g => g.options)
                                                .find(opt => opt.value === formData.paramUnit) || null
                                        }
                                        onChange={(opt) => handleSelectChange('paramUnit', opt)}
                                        options={groupedUnitOptions}
                                        placeholder="Unit"
                                        className="react-select-container"
                                        classNamePrefix="react-select"
                                        menuPortalTarget={document.body}
                                        menuPosition="fixed"
                                        styles={customSelectStyles}
                                    />
                                </div>
                            </div>

                             {formData.measurementType === 'derived' && (
                                <>
                                    <label style={{marginTop: '15px'}}>Equation *</label>
                                    
                                    <div className="input-with-symbol-button">
                                        <input
                                            ref={equationInputRef} 
                                            type="text"
                                            name="equationString"
                                            value={formData.equationString}
                                            onChange={handleChange}
                                            placeholder="e.g., V / I or W * L"
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                        <button
                                            type="button"
                                            className="symbol-toggle-button"
                                            title="Show Symbols"
                                            ref={symbolButtonRef}
                                            onClick={() => setIsSymbolMenuOpen(prev => !prev)}
                                        >
                                            f(x)
                                        </button>
                                        
                                        {isSymbolMenuOpen && (
                                            <div 
                                                className="symbol-popout" 
                                                ref={symbolMenuRef} 
                                                style={{ maxHeight: '300px', overflowY: 'auto' }}
                                            >
                                                {Object.entries(symbolCategories).map(([category, symbols]) => (
                                                    <div key={category} className="symbol-category">
                                                        <h5 className="symbol-category-title">{category}</h5>
                                                        <div className="symbol-category-grid">
                                                            {symbols.map(s => (
                                                                <SymbolButton 
                                                                    key={s.symbol} 
                                                                    symbol={s.symbol} 
                                                                    title={s.title} 
                                                                    onSymbolClick={handleSymbolClick} 
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {equationVariables.length > 0 && (
                                        <div style={{marginTop: '15px', paddingLeft: '10px', borderLeft: '3px solid var(--border-color)'}}>
                                            <label style={{fontSize: '0.9em', color: 'var(--text-color-muted)', marginBottom: '5px'}}>Map Variables (*Case Sensitive):</label>
                                            {equationVariables.map(variable => (
                                                <div key={variable} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{variable} =</span>
                                                    <input
                                                        type="text"
                                                        value={formData.variableMappings[variable] || ''}
                                                        onChange={(e) => handleMappingChange(variable, e.target.value)}
                                                        placeholder={`Enter Name (e.g., Voltage, Current, Weight)`}
                                                        style={{ margin: 0 }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            <hr />
                             {hasQualifier ? (
                                <>
                                    <div className="qualifier-header">
                                        <h4>Qualifier</h4>
                                        <button onClick={() => setHasQualifier(false)} title="Remove Qualifier"><FontAwesomeIcon icon={faTrashAlt} /></button>
                                    </div>
                                    <label>Qualifier Name</label>
                                    <input type="text" name="qualName" value={formData.qualName} onChange={handleChange} />
                                    <div className="input-group">
                                        <div>
                                            <label>Value</label>
                                            <input type="text" name="qualValue" value={formData.qualValue} onChange={handleChange} />
                                        </div>
                                        <div>
                                            <label>Units</label>
                                            <Select
                                                name="qualUnit"
                                                value={
                                                    groupedUnitOptions
                                                        .flatMap(g => g.options)
                                                        .find(opt => opt.value === formData.qualUnit) || null
                                                }
                                                onChange={(opt) => handleSelectChange('qualUnit', opt)}
                                                options={groupedUnitOptions}
                                                placeholder="Unit"
                                                className="react-select-container"
                                                classNamePrefix="react-select"
                                                menuPortalTarget={document.body}
                                                menuPosition="fixed"
                                                styles={customSelectStyles}
                                            />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                 <button className="add-qualifier-btn" onClick={() => setHasQualifier(true)}>
                                    <FontAwesomeIcon icon={faPlus} /> Add Qualifier
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- Footer --- */}
                <div className="modal-actions" style={{marginTop: '20px'}}>
                    <button className="modal-icon-button primary" onClick={handleSave} title="Save Changes"><FontAwesomeIcon icon={faCheck} /></button>
                </div>
            </div>
        </>,
        document.body
    );
};

export default AddTestPointModal;