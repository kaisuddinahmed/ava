// ============================================================================
// MSWIM Pure Score Calculator
// ============================================================================

import type {
  MSWIMSignals,
  SignalWeights,
  TierThresholds,
} from "../types/mswim.js";
import { ScoreTier } from "../types/mswim.js";
import { clamp } from "./helpers.js";

/**
 * Compute the MSWIM composite score from 5 signals and their weights.
 *
 * Formula:
 *   composite = (intent × w_intent) + (friction × w_friction) + (clarity × w_clarity)
 *               + (receptivity × w_receptivity) + (value × w_value)
 *
 * All signals are 0–100. Weights must sum to 1.0.
 * Result is clamped to 0–100.
 */
export function computeComposite(
  signals: MSWIMSignals,
  weights: SignalWeights,
): number {
  const raw =
    signals.intent * weights.intent +
    signals.friction * weights.friction +
    signals.clarity * weights.clarity +
    signals.receptivity * weights.receptivity +
    signals.value * weights.value;

  return clamp(Math.round(raw * 100) / 100, 0, 100);
}

/**
 * Resolve the composite score to a tier using the configured thresholds.
 */
export function resolveTier(
  composite: number,
  thresholds: TierThresholds,
): ScoreTier {
  if (composite <= thresholds.monitor) return ScoreTier.MONITOR;
  if (composite <= thresholds.passive) return ScoreTier.PASSIVE;
  if (composite <= thresholds.nudge) return ScoreTier.NUDGE;
  if (composite <= thresholds.active) return ScoreTier.ACTIVE;
  return ScoreTier.ESCALATE;
}

/**
 * Validate that signal weights sum to approximately 1.0.
 */
export function validateWeights(weights: SignalWeights): boolean {
  const sum =
    weights.intent +
    weights.friction +
    weights.clarity +
    weights.receptivity +
    weights.value;
  return Math.abs(sum - 1.0) < 0.001;
}

/**
 * Clamp all signal values to 0–100.
 */
export function normalizeSignals(signals: MSWIMSignals): MSWIMSignals {
  return {
    intent: clamp(Math.round(signals.intent), 0, 100),
    friction: clamp(Math.round(signals.friction), 0, 100),
    clarity: clamp(Math.round(signals.clarity), 0, 100),
    receptivity: clamp(Math.round(signals.receptivity), 0, 100),
    value: clamp(Math.round(signals.value), 0, 100),
  };
}
