import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  AMPLIFIER_RANGES_A,
  API_BASE_URL,
  AVAILABLE_CURRENTS,
  AVAILABLE_FREQUENCIES,
} from "../../constants/constants";

const getValueInAmps = (value, unit) => {
  const numericValue = parseFloat(value);
  if (isNaN(numericValue)) return null;
  return unit === "mA" ? numericValue / 1000 : numericValue;
};

const getDisplayValueAndUnit = (valueInAmps) => {
  if (valueInAmps === null || valueInAmps === undefined || isNaN(valueInAmps)) {
    return { value: "", unit: "A" };
  }
  if (valueInAmps > 0 && valueInAmps < 1) {
    return { value: valueInAmps * 1000, unit: "mA" };
  }
  return { value: valueInAmps, unit: "A" };
};

function ConfigurationModal({
  isOpen,
  onClose,
  showNotification,
  onUpdate,
  uniqueTestPoints,
  calibrationConfigs,
  selectedSessionId,
}) {
  const [step, setStep] = useState(1);
  const [inputCurrent, setInputCurrent] = useState("");
  const [shuntRange, setShuntRange] = useState("");
  const [shuntRangeUnit, setShuntRangeUnit] = useState("A");
  const [amplifierRange, setAmplifierRange] = useState("");
  const [filteredCurrents, setFilteredCurrents] = useState([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState(new Set());

  const [customFreqInput, setCustomFreqInput] = useState("");
  const [addedCustomFreqs, setAddedCustomFreqs] = useState([]);
  
  // NEW STATE: Background database for smart pre-selection
  const [shuntsDatabase, setShuntsDatabase] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCustomFreqInput("");
      
      // Fetch the corrections database in the background when the modal opens
      axios.get(`${API_BASE_URL}/shunts/`)
        .then(res => setShuntsDatabase(res.data || []))
        .catch(err => console.error("Could not fetch shunts for auto-selection", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const { configurations } = { configurations: calibrationConfigs };
      const shuntDisplay = getDisplayValueAndUnit(configurations?.ac_shunt_range);
      
      setShuntRange(shuntDisplay.value);
      setShuntRangeUnit(shuntDisplay.unit);
      setAmplifierRange(configurations?.amplifier_range || "");

      if (uniqueTestPoints && uniqueTestPoints.length > 0) {
        const uniqueCurrents = new Set(uniqueTestPoints.map((p) => p.current));
        if (uniqueCurrents.size === 1) setInputCurrent(uniqueTestPoints[0].current);
      } 
      
      // Get all frequencies currently saved in the database
      const pointFreqs = uniqueTestPoints ? uniqueTestPoints.map(p => p.frequency) : [];
      setSelectedFrequencies(new Set(pointFreqs));

      // Reconstruct custom frequencies from existing test points
      const standardFreqValues = new Set(AVAILABLE_FREQUENCIES.map(f => f.value));
      const loadedCustomFreqs = [];
      const seen = new Set(standardFreqValues);

      pointFreqs.forEach(freq => {
        if (!seen.has(freq)) {
          loadedCustomFreqs.push({ value: freq, text: `${freq}Hz (Custom)` });
          seen.add(freq); // Prevent duplicates
        }
      });

      // Merge newly loaded custom frequencies with any that might already be in state
      setAddedCustomFreqs(prev => {
        const prevValues = new Set(prev.map(f => f.value));
        const missingCustoms = loadedCustomFreqs.filter(f => !prevValues.has(f.value));
        return [...prev, ...missingCustoms];
      });
    }
  }, [isOpen, calibrationConfigs, uniqueTestPoints]);

  useEffect(() => {
    const shuntRangeInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
    if (shuntRangeInAmps && shuntRangeInAmps > 0) {
      setFilteredCurrents(AVAILABLE_CURRENTS.filter((c) => c.value <= shuntRangeInAmps || (shuntRangeInAmps === 1 && c.value === 1.09)));
    } else {
      setFilteredCurrents([]);
      if (inputCurrent) setInputCurrent("");
    }
  }, [shuntRange, shuntRangeUnit, inputCurrent]);

  useEffect(() => {
    const current = parseFloat(inputCurrent);
    if (current && !isNaN(current)) {
      const suitableRange = AMPLIFIER_RANGES_A.find((range) => current <= range);
      setAmplifierRange(suitableRange !== undefined ? suitableRange : "Out of Range");
    } else {
      setAmplifierRange("");
    }
  }, [inputCurrent]);

  // --- SMART PRE-SELECTION EFFECT ---
  useEffect(() => {
    // Don't auto-override if the user is editing an existing session with already generated points
    if (uniqueTestPoints && uniqueTestPoints.length > 0) return;

    const shuntRangeInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
    const currentInAmps = parseFloat(inputCurrent);

    if (shuntRangeInAmps !== null && currentInAmps && shuntsDatabase.length > 0) {
      // Find all shunts in the DB matching the chosen range and current
      // Using an epsilon comparison for safe floating-point match
      const matchedShunts = shuntsDatabase.filter(s => 
        Math.abs(parseFloat(s.range) - shuntRangeInAmps) < 1e-6 && 
        Math.abs(parseFloat(s.current) - currentInAmps) < 1e-6
      );

      const traceableFreqs = new Set();
      matchedShunts.forEach(shunt => {
        if (shunt.corrections) {
          shunt.corrections.forEach(c => traceableFreqs.add(Number(c.frequency)));
        }
      });

      if (traceableFreqs.size > 0) {
        const standardFreqValues = new Set(AVAILABLE_FREQUENCIES.map(f => f.value));
        const newCustomsToInject = [];

        traceableFreqs.forEach(freq => {
          // If this traceable frequency isn't in our standard UI list, prepare to add it as custom
          if (!standardFreqValues.has(freq)) {
            newCustomsToInject.push({ value: freq, text: `${freq}Hz (Traceable)` });
          }
        });

        // Inject any non-standard frequencies into the custom list so they render properly
        if (newCustomsToInject.length > 0) {
          setAddedCustomFreqs(prev => {
            const prevValues = new Set(prev.map(f => f.value));
            const uniqueNewCustoms = newCustomsToInject.filter(c => !prevValues.has(c.value));
            return [...prev, ...uniqueNewCustoms];
          });
        }
        
        // Auto-select all traceable frequencies
        setSelectedFrequencies(new Set(traceableFreqs));
      } else {
        // Clear if no matches so previous selections don't carry over
        setSelectedFrequencies(new Set());
      }
    } else if (!uniqueTestPoints || uniqueTestPoints.length === 0) {
       setSelectedFrequencies(new Set());
    }
  }, [shuntRange, shuntRangeUnit, inputCurrent, shuntsDatabase, uniqueTestPoints]);

  const handleSaveSettings = async (showNotif = true) => {
    const shuntValueInAmps = getValueInAmps(shuntRange, shuntRangeUnit);
    if (shuntValueInAmps === null) {
      showNotification("AC Shunt Range must be a valid number.", "error");
      return false;
    }
    const payload = {
      configurations: {
        ac_shunt_range: shuntValueInAmps,
        amplifier_range: parseFloat(amplifierRange) || null,
      },
    };
    try {
      await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/information/`, payload);
      if (showNotif) showNotification("Configuration updated!", "success");
      await onUpdate();
      return true;
    } catch (error) {
      console.error("[handleSaveSettings] PUT request FAILED.", error.response || error);
      showNotification(`Error saving configuration: ${error.message}`, "error");
      return false;
    }
  };

  const handleNextStep = async () => {
    if (uniqueTestPoints.length > 0) {
      setStep(2);
      return;
    }
    const success = await handleSaveSettings(false);
    if (success) {
      setStep(2);
    }
  };

  // Combine constant frequencies with user-added ones and sort them correctly
  const allAvailableFrequencies = [...AVAILABLE_FREQUENCIES, ...addedCustomFreqs].sort((a, b) => a.value - b.value);

  const handleAddCustomFrequency = () => {
    const freqVal = parseInt(customFreqInput, 10);
    
    if (isNaN(freqVal) || freqVal <= 0) {
      return showNotification("Please enter a valid positive integer for frequency.", "error");
    }

    if (allAvailableFrequencies.some(f => f.value === freqVal)) {
      return showNotification("This frequency is already in the list.", "warning");
    }

    const newFreqObj = { value: freqVal, text: `${freqVal}Hz (Custom)` };
    
    setAddedCustomFreqs(prev => [...prev, newFreqObj]);
    
    setSelectedFrequencies(prev => {
      const newSelected = new Set(prev);
      newSelected.add(freqVal);
      return newSelected;
    });

    setCustomFreqInput("");
  };

  const handleConfirmAndSaveFrequencies = async () => {
    const currentInputValue = parseFloat(inputCurrent);
    if (!currentInputValue) return showNotification("Please set a valid Input Current.", "error");
    if (amplifierRange === "Out of Range") return showNotification(`Input Current is out of the amplifier's range.`, "error");

    const existingFreqValues = new Set(uniqueTestPoints.map((p) => p.frequency));
    
    const selectedFreqObjects = allAvailableFrequencies.filter(f => selectedFrequencies.has(f.value));
    const newFrequenciesToAdd = selectedFreqObjects.filter((f) => !existingFreqValues.has(f.value));

    if (newFrequenciesToAdd.length === 0) {
      showNotification("No new frequencies were selected to add.", "info");
      onClose();
      return;
    }

    const newPoints = newFrequenciesToAdd.flatMap((freq) => [
      { current: currentInputValue, frequency: freq.value, direction: "Forward" },
      { current: currentInputValue, frequency: freq.value, direction: "Reverse" },
    ]);

    try {
      await axios.post(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/test_points/append/`, { points: newPoints });
      showNotification(`${newFrequenciesToAdd.length} new test point(s) generated!`, "success");
      await onUpdate();
      onClose();
    } catch (error) {
      showNotification("Error generating test points.", "error");
    }
  };

  const areAllFrequenciesSelected = selectedFrequencies.size === allAvailableFrequencies.length;
  
  const handleSelectAllFrequencies = () => {
      if (areAllFrequenciesSelected) {
          setSelectedFrequencies(new Set());
      } else {
          setSelectedFrequencies(new Set(allAvailableFrequencies.map(f => f.value)));
      }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content--wide">
        {step === 1 && (
          <>
            <div className="config-header">
              <h2 className="modal-section-title">Test Point Configuration</h2>
            </div>
            <div className="config-grid">
              <div className="config-column">
                <div className="form-section">
                  <label htmlFor="shunt-range">AC Shunt Range</label>
                  <div className="input-with-unit">
                    <input type="number" id="shunt-range" value={shuntRange} onChange={(e) => setShuntRange(e.target.value)} disabled={uniqueTestPoints.length > 0} placeholder="e.g., 20" />
                    <select value={shuntRangeUnit} onChange={(e) => setShuntRangeUnit(e.target.value)} disabled={uniqueTestPoints.length > 0}>
                      <option value="A">A</option>
                      <option value="mA">mA</option>
                    </select>
                  </div>
                </div>
                <div className="form-section">
                  <label htmlFor="amplifier-range">8100 Amplifier Range</label>
                  <input type="text" id="amplifier-range" value={amplifierRange ? `${amplifierRange} A` : ""} disabled readOnly />
                </div>
              </div>
              <div className="config-column">
                <div className="form-section">
                  <label htmlFor="input-current">Input Current</label>
                  <select
                    id="input-current"
                    value={inputCurrent}
                    onChange={(e) => setInputCurrent(e.target.value ? parseFloat(e.target.value) : "")}
                    disabled={uniqueTestPoints.length > 0 || filteredCurrents.length === 0}
                  >
                    <option value="">
                      {uniqueTestPoints.length > 0
                        ? "Current is locked"
                        : !shuntRange
                        ? "-- Set AC Shunt Range First --"
                        : "-- Select Current --"}
                    </option>
                    {filteredCurrents.map((current) => (
                      <option key={current.value} value={current.value}>
                        {current.text}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={onClose} className="button button-secondary">Cancel</button>
              <button
                onClick={handleNextStep}
                className="button"
                disabled={!inputCurrent}
              >
                Next: Select Frequencies
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="modal-header-flex">
                <h3 className="modal-section-title">Select Frequencies</h3>
                <button type="button" className="modal-select-all-button" onClick={handleSelectAllFrequencies}>
                    {areAllFrequenciesSelected ? 'Deselect All' : 'Select All'}
                </button>
            </div>
            
            <div className="frequency-list-container" style={{ maxHeight: "400px", overflowY: "auto", paddingLeft: "4px", paddingRight: "15px" }}>
              {allAvailableFrequencies.map((freq) => (
                <div key={freq.value} className="frequency-selection-row" style={{ padding: "8px 4px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <input type="checkbox" id={`freq-${freq.value}`} checked={selectedFrequencies.has(freq.value)} onChange={() => {
                      const newSelected = new Set(selectedFrequencies);
                      if (newSelected.has(freq.value)) newSelected.delete(freq.value);
                      else newSelected.add(freq.value);
                      setSelectedFrequencies(newSelected);
                  }}/>
                  <label htmlFor={`freq-${freq.value}`} style={{ cursor: "pointer", margin: 0 }}>{freq.text}</label>
                </div>
              ))}
            </div>

            <div className="custom-frequency-input" style={{ display: "flex", gap: "10px", marginTop: "15px", paddingLeft: "4px" }}>
              <input 
                type="number" 
                placeholder="Enter custom frequency (Hz)" 
                value={customFreqInput}
                onChange={(e) => setCustomFreqInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomFrequency()}
                style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}
              />
              <button 
                className="button button-secondary" 
                onClick={handleAddCustomFrequency}
                disabled={!customFreqInput}
              >
                Add
              </button>
            </div>
            
            <div className="modal-actions" style={{ marginTop: "20px" }}>
              <button onClick={() => setStep(1)} className="button button-secondary">Back to Configuration</button>
              <button onClick={handleConfirmAndSaveFrequencies} className="button">Generate Test Points</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ConfigurationModal;