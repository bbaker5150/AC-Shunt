import React from "react";
import { FaTimes } from "react-icons/fa";

const RangeSummaryTable = ({ title, results, prefix }) => {
  const READING_TYPES = [
    { label: "AC Open", key: "ac_open" },
    { label: "DC+", key: "dc_pos" },
    { label: "DC-", key: "dc_neg" },
    { label: "AC Close", key: "ac_close" },
  ];

  return (
    <div className="accordion-card" style={{ marginBottom: "15px" }}>
      <div className="accordion-header" style={{ cursor: "default" }}>
        <h4>{title}</h4>
      </div>
      <div className="accordion-content">
        <div className="table-container">
          <table className="cal-results-table">
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Average (V)</th>
                <th>Std. Dev. (V)</th>
              </tr>
            </thead>
            <tbody>
              {READING_TYPES.map((rt) => {
                const avgKey = `${prefix}${rt.key}_avg`;
                const stddevKey = `${prefix}${rt.key}_stddev`;
                const average = results?.[avgKey];
                const stddev = results?.[stddevKey];
                return (
                  <tr key={rt.key}>
                    <td>{rt.label}</td>
                    <td>{average ? average.toPrecision(8) : "---"}</td>
                    <td>{stddev ? stddev.toPrecision(4) : "---"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ModalFinalResultCard = ({ value }) => (
  <div className="final-result-card modal-result-card">
    <h4>Calculated AC-DC Difference</h4>
    <p>
      {value != null ? parseFloat(value).toFixed(3) : "---"}
      <span>PPM</span>
    </p>
  </div>
);

const RangeResultsModal = ({ isOpen, onClose, results, rangeInfo }) => {
  if (!isOpen || !results) return null;

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{ maxWidth: "800px", textAlign: "left" }}
      >
        <div
          className="modal-header"
          style={{
            textAlign: "center",
            borderBottom: "none",
            paddingBottom: 0,
          }}
        >
          <button onClick={onClose} className="modal-close-button">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body" style={{ padding: "20px 0" }}>
          <ModalFinalResultCard value={results.delta_uut_ppm} />
          <RangeSummaryTable
            title="Standard Instrument"
            results={results}
            prefix="std_"
          />
          <RangeSummaryTable
            title="Test Instrument"
            results={results}
            prefix="ti_"
          />
        </div>

        <div className="form-section-warning" style={{ margin: "15px 0 0 0" }}>
          <p style={{ margin: 0 }}>
            Results for <strong>{rangeInfo.typeLabel}</strong>, Samples{" "}
            <strong>{rangeInfo.start}</strong> to{" "}
            <strong>{rangeInfo.end}</strong>
          </p>
        </div>

        <div
          className="modal-actions"
          style={{
            justifyContent: "flex-end",
            paddingTop: "10px",
            marginTop: "10px",
          }}
        >
          <button onClick={onClose} className="button button-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RangeResultsModal;
