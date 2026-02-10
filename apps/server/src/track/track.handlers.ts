import type { WebSocket } from "ws";
import { processTrackEvent } from "./track.service.js";
import {
  WsWidgetMessageSchema,
  InterventionOutcomeSchema,
  validatePayload,
} from "../validation/schemas.js";

/**
 * Handle incoming WebSocket messages from the widget.
 * All messages are validated with Zod before processing.
 */
export function handleTrackMessage(ws: WebSocket, data: unknown) {
  try {
    const raw = typeof data === "string" ? JSON.parse(data) : data;

    // Validate against widget message schema (track | ping)
    const result = validatePayload(WsWidgetMessageSchema, raw);

    if (!result.success) {
      // Maybe it's an intervention outcome
      const outcomeResult = validatePayload(InterventionOutcomeSchema, raw);
      if (outcomeResult.success) {
        // TODO: wire to intervene.service.recordInterventionOutcome
        ws.send(
          JSON.stringify({
            type: "outcome_ack",
            intervention_id: outcomeResult.data.intervention_id,
          }),
        );
        return;
      }

      console.warn("[Track] Validation failed:", result.error);
      ws.send(JSON.stringify({ type: "validation_error", error: result.error }));
      return;
    }

    const message = result.data;

    switch (message.type) {
      case "track": {
        const visitorKey = String(
          message.visitorKey ?? message.sessionKey ?? "anonymous",
        );
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
          .then((trackResult) => {
            ws.send(JSON.stringify({ type: "track_ack", ...trackResult }));
          })
          .catch((error) => {
            console.error("[Track] Error processing event:", error);
            ws.send(
              JSON.stringify({ type: "track_error", error: "Processing failed" }),
            );
          });
        break;
      }

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  } catch (error) {
    console.error("[Track] Message handling error:", error);
    ws.send(JSON.stringify({ error: "Internal error" }));
  }
}
