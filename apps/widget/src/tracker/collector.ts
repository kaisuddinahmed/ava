import { FISMBridge } from "./ws-transport.js";

export class BehaviorCollector {
  private bridge: FISMBridge;
  private observers: MutationObserver[] = [];
  private timers: number[] = [];
  private scrollDepth = 0;
  private pageEnterTime = Date.now();
  private rageClickTracker = { count: 0, lastTime: 0, lastX: 0, lastY: 0 };

  constructor(bridge: FISMBridge, _sessionId: string, _userId: string | null) {
    this.bridge = bridge;
  }

  startCollecting(): void {
    this.trackScrollDepth();
    this.trackRageClicks();
    this.trackDeadClicks();
    this.trackHoverIntent();
    this.trackFormFriction();
    this.trackCopyEvents();
    this.trackExitIntent();
    this.trackIdleTime();
    this.trackPageVisibility();
  }

  private emit(friction_id: string, category: string, signals: Record<string, any>): void {
    this.bridge.send("behavioral_event", {
      event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      friction_id,
      category,
      raw_signals: signals,
      page_context: {
        page_type: this.detectPageType(),
        page_url: window.location.href,
        time_on_page_ms: Date.now() - this.pageEnterTime,
        scroll_depth_pct: this.scrollDepth,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        device: this.detectDevice(),
      },
      timestamp: Date.now(),
    });
  }

  // --- Scroll Depth ---
  private trackScrollDepth(): void {
    const handler = () => {
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const scrolled = window.scrollY + window.innerHeight;
      const depth = Math.round((scrolled / docHeight) * 100);
      this.scrollDepth = Math.max(this.scrollDepth, depth);

      // F015: Scrolled entire page without clicking
      if (depth >= 95) {
        const clicks = parseInt(sessionStorage.getItem("sa_click_count") || "0");
        if (clicks === 0) {
          this.emit("F015", "navigation", { scroll_depth: depth, click_count: 0 });
        }
      }
    };
    window.addEventListener("scroll", handler, { passive: true });
  }

  // --- Rage Clicks ---
  private trackRageClicks(): void {
    document.addEventListener("click", (e) => {
      const now = Date.now();
      const dx = Math.abs(e.clientX - this.rageClickTracker.lastX);
      const dy = Math.abs(e.clientY - this.rageClickTracker.lastY);

      if (now - this.rageClickTracker.lastTime < 500 && dx < 30 && dy < 30) {
        this.rageClickTracker.count++;
        if (this.rageClickTracker.count >= 3) {
          this.emit("F400", "technical", {
            rage_click: true,
            target: (e.target as HTMLElement)?.tagName,
            target_class: (e.target as HTMLElement)?.className,
            click_count: this.rageClickTracker.count,
          });
          this.rageClickTracker.count = 0;
        }
      } else {
        this.rageClickTracker.count = 1;
      }

      this.rageClickTracker.lastTime = now;
      this.rageClickTracker.lastX = e.clientX;
      this.rageClickTracker.lastY = e.clientY;

      // Track total clicks for other detectors
      const count = parseInt(sessionStorage.getItem("sa_click_count") || "0");
      sessionStorage.setItem("sa_click_count", String(count + 1));
    });
  }

  // --- Dead Clicks ---
  private trackDeadClicks(): void {
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const isInteractive =
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.closest("a") ||
        target.closest("button") ||
        target.getAttribute("role") === "button" ||
        window.getComputedStyle(target).cursor === "pointer";

      if (!isInteractive && target.tagName === "IMG") {
        this.emit("F023", "navigation", {
          dead_click: true,
          element: target.tagName,
          element_class: target.className,
        });
      }
    });
  }

  // --- Hover Intent (ATC button hover without click) ---
  private trackHoverIntent(): void {
    let hoverTimer: number | null = null;

    document.addEventListener("mouseover", (e) => {
      const target = e.target as HTMLElement;
      const isATC =
        target.closest("[data-action='add-to-cart']") ||
        target.closest(".add-to-cart") ||
        target.textContent?.toLowerCase().includes("add to cart");

      if (isATC) {
        hoverTimer = window.setTimeout(() => {
          this.emit("F058", "product", {
            hover_atc_button: true,
            hover_duration_ms: 3000,
          });
        }, 3000);
      }
    });

    document.addEventListener("mouseout", (_e) => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    });
  }

  // --- Form Friction ---
  private trackFormFriction(): void {
    let fieldErrorCount = 0;

    document.addEventListener("invalid", (e) => {
      fieldErrorCount++;
      if (fieldErrorCount >= 2) {
        this.emit("F091", "checkout", {
          form_error_count: fieldErrorCount,
          field_name: (e.target as HTMLInputElement)?.name,
        });
      }
    }, true);

    // Track time to fill form fields
    document.addEventListener("focusin", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === "INPUT" && target.type !== "hidden") {
        target.dataset.saFocusTime = String(Date.now());
      }
    });

    document.addEventListener("focusout", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.dataset.saFocusTime) {
        const focusTime = parseInt(target.dataset.saFocusTime);
        const duration = Date.now() - focusTime;
        // F094: Pauses at payment field
        if (duration > 30000 && (target.name?.includes("card") || target.name?.includes("payment"))) {
          this.emit("F094", "checkout", {
            payment_field_focus_time: duration,
            field_name: target.name,
          });
        }
      }
    });
  }

  // --- Copy Events (price comparison behavior) ---
  private trackCopyEvents(): void {
    document.addEventListener("copy", () => {
      const selection = window.getSelection()?.toString() || "";
      const pricePattern = /\$[\d,.]+/;
      if (pricePattern.test(selection)) {
        this.emit("F060", "product", {
          copy_event: true,
          copied_content_type: "price",
        });
      }
    });
  }

  // --- Exit Intent ---
  private trackExitIntent(): void {
    document.addEventListener("mouseout", (e) => {
      if (
        (e as MouseEvent).clientY <= 0 &&
        (e as MouseEvent).relatedTarget === null
      ) {
        const cartValue = parseFloat(sessionStorage.getItem("sa_cart_value") || "0");
        if (cartValue > 0) {
          this.emit("F068", "cart", {
            exit_intent: true,
            cart_value: cartValue,
          });
        }
      }
    });
  }

  // --- Idle Time ---
  private trackIdleTime(): void {
    let idleTimer: number;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        const cartItems = parseInt(sessionStorage.getItem("sa_cart_items") || "0");
        if (cartItems > 0) {
          this.emit("F069", "cart", {
            idle_duration_ms: 300000,
            cart_item_count: cartItems,
          });
        }
      }, 300000); // 5 min idle
    };

    ["mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, resetIdle, { passive: true });
    });
    resetIdle();
  }

  // --- Page Visibility (tab switch) ---
  private trackPageVisibility(): void {
    let hiddenAt: number | null = null;

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt) {
        const awayDuration = Date.now() - hiddenAt;
        if (awayDuration > 60000) { // away > 1 min
          this.emit("F230_custom", "re_engagement", {
            away_duration_ms: awayDuration,
            returned: true,
          });
        }
        hiddenAt = null;
      }
    });
  }

  // --- Utility ---
  private detectPageType(): string {
    const path = window.location.pathname.toLowerCase();
    if (path === "/" || path === "/home") return "landing";
    if (path.includes("/category") || path.includes("/collection")) return "category";
    if (path.includes("/search")) return "search_results";
    if (path.includes("/product") || path.includes("/item") || path.includes("/p/")) return "pdp";
    if (path.includes("/cart") || path.includes("/bag")) return "cart";
    if (path.includes("/checkout")) return "checkout";
    if (path.includes("/account") || path.includes("/profile")) return "account";
    return "other";
  }

  private detectDevice(): "mobile" | "tablet" | "desktop" {
    const w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  stopCollecting(): void {
    this.observers.forEach((o) => o.disconnect());
    this.timers.forEach((t) => clearTimeout(t));
  }
}
