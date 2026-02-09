// ============================================================================
// FISM — Friction Intervention Scoring Model
// AI-Powered Virtual Shopping Assistant — Intervention Algorithm
// ============================================================================
// Entry point: FISMEngine.evaluate() — call on every behavioral event
// Output: InterventionDecision (intervene or suppress, with payload)
// ============================================================================

// ---------------------------------------------------------------------------
// 1. ENUMS & CONSTANTS
// ---------------------------------------------------------------------------

export enum FrictionCategory {
  LANDING = "landing",
  NAVIGATION = "navigation",
  SEARCH = "search",
  PRODUCT = "product",
  CART = "cart",
  CHECKOUT = "checkout",
  PRICING = "pricing",
  TRUST = "trust",
  MOBILE = "mobile",
  TECHNICAL = "technical",
  CONTENT = "content",
  PERSONALIZATION = "personalization",
  SOCIAL_PROOF = "social_proof",
  COMMUNICATION = "communication",
  ACCOUNT = "account",
  SHIPPING = "shipping",
  RETURNS = "returns",
  POST_PURCHASE = "post_purchase",
  RE_ENGAGEMENT = "re_engagement",
  ACCESSIBILITY = "accessibility",
  CROSS_CHANNEL = "cross_channel",
  DECISION = "decision",
  PAYMENT = "payment",
  COMPLIANCE = "compliance",
  SEASONAL = "seasonal",
}

export enum InterventionType {
  PASSIVE = "passive",   // Silent UI adjustment — user doesn't notice
  NUDGE = "nudge",       // Subtle widget hint — single message bubble
  ACTIVE = "active",     // Widget opens with card/comparison/suggestion
  ESCALATE = "escalate", // Handoff to human agent or full chatbot flow
}

export enum InterventionStatus {
  FIRE = "fire",
  SUPPRESS = "suppress",
  QUEUE = "queue",       // Hold for better timing
}

// Cap constants
const MAX_ACTIVE_INTERVENTIONS_PER_SESSION = 2;
const MAX_NUDGE_INTERVENTIONS_PER_SESSION = 3;
const MAX_TOTAL_INTERVENTIONS_PER_SESSION = 6; // passive unlimited, counted separately
const COOLDOWN_AFTER_ACTIVE_MS = 120_000;      // 2 min after active
const COOLDOWN_AFTER_NUDGE_MS = 60_000;        // 1 min after nudge
const COOLDOWN_AFTER_DISMISS_MS = 300_000;     // 5 min if user dismissed
const MIN_SESSION_AGE_FOR_ACTIVE_MS = 30_000;  // no active intervention in first 30s
const SCORE_THRESHOLD_NUDGE = 0.45;
const SCORE_THRESHOLD_ACTIVE = 0.65;
const SCORE_THRESHOLD_ESCALATE = 0.85;
const FATIGUE_DECAY_RATE = 0.15;               // per intervention fired
const INTENT_BOOST_NEAR_CHECKOUT = 1.3;        // multiplier when user is close to purchase

// ---------------------------------------------------------------------------
// 2. CORE TYPES
// ---------------------------------------------------------------------------

export interface BehavioralEvent {
  event_id: string;
  timestamp: number;
  friction_id: string;                // e.g., "F058" — maps to friction scenario catalog
  category: FrictionCategory;
  raw_signals: Record<string, any>;   // detection signal key-value pairs
  page_context: PageContext;
  user_context: UserContext;
}

export interface PageContext {
  page_type: "landing" | "category" | "search_results" | "pdp" | "cart" | "checkout" | "account" | "other";
  page_url: string;
  time_on_page_ms: number;
  scroll_depth_pct: number;
  viewport: { width: number; height: number };
  device: "mobile" | "tablet" | "desktop";
}

export interface UserContext {
  user_id: string | null;              // null = anonymous
  session_id: string;
  is_new_visitor: boolean;
  is_logged_in: boolean;
  session_start_ts: number;
  cart_value: number;
  cart_item_count: number;
  lifetime_order_count: number;
  lifetime_order_value: number;
  loyalty_tier: string | null;
  geo: { country: string; region: string; city: string };
  device: "mobile" | "tablet" | "desktop";
  referrer_type: "direct" | "organic" | "paid" | "social" | "email" | "referral";
}

export interface SessionState {
  session_id: string;
  session_start_ts: number;
  interventions_fired: FiredIntervention[];
  active_count: number;
  nudge_count: number;
  passive_count: number;
  total_nonpassive_count: number;
  last_intervention_ts: number | null;
  last_intervention_type: InterventionType | null;
  last_dismiss_ts: number | null;
  user_dismissed_count: number;
  friction_history: FrictionHistoryEntry[];
  suppressed_friction_ids: Set<string>;  // don't repeat same friction
  intent_score_accumulator: number;      // running intent signal
}

export interface FrictionHistoryEntry {
  friction_id: string;
  timestamp: number;
  score: number;
  outcome: "fired" | "suppressed" | "queued";
}

export interface FiredIntervention {
  intervention_id: string;
  friction_id: string;
  type: InterventionType;
  timestamp: number;
  dismissed: boolean;
  converted: boolean;           // did user take the suggested action?
  payload: InterventionPayload;
}

export interface InterventionPayload {
  type: InterventionType;
  action_code: string;           // maps to action handler in widget
  message?: string;              // contextual message for nudge/active
  products?: ProductCard[];      // product suggestions
  comparison?: ComparisonCard;   // side-by-side comparison
  ui_adjustment?: UIAdjustment;  // passive UI changes
  cta_label?: string;
  cta_action?: string;
  meta?: Record<string, any>;
}

export interface ProductCard {
  product_id: string;
  title: string;
  image_url: string;
  price: number;
  original_price?: number;
  rating: number;
  review_count: number;
  differentiator: string;        // "Free shipping" | "Best seller" | "20% off" etc.
  relevance_score: number;
}

export interface ComparisonCard {
  products: [ProductCard, ProductCard];
  differing_attributes: { label: string; values: [string, string] }[];
  recommendation?: { product_id: string; reason: string };
}

export interface UIAdjustment {
  adjustment_type: string;       // "highlight_trust_badge" | "show_shipping_bar" | "reorder_content" etc.
  target_selector?: string;      // CSS selector for DOM manipulation
  params: Record<string, any>;
}

export interface InterventionDecision {
  status: InterventionStatus;
  score: CompositeScore;
  payload: InterventionPayload | null;
  reason: string;                // human-readable decision explanation for logging
}

// ---------------------------------------------------------------------------
// 3. SCORING MODEL
// ---------------------------------------------------------------------------

export interface CompositeScore {
  intent_score: number;          // 0–1: how close to purchase
  severity_score: number;        // 0–1: how likely this friction causes abandonment
  fatigue_score: number;         // 0–1: how much intervention fatigue (higher = more fatigued)
  recency_score: number;         // 0–1: how recent was last intervention (higher = too recent)
  composite: number;             // final weighted score
}

// Severity lookup — each friction_id maps to a base severity
// This would be loaded from your friction scenario database (F001–F325)
// Showing structure; populate from your catalog
const SEVERITY_REGISTRY: Record<string, number> = {
  // Landing
  F001: 0.3, F002: 0.5, F003: 0.7, F004: 0.8, F005: 0.4,
  // Search
  F028: 0.7, F029: 0.5, F030: 0.4, F031: 0.8, F035: 0.6,
  // Product
  F042: 0.3, F043: 0.6, F044: 0.8, F048: 0.7, F053: 0.8,
  F058: 0.7, F060: 0.8,
  // Cart
  F068: 0.9, F069: 0.7, F071: 0.8, F075: 0.7, F081: 0.9,
  F088: 0.9,
  // Checkout
  F089: 0.95, F090: 0.7, F094: 0.8, F096: 0.9, F099: 0.8,
  F107: 0.95,
  // ... populate all F001–F325 from your catalog
  // Default fallback handled in getSeverity()
};

function getSeverity(friction_id: string): number {
  return SEVERITY_REGISTRY[friction_id] ?? 0.5; // default mid-severity
}

// Intent score calculation based on funnel position + behavioral signals
function calculateIntentScore(event: BehavioralEvent, session: SessionState): number {
  let base = 0;

  // Funnel position weight
  const funnelWeights: Record<string, number> = {
    landing: 0.1,
    category: 0.2,
    search_results: 0.25,
    pdp: 0.4,
    cart: 0.7,
    checkout: 0.9,
    account: 0.3,
    other: 0.15,
  };
  base = funnelWeights[event.page_context.page_type] ?? 0.15;

  // Behavioral boosters
  if (event.user_context.cart_item_count > 0) base += 0.15;
  if (event.user_context.cart_value > 0) base += 0.05;
  if (event.user_context.is_logged_in) base += 0.05;
  if (event.user_context.lifetime_order_count > 0) base += 0.1;

  // Session engagement boost
  const sessionDuration = event.timestamp - session.session_start_ts;
  if (sessionDuration > 120_000) base += 0.05;  // > 2 min
  if (sessionDuration > 300_000) base += 0.05;  // > 5 min

  // Accumulator from previous high-intent signals
  base += session.intent_score_accumulator * 0.1;

  // Near-checkout boost
  if (event.page_context.page_type === "checkout") {
    base *= INTENT_BOOST_NEAR_CHECKOUT;
  }

  return Math.min(base, 1.0);
}

// Fatigue score — increases with each intervention fired
function calculateFatigueScore(session: SessionState): number {
  const nonPassiveCount = session.total_nonpassive_count;
  const dismissals = session.user_dismissed_count;

  // Base fatigue from intervention count
  let fatigue = nonPassiveCount * FATIGUE_DECAY_RATE;

  // Dismissals increase fatigue significantly
  fatigue += dismissals * 0.25;

  return Math.min(fatigue, 1.0);
}

// Recency score — how recently was last intervention
function calculateRecencyScore(session: SessionState, now: number): number {
  if (!session.last_intervention_ts) return 0; // no prior intervention = no recency issue

  const elapsed = now - session.last_intervention_ts;

  // After dismiss, use longer cooldown
  if (session.last_dismiss_ts && session.last_dismiss_ts === session.last_intervention_ts) {
    return elapsed < COOLDOWN_AFTER_DISMISS_MS ? 1.0 : 0;
  }

  // After active intervention
  if (session.last_intervention_type === InterventionType.ACTIVE) {
    if (elapsed < COOLDOWN_AFTER_ACTIVE_MS) return 1.0;
    if (elapsed < COOLDOWN_AFTER_ACTIVE_MS * 2) return 0.5;
    return 0;
  }

  // After nudge
  if (session.last_intervention_type === InterventionType.NUDGE) {
    if (elapsed < COOLDOWN_AFTER_NUDGE_MS) return 1.0;
    if (elapsed < COOLDOWN_AFTER_NUDGE_MS * 2) return 0.3;
    return 0;
  }

  return 0;
}

// Composite score calculation
function calculateCompositeScore(
  event: BehavioralEvent,
  session: SessionState
): CompositeScore {
  const now = event.timestamp;

  const intent_score = calculateIntentScore(event, session);
  const severity_score = getSeverity(event.friction_id);
  const fatigue_score = calculateFatigueScore(session);
  const recency_score = calculateRecencyScore(session, now);

  // Weighted composite formula
  // Higher intent + severity PUSH toward intervention
  // Higher fatigue + recency PULL away from intervention
  const composite =
    (intent_score * 0.30) +
    (severity_score * 0.35) +
    ((1 - fatigue_score) * 0.20) +
    ((1 - recency_score) * 0.15);

  return {
    intent_score,
    severity_score,
    fatigue_score,
    recency_score,
    composite: Math.round(composite * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// 4. INTERVENTION TYPE RESOLVER
// ---------------------------------------------------------------------------

function resolveInterventionType(score: CompositeScore): InterventionType {
  if (score.composite >= SCORE_THRESHOLD_ESCALATE) return InterventionType.ESCALATE;
  if (score.composite >= SCORE_THRESHOLD_ACTIVE) return InterventionType.ACTIVE;
  if (score.composite >= SCORE_THRESHOLD_NUDGE) return InterventionType.NUDGE;
  return InterventionType.PASSIVE;
}

// ---------------------------------------------------------------------------
// 5. GATE CHECKS — Hard rules before scoring
// ---------------------------------------------------------------------------

interface GateResult {
  pass: boolean;
  reason: string;
}

function runGateChecks(
  event: BehavioralEvent,
  session: SessionState,
  interventionType: InterventionType
): GateResult {
  const now = event.timestamp;
  const sessionAge = now - session.session_start_ts;

  // Gate 1: Session too young for active/nudge
  if (
    interventionType !== InterventionType.PASSIVE &&
    sessionAge < MIN_SESSION_AGE_FOR_ACTIVE_MS
  ) {
    return { pass: false, reason: "session_too_young" };
  }

  // Gate 2: Active intervention cap reached
  if (
    interventionType === InterventionType.ACTIVE &&
    session.active_count >= MAX_ACTIVE_INTERVENTIONS_PER_SESSION
  ) {
    return { pass: false, reason: "active_cap_reached" };
  }

  // Gate 3: Nudge intervention cap reached
  if (
    interventionType === InterventionType.NUDGE &&
    session.nudge_count >= MAX_NUDGE_INTERVENTIONS_PER_SESSION
  ) {
    return { pass: false, reason: "nudge_cap_reached" };
  }

  // Gate 4: Total non-passive cap reached
  if (
    interventionType !== InterventionType.PASSIVE &&
    session.total_nonpassive_count >= MAX_TOTAL_INTERVENTIONS_PER_SESSION
  ) {
    return { pass: false, reason: "total_cap_reached" };
  }

  // Gate 5: Cooldown period active
  if (session.last_intervention_ts) {
    const elapsed = now - session.last_intervention_ts;
    if (
      interventionType === InterventionType.ACTIVE &&
      elapsed < COOLDOWN_AFTER_ACTIVE_MS
    ) {
      return { pass: false, reason: "active_cooldown" };
    }
    if (
      interventionType === InterventionType.NUDGE &&
      elapsed < COOLDOWN_AFTER_NUDGE_MS
    ) {
      return { pass: false, reason: "nudge_cooldown" };
    }
  }

  // Gate 6: User dismissed recently — back off hard
  if (session.last_dismiss_ts) {
    const sinceDismiss = now - session.last_dismiss_ts;
    if (
      interventionType !== InterventionType.PASSIVE &&
      sinceDismiss < COOLDOWN_AFTER_DISMISS_MS
    ) {
      return { pass: false, reason: "dismiss_cooldown" };
    }
  }

  // Gate 7: Same friction already addressed
  if (session.suppressed_friction_ids.has(event.friction_id)) {
    return { pass: false, reason: "friction_already_addressed" };
  }

  // Gate 8: User dismissed 3+ times — suppress all non-passive for session
  if (
    session.user_dismissed_count >= 3 &&
    interventionType !== InterventionType.PASSIVE
  ) {
    return { pass: false, reason: "user_resistant_to_intervention" };
  }

  return { pass: true, reason: "all_gates_passed" };
}

// ---------------------------------------------------------------------------
// 6. PAYLOAD BUILDER — Maps friction_id to intervention content
// ---------------------------------------------------------------------------

// This is the bridge between the scoring engine and the widget.
// Each friction_id resolves to a specific action with contextual content.
// In production, this connects to your product intelligence engine (vector DB).

interface PayloadBuilderInput {
  friction_id: string;
  category: FrictionCategory;
  intervention_type: InterventionType;
  event: BehavioralEvent;
  session: SessionState;
}

async function buildPayload(input: PayloadBuilderInput): Promise<InterventionPayload> {
  const { friction_id, intervention_type, event } = input;

  // ------- PASSIVE PAYLOADS -------
  if (intervention_type === InterventionType.PASSIVE) {
    return buildPassivePayload(input);
  }

  // ------- NUDGE PAYLOADS -------
  if (intervention_type === InterventionType.NUDGE) {
    return buildNudgePayload(input);
  }

  // ------- ACTIVE PAYLOADS -------
  if (intervention_type === InterventionType.ACTIVE) {
    return buildActivePayload(input);
  }

  // ------- ESCALATE PAYLOADS -------
  return buildEscalatePayload(input);
}

async function buildPassivePayload(input: PayloadBuilderInput): Promise<InterventionPayload> {
  const { friction_id, event } = input;

  // Map friction scenarios to silent UI adjustments
  const passiveActions: Record<string, () => InterventionPayload> = {
    // Shipping cost shock — show free shipping bar
    F081: () => ({
      type: InterventionType.PASSIVE,
      action_code: "show_shipping_bar",
      ui_adjustment: {
        adjustment_type: "inject_shipping_progress_bar",
        target_selector: ".cart-summary",
        params: {
          current_total: event.user_context.cart_value,
          free_shipping_threshold: 75, // from config
        },
      },
    }),
    // No trust badges visible
    F131: () => ({
      type: InterventionType.PASSIVE,
      action_code: "highlight_trust_badges",
      ui_adjustment: {
        adjustment_type: "enhance_trust_signals",
        target_selector: ".checkout-payment",
        params: { badges: ["ssl", "money_back", "secure_checkout"] },
      },
    }),
    // Price not visible without scrolling
    F059: () => ({
      type: InterventionType.PASSIVE,
      action_code: "pin_price_display",
      ui_adjustment: {
        adjustment_type: "sticky_price_bar",
        target_selector: ".product-price",
        params: { position: "top" },
      },
    }),
    // BNPL not shown on PDP
    F122: () => ({
      type: InterventionType.PASSIVE,
      action_code: "show_bnpl_on_pdp",
      ui_adjustment: {
        adjustment_type: "inject_bnpl_callout",
        target_selector: ".product-price",
        params: {
          price: event.raw_signals.product_price,
          installments: 4,
        },
      },
    }),
  };

  const builder = passiveActions[input.friction_id];
  if (builder) return builder();

  // Default passive — log only, no visible change
  return {
    type: InterventionType.PASSIVE,
    action_code: "log_only",
    ui_adjustment: {
      adjustment_type: "none",
      params: { friction_id: input.friction_id },
    },
  };
}

async function buildNudgePayload(input: PayloadBuilderInput): Promise<InterventionPayload> {
  const { friction_id, event } = input;

  // Contextual single-message nudges
  const nudgeTemplates: Record<string, () => InterventionPayload> = {
    // Hovered ATC but didn't click
    F058: () => ({
      type: InterventionType.NUDGE,
      action_code: "nudge_atc_hesitation",
      message: "This ships free and has hassle-free returns 🚚",
      cta_label: "Add to Cart",
      cta_action: "add_to_cart",
    }),
    // Cart idle too long
    F069: () => ({
      type: InterventionType.NUDGE,
      action_code: "nudge_cart_idle",
      message: `Your ${event.user_context.cart_item_count} item${event.user_context.cart_item_count > 1 ? "s are" : " is"} waiting — stock is limited`,
      cta_label: "Complete Purchase",
      cta_action: "go_to_checkout",
    }),
    // Close to free shipping
    F126: () => ({
      type: InterventionType.NUDGE,
      action_code: "nudge_free_shipping_gap",
      message: `You're $${(75 - event.user_context.cart_value).toFixed(0)} away from free shipping`,
      cta_label: "See Quick Adds",
      cta_action: "show_low_price_suggestions",
    }),
    // Multiple searches with no purchase
    F031: () => ({
      type: InterventionType.NUDGE,
      action_code: "nudge_search_assist",
      message: "Having trouble finding what you need? Let me help narrow it down",
      cta_label: "Help Me Search",
      cta_action: "open_guided_search",
    }),
    // Coupon code rejected
    F075: () => ({
      type: InterventionType.NUDGE,
      action_code: "nudge_coupon_fail",
      message: "That code didn't work — here's the best available deal for your cart",
      cta_label: "Apply Best Deal",
      cta_action: "auto_apply_best_coupon",
    }),
  };

  const builder = nudgeTemplates[friction_id];
  if (builder) return builder();

  // Default nudge
  return {
    type: InterventionType.NUDGE,
    action_code: "nudge_generic_help",
    message: "Need a hand? I can help you find what you're looking for",
    cta_label: "Sure",
    cta_action: "open_assistant",
  };
}

async function buildActivePayload(input: PayloadBuilderInput): Promise<InterventionPayload> {
  const { friction_id, event } = input;

  // Active interventions — widget opens with product cards, comparisons, etc.
  // These call the Product Intelligence Engine for real-time product fetching

  const activeTemplates: Record<string, () => Promise<InterventionPayload>> = {

    // Product viewed 3+ times without purchase — show incentive + alternatives
    F044: async () => {
      const alternatives = await fetchSimilarProducts(
        event.raw_signals.product_id,
        event.user_context,
        3
      );
      return {
        type: InterventionType.ACTIVE,
        action_code: "active_repeat_view_intervention",
        message: "You've been eyeing this — here's what might help you decide",
        products: alternatives,
        cta_label: "Set Price Alert",
        cta_action: "create_price_alert",
      };
    },

    // Decision paralysis — toggling between products
    F297: async () => {
      const productIds = event.raw_signals.compared_product_ids as string[];
      const comparison = await buildComparisonCard(productIds[0], productIds[1]);
      return {
        type: InterventionType.ACTIVE,
        action_code: "active_comparison",
        message: "Here's a quick comparison to help you decide",
        comparison,
        cta_label: "Add Winner",
        cta_action: "add_to_cart",
      };
    },

    // Cart abandonment — high intent, strong intervention
    F068: async () => {
      return {
        type: InterventionType.ACTIVE,
        action_code: "active_cart_recovery",
        message: `Your cart ($${event.user_context.cart_value.toFixed(2)}) — complete your order in under a minute`,
        cta_label: "Checkout Now",
        cta_action: "go_to_checkout",
        meta: {
          show_guarantee: true,
          show_delivery_estimate: true,
        },
      };
    },

    // Out of stock product viewed
    F053: async () => {
      const alternatives = await fetchSimilarProducts(
        event.raw_signals.product_id,
        event.user_context,
        3
      );
      return {
        type: InterventionType.ACTIVE,
        action_code: "active_oos_alternatives",
        message: "This one's sold out — but these are similar and available now",
        products: alternatives,
        cta_label: "Notify When Back",
        cta_action: "create_stock_alert",
      };
    },

    // Size uncertainty on apparel
    F048: async () => {
      return {
        type: InterventionType.ACTIVE,
        action_code: "active_size_assist",
        message: "Not sure about sizing? Most customers find this fits true to size",
        meta: {
          show_size_guide: true,
          show_fit_predictor: true,
          show_return_policy: true,
        },
        cta_label: "Find My Size",
        cta_action: "open_fit_predictor",
      };
    },
  };

  const builder = activeTemplates[friction_id];
  if (builder) return await builder();

  // Default active
  return {
    type: InterventionType.ACTIVE,
    action_code: "active_general_assist",
    message: "I noticed you might need some help — what are you looking for?",
    cta_label: "Show Me Options",
    cta_action: "open_guided_discovery",
  };
}

async function buildEscalatePayload(input: PayloadBuilderInput): Promise<InterventionPayload> {
  return {
    type: InterventionType.ESCALATE,
    action_code: "escalate_to_human",
    message: "Let me connect you with our support team — they can help right away",
    cta_label: "Chat with Support",
    cta_action: "handoff_to_human",
    meta: {
      friction_id: input.friction_id,
      session_context: {
        cart_value: input.event.user_context.cart_value,
        page: input.event.page_context.page_type,
        friction_history: input.session.friction_history.slice(-5),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 7. PRODUCT INTELLIGENCE ENGINE — Stubs for vector DB integration
// ---------------------------------------------------------------------------

// These functions connect to your vector database / product catalog
// Replace stubs with actual implementation

async function fetchSimilarProducts(
  product_id: string,
  user_context: UserContext,
  limit: number
): Promise<ProductCard[]> {
  // TODO: Implement vector similarity search
  // 1. Get product embedding from vector DB
  // 2. Apply user preference weights (price range, brand affinity, category)
  // 3. Filter by availability (stock > 0)
  // 4. Rank by intent-weighted relevance
  // 5. Return top N
  return [];
}

async function buildComparisonCard(
  product_id_a: string,
  product_id_b: string
): Promise<ComparisonCard> {
  // TODO: Implement product attribute comparison
  // 1. Fetch both product embeddings + structured attributes
  // 2. Diff attributes to find meaningful differences
  // 3. Generate recommendation based on user behavior weight
  return {
    products: [
      { product_id: product_id_a, title: "", image_url: "", price: 0, rating: 0, review_count: 0, differentiator: "", relevance_score: 0 },
      { product_id: product_id_b, title: "", image_url: "", price: 0, rating: 0, review_count: 0, differentiator: "", relevance_score: 0 },
    ],
    differing_attributes: [],
  };
}

// ---------------------------------------------------------------------------
// 8. MAIN ENGINE
// ---------------------------------------------------------------------------

export class FISMEngine {
  private sessions: Map<string, SessionState> = new Map();

  // Get or create session state
  private getSession(event: BehavioralEvent): SessionState {
    const sid = event.user_context.session_id;
    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, {
        session_id: sid,
        session_start_ts: event.user_context.session_start_ts,
        interventions_fired: [],
        active_count: 0,
        nudge_count: 0,
        passive_count: 0,
        total_nonpassive_count: 0,
        last_intervention_ts: null,
        last_intervention_type: null,
        last_dismiss_ts: null,
        user_dismissed_count: 0,
        friction_history: [],
        suppressed_friction_ids: new Set(),
        intent_score_accumulator: 0,
      });
    }
    return this.sessions.get(sid)!;
  }

  // Main evaluation — call this on every behavioral event
  async evaluate(event: BehavioralEvent): Promise<InterventionDecision> {
    const session = this.getSession(event);

    // Step 1: Calculate composite score
    const score = calculateCompositeScore(event, session);

    // Step 2: Resolve intervention type from score
    const interventionType = resolveInterventionType(score);

    // Step 3: Run gate checks
    const gate = runGateChecks(event, session, interventionType);

    if (!gate.pass) {
      // Log suppression
      session.friction_history.push({
        friction_id: event.friction_id,
        timestamp: event.timestamp,
        score: score.composite,
        outcome: "suppressed",
      });

      // Even when suppressed, passive adjustments can still fire
      if (interventionType !== InterventionType.PASSIVE) {
        // Try downgrading to passive
        const passiveGate = runGateChecks(event, session, InterventionType.PASSIVE);
        if (passiveGate.pass) {
          const payload = await buildPayload({
            friction_id: event.friction_id,
            category: event.category,
            intervention_type: InterventionType.PASSIVE,
            event,
            session,
          });
          this.recordIntervention(session, event, InterventionType.PASSIVE, payload);
          return {
            status: InterventionStatus.FIRE,
            score,
            payload,
            reason: `downgraded_to_passive: ${gate.reason}`,
          };
        }
      }

      return {
        status: InterventionStatus.SUPPRESS,
        score,
        payload: null,
        reason: gate.reason,
      };
    }

    // Step 4: Build payload
    const payload = await buildPayload({
      friction_id: event.friction_id,
      category: event.category,
      intervention_type: interventionType,
      event,
      session,
    });

    // Step 5: Record and return
    this.recordIntervention(session, event, interventionType, payload);

    return {
      status: InterventionStatus.FIRE,
      score,
      payload,
      reason: `score=${score.composite}, type=${interventionType}`,
    };
  }

  // Record intervention in session state
  private recordIntervention(
    session: SessionState,
    event: BehavioralEvent,
    type: InterventionType,
    payload: InterventionPayload
  ): void {
    const intervention: FiredIntervention = {
      intervention_id: `INT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      friction_id: event.friction_id,
      type,
      timestamp: event.timestamp,
      dismissed: false,
      converted: false,
      payload,
    };

    session.interventions_fired.push(intervention);
    session.friction_history.push({
      friction_id: event.friction_id,
      timestamp: event.timestamp,
      score: 0, // already logged above
      outcome: "fired",
    });
    session.last_intervention_ts = event.timestamp;
    session.last_intervention_type = type;
    session.suppressed_friction_ids.add(event.friction_id);

    // Update counters
    switch (type) {
      case InterventionType.PASSIVE:
        session.passive_count++;
        break;
      case InterventionType.NUDGE:
        session.nudge_count++;
        session.total_nonpassive_count++;
        break;
      case InterventionType.ACTIVE:
      case InterventionType.ESCALATE:
        session.active_count++;
        session.total_nonpassive_count++;
        break;
    }

    // Update intent accumulator
    session.intent_score_accumulator = Math.min(
      session.intent_score_accumulator + 0.05,
      0.5
    );
  }

  // Call when user dismisses an intervention
  onDismiss(session_id: string, intervention_id: string): void {
    const session = this.sessions.get(session_id);
    if (!session) return;

    const intervention = session.interventions_fired.find(
      (i) => i.intervention_id === intervention_id
    );
    if (intervention) {
      intervention.dismissed = true;
      session.last_dismiss_ts = Date.now();
      session.user_dismissed_count++;
    }
  }

  // Call when user acts on an intervention (clicked CTA, added to cart, etc.)
  onConversion(session_id: string, intervention_id: string): void {
    const session = this.sessions.get(session_id);
    if (!session) return;

    const intervention = session.interventions_fired.find(
      (i) => i.intervention_id === intervention_id
    );
    if (intervention) {
      intervention.converted = true;
      // Boost intent score on successful intervention
      session.intent_score_accumulator = Math.min(
        session.intent_score_accumulator + 0.15,
        0.5
      );
    }
  }

  // Cleanup expired sessions (call periodically)
  cleanup(maxAgeMs: number = 3_600_000): void {
    const now = Date.now();
    for (const [sid, session] of this.sessions) {
      if (now - session.session_start_ts > maxAgeMs) {
        this.sessions.delete(sid);
      }
    }
  }

  // Get session analytics for debugging/monitoring
  getSessionAnalytics(session_id: string): SessionState | null {
    return this.sessions.get(session_id) ?? null;
  }
}

// ---------------------------------------------------------------------------
// 9. USAGE EXAMPLE
// ---------------------------------------------------------------------------

/*
import { FISMEngine, BehavioralEvent, FrictionCategory } from "./fism";

const engine = new FISMEngine();

// Example: User hovered on Add to Cart but didn't click
const event: BehavioralEvent = {
  event_id: "evt_001",
  timestamp: Date.now(),
  friction_id: "F058",
  category: FrictionCategory.PRODUCT,
  raw_signals: {
    hover_atc_button: true,
    hover_duration_ms: 3200,
    product_id: "SKU_12345",
    product_price: 89.99,
  },
  page_context: {
    page_type: "pdp",
    page_url: "/products/blue-running-shoes",
    time_on_page_ms: 45000,
    scroll_depth_pct: 72,
    viewport: { width: 390, height: 844 },
    device: "mobile",
  },
  user_context: {
    user_id: "usr_abc123",
    session_id: "sess_xyz789",
    is_new_visitor: false,
    is_logged_in: true,
    session_start_ts: Date.now() - 120000,
    cart_value: 0,
    cart_item_count: 0,
    lifetime_order_count: 2,
    lifetime_order_value: 245.50,
    loyalty_tier: "silver",
    geo: { country: "US", region: "CA", city: "San Francisco" },
    device: "mobile",
    referrer_type: "organic",
  },
};

const decision = await engine.evaluate(event);

if (decision.status === "fire") {
  // Send decision.payload to the widget via WebSocket / SSE
  widgetBridge.send(decision.payload);
}

// User dismissed the nudge
engine.onDismiss("sess_xyz789", decision.payload?.meta?.intervention_id);

// User clicked CTA and added to cart
engine.onConversion("sess_xyz789", decision.payload?.meta?.intervention_id);
*/

// ---------------------------------------------------------------------------
// 10. SCORING FORMULA SUMMARY (for documentation)
// ---------------------------------------------------------------------------

/*
┌─────────────────────────────────────────────────────────────────┐
│                    FISM COMPOSITE SCORE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  composite = (intent × 0.30)                                    │
│            + (severity × 0.35)                                  │
│            + ((1 - fatigue) × 0.20)                             │
│            + ((1 - recency) × 0.15)                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  THRESHOLDS                                                     │
│  ─────────                                                      │
│  composite < 0.45  →  PASSIVE  (silent UI adjustment)           │
│  composite 0.45–0.64  →  NUDGE  (single message bubble)        │
│  composite 0.65–0.84  →  ACTIVE  (widget opens with cards)     │
│  composite ≥ 0.85  →  ESCALATE  (human handoff)                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  HARD GATES (override score)                                    │
│  ──────────                                                     │
│  • No active/nudge in first 30s of session                      │
│  • Max 2 active, 3 nudge, 6 total non-passive per session       │
│  • 2 min cooldown after active, 1 min after nudge               │
│  • 5 min cooldown after user dismiss                            │
│  • Same friction_id never triggered twice                       │
│  • 3+ dismissals → suppress all non-passive for session         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  INTENT SIGNAL (0–1)                                            │
│  ─────────────                                                  │
│  Base: page funnel position (landing=0.1 → checkout=0.9)        │
│  Boost: +0.15 cart has items, +0.05 logged in,                  │
│         +0.10 repeat customer, +0.05 per 2min session           │
│  Multiplier: ×1.3 if on checkout page                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  SEVERITY (0–1)                                                 │
│  ────────                                                       │
│  Static lookup per friction_id from catalog (F001–F325)         │
│  Higher = more likely to cause abandonment                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  FATIGUE (0–1)                                                  │
│  ───────                                                        │
│  +0.15 per non-passive intervention fired                       │
│  +0.25 per user dismissal                                       │
│  Capped at 1.0                                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  RECENCY (0–1)                                                  │
│  ────────                                                       │
│  1.0 if within cooldown window, 0.0 if outside                  │
│  Gradual decay between 1× and 2× cooldown period               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
*/
