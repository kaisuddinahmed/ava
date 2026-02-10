import { FrictionMappingRepo } from "@ava/db";
import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
import { getFrictionCatalog } from "./catalog-retriever.js";

type SiteFunction =
  | "add_to_cart"
  | "cart"
  | "search"
  | "checkout"
  | "product"
  | "reviews"
  | "pricing"
  | "navigation";

interface SiteFunctionContext {
  available: boolean;
  selectors: string[];
  triggerEvent: string;
}

export interface FrictionMappingResult {
  totalFrictions: number;
  insertedMappings: number;
  highConfidenceMappings: number;
  avgConfidence: number;
  lowConfidenceFrictionIds: string[];
}

export async function mapFrictionsForRun(input: {
  analyzerRunId: string;
  siteConfigId: string;
  platform: string;
  trackingHooks: TrackingHooks;
}): Promise<FrictionMappingResult> {
  const catalog = getFrictionCatalog();
  const siteFunctions = buildSiteFunctionContext(input.trackingHooks);
  const fallbackFunction = firstAvailableFunction(siteFunctions) ?? "navigation";

  const rows = catalog.map((friction) => {
    const signalText = `${friction.scenario} ${friction.detection_signal}`.toLowerCase();
    const { candidates, keywordHits } = pickFunctionCandidates(signalText);
    const mappedFunction =
      candidates.find((fn) => siteFunctions[fn].available) ?? fallbackFunction;
    const context = siteFunctions[mappedFunction];
    const selector = context.selectors[0];

    const ruleLikeSignal =
      friction.detection_signal.includes(">") ||
      friction.detection_signal.includes("<") ||
      friction.detection_signal.includes("==") ||
      friction.detection_signal.includes("AND") ||
      friction.detection_signal.includes("OR");

    const detectorType = ruleLikeSignal
      ? "rule"
      : context.available
        ? "hybrid"
        : "llm";

    let confidence = context.available ? 0.7 : 0.48;
    confidence += Math.min(0.16, keywordHits * 0.02);
    confidence += (friction.severity - 50) / 250;
    if (!selector) confidence -= 0.1;
    confidence = clamp(confidence, 0.2, 0.95);

    const thresholdConfig = JSON.stringify({
      signalExpression: friction.detection_signal,
      severity: friction.severity,
      defaultAction: friction.ai_action,
    });

    const evidence = JSON.stringify({
      platform: input.platform,
      category: friction.category,
      scenario: friction.scenario,
      selectedFunction: mappedFunction,
      matchedKeywords: candidates,
      selectorFound: Boolean(selector),
    });

    return {
      analyzerRunId: input.analyzerRunId,
      siteConfigId: input.siteConfigId,
      frictionId: friction.id,
      detectorType,
      triggerEvent: context.triggerEvent,
      selector,
      thresholdConfig,
      confidence,
      evidence,
      isVerified: confidence >= 0.75,
      isActive: true,
    };
  });

  const insertResult = await FrictionMappingRepo.createFrictionMappings(rows);
  const avgConfidence =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
      : 0;
  const highConfidenceMappings = rows.filter((row) => row.confidence >= 0.75).length;
  const lowConfidenceFrictionIds = rows
    .filter((row) => row.confidence < 0.75)
    .slice(0, 100)
    .map((row) => row.frictionId);

  return {
    totalFrictions: catalog.length,
    insertedMappings: insertResult.count,
    highConfidenceMappings,
    avgConfidence,
    lowConfidenceFrictionIds,
  };
}

function buildSiteFunctionContext(
  trackingHooks: TrackingHooks,
): Record<SiteFunction, SiteFunctionContext> {
  const selectors = trackingHooks.selectors;

  return {
    add_to_cart: {
      available: selectors.addToCart.length > 0,
      selectors: selectors.addToCart,
      triggerEvent: "add_to_cart_click",
    },
    cart: {
      available: selectors.cartCount.length > 0 || selectors.cartTotal.length > 0,
      selectors: [...selectors.cartCount, ...selectors.cartTotal],
      triggerEvent: "cart_interaction",
    },
    search: {
      available: selectors.searchInput.length > 0,
      selectors: selectors.searchInput,
      triggerEvent: "search_initiated",
    },
    checkout: {
      available: selectors.checkoutButton.length > 0,
      selectors: selectors.checkoutButton,
      triggerEvent: "checkout_initiated",
    },
    product: {
      available: selectors.productTitle.length > 0 || selectors.productImage.length > 0,
      selectors: [...selectors.productTitle, ...selectors.productImage],
      triggerEvent: "product_interaction",
    },
    reviews: {
      available: selectors.reviewSection.length > 0,
      selectors: selectors.reviewSection,
      triggerEvent: "review_interaction",
    },
    pricing: {
      available: selectors.productPrice.length > 0,
      selectors: selectors.productPrice,
      triggerEvent: "price_interaction",
    },
    navigation: {
      available: selectors.breadcrumb.length > 0,
      selectors: selectors.breadcrumb,
      triggerEvent: "navigation_interaction",
    },
  };
}

function firstAvailableFunction(
  context: Record<SiteFunction, SiteFunctionContext>,
): SiteFunction | null {
  const functions: SiteFunction[] = [
    "add_to_cart",
    "cart",
    "search",
    "checkout",
    "product",
    "reviews",
    "pricing",
    "navigation",
  ];
  for (const fn of functions) {
    if (context[fn].available) return fn;
  }
  return null;
}

function pickFunctionCandidates(text: string): {
  candidates: SiteFunction[];
  keywordHits: number;
} {
  const functions: Array<{ fn: SiteFunction; score: number }> = [
    {
      fn: "add_to_cart",
      score: keywordScore(text, ["add to cart", "atc", "buy", "wishlist"]),
    },
    {
      fn: "cart",
      score: keywordScore(text, ["cart", "basket", "bag"]),
    },
    {
      fn: "search",
      score: keywordScore(text, ["search", "query", "results", "autocomplete"]),
    },
    {
      fn: "checkout",
      score: keywordScore(text, [
        "checkout",
        "payment",
        "billing",
        "shipping",
        "order",
        "form",
      ]),
    },
    {
      fn: "product",
      score: keywordScore(text, [
        "product",
        "pdp",
        "variant",
        "stock",
        "image",
        "description",
      ]),
    },
    {
      fn: "reviews",
      score: keywordScore(text, ["review", "rating", "testimonial", "social proof"]),
    },
    {
      fn: "pricing",
      score: keywordScore(text, ["price", "coupon", "discount", "promo", "fee", "tax"]),
    },
    {
      fn: "navigation",
      score: keywordScore(text, [
        "navigation",
        "menu",
        "scroll",
        "category",
        "breadcrumb",
        "back button",
      ]),
    },
  ];

  const ranked = functions
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.fn);

  if (ranked.length === 0) {
    return { candidates: ["navigation", "product"], keywordHits: 0 };
  }

  return {
    candidates: ranked,
    keywordHits: functions.reduce((sum, item) => sum + item.score, 0),
  };
}

function keywordScore(text: string, keywords: string[]): number {
  return keywords.reduce(
    (score, keyword) => (text.includes(keyword) ? score + 1 : score),
    0,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

