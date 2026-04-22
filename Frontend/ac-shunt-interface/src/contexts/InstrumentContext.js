// src/contexts/InstrumentContext.js
import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
} from "react";

import { WS_BASE_URL } from "../constants/constants";

const initialLiveReadings = {
  char_plus1: [],
  char_minus: [],
  char_plus2: [],
  ac_open: [],
  dc_pos: [],
  dc_neg: [],
  ac_close: [],
};

export const InstrumentContext = createContext();

export const InstrumentContextProvider = ({ children }) => {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSessionName, setSelectedSessionName] = useState("");
  const [discoveredInstruments, setDiscoveredInstruments] = useState([]);

  // Instrument Role States
  const [stdInstrumentAddress, setStdInstrumentAddress] = useState(null);
  const [stdReaderModel, setStdReaderModel] = useState(null);
  const [stdReaderSN, setStdReaderSN] = useState(null);
  const [tiInstrumentAddress, setTiInstrumentAddress] = useState(null);
  const [tiReaderModel, setTiReaderModel] = useState(null);
  const [tiReaderSN, setTiReaderSN] = useState(null);
  const [acSourceAddress, setAcSourceAddress] = useState(null);
  const [acSourceSN, setAcSourceSN] = useState(null);
  const [dcSourceAddress, setDcSourceAddress] = useState(null);
  const [dcSourceSN, setDcSourceSN] = useState(null);
  const [switchDriverAddress, setSwitchDriverAddress] = useState(null);
  const [switchDriverModel, setSwitchDriverModel] = useState(null);
  const [switchDriverSN, setSwitchDriverSN] = useState(null);
  const [amplifierAddress, setAmplifierAddress] = useState(null);
  const [amplifierSN, setAmplifierSN] = useState(null);

  const [standardTvcSn, setStandardTvcSn] = useState(null);
  const [testTvcSn, setTestTvcSn] = useState(null);
  const [standardInstrumentSerial, setStandardInstrumentSerial] = useState(null);
  const [testInstrumentSerial, setTestInstrumentSerial] = useState(null);

  // Status & Zeroing States
  const [instrumentStatuses, setInstrumentStatuses] = useState({});
  const [isFetchingStatuses, setIsFetchingStatuses] = useState({});
  const [zeroingInstruments, setZeroingInstruments] = useState({});
  const statusWs = useRef({});

  // Refs that mirror isFetchingStatuses / zeroingInstruments so getInstrumentStatus
  // can read the latest values without being recreated on every state change.
  const isFetchingStatusesRef = useRef({});
  const zeroingInstrumentsRef = useRef({});

  // Collection States
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionProgress, setCollectionProgress] = useState({
    count: 0,
    total: 0,
  });
  const [liveReadings, setLiveReadings] = useState(initialLiveReadings);
  const [tiLiveReadings, setTiLiveReadings] = useState(initialLiveReadings);
  const [readingWsState, setReadingWsState] = useState(WebSocket.CLOSED);
  const [collectionStatus, setCollectionStatus] = useState("");
  const [stabilizationStatus, setStabilizationStatus] = useState(null);
  const [slidingWindowStatus, setSlidingWindowStatus] = useState(null);
  const readingWs = useRef(null);
  const readingKeyRef = useRef("");
  const [activeCollectionDetails, setActiveCollectionDetails] = useState(null);
  const reconnectTimeout = useRef(null);
  const [timerState, setTimerState] = useState({
    isActive: false,
    duration: 0,
    label: "",
  });
  const [failedTPKeys, setFailedTPKeys] = useState(new Set());

  const [bulkRunProgress, setBulkRunProgress] = useState({
    current: 0,
    total: 0,
    pointKey: null,
  });
  const [focusedTPKey, setFocusedTPKey] = useState(null);

  const switchWs = useRef(null);
  const [switchStatus, setSwitchStatus] = useState({
    status: "Disconnected",
    isConnected: false,
  });

  const [lastMessage, setLastMessage] = useState(null);
  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0);
  const heartbeatTimeout = useRef(null);

  // --- Switch Driver WebSocket Logic ---
  useEffect(() => {
    if (switchDriverAddress && switchDriverModel) {
      const socketUrl = `${WS_BASE_URL}/switch/${switchDriverModel}/${encodeURIComponent(
        switchDriverAddress
      )}/`;
      switchWs.current = new WebSocket(socketUrl);

      switchWs.current.onopen = () => {
        setSwitchStatus({ status: "Unknown", isConnected: true });
      };

      switchWs.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (
          data.type === "connection_established" ||
          data.type === "source_changed" ||
          data.type === "status_update"
        ) {
          setSwitchStatus({ status: data.active_source, isConnected: true });
        }
      };

      switchWs.current.onclose = () => {
        setSwitchStatus({ status: "Disconnected", isConnected: false });
      };

      switchWs.current.onerror = () => {
        setSwitchStatus({ status: "Error", isConnected: false });
      };

      return () => {
        if (switchWs.current) switchWs.current.close();
      };
    } else {
      setSwitchStatus({ status: "Disconnected", isConnected: false });
    }
  }, [switchDriverAddress, switchDriverModel]);

  const setSwitchSource = useCallback(
    (source) => {
      return new Promise((resolve, reject) => {
        if (!switchDriverAddress) {
          return resolve();
        }
        if (
          switchWs.current &&
          switchWs.current.readyState === WebSocket.OPEN
        ) {
          switchWs.current.send(
            JSON.stringify({ command: "select_source", source: source })
          );
          resolve();
        } else {
          reject(new Error("Switch is not connected."));
        }
      });
    },
    [switchDriverAddress]
  );

  // --- Collection WebSocket Logic ---
  const clearLiveReadings = useCallback(() => {
    setLiveReadings(initialLiveReadings);
    setTiLiveReadings(initialLiveReadings);
  }, []);

  const connectWebSocket = useCallback(() => {
    if (
      !selectedSessionId ||
      (readingWs.current && readingWs.current.readyState < 2)
    )
      return;
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    if (heartbeatTimeout.current) clearTimeout(heartbeatTimeout.current);

    const socketUrl = `${WS_BASE_URL}/collect-readings/${selectedSessionId}/`;

    readingWs.current = new WebSocket(socketUrl);
    setReadingWsState(readingWs.current.readyState);

    readingWs.current.onopen = () =>
      setReadingWsState(readingWs.current.readyState);

    readingWs.current.onclose = () => {
      if (heartbeatTimeout.current) clearTimeout(heartbeatTimeout.current);
      setReadingWsState(WebSocket.CLOSED);
      if (selectedSessionId)
        reconnectTimeout.current = setTimeout(connectWebSocket, 3000);
    };

    readingWs.current.onerror = () =>
      setReadingWsState(readingWs.current.readyState);

    readingWs.current.onmessage = (event) => {
      if (heartbeatTimeout.current) clearTimeout(heartbeatTimeout.current);
      heartbeatTimeout.current = setTimeout(() => {
        console.log(
          "Heartbeat timeout: No message received in 75s. Reconnecting."
        );
        if (readingWs.current) {
          readingWs.current.close();
        }
      }, 75000);

      const data = JSON.parse(event.data);

      if (data.type === "warning" && data.message && data.message.toLowerCase().includes("stability limit")) {
        if (data.tpKey) {
          setFailedTPKeys((prev) => new Set(prev).add(data.tpKey));
        }
      }

      if (data.type === "ping") return;

      if (data.type === "connection_sync") {
        console.log("Received connection sync. Status:", data);

        if (data.is_complete) {
          // It's finished. Let the "collection_finished" block handle the final data refresh.
          setIsCollecting(false);
          setCollectionStatus("collection_finished");
        } else {
          // It's a mid-run sync. Trigger the UI to update.
          setDataRefreshTrigger((prev) => prev + 1);
        }
        return;
      }

      setLastMessage(data);

      if (data.type === "calibration_stage_update") {
        const updates = { stage: data.stage };
        if (data.tpId) updates.tpId = data.tpId;
        setActiveCollectionDetails((prev) => ({ ...prev, ...updates }));
        if (data.total !== undefined) setCollectionProgress({ count: 0, total: data.total });
        setLiveReadings((prev) => ({ ...prev, [data.stage]: [] }));
        setTiLiveReadings((prev) => ({ ...prev, [data.stage]: [] }));
        setTimerState({ isActive: false, duration: 0, label: "" });
      } else if (data.type === "dual_reading_update") {
        const key = data.stage;
        if (key) {
          const stdReadingData = data.std_reading;
          const tiReadingData = data.ti_reading;

          const updateReadings = (prevReadings, point) => {
            const newReadings = [...(prevReadings[key] || [])];
            const existingIndex = newReadings.findIndex((p) => p.x === point.x);
            if (existingIndex > -1) {
              newReadings[existingIndex] = point;
            } else {
              newReadings.push(point);
            }
            return { ...prevReadings, [key]: newReadings };
          };

          // ONLY parse and update STD readings if the data is not null
          if (stdReadingData !== null && stdReadingData !== undefined) {
            const stdPoint = {
              x: data.count,
              y: stdReadingData.value,
              t: new Date(stdReadingData.timestamp * 1000),
              is_stable: stdReadingData.is_stable,
            };
            setLiveReadings((readings) => updateReadings(readings, stdPoint));
          }

          // ONLY parse and update TI readings if the data is not null
          if (tiReadingData !== null && tiReadingData !== undefined) {
            const tiPoint = {
              x: data.count,
              y: tiReadingData.value,
              t: new Date(tiReadingData.timestamp * 1000),
              is_stable: tiReadingData.is_stable,
            };
            setTiLiveReadings((readings) => updateReadings(readings, tiPoint));
          }
        }

        setCollectionProgress({
          count:
            data.stable_count !== undefined ? data.stable_count : data.count,
          total: data.total,
        });
        setTimerState({ isActive: false, duration: 0, label: "" });
      } else if (data.type === "stabilization_update") {
        setStabilizationStatus(
          `[${data.count}/${data.max_attempts}] Reading: ${data.reading.toFixed(
            6
          )} V, Stdev: ${data.stdev_ppm} PPM`
        );
        setTimerState({ isActive: false, duration: 0, label: "" });
      } else if (data.type === "sliding_window_update") {
        setStabilizationStatus(null);
        setSlidingWindowStatus(
          data.stdev_ppm === null
            ? null
            : {
              ppm: data.stdev_ppm,
              is_stable: data.is_stable,
              instability_events: data.instability_events,
              max_retries: data.max_retries
            }
        );
      } else if (data.type === "batch_progress_update") {
        const { test_point, current, total } = data;
        if (current > 1) clearLiveReadings();
        if (test_point) {
          const pointKey = `${test_point.current}-${test_point.frequency}`;
          setFocusedTPKey(pointKey);
          setBulkRunProgress({ current, total, pointKey });
        }
      } else if (data.type === "status_update") {
        const message = data.message;
        let match;

        if ((match = message.match(/Initial warm-up period started for (\d+\.?\d*)s/))) {
          const duration = parseFloat(match[1]);
          const targetTime = Date.now() + (duration * 1000);
          setTimerState({ isActive: true, duration: duration, targetTime: targetTime, label: "Warm-up" });
        } else if ((match = message.match(/Settling for (\d+\.?\d*)s/))) {
          const duration = parseFloat(match[1]);
          const targetTime = Date.now() + (duration * 1000);
          setTimerState({ isActive: true, duration: duration, targetTime: targetTime, label: "Settling" });
        }
      } else if (
        [
          "collection_finished",
          "collection_stopped",
          "error",
          "warning",
        ].includes(data.type)
      ) {
        if (data.type !== "warning") {
          setCollectionStatus(data.type);
          setIsCollecting(false);
          setActiveCollectionDetails(null);
          readingKeyRef.current = "";
          setBulkRunProgress({ current: 0, total: 0, pointKey: null });
          setFocusedTPKey(null);
          setDataRefreshTrigger((prev) => prev + 1);
        }
        setStabilizationStatus(null);
        setSlidingWindowStatus(null);
        setTimerState({ isActive: false, duration: 0, label: "" });
      } else if (data.type === "switch_status_update") {
        setSwitchStatus({ status: data.active_source, isConnected: true });
      }
    };
  }, [selectedSessionId, setSwitchStatus, clearLiveReadings]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (
          selectedSessionId &&
          (!readingWs.current ||
            readingWs.current.readyState === WebSocket.CLOSED)
        ) {
          connectWebSocket();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selectedSessionId, connectWebSocket]);

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

  // --- Reset UI State on Session Change ---
  useEffect(() => {
    setCollectionStatus("");
    setLastMessage(null);
    setCollectionProgress({ count: 0, total: 0 });
    setStabilizationStatus(null);
    setSlidingWindowStatus(null);
    setIsCollecting(false);
    setTimerState({ isActive: false, duration: 0, label: "" });
    setFailedTPKeys(new Set());
  }, [selectedSessionId]);

  // --- Instrument Status & Control Logic ---

  const decodeInstrumentStatus = (model, isrString) => {
    if (!isrString || typeof isrString !== "string")
      return { error: "Invalid ISR string." };
    const bits = isrString
      .padStart(16, "0")
      .split("")
      .map((bit) => bit === "1");
    return {
      OPER: bits[0], EXTGARD: bits[1], EXTSENS: bits[2], BOOST: bits[3],
      RCOMP: bits[4], RLOCK: bits[5], PSHIFT: bits[6], PLOCK: bits[7],
      OFFSET: bits[8], SCALE: bits[9], WBND: bits[10], REMOTE: bits[11],
      SETTLED: bits[12], ZERO_CAL: bits[13], AC_XFER: bits[14], UNUSED_15: bits[15],
    };
  };

  // Keep refs in sync on every render so the stable callback always sees current values.
  isFetchingStatusesRef.current = isFetchingStatuses;
  zeroingInstrumentsRef.current = zeroingInstruments;

  const getInstrumentStatus = useCallback(
    async (instrumentModel, gpibAddress) => {
      if (zeroingInstrumentsRef.current[gpibAddress]) {
        console.log(`Skipping status poll for ${gpibAddress} (Zeroing in progress)`);
        return;
      }

      if (
        !instrumentModel ||
        !gpibAddress ||
        isFetchingStatusesRef.current[gpibAddress] ||
        (statusWs.current[gpibAddress] &&
          statusWs.current[gpibAddress].readyState === WebSocket.CONNECTING)
      )
        return;

      setIsFetchingStatuses((prev) => ({ ...prev, [gpibAddress]: true }));

      const socketUrl = `${WS_BASE_URL}/status/${instrumentModel}/${encodeURIComponent(
        gpibAddress
      )}/`;

      if (statusWs.current[gpibAddress] && statusWs.current[gpibAddress].readyState !== WebSocket.OPEN) {
        statusWs.current[gpibAddress].close();
      }

      let ws = statusWs.current[gpibAddress];
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setInstrumentStatuses((prev) => ({
          ...prev,
          [gpibAddress]: { error: null, wsConnectionState: "Connecting..." },
        }));
        ws = new WebSocket(socketUrl);
        statusWs.current[gpibAddress] = ws;
      }

      ws.onopen = () => {
        ws.send(JSON.stringify({ command: "get_instrument_status" }));
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: "get_instrument_status" }));
      }

      // [DIAGNOSIS LOGGING ADDED HERE]
      ws.onmessage = (event) => {
        setIsFetchingStatuses((prev) => ({ ...prev, [gpibAddress]: false }));
        const message = JSON.parse(event.data);

        // --- HANDLE ZERO CAL MESSAGES ---
        if (message.type === 'zero_cal_started') {
          setZeroingInstruments(prev => ({ ...prev, [gpibAddress]: true }));
          setInstrumentStatuses((prev) => ({
            ...prev,
            [gpibAddress]: {
              ...prev[gpibAddress],
              wsConnectionState: "Zeroing in Progress...",
            },
          }));
          return;
        }

        if (message.type === 'zero_cal_complete') {
          console.log(`[WebSocket ${gpibAddress}] Zero Cal COMPLETE confirmed.`); // <--- LOGGING
          setZeroingInstruments(prev => ({ ...prev, [gpibAddress]: false }));
          setInstrumentStatuses((prev) => ({
            ...prev,
            [gpibAddress]: {
              ...prev[gpibAddress],
              wsConnectionState: "Status Received",
            },
          }));
          ws.send(JSON.stringify({ command: "get_instrument_status" }));
          return;
        }

        if (message.type === 'error' && message.message_text && message.message_text.includes("Zero")) {
          console.error(`[WebSocket ${gpibAddress}] Zero Cal ERROR:`, message.message_text); // <--- LOGGING
          setZeroingInstruments(prev => ({ ...prev, [gpibAddress]: false }));
        }
        // --------------------------------

        if (message.status_report === "ok") {
          setInstrumentStatuses((prev) => ({
            ...prev,
            [gpibAddress]: {
              raw: message.raw_isr,
              decoded: decodeInstrumentStatus(instrumentModel, message.raw_isr),
              error: null,
              lastCheck: new Date(
                message.timestamp * 1000
              ).toLocaleTimeString(),
              wsConnectionState: "Status Received",
            },
          }));
        } else if (message.status_report === "error") {
          if (!zeroingInstrumentsRef.current[gpibAddress]) {
            setInstrumentStatuses((prev) => ({
              ...prev,
              [gpibAddress]: {
                ...prev[gpibAddress],
                error: message.error_message || "Error fetching status.",
                wsConnectionState: "Error (Fetching)",
              },
            }));
          }
        }
      };

      ws.onerror = (e) => {
        console.error(`[WebSocket ${gpibAddress}] ERROR:`, e);
        setIsFetchingStatuses((prev) => ({ ...prev, [gpibAddress]: false }));
      };

      ws.onclose = (e) => {
        console.warn(`[WebSocket ${gpibAddress}] CLOSED. Code: ${e.code}, Reason: ${e.reason}`);
        setIsFetchingStatuses((prev) => ({ ...prev, [gpibAddress]: false }));
      }
    },
    [] // Stable — reads isFetchingStatuses / zeroingInstruments via refs above
  );

  const runZeroCal = useCallback((instrumentModel, gpibAddress) => {
    const ws = statusWs.current[gpibAddress];
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log(`Sending Zero Cal command to ${gpibAddress}`);
      setZeroingInstruments(prev => ({ ...prev, [gpibAddress]: true }));
      setInstrumentStatuses((prev) => ({
        ...prev,
        [gpibAddress]: {
          ...prev[gpibAddress],
          wsConnectionState: "Zeroing in Progress...",
        },
      }));
      ws.send(JSON.stringify({ command: "run_zero_cal" }));
    } else {
      console.error(`Cannot send Zero Cal: WebSocket not open for ${gpibAddress}`);
    }
  }, []);

  const setAmplifierRange = (range) => {
    return new Promise((resolve, reject) => {
      if (readingWs.current?.readyState === WebSocket.OPEN) {
        const timeout = setTimeout(() => {
          readingWs.current.removeEventListener("message", tempHandler);
          reject(new Error("Request to set amplifier range timed out."));
        }, 10000);

        const tempHandler = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === "amplifier_range_set") {
            clearTimeout(timeout);
            readingWs.current.removeEventListener("message", tempHandler);
            resolve(data.message);
          } else if (
            data.type === "error" &&
            data.message.includes("amplifier")
          ) {
            clearTimeout(timeout);
            readingWs.current.removeEventListener("message", tempHandler);
            reject(new Error(data.message));
          }
        };
        readingWs.current.addEventListener("message", tempHandler);

        readingWs.current.send(
          JSON.stringify({
            command: "set_amplifier_range",
            amplifier_range: range,
          })
        );
      } else {
        reject(new Error("WebSocket is not connected."));
      }
    });
  };

  const startReadingCollection = (params) => {
    if (readingWs.current?.readyState === WebSocket.OPEN) {
      clearLiveReadings();
      setCollectionStatus("");
      setStabilizationStatus(null);
      const readingKey = params.reading_type;
      readingKeyRef.current = readingKey || "";
      setIsCollecting(true);
      setCollectionProgress({ count: 0, total: params.num_samples });

      const initialDetails = {
        tpId: params.test_point_id,
        readingKey: readingKey,
        stage: readingKey,
      };
      setActiveCollectionDetails(initialDetails);

      readingWs.current.send(JSON.stringify(params));
      return true;
    }
    return false;
  };

  const stopReadingCollection = () => {
    if (readingWs.current?.readyState === WebSocket.OPEN) {
      readingWs.current.send(JSON.stringify({ command: "stop_collection" }));
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
    selectedSessionId,
    setSelectedSessionId,
    selectedSessionName,
    setSelectedSessionName,
    discoveredInstruments,
    setDiscoveredInstruments,
    stdInstrumentAddress,
    setStdInstrumentAddress,
    stdReaderModel,
    setStdReaderModel,
    stdReaderSN,
    setStdReaderSN,
    tiInstrumentAddress,
    setTiInstrumentAddress,
    tiReaderModel,
    setTiReaderModel,
    tiReaderSN,
    setTiReaderSN,
    acSourceAddress,
    setAcSourceAddress,
    acSourceSN,
    setAcSourceSN,
    dcSourceAddress,
    setDcSourceAddress,
    dcSourceSN,
    setDcSourceSN,
    instrumentStatuses,
    switchDriverAddress,
    setSwitchDriverAddress,
    switchDriverModel,
    setSwitchDriverModel,
    switchDriverSN,
    setSwitchDriverSN,
    amplifierAddress,
    setAmplifierAddress,
    amplifierSN,
    setAmplifierSN,
    isFetchingStatuses,
    getInstrumentStatus,
    runZeroCal,
    zeroingInstruments,
    liveReadings,
    setLiveReadings,
    tiLiveReadings,
    setTiLiveReadings,
    initialLiveReadings,
    isCollecting,
    collectionProgress,
    startReadingCollection,
    stopReadingCollection,
    activeCollectionDetails,
    readingWsState,
    collectionStatus,
    setSwitchSource,
    switchStatus,
    clearLiveReadings,
    setAmplifierRange,
    lastMessage,
    sendWsCommand,
    stabilizationStatus,
    slidingWindowStatus,
    timerState,
    bulkRunProgress,
    focusedTPKey,
    standardTvcSn,
    setStandardTvcSn,
    testTvcSn,
    setTestTvcSn,
    standardInstrumentSerial,
    setStandardInstrumentSerial,
    testInstrumentSerial,
    setTestInstrumentSerial,
    dataRefreshTrigger,
    failedTPKeys,
    setFailedTPKeys,
  };

  return (
    <InstrumentContext.Provider value={contextValue}>
      {children}
    </InstrumentContext.Provider>
  );
};

export const useInstruments = () => useContext(InstrumentContext);