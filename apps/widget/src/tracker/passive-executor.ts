import { UIAdjustment } from "../config.js";

export class PassiveExecutor {
  static execute(adjustment: UIAdjustment): void {
    switch (adjustment.adjustment_type) {
      case "inject_shipping_progress_bar":
        this.injectShippingBar(adjustment);
        break;
      case "enhance_trust_signals":
        this.enhanceTrustSignals(adjustment);
        break;
      case "sticky_price_bar":
        this.stickyPriceBar(adjustment);
        break;
      case "inject_bnpl_callout":
        this.injectBNPL(adjustment);
        break;
      case "highlight_element":
        this.highlightElement(adjustment);
        break;
      case "reorder_content":
        this.reorderContent(adjustment);
        break;
      default:
        console.log("[AVA:Passive] Unhandled adjustment:", adjustment.adjustment_type);
    }
  }

  private static injectShippingBar(adj: UIAdjustment): void {
    const target = document.querySelector(adj.target_selector || ".cart-summary");
    if (!target || document.getElementById("sa-shipping-bar")) return;

    const { current_total, free_shipping_threshold } = adj.params;
    const remaining = Math.max(0, free_shipping_threshold - current_total);
    const pct = Math.min((current_total / free_shipping_threshold) * 100, 100);

    const bar = document.createElement("div");
    bar.id = "sa-shipping-bar";
    bar.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #f0fdf4, #dcfce7);
        border: 1px solid #bbf7d0;
        border-radius: 10px;
        padding: 12px 16px;
        margin: 12px 0;
        font-family: 'DM Sans', system-ui, sans-serif;
        font-size: 13px;
        color: #166534;
        animation: sa-slideDown 0.3s ease-out;
      ">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>${remaining > 0 ? `Add $${remaining.toFixed(0)} more for <b>FREE shipping</b>` : "🎉 You've got <b>FREE shipping!</b>"}</span>
          <span style="font-weight:600;">${pct.toFixed(0)}%</span>
        </div>
        <div style="background:#d1fae5; border-radius:999px; height:6px; overflow:hidden;">
          <div style="background:#22c55e; height:100%; width:${pct}%; border-radius:999px; transition:width 0.5s ease;"></div>
        </div>
      </div>
    `;
    target.insertBefore(bar, target.firstChild);
  }

  private static enhanceTrustSignals(adj: UIAdjustment): void {
    const target = document.querySelector(adj.target_selector || ".checkout-payment");
    if (!target || document.getElementById("sa-trust-badges")) return;

    const badges = adj.params.badges || ["ssl", "money_back", "secure_checkout"];
    const badgeIcons: Record<string, string> = {
      ssl: "🔒 SSL Encrypted",
      money_back: "💰 Money-Back Guarantee",
      secure_checkout: "🛡️ Secure Checkout",
      free_returns: "↩️ Free Returns",
    };

    const container = document.createElement("div");
    container.id = "sa-trust-badges";
    container.innerHTML = `
      <div style="
        display:flex; gap:12px; flex-wrap:wrap;
        padding:12px 0; margin:8px 0;
        border-top:1px solid #e5e7eb;
        font-family:'DM Sans', system-ui, sans-serif;
        font-size:12px; color:#6b7280;
        animation: sa-fadeIn 0.4s ease-out;
      ">
        ${badges.map((b: string) => `<span style="display:flex;align-items:center;gap:4px;">${badgeIcons[b] || b}</span>`).join("")}
      </div>
    `;
    target.appendChild(container);
  }

  private static stickyPriceBar(adj: UIAdjustment): void {
    const priceEl = document.querySelector(adj.target_selector || ".product-price");
    if (!priceEl || document.getElementById("sa-sticky-price")) return;

    const price = priceEl.textContent;
    const observer = new IntersectionObserver(
      ([entry]) => {
        let stickyBar = document.getElementById("sa-sticky-price");
        if (!entry.isIntersecting) {
          if (!stickyBar) {
            stickyBar = document.createElement("div");
            stickyBar.id = "sa-sticky-price";
            stickyBar.innerHTML = `
              <div style="
                position:fixed; top:0; left:0; right:0;
                background:rgba(255,255,255,0.95); backdrop-filter:blur(10px);
                border-bottom:1px solid #e5e7eb;
                padding:10px 20px;
                display:flex; justify-content:space-between; align-items:center;
                z-index:99998;
                font-family:'DM Sans', system-ui, sans-serif;
                animation: sa-slideDown 0.2s ease-out;
              ">
                <span style="font-size:18px;font-weight:700;color:#111;">${price}</span>
                <button onclick="document.querySelector('.add-to-cart')?.click()"
                  style="background:#111;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
                  Add to Cart
                </button>
              </div>
            `;
            document.body.appendChild(stickyBar);
          }
        } else {
          stickyBar?.remove();
        }
      },
      { threshold: 0 }
    );
    observer.observe(priceEl);
  }

  private static injectBNPL(adj: UIAdjustment): void {
    const target = document.querySelector(adj.target_selector || ".product-price");
    if (!target || document.getElementById("sa-bnpl-callout")) return;

    const { price, installments } = adj.params;
    const perMonth = (price / installments).toFixed(2);

    const callout = document.createElement("div");
    callout.id = "sa-bnpl-callout";
    callout.innerHTML = `
      <div style="
        font-family:'DM Sans', system-ui, sans-serif;
        font-size:13px; color:#7c3aed;
        margin-top:6px;
        animation: sa-fadeIn 0.3s ease-out;
      ">
        or <b>${installments} payments of $${perMonth}</b> with <span style="font-weight:700;">Klarna</span>
      </div>
    `;
    target.parentNode?.insertBefore(callout, target.nextSibling);
  }

  private static highlightElement(adj: UIAdjustment): void {
    const target = document.querySelector(adj.target_selector || "");
    if (!target) return;
    (target as HTMLElement).style.transition = "box-shadow 0.3s ease";
    (target as HTMLElement).style.boxShadow = "0 0 0 3px rgba(233, 69, 96, 0.4)";
    setTimeout(() => {
      (target as HTMLElement).style.boxShadow = "none";
    }, 3000);
  }

  private static reorderContent(adj: UIAdjustment): void {
    const { source_selector, target_selector, position } = adj.params;
    const source = document.querySelector(source_selector);
    const target = document.querySelector(target_selector);
    if (!source || !target) return;
    if (position === "before") {
      target.parentNode?.insertBefore(source, target);
    } else {
      target.parentNode?.insertBefore(source, target.nextSibling);
    }
  }
}
