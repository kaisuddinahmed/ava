import { BehaviorMappingRepo } from "@ava/db";
import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
import { getBehaviorCatalog } from "./catalog-retriever.js";

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
  eventType: string;
}

export interface BehaviorMappingResult {
  totalPatterns: number;
  insertedMappings: number;
  highConfidenceMappings: number;
  avgConfidence: number;
  lowConfidencePatternIds: string[];
}

export async function mapBehaviorsForRun(input: {
  analyzerRunId: string;
  siteConfigId: string;
  platform: string;
  trackingHooks: TrackingHooks;
}): Promise<BehaviorMappingResult> {
  const catalog = await getBehaviorCatalog();
  await BehaviorMappingRepo.deleteBehaviorMappingsBySite(input.siteConfigId);
  const siteFunctions = buildSiteFunctionContext(input.trackingHooks);
  const fallbackFunction = firstAvailableFunction(siteFunctions) ?? "navigation";

  const rows = catalog.map((pattern) => {
    const { candidates, keywordHits } = pickFunctionCandidates(pattern.description);
    const mappedFunction =
      candidates.find((fn) => siteFunctions[fn].available) ?? fallbackFunction;
    const context = siteFunctions[mappedFunction];
    const selector = context.selectors[0];

    let confidence = context.available ? 0.72 : 0.42;
    confidence += Math.min(0.18, keywordHits * 0.03);
    if (!context.available) confidence -= 0.08;
    if (mappedFunction === fallbackFunction && keywordHits === 0) confidence -= 0.08;
    confidence = clamp(confidence, 0.2, 0.95);

    const source = context.available ? "dom_rule" : "llm_inferred";
    const evidence = JSON.stringify({
      platform: input.platform,
      category: pattern.category,
      description: pattern.description,
      matchedKeywords: candidates,
      selectedFunction: mappedFunction,
      selectorFound: Boolean(selector),
    });

    return {
      analyzerRunId: input.analyzerRunId,
      siteConfigId: input.siteConfigId,
      patternId: pattern.id,
      patternName: pattern.description,
      mappedFunction,
      eventType: context.eventType,
      selector,
      confidence,
      source,
      evidence,
      isVerified: confidence >= 0.75,
      isActive: true,
    };
  });

  const insertResult = await BehaviorMappingRepo.createBehaviorMappings(rows);
  const avgConfidence =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
      : 0;
  const highConfidenceMappings = rows.filter((row) => row.confidence >= 0.75).length;
  const lowConfidencePatternIds = rows
    .filter((row) => row.confidence < 0.75)
    .slice(0, 100)
    .map((row) => row.patternId);

  return {
    totalPatterns: catalog.length,
    insertedMappings: insertResult.count,
    highConfidenceMappings,
    avgConfidence,
    lowConfidencePatternIds,
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
      eventType: "add_to_cart_click",
    },
    cart: {
      available: selectors.cartCount.length > 0 || selectors.cartTotal.length > 0,
      selectors: [...selectors.cartCount, ...selectors.cartTotal],
      eventType: "cart_interaction",
    },
    search: {
      available: selectors.searchInput.length > 0,
      selectors: selectors.searchInput,
      eventType: "search_initiated",
    },
    checkout: {
      available: selectors.checkoutButton.length > 0,
      selectors: selectors.checkoutButton,
      eventType: "checkout_initiated",
    },
    product: {
      available: selectors.productTitle.length > 0 || selectors.productImage.length > 0,
      selectors: [...selectors.productTitle, ...selectors.productImage],
      eventType: "product_interaction",
    },
    reviews: {
      available: selectors.reviewSection.length > 0,
      selectors: selectors.reviewSection,
      eventType: "review_interaction",
    },
    pricing: {
      available: selectors.productPrice.length > 0,
      selectors: selectors.productPrice,
      eventType: "price_interaction",
    },
    navigation: {
      available: selectors.breadcrumb.length > 0,
      selectors: selectors.breadcrumb,
      eventType: "navigation_interaction",
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

function pickFunctionCandidates(description: string): {
  candidates: SiteFunction[];
  keywordHits: number;
} {
  const text = description.toLowerCase();
  const functions: Array<{ fn: SiteFunction; score: number }> = [
    {
      fn: "add_to_cart",
      score: keywordScore(text, ["add to cart", "atc", "wishlist", "buy now"]),
    },
    {
      fn: "cart",
      score: keywordScore(text, ["cart", "basket", "bag"]),
    },
    {
      fn: "search",
      score: keywordScore(text, ["search", "query", "autocomplete"]),
    },
    {
      fn: "checkout",
      score: keywordScore(text, [
        "checkout",
        "payment",
        "billing",
        "shipping",
        "order",
      ]),
    },
    {
      fn: "product",
      score: keywordScore(text, [
        "product",
        "variant",
        "size",
        "color",
        "image",
        "video",
        "description",
      ]),
    },
    {
      fn: "reviews",
      score: keywordScore(text, ["review", "rating", "q&a"]),
    },
    {
      fn: "pricing",
      score: keywordScore(text, ["price", "discount", "coupon", "promo", "deal"]),
    },
    {
      fn: "navigation",
      score: keywordScore(text, [
        "navigation",
        "category",
        "menu",
        "scroll",
        "breadcrumb",
        "homepage",
        "landing",
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
