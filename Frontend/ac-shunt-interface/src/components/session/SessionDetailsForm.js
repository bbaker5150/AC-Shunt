// src/components/session/SessionDetailsForm.js
/**
 * @file SessionDetailsForm.js
 * @brief A form for creating and editing calibration session details.
 */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { FaSave } from "react-icons/fa"; // Import the save icon
import { useInstruments } from "../../contexts/InstrumentContext";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const initialFormData = {
  sessionName: `Calibration Session - ${new Date().toLocaleString()}`,
  testInstrument: "",
  testInstrumentSerial: "",
  standardInstrumentModel: "",
  standardInstrumentSerial: "",
  standardTvcSerial: "",
  testTvcSerial: "",
  temperature: "23.0",
  humidity: "45.0",
  notes: "",
};

function SessionDetailsForm({ sessionsList, fetchSessionsList, showNotification }) {
  const {
    selectedSessionId,
    setSelectedSessionId,
    setSelectedSessionName,
    stdInstrumentAddress,
    setStdInstrumentAddress,
    stdReaderModel,
    setStdReaderModel,
    tiInstrumentAddress,
    setTiInstrumentAddress,
    tiReaderModel,
    setTiReaderModel,
    acSourceAddress,
    setAcSourceAddress,
    dcSourceAddress,
    setDcSourceAddress,
    switchDriverAddress,
    setSwitchDriverAddress,
    switchDriverModel,
    setSwitchDriverModel,
    amplifierAddress,
    setAmplifierAddress,
    setStandardTvcSn,
    setTestTvcSn,
    setStandardInstrumentSerial,
    setTestInstrumentSerial,
  } = useInstruments();

  const [formData, setFormData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedSessionId && sessionsList.length > 0) {
      const session = sessionsList.find(s => s.id.toString() === selectedSessionId.toString());
      if (session) {
        setFormData({
          sessionName: session.session_name || "",
          testInstrument: session.test_instrument_model || "",
          testInstrumentSerial: session.test_instrument_serial || "",
          standardInstrumentModel: session.standard_instrument_model || "",
          standardInstrumentSerial: session.standard_instrument_serial || "",
          standardTvcSerial: session.standard_tvc_serial || "",
          testTvcSerial: session.test_tvc_serial || "",
          temperature: session.temperature !== null ? session.temperature.toString() : "",
          humidity: session.humidity !== null ? session.humidity.toString() : "",
          notes: session.notes || "",
        });
      }
    } else {
      setFormData(initialFormData);
    }
  }, [selectedSessionId, sessionsList]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    const payload = {
      session_name: formData.sessionName,
      test_instrument_model: formData.testInstrument,
      test_instrument_serial: formData.testInstrumentSerial,
      standard_instrument_model: formData.standardInstrumentModel,
      standard_instrument_serial: formData.standardInstrumentSerial,
      standard_tvc_serial: formData.standardTvcSerial,
      test_tvc_serial: formData.testTvcSerial,
      temperature: parseFloat(formData.temperature) || null,
      humidity: parseFloat(formData.humidity) || null,
      notes: formData.notes,
      standard_reader_address: stdInstrumentAddress,
      standard_reader_model: stdReaderModel,
      test_reader_address: tiInstrumentAddress,
      test_reader_model: tiReaderModel,
      ac_source_address: acSourceAddress,
      dc_source_address: dcSourceAddress,
      switch_driver_address: switchDriverAddress,
      switch_driver_model: switchDriverModel,
      amplifier_address: amplifierAddress,
    };

    try {
      const response = selectedSessionId
        ? await axios.put(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`, payload)
        : await axios.post(`${API_BASE_URL}/calibration_sessions/`, payload);

      showNotification(selectedSessionId ? "Session updated successfully!" : "New session saved successfully!", "success");
      
      const savedSession = response.data;
      await fetchSessionsList();
      
      setSelectedSessionId(savedSession.id);
      setSelectedSessionName(savedSession.session_name);
      setStdInstrumentAddress(savedSession.standard_reader_address || null);
      setStdReaderModel(savedSession.standard_reader_model || null);
      setTiInstrumentAddress(savedSession.test_reader_address || null);
      setTiReaderModel(savedSession.test_reader_model || null);
      setAcSourceAddress(savedSession.ac_source_address || null);
      setDcSourceAddress(savedSession.dc_source_address || null);
      setSwitchDriverAddress(savedSession.switch_driver_address || null);
      setSwitchDriverModel(savedSession.switch_driver_model || null);
      setAmplifierAddress(savedSession.amplifier_address || null);
      setStandardTvcSn(savedSession.standard_tvc_serial || null);
      setTestTvcSn(savedSession.test_tvc_serial || null);
      setStandardInstrumentSerial(savedSession.standard_instrument_serial || null);
      setTestInstrumentSerial(savedSession.test_instrument_serial || null);
    } catch (error) {
      console.error("Failed to save session", error);
      showNotification("Failed to save session.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="session-details-container">
      <h3>{selectedSessionId ? "Edit Session Details" : "Create New Session"}</h3>
      <form onSubmit={handleSubmit} className="session-details-form">
        <div className="form-section-group">
          <div className="form-section full-width">
            <label htmlFor="sessionName">Session Name</label>
            <input type="text" id="sessionName" name="sessionName" value={formData.sessionName} onChange={handleChange} required />
          </div>
        </div>
        
        <h4 className="form-group-header">Instrument Information</h4>
        <div className="form-section-group">
          <div className="form-section">
            <label htmlFor="standardInstrumentModel">Standard Instrument</label>
            <input type="text" id="standardInstrumentModel" name="standardInstrumentModel" value={formData.standardInstrumentModel} onChange={handleChange} required />
          </div>
          <div className="form-section">
            <label htmlFor="standardInstrumentSerial">Standard Serial</label>
            <input type="text" id="standardInstrumentSerial" name="standardInstrumentSerial" value={formData.standardInstrumentSerial} onChange={handleChange} required />
          </div>
          <div className="form-section">
            <label htmlFor="testInstrument">Test Instrument</label>
            <input type="text" id="testInstrument" name="testInstrument" value={formData.testInstrument} onChange={handleChange} required />
          </div>
          <div className="form-section">
            <label htmlFor="testInstrumentSerial">Test Instrument Serial</label>
            <input type="text" id="testInstrumentSerial" name="testInstrumentSerial" value={formData.testInstrumentSerial} onChange={handleChange} required />
          </div>
          <div className="form-section">
            <label htmlFor="standardTvcSerial">Standard TVC Serial</label>
            <input type="text" id="standardTvcSerial" name="standardTvcSerial" value={formData.standardTvcSerial} onChange={handleChange} />
          </div>
          <div className="form-section">
            <label htmlFor="testTvcSerial">Test TVC Serial</label>
            <input type="text" id="testTvcSerial" name="testTvcSerial" value={formData.testTvcSerial} onChange={handleChange} />
          </div>
        </div>

        <h4 className="form-group-header">Environmental Conditions & Notes</h4>
        <div className="form-section-group">
          <div className="form-section">
            <label htmlFor="temperature">Temperature (°C)</label>
            <input type="number" id="temperature" name="temperature" value={formData.temperature} onChange={handleChange} step="0.1" required />
          </div>
          <div className="form-section">
            <label htmlFor="humidity">Humidity (%RH)</label>
            <input type="number" id="humidity" name="humidity" value={formData.humidity} onChange={handleChange} step="0.1" required />
          </div>
          <div className="form-section full-width">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} rows="5" />
          </div>
        </div>

        <div className="form-submit-area">
          <button
            type="submit"
            className="sidebar-action-button"
            disabled={isLoading}
            title={isLoading ? "Saving..." : selectedSessionId ? "Update Session" : "Save New Session"}
          >
            <FaSave />
          </button>
        </div>
      </form>
    </div>
  );
}

export default SessionDetailsForm;