import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import axios from "axios";
import { useInstruments } from "../../contexts/InstrumentContext";
import { FaTimes, FaSave, FaArrowLeft, FaPlus, FaEdit, FaTrash } from "react-icons/fa";
import { AMPLIFIER_RANGES_A } from "../../constants/constants";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000/api";

// --- Static Initial State (Moved outside component to fix dependency warnings) ---
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
      className={`custom-dropdown-container ${disabled ? "disabled" : ""} ${isLoading ? "loading" : ""
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

// --- Standardized Confirmation Modal ---
const ConfirmationModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  confirmButtonClass = "",
}) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 1400 }}>
      <div className="modal-content">
        <h3>{title}</h3>
        <p style={{ marginBottom: "25px", whiteSpace: "pre-wrap" }}>
          {message}
        </p>
        <div className="modal-actions">
          <button onClick={onCancel} className="button button-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`button ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

function CorrectionsModal({ isOpen, onClose, showNotification, onUpdate, uniqueTestPoints }) {
  const {
    standardInstrumentSerial,
    testInstrumentSerial,
    standardTvcSn,
    testTvcSn,
    selectedSessionId
  } = useInstruments();

  const isFirstFetch = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shuntsData, setShuntsData] = useState([]);
  const [tvcsData, setTvcsData] = useState([]);
  const [selectedShuntSn, setSelectedShuntSn] = useState("");

  const [primaryTab, setPrimaryTab] = useState("AC Shunt");
  const [shuntView, setShuntView] = useState("Corrections");
  const [auxiliaryTvcSn, setAuxiliaryTvcSn] = useState("");

  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [manualType, setManualType] = useState("shunt");
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, type: null, serialNumber: null });

  // State for confirming the automatic addition of test points from a row
  const [addPointsConfirm, setAddPointsConfirm] = useState({ isOpen: false, row: null, headers: null });

  const [manualForm, setManualForm] = useState(initialManualFormState);

  const notify = useCallback((msg, type = "info") => {
    if (showNotification) {
      showNotification(msg, type);
    } else {
      alert(msg);
    }
  }, [showNotification]);

  const fetchData = useCallback(async () => {
    // Only trigger the hard loading screen on the very first fetch
    if (isFirstFetch.current) {
      setIsLoading(true);
    }

    try {
      // Append a timestamp parameter to force a fresh pull without violating CORS headers
      const timestamp = new Date().getTime();
      const [shuntsRes, tvcsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/shunts/?t=${timestamp}`),
        axios.get(`${API_BASE_URL}/tvcs/?t=${timestamp}`),
      ]);

      const shunts = shuntsRes.data || [];
      const tvcs = tvcsRes.data || [];
      setShuntsData(shunts);
      setTvcsData(tvcs);

      // Mark the initial fetch as complete so subsequent opens refresh silently
      isFirstFetch.current = false;

      if (shunts.length > 0) {
        const shuntSerialNumbers = [
          ...new Set(shunts.map((s) => String(s.serial_number))),
        ];
        const standardMatch =
          standardInstrumentSerial &&
          shuntSerialNumbers.includes(String(standardInstrumentSerial));
        const testMatch =
          testInstrumentSerial &&
          shuntSerialNumbers.includes(String(testInstrumentSerial));

        // Use functional state update to avoid adding selectedShuntSn to dependencies
        setSelectedShuntSn((prev) => {
          if (!prev) {
            if (standardMatch) return String(standardInstrumentSerial);
            if (testMatch) return String(testInstrumentSerial);
            return shuntSerialNumbers[0];
          }
          return prev;
        });
      }
    } catch (error) {
      console.error("Failed to fetch correction data:", error);
      notify("Failed to load instrument database.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [standardInstrumentSerial, testInstrumentSerial, notify]);

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
  }, [isOpen, fetchData]);

  // --- Auto-populate Frequencies for New Shunt Entries ---
  useEffect(() => {
    if (isManualFormOpen && manualType === "shunt" && !isEditing) {
      const rangeVal = parseFloat(manualForm.range);
      const currentVal = parseFloat(manualForm.current);

      if (!isNaN(rangeVal) && !isNaN(currentVal)) {
        const matchingShunts = shuntsData.filter(
          (s) => parseFloat(s.range) === rangeVal && parseFloat(s.current) === currentVal
        );

        if (matchingShunts.length > 0) {
          const freqs = new Set();
          matchingShunts.forEach((shunt) => {
            shunt.corrections.forEach((c) => freqs.add(Number(c.frequency)));
          });

          const sortedFreqs = Array.from(freqs).sort((a, b) => a - b);

          if (sortedFreqs.length > 0) {
            const isPointsEmpty =
              manualForm.points.length === 0 ||
              (manualForm.points.length === 1 &&
                manualForm.points[0].frequency === "" &&
                manualForm.points[0].val1 === "" &&
                manualForm.points[0].val2 === "");

            if (isPointsEmpty) {
              const autoPopulatedPoints = sortedFreqs.map((freq) => ({
                id: null,
                frequency: String(freq),
                val1: "",
                val2: "",
              }));

              setManualForm((prev) => ({ ...prev, points: autoPopulatedPoints }));
              notify(`Auto-populated standard frequencies for ${rangeVal}A / ${currentVal}A`, "info");
            }
          }
        }
      }
    }
  }, [
    manualForm,
    isManualFormOpen,
    manualType,
    isEditing,
    shuntsData,
    notify,
  ]);

  const uniqueShuntInfo = useMemo(() => {
    const shuntMap = new Map();
    shuntsData.forEach((shunt) => {
      if (shunt.serial_number && !shuntMap.has(String(shunt.serial_number))) {
        shuntMap.set(String(shunt.serial_number), {
          serial_number: String(shunt.serial_number),
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
    const tvcMap = new Map();
    tvcsData.forEach((tvc) => {
      if (tvc.serial_number && !tvcMap.has(String(tvc.serial_number))) {
        tvcMap.set(String(tvc.serial_number), {
          serial_number: String(tvc.serial_number),
          is_manual: tvc.is_manual,
        });
      }
    });

    // Sort alphanumerically
    const uniqueTvcs = Array.from(tvcMap.values()).sort((a, b) =>
      a.serial_number.localeCompare(b.serial_number)
    );

    return uniqueTvcs.map((tvc) => ({
      value: tvc.serial_number,
      label: tvc.is_manual ? `${tvc.serial_number} (Manual)` : tvc.serial_number,
    }));
  }, [tvcsData]);

  const pivotedShuntData = useMemo(() => {
    if (!selectedShuntSn) return { headers: [], rows: [] };

    const filteredShunts = shuntsData.filter(
      (shunt) => String(shunt.serial_number) === String(selectedShuntSn)
    );

    if (filteredShunts.length === 0) return { headers: [], rows: [] };

    const frequencyHeaders = [
      ...new Set(
        filteredShunts.flatMap((shunt) =>
          shunt.corrections.map((c) => Number(c.frequency))
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
        entry.values[Number(corr.frequency)] = corr[valueKey];
      });
    });
    return { headers: frequencyHeaders, rows: Array.from(dataMap.values()) };
  }, [shuntsData, selectedShuntSn, shuntView]);

  const selectedShunt = shuntsData.find(s => String(s.serial_number) === String(selectedShuntSn));
  const isSelectedShuntManual = selectedShunt?.is_manual;

  const selectedTvc = tvcsData.find(t => String(t.serial_number) === String(auxiliaryTvcSn));
  const isSelectedTvcManual = selectedTvc?.is_manual;

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
      const shuntToEdit = shuntsData.find(s => String(s.serial_number) === String(serialNumber));
      if (shuntToEdit) {
        setManualForm({
          id: shuntToEdit.id,
          model_name: shuntToEdit.model_name || "",
          serial_number: String(shuntToEdit.serial_number),
          range: shuntToEdit.range ?? "",
          current: shuntToEdit.current ?? "",
          test_voltage: "",
          remark: shuntToEdit.remark || "",
          points: shuntToEdit.corrections.map(c => ({
            id: c.id || null,
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
          serial_number: String(tvcToEdit.serial_number),
          range: "",
          current: "",
          test_voltage: tvcToEdit.test_voltage ?? "",
          remark: tvcToEdit.remark || "",
          points: tvcToEdit.corrections.map(c => ({
            id: c.id || null,
            frequency: c.frequency ?? "",
            val1: c.ac_dc_difference ?? "",
            val2: c.expanded_uncertainty ?? ""
          }))
        });
      }
    }
    setIsManualFormOpen(true);
  };

  const executeDelete = async () => {
    const { type, serialNumber } = deleteConfirm;
    const endpoint = type === 'shunt' ? 'shunts' : 'tvcs';
    const device = type === 'shunt'
      ? shuntsData.find(s => String(s.serial_number) === String(serialNumber))
      : tvcsData.find(t => String(t.serial_number) === String(serialNumber));

    if (!device) {
      notify("Error: Device not found in database.", "error");
      setDeleteConfirm({ isOpen: false, type: null, serialNumber: null });
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/${endpoint}/${device.id}/`);

      notify(`${type === 'shunt' ? 'AC Shunt' : 'TVC'} entry successfully deleted.`, "success");

      if (type === 'shunt') setSelectedShuntSn("");
      else setAuxiliaryTvcSn("");

      fetchData();
    } catch (err) {
      notify(`Error deleting entry: ${err.message}`, "error");
    } finally {
      setDeleteConfirm({ isOpen: false, type: null, serialNumber: null });
    }
  };

  const handlePointChange = (index, field, value) => {
    setManualForm((prev) => {
      const newPoints = [...prev.points];
      newPoints[index] = { ...newPoints[index], [field]: value };
      return { ...prev, points: newPoints };
    });
  };

  const handleSaveManual = async () => {
    const isShunt = manualType === "shunt";
    const endpoint = isShunt ? "shunts" : "tvcs";

    const validPoints = manualForm.points.filter(
      p => p.frequency !== "" && p.frequency !== null
    );

    if (validPoints.length === 0) {
      notify("Please add at least one valid correction point.", "error");
      return;
    }

    const correctionsPayload = validPoints.map((p) => {
      const base = { frequency: parseFloat(p.frequency) };
      if (p.id) base.id = p.id;

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
      setIsSaving(true);

      if (isEditing && manualForm.id) {
        await axios.put(`${API_BASE_URL}/${endpoint}/${manualForm.id}/`, payload);
      } else {
        await axios.post(`${API_BASE_URL}/${endpoint}/`, payload);
      }

      await fetchData();
      notify("Manual entry saved successfully!", "success");
      setIsManualFormOpen(false);

      const targetSn = String(manualForm.serial_number);
      if (isShunt) setSelectedShuntSn(targetSn);
      else setAuxiliaryTvcSn(targetSn);

      setManualForm(initialManualFormState);

    } catch (err) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      notify(`Error saving: ${errMsg}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Handlers for directly creating Test Points from the table ---
  const handleRowClick = (row, headers) => {
    if (!selectedSessionId) {
      notify("Please select or create an active Calibration Session first.", "warning");
      return;
    }
    setAddPointsConfirm({ isOpen: true, row, headers });
  };

  const executeGenerateTestPoints = async () => {
    const { row, headers } = addPointsConfirm;

    const rowFrequencies = headers.filter(freq =>
      row.values[freq] !== undefined &&
      row.values[freq] !== null &&
      row.values[freq] !== "—"
    ).map(f => parseFloat(f));

    if (rowFrequencies.length === 0) {
      notify("No valid frequencies found in this row.", "warning");
      setAddPointsConfirm({ isOpen: false, row: null, headers: null });
      return;
    }

    const currentVal = parseFloat(row.current);
    const rangeVal = parseFloat(row.range);

    // Filter out frequencies that already exist in the session using parseInt
    const existingFreqs = new Set(
      (uniqueTestPoints || [])
        .filter(p => Math.abs(parseFloat(p.current) - currentVal) < 1e-6)
        .map(p => parseInt(p.frequency, 10))
    );

    const filteredFrequencies = rowFrequencies.filter(f => !existingFreqs.has(parseInt(f, 10)));

    if (filteredFrequencies.length === 0) {
      notify(`All frequencies for ${currentVal}A already exist in this session.`, "info");
      setAddPointsConfirm({ isOpen: false, row: null, headers: null });
      return;
    }

    const newPoints = filteredFrequencies.flatMap((freq) => [
      { current: currentVal, frequency: freq, direction: "Forward" },
      { current: currentVal, frequency: freq, direction: "Reverse" },
    ]);

    // Safely calculate the correct amplifier range based on current (matching ConfigurationModal logic)
    let suitableAmpRange = rangeVal;
    if (typeof AMPLIFIER_RANGES_A !== 'undefined') {
      const foundRange = AMPLIFIER_RANGES_A.find((r) => currentVal <= r);
      if (foundRange !== undefined) suitableAmpRange = foundRange;
    }

    try {
      // 1. UPDATE CONFIGURATION FIRST to prevent a WebSocket race condition
      if (!isNaN(rangeVal)) {
        await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/configurations/`, {
          amplifier_range: suitableAmpRange,
          ac_shunt_range: rangeVal
        });
      }

      // 2. APPEND POINTS (This triggers the backend to send the WS sync message)
      const response = await axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/append/`, { points: newPoints });

      notify(response.data?.message || "Test points generated and Amplifier range configured!", "success");

      if (onUpdate) await onUpdate();

      setTimeout(() => onClose(), 300);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Error generating test points.";
      notify(errorMsg, "error");
    } finally {
      setAddPointsConfirm({ isOpen: false, row: null, headers: null });
    }
  };

  const renderShuntTable = () => {
    const { headers, rows } = pivotedShuntData;

    if (isLoading && rows.length === 0) {
      return (
        <div className="corrections-table-container" style={{ minHeight: "300px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p className="placeholder-content">Loading instrument database...</p>
        </div>
      );
    }

    if (rows.length === 0)
      return (
        <p className="placeholder-content">
          No data available for this serial number.
        </p>
      );

    return (
      <div className="corrections-table-container">
        <p style={{ fontSize: "0.85rem", color: "var(--text-color-muted)", marginBottom: "10px", fontStyle: "italic" }}>
          💡 Hint: Click on any row to instantly generate test points for that configuration in your active session.
        </p>
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
              <tr
                key={`${row.range}-${row.current}`}
                onClick={() => handleRowClick(row, headers)}
                style={{ cursor: "pointer", transition: "background-color 0.2s ease" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--hover-bg-color, rgba(0, 123, 255, 0.1))"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                title={`Generate test points for ${row.current}A`}
              >
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

    if (isLoading && (!filteredTvc || !filteredTvc.corrections?.length)) {
      return (
        <div className="corrections-table-container" style={{ minHeight: "150px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p className="placeholder-content">Loading TVC data...</p>
        </div>
      );
    }

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
                  onChange={(e) => setManualForm(prev => ({ ...prev, model_name: e.target.value }))}
                  placeholder="e.g. A40B"
                />
              </div>
              <div className="form-section">
                <label>Serial Number</label>
                <input
                  type="text"
                  disabled={isEditing}
                  value={manualForm.serial_number ?? ''}
                  onChange={(e) => setManualForm(prev => ({ ...prev, serial_number: e.target.value }))}
                  placeholder="e.g. 12345"
                />
              </div>
              <div className="form-section">
                <label>Range (A)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualForm.range ?? ''}
                  onChange={(e) => setManualForm(prev => ({ ...prev, range: e.target.value }))}
                  placeholder="e.g. 5"
                />
              </div>
              <div className="form-section">
                <label>Current (A)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualForm.current ?? ''}
                  onChange={(e) => setManualForm(prev => ({ ...prev, current: e.target.value }))}
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
                  onChange={(e) => setManualForm(prev => ({ ...prev, serial_number: e.target.value }))}
                  placeholder="e.g. 12345"
                />
              </div>
              <div className="form-section">
                <label>Test Voltage (V)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualForm.test_voltage ?? ''}
                  onChange={(e) => setManualForm(prev => ({ ...prev, test_voltage: e.target.value }))}
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
          <IconBtn
            icon={<FaPlus />}
            onClick={() => setManualForm({ ...manualForm, points: [...manualForm.points, { id: null, frequency: '', val1: '', val2: '' }] })}
            title="Add Point"
            size="1.2rem"
          />
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
                  background: 'none', border: 'none', color: '#dc3545', fontSize: '1.2rem', cursor: 'pointer', opacity: 0.7, margin: 0, flexShrink: 0, display: 'flex', alignItems: 'center'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                onClick={() => setManualForm({ ...manualForm, points: manualForm.points.filter((_, idx) => idx !== i) })}
                title="Remove Point"
              >
                <FaTimes />
              </button>
            </div>
          ))}
          {manualForm.points.length === 0 && (
            <div className="placeholder-content" style={{ padding: "30px 20px" }}>
              <p style={{ margin: 0 }}>No correction points added. Click the + icon above to begin.</p>
            </div>
          )}
        </div>
      </div>

      <div className="form-submit-area" style={{ display: "flex", gap: "15px", justifyContent: "flex-end" }}>
        <button
          className="sidebar-action-button"
          onClick={() => setIsManualFormOpen(false)}
          disabled={isSaving}
          title="Go Back / Cancel"
        >
          <FaArrowLeft />
        </button>
        <button
          className="sidebar-action-button"
          onClick={handleSaveManual}
          disabled={isSaving}
          title={isSaving ? "Saving..." : "Save Entry"}
        >
          <FaSave />
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
                  icon={<FaPlus />}
                  onClick={() => handleOpenManualForm('tvc')}
                  title="Add Manual TVC"
                />
                {isSelectedTvcManual && (
                  <>
                    <IconBtn icon={<FaEdit />} size="1.1rem" onClick={() => handleEditManual('tvc', auxiliaryTvcSn)} title="Edit Entry" />
                    <IconBtn icon={<FaTrash />} size="1.1rem" color="#dc3545" onClick={() => setDeleteConfirm({ isOpen: true, type: 'tvc', serialNumber: auxiliaryTvcSn })} title="Delete Entry" />
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
      <ConfirmationModal
        isOpen={deleteConfirm.isOpen}
        title="Confirm Deletion"
        message={`Are you sure you want to permanently delete the manual entry for S/N: ${deleteConfirm.serialNumber}?`}
        confirmText="Delete"
        confirmButtonClass="button-danger"
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: null, serialNumber: null })}
      />

      <ConfirmationModal
        isOpen={addPointsConfirm.isOpen}
        title="Generate Test Points?"
        message={`Are you sure you want to add test points for ${addPointsConfirm.row?.current}A at all available frequencies to the current calibration session?`}
        confirmText="Generate Points"
        confirmButtonClass="button-primary"
        onConfirm={executeGenerateTestPoints}
        onCancel={() => setAddPointsConfirm({ isOpen: false, row: null, headers: null })}
      />

      <div className={`corrections-modal-content ${(primaryTab === "TVC" && !isManualFormOpen) ? "modal-wide" : ""}`}>
        <header className="corrections-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Correction & Uncertainty Data</h3>
          <button onClick={onClose} className="modal-close-button" style={{ position: "static" }} title="Close">
            <FaTimes />
          </button>
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
                        options={uniqueShuntInfo.map((info) => {
                          let labelStr = info.size ? `${info.serial_number} (${info.size})` : info.serial_number;
                          if (info.is_manual) labelStr += " (Manual)";
                          return {
                            value: info.serial_number,
                            label: labelStr,
                          };
                        })}
                        value={selectedShuntSn}
                        onChange={setSelectedShuntSn}
                        placeholder="-- Select a Serial --"
                        disabled={isLoading}
                        isLoading={isLoading}
                      />

                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '6px' }}>
                        <IconBtn
                          icon={<FaPlus />}
                          onClick={() => handleOpenManualForm('shunt')}
                          title="Add Manual AC Shunt"
                        />
                        {isSelectedShuntManual && (
                          <>
                            <IconBtn icon={<FaEdit />} size="1.1rem" onClick={() => handleEditManual('shunt', selectedShuntSn)} title="Edit Entry" />
                            <IconBtn icon={<FaTrash />} size="1.1rem" color="#dc3545" onClick={() => setDeleteConfirm({ isOpen: true, type: 'shunt', serialNumber: selectedShuntSn })} title="Delete Entry" />
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
      </div>
    </div>
  );
}

export default CorrectionsModal;