// ============================================================================
// Intervention type constants and tier metadata
// ============================================================================

import { ScoreTier } from "../types/mswim.js";

export const TIER_LABELS: Record<ScoreTier, string> = {
  [ScoreTier.MONITOR]: "Monitor",
  [ScoreTier.PASSIVE]: "Passive",
  [ScoreTier.NUDGE]: "Nudge",
  [ScoreTier.ACTIVE]: "Active",
  [ScoreTier.ESCALATE]: "Escalate",
};

export const TIER_COLORS: Record<ScoreTier, string> = {
  [ScoreTier.MONITOR]: "#6b7280",   // grey
  [ScoreTier.PASSIVE]: "#3b82f6",   // blue
  [ScoreTier.NUDGE]: "#eab308",     // yellow
  [ScoreTier.ACTIVE]: "#f97316",    // orange
  [ScoreTier.ESCALATE]: "#ef4444",  // red
};

export const TIER_DESCRIPTIONS: Record<ScoreTier, string> = {
  [ScoreTier.MONITOR]: "Log only, no action taken",
  [ScoreTier.PASSIVE]: "Silent UI adjustment (no widget interaction)",
  [ScoreTier.NUDGE]: "Single message bubble above widget",
  [ScoreTier.ACTIVE]: "Widget opens with cards/suggestions",
  [ScoreTier.ESCALATE]: "Maximum effort or human handoff",
};

/**
 * All possible intervention action codes.
 */
export const ACTION_CODES = {
  // Passive
  INJECT_SHIPPING_BAR: "inject_shipping_bar",
  ENHANCE_TRUST_SIGNALS: "enhance_trust_signals",
  STICKY_PRICE_BAR: "sticky_price_bar",
  INJECT_BNPL: "inject_bnpl",
  HIGHLIGHT_ELEMENT: "highlight_element",

  // Nudge
  NUDGE_HELP_OFFER: "nudge_help_offer",
  NUDGE_COMPARISON: "nudge_comparison",
  NUDGE_PRICE_MATCH: "nudge_price_match",
  NUDGE_SIZE_HELP: "nudge_size_help",
  NUDGE_STOCK_ALERT: "nudge_stock_alert",
  NUDGE_SAVE_CART: "nudge_save_cart",

  // Active
  ACTIVE_PRODUCT_SUGGESTION: "active_product_suggestion",
  ACTIVE_COMPARISON_VIEW: "active_comparison_view",
  ACTIVE_DISCOUNT_OFFER: "active_discount_offer",
  ACTIVE_GUIDED_SEARCH: "active_guided_search",
  ACTIVE_CHECKOUT_ASSIST: "active_checkout_assist",

  // Escalate
  ESCALATE_HUMAN_HANDOFF: "escalate_human_handoff",
  ESCALATE_CALLBACK_REQUEST: "escalate_callback_request",
  ESCALATE_PRIORITY_SUPPORT: "escalate_priority_support",
} as const;

export type ActionCode = (typeof ACTION_CODES)[keyof typeof ACTION_CODES];
