import type { FISMBridge } from "../ws-transport.js";

/**
 * Performance Observer — Tracks page load speed, JS errors, resource failures.
 * Detects: F001 (slow page load), F005 (JS errors), F006 (broken images/resources).
 */
export class PerformanceObserver {
  private bridge: FISMBridge;
  private errorHandler: ((e: ErrorEvent) => void) | null = null;
  private rejectionHandler: ((e: PromiseRejectionEvent) => void) | null = null;
  private errorCount = 0;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    // Page load performance
    this.checkPagePerformance();

    // JS error tracking
    this.errorHandler = (e: ErrorEvent) => {
      this.errorCount++;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: "F005",
        category: "technical",
        event_type: "js_error",
        raw_signals: {
          message: e.message?.slice(0, 200),
          filename: e.filename?.slice(0, 100),
          line: e.lineno,
          col: e.colno,
          error_count: this.errorCount,
        },
        timestamp: Date.now(),
      });
    };
    window.addEventListener("error", this.errorHandler);

    // Unhandled promise rejections
    this.rejectionHandler = (e: PromiseRejectionEvent) => {
      this.errorCount++;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: "F005",
        category: "technical",
        event_type: "unhandled_rejection",
        raw_signals: {
          reason: String(e.reason)?.slice(0, 200),
          error_count: this.errorCount,
        },
        timestamp: Date.now(),
      });
    };
    window.addEventListener("unhandledrejection", this.rejectionHandler);

    // Broken resource tracking (images, scripts, etc.)
    this.trackBrokenResources();
  }

  private checkPagePerformance(): void {
    // Wait for page to be fully loaded
    const check = () => {
      const perf = window.performance;
      if (!perf || !perf.timing) return;

      const timing = perf.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
      const ttfb = timing.responseStart - timing.navigationStart;

      // Only emit once load is complete
      if (loadTime <= 0) {
        setTimeout(check, 500);
        return;
      }

      // F001: Slow page load (>3 seconds)
      if (loadTime > 3000) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F001",
          category: "technical",
          event_type: "slow_page_load",
          raw_signals: {
            load_time_ms: loadTime,
            dom_ready_ms: domReady,
            ttfb_ms: ttfb,
            page_url: window.location.href,
          },
          timestamp: Date.now(),
        });
      }

      // General performance event
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "technical",
        event_type: "page_performance",
        raw_signals: {
          load_time_ms: loadTime,
          dom_ready_ms: domReady,
          ttfb_ms: ttfb,
          resource_count: perf.getEntriesByType?.("resource")?.length || 0,
        },
        timestamp: Date.now(),
      });

      // Check LCP if available
      try {
        const lcpObserver = new window.PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry && (lastEntry as any).startTime > 4000) {
            this.bridge.send("behavioral_event", {
              event_id: this.uid(),
              friction_id: "F001",
              category: "technical",
              event_type: "slow_lcp",
              raw_signals: {
                lcp_ms: Math.round((lastEntry as any).startTime),
                element: (lastEntry as any).element?.tagName,
              },
              timestamp: Date.now(),
            });
          }
          lcpObserver.disconnect();
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        // LCP API not available
      }
    };

    if (document.readyState === "complete") {
      setTimeout(check, 100);
    } else {
      window.addEventListener("load", () => setTimeout(check, 100));
    }
  }

  private trackBrokenResources(): void {
    // Listen for resource load errors on images
    document.addEventListener(
      "error",
      (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "IMG" || target.tagName === "SCRIPT" || target.tagName === "LINK") {
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: "F006",
            category: "technical",
            event_type: "broken_resource",
            raw_signals: {
              resource_type: target.tagName.toLowerCase(),
              resource_src: (target as HTMLImageElement).src?.slice(0, 200) ||
                (target as HTMLLinkElement).href?.slice(0, 200),
            },
            timestamp: Date.now(),
          });
        }
      },
      true,
    );
  }

  stop(): void {
    if (this.errorHandler) {
      window.removeEventListener("error", this.errorHandler);
      this.errorHandler = null;
    }
    if (this.rejectionHandler) {
      window.removeEventListener("unhandledrejection", this.rejectionHandler);
      this.rejectionHandler = null;
    }
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
