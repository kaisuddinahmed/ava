import type { TierThresholds } from "@ava/shared";
import { ScoreTier } from "@ava/shared";

/**
 * Resolve composite score to a ScoreTier using configurable thresholds.
 */
export function resolveTier(
  compositeScore: number,
  thresholds: TierThresholds
): ScoreTier {
  if (compositeScore <= thresholds.monitor) return ScoreTier.MONITOR;
  if (compositeScore <= thresholds.passive) return ScoreTier.PASSIVE;
  if (compositeScore <= thresholds.nudge) return ScoreTier.NUDGE;
  if (compositeScore <= thresholds.active) return ScoreTier.ACTIVE;
  return ScoreTier.ESCALATE;
}

/**
 * Get the tier label string.
 */
export function tierToString(tier: ScoreTier): string {
  const labels: Record<ScoreTier, string> = {
    [ScoreTier.MONITOR]: "MONITOR",
    [ScoreTier.PASSIVE]: "PASSIVE",
    [ScoreTier.NUDGE]: "NUDGE",
    [ScoreTier.ACTIVE]: "ACTIVE",
    [ScoreTier.ESCALATE]: "ESCALATE",
  };
  return labels[tier];
}
