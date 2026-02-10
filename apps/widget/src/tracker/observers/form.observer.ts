import type { FISMBridge } from "../ws-transport.js";

/**
 * Form Observer — Tracks form interactions, validation errors, field timing.
 * Detects: F091 (form validation errors), F094 (payment field pause),
 *          F089 (forced account creation detection).
 */
export class FormObserver {
  private bridge: FISMBridge;
  private fieldFocusTimes = new Map<HTMLElement, number>();
  private errorCount = 0;
  private invalidHandler: ((e: Event) => void) | null = null;
  private focusInHandler: ((e: FocusEvent) => void) | null = null;
  private focusOutHandler: ((e: FocusEvent) => void) | null = null;
  private submitHandler: ((e: Event) => void) | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    // Track form validation errors
    this.invalidHandler = (e: Event) => {
      this.errorCount++;
      const target = e.target as HTMLInputElement;

      if (this.errorCount >= 2) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F091",
          category: "checkout",
          event_type: "form_validation_errors",
          raw_signals: {
            error_count: this.errorCount,
            field_name: target.name || target.id,
            field_type: target.type,
            validation_message: target.validationMessage,
          },
          timestamp: Date.now(),
        });
      }
    };

    // Track field focus timing
    this.focusInHandler = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === "INPUT" && target.type !== "hidden") {
        this.fieldFocusTimes.set(target, Date.now());
      }

      // Detect forced account creation — focus on registration forms
      const form = target.closest("form");
      if (form) {
        const isRegistrationForm =
          form.action?.includes("register") ||
          form.action?.includes("signup") ||
          form.action?.includes("account/create") ||
          form.querySelector("input[name*='password_confirm']") !== null;

        if (isRegistrationForm) {
          this.bridge.send("behavioral_event", {
            event_id: this.uid(),
            friction_id: "F089",
            category: "account",
            event_type: "forced_account_creation",
            raw_signals: {
              form_action: form.action?.slice(0, 100),
              field_count: form.querySelectorAll("input:not([type='hidden'])").length,
            },
            timestamp: Date.now(),
          });
        }
      }
    };

    // Track field fill time — especially payment fields
    this.focusOutHandler = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      const focusTime = this.fieldFocusTimes.get(target);
      if (!focusTime) return;

      const duration = Date.now() - focusTime;
      this.fieldFocusTimes.delete(target);

      const isPaymentField =
        target.name?.includes("card") ||
        target.name?.includes("payment") ||
        target.name?.includes("cc") ||
        target.autocomplete?.includes("cc-");

      // F094: Pauses at payment fields (>30s)
      if (duration > 30000 && isPaymentField) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F094",
          category: "checkout",
          event_type: "payment_field_pause",
          raw_signals: {
            field_name: target.name || target.id,
            focus_duration_ms: duration,
          },
          timestamp: Date.now(),
        });
      }

      // General field timing event (>10s on any field)
      if (duration > 10000) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: null,
          category: "engagement",
          event_type: "field_hesitation",
          raw_signals: {
            field_name: target.name || target.id,
            field_type: target.type,
            focus_duration_ms: duration,
            is_payment: isPaymentField,
          },
          timestamp: Date.now(),
        });
      }
    };

    // Track form submissions
    this.submitHandler = (e: Event) => {
      const form = e.target as HTMLFormElement;
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: null,
        category: "engagement",
        event_type: "form_submit",
        raw_signals: {
          form_action: form.action?.slice(0, 100),
          form_method: form.method,
          field_count: form.querySelectorAll("input:not([type='hidden'])").length,
        },
        timestamp: Date.now(),
      });
    };

    document.addEventListener("invalid", this.invalidHandler, true);
    document.addEventListener("focusin", this.focusInHandler);
    document.addEventListener("focusout", this.focusOutHandler);
    document.addEventListener("submit", this.submitHandler, true);
  }

  stop(): void {
    if (this.invalidHandler) document.removeEventListener("invalid", this.invalidHandler, true);
    if (this.focusInHandler) document.removeEventListener("focusin", this.focusInHandler);
    if (this.focusOutHandler) document.removeEventListener("focusout", this.focusOutHandler);
    if (this.submitHandler) document.removeEventListener("submit", this.submitHandler, true);
    this.fieldFocusTimes.clear();
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
