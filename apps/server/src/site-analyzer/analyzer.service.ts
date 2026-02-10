import { SiteConfigRepo } from "@ava/db";
import { isShopify } from "./platform-detectors/shopify.js";
import { isWooCommerce } from "./platform-detectors/woocommerce.js";
import { isMagento } from "./platform-detectors/magento.js";
import { generateHooks, type TrackingHooks } from "./hook-generator.js";

/**
 * Site Analyzer Service — Detects e-commerce platform and generates tracking hooks.
 * Results are cached in the SiteConfig database table.
 */

export interface AnalysisResult {
  siteUrl: string;
  platform: string;
  trackingHooks: TrackingHooks;
  cached: boolean;
}

/**
 * Analyze a site URL to determine platform and generate tracking configuration.
 * Checks DB cache first, then detects platform from provided HTML.
 */
export async function analyzeSite(
  siteUrl: string,
  html?: string,
): Promise<AnalysisResult> {
  // Check cache first
  const cached = await SiteConfigRepo.getSiteConfigByUrl(siteUrl);
  if (cached) {
    const trackingConfig = JSON.parse(cached.trackingConfig) as TrackingHooks;
    return {
      siteUrl,
      platform: cached.platform,
      trackingHooks: trackingConfig,
      cached: true,
    };
  }

  // Detect platform
  const platform = detectPlatform(html || "");

  // Generate hooks
  const trackingHooks = generateHooks(platform);

  // Store in DB
  await SiteConfigRepo.upsertSiteConfig({
    siteUrl,
    platform,
    trackingConfig: JSON.stringify(trackingHooks),
  });

  return {
    siteUrl,
    platform,
    trackingHooks,
    cached: false,
  };
}

/**
 * Detect platform from HTML content.
 */
function detectPlatform(html: string): string {
  if (isShopify(html)) return "shopify";
  if (isWooCommerce(html)) return "woocommerce";
  if (isMagento(html)) return "magento";
  return "custom";
}

/**
 * Get tracking hooks for a site (from cache or defaults).
 */
export async function getTrackingHooks(siteUrl: string): Promise<TrackingHooks> {
  const cached = await SiteConfigRepo.getSiteConfigByUrl(siteUrl);
  if (cached) {
    return JSON.parse(cached.trackingConfig) as TrackingHooks;
  }
  // Return generic hooks if site hasn't been analyzed yet
  return generateHooks("custom");
}

/**
 * Force re-analysis of a site (clears cache).
 */
export async function reanalyzeSite(
  siteUrl: string,
  html: string,
): Promise<AnalysisResult> {
  const platform = detectPlatform(html);
  const trackingHooks = generateHooks(platform);

  await SiteConfigRepo.upsertSiteConfig({
    siteUrl,
    platform,
    trackingConfig: JSON.stringify(trackingHooks),
  });

  return {
    siteUrl,
    platform,
    trackingHooks,
    cached: false,
  };
}
