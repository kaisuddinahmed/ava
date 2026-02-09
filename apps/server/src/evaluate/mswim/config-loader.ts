import { ScoringConfigRepo } from "@ava/db";
import type { MSWIMConfig, SignalWeights, TierThresholds, GateConfig } from "@ava/shared";
import { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, DEFAULT_GATES } from "@ava/shared";

// In-memory cache with 60-second TTL
let cachedConfig: MSWIMConfig | null = null;
let cachedSiteUrl: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Load the active MSWIM config for a site. Falls back to global default,
 * then to hardcoded defaults. Cached for 60 seconds.
 */
export async function loadMSWIMConfig(siteUrl?: string): Promise<MSWIMConfig> {
  const now = Date.now();

  // Return cached if still valid and same site
  if (
    cachedConfig &&
    cachedSiteUrl === (siteUrl ?? null) &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedConfig;
  }

  try {
    const dbConfig = await ScoringConfigRepo.getActiveConfig(siteUrl);

    if (dbConfig) {
      const weights: SignalWeights = {
        intent: dbConfig.weightIntent,
        friction: dbConfig.weightFriction,
        clarity: dbConfig.weightClarity,
        receptivity: dbConfig.weightReceptivity,
        value: dbConfig.weightValue,
      };

      const thresholds: TierThresholds = {
        monitor: dbConfig.thresholdMonitor,
        passive: dbConfig.thresholdPassive,
        nudge: dbConfig.thresholdNudge,
        active: dbConfig.thresholdActive,
      };

      const gates: GateConfig = {
        minSessionAgeSec: dbConfig.minSessionAgeSec,
        maxActivePerSession: dbConfig.maxActivePerSession,
        maxNudgePerSession: dbConfig.maxNudgePerSession,
        maxNonPassivePerSession: dbConfig.maxNonPassivePerSession,
        cooldownAfterActiveSec: dbConfig.cooldownAfterActiveSec,
        cooldownAfterNudgeSec: dbConfig.cooldownAfterNudgeSec,
        cooldownAfterDismissSec: dbConfig.cooldownAfterDismissSec,
        dismissalsToSuppress: dbConfig.dismissalsToSuppress,
      };

      cachedConfig = { weights, thresholds, gates };
    } else {
      // Fallback to hardcoded defaults
      cachedConfig = {
        weights: { ...DEFAULT_WEIGHTS },
        thresholds: { ...DEFAULT_THRESHOLDS },
        gates: { ...DEFAULT_GATES },
      };
    }
  } catch (error) {
    console.error("[MSWIM] Failed to load config from DB, using defaults:", error);
    cachedConfig = {
      weights: { ...DEFAULT_WEIGHTS },
      thresholds: { ...DEFAULT_THRESHOLDS },
      gates: { ...DEFAULT_GATES },
    };
  }

  cachedSiteUrl = siteUrl ?? null;
  cacheTimestamp = now;
  return cachedConfig;
}

/**
 * Invalidate the cached config (e.g., after admin updates weights).
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}
