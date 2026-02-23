#!/usr/bin/env tsx
// ============================================================================
// AVA Session Simulator
// Generates synthetic WebSocket sessions against the running server to produce
// training datapoints through the full TRACK → EVALUATE → INTERVENE → outcome
// pipeline.
//
// Usage:
//   npx tsx scripts/simulate-sessions.ts [--sessions N] [--ws-url URL]
//
// Requires: server running on ws://localhost:8081 (or custom --ws-url)
// ============================================================================

import WebSocket from "ws";
import { v4 as uuid } from "uuid";

// ============================================================================
// CLI args
// ============================================================================
const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const TOTAL_SESSIONS = Number(getArg("sessions", "12"));
const WS_URL = getArg("ws-url", "ws://localhost:8081");
const CONCURRENCY = Number(getArg("concurrency", "3"));

// ============================================================================
// Types
// ============================================================================
interface TrackMessage {
  type: "track";
  visitorKey: string;
  sessionKey: string;
  siteUrl: string;
  deviceType: "mobile" | "tablet" | "desktop";
  referrerType: "direct" | "organic" | "paid" | "social" | "email" | "referral";
  visitorId: string;
  isLoggedIn: boolean;
  isRepeatVisitor: boolean;
  event: {
    event_id: string;
    friction_id?: string | null;
    category: string;
    event_type: string;
    raw_signals: Record<string, unknown>;
    page_context: {
      page_type: string;
      page_url: string;
      time_on_page_ms: number;
      scroll_depth_pct: number;
      viewport: { width: number; height: number };
      device: "mobile" | "tablet" | "desktop";
    };
    timestamp: number;
    metadata: Record<string, unknown>;
  };
}

interface OutcomeMessage {
  type: "intervention_outcome";
  intervention_id: string;
  session_id: string;
  status: "delivered" | "dismissed" | "converted" | "ignored";
  timestamp: number;
  conversion_action?: string;
}

// ============================================================================
// Realistic data pools
// ============================================================================
const SITE_URL = "https://demo-store.ava.dev";

const DEVICES: Array<"mobile" | "tablet" | "desktop"> = [
  "desktop", "desktop", "desktop", "desktop",
  "mobile", "mobile", "mobile",
  "tablet",
];

const REFERRER_TYPES: Array<"direct" | "organic" | "paid" | "social" | "email" | "referral"> = [
  "direct", "organic", "organic", "paid", "social", "email", "referral",
];

const PRODUCT_NAMES = [
  "Wireless Bluetooth Headphones", "Ergonomic Office Chair", "Stainless Steel Water Bottle",
  "Organic Cotton T-Shirt", "Running Shoes Pro", "Laptop Stand Adjustable",
  "Ceramic Coffee Mug Set", "Yoga Mat Premium", "Backpack Travel 40L",
  "Smart Watch Series X", "LED Desk Lamp", "Mechanical Keyboard RGB",
];

const PRODUCT_PRICES = [29.99, 299.99, 24.99, 39.99, 129.99, 49.99, 34.99, 59.99, 89.99, 249.99, 44.99, 119.99];
const PRODUCT_SKUS = PRODUCT_NAMES.map((_, i) => `SKU-${String(i + 1001).padStart(5, "0")}`);

const SEARCH_QUERIES = [
  "headphones", "office chair", "water bottle", "t-shirt cotton", "running shoes",
  "laptop accessories", "coffee mug", "yoga", "backpack", "smartwatch",
  "desk lamp", "keyboard mechanical", "gift ideas", "sale", "best seller",
];

const CATEGORY_NAMES = [
  "Electronics", "Furniture", "Kitchen", "Clothing", "Sports",
  "Accessories", "Home & Garden", "Fitness", "Travel", "Wearables",
];

const CHECKOUT_ERRORS = [
  "Invalid card number", "Card declined", "Address verification failed",
  "Session expired", "Shipping unavailable",
];

const CONVERSION_ACTIONS = [
  "completed_purchase", "added_to_cart_from_suggestion", "applied_coupon",
  "signed_up_for_alerts", "used_size_guide", "switched_to_recommended",
];

// ============================================================================
// Friction IDs commonly encountered per scenario type
// ============================================================================
const FRICTION_SETS = {
  browse_abandon: ["F015", "F017", "F020", "F042", "F043"],       // scroll no click, dead-end, pogo, product view+leave
  search_frustration: ["F028", "F029", "F030", "F031", "F032"],   // zero results, misspell, vague, multiple, competitor
  cart_hesitation: ["F068", "F069", "F070", "F071", "F072"],       // no checkout, idle cart, removed item, price sensitivity
  checkout_friction: ["F089", "F090", "F096", "F097", "F112"],     // forced account, form long, payment declined, timeout
  rage_click: ["F161", "F162", "F163", "F164"],                    // technical: unresponsive UI, JS error, broken image
  product_confusion: ["F042", "F044", "F047", "F050", "F053"],     // viewed+left, long dwell, size confusion, price unclear, OOS
  price_shock: ["F072", "F073", "F074", "F075"],                   // price sensitivity, shipping cost shock, hidden fees
  mobile_struggle: ["F131", "F132", "F133", "F134", "F135"],       // mobile: tiny targets, slow, keyboard covers
};

// ============================================================================
// Scenario definitions — each generates a realistic event sequence
// ============================================================================
type ScenarioName =
  | "browse_and_abandon"
  | "search_rage_quit"
  | "add_to_cart_then_abandon"
  | "checkout_friction_bail"
  | "rage_click_frustration"
  | "product_comparison_paralysis"
  | "price_shock_cart_abandon"
  | "happy_path_quick_buy"
  | "mobile_struggle_checkout"
  | "coupon_hunter"
  | "return_visitor_hesitation"
  | "landing_bounce";

const SCENARIO_WEIGHTS: Array<{ name: ScenarioName; weight: number }> = [
  { name: "browse_and_abandon", weight: 18 },
  { name: "search_rage_quit", weight: 10 },
  { name: "add_to_cart_then_abandon", weight: 15 },
  { name: "checkout_friction_bail", weight: 12 },
  { name: "rage_click_frustration", weight: 8 },
  { name: "product_comparison_paralysis", weight: 8 },
  { name: "price_shock_cart_abandon", weight: 8 },
  { name: "happy_path_quick_buy", weight: 5 },
  { name: "mobile_struggle_checkout", weight: 6 },
  { name: "coupon_hunter", weight: 4 },
  { name: "return_visitor_hesitation", weight: 4 },
  { name: "landing_bounce", weight: 2 },
];

// ============================================================================
// Helpers
// ============================================================================
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(): ScenarioName {
  const total = SCENARIO_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const entry of SCENARIO_WEIGHTS) {
    r -= entry.weight;
    if (r <= 0) return entry.name;
  }
  return SCENARIO_WEIGHTS[0].name;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): number {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickOutcome(): "dismissed" | "converted" | "ignored" {
  const r = Math.random();
  if (r < 0.15) return "converted";    // 15%
  if (r < 0.40) return "dismissed";    // 25%
  return "ignored";                     // 60%
}

function makePageContext(
  pageType: string,
  pageUrl: string,
  device: "mobile" | "tablet" | "desktop",
  timeOnPage?: number,
  scrollDepth?: number,
): TrackMessage["event"]["page_context"] {
  const viewports = {
    mobile: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
  };
  return {
    page_type: pageType,
    page_url: `${SITE_URL}${pageUrl}`,
    time_on_page_ms: timeOnPage ?? randomInt(1000, 30000),
    scroll_depth_pct: scrollDepth ?? randomInt(0, 100),
    viewport: viewports[device],
    device,
  };
}

// ============================================================================
// Session context — shared across events in a session
// ============================================================================
interface SessionCtx {
  visitorKey: string;
  sessionKey: string;
  visitorId: string;
  device: "mobile" | "tablet" | "desktop";
  referrerType: "direct" | "organic" | "paid" | "social" | "email" | "referral";
  isLoggedIn: boolean;
  isRepeatVisitor: boolean;
  productIdx: number;
  cartValue: number;
  cartItems: number;
}

function createSessionCtx(overrides?: Partial<SessionCtx>): SessionCtx {
  const productIdx = randomInt(0, PRODUCT_NAMES.length - 1);
  return {
    visitorKey: `sim-visitor-${uuid().slice(0, 8)}`,
    sessionKey: `sim-session-${uuid().slice(0, 8)}`,
    visitorId: `sim-${uuid().slice(0, 12)}`,
    device: pick(DEVICES),
    referrerType: pick(REFERRER_TYPES),
    isLoggedIn: Math.random() < 0.3,
    isRepeatVisitor: Math.random() < 0.4,
    productIdx,
    cartValue: 0,
    cartItems: 0,
    ...overrides,
  };
}

function buildTrackMessage(ctx: SessionCtx, event: Omit<TrackMessage["event"], "event_id" | "timestamp">): TrackMessage {
  return {
    type: "track",
    visitorKey: ctx.visitorKey,
    sessionKey: ctx.sessionKey,
    siteUrl: SITE_URL,
    deviceType: ctx.device,
    referrerType: ctx.referrerType,
    visitorId: ctx.visitorId,
    isLoggedIn: ctx.isLoggedIn,
    isRepeatVisitor: ctx.isRepeatVisitor,
    event: {
      event_id: uuid(),
      timestamp: Date.now(),
      ...event,
    },
  };
}

// ============================================================================
// Event generators — composable steps
// ============================================================================

function landingPageView(ctx: SessionCtx): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "navigation",
    event_type: "page_view",
    friction_id: null,
    raw_signals: { loadTime: randomFloat(0.8, 4.5), referrer: ctx.referrerType },
    page_context: makePageContext("landing", "/", ctx.device, randomInt(500, 5000), randomInt(0, 30)),
    metadata: { scenario: "landing" },
  });
}

function categoryBrowse(ctx: SessionCtx): TrackMessage {
  const cat = pick(CATEGORY_NAMES);
  return buildTrackMessage(ctx, {
    category: "navigation",
    event_type: "category_view",
    friction_id: null,
    raw_signals: { categoryName: cat, productCount: randomInt(8, 120) },
    page_context: makePageContext("category", `/category/${cat.toLowerCase().replace(/ /g, "-")}`, ctx.device),
    metadata: { categoryName: cat },
  });
}

function searchEvent(ctx: SessionCtx, query?: string, resultCount?: number): TrackMessage {
  const q = query ?? pick(SEARCH_QUERIES);
  const results = resultCount ?? randomInt(0, 50);
  return buildTrackMessage(ctx, {
    category: "search",
    event_type: "search_query",
    friction_id: results === 0 ? "F028" : null,
    raw_signals: { query: q, resultCount: results, autocompleteUsed: Math.random() < 0.4 },
    page_context: makePageContext("search_results", `/search?q=${encodeURIComponent(q)}`, ctx.device),
    metadata: { query: q, resultCount: results },
  });
}

function productView(ctx: SessionCtx, dwellMs?: number): TrackMessage {
  const name = PRODUCT_NAMES[ctx.productIdx];
  const price = PRODUCT_PRICES[ctx.productIdx];
  const sku = PRODUCT_SKUS[ctx.productIdx];
  return buildTrackMessage(ctx, {
    category: "product",
    event_type: "product_view",
    friction_id: null,
    raw_signals: {
      productName: name, price, sku,
      inStock: Math.random() > 0.1,
      reviewCount: randomInt(0, 500),
      avgRating: randomFloat(2.5, 5.0, 1),
    },
    page_context: makePageContext("pdp", `/product/${sku}`, ctx.device, dwellMs ?? randomInt(3000, 45000), randomInt(20, 100)),
    metadata: { productName: name, sku },
  });
}

function productScroll(ctx: SessionCtx): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "engagement",
    event_type: "scroll",
    friction_id: pick(FRICTION_SETS.product_confusion),
    raw_signals: { scrollDepth: randomInt(60, 100), direction: "down", velocity: randomFloat(0.2, 3.0) },
    page_context: makePageContext("pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`, ctx.device, randomInt(15000, 60000), randomInt(70, 100)),
    metadata: {},
  });
}

function addToCart(ctx: SessionCtx): TrackMessage {
  const price = PRODUCT_PRICES[ctx.productIdx];
  ctx.cartValue += price;
  ctx.cartItems += 1;
  return buildTrackMessage(ctx, {
    category: "cart",
    event_type: "add_to_cart",
    friction_id: null,
    raw_signals: {
      productName: PRODUCT_NAMES[ctx.productIdx],
      sku: PRODUCT_SKUS[ctx.productIdx],
      price,
      quantity: 1,
      cartValue: ctx.cartValue,
      cartItemCount: ctx.cartItems,
    },
    page_context: makePageContext("pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`, ctx.device),
    metadata: { action: "add_to_cart" },
  });
}

function cartView(ctx: SessionCtx): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "cart",
    event_type: "cart_view",
    friction_id: null,
    raw_signals: { cartValue: ctx.cartValue, cartItemCount: ctx.cartItems, couponApplied: false },
    page_context: makePageContext("cart", "/cart", ctx.device, randomInt(5000, 30000), randomInt(30, 100)),
    metadata: {},
  });
}

function cartRemoveItem(ctx: SessionCtx): TrackMessage {
  const price = PRODUCT_PRICES[ctx.productIdx];
  ctx.cartValue = Math.max(0, ctx.cartValue - price);
  ctx.cartItems = Math.max(0, ctx.cartItems - 1);
  return buildTrackMessage(ctx, {
    category: "cart",
    event_type: "remove_from_cart",
    friction_id: "F070",
    raw_signals: {
      removedProduct: PRODUCT_NAMES[ctx.productIdx],
      removedSku: PRODUCT_SKUS[ctx.productIdx],
      cartValue: ctx.cartValue,
      cartItemCount: ctx.cartItems,
    },
    page_context: makePageContext("cart", "/cart", ctx.device),
    metadata: { action: "remove" },
  });
}

function checkoutStart(ctx: SessionCtx): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "checkout",
    event_type: "checkout_start",
    friction_id: null,
    raw_signals: { cartValue: ctx.cartValue, cartItemCount: ctx.cartItems, isGuest: !ctx.isLoggedIn },
    page_context: makePageContext("checkout", "/checkout", ctx.device, randomInt(2000, 10000), randomInt(0, 30)),
    metadata: { step: "start" },
  });
}

function checkoutFormFill(ctx: SessionCtx, frictionId?: string): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "checkout",
    event_type: "form_interaction",
    friction_id: frictionId ?? null,
    raw_signals: {
      fieldsCompleted: randomInt(2, 8),
      fieldsTotal: 8,
      errorsShown: frictionId ? randomInt(1, 3) : 0,
      timeSpentMs: randomInt(10000, 60000),
    },
    page_context: makePageContext("checkout", "/checkout/shipping", ctx.device, randomInt(15000, 90000), randomInt(30, 80)),
    metadata: { step: "form_fill" },
  });
}

function checkoutPaymentError(ctx: SessionCtx): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "checkout",
    event_type: "payment_error",
    friction_id: "F096",
    raw_signals: { errorMessage: pick(CHECKOUT_ERRORS), attempt: randomInt(1, 3) },
    page_context: makePageContext("checkout", "/checkout/payment", ctx.device, randomInt(5000, 30000), randomInt(50, 100)),
    metadata: { step: "payment" },
  });
}

function rageClickEvent(ctx: SessionCtx, pageType: string, pageUrl: string): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "technical",
    event_type: "rage_click",
    friction_id: pick(FRICTION_SETS.rage_click),
    raw_signals: {
      clickCount: randomInt(4, 12),
      targetSelector: pick(["button.add-to-cart", "a.checkout", "div.product-image", "input.quantity"]),
      withinMs: randomInt(500, 2000),
    },
    page_context: makePageContext(pageType, pageUrl, ctx.device, randomInt(5000, 20000), randomInt(10, 60)),
    metadata: { frustrationSignal: true },
  });
}

function idleDwell(ctx: SessionCtx, pageType: string, pageUrl: string): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "engagement",
    event_type: "idle_dwell",
    friction_id: null,
    raw_signals: { idleDurationMs: randomInt(10000, 60000), mouseMovements: randomInt(0, 5) },
    page_context: makePageContext(pageType, pageUrl, ctx.device, randomInt(20000, 120000), randomInt(20, 80)),
    metadata: {},
  });
}

function exitIntent(ctx: SessionCtx, pageType: string, pageUrl: string): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "engagement",
    event_type: "exit_intent",
    friction_id: null,
    raw_signals: { mouseY: randomInt(-10, 5), velocity: randomFloat(0.5, 3.0) },
    page_context: makePageContext(pageType, pageUrl, ctx.device, randomInt(5000, 60000), randomInt(10, 90)),
    metadata: { intent: "leave" },
  });
}

function couponSearch(ctx: SessionCtx): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "search",
    event_type: "search_query",
    friction_id: "F036",
    raw_signals: { query: pick(["coupon", "discount code", "promo", "sale code", "free shipping code"]), resultCount: 0 },
    page_context: makePageContext("checkout", "/checkout", ctx.device),
    metadata: { isCouponHunt: true },
  });
}

function tabSwitch(ctx: SessionCtx): TrackMessage {
  return buildTrackMessage(ctx, {
    category: "engagement",
    event_type: "tab_switch",
    friction_id: null,
    raw_signals: { awayDurationMs: randomInt(5000, 30000), returnedToSamePage: true },
    page_context: makePageContext("pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`, ctx.device),
    metadata: { possibleComparison: true },
  });
}

// ============================================================================
// Scenario builders — each returns an array of TrackMessages
// ============================================================================

function scenarioBrowseAndAbandon(ctx: SessionCtx): TrackMessage[] {
  return [
    landingPageView(ctx),
    categoryBrowse(ctx),
    productView(ctx, randomInt(3000, 8000)),
    productScroll(ctx),
    idleDwell(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
    exitIntent(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
  ];
}

function scenarioSearchRageQuit(ctx: SessionCtx): TrackMessage[] {
  const events: TrackMessage[] = [landingPageView(ctx)];
  // 3-4 frustrated searches
  for (let i = 0; i < randomInt(3, 4); i++) {
    events.push(searchEvent(ctx, undefined, i === 0 ? 0 : randomInt(0, 3)));
  }
  events.push(rageClickEvent(ctx, "search_results", "/search?q=stuff"));
  events.push(exitIntent(ctx, "search_results", "/search"));
  return events;
}

function scenarioAddToCartThenAbandon(ctx: SessionCtx): TrackMessage[] {
  return [
    landingPageView(ctx),
    searchEvent(ctx, undefined, randomInt(5, 30)),
    productView(ctx),
    addToCart(ctx),
    cartView(ctx),
    idleDwell(ctx, "cart", "/cart"),
    exitIntent(ctx, "cart", "/cart"),
  ];
}

function scenarioCheckoutFrictionBail(ctx: SessionCtx): TrackMessage[] {
  ctx.isLoggedIn = false; // force guest for forced-account friction
  return [
    landingPageView(ctx),
    productView(ctx),
    addToCart(ctx),
    cartView(ctx),
    checkoutStart(ctx),
    checkoutFormFill(ctx, pick(["F089", "F090", "F091"])),
    checkoutFormFill(ctx, "F093"),
    checkoutPaymentError(ctx),
    exitIntent(ctx, "checkout", "/checkout/payment"),
  ];
}

function scenarioRageClickFrustration(ctx: SessionCtx): TrackMessage[] {
  return [
    landingPageView(ctx),
    productView(ctx),
    rageClickEvent(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
    rageClickEvent(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
    idleDwell(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
    exitIntent(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
  ];
}

function scenarioProductComparisonParalysis(ctx: SessionCtx): TrackMessage[] {
  const events: TrackMessage[] = [landingPageView(ctx)];
  // View 3-4 products, switching back and forth
  for (let i = 0; i < randomInt(3, 4); i++) {
    ctx.productIdx = randomInt(0, PRODUCT_NAMES.length - 1);
    events.push(productView(ctx, randomInt(8000, 25000)));
    events.push(tabSwitch(ctx));
  }
  events.push(idleDwell(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`));
  events.push(exitIntent(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`));
  return events;
}

function scenarioPriceShockCartAbandon(ctx: SessionCtx): TrackMessage[] {
  return [
    landingPageView(ctx),
    productView(ctx),
    addToCart(ctx),
    cartView(ctx),
    // "Shipping cost shock" — user sees total with shipping
    buildTrackMessage(ctx, {
      category: "cart",
      event_type: "shipping_estimate_view",
      friction_id: "F073",
      raw_signals: {
        subtotal: ctx.cartValue,
        shippingCost: randomFloat(8.99, 19.99),
        totalWithShipping: ctx.cartValue + 14.99,
      },
      page_context: makePageContext("cart", "/cart", ctx.device, randomInt(10000, 30000), randomInt(50, 90)),
      metadata: { priceShock: true },
    }),
    cartRemoveItem(ctx),
    exitIntent(ctx, "cart", "/cart"),
  ];
}

function scenarioHappyPathQuickBuy(ctx: SessionCtx): TrackMessage[] {
  ctx.isLoggedIn = true;
  ctx.isRepeatVisitor = true;
  return [
    landingPageView(ctx),
    productView(ctx, randomInt(2000, 6000)),
    addToCart(ctx),
    cartView(ctx),
    checkoutStart(ctx),
    checkoutFormFill(ctx),
    // Successful completion — relatively quick
    buildTrackMessage(ctx, {
      category: "checkout",
      event_type: "payment_submit",
      friction_id: null,
      raw_signals: { cartValue: ctx.cartValue, paymentMethod: "credit_card", success: true },
      page_context: makePageContext("checkout", "/checkout/confirmation", ctx.device, randomInt(2000, 8000), 100),
      metadata: { step: "complete" },
    }),
  ];
}

function scenarioMobileStruggleCheckout(ctx: SessionCtx): TrackMessage[] {
  ctx.device = "mobile";
  return [
    landingPageView(ctx),
    productView(ctx),
    addToCart(ctx),
    cartView(ctx),
    checkoutStart(ctx),
    // Mobile friction events
    buildTrackMessage(ctx, {
      category: "technical",
      event_type: "form_error",
      friction_id: "F132",
      raw_signals: { errorType: "keyboard_covers_input", fieldName: "email", device: "mobile" },
      page_context: makePageContext("checkout", "/checkout/shipping", ctx.device, randomInt(20000, 60000), randomInt(30, 70)),
      metadata: { mobileFriction: true },
    }),
    rageClickEvent(ctx, "checkout", "/checkout/shipping"),
    checkoutFormFill(ctx, "F134"),
    exitIntent(ctx, "checkout", "/checkout/shipping"),
  ];
}

function scenarioCouponHunter(ctx: SessionCtx): TrackMessage[] {
  return [
    landingPageView(ctx),
    productView(ctx),
    addToCart(ctx),
    cartView(ctx),
    checkoutStart(ctx),
    couponSearch(ctx),
    // Leaves to find coupon elsewhere
    tabSwitch(ctx),
    idleDwell(ctx, "checkout", "/checkout"),
    exitIntent(ctx, "checkout", "/checkout"),
  ];
}

function scenarioReturnVisitorHesitation(ctx: SessionCtx): TrackMessage[] {
  ctx.isRepeatVisitor = true;
  return [
    landingPageView(ctx),
    productView(ctx, randomInt(15000, 45000)),
    productScroll(ctx),
    idleDwell(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
    // Revisits product detail
    productView(ctx, randomInt(10000, 30000)),
    tabSwitch(ctx),
    exitIntent(ctx, "pdp", `/product/${PRODUCT_SKUS[ctx.productIdx]}`),
  ];
}

function scenarioLandingBounce(ctx: SessionCtx): TrackMessage[] {
  return [
    landingPageView(ctx),
    buildTrackMessage(ctx, {
      category: "navigation",
      event_type: "page_view",
      friction_id: "F002",
      raw_signals: { loadTime: randomFloat(3.0, 8.0), bounced: true },
      page_context: makePageContext("landing", "/", ctx.device, randomInt(500, 3000), randomInt(0, 10)),
      metadata: { bounce: true },
    }),
  ];
}

function generateEvents(scenario: ScenarioName, ctx: SessionCtx): TrackMessage[] {
  switch (scenario) {
    case "browse_and_abandon": return scenarioBrowseAndAbandon(ctx);
    case "search_rage_quit": return scenarioSearchRageQuit(ctx);
    case "add_to_cart_then_abandon": return scenarioAddToCartThenAbandon(ctx);
    case "checkout_friction_bail": return scenarioCheckoutFrictionBail(ctx);
    case "rage_click_frustration": return scenarioRageClickFrustration(ctx);
    case "product_comparison_paralysis": return scenarioProductComparisonParalysis(ctx);
    case "price_shock_cart_abandon": return scenarioPriceShockCartAbandon(ctx);
    case "happy_path_quick_buy": return scenarioHappyPathQuickBuy(ctx);
    case "mobile_struggle_checkout": return scenarioMobileStruggleCheckout(ctx);
    case "coupon_hunter": return scenarioCouponHunter(ctx);
    case "return_visitor_hesitation": return scenarioReturnVisitorHesitation(ctx);
    case "landing_bounce": return scenarioLandingBounce(ctx);
  }
}

// ============================================================================
// WebSocket session runner
// ============================================================================

interface SessionResult {
  sessionNum: number;
  scenario: ScenarioName;
  visitorKey: string;
  eventsSent: number;
  interventionsReceived: number;
  outcomesSent: number;
  outcomes: Record<string, number>;
  error?: string;
}

async function runSession(sessionNum: number): Promise<SessionResult> {
  const scenario = pickWeighted();
  const ctx = createSessionCtx();
  const events = generateEvents(scenario, ctx);

  const result: SessionResult = {
    sessionNum,
    scenario,
    visitorKey: ctx.visitorKey,
    eventsSent: 0,
    interventionsReceived: 0,
    outcomesSent: 0,
    outcomes: { converted: 0, dismissed: 0, ignored: 0 },
  };

  return new Promise<SessionResult>((resolve) => {
    const wsUrl = `${WS_URL}/?channel=widget&sessionId=${ctx.sessionKey}`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      result.error = `Connection failed: ${err}`;
      resolve(result);
      return;
    }

    let sessionId: string | null = null;
    const pendingInterventions: Array<{ interventionId: string; sessionId: string }> = [];
    let eventIndex = 0;
    let closed = false;

    const cleanup = () => {
      if (!closed) {
        closed = true;
        try { ws.close(); } catch { /* ignore */ }
        resolve(result);
      }
    };

    // Timeout safety net — 90s max per session
    const timeout = setTimeout(() => {
      console.warn(`  [Session ${sessionNum}] Timeout — closing`);
      cleanup();
    }, 90_000);

    ws.on("error", (err) => {
      result.error = `WebSocket error: ${err.message}`;
      clearTimeout(timeout);
      cleanup();
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      if (!closed) {
        closed = true;
        resolve(result);
      }
    });

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Capture sessionId from track_ack
        if (msg.type === "track_ack" && msg.sessionId) {
          sessionId = msg.sessionId;
        }

        // Receive intervention — queue outcome
        if (msg.type === "intervention" && msg.data?.interventionId) {
          result.interventionsReceived++;
          pendingInterventions.push({
            interventionId: msg.data.interventionId,
            sessionId: msg.data.sessionId || sessionId || "",
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("open", async () => {
      console.log(`  [Session ${sessionNum}] Connected — scenario: ${scenario}, events: ${events.length}`);

      // Send events with realistic spacing
      for (const event of events) {
        if (closed) break;

        ws.send(JSON.stringify(event));
        result.eventsSent++;

        // Wait 300-1500ms between events (simulates real browsing)
        await delay(randomInt(300, 1500));
        eventIndex++;
      }

      // Wait for evaluation buffer to flush (5s) + LLM processing time
      console.log(`  [Session ${sessionNum}] All events sent. Waiting for evaluations...`);
      await delay(8000);

      // Send "delivered" for all interventions first
      for (const intervention of pendingInterventions) {
        if (closed) break;
        const deliveredMsg: OutcomeMessage = {
          type: "intervention_outcome",
          intervention_id: intervention.interventionId,
          session_id: intervention.sessionId,
          status: "delivered",
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(deliveredMsg));
        await delay(200);
      }

      // Wait a bit, then send terminal outcomes
      await delay(randomInt(1000, 3000));

      for (const intervention of pendingInterventions) {
        if (closed) break;
        const terminalOutcome = pickOutcome();
        const outcomeMsg: OutcomeMessage = {
          type: "intervention_outcome",
          intervention_id: intervention.interventionId,
          session_id: intervention.sessionId,
          status: terminalOutcome,
          timestamp: Date.now(),
          ...(terminalOutcome === "converted"
            ? { conversion_action: pick(CONVERSION_ACTIONS) }
            : {}),
        };
        ws.send(JSON.stringify(outcomeMsg));
        result.outcomesSent++;
        result.outcomes[terminalOutcome]++;

        await delay(randomInt(300, 800));
      }

      // Wait for training datapoint capture
      await delay(3000);

      console.log(
        `  [Session ${sessionNum}] Done — ` +
        `events=${result.eventsSent} interventions=${result.interventionsReceived} ` +
        `outcomes=${JSON.stringify(result.outcomes)}`
      );

      clearTimeout(timeout);
      cleanup();
    });
  });
}

// ============================================================================
// Main — run sessions with concurrency control
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║            AVA Session Simulator                           ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Sessions:    ${String(TOTAL_SESSIONS).padEnd(45)}║`);
  console.log(`║  Concurrency: ${String(CONCURRENCY).padEnd(45)}║`);
  console.log(`║  WS URL:      ${WS_URL.padEnd(45)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  // Test connection first
  try {
    const testWs = new WebSocket(`${WS_URL}/?channel=widget`);
    await new Promise<void>((resolve, reject) => {
      testWs.on("open", () => { testWs.close(); resolve(); });
      testWs.on("error", reject);
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });
  } catch (err) {
    console.error(`❌ Cannot connect to ${WS_URL}. Is the server running?`);
    console.error(`   Start the server: npm run dev:server`);
    process.exit(1);
  }

  console.log(`✅ Connected to ${WS_URL}\n`);

  const results: SessionResult[] = [];
  let nextSession = 0;

  // Run sessions with concurrency limit
  async function runNext(): Promise<void> {
    while (nextSession < TOTAL_SESSIONS) {
      const sessionNum = ++nextSession;
      const result = await runSession(sessionNum);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, TOTAL_SESSIONS) }, () => runNext());
  await Promise.all(workers);

  // Print summary
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                      SIMULATION SUMMARY                    ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");

  const totalEvents = results.reduce((s, r) => s + r.eventsSent, 0);
  const totalInterventions = results.reduce((s, r) => s + r.interventionsReceived, 0);
  const totalOutcomes = results.reduce((s, r) => s + r.outcomesSent, 0);
  const totalConverted = results.reduce((s, r) => s + (r.outcomes.converted ?? 0), 0);
  const totalDismissed = results.reduce((s, r) => s + (r.outcomes.dismissed ?? 0), 0);
  const totalIgnored = results.reduce((s, r) => s + (r.outcomes.ignored ?? 0), 0);
  const errors = results.filter((r) => r.error);

  console.log(`║  Sessions completed:  ${String(results.length).padEnd(38)}║`);
  console.log(`║  Total events sent:   ${String(totalEvents).padEnd(38)}║`);
  console.log(`║  Interventions recv:  ${String(totalInterventions).padEnd(38)}║`);
  console.log(`║  Outcomes sent:       ${String(totalOutcomes).padEnd(38)}║`);
  console.log("║                                                            ║");
  console.log("║  Outcome Distribution:                                     ║");
  console.log(`║    Converted: ${String(totalConverted).padEnd(46)}║`);
  console.log(`║    Dismissed: ${String(totalDismissed).padEnd(46)}║`);
  console.log(`║    Ignored:   ${String(totalIgnored).padEnd(46)}║`);

  if (totalOutcomes > 0) {
    const pctConv = ((totalConverted / totalOutcomes) * 100).toFixed(1);
    const pctDis = ((totalDismissed / totalOutcomes) * 100).toFixed(1);
    const pctIgn = ((totalIgnored / totalOutcomes) * 100).toFixed(1);
    console.log(`║    (${pctConv}% / ${pctDis}% / ${pctIgn}%)${" ".repeat(Math.max(0, 42 - pctConv.length - pctDis.length - pctIgn.length))}║`);
  }

  console.log("║                                                            ║");
  console.log("║  Scenario Breakdown:                                       ║");

  const scenarioCounts = new Map<string, number>();
  for (const r of results) {
    scenarioCounts.set(r.scenario, (scenarioCounts.get(r.scenario) ?? 0) + 1);
  }
  for (const [name, count] of [...scenarioCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const line = `    ${name}: ${count}`;
    console.log(`║  ${line.padEnd(58)}║`);
  }

  if (errors.length > 0) {
    console.log("║                                                            ║");
    console.log(`║  ⚠️  Errors: ${String(errors.length).padEnd(46)}║`);
    for (const e of errors) {
      console.log(`║    Session ${e.sessionNum}: ${(e.error ?? "unknown").slice(0, 40).padEnd(40)}║`);
    }
  }

  console.log("╚══════════════════════════════════════════════════════════════╝");

  console.log("\n📊 Check training data:");
  console.log("   curl http://localhost:8080/api/training/stats");
  console.log("   curl http://localhost:8080/api/training/distribution");
  console.log("   curl http://localhost:8080/api/training/export/json | jq length");
  console.log();

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
