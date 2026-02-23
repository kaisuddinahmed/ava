import { useEffect, useRef, useState, useCallback } from "react";
import type { WSMessage } from "../types";

const WS_URL = "ws://localhost:8081?channel=dashboard";
const RECONNECT_DELAY = 3000;

/**
 * Hook that manages a persistent WebSocket connection to the AVA server
 * on the `dashboard` channel.  Reconnects automatically.
 */
export function useWS(onMessage: (msg: WSMessage) => void, enabled: boolean = true) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    // Clean up previous
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("[Dashboard WS] Connected");
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        cbRef.current(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[Dashboard WS] Disconnected — reconnecting...");
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      // onclose will fire next, which handles reconnect
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
      }
    };
  }, [connect, enabled]);

  return { connected };
}
