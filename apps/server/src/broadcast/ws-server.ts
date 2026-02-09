import { WebSocketServer, type WebSocket } from "ws";
import { handleTrackMessage } from "../track/track.handlers.js";
import { registerClient, unregisterClient } from "./channel-manager.js";

/**
 * Create the main WebSocket server.
 */
export function createWSServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", `ws://localhost:${port}`);
    const channel = url.searchParams.get("channel") ?? "widget";
    const sessionId = url.searchParams.get("sessionId");

    console.log(`[WS] Client connected: channel=${channel}, session=${sessionId}`);

    // Register this client for broadcasting
    registerClient(ws, channel, sessionId ?? undefined);

    ws.on("message", (data) => {
      const message = data.toString();

      if (channel === "widget") {
        handleTrackMessage(ws, message);
      } else if (channel === "dashboard") {
        // Dashboard sends control messages
        handleDashboardMessage(ws, message);
      }
    });

    ws.on("close", () => {
      unregisterClient(ws);
      console.log(`[WS] Client disconnected: channel=${channel}`);
    });

    ws.on("error", (error) => {
      console.error("[WS] Client error:", error.message);
      unregisterClient(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({ type: "connected", channel, sessionId }));
  });

  wss.on("error", (error) => {
    console.error("[WS] Server error:", error);
  });

  return wss;
}

function handleDashboardMessage(_ws: WebSocket, data: string) {
  try {
    const msg = JSON.parse(data);
    // Handle dashboard control messages (e.g., select session, tune weights)
    console.log("[WS] Dashboard message:", msg.type);
  } catch {
    // ignore
  }
}
