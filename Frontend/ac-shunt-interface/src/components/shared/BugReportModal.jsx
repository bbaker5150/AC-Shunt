import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  FaTimes,
  FaBug,
  FaSave,
  FaChevronLeft,
  FaSync,
  FaEdit,
  FaTrashAlt,
} from "react-icons/fa";
import { API_BASE_URL } from "../../constants/constants";
import CustomDropdown from "./CustomDropdown";
import AnimatedModalShell from "./AnimatedModalShell";

const SEVERITY_OPTIONS = [
  { label: "Low", value: "Low" },
  { label: "Medium", value: "Medium" },
  { label: "High", value: "High" },
  { label: "Critical", value: "Critical" },
];

const CATEGORY_OPTIONS = [
  { label: "UI / UX", value: "UI/UX" },
  { label: "Hardware communication", value: "Hardware Communication" },
  { label: "Calculation accuracy", value: "Calculation Accuracy" },
  { label: "Database / sync", value: "Database/Sync" },
  { label: "Other", value: "Other" },
];

const STATUS_OPTIONS = [
  { label: "Not started", value: "Not Started" },
  { label: "In work", value: "In Work" },
  { label: "Solved", value: "Solved" },
];

const INITIAL_FORM = {
  title: "",
  severity: "Medium",
  category: "UI/UX",
  description: "",
  steps: "",
};

function buildSystemInfoSnapshot({
  dbInfo,
  sessionInfo,
  selectedSessionId,
  selectedSessionName,
  activeTab,
  theme,
}) {
  try {
    return JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        theme: theme || null,
        activeTab: activeTab || null,
        session: {
          id: selectedSessionId ?? null,
          name: selectedSessionName || null,
        },
        sessionInfoSnapshot:
          sessionInfo && Object.keys(sessionInfo).length
            ? {
                test_instrument_model: sessionInfo.test_instrument_model,
                test_instrument_serial: sessionInfo.test_instrument_serial,
                standard_instrument_model: sessionInfo.standard_instrument_model,
                standard_instrument_serial: sessionInfo.standard_instrument_serial,
                created_at: sessionInfo.created_at,
              }
            : null,
        database: dbInfo
          ? {
              database_type: dbInfo.database_type,
              database_name: dbInfo.database_name,
              outbox: dbInfo.outbox || null,
            }
          : null,
      },
      null,
      2
    );
  } catch {
    return "";
  }
}

function formatReportTimestamp(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function normalizeListResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function formatSystemInfoBlock(raw) {
  if (!raw || !String(raw).trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(raw);
  }
}

function statusVisualClass(status) {
  const s = (status || "Not Started").toLowerCase();
  if (s === "solved") return "solved";
  if (s === "in work") return "in-work";
  return "not-started";
}

function mergeReportIntoList(list, updated) {
  return list.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
}

function reportToEditForm(r) {
  return {
    title: r.title || "",
    severity: r.severity || "Medium",
    category: r.category || "UI/UX",
    status: r.status || "Not Started",
    description: r.description || "",
    steps: r.steps || "",
  };
}

/**
 * Report issues — chrome, form fields, and segmented tabs match session /
 * calibration UI language; submit uses the same metallic save control as
 * session details. Refresh uses cal-results-excel-icon-btn (instruments).
 */
function BugReportModal({
  isOpen,
  onClose,
  showNotification,
  dbInfo,
  sessionInfo,
  selectedSessionId,
  selectedSessionName,
  activeTab,
  theme,
}) {
  const [panel, setPanel] = useState("new");
  const [form, setForm] = useState(INITIAL_FORM);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reports, setReports] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [editForm, setEditForm] = useState(reportToEditForm({}));
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPanel("new");
    setForm(INITIAL_FORM);
    setIncludeDiagnostics(true);
    setIsSubmitting(false);
    setSelectedReport(null);
    setDetailEditMode(false);
    setListError(null);
    setReports([]);
    setIsDeleteConfirmOpen(false);

    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/bug_reports/`);
        if (!cancelled) setReports(normalizeListResponse(data));
      } catch {
        if (!cancelled) setReports([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const fetchReports = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/bug_reports/`);
      setReports(normalizeListResponse(data));
    } catch (err) {
      const msg =
        err.response?.status === 403 || err.response?.status === 401
          ? "You don’t have access to the report list."
          : "Could not load reports.";
      setListError(msg);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || panel !== "browse") return;
    fetchReports();
  }, [isOpen, panel, fetchReports]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (isDeleteConfirmOpen) {
        setIsDeleteConfirmOpen(false);
        return;
      }
      if (panel === "browse" && selectedReport) {
        if (detailEditMode) {
          setDetailEditMode(false);
          return;
        }
        setSelectedReport(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    isOpen,
    onClose,
    panel,
    selectedReport,
    detailEditMode,
    isDeleteConfirmOpen,
  ]);

  useEffect(() => {
    if (!selectedReport) {
      setDetailEditMode(false);
      return;
    }
    setEditForm(reportToEditForm(selectedReport));
  }, [selectedReport]);

  useEffect(() => {
    if (selectedReport?.id != null) {
      setDetailEditMode(false);
    }
  }, [selectedReport?.id]);

  const handleChange = useCallback((field) => (e) => {
    const v = e.target.value;
    setForm((prev) => ({ ...prev, [field]: v }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    if (!title || !description) {
      showNotification("Please enter a title and description.", "warning");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        title,
        severity: form.severity,
        category: form.category,
        description,
        steps: form.steps.trim() || null,
        system_info: includeDiagnostics
          ? buildSystemInfoSnapshot({
              dbInfo,
              sessionInfo,
              selectedSessionId,
              selectedSessionName,
              activeTab,
              theme,
            })
          : null,
      };
      await axios.post(`${API_BASE_URL}/bug_reports/`, payload);
      showNotification("Thank you — your report was submitted.", "success");
      onClose();
    } catch (err) {
      const msg =
        err.response?.data && typeof err.response.data === "object"
          ? Object.values(err.response.data).flat().join(" ") ||
            "Could not submit report."
          : err.message || "Could not submit report.";
      showNotification(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const patchStatus = async (reportId, status) => {
    setIsStatusSaving(true);
    try {
      const { data } = await axios.patch(
        `${API_BASE_URL}/bug_reports/${reportId}/`,
        { status }
      );
      setSelectedReport(data);
      setReports((prev) => mergeReportIntoList(prev, data));
      showNotification("Status updated.", "success");
    } catch (err) {
      const msg =
        err.response?.data && typeof err.response.data === "object"
          ? Object.values(err.response.data).flat().join(" ") ||
            "Could not update status."
          : err.message || "Could not update status.";
      showNotification(msg, "error");
    } finally {
      setIsStatusSaving(false);
    }
  };

  const saveDetailEdit = async () => {
    if (!selectedReport) return;
    const title = editForm.title.trim();
    const description = editForm.description.trim();
    if (!title || !description) {
      showNotification("Title and description are required.", "warning");
      return;
    }
    setIsSavingEdit(true);
    try {
      const { data } = await axios.patch(
        `${API_BASE_URL}/bug_reports/${selectedReport.id}/`,
        {
          title,
          severity: editForm.severity,
          category: editForm.category,
          status: editForm.status,
          description,
          steps: editForm.steps.trim() || null,
        }
      );
      setDetailEditMode(false);
      setSelectedReport(data);
      setReports((prev) => mergeReportIntoList(prev, data));
      showNotification("Report updated.", "success");
    } catch (err) {
      const msg =
        err.response?.data && typeof err.response.data === "object"
          ? Object.values(err.response.data).flat().join(" ") ||
            "Could not save changes."
          : err.message || "Could not save changes.";
      showNotification(msg, "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const cancelDetailEdit = () => {
    if (selectedReport) setEditForm(reportToEditForm(selectedReport));
    setDetailEditMode(false);
  };

  const confirmDeleteReport = async () => {
    if (!selectedReport) return;
    setIsDeleting(true);
    try {
      await axios.delete(
        `${API_BASE_URL}/bug_reports/${selectedReport.id}/`
      );
      setReports((prev) => prev.filter((r) => r.id !== selectedReport.id));
      setSelectedReport(null);
      setIsDeleteConfirmOpen(false);
      showNotification("Report deleted.", "error");
    } catch (err) {
      const msg =
        err.response?.data && typeof err.response.data === "object"
          ? Object.values(err.response.data).flat().join(" ") ||
            "Could not delete report."
          : err.message || "Could not delete report.";
      showNotification(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const systemInfoFormatted = selectedReport
    ? formatSystemInfoBlock(selectedReport.system_info)
    : null;

  return (
    <>
      <AnimatedModalShell
        isOpen={isOpen}
        onClose={onClose}
        panelClassName="bug-report-modal"
        panelProps={{
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "bug-report-modal-title",
        }}
      >
        <header className="bug-report-modal-header">
          <div className="bug-report-modal-header-text">
            <span className="bug-report-modal-eyebrow">Feedback</span>
            <h3 id="bug-report-modal-title" className="bug-report-modal-title">
              <FaBug aria-hidden className="bug-report-modal-title-icon" />
              Issue tracker
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cal-results-excel-icon-btn"
            title="Close"
            aria-label="Close"
          >
            <FaTimes aria-hidden />
          </button>
        </header>

        <div
          className="bug-report-modal-tabs"
          role="tablist"
          aria-label="Issue tracker sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={panel === "new"}
            className={`bug-report-tab${panel === "new" ? " is-active" : ""}`}
            onClick={() => {
              setPanel("new");
              setSelectedReport(null);
            }}
          >
            New report
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={panel === "browse"}
            className={`bug-report-tab${panel === "browse" ? " is-active" : ""}`}
            onClick={() => setPanel("browse")}
          >
            Submitted
            {reports.length > 0 && (
              <span className="bug-report-tab-count" aria-hidden>
                {reports.length > 99 ? "99+" : reports.length}
              </span>
            )}
          </button>
        </div>

        {panel === "new" ? (
          <form className="bug-report-modal-body" onSubmit={handleSubmit}>
            <div className="session-details-form">
              <div className="session-form-group">
                <span className="session-form-group-eyebrow">Details</span>
                <div className="form-section-group">
                  <div className="form-section full-width">
                    <label htmlFor="bug-report-title">Title</label>
                    <input
                      id="bug-report-title"
                      type="text"
                      value={form.title}
                      onChange={handleChange("title")}
                      placeholder="Short summary of the problem"
                      autoComplete="off"
                      maxLength={255}
                    />
                  </div>
                  <div className="form-section">
                    <CustomDropdown
                      label="Severity"
                      options={SEVERITY_OPTIONS}
                      value={form.severity}
                      onChange={(v) =>
                        setForm((prev) => ({ ...prev, severity: v }))
                      }
                      placeholder="Severity"
                      searchable={false}
                      ariaLabel="Severity"
                    />
                  </div>
                  <div className="form-section">
                    <CustomDropdown
                      label="Category"
                      options={CATEGORY_OPTIONS}
                      value={form.category}
                      onChange={(v) =>
                        setForm((prev) => ({ ...prev, category: v }))
                      }
                      placeholder="Category"
                      searchable={false}
                      ariaLabel="Category"
                    />
                  </div>
                  <div className="form-section full-width">
                    <label htmlFor="bug-report-description">Description</label>
                    <textarea
                      id="bug-report-description"
                      value={form.description}
                      onChange={handleChange("description")}
                      placeholder="What went wrong? What did you expect?"
                      rows={5}
                    />
                  </div>
                  <div className="form-section full-width">
                    <label htmlFor="bug-report-steps">
                      Steps to reproduce{" "}
                      <span className="bug-report-optional">(optional)</span>
                    </label>
                    <textarea
                      id="bug-report-steps"
                      value={form.steps}
                      onChange={handleChange("steps")}
                      placeholder={"1. …\n2. …"}
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <div className="bug-report-diagnostics-card">
                <label className="bug-report-diagnostics-label" htmlFor="bug-report-diagnostics">
                  <input
                    id="bug-report-diagnostics"
                    type="checkbox"
                    className="bug-report-diagnostics-input"
                    checked={includeDiagnostics}
                    onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                  />
                  <span className="bug-report-diagnostics-copy">
                    <span className="bug-report-diagnostics-title">
                      Include diagnostic snapshot
                    </span>
                    <span className="bug-report-diagnostics-desc">
                      Session summary, database mode, theme, and active tab —
                      helps the team reproduce the issue.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <footer className="bug-report-modal-footer">
              <p className="bug-report-footer-hint">
                {includeDiagnostics
                  ? "A structured context bundle will be attached."
                  : "Only the fields above will be sent."}
              </p>
              <button
                type="submit"
                className="sidebar-action-button"
                disabled={isSubmitting}
                aria-label={isSubmitting ? "Submitting report" : "Submit report"}
                title={isSubmitting ? "Submitting…" : "Submit report"}
              >
                <FaSave aria-hidden />
              </button>
            </footer>
          </form>
        ) : (
          <div className="bug-report-modal-body bug-report-modal-body--browse">
            {selectedReport ? (
              <div className="bug-report-detail">
                <div className="bug-report-detail-toolbar">
                  <button
                    type="button"
                    className="bug-report-back-btn"
                    onClick={() => setSelectedReport(null)}
                  >
                    <FaChevronLeft aria-hidden />
                    <span>All reports</span>
                  </button>
                  <div className="bug-report-detail-toolbar-actions">
                    {!detailEditMode ? (
                      <>
                        <button
                          type="button"
                          className="cal-results-excel-icon-btn"
                          onClick={() => {
                            setEditForm(reportToEditForm(selectedReport));
                            setDetailEditMode(true);
                          }}
                          title="Edit report"
                          aria-label="Edit report"
                        >
                          <FaEdit aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="cal-results-excel-icon-btn cal-results-excel-icon-btn--danger"
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          title="Delete report"
                          aria-label="Delete report"
                        >
                          <FaTrashAlt aria-hidden />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="bug-report-detail-status-row">
                  <div className="form-section bug-report-status-dropdown">
                    <CustomDropdown
                      label="Workflow status"
                      options={STATUS_OPTIONS}
                      value={detailEditMode ? editForm.status : selectedReport.status}
                      onChange={(v) => {
                        if (detailEditMode) {
                          setEditForm((prev) => ({ ...prev, status: v }));
                        } else if (selectedReport && v !== selectedReport.status) {
                          patchStatus(selectedReport.id, v);
                        }
                      }}
                      placeholder="Status"
                      searchable={false}
                      ariaLabel="Workflow status"
                      disabled={isStatusSaving || isSavingEdit}
                    />
                  </div>
                  <div className="bug-report-detail-meta-inline">
                    <span
                      className={`bug-report-status-pill bug-report-status-pill--${statusVisualClass(detailEditMode ? editForm.status : selectedReport.status)}`}
                    >
                      {detailEditMode ? editForm.status : selectedReport.status}
                    </span>
                    <span
                      className={`bug-report-severity bug-report-severity--${String(selectedReport.severity || "medium").toLowerCase()}`}
                    >
                      {selectedReport.severity || "—"}
                    </span>
                    <time
                      className="bug-report-detail-date"
                      dateTime={selectedReport.created_at || undefined}
                    >
                      {formatReportTimestamp(selectedReport.created_at)}
                    </time>
                  </div>
                </div>

                <p className="bug-report-detail-category-line">
                  {detailEditMode ? editForm.category : selectedReport.category}
                </p>

                {detailEditMode ? (
                  <div className="session-details-form bug-report-edit-form">
                    <div className="form-section-group">
                      <div className="form-section full-width">
                        <label htmlFor="bug-edit-title">Title</label>
                        <input
                          id="bug-edit-title"
                          type="text"
                          value={editForm.title}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, title: e.target.value }))
                          }
                          maxLength={255}
                        />
                      </div>
                      <div className="form-section">
                        <CustomDropdown
                          label="Severity"
                          options={SEVERITY_OPTIONS}
                          value={editForm.severity}
                          onChange={(v) =>
                            setEditForm((p) => ({ ...p, severity: v }))
                          }
                          placeholder="Severity"
                          searchable={false}
                          ariaLabel="Severity"
                        />
                      </div>
                      <div className="form-section">
                        <CustomDropdown
                          label="Category"
                          options={CATEGORY_OPTIONS}
                          value={editForm.category}
                          onChange={(v) =>
                            setEditForm((p) => ({ ...p, category: v }))
                          }
                          placeholder="Category"
                          searchable={false}
                          ariaLabel="Category"
                        />
                      </div>
                      <div className="form-section full-width">
                        <label htmlFor="bug-edit-description">Description</label>
                        <textarea
                          id="bug-edit-description"
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                          rows={5}
                        />
                      </div>
                      <div className="form-section full-width">
                        <label htmlFor="bug-edit-steps">
                          Steps to reproduce{" "}
                          <span className="bug-report-optional">(optional)</span>
                        </label>
                        <textarea
                          id="bug-edit-steps"
                          value={editForm.steps}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, steps: e.target.value }))
                          }
                          rows={4}
                        />
                      </div>
                    </div>
                    <footer className="bug-report-detail-edit-footer">
                      <button
                        type="button"
                        className="bug-report-text-btn"
                        onClick={cancelDetailEdit}
                        disabled={isSavingEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="sidebar-action-button"
                        onClick={saveDetailEdit}
                        disabled={isSavingEdit}
                        title="Save changes"
                        aria-label="Save changes"
                      >
                        <FaSave aria-hidden />
                      </button>
                    </footer>
                  </div>
                ) : (
                  <>
                    <h4 className="bug-report-detail-title">
                      {selectedReport.title}
                    </h4>
                    <div className="bug-report-detail-section">
                      <span className="bug-report-detail-section-label">
                        Description
                      </span>
                      <div className="bug-report-detail-prose">
                        {selectedReport.description}
                      </div>
                    </div>
                    {selectedReport.steps ? (
                      <div className="bug-report-detail-section">
                        <span className="bug-report-detail-section-label">
                          Steps to reproduce
                        </span>
                        <div className="bug-report-detail-prose bug-report-detail-prose--steps">
                          {selectedReport.steps}
                        </div>
                      </div>
                    ) : null}
                    {systemInfoFormatted ? (
                      <details className="bug-report-diagnostics-details">
                        <summary>Diagnostic snapshot</summary>
                        <pre
                          className="bug-report-diagnostics-pre"
                          tabIndex={0}
                        >
                          {systemInfoFormatted}
                        </pre>
                      </details>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="bug-report-browse-toolbar">
                  <p className="bug-report-browse-intro">
                    Newest submissions from this workstation. Select a row for
                    full detail, status, and edits.
                  </p>
                  <button
                    type="button"
                    className="cal-results-excel-icon-btn"
                    onClick={fetchReports}
                    disabled={listLoading}
                    title="Refresh list"
                    aria-label="Refresh report list"
                  >
                    <FaSync
                      aria-hidden
                      className={listLoading ? "bug-report-sync--spin" : ""}
                    />
                  </button>
                </div>
                <div className="bug-report-list-wrap">
                  {listLoading && !reports.length ? (
                    <p className="bug-report-list-placeholder">Loading reports…</p>
                  ) : null}
                  {listError && !listLoading ? (
                    <p className="bug-report-list-error">{listError}</p>
                  ) : null}
                  {!listLoading && !listError && reports.length === 0 ? (
                    <div className="bug-report-empty-state">
                      <span className="bug-report-empty-eyebrow">Inbox zero</span>
                      <p className="bug-report-empty-title">No reports yet</p>
                      <p className="bug-report-empty-copy">
                        When your team files issues from this app, they will
                        appear here in reverse chronological order.
                      </p>
                    </div>
                  ) : null}
                  <ul className="bug-report-list" aria-label="Submitted reports">
                    {reports.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="bug-report-list-item"
                          onClick={() => setSelectedReport(r)}
                        >
                          <div className="bug-report-list-item-top">
                            <span className="bug-report-list-title">
                              {r.title}
                            </span>
                            <span
                              className={`bug-report-status-pill bug-report-status-pill--${statusVisualClass(r.status)}`}
                            >
                              {r.status || "Not Started"}
                            </span>
                          </div>
                          <div className="bug-report-list-item-mid">
                            <span
                              className={`bug-report-severity bug-report-severity--${String(r.severity || "medium").toLowerCase()}`}
                            >
                              {r.severity}
                            </span>
                            <span className="bug-report-list-category">
                              {r.category}
                            </span>
                          </div>
                          <div className="bug-report-list-item-bottom">
                            <time dateTime={r.created_at || undefined}>
                              {formatReportTimestamp(r.created_at)}
                            </time>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </AnimatedModalShell>

      {isDeleteConfirmOpen && selectedReport ? (
        <div
          className="modal-overlay modal-overlay--nested"
          onClick={() => !isDeleting && setIsDeleteConfirmOpen(false)}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <div className="confirm-modal-header-text">
                <span className="confirm-modal-eyebrow">Warning</span>
                <h3
                  id="bug-report-delete-title"
                  className="confirm-modal-title"
                >
                  Delete this report?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setIsDeleteConfirmOpen(false)}
                className="cal-results-excel-icon-btn"
                title="Close"
                aria-label="Close"
                disabled={isDeleting}
              >
                <FaTimes aria-hidden />
              </button>
            </header>
            <div className="confirm-modal-body">
              <p className="confirm-modal-message">
                <strong>{selectedReport.title}</strong> will be removed
                permanently. This cannot be undone.
              </p>
            </div>
            <footer className="confirm-modal-footer">
              <button
                type="button"
                onClick={confirmDeleteReport}
                className="confirm-modal-action confirm-modal-action--danger"
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete report"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default BugReportModal;
