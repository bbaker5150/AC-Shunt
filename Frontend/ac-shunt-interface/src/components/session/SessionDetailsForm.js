// src/components/session/SessionDetailsForm.js
/**
 * @file SessionDetailsForm.js
 * @brief A form for creating and editing calibration session details.
 */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { FaSave } from "react-icons/fa"; // Import the save icon
import { useInstruments } from "../../contexts/InstrumentContext";
import { API_BASE_URL } from "../../constants/constants";

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
    stdReaderSN,
    setStdReaderSN,
    tiInstrumentAddress,
    setTiInstrumentAddress,
    tiReaderModel,
    setTiReaderModel,
    tiReaderSN,
    setTiReaderSN,
    acSourceAddress,
    setAcSourceAddress,
    acSourceSN,
    setAcSourceSN,
    dcSourceAddress,
    setDcSourceAddress,
    dcSourceSN,
    setDcSourceSN,
    switchDriverAddress,
    setSwitchDriverAddress,
    switchDriverModel,
    setSwitchDriverModel,
    switchDriverSN,
    setSwitchDriverSN,
    amplifierAddress,
    setAmplifierAddress,
    amplifierSN,
    setAmplifierSN,
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
      standard_reader_serial: stdReaderSN,
      test_reader_address: tiInstrumentAddress,
      test_reader_model: tiReaderModel,
      test_reader_serial: tiReaderSN,
      ac_source_address: acSourceAddress,
      dc_source_address: dcSourceAddress,
      ac_source_serial: acSourceSN,
      dc_source_serial: dcSourceSN,
      switch_driver_address: switchDriverAddress,
      switch_driver_model: switchDriverModel,
      switch_driver_serial: switchDriverSN,
      amplifier_address: amplifierAddress,
      amplifier_serial: amplifierSN,
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
      setStdReaderSN(savedSession.standard_reader_serial || null);
      setTiInstrumentAddress(savedSession.test_reader_address || null);
      setTiReaderModel(savedSession.test_reader_model || null);
      setTiReaderSN(savedSession.test_reader_serial || null);
      setAcSourceAddress(savedSession.ac_source_address || null);
      setAcSourceSN(savedSession.ac_source_serial || null);
      setDcSourceAddress(savedSession.dc_source_address || null);
      setDcSourceSN(savedSession.dc_source_serial || null);
      setSwitchDriverAddress(savedSession.switch_driver_address || null);
      setSwitchDriverModel(savedSession.switch_driver_model || null);
      setSwitchDriverSN(savedSession.switch_driver_serial || null);
      setAmplifierAddress(savedSession.amplifier_address || null);
      setAmplifierSN(savedSession.amplifier_serial || null);
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

  const isEditing = Boolean(selectedSessionId);
  const saveTitle = isLoading
    ? "Saving…"
    : isEditing
      ? "Update session"
      : "Save new session";

  return (
    <section className="session-panel session-details-container">
      <header className="session-panel-header">
        <div className="session-panel-header-text">
          <h3 className="session-panel-title">
            {isEditing ? "Edit Session Details" : "Create New Session"}
          </h3>
        </div>
      </header>

      <form
        id="session-details-form"
        onSubmit={handleSubmit}
        className="session-details-form"
      >
        <div className="session-form-group">
          <span className="session-form-group-eyebrow">Overview</span>
          <div className="form-section-group">
            <div className="form-section full-width">
              <label htmlFor="sessionName">Session name</label>
              <input type="text" id="sessionName" name="sessionName" value={formData.sessionName} onChange={handleChange} required />
            </div>
          </div>
        </div>

        <div className="session-form-group">
          <span className="session-form-group-eyebrow">Instruments</span>
          <div className="form-section-group">
            <div className="form-section">
              <label htmlFor="standardInstrumentModel">Standard instrument</label>
              <input type="text" id="standardInstrumentModel" name="standardInstrumentModel" value={formData.standardInstrumentModel} onChange={handleChange} required />
            </div>
            <div className="form-section">
              <label htmlFor="standardInstrumentSerial">Standard serial</label>
              <input type="text" id="standardInstrumentSerial" name="standardInstrumentSerial" value={formData.standardInstrumentSerial} onChange={handleChange} required />
            </div>
            <div className="form-section">
              <label htmlFor="testInstrument">Test instrument</label>
              <input type="text" id="testInstrument" name="testInstrument" value={formData.testInstrument} onChange={handleChange} required />
            </div>
            <div className="form-section">
              <label htmlFor="testInstrumentSerial">Test serial</label>
              <input type="text" id="testInstrumentSerial" name="testInstrumentSerial" value={formData.testInstrumentSerial} onChange={handleChange} required />
            </div>
            <div className="form-section">
              <label htmlFor="standardTvcSerial">Standard TVC serial</label>
              <input type="text" id="standardTvcSerial" name="standardTvcSerial" value={formData.standardTvcSerial} onChange={handleChange} />
            </div>
            <div className="form-section">
              <label htmlFor="testTvcSerial">Test TVC serial</label>
              <input type="text" id="testTvcSerial" name="testTvcSerial" value={formData.testTvcSerial} onChange={handleChange} />
            </div>
          </div>
        </div>

        <div className="session-form-group">
          <span className="session-form-group-eyebrow">Environment &amp; notes</span>
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
        </div>

        <div className="form-section-action-icons">
          <button
            type="submit"
            className="sidebar-action-button"
            disabled={isLoading}
            aria-label={saveTitle}
            title={saveTitle}
          >
            <FaSave />
          </button>
        </div>
      </form>
    </section>
  );
}

export default SessionDetailsForm;