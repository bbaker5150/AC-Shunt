/**
 * @file InstrumentStatusTab.js
 * @brief A view component dedicated to displaying the instrument status panel.
 * * This component serves as the main view for the "Instrument Status" tab.
 * It renders the InstrumentStatusPanel, which handles instrument discovery,
 * status checking, and role assignment.
 */
import React from 'react';
import InstrumentStatusPanel from '../instruments/InstrumentStatusPanel';

function InstrumentStatusTab({ showNotification, isRemoteViewer }) {
    return (
        <React.Fragment>
            <InstrumentStatusPanel
                showNotification={showNotification}
                isRemoteViewer={isRemoteViewer}
            />
        </React.Fragment>
    );
}

export default InstrumentStatusTab;