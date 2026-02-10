import type { FISMBridge } from "../ws-transport.js";

/**
 * Copy Observer — Tracks clipboard copy events (price comparison, product name lookup).
 * Detects: F060 (price comparison behavior), product research signals.
 */
export class CopyObserver {
  private bridge: FISMBridge;
  private copyCount = 0;
  private handler: (() => void) | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.handler = () => {
      const selection = window.getSelection()?.toString()?.trim() || "";
      if (!selection) return;

      this.copyCount++;
      const now = Date.now();

      const pricePattern = /[\$\€\£][\d,.]+|\d+[\.,]\d{2}/;
      const isPrice = pricePattern.test(selection);

      // F060: Copying price — likely comparison shopping
      if (isPrice) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F060",
          category: "product",
          event_type: "price_copy",
          raw_signals: {
            copied_text: selection.slice(0, 50),
            copy_count: this.copyCount,
            page_url: window.location.href,
          },
          timestamp: now,
        });
        return;
      }

      // Product name / title copy — research behavior
      const isProductPage =
        window.location.pathname.includes("/product") ||
        window.location.pathname.includes("/item") ||
        document.querySelector("meta[property='og:type'][content='product']") !== null;

      if (isProductPage && selection.length > 5 && selection.length < 200) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: null,
          category: "product",
          event_type: "product_text_copy",
          raw_signals: {
            copied_text: selection.slice(0, 100),
            copy_count: this.copyCount,
            likely_purpose: selection.length < 50 ? "search_comparison" : "reference",
          },
          timestamp: now,
        });
        return;
      }

      // General copy event
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "engagement",
        event_type: "copy",
        raw_signals: {
          content_length: selection.length,
          copy_count: this.copyCount,
        },
        timestamp: now,
      });
    };

    document.addEventListener("copy", this.handler);
  }

  stop(): void {
    if (this.handler) {
      document.removeEventListener("copy", this.handler);
      this.handler = null;
    }
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
