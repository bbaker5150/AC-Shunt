import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const ContextMenu = ({ menu, onClose }) => {
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    if (!menu) return null;

    const style = {
        top: `${menu.y}px`,
        left: `${menu.x}px`,
    };

    return ReactDOM.createPortal(
        <>
            <div className="context-menu-overlay" onClick={onClose}></div>
            <div ref={menuRef} className="context-menu" style={style}>
                <ul>
                    {menu.items.map((item, index) => {
                        if (item.type === 'divider') {
                            return <li key={index} className="context-menu-divider"></li>;
                        }
                        return (
                            <li
                                key={index}
                                className={item.className || ''}
                                onClick={() => { item.action(); onClose(); }}
                            >
                                {item.icon && <FontAwesomeIcon icon={item.icon} className="context-menu-icon" />}
                                <span>{item.label}</span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </>,
        document.body
    );
};

export default ContextMenu;