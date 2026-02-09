import { EventRepo } from "@ava/db";
import { EventBuffer } from "./event-buffer.js";
import { normalizeEvent, type NormalizedEvent } from "./event-normalizer.js";
import { getOrCreateSession, updateSessionCart, type SessionInitData } from "./session-manager.js";
import { evaluateEventBatch } from "../evaluate/evaluate.service.js";
import { handleDecision } from "../intervene/intervene.service.js";
import { makeDecision } from "../evaluate/decision-engine.js";
import { broadcastToChannel } from "../broadcast/broadcast.service.js";

// Event buffer → flushes to evaluation pipeline
const buffer = new EventBuffer(async (sessionId, eventIds) => {
  try {
    // Run evaluation
    const result = await evaluateEventBatch(sessionId, eventIds);
    if (!result) return;

    // Broadcast evaluation to dashboard
    broadcastToChannel("dashboard", {
      type: "evaluation",
      sessionId,
      data: result,
    });

    // Make final decision
    const decision = makeDecision(result);

    if (decision.decision === "fire" && decision.type) {
      // Fire intervention
      const intervention = await handleDecision(sessionId, decision, result);
      if (intervention) {
        // Broadcast intervention to widget
        broadcastToChannel("widget", {
          type: "intervention",
          sessionId,
          data: intervention,
        });

        // Broadcast to dashboard
        broadcastToChannel("dashboard", {
          type: "intervention",
          sessionId,
          data: intervention,
        });
      }
    }
  } catch (error) {
    console.error(`[Track] Evaluation pipeline error for session ${sessionId}:`, error);
  }
});

/**
 * Process an incoming track event from the widget.
 */
export async function processTrackEvent(
  visitorKey: string,
  sessionData: SessionInitData,
  rawEvent: Record<string, unknown>
) {
  // 1. Get or create session
  const sessionId = await getOrCreateSession(visitorKey, sessionData);

  // 2. Normalize the event
  const normalized = normalizeEvent(rawEvent);

  // 3. Persist the event
  const event = await EventRepo.createEvent({
    sessionId,
    ...normalized,
  });

  // 4. Update cart if cart event
  if (normalized.category === "cart") {
    try {
      const signals = JSON.parse(normalized.rawSignals);
      if (signals.cartValue !== undefined) {
        await updateSessionCart(
          sessionId,
          Number(signals.cartValue),
          Number(signals.cartItemCount ?? 0)
        );
      }
    } catch {
      // ignore parse errors
    }
  }

  // 5. Broadcast raw event to dashboard
  broadcastToChannel("dashboard", {
    type: "track_event",
    sessionId,
    data: {
      id: event.id,
      ...normalized,
      timestamp: event.timestamp,
    },
  });

  // 6. Buffer for evaluation
  buffer.add(sessionId, event.id);

  return { sessionId, eventId: event.id };
}
