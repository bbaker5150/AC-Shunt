/**
 * @file SessionManager.js
 * @brief Component for selecting, viewing, and resetting calibration sessions.
 * * This component displays a list of existing calibration sessions and allows
 * a user to select one or reset to a new session state. It directly updates
 * the shared InstrumentContext with the selected session's ID, name, and
 * associated instrument addresses.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { useInstruments } from '../../contexts/InstrumentContext';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

/**
 * @brief A reusable modal dialog for confirmation prompts.
 */
const ConfirmationModal = ({ isOpen, title, children, onConfirm, onCancel }) => {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content warning-modal">
                <div className="modal-header">
                    <h3>{title}</h3>
                    {/* --- REVERTED TO USE CSS CLASS --- */}
                    <button
                        onClick={onCancel}
                        title="Close"
                        className="modal-close-button"
                    >
                        &times;
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                <div className="modal-footer">
                    <button onClick={onCancel} className="button button-secondary">Cancel</button>
                    <button onClick={onConfirm} className="button button-danger">Confirm Delete</button>
                </div>
            </div>
        </div>
    );
};


function SessionManager({ sessionsList, isLoadingSessions, showNotification, fetchSessionsList }) {
    const {
        selectedSessionId,
        setSelectedSessionId,
        setSelectedSessionName,
        setStdInstrumentAddress,
        setStdReaderModel,
        setTiInstrumentAddress,
        setTiReaderModel,
        setAcSourceAddress,
        setDcSourceAddress,
        setSwitchDriverAddress,
        setSwitchDriverModel,
    } = useInstruments();

    // State to manage the confirmation modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState(null);


    /**
     * @brief Clears all session-related state from the context.
     */
    const clearSessionState = () => {
        setSelectedSessionId(null);
        setSelectedSessionName('');
        setStdInstrumentAddress(null);
        setStdReaderModel(null);
        setTiInstrumentAddress(null);
        setTiReaderModel(null);
        setAcSourceAddress(null);
        setDcSourceAddress(null);
        setSwitchDriverAddress(null);
        setSwitchDriverModel(null);
    };

    const handleSessionSelectChange = (e) => {
        const sessionId = e.target.value;
        const session = sessionsList.find(s => s.id.toString() === sessionId);

        setSelectedSessionId(sessionId || null);
        setSelectedSessionName(session ? session.name : '');

        if (session) {
            // Populate all reader and source info from the selected session
            setStdInstrumentAddress(session.standard_reader_address || null);
            setStdReaderModel(session.standard_reader_model || null);
            setTiInstrumentAddress(session.test_reader_address || null);
            setTiReaderModel(session.test_reader_model || null);
            setAcSourceAddress(session.ac_source_address || null);
            setDcSourceAddress(session.dc_source_address || null);
            setSwitchDriverAddress(session.switch_driver_address || null);
            setSwitchDriverModel(session.switch_driver_model || null);
        } else {
            // Clear everything if "-- Start New Session --" is selected
            clearSessionState();
        }
    };

    /**
     * @brief Handles the action to start a new session, clearing the form.
     */
    const handleNewSession = () => {
        clearSessionState();
        showNotification('Form cleared for a new session.', 'info');
    };

    /**
     * @brief Initiates the deletion process by opening the confirmation modal.
     */
    const handleDeleteSession = () => {
        if (!selectedSessionId) {
            showNotification('No session selected to delete.', 'warning');
            return;
        }
        const session = sessionsList.find(s => s.id.toString() === selectedSessionId.toString());
        setSessionToDelete(session);
        setIsModalOpen(true); // Open the modal
    };

    /**
     * @brief Executes the actual deletion after confirmation.
     */
    const confirmDelete = async () => {
        if (!sessionToDelete) return;

        try {
            await axios.delete(`${API_BASE_URL}/calibration_sessions/${sessionToDelete.id}/`);
            showNotification('Session deleted successfully.', 'success');
            clearSessionState();
            await fetchSessionsList(); // Refresh the list
        } catch (error) {
            console.error("Failed to delete session", error);
            showNotification('Failed to delete session.', 'error');
        } finally {
            setIsModalOpen(false); // Close modal regardless of outcome
            setSessionToDelete(null);
        }
    };

    const cancelDelete = () => {
        setIsModalOpen(false);
        setSessionToDelete(null);
    };


    return (
        <>
            <ConfirmationModal
                isOpen={isModalOpen}
                title="Confirm Deletion"
                onConfirm={confirmDelete}
                onCancel={cancelDelete}
            >
                <p>Are you sure you want to delete the session: <strong>"{sessionToDelete?.session_name}"</strong>?</p>
                <p>This action cannot be undone.</p>
            </ConfirmationModal>

            <div className="form-section">
                <label htmlFor="session-select">Manage Calibration Session</label>
                <div className="session-manager-controls">
                    <select
                        id="session-select"
                        value={selectedSessionId || ''}
                        onChange={handleSessionSelectChange}
                        disabled={isLoadingSessions}
                        className="session-select-dropdown"
                    >
                        <option value="">-- Start New Session --</option>
                        {isLoadingSessions ? <option disabled>Loading...</option> : sessionsList.map(s => (
                            <option key={s.id} value={s.id}>{s.session_name} (ID: {s.id})</option>
                        ))}
                    </select>
                    <button type="button" onClick={handleNewSession} className="button button-icon button-secondary" title="Start New Session">
                        &#43; New
                    </button>
                    <button type="button" onClick={handleDeleteSession} className="button button-icon button-danger" title="Delete Selected Session" disabled={!selectedSessionId}>
                        &#128465; Delete
                    </button>
                </div>
            </div>
        </>
    );
}

export default SessionManager;