import React from 'react';

const TestPointDetailView = ({ testPointData, onDataSave, children }) => {
    return (
        <div className="test-point-details-view">
            {/* The Test Point Details accordion has been removed for a cleaner interface. */}
            {/* Details are now available via the 'i' icon on the measurement point list. */}
            
            {/* The full analysis component is rendered here as a child */}
            {children}
        </div>
    );
};

export default TestPointDetailView;