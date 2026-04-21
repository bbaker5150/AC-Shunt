import { useEffect, useRef, useState } from "react";

const WS_BASE_URL =
  process.env.REACT_APP_WS_BASE_URL ||
  `ws://${window.location.hostname}:8000/ws`;

const INITIAL_STATE = {
  reachable: true,
  pendingCount: 0,
  failedCount: 0,
  timestamp: 0,
  connected: false,
};

/**
 * Subscribe to the backend's /ws/db-health/ topic.
 *
 * Keeps the UI informed about:
 *   - reachable:       whether the default DB (usually MSSQL) is answering.
 *   - pendingCount:    stage-save rows buffered locally waiting for replay.
 *   - failedCount:     rows that have exhausted automatic retries.
 *
 * Auto-reconnects with a short backoff if the WS drops. The hook never
 * throws — on any parse/socket error it just keeps the previous snapshot.
 */
export default function useDbHealth() {
  const [state, setState] = useState(INITIAL_STATE);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    const connect = () => {
      if (unmountedRef.current) return;
      try {
        const ws = new WebSocket(`${WS_BASE_URL}/db-health/`);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0;
          setState((prev) => ({ ...prev, connected: true }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && data.type === "db_status") {
              setState({
                reachable: !!data.reachable,
                pendingCount: Number(data.pending_count) || 0,
                failedCount: Number(data.failed_count) || 0,
                timestamp: Number(data.timestamp) || Date.now() / 1000,
                connected: true,
              });
            }
          } catch {
            // ignore malformed frames
          }
        };

        ws.onerror = () => {
          // Let onclose handle the reconnect cycle so we don't double-schedule.
        };

        ws.onclose = () => {
          wsRef.current = null;
          setState((prev) => ({ ...prev, connected: false }));
          if (unmountedRef.current) return;
          const attempt = Math.min(reconnectAttemptsRef.current, 6);
          const backoffMs = Math.min(30000, 1000 * 2 ** attempt);
          reconnectAttemptsRef.current = attempt + 1;
          reconnectTimerRef.current = window.setTimeout(connect, backoffMs);
        };
      } catch {
        // Schedule a retry if even constructing the socket failed.
        reconnectTimerRef.current = window.setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
        wsRef.current = null;
      }
    };
  }, []);

  const refresh = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ command: "refresh" }));
      } catch {
        /* noop */
      }
    }
  };

  const retryFailed = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ command: "retry_failed" }));
      } catch {
        /* noop */
      }
    }
  };

  return { ...state, refresh, retryFailed };
}
