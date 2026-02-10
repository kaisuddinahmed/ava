import type { SiteSelectors } from "./selectors.js";
import { SHOPIFY_SELECTORS } from "./platform-detectors/shopify.js";
import { WOOCOMMERCE_SELECTORS } from "./platform-detectors/woocommerce.js";
import { MAGENTO_SELECTORS } from "./platform-detectors/magento.js";
import { GENERIC_PLATFORM_SELECTORS } from "./platform-detectors/generic.js";

/**
 * Tracking hook configuration generated for a specific site.
 */
export interface TrackingHooks {
  platform: string;
  selectors: SiteSelectors;
  observerConfig: ObserverConfig;
  eventMappings: EventMapping[];
}

export interface ObserverConfig {
  /** Selectors to watch for mutations (e.g., cart count changes). */
  mutationTargets: string[];
  /** Selectors for click tracking (ATC, checkout, etc.). */
  clickTargets: string[];
  /** Selectors for intersection observation (product visibility). */
  intersectionTargets: string[];
  /** Whether to enable Shopify cart.js polling. */
  enableCartPolling: boolean;
  /** Cart polling interval in ms. */
  cartPollIntervalMs: number;
}

export interface EventMapping {
  /** CSS selector to match. */
  selector: string;
  /** DOM event to listen for. */
  domEvent: string;
  /** AVA event category. */
  category: string;
  /** AVA event type. */
  eventType: string;
  /** Friction ID if applicable. */
  frictionId: string | null;
}

/**
 * Generate tracking hooks for a detected platform.
 */
export function generateHooks(platform: string): TrackingHooks {
  const selectors = getSelectorsForPlatform(platform);

  const observerConfig: ObserverConfig = {
    mutationTargets: [
      ...selectors.cartCount,
      ...selectors.cartTotal,
    ],
    clickTargets: [
      ...selectors.addToCart,
      ...selectors.checkoutButton,
    ],
    intersectionTargets: [
      ...selectors.productImage,
      ...selectors.reviewSection,
    ],
    enableCartPolling: platform === "shopify",
    cartPollIntervalMs: platform === "shopify" ? 10000 : 0,
  };

  const eventMappings: EventMapping[] = [
    // ATC click
    ...selectors.addToCart.map((sel) => ({
      selector: sel,
      domEvent: "click",
      category: "cart",
      eventType: "add_to_cart_click",
      frictionId: null,
    })),
    // Checkout click
    ...selectors.checkoutButton.map((sel) => ({
      selector: sel,
      domEvent: "click",
      category: "checkout",
      eventType: "checkout_initiated",
      frictionId: null,
    })),
    // Search input focus
    ...selectors.searchInput.map((sel) => ({
      selector: sel,
      domEvent: "focus",
      category: "search",
      eventType: "search_initiated",
      frictionId: null,
    })),
  ];

  return { platform, selectors, observerConfig, eventMappings };
}

function getSelectorsForPlatform(platform: string): SiteSelectors {
  switch (platform) {
    case "shopify":
      return SHOPIFY_SELECTORS;
    case "woocommerce":
      return WOOCOMMERCE_SELECTORS;
    case "magento":
      return MAGENTO_SELECTORS;
    default:
      return GENERIC_PLATFORM_SELECTORS;
  }
}
