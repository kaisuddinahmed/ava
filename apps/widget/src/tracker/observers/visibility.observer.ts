import type { FISMBridge } from "../ws-transport.js";

/**
 * Visibility Observer — Tracks page visibility (tab switches, focus loss).
 * Detects: re-engagement after tab-away, session idle indicators.
 */
export class VisibilityObserver {
  private bridge: FISMBridge;
  private hiddenAt: number | null = null;
  private totalHiddenTime = 0;
  private switchCount = 0;
  private visibilityHandler: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;
  private blurHandler: (() => void) | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        this.switchCount++;

        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: null,
          category: "engagement",
          event_type: "tab_hidden",
          raw_signals: {
            switch_count: this.switchCount,
            total_hidden_time_ms: this.totalHiddenTime,
          },
          timestamp: Date.now(),
        });
      } else if (this.hiddenAt) {
        const awayDuration = Date.now() - this.hiddenAt;
        this.totalHiddenTime += awayDuration;
        this.hiddenAt = null;

        // Re-engagement event
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: awayDuration > 60000 ? "F230_custom" : null,
          category: "engagement",
          event_type: "tab_returned",
          raw_signals: {
            away_duration_ms: awayDuration,
            switch_count: this.switchCount,
            total_hidden_time_ms: this.totalHiddenTime,
          },
          timestamp: Date.now(),
        });
      }
    };

    // Window focus/blur as backup
    this.focusHandler = () => {
      if (this.hiddenAt) {
        const duration = Date.now() - this.hiddenAt;
        this.totalHiddenTime += duration;
        this.hiddenAt = null;
      }
    };

    this.blurHandler = () => {
      if (!this.hiddenAt) {
        this.hiddenAt = Date.now();
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("focus", this.focusHandler);
    window.addEventListener("blur", this.blurHandler);
  }

  stop(): void {
    if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
    if (this.focusHandler) window.removeEventListener("focus", this.focusHandler);
    if (this.blurHandler) window.removeEventListener("blur", this.blurHandler);
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
