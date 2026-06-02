import React, { useState, useEffect, useRef } from 'react';
import { FaCaretDown } from 'react-icons/fa';

const ActionDropdownButton = ({ primaryText, onPrimaryClick, options, disabled, primaryIcon }) => {
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
        <div className="premium-action-button-container" ref={containerRef}>
            <div className="premium-action-button-wrapper">
                <button
                    onClick={onPrimaryClick}
                    disabled={disabled}
                    className="button premium-action-button-primary"
                >
                    {primaryIcon} {primaryText}
                </button>
                <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    disabled={disabled}
                    className="button premium-action-button-caret"
                    aria-haspopup="true"
                    aria-expanded={isDropdownOpen}
                >
                    <FaCaretDown />
                </button>
            </div>
            {isDropdownOpen && (
                <div className="premium-action-button-menu">
                    {options.map(({ key, label, onClick }) => (
                        <button
                            key={key}
                            className="premium-action-button-item"
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