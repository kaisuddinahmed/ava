import type { WebSocket } from "ws";
import { processTrackEvent } from "./track.service.js";

/**
 * Handle incoming WebSocket messages from the widget.
 */
export function handleTrackMessage(ws: WebSocket, data: unknown) {
  try {
    const msg = typeof data === "string" ? JSON.parse(data) : data;

    if (!msg || typeof msg !== "object") {
      ws.send(JSON.stringify({ error: "Invalid message format" }));
      return;
    }

    const message = msg as Record<string, unknown>;

    switch (message.type) {
      case "track": {
        const visitorKey = String(message.visitorKey ?? message.sessionKey ?? "anonymous");
        const sessionData = {
          siteUrl: String(message.siteUrl ?? ""),
          deviceType: String(message.deviceType ?? "desktop"),
          referrerType: String(message.referrerType ?? "direct"),
          visitorId: message.visitorId ? String(message.visitorId) : undefined,
          isLoggedIn: Boolean(message.isLoggedIn),
          isRepeatVisitor: Boolean(message.isRepeatVisitor),
        };
        const event = message.event as Record<string, unknown>;

        processTrackEvent(visitorKey, sessionData, event)
          .then((result) => {
            ws.send(JSON.stringify({ type: "track_ack", ...result }));
          })
          .catch((error) => {
            console.error("[Track] Error processing event:", error);
            ws.send(JSON.stringify({ type: "track_error", error: "Processing failed" }));
          });
        break;
      }

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;

      default:
        ws.send(JSON.stringify({ error: `Unknown message type: ${message.type}` }));
    }
  } catch (error) {
    console.error("[Track] Message handling error:", error);
    ws.send(JSON.stringify({ error: "Internal error" }));
  }
}
