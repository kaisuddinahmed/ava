// ============================================================================
// ShopAssist Widget — AI-Powered Virtual Shopping Assistant
// Frontend Widget Component + Bridge to FISM Engine
// ============================================================================
// Stack: React + TypeScript + CSS-in-JS (inline styles for portability)
// Deploy: Embed as standalone <script> or integrate into React app
// Communication: WebSocket to FISM backend
// ============================================================================

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from "react";

// ---------------------------------------------------------------------------
// 1. TYPES
// ---------------------------------------------------------------------------

interface WidgetConfig {
  position: "bottom-right" | "bottom-left";
  brandColor: string;
  brandColorLight: string;
  accentColor: string;
  fontFamily: string;
  websocketUrl: string;
  sessionId: string;
  userId: string | null;
  zIndex: number;
  avatarUrl?: string;
  assistantName: string;
  maxCardsToShow: number;
  animationDuration: number;
}

interface InterventionPayload {
  type: "passive" | "nudge" | "active" | "escalate";
  intervention_id: string;
  action_code: string;
  message?: string;
  products?: ProductCard[];
  comparison?: ComparisonCard;
  ui_adjustment?: UIAdjustment;
  cta_label?: string;
  cta_action?: string;
  meta?: Record<string, any>;
}

interface ProductCard {
  product_id: string;
  title: string;
  image_url: string;
  price: number;
  original_price?: number;
  rating: number;
  review_count: number;
  differentiator: string;
  relevance_score: number;
}

interface ComparisonCard {
  products: [ProductCard, ProductCard];
  differing_attributes: { label: string; values: [string, string] }[];
  recommendation?: { product_id: string; reason: string };
}

interface UIAdjustment {
  adjustment_type: string;
  target_selector?: string;
  params: Record<string, any>;
}

interface WidgetMessage {
  id: string;
  type: "assistant" | "user" | "system";
  content: string;
  payload?: InterventionPayload;
  timestamp: number;
}

type WidgetState = "minimized" | "bubble" | "expanded" | "hidden";

// ---------------------------------------------------------------------------
// 2. DEFAULT CONFIG
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: WidgetConfig = {
  position: "bottom-right",
  brandColor: "#1A1A2E",
  brandColorLight: "#16213E",
  accentColor: "#E94560",
  fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
  websocketUrl: "wss://your-api.com/ws/assistant",
  sessionId: "",
  userId: null,
  zIndex: 99999,
  assistantName: "ShopAssist",
  maxCardsToShow: 3,
  animationDuration: 300,
};

// ---------------------------------------------------------------------------
// 3. CONTEXT
// ---------------------------------------------------------------------------

const WidgetContext = createContext<{
  config: WidgetConfig;
  state: WidgetState;
  setState: (s: WidgetState) => void;
  sendAction: (action: string, data?: any) => void;
  dismissIntervention: (id: string) => void;
  convertIntervention: (id: string, action: string) => void;
}>({
  config: DEFAULT_CONFIG,
  state: "minimized",
  setState: () => {},
  sendAction: () => {},
  dismissIntervention: () => {},
  convertIntervention: () => {},
});

// ---------------------------------------------------------------------------
// 4. WEBSOCKET BRIDGE
// ---------------------------------------------------------------------------

class FISMBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: any[] = [];

  constructor(url: string, sessionId: string) {
    this.url = url;
    this.sessionId = sessionId;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(`${this.url}?session=${this.sessionId}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Flush queued messages
        this.messageQueue.forEach((msg) => this.ws?.send(JSON.stringify(msg)));
        this.messageQueue = [];
        this.emit("connected", {});
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type, data.payload);
        } catch (e) {
          console.error("[ShopAssist] Failed to parse message:", e);
        }
      };

      this.ws.onclose = () => {
        this.emit("disconnected", {});
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("[ShopAssist] WebSocket error:", error);
      };
    } catch (e) {
      console.error("[ShopAssist] Connection failed:", e);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
  }

  send(type: string, payload: any): void {
    const msg = { type, payload, session_id: this.sessionId, timestamp: Date.now() };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  on(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  disconnect(): void {
    this.ws?.close();
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// 5. PASSIVE INTERVENTION EXECUTOR
// ---------------------------------------------------------------------------

class PassiveExecutor {
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
        console.log("[ShopAssist:Passive] Unhandled adjustment:", adjustment.adjustment_type);
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

// ---------------------------------------------------------------------------
// 6. INJECT GLOBAL ANIMATIONS (call once on mount)
// ---------------------------------------------------------------------------

function injectGlobalStyles(): void {
  if (document.getElementById("sa-global-styles")) return;
  const style = document.createElement("style");
  style.id = "sa-global-styles";
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');

    @keyframes sa-slideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes sa-slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes sa-fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes sa-scaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes sa-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    @keyframes sa-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes sa-breathe {
      0%, 100% { box-shadow: 0 0 0 0 rgba(233, 69, 96, 0.3); }
      50% { box-shadow: 0 0 0 8px rgba(233, 69, 96, 0); }
    }
    @keyframes sa-typing {
      0%, 60%, 100% { opacity: 0.3; }
      30% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 7. SUB-COMPONENTS
// ---------------------------------------------------------------------------

// -- 7a. Product Card Component --
const ProductCardComponent: React.FC<{
  card: ProductCard;
  onAddToCart: (productId: string) => void;
  index: number;
}> = ({ card, onAddToCart, index }) => {
  const { config } = useContext(WidgetContext);
  const hasDiscount = card.original_price && card.original_price > card.price;
  const discountPct = hasDiscount
    ? Math.round(((card.original_price! - card.price) / card.original_price!) * 100)
    : 0;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #f0f0f0",
        overflow: "hidden",
        animation: `sa-slideUp 0.3s ease-out ${index * 0.08}s both`,
        cursor: "pointer",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      {/* Image */}
      <div style={{ position: "relative", paddingTop: "75%", background: "#f9fafb", overflow: "hidden" }}>
        <img
          src={card.image_url}
          alt={card.title}
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
          }}
          loading="lazy"
        />
        {hasDiscount && (
          <span style={{
            position: "absolute", top: 8, left: 8,
            background: config.accentColor,
            color: "#fff",
            fontSize: 11, fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 6,
          }}>
            -{discountPct}%
          </span>
        )}
        {card.differentiator && (
          <span style={{
            position: "absolute", bottom: 8, left: 8,
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 10, fontWeight: 500,
            padding: "3px 8px",
            borderRadius: 6,
            backdropFilter: "blur(4px)",
          }}>
            {card.differentiator}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px" }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: "#1a1a2e",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {card.title}
        </div>

        {/* Rating */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, margin: "4px 0" }}>
          <span style={{ fontSize: 12, color: "#f59e0b" }}>
            {"★".repeat(Math.round(card.rating))}{"☆".repeat(5 - Math.round(card.rating))}
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>({card.review_count})</span>
        </div>

        {/* Price + CTA */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
              ${card.price.toFixed(2)}
            </span>
            {hasDiscount && (
              <span style={{
                fontSize: 12, color: "#9ca3af",
                textDecoration: "line-through",
                marginLeft: 6,
              }}>
                ${card.original_price!.toFixed(2)}
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(card.product_id);
            }}
            style={{
              background: config.brandColor,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s ease, transform 0.1s ease",
              fontFamily: config.fontFamily,
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(0.95)";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            }}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
};

// -- 7b. Comparison Card Component --
const ComparisonCardComponent: React.FC<{
  comparison: ComparisonCard;
  onSelect: (productId: string) => void;
}> = ({ comparison, onSelect }) => {
  const { config } = useContext(WidgetContext);
  const [a, b] = comparison.products;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      border: "1px solid #f0f0f0",
      overflow: "hidden",
      animation: "sa-slideUp 0.3s ease-out",
    }}>
      {/* Side by side headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {[a, b].map((product, idx) => (
          <div
            key={product.product_id}
            style={{
              padding: 12,
              borderRight: idx === 0 ? "1px solid #f0f0f0" : "none",
              textAlign: "center",
            }}
          >
            <div style={{
              width: "100%", paddingTop: "80%",
              position: "relative", background: "#f9fafb",
              borderRadius: 8, overflow: "hidden", marginBottom: 8,
            }}>
              <img
                src={product.image_url}
                alt={product.title}
                style={{
                  position: "absolute", top: 0, left: 0,
                  width: "100%", height: "100%",
                  objectFit: "cover",
                }}
              />
              {comparison.recommendation?.product_id === product.product_id && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  background: "#22c55e", color: "#fff",
                  fontSize: 10, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 4,
                }}>
                  Recommended
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111", lineHeight: 1.3 }}>
              {product.title}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: config.accentColor, marginTop: 4 }}>
              ${product.price.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Differing attributes */}
      {comparison.differing_attributes.length > 0 && (
        <div style={{ borderTop: "1px solid #f0f0f0" }}>
          {comparison.differing_attributes.map((attr, idx) => (
            <div
              key={idx}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                padding: "8px 12px",
                borderBottom: idx < comparison.differing_attributes.length - 1 ? "1px solid #f8f8f8" : "none",
                fontSize: 12,
              }}
            >
              <span style={{ textAlign: "center", color: "#374151" }}>{attr.values[0]}</span>
              <span style={{
                color: "#9ca3af", fontSize: 10, fontWeight: 600,
                background: "#f3f4f6", padding: "2px 8px", borderRadius: 4,
              }}>
                {attr.label}
              </span>
              <span style={{ textAlign: "center", color: "#374151" }}>{attr.values[1]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 8, padding: 12,
        borderTop: "1px solid #f0f0f0",
      }}>
        {[a, b].map((product) => (
          <button
            key={product.product_id}
            onClick={() => onSelect(product.product_id)}
            style={{
              background: comparison.recommendation?.product_id === product.product_id
                ? config.brandColor : "#f3f4f6",
              color: comparison.recommendation?.product_id === product.product_id
                ? "#fff" : "#374151",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: config.fontFamily,
              transition: "all 0.2s ease",
            }}
          >
            Choose This
          </button>
        ))}
      </div>

      {/* Recommendation reason */}
      {comparison.recommendation?.reason && (
        <div style={{
          padding: "8px 12px",
          background: "#f0fdf4",
          fontSize: 11,
          color: "#166534",
          textAlign: "center",
          borderTop: "1px solid #bbf7d0",
        }}>
          💡 {comparison.recommendation.reason}
        </div>
      )}
    </div>
  );
};

// -- 7c. Typing Indicator --
const TypingIndicator: React.FC = () => (
  <div style={{
    display: "flex", alignItems: "center", gap: 4,
    padding: "8px 14px",
    background: "#f3f4f6",
    borderRadius: "16px 16px 16px 4px",
    width: "fit-content",
    animation: "sa-fadeIn 0.2s ease-out",
  }}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          width: 6, height: 6,
          borderRadius: "50%",
          background: "#9ca3af",
          animation: `sa-typing 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}
      />
    ))}
  </div>
);

// -- 7d. Nudge Bubble (mini popup above widget icon) --
const NudgeBubble: React.FC<{
  message: string;
  ctaLabel?: string;
  onCtaClick: () => void;
  onDismiss: () => void;
}> = ({ message, ctaLabel, onCtaClick, onDismiss }) => {
  const { config } = useContext(WidgetContext);

  return (
    <div style={{
      position: "absolute",
      bottom: 72,
      right: 0,
      width: 280,
      background: "#fff",
      borderRadius: 16,
      boxShadow: "0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
      padding: 0,
      animation: "sa-slideUp 0.3s ease-out",
      overflow: "hidden",
      fontFamily: config.fontFamily,
    }}>
      {/* Close button */}
      <button
        onClick={onDismiss}
        style={{
          position: "absolute", top: 8, right: 8,
          background: "none", border: "none",
          fontSize: 16, color: "#9ca3af",
          cursor: "pointer", padding: 4,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>

      <div style={{ padding: "16px 16px 12px" }}>
        {/* Assistant name */}
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: config.accentColor,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: 6,
        }}>
          {config.assistantName}
        </div>

        {/* Message */}
        <div style={{
          fontSize: 14, lineHeight: 1.5,
          color: "#1a1a2e",
        }}>
          {message}
        </div>
      </div>

      {/* CTA */}
      {ctaLabel && (
        <div style={{
          padding: "0 16px 14px",
        }}>
          <button
            onClick={onCtaClick}
            style={{
              width: "100%",
              background: config.brandColor,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: config.fontFamily,
              transition: "opacity 0.2s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            {ctaLabel}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 8. MAIN WIDGET COMPONENT
// ---------------------------------------------------------------------------

export const ShopAssistWidget: React.FC<Partial<WidgetConfig>> = (userConfig) => {
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...userConfig }), [userConfig]);

  const [state, setState] = useState<WidgetState>("minimized");
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [currentNudge, setCurrentNudge] = useState<InterventionPayload | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const bridgeRef = useRef<FISMBridge | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Initialize bridge ---
  useEffect(() => {
    injectGlobalStyles();

    const bridge = new FISMBridge(config.websocketUrl, config.sessionId);
    bridgeRef.current = bridge;
    bridge.connect();

    // Listen for intervention payloads from FISM engine
    bridge.on("intervention", (payload: InterventionPayload) => {
      handleIntervention(payload);
    });

    return () => bridge.disconnect();
  }, [config.websocketUrl, config.sessionId]);

  // --- Auto-scroll messages ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // --- Handle incoming intervention ---
  const handleIntervention = useCallback((payload: InterventionPayload) => {
    switch (payload.type) {
      case "passive":
        // Execute silently — no widget interaction
        if (payload.ui_adjustment) {
          PassiveExecutor.execute(payload.ui_adjustment);
        }
        break;

      case "nudge":
        // Show bubble above minimized widget
        setCurrentNudge(payload);
        setHasUnread(true);
        // Auto-dismiss after 10s if not interacted
        setTimeout(() => {
          setCurrentNudge((current) =>
            current?.intervention_id === payload.intervention_id ? null : current
          );
        }, 10000);
        break;

      case "active":
        // Open widget with content
        setCurrentNudge(null);
        setState("expanded");
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: payload.intervention_id,
              type: "assistant",
              content: payload.message || "",
              payload,
              timestamp: Date.now(),
            },
          ]);
        }, 800); // simulate brief typing
        break;

      case "escalate":
        setState("expanded");
        setMessages((prev) => [
          ...prev,
          {
            id: payload.intervention_id,
            type: "system",
            content: payload.message || "Connecting you with support...",
            payload,
            timestamp: Date.now(),
          },
        ]);
        break;
    }
  }, []);

  // --- User actions ---
  const sendAction = useCallback((action: string, data?: any) => {
    bridgeRef.current?.send("user_action", { action, data });
  }, []);

  const dismissIntervention = useCallback((id: string) => {
    setCurrentNudge(null);
    bridgeRef.current?.send("dismiss", { intervention_id: id });
  }, []);

  const convertIntervention = useCallback((id: string, action: string) => {
    bridgeRef.current?.send("conversion", { intervention_id: id, action });
  }, []);

  const handleAddToCart = useCallback((productId: string) => {
    sendAction("add_to_cart", { product_id: productId });
    // Optimistic UI feedback
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        type: "system",
        content: "✓ Added to cart",
        timestamp: Date.now(),
      },
    ]);
  }, [sendAction]);

  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim()) return;
    const msg: WidgetMessage = {
      id: `msg_${Date.now()}`,
      type: "user",
      content: inputValue.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    setInputValue("");
    bridgeRef.current?.send("user_message", { text: msg.content });
    setIsTyping(true);
  }, [inputValue]);

  const handleNudgeCtaClick = useCallback(() => {
    if (!currentNudge) return;
    convertIntervention(currentNudge.intervention_id, currentNudge.cta_action || "open");

    if (currentNudge.cta_action === "open_assistant" || currentNudge.cta_action === "open_guided_search") {
      setState("expanded");
    }

    // Execute the CTA action
    sendAction(currentNudge.cta_action || "open", currentNudge.meta);
    setCurrentNudge(null);
  }, [currentNudge, convertIntervention, sendAction]);

  // --- Context ---
  const contextValue = useMemo(() => ({
    config,
    state,
    setState,
    sendAction,
    dismissIntervention,
    convertIntervention,
  }), [config, state, sendAction, dismissIntervention, convertIntervention]);

  // --- Render ---
  const isRight = config.position === "bottom-right";

  return (
    <WidgetContext.Provider value={contextValue}>
      <div
        id="shopassist-widget"
        style={{
          position: "fixed",
          bottom: 20,
          [isRight ? "right" : "left"]: 20,
          zIndex: config.zIndex,
          fontFamily: config.fontFamily,
        }}
      >
        {/* ---- NUDGE BUBBLE ---- */}
        {state === "minimized" && currentNudge && (
          <NudgeBubble
            message={currentNudge.message || ""}
            ctaLabel={currentNudge.cta_label}
            onCtaClick={handleNudgeCtaClick}
            onDismiss={() => dismissIntervention(currentNudge.intervention_id)}
          />
        )}

        {/* ---- EXPANDED PANEL ---- */}
        {state === "expanded" && (
          <div style={{
            position: "absolute",
            bottom: 72,
            [isRight ? "right" : "left"]: 0,
            width: 370,
            maxHeight: 520,
            background: "#fff",
            borderRadius: 20,
            boxShadow: "0 12px 60px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "sa-slideUp 0.3s ease-out",
          }}>
            {/* Header */}
            <div style={{
              background: `linear-gradient(135deg, ${config.brandColor}, ${config.brandColorLight})`,
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                }}>
                  🛍️
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                    {config.assistantName}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                    Your shopping assistant
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setState("minimized"); setHasUnread(false); }}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  color: "#fff",
                  width: 32, height: 32,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.25)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)";
                }}
                aria-label="Minimize"
              >
                ↓
              </button>
            </div>

            {/* Messages Area */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "#fafafa",
              minHeight: 200,
              maxHeight: 340,
            }}>
              {messages.length === 0 && !isTyping && (
                <div style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: "#9ca3af",
                  fontSize: 13,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👋</div>
                  I'm here if you need anything
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id}>
                  {/* Text bubble */}
                  {msg.content && (
                    <div style={{
                      maxWidth: "85%",
                      marginLeft: msg.type === "user" ? "auto" : 0,
                      marginRight: msg.type === "user" ? 0 : "auto",
                      background: msg.type === "user"
                        ? config.brandColor
                        : msg.type === "system"
                        ? "#f0fdf4"
                        : "#fff",
                      color: msg.type === "user"
                        ? "#fff"
                        : msg.type === "system"
                        ? "#166534"
                        : "#1a1a2e",
                      padding: msg.type === "system" ? "8px 14px" : "10px 16px",
                      borderRadius: msg.type === "user"
                        ? "16px 16px 4px 16px"
                        : "16px 16px 16px 4px",
                      fontSize: msg.type === "system" ? 12 : 14,
                      lineHeight: 1.5,
                      fontWeight: msg.type === "system" ? 500 : 400,
                      boxShadow: msg.type === "assistant"
                        ? "0 1px 4px rgba(0,0,0,0.04)"
                        : "none",
                      border: msg.type === "assistant"
                        ? "1px solid #f0f0f0"
                        : msg.type === "system"
                        ? "1px solid #bbf7d0"
                        : "none",
                      animation: "sa-fadeIn 0.2s ease-out",
                    }}>
                      {msg.content}
                    </div>
                  )}

                  {/* Product cards */}
                  {msg.payload?.products && msg.payload.products.length > 0 && (
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginTop: 8,
                      maxWidth: "95%",
                    }}>
                      {msg.payload.products.slice(0, config.maxCardsToShow).map((card, idx) => (
                        <ProductCardComponent
                          key={card.product_id}
                          card={card}
                          onAddToCart={handleAddToCart}
                          index={idx}
                        />
                      ))}
                    </div>
                  )}

                  {/* Comparison card */}
                  {msg.payload?.comparison && (
                    <div style={{ marginTop: 8, maxWidth: "95%" }}>
                      <ComparisonCardComponent
                        comparison={msg.payload.comparison}
                        onSelect={(productId) => {
                          handleAddToCart(productId);
                          convertIntervention(msg.id, "select_comparison");
                        }}
                      />
                    </div>
                  )}

                  {/* CTA button (if no products/comparison but has CTA) */}
                  {msg.payload?.cta_label &&
                    !msg.payload.products?.length &&
                    !msg.payload.comparison && (
                    <button
                      onClick={() => {
                        convertIntervention(msg.id, msg.payload!.cta_action || "cta_click");
                        sendAction(msg.payload!.cta_action || "cta_click", msg.payload!.meta);
                      }}
                      style={{
                        marginTop: 8,
                        background: config.accentColor,
                        color: "#fff",
                        border: "none",
                        borderRadius: 10,
                        padding: "10px 20px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: config.fontFamily,
                        animation: "sa-fadeIn 0.3s ease-out 0.2s both",
                        transition: "opacity 0.2s ease",
                      }}
                    >
                      {msg.payload.cta_label}
                    </button>
                  )}
                </div>
              ))}

              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{
              padding: "12px 16px",
              borderTop: "1px solid #f0f0f0",
              background: "#fff",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Ask anything..."
                style={{
                  flex: 1,
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontFamily: config.fontFamily,
                  outline: "none",
                  transition: "border-color 0.2s ease",
                  background: "#fafafa",
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = config.brandColor;
                  (e.currentTarget as HTMLElement).style.background = "#fff";
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                  (e.currentTarget as HTMLElement).style.background = "#fafafa";
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                style={{
                  background: inputValue.trim() ? config.brandColor : "#e5e7eb",
                  color: inputValue.trim() ? "#fff" : "#9ca3af",
                  border: "none",
                  borderRadius: 10,
                  width: 40, height: 40,
                  cursor: inputValue.trim() ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
              >
                ↑
              </button>
            </div>
          </div>
        )}

        {/* ---- WIDGET TOGGLE BUTTON ---- */}
        <button
          onClick={() => {
            if (state === "expanded") {
              setState("minimized");
            } else {
              setState("expanded");
              setCurrentNudge(null);
              setHasUnread(false);
            }
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${config.brandColor}, ${config.brandColorLight})`,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
            position: "relative",
            animation: hasUnread ? "sa-breathe 2s ease-in-out infinite" : "none",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.05)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(0,0,0,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)";
          }}
          aria-label={state === "expanded" ? "Close assistant" : "Open assistant"}
        >
          {state === "expanded" ? "×" : "🛍️"}

          {/* Unread indicator */}
          {hasUnread && state !== "expanded" && (
            <div style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: config.accentColor,
              border: "2px solid #fff",
              animation: "sa-scaleIn 0.3s ease-out",
            }} />
          )}
        </button>
      </div>
    </WidgetContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// 9. STANDALONE EMBED SCRIPT (for non-React sites)
// ---------------------------------------------------------------------------

/*
  For embedding on any website without React:

  <script>
    window.ShopAssistConfig = {
      websocketUrl: "wss://your-api.com/ws/assistant",
      sessionId: "sess_xxx",
      userId: "usr_xxx",
      brandColor: "#1A1A2E",
      accentColor: "#E94560",
      position: "bottom-right",
      assistantName: "ShopAssist",
    };
  </script>
  <script src="https://cdn.yourdomain.com/shopassist-widget.js"></script>

  The bundle should:
  1. Load React (if not present) via CDN
  2. Create a root container div
  3. Render <ShopAssistWidget {...window.ShopAssistConfig} />
  4. Initialize behavioral event listeners (see section 10)
*/

// ---------------------------------------------------------------------------
// 10. BEHAVIORAL EVENT COLLECTOR (attach to host page)
// ---------------------------------------------------------------------------

export class BehaviorCollector {
  private bridge: FISMBridge;
  private sessionId: string;
  private userId: string | null;
  private observers: MutationObserver[] = [];
  private timers: number[] = [];
  private scrollDepth = 0;
  private lastScrollTime = 0;
  private pageEnterTime = Date.now();
  private rageClickTracker = { count: 0, lastTime: 0, lastX: 0, lastY: 0 };

  constructor(bridge: FISMBridge, sessionId: string, userId: string | null) {
    this.bridge = bridge;
    this.sessionId = sessionId;
    this.userId = userId;
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

    document.addEventListener("mouseout", (e) => {
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

// ---------------------------------------------------------------------------
// 11. INITIALIZATION HELPER
// ---------------------------------------------------------------------------

export function initShopAssist(config: Partial<WidgetConfig>): {
  bridge: FISMBridge;
  collector: BehaviorCollector;
} {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Create bridge
  const bridge = new FISMBridge(fullConfig.websocketUrl, fullConfig.sessionId);
  bridge.connect();

  // Create and start collector
  const collector = new BehaviorCollector(bridge, fullConfig.sessionId, fullConfig.userId);
  collector.startCollecting();

  return { bridge, collector };
}

// ---------------------------------------------------------------------------
// 12. USAGE
// ---------------------------------------------------------------------------

/*
  === REACT APP INTEGRATION ===

  import { ShopAssistWidget } from "./shopassist-widget";

  function App() {
    return (
      <>
        <YourApp />
        <ShopAssistWidget
          websocketUrl="wss://api.yoursite.com/ws/assistant"
          sessionId={sessionId}
          userId={userId}
          brandColor="#1A1A2E"
          accentColor="#E94560"
          assistantName="StyleBot"
        />
      </>
    );
  }


  === STANDALONE EMBED ===

  <script src="https://cdn.yoursite.com/shopassist.bundle.js"></script>
  <script>
    ShopAssist.init({
      websocketUrl: "wss://api.yoursite.com/ws/assistant",
      sessionId: generateSessionId(),
      brandColor: "#1A1A2E",
      accentColor: "#E94560",
    });
  </script>


  === ARCHITECTURE OVERVIEW ===

  ┌──────────────────────────────────────────────────────────────┐
  │                     HOST WEBSITE                              │
  │                                                              │
  │  ┌─────────────────────┐    ┌──────────────────────────┐    │
  │  │  BehaviorCollector   │    │  ShopAssistWidget (React) │    │
  │  │                     │    │                          │    │
  │  │  • scroll tracking  │    │  • Minimized icon        │    │
  │  │  • rage clicks      │    │  • Nudge bubble          │    │
  │  │  • dead clicks      │    │  • Expanded panel        │    │
  │  │  • hover intent     │    │  • Product cards         │    │
  │  │  • form friction    │    │  • Comparison cards      │    │
  │  │  • copy events      │    │  • Chat input            │    │
  │  │  • exit intent      │    │                          │    │
  │  │  • idle detection   │    │  PassiveExecutor         │    │
  │  │  • tab switches     │    │  • Shipping bar inject   │    │
  │  └─────────┬───────────┘    │  • Trust badge enhance   │    │
  │            │                │  • Sticky price bar      │    │
  │            │                │  • BNPL callout          │    │
  │            ▼                └────────────┬─────────────┘    │
  │  ┌─────────────────────────────────────────┐                │
  │  │         FISMBridge (WebSocket)           │                │
  │  └─────────────────┬───────────────────────┘                │
  └────────────────────┼────────────────────────────────────────┘
                       │
                       ▼ WSS
  ┌────────────────────────────────────────────────────────────┐
  │                    BACKEND                                  │
  │                                                            │
  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
  │  │ FISM Engine   │  │ Product Intel │  │ User Profile   │  │
  │  │              │  │ Engine       │  │ Store          │  │
  │  │ • Scoring    │  │              │  │                │  │
  │  │ • Gates      │  │ • Vector DB  │  │ • Session      │  │
  │  │ • Cooldowns  │  │ • Similarity │  │ • History      │  │
  │  │ • Payload    │  │ • Comparison │  │ • Preferences  │  │
  │  │   Builder    │  │ • Ranking    │  │ • Cart state   │  │
  │  └──────┬───────┘  └──────┬───────┘  └──────┬─────────┘  │
  │         │                 │                  │            │
  │         └────────────┬────┘──────────────────┘            │
  │                      ▼                                     │
  │         ┌────────────────────────┐                         │
  │         │  Intervention Decision  │                         │
  │         │  → Send to Widget via WS│                         │
  │         └────────────────────────┘                         │
  └────────────────────────────────────────────────────────────┘
*/
