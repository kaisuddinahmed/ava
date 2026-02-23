import type { FISMBridge } from "../ws-transport.js";

/**
 * Click Observer — Tracks clicks on interactive elements, dead clicks, rage clicks.
 * Detects: F023 (dead click), F400 (rage click), general click tracking.
 */
export class ClickObserver {
  private bridge: FISMBridge;
  private rageState = { count: 0, lastTime: 0, lastX: 0, lastY: 0 };
  private clickCount = 0;
  private handler: ((e: MouseEvent) => void) | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.handler = (e: MouseEvent) => {
      this.clickCount++;
      const target = e.target as HTMLElement;
      const now = Date.now();

      // --- Rage click detection ---
      const dx = Math.abs(e.clientX - this.rageState.lastX);
      const dy = Math.abs(e.clientY - this.rageState.lastY);

      if (now - this.rageState.lastTime < 500 && dx < 30 && dy < 30) {
        this.rageState.count++;
        if (this.rageState.count >= 3) {
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: "F400",
            category: "technical",
            event_type: "rage_click",
            raw_signals: {
              click_count: this.rageState.count,
              target_tag: target.tagName,
              target_class: target.className,
            },
            timestamp: now,
          });
          this.rageState.count = 0;
        }
      } else {
        this.rageState.count = 1;
      }
      this.rageState.lastTime = now;
      this.rageState.lastX = e.clientX;
      this.rageState.lastY = e.clientY;

      // --- Dead click detection ---
      const isInteractive =
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.closest("a") !== null ||
        target.closest("button") !== null ||
        target.getAttribute("role") === "button" ||
        window.getComputedStyle(target).cursor === "pointer";

      if (!isInteractive) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F023",
          category: "navigation",
          event_type: "dead_click",
          raw_signals: {
            target_tag: target.tagName,
            target_class: target.className,
            position_x: e.clientX,
            position_y: e.clientY,
          },
          timestamp: now,
        });
      }

      // --- General click tracking (with normalized coordinates for heatmap) ---
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "engagement",
        event_type: "click",
        raw_signals: {
          target_tag: target.tagName,
          target_text: target.textContent?.slice(0, 50) || "",
          is_interactive: isInteractive,
          total_clicks: this.clickCount,
          // Heatmap coordinates — normalized to 0-1 range
          x_pct: Math.round((e.clientX / vw) * 1000) / 1000,
          y_pct: Math.round((e.clientY / vh) * 1000) / 1000,
          client_x: e.clientX,
          client_y: e.clientY,
          viewport_width: vw,
          viewport_height: vh,
        },
        timestamp: now,
      });
    };

    document.addEventListener("click", this.handler, { capture: true });
  }

  stop(): void {
    if (this.handler) {
      document.removeEventListener("click", this.handler, { capture: true });
      this.handler = null;
    }
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
