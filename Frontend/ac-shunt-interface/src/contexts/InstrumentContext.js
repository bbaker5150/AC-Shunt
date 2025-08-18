// src/contexts/InstrumentContext.js
import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react';

const WS_BASE_URL = process.env.REACT_APP_WS_BASE_URL || `ws://${window.location.hostname}:8000/ws`;

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
  const [discoveredInstruments, setDiscoveredInstruments] = useState([]);
  const [stdInstrumentAddress, setStdInstrumentAddress] = useState(null);
  const [stdReaderModel, setStdReaderModel] = useState(null);
  const [tiInstrumentAddress, setTiInstrumentAddress] = useState(null);
  const [tiReaderModel, setTiReaderModel] = useState(null);
  const [acSourceAddress, setAcSourceAddress] = useState(null);
  const [dcSourceAddress, setDcSourceAddress] = useState(null);
  const [switchDriverAddress, setSwitchDriverAddress] = useState(null);
  const [switchDriverModel, setSwitchDriverModel] = useState(null);
  const [amplifierAddress, setAmplifierAddress] = useState(null);
  const [instrumentStatuses, setInstrumentStatuses] = useState({});
  const [isFetchingStatuses, setIsFetchingStatuses] = useState({});
  const statusWs = useRef({});
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionProgress, setCollectionProgress] = useState({ count: 0, total: 0 });
  const [liveReadings, setLiveReadings] = useState(initialLiveReadings);
  const [tiLiveReadings, setTiLiveReadings] = useState(initialLiveReadings);
  const [readingWsState, setReadingWsState] = useState(WebSocket.CLOSED);
  const [collectionStatus, setCollectionStatus] = useState('');
  const readingWs = useRef(null);
  const readingKeyRef = useRef('');
  const [activeCollectionDetails, setActiveCollectionDetails] = useState(null);
  const reconnectTimeout = useRef(null);

  const switchWs = useRef(null);
  const [switchStatus, setSwitchStatus] = useState({ status: 'Disconnected', isConnected: false });

  // ✅ FIX: Add state to hold the most recent message for components to react to.
  const [lastMessage, setLastMessage] = useState(null);

  // This separate websocket for the switch status display remains useful
  useEffect(() => {
    if (switchDriverAddress && switchDriverModel) {
      const socketUrl = `${WS_BASE_URL}/switch/${switchDriverModel}/${encodeURIComponent(switchDriverAddress)}/`;
      switchWs.current = new WebSocket(socketUrl);

      switchWs.current.onopen = () => {
        setSwitchStatus({ status: 'Unknown', isConnected: true });
      };

      switchWs.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'connection_established' || data.type === 'source_changed' || data.type === 'status_update') {
          setSwitchStatus({ status: data.active_source, isConnected: true });
        }
      };

      switchWs.current.onclose = () => {
        setSwitchStatus({ status: 'Disconnected', isConnected: false });
      };

      switchWs.current.onerror = () => {
        setSwitchStatus({ status: 'Error', isConnected: false });
      };

      return () => { if (switchWs.current) switchWs.current.close(); };
    } else {
      setSwitchStatus({ status: 'Disconnected', isConnected: false });
    }
  }, [switchDriverAddress, switchDriverModel]);

  const setSwitchSource = useCallback((source) => {
    return new Promise((resolve, reject) => {
      if (!switchDriverAddress) {
        return resolve();
      }
      if (switchWs.current && switchWs.current.readyState === WebSocket.OPEN) {
        switchWs.current.send(JSON.stringify({ command: 'select_source', source: source }));
        resolve();
      } else {
        reject(new Error("Switch is not connected."));
      }
    });
  }, [switchDriverAddress]);

  const connectWebSocket = useCallback(() => {
    if (!selectedSessionId || (readingWs.current && readingWs.current.readyState < 2)) return;
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);

    const socketUrl = `${WS_BASE_URL}/collect-readings/${selectedSessionId}/`;

    readingWs.current = new WebSocket(socketUrl);
    setReadingWsState(readingWs.current.readyState);

    readingWs.current.onopen = () => setReadingWsState(readingWs.current.readyState);

    readingWs.current.onclose = () => {
      setReadingWsState(WebSocket.CLOSED);
      if (selectedSessionId) reconnectTimeout.current = setTimeout(connectWebSocket, 3000);
    };

    readingWs.current.onerror = () => setReadingWsState(readingWs.current.readyState);

    readingWs.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // ✅ FIX: Set the last message for any component that needs to react to it.
      setLastMessage(data);

      // --- Existing logic ---
      if (data.type === 'calibration_stage_update') {
        setActiveCollectionDetails(prev => ({ ...prev, stage: data.stage }));
        if (data.total !== undefined) setCollectionProgress({ count: 0, total: data.total });
        setLiveReadings(prev => ({ ...prev, [data.stage]: [] }));
        setTiLiveReadings(prev => ({ ...prev, [data.stage]: [] }));
      } else if (data.type === 'dual_reading_update') {
        const key = data.stage;
        if (key) {
          const stdPoint = { x: data.count, y: data.std_reading, t: new Date(data.timestamp * 1000) };
          const tiPoint = { x: data.count, y: data.ti_reading, t: new Date(data.timestamp * 1000) };
          setLiveReadings(readings => ({ ...readings, [key]: [...(readings[key] || []), stdPoint] }));
          setTiLiveReadings(readings => ({ ...readings, [key]: [...(readings[key] || []), tiPoint] }));
        }
        setCollectionProgress({ count: data.count, total: data.total });
        setActiveCollectionDetails(prev => ({ ...prev, stage: data.stage }));
      } else if (['collection_finished', 'collection_stopped', 'error'].includes(data.type)) {
        setCollectionStatus(data.type);
        setIsCollecting(false);
        setActiveCollectionDetails(null);
        readingKeyRef.current = '';
      }
      else if (data.type === 'switch_status_update') {
        setSwitchStatus({ status: data.active_source, isConnected: true });
      }
    };
  }, [selectedSessionId, setSwitchStatus]);

  useEffect(() => {
    if (selectedSessionId) connectWebSocket();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (readingWs.current) {
        readingWs.current.onclose = null;
        readingWs.current.close();
      }
    };
  }, [selectedSessionId, connectWebSocket]);

  const setAmplifierRange = (range) => {
    return new Promise((resolve, reject) => {
      if (readingWs.current?.readyState === WebSocket.OPEN) {
        const timeout = setTimeout(() => {
          readingWs.current.removeEventListener('message', tempHandler);
          reject(new Error('Request to set amplifier range timed out.'));
        }, 10000); // 10-second timeout

        const tempHandler = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'amplifier_range_set') {
            clearTimeout(timeout);
            readingWs.current.removeEventListener('message', tempHandler);
            resolve(data.message);
          } else if (data.type === 'error' && data.message.includes('amplifier')) {
            clearTimeout(timeout);
            readingWs.current.removeEventListener('message', tempHandler);
            reject(new Error(data.message));
          }
        };
        readingWs.current.addEventListener('message', tempHandler);

        readingWs.current.send(JSON.stringify({
          command: 'set_amplifier_range',
          amplifier_range: range
        }));
      } else {
        reject(new Error('WebSocket is not connected.'));
      }
    });
  };

  const clearLiveReadings = useCallback(() => {
    setLiveReadings(initialLiveReadings);
    setTiLiveReadings(initialLiveReadings);
  }, []);

  const getInstrumentStatus = useCallback(async (instrumentModel, gpibAddress) => {
    if (!instrumentModel || !gpibAddress || isFetchingStatuses[gpibAddress] || (statusWs.current[gpibAddress] && statusWs.current[gpibAddress].readyState === WebSocket.CONNECTING)) return;
    setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: true }));

    const socketUrl = `${WS_BASE_URL}/status/${instrumentModel}/${encodeURIComponent(gpibAddress)}/`;

    if (statusWs.current[gpibAddress]) statusWs.current[gpibAddress].close();
    setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { error: null, wsConnectionState: 'Connecting...' } }));
    const ws = new WebSocket(socketUrl);
    statusWs.current[gpibAddress] = ws;
    ws.onopen = () => ws.send(JSON.stringify({ command: 'get_instrument_status' }));
    ws.onmessage = (event) => {
      setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: false }));
      const message = JSON.parse(event.data);
      if (message.status_report === 'ok') {
        setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { raw: message.raw_isr, decoded: decodeInstrumentStatus(instrumentModel, message.raw_isr), error: null, lastCheck: new Date(message.timestamp * 1000).toLocaleTimeString(), wsConnectionState: 'Status Received' } }));
      } else {
        setInstrumentStatuses(prev => ({ ...prev, [gpibAddress]: { ...prev[gpibAddress], error: message.error_message || "Error fetching status.", wsConnectionState: 'Error (Fetching)' } }));
      }
    };
    ws.onerror = () => setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: false }));
    ws.onclose = () => setIsFetchingStatuses(prev => ({ ...prev, [gpibAddress]: false }));
  }, [isFetchingStatuses]);

  const decodeInstrumentStatus = (model, isrString) => {
    if (!isrString || typeof isrString !== 'string') return { error: "Invalid ISR string." };
    const bits = isrString.padStart(16, '0').split('').map(bit => bit === '1');
    return { OPER: bits[0], EXTGARD: bits[1], EXTSENS: bits[2], BOOST: bits[3], RCOMP: bits[4], RLOCK: bits[5], PSHIFT: bits[6], PLOCK: bits[7], OFFSET: bits[8], SCALE: bits[9], WBND: bits[10], REMOTE: bits[11], SETTLED: bits[12], ZERO_CAL: bits[13], AC_XFER: bits[14], UNUSED_15: bits[15] };
  };

  const startReadingCollection = (params) => {
    if (readingWs.current?.readyState === WebSocket.OPEN) {
      setCollectionStatus('');
      const readingKey = params.reading_type;
      readingKeyRef.current = readingKey || '';
      setIsCollecting(true);
      setCollectionProgress({ count: 0, total: params.num_samples });
      const initialDetails = { tpId: params.test_point_id, readingKey: readingKey, stage: readingKey };
      setActiveCollectionDetails(initialDetails);

      readingWs.current.send(JSON.stringify(params));
      return true;
    }
    return false;
  };

  const stopReadingCollection = () => {
    if (readingWs.current?.readyState === WebSocket.OPEN) {
      readingWs.current.send(JSON.stringify({ command: 'stop_collection' }));
      return true;
    }
    return false;
  };

  const sendWsCommand = useCallback((payload) => {
    if (readingWs.current?.readyState === WebSocket.OPEN) {
      readingWs.current.send(JSON.stringify(payload));
      return true;
    }
    console.error("Cannot send command, WebSocket is not open.");
    return false;
  }, []);


  const contextValue = {
    selectedSessionId, setSelectedSessionId, selectedSessionName, setSelectedSessionName,
    discoveredInstruments, setDiscoveredInstruments,
    stdInstrumentAddress, setStdInstrumentAddress, stdReaderModel, setStdReaderModel, tiInstrumentAddress, setTiInstrumentAddress,
    tiReaderModel, setTiReaderModel, acSourceAddress, setAcSourceAddress, dcSourceAddress, setDcSourceAddress, instrumentStatuses,
    switchDriverAddress, setSwitchDriverAddress, switchDriverModel, setSwitchDriverModel, amplifierAddress, setAmplifierAddress,
    isFetchingStatuses, getInstrumentStatus, liveReadings, setLiveReadings, tiLiveReadings, setTiLiveReadings, initialLiveReadings,
    isCollecting, collectionProgress, startReadingCollection, stopReadingCollection, activeCollectionDetails, readingWsState, collectionStatus,
    setSwitchSource,
    switchStatus,
    clearLiveReadings,
    setAmplifierRange,
    lastMessage,
    sendWsCommand,
  };

  return <InstrumentContext.Provider value={contextValue}>{children}</InstrumentContext.Provider>;
};

export const useInstruments = () => useContext(InstrumentContext);