import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  AMPLIFIER_RANGES_A,
  AVAILABLE_CURRENTS,
  AVAILABLE_FREQUENCIES,
} from "../../constants/constants";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

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
  const [tvcUpperLimit, setTvcUpperLimit] = useState("");
  const [tvcUpperLimitUnit, setTvcUpperLimitUnit] = useState("A");
  const [filteredCurrents, setFilteredCurrents] = useState([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState(new Set());

  useEffect(() => {
    if (isOpen) {
      setStep(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const { configurations } = { configurations: calibrationConfigs };
      const shuntDisplay = getDisplayValueAndUnit(configurations?.ac_shunt_range);
      const tvcDisplay = getDisplayValueAndUnit(configurations?.tvc_upper_limit);
      setShuntRange(shuntDisplay.value);
      setShuntRangeUnit(shuntDisplay.unit);
      setTvcUpperLimit(tvcDisplay.value);
      setTvcUpperLimitUnit(tvcDisplay.unit);
      setAmplifierRange(configurations?.amplifier_range || "");

      if (uniqueTestPoints && uniqueTestPoints.length > 0) {
        const uniqueCurrents = new Set(uniqueTestPoints.map((p) => p.current));
        if (uniqueCurrents.size === 1) setInputCurrent(uniqueTestPoints[0].current);
      } 
      
      setSelectedFrequencies(new Set(uniqueTestPoints.map(p => p.frequency)));
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
        tvc_upper_limit: getValueInAmps(tvcUpperLimit, tvcUpperLimitUnit),
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
    // If test points already exist, we don't need to re-save the settings.
    if (uniqueTestPoints.length > 0) {
      setStep(2);
      return;
    }
    // Otherwise, save the new settings before proceeding.
    const success = await handleSaveSettings(false);
    if (success) {
      setStep(2);
    }
  };

  const handleConfirmAndSaveFrequencies = async () => {
    const currentInputValue = parseFloat(inputCurrent);
    if (!currentInputValue) return showNotification("Please set a valid Input Current.", "error");
    if (amplifierRange === "Out of Range") return showNotification(`Input Current is out of the amplifier's range.`, "error");

    const existingFreqValues = new Set(uniqueTestPoints.map((p) => p.frequency));
    const selectedFreqObjects = AVAILABLE_FREQUENCIES.filter(f => selectedFrequencies.has(f.value));
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

  const areAllFrequenciesSelected = selectedFrequencies.size === AVAILABLE_FREQUENCIES.length;
  const handleSelectAllFrequencies = () => {
      if (areAllFrequenciesSelected) {
          setSelectedFrequencies(new Set());
      } else {
          setSelectedFrequencies(new Set(AVAILABLE_FREQUENCIES.map(f => f.value)));
      }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '700px', textAlign: 'left' }}>
        {step === 1 && (
          <>
            <div className="config-header">
              <h2>Test Point Configuration</h2>
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
                <div className="form-section">
                  <label htmlFor="tvc-upper-limit">TVC Upper Limit</label>
                  <div className="input-with-unit">
                    <input type="number" id="tvc-upper-limit" value={tvcUpperLimit} onChange={(e) => setTvcUpperLimit(e.target.value)} placeholder="e.g., 100.5" />
                    <select value={tvcUpperLimitUnit} onChange={(e) => setTvcUpperLimitUnit(e.target.value)}>
                      <option value="A">A</option>
                      <option value="mA">mA</option>
                    </select>
                  </div>
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
                // --- THIS IS THE FIX ---
                // Now, the button is only disabled if no current is set.
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
                <h3>Select Frequencies</h3>
                <button className="modal-select-all-button" onClick={handleSelectAllFrequencies}>
                    {areAllFrequenciesSelected ? 'Deselect All' : 'Select All'}
                </button>
            </div>
            <div className="frequency-list-container" style={{ maxHeight: "400px", overflowY: "auto", paddingRight: "15px" }}>
              {AVAILABLE_FREQUENCIES.map((freq) => (
                <div key={freq.value} className="frequency-selection-row">
                  <input type="checkbox" id={`freq-${freq.value}`} checked={selectedFrequencies.has(freq.value)} onChange={() => {
                      const newSelected = new Set(selectedFrequencies);
                      if (newSelected.has(freq.value)) newSelected.delete(freq.value);
                      else newSelected.add(freq.value);
                      setSelectedFrequencies(newSelected);
                  }}/>
                  <label htmlFor={`freq-${freq.value}`}>{freq.text}</label>
                </div>
              ))}
            </div>
            <div className="modal-actions">
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