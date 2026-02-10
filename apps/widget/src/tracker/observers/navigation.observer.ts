import type { FISMBridge } from "../ws-transport.js";

/**
 * Navigation Observer — Tracks page navigation, back-button usage, exit intent.
 * Detects: F002 (quick bounce), F068 (cart abandonment / exit intent),
 *          F010 (back-button presses).
 */
export class NavigationObserver {
  private bridge: FISMBridge;
  private pageLoadTime = Date.now();
  private pageViews = 0;
  private backCount = 0;
  private exitHandler: ((e: MouseEvent) => void) | null = null;
  private popStateHandler: (() => void) | null = null;
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private pageViewEmitted = false;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.pageLoadTime = Date.now();
    this.pageViews++;

    // Emit page view
    this.bridge.send("behavioral_event", {
      event_id: this.uid(),
      friction_id: null,
      category: "navigation",
      event_type: "page_view",
      raw_signals: {
        page_url: window.location.href,
        page_title: document.title,
        referrer: document.referrer,
        page_view_count: this.pageViews,
      },
      timestamp: Date.now(),
    });
    this.pageViewEmitted = true;

    // Quick bounce detection — leaving within 10 seconds
    setTimeout(() => {
      // If they haven't navigated away and spent < 10s, check engagement
    }, 10000);

    // Exit intent (mouse leaves viewport top)
    this.exitHandler = (e: MouseEvent) => {
      if (e.clientY <= 0 && e.relatedTarget === null) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F068",
          category: "cart",
          event_type: "exit_intent",
          raw_signals: {
            time_on_page_ms: Date.now() - this.pageLoadTime,
            page_url: window.location.href,
          },
          timestamp: Date.now(),
        });
      }
    };
    document.addEventListener("mouseout", this.exitHandler);

    // Back button detection
    this.popStateHandler = () => {
      this.backCount++;
      const timeOnPage = Date.now() - this.pageLoadTime;

      // F002: Quick bounce (back within 10s)
      if (timeOnPage < 10000) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F002",
          category: "navigation",
          event_type: "quick_bounce",
          raw_signals: {
            time_on_page_ms: timeOnPage,
            back_count: this.backCount,
          },
          timestamp: Date.now(),
        });
      }

      // F010: Rapid back-button presses
      if (this.backCount >= 3) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F010",
          category: "navigation",
          event_type: "rapid_back_navigation",
          raw_signals: {
            back_count: this.backCount,
          },
          timestamp: Date.now(),
        });
      }

      // Reset page load time for new page
      this.pageLoadTime = Date.now();
    };
    window.addEventListener("popstate", this.popStateHandler);

    // Before unload — capture session end
    this.beforeUnloadHandler = () => {
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "navigation",
        event_type: "page_unload",
        raw_signals: {
          time_on_page_ms: Date.now() - this.pageLoadTime,
          total_page_views: this.pageViews,
        },
        timestamp: Date.now(),
      });
    };
    window.addEventListener("beforeunload", this.beforeUnloadHandler);
  }

  stop(): void {
    if (this.exitHandler) {
      document.removeEventListener("mouseout", this.exitHandler);
      this.exitHandler = null;
    }
    if (this.popStateHandler) {
      window.removeEventListener("popstate", this.popStateHandler);
      this.popStateHandler = null;
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
