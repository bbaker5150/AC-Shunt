import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react';

const API_BASE_URL = 'http://10.206.104.144:8000/api';
const WS_BASE_URL = 'ws://10.206.104.144:8000/ws';

export const InstrumentContext = createContext();

export const InstrumentContextProvider = ({ children }) => {
  // --- Shared State for Active Session ---
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSessionName, setSelectedSessionName] = useState('');

  // --- DMM Measurement State & WebSocket Logic ---
  const [dmmData, setDmmData] = useState([]);
  const [isDmmMeasuring, setIsDmmMeasuring] = useState(false);
  const [dmmWebSocketStatus, setDmmWebSocketStatus] = useState('Disconnected');
  const [dmmActiveSetDetails, setDmmActiveSetDetails] = useState(null);
  const dmmWs = useRef(null);
  const refreshDmmSetsCallback = useRef(null);

  const registerRefreshDmmSets = useCallback((callback) => {
    refreshDmmSetsCallback.current = callback;
  }, []);

  const connectDmmWebSocket = useCallback((gpibAddress) => {
    if (!gpibAddress) {
        setDmmWebSocketStatus('Error: GPIB address not provided.');
        return;
    }
    if (dmmWs.current && dmmWs.current.readyState === WebSocket.OPEN) {
      if (dmmWs.current.url.endsWith(`${encodeURIComponent(gpibAddress)}/`)) {
          return;
      }
      dmmWs.current.close();
    }
    
    if (dmmWs.current && dmmWs.current.readyState === WebSocket.CONNECTING) {
      return;
    }
    
    setDmmWebSocketStatus('Connecting...');
    
    const socketUrl = `${WS_BASE_URL}/dmm_live/${encodeURIComponent(gpibAddress)}/`;
    dmmWs.current = new WebSocket(socketUrl);

    dmmWs.current.onopen = () => setDmmWebSocketStatus('Connected');

    dmmWs.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'measurement_update' || (message.value !== undefined && message.error === null)) {
            const new_data = message.data || [{value: message.value, timestamp: message.timestamp}];
            setDmmData(prevData => [...prevData, ...new_data]);
        } else if (message.status === 'measurements_started' || message.type === 'measurement_start_ack') {
            setIsDmmMeasuring(true);
            setDmmActiveSetDetails({
                id: message.set_id,
                name: message.set_name,
                targetReadings: message.target_readings,
            });
            setDmmData([]); 
        } else if (message.status === 'measurements_stopped' || message.type === 'measurement_complete' || message.type === 'measurement_stop_ack') {
            setIsDmmMeasuring(false);
            if (refreshDmmSetsCallback.current) {
                refreshDmmSetsCallback.current();
            }
        } else if (message.error || message.type === 'error') {
            setDmmWebSocketStatus(`Error: ${message.error || message.message}`);
        }
    };

    dmmWs.current.onerror = () => setDmmWebSocketStatus('Error: Connection failed.');

    dmmWs.current.onclose = () => {
        setIsDmmMeasuring(false);
        setDmmWebSocketStatus(prevStatus => 
            (prevStatus && (prevStatus.startsWith('Error') || prevStatus === 'Completed')) ? prevStatus : 'Disconnected'
        );
    };
  }, []);

  const startDMMMeasurements = useCallback(async (setName, numReadings, gpibAddress) => {
    connectDmmWebSocket(gpibAddress); 
    await new Promise(resolve => setTimeout(resolve, 500)); 

    if (dmmWs.current && dmmWs.current.readyState === WebSocket.OPEN) {
        dmmWs.current.send(JSON.stringify({
            command: 'start_new_measurement_set',
            setName: setName,
            num_readings: numReadings,
        }));
    } else {
        setDmmWebSocketStatus('Failed to connect');
    }
  }, [connectDmmWebSocket]);
  
  const stopDMMMeasurements = useCallback(() => {
    if (dmmWs.current && dmmWs.current.readyState === WebSocket.OPEN && isDmmMeasuring) {
        dmmWs.current.send(JSON.stringify({ command: 'stop_measurements' }));
    }
  }, [isDmmMeasuring]);

  useEffect(() => {
    return () => dmmWs.current?.close();
  }, []);


  // --- Generic Instrument Status State & WebSocket Logic ---
  const [instrumentStatuses, setInstrumentStatuses] = useState({});
  const [isFetchingStatuses, setIsFetchingStatuses] = useState({});
  const statusWs = useRef({});

  const getInstrumentStatus = useCallback(async (instrumentModel, gpibAddress) => {
    if (!instrumentModel || !gpibAddress) return;
    if (isFetchingStatuses[gpibAddress] || (statusWs.current[gpibAddress] && statusWs.current[gpibAddress].readyState === WebSocket.CONNECTING)) return;

    setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: true }));
    const socketUrl = `${WS_BASE_URL}/status/${instrumentModel}/${encodeURIComponent(gpibAddress)}/`;

    if (statusWs.current[gpibAddress]) statusWs.current[gpibAddress].close();
    
    setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { error: null, wsConnectionState: 'Connecting...' } }));

    const ws = new WebSocket(socketUrl);
    statusWs.current[gpibAddress] = ws;

    ws.onopen = () => {
      setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { ...prev[gpibAddress], wsConnectionState: 'Connected' } }));
      ws.send(JSON.stringify({ command: 'get_instrument_status' }));
    };

    ws.onmessage = (event) => {
      setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: false }));
      try {
        const message = JSON.parse(event.data);
        if (message.status_report === 'ok') {
          const decoded = decodeInstrumentStatus(instrumentModel, message.raw_isr);
          setInstrumentStatuses(prev => ({
              ...prev,
              [gpibAddress]: {
                  raw: message.raw_isr, decoded, error: null,
                  lastCheck: new Date(message.timestamp * 1000).toLocaleTimeString(),
                  wsConnectionState: 'Status Received'
              }
          }));
        } else {
          setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { ...prev[gpibAddress], error: message.error_message || "Error fetching status.", wsConnectionState: 'Error (Fetching)' } }));
        }
      } catch (e) {
        setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { ...prev[gpibAddress], error: 'Failed to parse server message.', wsConnectionState: 'Error (Parsing)' } }));
      }
    };

    ws.onerror = () => {
      setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: false }));
      setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { ...prev[gpibAddress], error: 'WebSocket connection failed.', wsConnectionState: 'Error (WS)' } }));
    };

    ws.onclose = () => {
      setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: false }));
      setInstrumentStatuses(prev => {
          const currentStatus = prev[gpibAddress];
          if (currentStatus?.wsConnectionState?.startsWith('Error')) return prev;
          return { ...prev, [gpibAddress]: { ...currentStatus, wsConnectionState: 'Closed' }};
      });
      statusWs.current[gpibAddress] = null;
    };
  }, [isFetchingStatuses]);

  const decodeInstrumentStatus = (model, isrString) => {
    if (!isrString || typeof isrString !== 'string') return { error: "Invalid ISR string." };
    const bits = isrString.padStart(16, '0').split('').map(bit => bit === '1');
    return {
        OPER: bits[0], EXTGARD: bits[1], EXTSENS: bits[2], BOOST: bits[3],
        RCOMP: bits[4], RLOCK: bits[5], PSHIFT: bits[6], PLOCK: bits[7],
        OFFSET: bits[8], SCALE: bits[9], WBND: bits[10], REMOTE: bits[11],
        SETTLED: bits[12], ZERO_CAL: bits[13], AC_XFER: bits[14], UNUSED_15: bits[15]
    };
  };

  useEffect(() => {
    return () => Object.values(statusWs.current).forEach(ws => ws?.close());
  }, []);

  const contextValue = {
    // Session State
    selectedSessionId,
    setSelectedSessionId,
    selectedSessionName,
    setSelectedSessionName,
    // DMM values
    dmmData,
    isDmmMeasuring,
    dmmWebSocketStatus,
    dmmActiveSetDetails,
    startDMMMeasurements,
    stopDMMMeasurements,
    connectDmmWebSocket,
    registerRefreshDmmSets,
    // Generic Status values
    instrumentStatuses,
    isFetchingStatuses,
    getInstrumentStatus,
  };

  return (
    <InstrumentContext.Provider value={contextValue}>
      {children}
    </InstrumentContext.Provider>
  );
};

export const useInstruments = () => {
  return useContext(InstrumentContext);
};
