import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import axios from "axios";
import { useInstruments } from "../../contexts/InstrumentContext";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000/api";

// --- Clean, Minimalist Icon Button Component ---
const IconBtn = ({ icon, onClick, title, color = "var(--text-color)", size = "1.2rem" }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    style={{
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      cursor: 'pointer',
      padding: '4px 6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color,
      fontSize: size,
      opacity: 0.6,
      transition: 'opacity 0.2s ease, transform 0.1s ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.opacity = 1;
      e.currentTarget.style.transform = 'scale(1.1)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.opacity = 0.6;
      e.currentTarget.style.transform = 'scale(1)';
    }}
  >
    {icon}
  </button>
);

// --- Original Custom Dropdown Component ---
const CustomDropdown = ({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [width, setWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const resizeInfoRef = useRef({ initialMouseX: 0, initialWidth: 0 });
  const dropdownRef = useRef(null);

  const handleToggle = () => {
    if (!disabled) setIsOpen(!isOpen);
  };

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeInfoRef.current = {
      initialMouseX: e.clientX,
      initialWidth: dropdownRef.current.offsetWidth,
    };
  };

  const handleResize = useCallback((e) => {
    const deltaX = e.clientX - resizeInfoRef.current.initialMouseX;
    const newWidth = resizeInfoRef.current.initialWidth + deltaX;
    if (newWidth > 280 && newWidth < 800) {
      setWidth(newWidth);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResize);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleResize);
      window.removeEventListener("mouseup", handleMouseUp);
    }
  }, [isResizing, handleResize, handleMouseUp]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div
      className={`custom-dropdown-container ${disabled ? "disabled" : ""} ${
        isLoading ? "loading" : ""
      }`}
      ref={dropdownRef}
      style={{ width: `${width}px` }}
    >
      <label>{label}</label>
      <button
        type="button"
        className={`custom-dropdown-trigger ${isOpen ? "open" : ""}`}
        onClick={handleToggle}
        disabled={disabled}
      >
        {selectedOption ? (
          <span>{selectedOption.label}</span>
        ) : (
          <span className="placeholder">{placeholder}</span>
        )}
        <span className="custom-dropdown-chevron">▼</span>
      </button>
      {isOpen && (
        <div className="custom-dropdown-panel">
          <div className="custom-dropdown-search-wrapper">
            <input
              type="text"
              className="custom-dropdown-search"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="custom-dropdown-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <li
                  key={option.value}
                  className={value === option.value ? "active" : ""}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                </li>
              ))
            ) : (
              <li className="no-options">No matches found</li>
            )}
          </ul>
          <div className="resizable-handle" onMouseDown={handleMouseDown}></div>
        </div>
      )}
    </div>
  );
};

function CorrectionsModal({ isOpen, onClose, showNotification }) {
  const {
    standardInstrumentSerial,
    testInstrumentSerial,
    standardTvcSn,
    testTvcSn,
  } = useInstruments();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // <--- ADDED: Saving state
  const [shuntsData, setShuntsData] = useState([]);
  const [tvcsData, setTvcsData] = useState([]);
  const [selectedShuntSn, setSelectedShuntSn] = useState("");
  
  // --- Navigation State ---
  const [primaryTab, setPrimaryTab] = useState("AC Shunt");
  const [shuntView, setShuntView] = useState("Corrections");
  const [auxiliaryTvcSn, setAuxiliaryTvcSn] = useState("");

  // --- Manual Entry State ---
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [manualType, setManualType] = useState("shunt");
  const [isEditing, setIsEditing] = useState(false);
  
  const initialManualFormState = {
    id: null,
    model_name: "",
    serial_number: "",
    range: "",
    current: "",
    test_voltage: "",
    remark: "",
    points: [{ id: null, frequency: "", val1: "", val2: "" }],
  };
  const [manualForm, setManualForm] = useState(initialManualFormState);

  // Helper for consistent notifications
  const notify = (msg, type = "info") => {
    if (showNotification) {
      showNotification(msg, type);
    } else {
      alert(msg);
    }
  };

  // Reset form when switching main tabs
  useEffect(() => {
    setIsManualFormOpen(false);
    setManualForm(initialManualFormState);
  }, [primaryTab]);

  useEffect(() => {
    if (isOpen) {
      setShuntView("Corrections");
      setAuxiliaryTvcSn("");
      setIsManualFormOpen(false);
      fetchData();
    }
  }, [isOpen, standardInstrumentSerial, testInstrumentSerial]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [shuntsRes, tvcsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/shunts/`),
        axios.get(`${API_BASE_URL}/tvcs/`),
      ]);

      const shunts = shuntsRes.data || [];
      const tvcs = tvcsRes.data || [];
      setShuntsData(shunts);
      setTvcsData(tvcs);

      if (shunts.length > 0) {
        const shuntSerialNumbers = [
          ...new Set(shunts.map((s) => s.serial_number)),
        ];
        const standardMatch =
          standardInstrumentSerial &&
          shuntSerialNumbers.includes(String(standardInstrumentSerial));
        const testMatch =
          testInstrumentSerial &&
          shuntSerialNumbers.includes(String(testInstrumentSerial));

        if (!selectedShuntSn) {
          if (standardMatch) {
            setSelectedShuntSn(String(standardInstrumentSerial));
          } else if (testMatch) {
            setSelectedShuntSn(String(testInstrumentSerial));
          } else {
            setSelectedShuntSn(shuntSerialNumbers[0]);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch correction data:", error);
      notify("Failed to load instrument database.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const uniqueShuntInfo = useMemo(() => {
    const shuntMap = new Map();
    shuntsData.forEach((shunt) => {
      if (shunt.serial_number && !shuntMap.has(shunt.serial_number)) {
        shuntMap.set(shunt.serial_number, {
          serial_number: shunt.serial_number,
          size: shunt.size,
          is_manual: shunt.is_manual,
        });
      }
    });
    return Array.from(shuntMap.values()).sort((a, b) =>
      a.serial_number.localeCompare(b.serial_number)
    );
  }, [shuntsData]);

  const tvcOptions = useMemo(() => {
    const uniqueSerials = [...new Set(tvcsData.map((t) => t.serial_number))];
    uniqueSerials.sort((a, b) => a - b);
    return uniqueSerials.map((sn) => ({
      value: String(sn),
      label: String(sn),
    }));
  }, [tvcsData]);

  const pivotedShuntData = useMemo(() => {
    if (!selectedShuntSn) return { headers: [], rows: [] };
    const filteredShunts = shuntsData.filter(
      (shunt) => shunt.serial_number === selectedShuntSn
    );
    if (filteredShunts.length === 0) return { headers: [], rows: [] };
    const frequencyHeaders = [
      ...new Set(
        filteredShunts.flatMap((shunt) =>
          shunt.corrections.map((c) => c.frequency)
        )
      ),
    ].sort((a, b) => a - b);
    const dataMap = new Map();
    filteredShunts.forEach((shunt) => {
      const key = `${shunt.range}-${shunt.current}`;
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          range: shunt.range,
          current: shunt.current,
          values: {},
          is_manual: shunt.is_manual,
        });
      }
      const entry = dataMap.get(key);
      const valueKey = shuntView === "Corrections" ? "correction" : "uncertainty";
      shunt.corrections.forEach((corr) => {
        entry.values[corr.frequency] = corr[valueKey];
      });
    });
    return { headers: frequencyHeaders, rows: Array.from(dataMap.values()) };
  }, [shuntsData, selectedShuntSn, shuntView]);

  // Derived state to check if current selection is manual
  const selectedShunt = shuntsData.find(s => s.serial_number === selectedShuntSn);
  const isSelectedShuntManual = selectedShunt?.is_manual;
  
  const selectedTvc = tvcsData.find(t => String(t.serial_number) === String(auxiliaryTvcSn));
  const isSelectedTvcManual = selectedTvc?.is_manual;

  // --- Manual Form Handlers ---
  const handleOpenManualForm = (type) => {
    setManualType(type);
    setIsEditing(false);
    setManualForm(initialManualFormState);
    setIsManualFormOpen(true);
  };

  const handleEditManual = (type, serialNumber) => {
    setManualType(type);
    setIsEditing(true);

    if (type === 'shunt') {
      const shuntToEdit = shuntsData.find(s => s.serial_number === serialNumber);
      if (shuntToEdit) {
        setManualForm({
          id: shuntToEdit.id,
          model_name: shuntToEdit.model_name || "",
          serial_number: shuntToEdit.serial_number,
          range: shuntToEdit.range ?? "",
          current: shuntToEdit.current ?? "",
          test_voltage: "",
          remark: shuntToEdit.remark || "",
          points: shuntToEdit.corrections.map(c => ({
            id: c.id || null, // Preserve ID for updates
            frequency: c.frequency ?? "",
            val1: c.correction ?? "",
            val2: c.uncertainty ?? ""
          }))
        });
      }
    } else {
      const tvcToEdit = tvcsData.find(t => String(t.serial_number) === String(serialNumber));
      if (tvcToEdit) {
        setManualForm({
          id: tvcToEdit.id,
          model_name: "",
          serial_number: tvcToEdit.serial_number,
          range: "",
          current: "",
          test_voltage: tvcToEdit.test_voltage ?? "",
          remark: tvcToEdit.remark || "",
          points: tvcToEdit.corrections.map(c => ({
            id: c.id || null, // Preserve ID for updates
            frequency: c.frequency ?? "",
            val1: c.ac_dc_difference ?? "",
            val2: c.expanded_uncertainty ?? ""
          }))
        });
      }
    }
    setIsManualFormOpen(true);
  };

  const handleDeleteManual = async (type, serialNumber) => {
    if (!window.confirm(`Are you sure you want to delete manual entry S/N: ${serialNumber}?`)) return;
    
    const endpoint = type === 'shunt' ? 'shunts' : 'tvcs';
    const device = type === 'shunt' 
        ? shuntsData.find(s => s.serial_number === serialNumber)
        : tvcsData.find(t => String(t.serial_number) === String(serialNumber));
        
    if (!device) {
        notify("Error: Device not found in database.", "error");
        return;
    }

    try {
      // Must use the database ID, not the string serialNumber
      await axios.delete(`${API_BASE_URL}/${endpoint}/${device.id}/`);
      notify("Entry successfully deleted.", "success");
      
      if (type === 'shunt') setSelectedShuntSn("");
      else setAuxiliaryTvcSn("");
      
      fetchData();
    } catch (err) {
      notify(`Error deleting entry: ${err.message}`, "error");
    }
  };

  const handlePointChange = (index, field, value) => {
    setManualForm((prev) => {
        const newPoints = [...prev.points];
        newPoints[index] = { ...newPoints[index], [field]: value };
        return { ...prev, points: newPoints };
    });
  };

  // <--- UPDATED: handleSaveManual with isSaving state and await fetchData()
  const handleSaveManual = async () => {
    const isShunt = manualType === "shunt";
    const endpoint = isShunt ? "shunts" : "tvcs";

    // Filter out rows where crucial fields are empty
    const validPoints = manualForm.points.filter(
      p => p.frequency !== "" && p.val1 !== ""
    );

    if (validPoints.length === 0) {
      notify("Please add at least one valid correction point.", "error");
      return;
    }

    const correctionsPayload = validPoints.map((p) => {
      const base = { frequency: parseFloat(p.frequency) };
      if (p.id) base.id = p.id; // Map ID back to prevent creating duplicate records
      
      if (isShunt) {
        base.correction = parseFloat(p.val1 || 0);
        base.uncertainty = parseFloat(p.val2 || 0);
      } else {
        base.ac_dc_difference = parseFloat(p.val1 || 0);
        base.expanded_uncertainty = parseFloat(p.val2 || 0);
      }
      return base;
    });

    const payload = isShunt
      ? {
          model_name: manualForm.model_name,
          serial_number: String(manualForm.serial_number),
          range: parseFloat(manualForm.range || 0),
          current: parseFloat(manualForm.current || 0),
          remark: manualForm.remark || "Manually added",
          is_manual: true,
          corrections: correctionsPayload,
        }
      : {
          serial_number: String(manualForm.serial_number),
          test_voltage: parseFloat(manualForm.test_voltage || 0),
          is_manual: true,
          corrections: correctionsPayload,
        };

    try {
      setIsSaving(true); // Lock the UI

      if (isEditing && manualForm.id) {
        await axios.put(`${API_BASE_URL}/${endpoint}/${manualForm.id}/`, payload);
      } else {
        await axios.post(`${API_BASE_URL}/${endpoint}/`, payload);
      }
      
      // AWAIT FETCH DATA BEFORE CLOSING THE FORM
      await fetchData(); 
      
      notify("Manual entry saved successfully!", "success");
      setIsManualFormOpen(false);
      setManualForm(initialManualFormState);
      
      if (isShunt) setSelectedShuntSn(String(manualForm.serial_number));
      else setAuxiliaryTvcSn(String(manualForm.serial_number));
      
    } catch (err) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      notify(`Error saving: ${errMsg}`, "error");
    } finally {
      setIsSaving(false); // Unlock the UI
    }
  };

  const renderShuntTable = () => {
    const { headers, rows } = pivotedShuntData;
    if (isLoading) return <p>Loading...</p>;
    if (rows.length === 0)
      return (
        <p className="placeholder-content">
          No data available for this serial number.
        </p>
      );

    return (
      <div className="corrections-table-container">
        <table className="styled-table">
          <thead>
            <tr>
              <th style={{ textAlign: "center" }}>Range (A)</th>
              <th style={{ textAlign: "center" }}>Current (A)</th>
              {headers.map((freq) => (
                <th key={freq} style={{ textAlign: "center" }}>
                  {freq} Hz
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.range}-${row.current}`}>
                <td style={{ textAlign: "center" }}>{row.range}</td>
                <td style={{ textAlign: "center" }}>{row.current}</td>
                {headers.map((freq) => (
                  <td key={freq} style={{ textAlign: "center" }}>
                    {row.values[freq] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTVCTable = (serialNumber) => {
    if (!serialNumber) return null;
    const filteredTvc = tvcsData.find(
      (tvc) => String(tvc.serial_number) === String(serialNumber)
    );
    if (isLoading) return <p>Loading...</p>;
    if (!filteredTvc?.corrections?.length) {
      return (
        <p className="placeholder-content">
          No correction data found for this serial number.
        </p>
      );
    }
    const sortedCorrections = [...filteredTvc.corrections].sort(
      (a, b) => a.frequency - b.frequency
    );
    return (
      <div className="corrections-table-container">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Frequency (Hz)</th>
              <th>AC/DC Difference (ppm)</th>
              <th>Expanded Uncertainty (ppm)</th>
            </tr>
          </thead>
          <tbody>
            {sortedCorrections.map((corr, index) => (
              <tr key={index}>
                <td>{corr.frequency}</td>
                <td>{corr.ac_dc_difference}</td>
                <td>{corr.expanded_uncertainty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderManualEntry = () => (
    <div className="manual-entry-container" style={{ animation: "fadeIn 0.2s ease-out" }}>
      <div className="input-card" style={{ marginBottom: "25px", textAlign: "left" }}>
        <h4 style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "10px", marginBottom: "20px" }}>
          {isEditing ? `Edit ${manualType === 'shunt' ? 'AC Shunt' : 'TVC'} Entry` : `New ${manualType === 'shunt' ? 'AC Shunt' : 'TVC'} Entry`}
        </h4>
        <div className="form-section-group">
          {manualType === 'shunt' ? (
            <>
              <div className="form-section">
                <label>Model Name</label>
                <input 
                  type="text" 
                  value={manualForm.model_name ?? ''} 
                  onChange={(e) => setManualForm(prev => ({...prev, model_name: e.target.value}))} 
                  placeholder="e.g. A40B" 
                />
              </div>
              <div className="form-section">
                <label>Serial Number</label>
                <input 
                  type="text" 
                  disabled={isEditing} 
                  value={manualForm.serial_number ?? ''} 
                  onChange={(e) => setManualForm(prev => ({...prev, serial_number: e.target.value}))} 
                  placeholder="e.g. 12345" 
                />
              </div>
              <div className="form-section">
                <label>Range (A)</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={manualForm.range ?? ''} 
                  onChange={(e) => setManualForm(prev => ({...prev, range: e.target.value}))} 
                  placeholder="e.g. 5" 
                />
              </div>
              <div className="form-section">
                <label>Current (A)</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={manualForm.current ?? ''} 
                  onChange={(e) => setManualForm(prev => ({...prev, current: e.target.value}))} 
                  placeholder="e.g. 5" 
                />
              </div>
            </>
          ) : (
            <>
              <div className="form-section">
                <label>Serial Number</label>
                <input 
                  type="text" 
                  disabled={isEditing} 
                  value={manualForm.serial_number ?? ''} 
                  onChange={(e) => setManualForm(prev => ({...prev, serial_number: e.target.value}))} 
                  placeholder="e.g. 12345" 
                />
              </div>
              <div className="form-section">
                <label>Test Voltage (V)</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={manualForm.test_voltage ?? ''} 
                  onChange={(e) => setManualForm(prev => ({...prev, test_voltage: e.target.value}))} 
                  placeholder="e.g. 0.5" 
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="input-card" style={{ textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px", marginBottom: "20px" }}>
           <h4 style={{ margin: 0, padding: 0, border: "none" }}>Correction Points</h4>
           <button type="button" className="button button-small button-success" onClick={() => setManualForm({...manualForm, points: [...manualForm.points, { id: null, frequency: '', val1: '', val2: ''}]})}>+ Add Point</button>
        </div>

        <div className="manual-points-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {manualForm.points.length > 0 && (
             <div style={{ display: "flex", gap: "15px", padding: "0 15px", marginBottom: "-5px" }}>
               <label style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color-muted)", margin: 0 }}>Frequency (Hz)</label>
               <label style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color-muted)", margin: 0 }}>{manualType === 'shunt' ? "Correction (ppm)" : "AC/DC Diff (ppm)"}</label>
               <label style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color-muted)", margin: 0 }}>{manualType === 'shunt' ? "Uncertainty (ppm)" : "Expanded Unc (ppm)"}</label>
               <div style={{ width: "36px" }}></div>
             </div>
          )}
          
          {manualForm.points.map((p, i) => (
            <div key={i} className="manual-point-row" style={{ display: "flex", gap: "15px", alignItems: "center", backgroundColor: "var(--background-color)", padding: "10px 15px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <input 
                type="text" 
                inputMode="decimal"
                style={{ flex: 1, margin: 0 }} 
                placeholder="Freq" 
                value={p.frequency ?? ''} 
                onChange={(e) => handlePointChange(i, 'frequency', e.target.value)} 
              />
              <input 
                type="text" 
                inputMode="decimal"
                style={{ flex: 1, margin: 0 }} 
                placeholder="Value" 
                value={p.val1 ?? ''} 
                onChange={(e) => handlePointChange(i, 'val1', e.target.value)} 
              />
              <input 
                type="text" 
                inputMode="decimal"
                style={{ flex: 1, margin: 0 }} 
                placeholder="Uncertainty" 
                value={p.val2 ?? ''} 
                onChange={(e) => handlePointChange(i, 'val2', e.target.value)} 
              />
              <button 
                type="button" 
                style={{ 
                  background: 'none', border: 'none', color: '#dc3545', fontSize: '1.5rem', cursor: 'pointer', opacity: 0.7, margin: 0, flexShrink: 0
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                onClick={() => setManualForm({...manualForm, points: manualForm.points.filter((_, idx) => idx !== i)})} 
                title="Remove Point"
              >
                &times;
              </button>
            </div>
          ))}
          {manualForm.points.length === 0 && (
            <div className="placeholder-content" style={{ padding: "30px 20px" }}>
              <p style={{ margin: 0 }}>No correction points added. Click "+ Add Point" to begin.</p>
            </div>
          )}
        </div>
      </div>

      {/* <--- UPDATED: Disabled buttons while saving ---> */}
      <div className="form-submit-area" style={{ display: "flex", gap: "15px", justifyContent: "flex-end" }}>
        <button 
          className="button button-secondary" 
          onClick={() => setIsManualFormOpen(false)}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button 
          className="button button-primary" 
          onClick={handleSaveManual}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Entry"}
        </button>
      </div>
    </div>
  );

  const renderTvcDatabasePanels = () => {
    return (
      <div>
        <div className="tvc-display-grid">
          <div className="tvc-correction-panel">
            <h3>Standard TVC</h3>
            <p className="tvc-serial-label">
              {standardTvcSn ? `S/N: ${standardTvcSn}` : "No Standard TVC assigned."}
            </p>
            {renderTVCTable(standardTvcSn)}
          </div>
          <div className="tvc-correction-panel">
            <h3>Test TVC</h3>
            <p className="tvc-serial-label">
              {testTvcSn ? `S/N: ${testTvcSn}` : "No Test TVC assigned."}
            </p>
            {renderTVCTable(testTvcSn)}
          </div>
        </div>

        <hr className="modal-divider" />
        <div className="auxiliary-tvc-section">
          <div className="form-section" style={{ maxWidth: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '15px' }}>
              <div style={{ maxWidth: '350px', flex: 1 }}>
                <label>View / Edit Auxiliary TVC</label>
                <select
                  value={auxiliaryTvcSn}
                  onChange={(e) => setAuxiliaryTvcSn(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">-- Select a Serial Number to View --</option>
                  {tvcOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '6px' }}>
                <IconBtn 
                  icon={<span style={{ fontWeight: '300', fontSize: '1.5rem', lineHeight: '1rem' }}>+</span>} 
                  onClick={() => handleOpenManualForm('tvc')} 
                  title="Add Manual TVC" 
                />
                {isSelectedTvcManual && (
                  <>
                    <IconBtn icon="✎" size="1.1rem" onClick={() => handleEditManual('tvc', auxiliaryTvcSn)} title="Edit Entry" />
                    <IconBtn icon="🗑" size="1.1rem" color="#dc3545" onClick={() => handleDeleteManual('tvc', auxiliaryTvcSn)} title="Delete Entry" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {auxiliaryTvcSn && (
          <div className="tvc-correction-panel">
            <h3>Auxiliary View</h3>
            <p className="tvc-serial-label">S/N: {auxiliaryTvcSn}</p>
            {renderTVCTable(auxiliaryTvcSn)}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className={`corrections-modal-content ${(primaryTab === "TVC" && !isManualFormOpen) ? "modal-wide" : ""}`}>
        <header className="corrections-modal-header">
          <h3>Correction & Uncertainty Data</h3>
          <button onClick={onClose} className="modal-close-button">&times;</button>
        </header>

        <main className="corrections-modal-body">
          {!isManualFormOpen && (
            <div className="tab-navigation-modal">
              <button className={`tab-button-modal ${primaryTab === "AC Shunt" ? "active" : ""}`} onClick={() => setPrimaryTab("AC Shunt")}>AC Shunt</button>
              <button className={`tab-button-modal ${primaryTab === "TVC" ? "active" : ""}`} onClick={() => setPrimaryTab("TVC")}>TVC</button>
            </div>
          )}

          {isManualFormOpen ? (
             renderManualEntry()
          ) : (
            <>
              {primaryTab === "AC Shunt" && (
                <>
                  <div className="shunt-controls-container" style={{ display: 'flex', alignItems: 'flex-end', gap: '15px' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                      <CustomDropdown
                        key="shunt-dropdown"
                        label="Serial Number"
                        options={uniqueShuntInfo.map((info) => ({
                          value: info.serial_number,
                          label: info.size ? `${info.serial_number} (${info.size})` : info.serial_number,
                        }))}
                        value={selectedShuntSn}
                        onChange={setSelectedShuntSn}
                        placeholder="-- Select a Serial --"
                        disabled={isLoading}
                        isLoading={isLoading}
                      />
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '6px' }}>
                        <IconBtn 
                          icon={<span style={{ fontWeight: '300', fontSize: '1.5rem', lineHeight: '1rem' }}>+</span>} 
                          onClick={() => handleOpenManualForm('shunt')} 
                          title="Add Manual AC Shunt" 
                        />
                        {isSelectedShuntManual && (
                          <>
                            <IconBtn icon="✎" size="1.1rem" onClick={() => handleEditManual('shunt', selectedShuntSn)} title="Edit Entry" />
                            <IconBtn icon="🗑" size="1.1rem" color="#dc3545" onClick={() => handleDeleteManual('shunt', selectedShuntSn)} title="Delete Entry" />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="segmented-control-toggle" data-view={shuntView}>
                      <span className="segmented-control-pill"></span>
                      <button className={shuntView === "Corrections" ? "active" : ""} onClick={() => setShuntView("Corrections")}>Corrections</button>
                      <button className={shuntView === "Uncertainties" ? "active" : ""} onClick={() => setShuntView("Uncertainties")}>Uncertainties</button>
                    </div>
                  </div>
                  {renderShuntTable()}
                </>
              )}

              {primaryTab === "TVC" && renderTvcDatabasePanels()}
            </>
          )}
        </main>

        <footer className="corrections-modal-footer">
          <button onClick={onClose} className="button button-secondary">Close</button>
        </footer>
      </div>
    </div>
  );
}

export default CorrectionsModal;