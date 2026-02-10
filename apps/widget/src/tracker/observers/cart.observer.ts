import type { FISMBridge } from "../ws-transport.js";

/**
 * Cart Observer — Monitors cart changes, ATC events, cart abandonment signals.
 * Detects: F068 (cart abandonment), F069 (idle with items in cart),
 *          F117 (sticker shock — price increase at cart).
 */
export class CartObserver {
  private bridge: FISMBridge;
  private mutationObserver: MutationObserver | null = null;
  private lastCartValue = 0;
  private lastCartCount = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    // Observe DOM for cart changes
    this.mutationObserver = new MutationObserver(() => {
      this.checkCartChanges();
    });

    // Watch common cart count selectors
    const cartSelectors = [
      ".cart-count",
      ".cart-total",
      "[data-cart-count]",
      ".cart-contents-count",
      ".cart-badge",
      ".mini-cart",
      "#cart-count",
    ];

    for (const sel of cartSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        this.mutationObserver.observe(el, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }

    // Also observe body for dynamically added cart elements
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });

    // Listen for ATC button clicks
    document.addEventListener("click", this.handleATCClick);

    // Poll for cart value changes (Shopify/WooCommerce APIs)
    this.pollInterval = setInterval(() => this.pollCartAPI(), 10000);

    // Idle with cart items
    this.startIdleTracking();

    // Initial check
    this.checkCartChanges();
  }

  private handleATCClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const atcEl =
      target.closest("[data-action='add-to-cart']") ||
      target.closest(".add-to-cart") ||
      target.closest("button[name='add']") ||
      target.closest("form[action*='/cart'] button[type='submit']");

    const textMatch = target.textContent?.toLowerCase().match(/add to (cart|bag|basket)/);

    if (atcEl || textMatch) {
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "cart",
        event_type: "add_to_cart_click",
        raw_signals: {
          button_text: (atcEl as HTMLElement)?.textContent?.trim().slice(0, 50) || target.textContent?.trim().slice(0, 50),
          page_url: window.location.href,
        },
        timestamp: Date.now(),
      });
    }
  };

  private checkCartChanges(): void {
    // Try to read cart count from DOM
    const countEl =
      document.querySelector(".cart-count") ||
      document.querySelector("[data-cart-count]") ||
      document.querySelector(".cart-contents-count") ||
      document.querySelector(".cart-badge");

    if (countEl) {
      const text = countEl.textContent?.trim() || "0";
      const count = parseInt(text.replace(/[^0-9]/g, ""), 10) || 0;

      if (count !== this.lastCartCount) {
        const wasEmpty = this.lastCartCount === 0;
        this.lastCartCount = count;

        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: null,
          category: "cart",
          event_type: count > this.lastCartCount ? "cart_item_added" : "cart_updated",
          raw_signals: {
            cart_item_count: count,
            was_empty: wasEmpty,
          },
          timestamp: Date.now(),
        });
      }
    }

    // Try to read cart total from DOM
    const totalEl =
      document.querySelector(".cart-total") ||
      document.querySelector("[data-cart-total]") ||
      document.querySelector(".cart-subtotal");

    if (totalEl) {
      const text = totalEl.textContent || "";
      const match = text.match(/[\d,.]+/);
      if (match) {
        const value = parseFloat(match[0].replace(/,/g, ""));
        if (!isNaN(value) && value !== this.lastCartValue) {
          // F117: Sticker shock — sudden price increase
          if (value > this.lastCartValue * 1.3 && this.lastCartValue > 0) {
            this.bridge.send("behavioral_event", {
              event_id: this.uid(),
              friction_id: "F117",
              category: "cart",
              event_type: "sticker_shock",
              raw_signals: {
                previous_value: this.lastCartValue,
                new_value: value,
                increase_pct: Math.round(((value - this.lastCartValue) / this.lastCartValue) * 100),
              },
              timestamp: Date.now(),
            });
          }
          this.lastCartValue = value;
        }
      }
    }
  }

  private async pollCartAPI(): Promise<void> {
    // Shopify cart.js polling
    if ((window as any).Shopify) {
      try {
        const res = await fetch("/cart.js");
        if (res.ok) {
          const cart = await res.json();
          if (cart.item_count !== this.lastCartCount) {
            this.lastCartCount = cart.item_count;
            this.lastCartValue = cart.total_price / 100;
            this.bridge.send("behavioral_event", {
              event_id: this.uid(),
              friction_id: null,
              category: "cart",
              event_type: "cart_polled",
              raw_signals: {
                item_count: cart.item_count,
                total_value: this.lastCartValue,
                source: "shopify_api",
              },
              timestamp: Date.now(),
            });
          }
        }
      } catch {
        // Ignore polling errors
      }
    }
  }

  private startIdleTracking(): void {
    const resetIdle = () => {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (this.lastCartCount > 0) {
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: "F069",
            category: "cart",
            event_type: "idle_with_cart",
            raw_signals: {
              idle_duration_ms: 300000,
              cart_item_count: this.lastCartCount,
              cart_value: this.lastCartValue,
            },
            timestamp: Date.now(),
          });
        }
      }, 300000); // 5 min idle
    };

    for (const evt of ["mousemove", "keydown", "scroll", "touchstart"]) {
      document.addEventListener(evt, resetIdle, { passive: true });
    }
    resetIdle();
  }

  stop(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.pollInterval) clearInterval(this.pollInterval);
    document.removeEventListener("click", this.handleATCClick);
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
