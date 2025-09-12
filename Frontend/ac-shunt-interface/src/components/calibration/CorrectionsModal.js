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
    };
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

function CorrectionsModal({
  isOpen,
  onClose,
}) {
  // --- THIS IS THE FIX: Use the abbreviated names from the context ---
  const {
    standardInstrumentSerial,
    testInstrumentSerial,
    standardTvcSn, // Changed from standardTvcSerial
    testTvcSn,     // Changed from testTvcSerial
  } = useInstruments();

  const [isLoading, setIsLoading] = useState(true);
  const [shuntsData, setShuntsData] = useState([]);
  const [tvcsData, setTvcsData] = useState([]);
  const [selectedShuntSn, setSelectedShuntSn] = useState("");
  const [primaryTab, setPrimaryTab] = useState("AC Shunt");
  const [shuntView, setShuntView] = useState("Corrections");
  const [auxiliaryTvcSn, setAuxiliaryTvcSn] = useState("");

  useEffect(() => {
    if (isOpen) {
      setShuntView("Corrections");
      setAuxiliaryTvcSn("");

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

            if (standardMatch) {
              setSelectedShuntSn(String(standardInstrumentSerial));
            } else if (testMatch) {
              setSelectedShuntSn(String(testInstrumentSerial));
            } else {
              setSelectedShuntSn(shuntSerialNumbers[0]);
            }
          }
        } catch (error) {
          console.error("Failed to fetch correction data:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchData();
    }
  }, [isOpen, standardInstrumentSerial, testInstrumentSerial]);

  const uniqueShuntInfo = useMemo(() => {
    const shuntMap = new Map();
    shuntsData.forEach((shunt) => {
      if (shunt.serial_number && !shuntMap.has(shunt.serial_number)) {
        shuntMap.set(shunt.serial_number, {
          serial_number: shunt.serial_number,
          size: shunt.size,
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
    return uniqueSerials.map((sn) => ({ value: String(sn), label: String(sn) }));
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
        });
      }
      const entry = dataMap.get(key);
      const valueKey =
        shuntView === "Corrections" ? "correction" : "uncertainty";
      shunt.corrections.forEach((corr) => {
        entry.values[corr.frequency] = corr[valueKey];
      });
    });
    return { headers: frequencyHeaders, rows: Array.from(dataMap.values()) };
  }, [shuntsData, selectedShuntSn, shuntView]);

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

  const renderTvcPanels = () => {
    return (
      <div>
        <div className="tvc-display-grid">
          <div className="tvc-correction-panel">
            <h3>Standard TVC</h3>
            <p className="tvc-serial-label">
              {standardTvcSn
                ? `S/N: ${standardTvcSn}`
                : "No Standard TVC assigned."}
            </p>
            {renderTVCTable(standardTvcSn)}
          </div>
          <div className="tvc-correction-panel">
            <h3>Test TVC</h3>
            <p className="tvc-serial-label">
              {testTvcSn
                ? `S/N: ${testTvcSn}`
                : "No Test TVC assigned."}
            </p>
            {renderTVCTable(testTvcSn)}
          </div>
        </div>

        <hr className="modal-divider" />
        <div className="auxiliary-tvc-section">
          <div className="form-section">
            <label>View Corrections for Another TVC</label>
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div
        className={`corrections-modal-content ${
          primaryTab === "TVC" ? "modal-wide" : ""
        }`}
      >
        <header className="corrections-modal-header">
          <h3>Correction & Uncertainty Data</h3>
          <button
            onClick={onClose}
            className="modal-close-button"
            aria-label="Close modal"
          >
            &times;
          </button>
        </header>

        <main className="corrections-modal-body">
          <div className="tab-navigation-modal">
            <button
              className={`tab-button-modal ${
                primaryTab === "AC Shunt" ? "active" : ""
              }`}
              onClick={() => setPrimaryTab("AC Shunt")}
            >
              AC Shunt
            </button>
            <button
              className={`tab-button-modal ${
                primaryTab === "TVC" ? "active" : ""
              }`}
              onClick={() => setPrimaryTab("TVC")}
            >
              TVC
            </button>
          </div>

          {primaryTab === "AC Shunt" && (
            <>
              <div className="shunt-controls-container">
                <CustomDropdown
                  key="shunt-dropdown"
                  label="Serial Number"
                  options={uniqueShuntInfo.map((info) => ({
                    value: info.serial_number,
                    label: info.size
                      ? `${info.serial_number} (${info.size})`
                      : info.serial_number,
                  }))}
                  value={selectedShuntSn}
                  onChange={setSelectedShuntSn}
                  placeholder="-- Select a Serial --"
                  disabled={isLoading}
                  isLoading={isLoading}
                />

                <div className="segmented-control-toggle" data-view={shuntView}>
                  <span className="segmented-control-pill"></span>
                  <button
                    className={shuntView === "Corrections" ? "active" : ""}
                    onClick={() => setShuntView("Corrections")}
                  >
                    Corrections
                  </button>
                  <button
                    className={shuntView === "Uncertainties" ? "active" : ""}
                    onClick={() => setShuntView("Uncertainties")}
                  >
                    Uncertainties
                  </button>
                </div>
              </div>

              {renderShuntTable()}
            </>
          )}

          {primaryTab === "TVC" && renderTvcPanels()}
        </main>

        <footer className="corrections-modal-footer">
          <div className="modal-actions">
            <div className="modal-actions-right">
              <button onClick={onClose} className="button button-secondary">
                Close
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default CorrectionsModal;