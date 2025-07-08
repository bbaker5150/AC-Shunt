import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';
const WS_BASE_URL = 'ws://127.0.0.1:8000/ws';

const initialLiveReadings = {
    ac_open: [],
    dc_pos: [],
    dc_neg: [],
    ac_close: []
};

export const InstrumentContext = createContext();

export const InstrumentContextProvider = ({ children }) => {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSessionName, setSelectedSessionName] = useState('');
  
  const [stdInstrumentAddress, setStdInstrumentAddress] = useState(null);
  const [tiInstrumentAddress, setTiInstrumentAddress] = useState(null);
  const [acSourceAddress, setAcSourceAddress] = useState(null);
  const [dcSourceAddress, setDcSourceAddress] = useState(null);

  const [instrumentStatuses, setInstrumentStatuses] = useState({});
  const [isFetchingStatuses, setIsFetchingStatuses] = useState({});
  const statusWs = useRef({});

  // State for both Standard and (simulated) TI live charts
  const [liveReadings, setLiveReadings] = useState(initialLiveReadings);
  const [tiLiveReadings, setTiLiveReadings] = useState(initialLiveReadings);


  useEffect(() => {
    const fetchSessionDetails = async () => {
      if (selectedSessionId) {
        try {
          const response = await axios.get(`${API_BASE_URL}/calibration_sessions/${selectedSessionId}/`);
          const session = response.data;
          setStdInstrumentAddress(session.standard_instrument_address || null);
          setTiInstrumentAddress(session.test_instrument_address || null);
          setAcSourceAddress(session.ac_source_address || null);
          setDcSourceAddress(session.dc_source_address || null);
          setSelectedSessionName(session.session_name || '');
        } catch (error) {
          console.error("Failed to fetch session details", error);
          setStdInstrumentAddress(null);
          setTiInstrumentAddress(null);
          setAcSourceAddress(null);
          setDcSourceAddress(null);
        }
      } else {
        setStdInstrumentAddress(null);
        setTiInstrumentAddress(null);
        setAcSourceAddress(null);
        setDcSourceAddress(null);
        setSelectedSessionName('');
        // Also clear live readings when the session is deselected
        setLiveReadings(initialLiveReadings);
        setTiLiveReadings(initialLiveReadings);
      }
    };
    fetchSessionDetails();
  }, [selectedSessionId]);

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
        return { ...prev, [gpibAddress]: { ...currentStatus, wsConnectionState: 'Closed' } };
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
    return () => Object.values(statusWs.current).forEach(ws => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contextValue = {
    selectedSessionId,
    setSelectedSessionId,
    selectedSessionName,
    setSelectedSessionName,
    stdInstrumentAddress,
    setStdInstrumentAddress,
    tiInstrumentAddress,
    setTiInstrumentAddress,
    acSourceAddress,
    setAcSourceAddress,
    dcSourceAddress,
    setDcSourceAddress,
    instrumentStatuses,
    isFetchingStatuses,
    getInstrumentStatus,
    liveReadings,
    setLiveReadings,
    tiLiveReadings,
    setTiLiveReadings,
    initialLiveReadings
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