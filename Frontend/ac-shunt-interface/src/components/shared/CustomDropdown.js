// src/components/shared/CustomDropdown.js
// Shared, themed dropdown used across the app.
//
// Features:
// - Generic option shape: [{ label, value, disabled? }]
// - Optional searchable filter (defaults to `true` for large lists, but can
//   be disabled for small, finite lists like a direction selector).
// - Keyboard-friendly: closes on outside click and Escape.
// - Respects per-option `disabled` (e.g. "Combined" option when a direction
//   is missing).
//
// Styling is provided by the `.custom-dropdown-*` rules already defined in
// App.css, so instances automatically pick up the design system.

import React, { useEffect, useMemo, useRef, useState } from "react";

const CustomDropdown = ({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  isLoading = false,
  searchable = true,
  ariaLabel,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const handleToggle = () => {
    if (!disabled) setIsOpen((prev) => !prev);
  };

  const handleSelect = (optionValue, optionDisabled) => {
    if (optionDisabled) return;
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm("");
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm) return options;
    const q = searchTerm.toLowerCase();
    return options.filter((option) =>
      String(option.label).toLowerCase().includes(q)
    );
  }, [options, searchable, searchTerm]);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div
      className={`custom-dropdown-container ${disabled ? "disabled" : ""} ${isLoading ? "loading" : ""
        } ${className}`.trim()}
      ref={dropdownRef}
    >
      {label && <label>{label}</label>}
      <button
        type="button"
        className={`custom-dropdown-trigger ${isOpen ? "open" : ""}`}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        {selectedOption ? (
          <span>{selectedOption.label}</span>
        ) : (
          <span className="placeholder">{placeholder}</span>
        )}
        <span className="custom-dropdown-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {isOpen && (
        <div className="custom-dropdown-panel">
          {searchable && (
            <div className="custom-dropdown-search-wrapper">
              <input
                type="text"
                className="custom-dropdown-search"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <ul className="custom-dropdown-options" role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isActive = value === option.value;
                const isDisabled = Boolean(option.disabled);
                return (
                  <li
                    key={option.value}
                    className={`${isActive ? "active" : ""} ${isDisabled ? "disabled" : ""
                      }`.trim()}
                    onClick={() => handleSelect(option.value, isDisabled)}
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={isDisabled}
                  >
                    {option.label}
                  </li>
                );
              })
            ) : (
              <li className="no-options">No matches found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
