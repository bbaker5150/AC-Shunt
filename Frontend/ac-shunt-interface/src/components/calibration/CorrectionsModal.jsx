import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import axios from "axios";
import { useInstruments } from "../../contexts/InstrumentContext";
import { FaTimes, FaSave, FaArrowLeft, FaPlus, FaEdit, FaTrash, FaCheck } from "react-icons/fa";
import { AMPLIFIER_RANGES_A, API_BASE_URL } from "../../constants/constants";
import AnimatedModalShell from "../shared/AnimatedModalShell";

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
const IconBtn = ({ icon, onClick, title, variant, disabled, type = "button" }) => {
  const className =
    "cal-results-excel-icon-btn" +
    (variant === "danger" ? " cal-results-excel-icon-btn--danger" : "");
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={className}
    >
      {icon}
    </button>
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
  eyebrow,
}) => {
  if (!isOpen) return null;
  const isDanger = /danger/.test(confirmButtonClass);
  const eyebrowText = eyebrow ?? (isDanger ? "Warning" : "Confirm");
  return (
    <div className="modal-overlay modal-overlay--nested" onClick={onCancel}>
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="corrections-confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="confirm-modal-header">
          <div className="confirm-modal-header-text">
            <span className="confirm-modal-eyebrow">{eyebrowText}</span>
            <h3 id="corrections-confirm-modal-title" className="confirm-modal-title">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="cal-results-excel-icon-btn"
            title="Cancel"
            aria-label="Cancel"
          >
            <FaTimes aria-hidden />
          </button>
        </header>
        <div className="confirm-modal-body">
          <p className="confirm-modal-message">{message}</p>
        </div>
        <footer className="confirm-modal-footer confirm-modal-footer--icon">
          <button
            type="button"
            onClick={onConfirm}
            className={`cal-results-excel-icon-btn${isDanger ? " cal-results-excel-icon-btn--danger" : ""}`}
            title={confirmText}
            aria-label={confirmText}
          >
            <FaCheck aria-hidden />
          </button>
        </footer>
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
    selectedSessionId,
    isCollecting,
    isBulkRunning,
    isRemoteViewer,
  } = useInstruments();
  const isCalibrationActive = isCollecting || isBulkRunning;
  // Remote viewers get the modal in read-only mode: tables remain useful
  // reference material, but every mutating affordance (add/edit/delete
  // devices, the "click a row to generate test points" flow) is gated
  // behind this flag. We still check on the backend, so this is purely a
  // UX layer that keeps the buttons out of sight.
  const isReadOnly = Boolean(isRemoteViewer);

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
      label: tvc.serial_number,
    }));
  }, [tvcsData]);

  const shuntOptions = useMemo(
    () =>
      uniqueShuntInfo.map((info) => ({
        value: info.serial_number,
        label: info.size
          ? `${info.serial_number} (${info.size})`
          : info.serial_number,
      })),
    [uniqueShuntInfo]
  );

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
    // Belt-and-suspenders for remotes: the table rows render non-clickable
    // in read-only mode, but if anything re-wires the onClick we still
    // refuse to open the "generate test points" prompt.
    if (isReadOnly) return;

    if (isCalibrationActive) {
      notify(
        "Calibration is currently running. Row actions are disabled until the run finishes.",
        "warning"
      );
      return;
    }

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
        <div className="corrections-empty-state">
          <span className="corrections-empty-state-title">Loading instrument database…</span>
          <span className="corrections-empty-state-message">Fetching corrections and uncertainties.</span>
        </div>
      );
    }

    if (!selectedShuntSn) {
      return (
        <div className="corrections-empty-state">
          <span className="corrections-empty-state-title">No shunt selected</span>
          <span className="corrections-empty-state-message">
            Pick a serial number from the picker above to view its corrections.
          </span>
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="corrections-empty-state">
          <span className="corrections-empty-state-title">No data available</span>
          <span className="corrections-empty-state-message">
            No {shuntView === "Corrections" ? "correction" : "uncertainty"} data was found for this serial number.
          </span>
        </div>
      );
    }

    // Remotes see this table as pure reference data — the "click a row to
    // generate test points" shortcut is host-only, so we drop the clickable
    // styling and adjust the hint copy accordingly.
    const rowsAreInteractive = !isReadOnly && !isCalibrationActive;
    const hintCopy = isReadOnly
      ? "Read-only view. Test point generation is available to the host."
      : isCalibrationActive
        ? "Calibration is running - row actions are temporarily disabled."
        : "Click any row to generate matching test points in your active session.";

    return (
      <>
        <p className="corrections-card-hint">
          <span className="corrections-card-hint-dot" aria-hidden />
          {hintCopy}
        </p>
        <div className="corrections-table-container">
          <table className="styled-table styled-table--centered">
            <thead>
              <tr>
                <th>Range (A)</th>
                <th>Current (A)</th>
                {headers.map((freq) => (
                  <th key={freq}>{freq} Hz</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.range}-${row.current}`}
                  className={
                    rowsAreInteractive ? "styled-table-row--clickable" : ""
                  }
                  onClick={
                    rowsAreInteractive
                      ? () => handleRowClick(row, headers)
                      : undefined
                  }
                  title={
                    isReadOnly
                      ? "Read-only: observers can't generate test points"
                      : isCalibrationActive
                        ? "Disabled while calibration is running"
                        : `Generate test points for ${row.current}A`
                  }
                >
                  <td>{row.range}</td>
                  <td>{row.current}</td>
                  {headers.map((freq) => (
                    <td key={freq}>{row.values[freq] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  const renderTVCTable = (serialNumber, { compact = false } = {}) => {
    if (!serialNumber) {
      return (
        <div className={`corrections-empty-state${compact ? " corrections-empty-state--compact" : ""}`}>
          <span className="corrections-empty-state-title">Not assigned</span>
          <span className="corrections-empty-state-message">
            No TVC serial has been assigned for this role.
          </span>
        </div>
      );
    }

    const filteredTvc = tvcsData.find(
      (tvc) => String(tvc.serial_number) === String(serialNumber)
    );

    if (isLoading && (!filteredTvc || !filteredTvc.corrections?.length)) {
      return (
        <div className={`corrections-empty-state${compact ? " corrections-empty-state--compact" : ""}`}>
          <span className="corrections-empty-state-title">Loading TVC data…</span>
        </div>
      );
    }

    if (!filteredTvc?.corrections?.length) {
      return (
        <div className={`corrections-empty-state${compact ? " corrections-empty-state--compact" : ""}`}>
          <span className="corrections-empty-state-title">No corrections on file</span>
          <span className="corrections-empty-state-message">
            No correction data was found for S/N <strong>{serialNumber}</strong>.
          </span>
        </div>
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

  const renderManualEntry = () => {
    const isShunt = manualType === "shunt";
    const typeLabel = isShunt ? "AC Shunt" : "TVC";
    const actionLabel = isEditing ? "Edit" : "New";
    const value1Label = isShunt ? "Correction (ppm)" : "AC/DC Diff (ppm)";
    const value2Label = isShunt ? "Uncertainty (ppm)" : "Expanded Unc (ppm)";

    return (
      <div className="corrections-manual-form">
        <header className="corrections-manual-toolbar">
          <IconBtn
            icon={<FaArrowLeft />}
            onClick={() => setIsManualFormOpen(false)}
            disabled={isSaving}
            title="Back to browser"
          />
          <div className="corrections-manual-toolbar-title">
            <span className="corrections-card-eyebrow">{actionLabel} · {typeLabel}</span>
            <span className="corrections-card-identity">
              {manualForm.serial_number || "Unsaved entry"}
            </span>
          </div>
          <IconBtn
            icon={<FaSave />}
            onClick={handleSaveManual}
            disabled={isSaving}
            title={isSaving ? "Saving…" : "Save entry"}
          />
        </header>

        <div className="corrections-manual-body">
          <section className="corrections-card">
            <header className="corrections-card-header corrections-card-header--compact">
              <div className="corrections-card-headline">
                <span className="corrections-card-eyebrow">Identity</span>
                <span className="corrections-card-subtitle">
                  {isShunt
                    ? "Identify the shunt model, serial, and operating configuration."
                    : "Identify the TVC serial and its nominal test voltage."}
                </span>
              </div>
            </header>
            <div className="corrections-card-body">
              <div className="corrections-form-grid">
                {isShunt ? (
                  <>
                    <div className="corrections-form-field">
                      <label>Model name</label>
                      <input
                        type="text"
                        value={manualForm.model_name ?? ""}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, model_name: e.target.value }))}
                        placeholder="e.g. A40B"
                      />
                    </div>
                    <div className="corrections-form-field">
                      <label>Serial number</label>
                      <input
                        type="text"
                        disabled={isEditing}
                        value={manualForm.serial_number ?? ""}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, serial_number: e.target.value }))}
                        placeholder="e.g. 12345"
                      />
                    </div>
                    <div className="corrections-form-field">
                      <label>Range (A)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualForm.range ?? ""}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, range: e.target.value }))}
                        placeholder="e.g. 5"
                      />
                    </div>
                    <div className="corrections-form-field">
                      <label>Current (A)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualForm.current ?? ""}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, current: e.target.value }))}
                        placeholder="e.g. 5"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="corrections-form-field">
                      <label>Serial number</label>
                      <input
                        type="text"
                        disabled={isEditing}
                        value={manualForm.serial_number ?? ""}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, serial_number: e.target.value }))}
                        placeholder="e.g. 12345"
                      />
                    </div>
                    <div className="corrections-form-field">
                      <label>Test voltage (V)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualForm.test_voltage ?? ""}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, test_voltage: e.target.value }))}
                        placeholder="e.g. 0.5"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="corrections-card">
            <header className="corrections-card-header corrections-card-header--compact">
              <div className="corrections-card-headline">
                <span className="corrections-card-eyebrow">Correction points</span>
                <span className="corrections-card-subtitle">
                  {manualForm.points.length} point{manualForm.points.length === 1 ? "" : "s"} · values in ppm
                </span>
              </div>
              <div className="corrections-card-actions">
                <IconBtn
                  icon={<FaPlus />}
                  onClick={() =>
                    setManualForm({
                      ...manualForm,
                      points: [...manualForm.points, { id: null, frequency: "", val1: "", val2: "" }],
                    })
                  }
                  title="Add correction point"
                />
              </div>
            </header>

            <div className="corrections-card-body corrections-card-body--points">
              {manualForm.points.length > 0 ? (
                <div className="corrections-points-table" role="table">
                  <div className="corrections-points-thead" role="row">
                    <span role="columnheader">Frequency (Hz)</span>
                    <span role="columnheader">{value1Label}</span>
                    <span role="columnheader">{value2Label}</span>
                    <span role="columnheader" aria-hidden className="corrections-points-spacer" />
                  </div>

                  {manualForm.points.map((p, i) => (
                    <div key={i} className="corrections-points-row" role="row">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="corrections-points-input"
                        placeholder="e.g. 1000"
                        value={p.frequency ?? ""}
                        onChange={(e) => handlePointChange(i, "frequency", e.target.value)}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        className="corrections-points-input"
                        placeholder={isShunt ? "Correction" : "AC/DC diff"}
                        value={p.val1 ?? ""}
                        onChange={(e) => handlePointChange(i, "val1", e.target.value)}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        className="corrections-points-input"
                        placeholder="Uncertainty"
                        value={p.val2 ?? ""}
                        onChange={(e) => handlePointChange(i, "val2", e.target.value)}
                      />
                      <IconBtn
                        icon={<FaTimes />}
                        onClick={() =>
                          setManualForm({
                            ...manualForm,
                            points: manualForm.points.filter((_, idx) => idx !== i),
                          })
                        }
                        title="Remove point"
                        variant="danger"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="corrections-empty-state corrections-empty-state--compact">
                  <span className="corrections-empty-state-title">No correction points</span>
                  <span className="corrections-empty-state-message">
                    Use the <strong>+</strong> button above to add your first point.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderSessionTvcHeader = (rowKey, eyebrow, serial) => {
    const record = serial
      ? tvcsData.find((t) => String(t.serial_number) === String(serial))
      : null;
    const isManual = !!record?.is_manual;

    return (
      <header
        className={`corrections-card-header corrections-card-header--compact corrections-session-tvc-${rowKey}-head`}
      >
        <div className="corrections-card-headline">
          <span className="corrections-card-eyebrow">{eyebrow}</span>
          <div className="corrections-card-title">
            {serial ? (
              <>
                <span className="corrections-card-identity">S/N&nbsp;{serial}</span>
                {isManual && <span className="corrections-manual-badge">Manual</span>}
              </>
            ) : (
              <span className="corrections-card-identity corrections-card-identity--empty">
                Not assigned
              </span>
            )}
          </div>
        </div>
      </header>
    );
  };

  const renderSessionTvcBody = (rowKey, serial) => (
    <div className={`corrections-card-body corrections-session-tvc-${rowKey}-body`}>
      {renderTVCTable(serial, { compact: true })}
    </div>
  );

  const renderTvcDatabasePanels = () => {
    return (
      <div className="corrections-tab-content">
        <div className="corrections-section">
          <div className="corrections-section-heading">
            <span className="corrections-section-eyebrow">Session TVCs</span>
            <span className="corrections-section-subtitle">
              Corrections on file for the TVCs assigned to this session.
            </span>
          </div>
          <div className="corrections-session-tvc-grid">
            {renderSessionTvcHeader("std", "Standard TVC", standardTvcSn)}
            {renderSessionTvcHeader("test", "Test TVC", testTvcSn)}
            {renderSessionTvcBody("std", standardTvcSn)}
            {renderSessionTvcBody("test", testTvcSn)}
          </div>
        </div>

        <div className="corrections-section">
          <div className="corrections-section-heading">
            <span className="corrections-section-eyebrow">Auxiliary lookup</span>
            <span className="corrections-section-subtitle">
              Browse any TVC on file, or add and maintain manual entries.
            </span>
          </div>

          <section className="corrections-card">
            <header className="corrections-card-header">
              <div className="corrections-card-headline">
                <span className="corrections-card-eyebrow">Auxiliary TVC</span>
                <div className="corrections-card-picker">
                  <select
                    className="corrections-card-select"
                    value={auxiliaryTvcSn || ""}
                    onChange={(e) => setAuxiliaryTvcSn(e.target.value)}
                    disabled={isLoading}
                    aria-label="Auxiliary TVC serial number"
                  >
                    <option value="">Select a serial number...</option>
                    {tvcOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isSelectedTvcManual && (
                    <span className="corrections-manual-badge">Manual</span>
                  )}
                </div>
              </div>

              {!isReadOnly && (
                <div className="corrections-card-actions">
                  <IconBtn
                    icon={<FaPlus />}
                    onClick={() => handleOpenManualForm("tvc")}
                    title="Add manual TVC entry"
                  />
                  {isSelectedTvcManual && (
                    <>
                      <IconBtn
                        icon={<FaEdit />}
                        onClick={() => handleEditManual("tvc", auxiliaryTvcSn)}
                        title="Edit entry"
                      />
                      <IconBtn
                        icon={<FaTrash />}
                        onClick={() =>
                          setDeleteConfirm({
                            isOpen: true,
                            type: "tvc",
                            serialNumber: auxiliaryTvcSn,
                          })
                        }
                        title="Delete entry"
                        variant="danger"
                      />
                    </>
                  )}
                </div>
              )}
            </header>

            <div className="corrections-card-body">
              {auxiliaryTvcSn ? (
                renderTVCTable(auxiliaryTvcSn)
              ) : (
                <div className="corrections-empty-state">
                  <span className="corrections-empty-state-title">Nothing selected</span>
                  <span className="corrections-empty-state-message">
                    Choose a serial number from the picker above to inspect its corrections.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <>
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

      <AnimatedModalShell
        isOpen={isOpen}
        onClose={onClose}
        panelClassName="corrections-modal-content"
        panelProps={{
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "corrections-modal-title",
        }}
      >
        <header className="corrections-modal-header">
          <div className="corrections-modal-header-text">
            <span className="corrections-modal-eyebrow">
              Reference data{isReadOnly ? " · Read-only" : ""}
            </span>
            <h3 id="corrections-modal-title" className="corrections-modal-title">
              Corrections &amp; Uncertainties
            </h3>
          </div>
          <div className="corrections-modal-header-actions">
            {!isManualFormOpen && (
              <div
                className="cal-results-tabs corrections-modal-type-toggle"
                role="tablist"
                aria-label="Correction data type"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={primaryTab === "AC Shunt"}
                  className={`cal-results-tab${primaryTab === "AC Shunt" ? " is-active" : ""}`}
                  onClick={() => setPrimaryTab("AC Shunt")}
                >
                  AC Shunt
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={primaryTab === "TVC"}
                  className={`cal-results-tab${primaryTab === "TVC" ? " is-active" : ""}`}
                  onClick={() => setPrimaryTab("TVC")}
                >
                  TVC
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="cal-results-excel-icon-btn"
              title="Close"
              aria-label="Close"
            >
              <FaTimes aria-hidden />
            </button>
          </div>
        </header>

        <main className="corrections-modal-body">
          {isManualFormOpen ? (
            renderManualEntry()
          ) : primaryTab === "AC Shunt" ? (
            <section className="corrections-card corrections-card--shunt-picker">
              <header className="corrections-card-header">
                <div className="corrections-card-headline">
                  <span className="corrections-card-eyebrow">AC Shunt</span>
                  <div className="corrections-card-picker">
                    <select
                      className="corrections-card-select"
                      value={selectedShuntSn || ""}
                      onChange={(e) => setSelectedShuntSn(e.target.value)}
                      disabled={isLoading}
                      aria-label="AC Shunt serial number"
                    >
                      <option value="">Select a serial number...</option>
                      {shuntOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {isSelectedShuntManual && (
                      <span className="corrections-manual-badge">Manual</span>
                    )}
                  </div>
                </div>

                <div className="corrections-card-actions">
                  <div
                    className="cal-results-pill-group"
                    role="tablist"
                    aria-label="Shunt data view"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={shuntView === "Corrections"}
                      className={`cal-results-pill${shuntView === "Corrections" ? " is-active" : ""}`}
                      onClick={() => setShuntView("Corrections")}
                    >
                      Corrections
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={shuntView === "Uncertainties"}
                      className={`cal-results-pill${shuntView === "Uncertainties" ? " is-active" : ""}`}
                      onClick={() => setShuntView("Uncertainties")}
                    >
                      Uncertainties
                    </button>
                  </div>

                  {!isReadOnly && (
                    <>
                      <span className="corrections-card-actions-divider" aria-hidden />

                      <IconBtn
                        icon={<FaPlus />}
                        onClick={() => handleOpenManualForm("shunt")}
                        title="Add manual AC shunt entry"
                      />
                      {isSelectedShuntManual && (
                        <>
                          <IconBtn
                            icon={<FaEdit />}
                            onClick={() =>
                              handleEditManual("shunt", selectedShuntSn)
                            }
                            title="Edit entry"
                          />
                          <IconBtn
                            icon={<FaTrash />}
                            onClick={() =>
                              setDeleteConfirm({
                                isOpen: true,
                                type: "shunt",
                                serialNumber: selectedShuntSn,
                              })
                            }
                            title="Delete entry"
                            variant="danger"
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              </header>

              <div className="corrections-card-body">
                {renderShuntTable()}
              </div>
            </section>
          ) : (
            renderTvcDatabasePanels()
          )}
        </main>
      </AnimatedModalShell>
    </>
  );
}

export default CorrectionsModal;