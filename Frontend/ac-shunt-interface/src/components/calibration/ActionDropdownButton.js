import React, { useState, useEffect, useRef } from 'react';
import { FaCaretDown } from 'react-icons/fa';

const ActionDropdownButton = ({ primaryText, onPrimaryClick, options, disabled }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const containerRef = useRef(null);

    // Effect to close the dropdown if user clicks outside of it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOptionClick = (onClick) => {
        onClick();
        setIsDropdownOpen(false);
    };

    return (
        <div className="action-dropdown-container" ref={containerRef}>
            <div className="action-dropdown-wrapper">
                <button
                    onClick={onPrimaryClick}
                    disabled={disabled}
                    className="button button-primary action-dropdown-primary"
                >
                    {primaryText}
                </button>
                <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    disabled={disabled}
                    className="button button-primary action-dropdown-caret"
                    aria-haspopup="true"
                    aria-expanded={isDropdownOpen}
                >
                    <FaCaretDown />
                </button>
            </div>
            {isDropdownOpen && (
                <div className="action-dropdown-menu">
                    {options.map(({ key, label, onClick }) => (
                        <button
                            key={key}
                            className="action-dropdown-item"
                            onClick={() => handleOptionClick(onClick)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ActionDropdownButton;