// src/components/shared/DirectionToggle.js
import React from 'react';
import { FaArrowRight, FaArrowLeft } from 'react-icons/fa'; // Keep icon imports

const DirectionToggle = ({ activeDirection, setActiveDirection }) => {
  const isForward = activeDirection === "Forward";

  const handleChange = () => {
    setActiveDirection(isForward ? "Reverse" : "Forward");
  };

  return (
    // Container still needed
    <div className="direction-toggle-container">
      {/* Single Icon Span */}
      <span className="direction-toggle-icon" title={`Current Direction: ${activeDirection}`}>
        {isForward ? <FaArrowRight /> : <FaArrowLeft />}
      </span>

      {/* The existing switch */}
      <label className="direction-toggle-switch switch"> {/* Removed title from here */}
        <input
          type="checkbox"
          checked={!isForward} // Checkbox checked when Reverse is active
          onChange={handleChange}
        />
        <span className="slider round direction-toggle-slider"></span> {/* Icons removed from inside slider */}
      </label>

      {/* Removed "Fwd" and "Rev" labels */}
    </div>
  );
};

export default DirectionToggle;