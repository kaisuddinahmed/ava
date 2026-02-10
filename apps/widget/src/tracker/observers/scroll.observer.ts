import type { FISMBridge } from "../ws-transport.js";

/**
 * Scroll Observer — Tracks scroll depth, rapid scrolling, and content engagement.
 * Detects: F015 (scrolled without clicking), F016 (rapid scroll / bouncing).
 */
export class ScrollObserver {
  private bridge: FISMBridge;
  private maxDepth = 0;
  private milestonesSent = new Set<number>();
  private scrollStartTime = 0;
  private scrollDistance = 0;
  private lastScrollY = 0;
  private handler: (() => void) | null = null;
  private rapidScrollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.lastScrollY = window.scrollY;
    this.scrollStartTime = Date.now();

    this.handler = () => {
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      const scrolled = window.scrollY + window.innerHeight;
      const depth = Math.round((scrolled / docHeight) * 100);
      const now = Date.now();

      // Track scroll distance for rapid scroll detection
      this.scrollDistance += Math.abs(window.scrollY - this.lastScrollY);
      this.lastScrollY = window.scrollY;

      // Update max depth
      if (depth > this.maxDepth) {
        this.maxDepth = depth;
      }

      // Emit at 25%, 50%, 75%, 90% milestones
      for (const milestone of [25, 50, 75, 90]) {
        if (depth >= milestone && !this.milestonesSent.has(milestone)) {
          this.milestonesSent.add(milestone);
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: null,
            category: "engagement",
            event_type: "scroll_milestone",
            raw_signals: {
              scroll_depth_pct: milestone,
              time_to_milestone_ms: now - this.scrollStartTime,
            },
            timestamp: now,
          });
        }
      }

      // F015: Scrolled entire page without clicking (95%+)
      if (depth >= 95 && !this.milestonesSent.has(95)) {
        this.milestonesSent.add(95);
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F015",
          category: "navigation",
          event_type: "full_scroll_no_action",
          raw_signals: {
            scroll_depth_pct: depth,
            time_on_page_ms: now - this.scrollStartTime,
          },
          timestamp: now,
        });
      }

      // Rapid scroll detection — lots of scrolling in short time
      if (this.rapidScrollTimer) clearTimeout(this.rapidScrollTimer);
      this.rapidScrollTimer = setTimeout(() => {
        const elapsed = Date.now() - this.scrollStartTime;
        const rate = this.scrollDistance / (elapsed / 1000); // px/sec
        if (rate > 5000 && elapsed > 2000) {
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: "F016",
            category: "navigation",
            event_type: "rapid_scroll",
            raw_signals: {
              scroll_rate_px_sec: Math.round(rate),
              total_scroll_distance: this.scrollDistance,
            },
            timestamp: Date.now(),
          });
        }
      }, 500);
    };

    window.addEventListener("scroll", this.handler, { passive: true });
  }

  stop(): void {
    if (this.handler) {
      window.removeEventListener("scroll", this.handler);
      this.handler = null;
    }
    if (this.rapidScrollTimer) {
      clearTimeout(this.rapidScrollTimer);
    }
  }

  getMaxDepth(): number {
    return this.maxDepth;
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
