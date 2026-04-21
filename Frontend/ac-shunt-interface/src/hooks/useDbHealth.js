import { useEffect, useRef, useState } from "react";

const WS_BASE_URL =
  process.env.REACT_APP_WS_BASE_URL ||
  `ws://${window.location.hostname}:8000/ws`;

const INITIAL_STATE = {
  reachable: true,
  pendingCount: 0,
  failedCount: 0,
  pendingDetails: [],
  timestamp: 0,
  connected: false,
};

/** Max reconnect delay when the server keeps rejecting the handshake (ms). */
const MAX_BACKOFF_MS = 120_000;

/**
 * Subscribe to the backend's /ws/db-health/ topic (MSSQL + outbox live status).
 *
 * When `enabled` is false (e.g. SQLite is the default DB in dev), no socket is
 * opened — avoids noisy failed handshakes in the console and unnecessary
 * load. Counts for the header pill should come from `system_info.outbox` in
 * that case.
 *
 * @param {{ enabled?: boolean }} options
 */
export default function useDbHealth(options = {}) {
  const { enabled = true } = options;
  const [state, setState] = useState(INITIAL_STATE);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    if (!enabled) {
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
      setState({ ...INITIAL_STATE, connected: false });
      return () => {
        unmountedRef.current = true;
      };
    }

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
                pendingDetails: data.pending_details || [],
                timestamp: Number(data.timestamp) || Date.now() / 1000,
                connected: true,
              });
            }
          } catch {
            // ignore malformed frames
          }
        };

        ws.onerror = () => {
          // Browser logs the failed handshake; avoid duplicating in onerror.
        };

        ws.onclose = () => {
          wsRef.current = null;
          setState((prev) => ({ ...prev, connected: false }));
          if (unmountedRef.current) return;
          const attempt = Math.min(reconnectAttemptsRef.current, 10);
          const backoffMs = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
          reconnectAttemptsRef.current = attempt + 1;
          reconnectTimerRef.current = window.setTimeout(connect, backoffMs);
        };
      } catch {
        reconnectTimerRef.current = window.setTimeout(connect, 5000);
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
  }, [enabled]);

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
