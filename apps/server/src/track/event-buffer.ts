import { config } from "../config.js";

type BatchCallback = (sessionId: string, eventIds: string[]) => void;

interface BufferEntry {
  eventIds: string[];
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Event buffer that batches events per session.
 * Flushes every 5 seconds or when 10 events accumulate.
 */
export class EventBuffer {
  private buffers = new Map<string, BufferEntry>();
  private onFlush: BatchCallback;

  constructor(onFlush: BatchCallback) {
    this.onFlush = onFlush;
  }

  /**
   * Add an event to the buffer for a session.
   */
  add(sessionId: string, eventId: string): void {
    let entry = this.buffers.get(sessionId);

    if (!entry) {
      entry = {
        eventIds: [],
        timer: setTimeout(() => {
          this.flush(sessionId);
        }, config.evaluation.batchIntervalMs),
      };
      this.buffers.set(sessionId, entry);
    }

    entry.eventIds.push(eventId);

    // Flush if max batch size reached
    if (entry.eventIds.length >= config.evaluation.batchMaxEvents) {
      this.flush(sessionId);
    }
  }

  /**
   * Flush buffered events for a session.
   */
  flush(sessionId: string): void {
    const entry = this.buffers.get(sessionId);
    if (!entry || entry.eventIds.length === 0) return;

    clearTimeout(entry.timer);
    const eventIds = [...entry.eventIds];
    this.buffers.delete(sessionId);

    this.onFlush(sessionId, eventIds);
  }

  /**
   * Flush all sessions (e.g., on shutdown).
   */
  flushAll(): void {
    for (const sessionId of this.buffers.keys()) {
      this.flush(sessionId);
    }
  }
}
