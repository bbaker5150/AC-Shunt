// src/components/shared/CustomDropdown.js
// Shared, themed dropdown used across the app.
//
// Features:
// - Generic option shape: [{ label, value, disabled? }]
// - Optional searchable filter (defaults to `true` for large lists, but can
//   be disabled for small, finite lists like a direction selector).
// - Optional menuPortal: render the panel with fixed positioning under
//   document.body so it is never clipped by modal / card overflow (e.g.
//   corrections modal shunt list).
// - Keyboard-friendly: closes on outside click and Escape.
// - Respects per-option `disabled` (e.g. "Combined" option when a direction
//   is missing).
//
// Styling is provided by the `.custom-dropdown-*` rules in App.css.

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

function hasSelectedValue(value) {
  return value !== null && value !== undefined && value !== "";
}

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
  /** When true, menu renders in a portal with position:fixed (avoids overflow:hidden ancestors). */
  menuPortal = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [panelPos, setPanelPos] = useState(null);
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  const handleToggle = () => {
    if (!disabled) setIsOpen((prev) => !prev);
  };

  const handleSelect = (optionValue, optionDisabled) => {
    if (optionDisabled) return;
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm("");
  };

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm) return options;
    const q = searchTerm.toLowerCase();
    return options.filter((option) =>
      String(option.label).toLowerCase().includes(q)
    );
  }, [options, searchable, searchTerm]);

  const updatePanelPosition = useCallback(() => {
    if (!menuPortal || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    const top = rect.bottom + 6;
    const maxHeight = Math.max(
      120,
      Math.min(320, window.innerHeight - top - margin)
    );
    setPanelPos({
      top,
      left: Math.max(
        margin,
        Math.min(rect.left, window.innerWidth - rect.width - margin)
      ),
      width: rect.width,
      maxHeight,
    });
  }, [menuPortal]);

  useLayoutEffect(() => {
    if (!isOpen || !menuPortal) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
  }, [
    isOpen,
    menuPortal,
    updatePanelPosition,
    searchTerm,
    options.length,
    filteredOptions.length,
  ]);

  useEffect(() => {
    if (!isOpen || !menuPortal) return;
    const onReposition = () => updatePanelPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, menuPortal, updatePanelPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      const t = event.target;
      if (containerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setIsOpen(false);
      setSearchTerm("");
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  const selectedOption = hasSelectedValue(value)
    ? options.find((option) => String(option.value) === String(value))
    : undefined;

  const panelClassName =
    `custom-dropdown-panel${menuPortal ? " custom-dropdown-panel--portal" : ""}`.trim();

  const panelStyle =
    menuPortal && panelPos
      ? {
          position: "fixed",
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
          maxHeight: panelPos.maxHeight,
        }
      : undefined;

  const panelInner = (
    <>
      {searchable && (
        <div className="custom-dropdown-search-wrapper">
          <input
            type="text"
            className="custom-dropdown-search"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            /* Portaled menus: avoid instant focus ring reading as a "bar" atop the list. */
            autoFocus={!menuPortal}
          />
        </div>
      )}
      <ul className="custom-dropdown-options" role="listbox">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const isActive =
              hasSelectedValue(value) &&
              String(option.value) === String(value);
            const isDisabled = Boolean(option.disabled);
            return (
              <li
                key={option.value}
                className={`${isActive ? "active" : ""} ${
                  isDisabled ? "disabled" : ""
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
    </>
  );

  const panelEl = (
    <div
      ref={panelRef}
      className={panelClassName}
      style={panelStyle}
    >
      {panelInner}
    </div>
  );

  return (
    <div
      className={`custom-dropdown-container ${disabled ? "disabled" : ""} ${className}`.trim()}
      ref={containerRef}
    >
      {label && <label>{label}</label>}
      <button
        type="button"
        ref={triggerRef}
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
      {isOpen &&
        (menuPortal && panelPos
          ? createPortal(panelEl, document.body)
          : !menuPortal
            ? panelEl
            : null)}
    </div>
  );
};

export default CustomDropdown;
