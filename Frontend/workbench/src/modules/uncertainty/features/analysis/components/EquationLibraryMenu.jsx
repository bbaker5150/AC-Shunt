import React from "react";
import { equationLibrary } from "../../../utils/equationLibrary";

/**
 * Popover content for the measurement-equation library: curated equations
 * grouped by metrology field. Selecting one hands the full entry (expression
 * + suggested variable names) back to the parent, which owns insertion and
 * the overwrite confirmation. Rendered inside the same portal/popover chrome
 * as the f(x) symbol menu.
 */
const EquationLibraryMenu = ({ onSelect }) => (
  <>
    {equationLibrary.map(({ area, equations }) => (
      <div key={area} className="add-point-symbol-category">
        <h5>{area}</h5>
        <div>
          {equations.map((equation) => (
            <button
              key={equation.name}
              type="button"
              className="equation-library-item"
              title={equation.description}
              onClick={() => onSelect(equation)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                borderRadius: "4px",
                padding: "5px 8px",
                cursor: "pointer",
                color: "var(--text-color)",
              }}
            >
              <span style={{ fontWeight: 600 }}>{equation.name}</span>
              <code
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  color: "var(--text-color-muted)",
                }}
              >
                {equation.expression}
              </code>
            </button>
          ))}
        </div>
      </div>
    ))}
  </>
);

export default EquationLibraryMenu;
