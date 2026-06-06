import React from "react";
import ReactDOM from "react-dom";
import * as Breakdowns from "./RiskBreakdownContent";
import useFloatingWindow from "../../../../hooks/useFloatingWindow";

const RiskBreakdownModal = ({ isOpen, onClose, modalType, data }) => {
  const { style: windowStyle, handleMouseDown } = useFloatingWindow({
    isOpen,
    defaultWidth: Math.min(860, window.innerWidth - 48),
    defaultHeight: Math.min(720, window.innerHeight - 120)
  });

  if (!isOpen || !data) return null;
  const { results, inputs } = data;

  const MODAL_CONFIG = {
    inputs:    { title: "Key Inputs Breakdown", Component: Breakdowns.InputsBreakdown },
    tur:       { title: "TUR Calculation Breakdown", Component: Breakdowns.TurBreakdown },
    tar:       { title: "TAR Calculation Breakdown", Component: Breakdowns.TarBreakdown },
    pfa:       { title: "PFA Calculation Breakdown", Component: Breakdowns.PfaBreakdown },
    pfr:       { title: "PFR Calculation Breakdown", Component: Breakdowns.PfrBreakdown },
    gbinputs:  { title: "GB Inputs Breakdown", Component: Breakdowns.GBInputsBreakdown },
    gblow:     { title: "GB Low Breakdown", Component: Breakdowns.GBLowBreakdown },
    gbhigh:    { title: "GB High Breakdown", Component: Breakdowns.GBHighBreakdown },
    gbpfa:     { title: "GB PFA Breakdown", Component: Breakdowns.GBPFABreakdown },
    gbpfr:     { title: "GB PFR Breakdown", Component: Breakdowns.GBPFRBreakdown },
    gbmult:    { title: "GB Multiplier Breakdown", Component: Breakdowns.GBMultBreakdown },
    gbcalint:  { title: "GB Cal Interval Breakdown", Component: Breakdowns.GBCalIntBreakdown },
    calint:    { title: "No GB Cal Interval Breakdown", Component: Breakdowns.NoGBCalIntBreakdown },
    measrel:   { title: "No GB Meas Rel Breakdown", Component: Breakdowns.NoGBMeasRelBreakdown },
  };

  const config = MODAL_CONFIG[modalType];
  if (!config) return null;

  const { title, Component } = config;

  return ReactDOM.createPortal(
    <div 
        className="modal-content breakdown-modal-content"
        style={{ 
            ...windowStyle, 
            zIndex: 2000,
        }}
    >
        <button onClick={onClose} className="modal-close-button">&times;</button>
        <h3
            className="breakdown-modal-title"
            onMouseDown={handleMouseDown} 
        >
            {title}
        </h3>
        
        <div className="modal-body-scrollable">
            <Component results={results} inputs={inputs} />
        </div>
    </div>,
    document.body
  );
};

export default RiskBreakdownModal;
