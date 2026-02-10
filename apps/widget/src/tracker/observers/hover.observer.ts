import type { FISMBridge } from "../ws-transport.js";

/**
 * Hover Observer — Tracks hover intent on key elements (ATC buttons, links, images).
 * Detects: F058 (ATC hover without click), F059 (product image prolonged hover).
 */
export class HoverObserver {
  private bridge: FISMBridge;
  private activeTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  private overHandler: ((e: MouseEvent) => void) | null = null;
  private outHandler: ((e: MouseEvent) => void) | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    this.overHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // ATC button hover
      const atcEl =
        target.closest("[data-action='add-to-cart']") ||
        target.closest(".add-to-cart") ||
        target.closest("button[name='add']") ||
        (target.textContent?.toLowerCase().includes("add to cart") ? target : null);

      if (atcEl && !this.activeTimers.has(atcEl as HTMLElement)) {
        const timer = setTimeout(() => {
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: "F058",
            category: "product",
            event_type: "atc_hover_hesitation",
            raw_signals: {
              hover_duration_ms: 3000,
              element_text: (atcEl as HTMLElement).textContent?.slice(0, 50),
            },
            timestamp: Date.now(),
          });
          this.activeTimers.delete(atcEl as HTMLElement);
        }, 3000);
        this.activeTimers.set(atcEl as HTMLElement, timer);
      }

      // Product image prolonged hover
      if (target.tagName === "IMG" && target.closest(".product, [data-product], .product-card")) {
        const timer = setTimeout(() => {
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: "F059",
            category: "product",
            event_type: "product_image_hover",
            raw_signals: {
              hover_duration_ms: 5000,
              image_src: (target as HTMLImageElement).src?.slice(0, 100),
            },
            timestamp: Date.now(),
          });
          this.activeTimers.delete(target);
        }, 5000);
        this.activeTimers.set(target, timer);
      }
    };

    this.outHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Clear any active timer for this element or its parents
      for (const [el, timer] of this.activeTimers) {
        if (el === target || el.contains(target)) {
          clearTimeout(timer);
          this.activeTimers.delete(el);
        }
      }
    };

    document.addEventListener("mouseover", this.overHandler);
    document.addEventListener("mouseout", this.outHandler);
  }

  stop(): void {
    if (this.overHandler) {
      document.removeEventListener("mouseover", this.overHandler);
      this.overHandler = null;
    }
    if (this.outHandler) {
      document.removeEventListener("mouseout", this.outHandler);
      this.outHandler = null;
    }
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
