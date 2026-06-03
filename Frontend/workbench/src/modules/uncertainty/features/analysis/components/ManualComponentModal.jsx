import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPenSquare, faRulerCombined, faCalculator } from "@fortawesome/free-solid-svg-icons"; 
import ConversionInfo from "../../../components/common/ConversionInfo";
import { convertToPPM, unitSystem } from "../../../utils/uncertaintyMath";
import { oldErrorDistributions } from "../utils/budgetUtils";

const ManualComponentModal = ({
  isOpen,
  onClose,
  onSave,
  existingComponent, // If provided, we are in "Edit" mode
  uutNominal
}) => {
  // --- Floating Window State ---
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Mode: "standard" (Original) or "resolution" (New Tab)
  const [activeTab, setActiveTab] = useState("standard");

  const [component, setComponent] = useState({
    name: "",
    type: "B",
    errorDistributionDivisor: "1.732",
    toleranceLimit: "", // Used for Tolerance (Standard) OR Resolution Value (Resolution Mode)
    unit: "ppm",
    standardUncertainty: "",
    dof: "Infinity",
  });

  const [error, setError] = useState(null);

  // Center the modal when it opens
  useEffect(() => {
    if (isOpen) {
      const width = 800;
      const height = 550; // Slightly taller for tabs
      const x = typeof window !== 'undefined' ? Math.max(0, (window.innerWidth - width) / 2) : 0;
      const y = typeof window !== 'undefined' ? Math.max(0, (window.innerHeight - height) / 2) : 0;
      setPosition({ x, y });
    }
  }, [isOpen]);

  // Reset or Populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (existingComponent) {
        // Detect if this was saved as a resolution component
        const wasResolution = existingComponent.originalInput?.isResolution || false;
        setActiveTab(wasResolution ? "resolution" : "standard");

        setComponent({
          id: existingComponent.id, 
          name: existingComponent.name,
          type: existingComponent.type,
          standardUncertainty: existingComponent.originalInput?.standardUncertainty || "",
          toleranceLimit: existingComponent.originalInput?.toleranceLimit || "",
          errorDistributionDivisor: existingComponent.originalInput?.errorDistributionDivisor || "1.732",
          unit: existingComponent.originalInput?.unit || existingComponent.unit_native || existingComponent.unit || "ppm",
          dof: existingComponent.dof === Infinity ? "Infinity" : String(existingComponent.dof),
        });
      } else {
        setActiveTab("standard");
        setComponent({
          name: "",
          type: "B",
          errorDistributionDivisor: "1.732",
          toleranceLimit: "",
          unit: uutNominal?.unit || "ppm",
          standardUncertainty: "",
          dof: "Infinity",
        });
      }
    }
  }, [isOpen, existingComponent, uutNominal]);

  // --- Drag Handlers ---
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

  const unitOptions = useMemo(() => {
    const nominalUnit = uutNominal?.unit;
    if (!nominalUnit) return ["%", "ppm", "ppb"];
    
    const relevant = unitSystem.getRelevantUnits(nominalUnit);
    return ["%", "ppm", "ppb", ...relevant.filter((u) => u !== "%" && u !== "ppm" && u !== "ppb" && u !== "dB")];
  }, [uutNominal]);

  const handleChange = (e) => {
    setComponent((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null);
    
    // Only set defaults if switching TO resolution, but do NOT overwrite name
    if (tab === "resolution") {
        setComponent(prev => ({
            ...prev,
            type: "B", 
            errorDistributionDivisor: "1.732" 
        }));
    }
  };

  const handleSubmit = () => {
    let valueInPPM = NaN;
    let dof = component.dof === "Infinity" ? Infinity : parseFloat(component.dof);

    const originalInputData = {
      standardUncertainty: component.standardUncertainty,
      toleranceLimit: component.toleranceLimit,
      errorDistributionDivisor: component.errorDistributionDivisor,
      unit: component.unit,
      isResolution: activeTab === "resolution" 
    };

    let valueNative = NaN;

    if (activeTab === "standard") {
        // --- ORIGINAL LOGIC (Standard Type A/B) ---
        if (component.type === "A") {
            const stdUnc = parseFloat(component.standardUncertainty);
            if (isNaN(stdUnc) || stdUnc <= 0 || (dof !== Infinity && (isNaN(dof) || dof < 1))) {
                setError("For Type A, provide valid positive Std Unc and DoF (>=1).");
                return;
            }
            
            const { value: ppm, warning } = convertToPPM(
                stdUnc,
                component.unit,
                uutNominal?.value,
                uutNominal?.unit,
                null,
                true
            );
            if (warning) { setError(warning); return; }
            valueInPPM = ppm;
            valueNative = stdUnc;
        } else {
            // Type B
            const rawValue = parseFloat(component.toleranceLimit);
            const divisor = parseFloat(component.errorDistributionDivisor);
            if (isNaN(rawValue) || rawValue <= 0 || isNaN(divisor)) {
                setError("Provide valid positive tolerance limit and select distribution.");
                return;
            }
            const { value: ppm, warning } = convertToPPM(
                rawValue,
                component.unit,
                uutNominal?.value,
                uutNominal?.unit,
                null,
                true
            );
            if (warning) { setError(warning); return; }
            valueInPPM = ppm / divisor;
            valueNative = rawValue / divisor;
        }
    } else {
        // --- RESOLUTION LOGIC ---
        const resVal = parseFloat(component.toleranceLimit);
        const divisor = parseFloat(component.errorDistributionDivisor);

        if (isNaN(resVal) || resVal <= 0 || isNaN(divisor)) {
            setError("Provide valid positive resolution and select distribution.");
            return;
        }

        const { value: ppm, warning } = convertToPPM(
            resVal,
            component.unit,
            uutNominal?.value,
            uutNominal?.unit,
            null,
            true
        );
        if (warning) { setError(warning); return; }

        // Math: (FullStep / 2) / Divisor
        valueInPPM = (ppm / 2) / divisor;
        valueNative = (resVal / 2) / divisor;
    }

    if (!component.name) {
        setError("Component Name is required.");
        return;
    }

    const distributionLabel = oldErrorDistributions.find(
      (d) => d.value === component.errorDistributionDivisor
    )?.label;

    // ---  Handle Relative Unit Display ---
    let finalValueNative = valueNative;
    let finalUnitNative = component.unit;
    const isRelative = ["%", "ppm", "ppb"].includes(component.unit);
    
    if (isRelative && uutNominal?.value && uutNominal?.unit) {
        const nominalVal = parseFloat(uutNominal.value);
        if (!isNaN(nominalVal)) {
            finalValueNative = (valueInPPM / 1000000) * Math.abs(nominalVal);
            finalUnitNative = uutNominal.unit;
        }
    }

    const finalData = {
      ...component,
      type: activeTab === "resolution" ? "B" : component.type, 
      value: valueInPPM,
      value_native: finalValueNative, 
      unit_native: finalUnitNative,   
      dof,
      distribution: activeTab === "resolution" ? `${distributionLabel} (Res)` : distributionLabel,
      originalInput: originalInputData
    };

    onSave(finalData);
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
        className="modal-content floating-window-content" 
        style={{ 
            maxWidth: "95vw",
            width: "800px",
            display: 'flex', 
            flexDirection: 'column',
            position: 'fixed',
            top: position.y,
            left: position.x,
            margin: 0,
            zIndex: 9999, 
            height: 'auto',
            maxHeight: '90vh'
        }}
    >
        {/* DRAGGABLE HEADER */}
        <div 
            onMouseDown={handleMouseDown}
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                marginBottom: '10px', 
                borderBottom: '1px solid var(--border-color)', 
                paddingBottom: '15px',
                cursor: 'move',
                userSelect: 'none'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ 
                    width: '40px', height: '40px', borderRadius: '8px', 
                    backgroundColor: 'var(--primary-color-light)', color: 'var(--primary-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
                }}>
                    <FontAwesomeIcon icon={faPenSquare} />
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{existingComponent ? "Edit Component" : "Manual Component"}</h3>
                </div>
            </div>
            
            <button onClick={onClose} className="modal-close-button" style={{ position: 'static', transform: 'none' }}>
                &times;
            </button>
        </div>

        {/* CONTENT */}
        <div style={{ overflowY: 'auto', paddingRight: '5px' }}>
            
            {/* TABS */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
                <button 
                    onClick={() => handleTabChange("standard")}
                    style={{
                        padding: '10px 5px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === "standard" ? '2px solid var(--primary-color)' : '2px solid transparent',
                        color: activeTab === "standard" ? 'var(--primary-color)' : 'var(--text-color-muted)',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <FontAwesomeIcon icon={faCalculator} /> Standard
                </button>
                <button 
                    onClick={() => handleTabChange("resolution")}
                    style={{
                        padding: '10px 5px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === "resolution" ? '2px solid var(--primary-color)' : '2px solid transparent',
                        color: activeTab === "resolution" ? 'var(--primary-color)' : 'var(--text-color-muted)',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                >
                    <FontAwesomeIcon icon={faRulerCombined} /> Resolution
                </button>
            </div>

            {error && <div className="form-section-warning">{error}</div>}

            <div className="config-stack" style={{ paddingTop: "10px", textAlign: "left" }}>
                <div className="config-column">
                    <label>Component Name</label>
                    <input
                        type="text"
                        name="name"
                        value={component.name}
                        onChange={handleChange}
                        placeholder={activeTab === "resolution" ? "e.g., UUT Resolution" : "e.g., UUT Stability Spec"}
                    />
                </div>

                {/* --- STANDARD MODE --- */}
                {activeTab === "standard" && (
                    <>
                        <div className="config-column">
                            <label>Type</label>
                            <select name="type" value={component.type} onChange={handleChange}>
                                <option value="A">Type A</option>
                                <option value="B">Type B</option>
                            </select>
                        </div>

                        {component.type === "A" && (
                            <>
                                <div className="config-column">
                                    <label>Std Unc (uᵢ)</label>
                                    <div className="input-with-unit">
                                        <input
                                            type="number"
                                            step="any"
                                            name="standardUncertainty"
                                            value={component.standardUncertainty}
                                            onChange={handleChange}
                                            placeholder="e.g., 15.3"
                                        />
                                        <select name="unit" value={component.unit} onChange={handleChange}>
                                            {unitOptions.map((u) => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <ConversionInfo
                                        value={component.standardUncertainty}
                                        unit={component.unit}
                                        nominal={uutNominal}
                                    />
                                </div>
                                <div className="config-column">
                                    <label>DoF (vᵢ)</label>
                                    <input
                                        type="number"
                                        step="1"
                                        min="1"
                                        name="dof"
                                        value={component.dof}
                                        onChange={handleChange}
                                    />
                                </div>
                            </>
                        )}

                        {component.type === "B" && (
                            <>
                                <div className="config-column">
                                    <label>Distribution</label>
                                    <select
                                        name="errorDistributionDivisor"
                                        value={component.errorDistributionDivisor}
                                        onChange={handleChange}
                                    >
                                        {oldErrorDistributions.map((dist) => (
                                            <option key={dist.value} value={dist.value}>
                                                {dist.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="config-column">
                                    <label>Tolerance Limits (±)</label>
                                    <div className="input-with-unit">
                                        <input
                                            type="number"
                                            step="any"
                                            name="toleranceLimit"
                                            value={component.toleranceLimit}
                                            onChange={handleChange}
                                        />
                                        <select name="unit" value={component.unit} onChange={handleChange}>
                                            {unitOptions.map((u) => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <ConversionInfo
                                        value={component.toleranceLimit}
                                        unit={component.unit}
                                        nominal={uutNominal}
                                    />
                                </div>
                                <div className="config-column">
                                    <label>DoF</label>
                                    <input
                                        type="text"
                                        name="dof"
                                        value={component.dof}
                                        onChange={handleChange}
                                        placeholder="Infinity"
                                    />
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* --- RESOLUTION MODE --- */}
                {activeTab === "resolution" && (
                    <>
                        <div className="config-column">
                             <div className="form-section-info" style={{fontSize: '0.9rem', color: 'var(--text-color-muted)', marginBottom: '5px'}}>
                                Calculates uncertainty from full step resolution: <br/>
                                <em>uᵢ = (Resolution / 2) / Divisor</em>
                            </div>
                        </div>

                        <div className="config-column">
                            <label>Distribution</label>
                            <select
                                name="errorDistributionDivisor"
                                value={component.errorDistributionDivisor}
                                onChange={handleChange}
                            >
                                {oldErrorDistributions.map((dist) => (
                                    <option key={dist.value} value={dist.value}>
                                        {dist.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="config-column">
                            <label>Resolution (Full Step)</label>
                            <div className="input-with-unit">
                                <input
                                    type="number"
                                    step="any"
                                    name="toleranceLimit" // Reusing same state field
                                    value={component.toleranceLimit}
                                    onChange={handleChange}
                                    placeholder="e.g. 0.001"
                                />
                                <select name="unit" value={component.unit} onChange={handleChange}>
                                    {unitOptions.map((u) => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>
                            <ConversionInfo
                                value={component.toleranceLimit}
                                unit={component.unit}
                                nominal={uutNominal}
                            />
                        </div>

                         <div className="config-column">
                            <label>DoF</label>
                            <input
                                type="text"
                                name="dof"
                                value={component.dof}
                                onChange={handleChange}
                                placeholder="Infinity"
                            />
                        </div>
                    </>
                )}

            </div>
            
            <div className="modal-actions" style={{marginTop: '20px'}}>
                <button
                    onClick={handleSubmit}
                    title="Save Component"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--primary-color)',
                        cursor: 'pointer',
                        fontSize: '1.5rem',
                        transition: 'transform 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <FontAwesomeIcon icon={faCheck} />
                </button>
            </div>
        </div>
    </div>,
    document.body
  );
};

export default ManualComponentModal;