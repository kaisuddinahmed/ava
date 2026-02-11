import {
  RECEPTIVITY_BASE,
  RECEPTIVITY_DECREMENTS,
  RECEPTIVITY_INCREMENTS,
} from "@ava/shared";

/**
 * Compute receptivity primarily from server-side session state.
 * Starts at 80, adjusted by intervention history and user behavior.
 */
export function computeReceptivity(
  llmHint: number,
  ctx: {
    totalInterventionsFired: number;
    totalDismissals: number;
    secondsSinceLastIntervention: number | null;
    isMobile: boolean;
    widgetOpenedVoluntarily: boolean;
    idleSeconds: number;
  }
): number {
  let score = RECEPTIVITY_BASE; // 80

  // Decrements
  score -= ctx.totalInterventionsFired * RECEPTIVITY_DECREMENTS.perInterventionFired; // -15 each
  score -= ctx.totalDismissals * RECEPTIVITY_DECREMENTS.perDismissal; // -25 each

  if (
    ctx.secondsSinceLastIntervention !== null &&
    ctx.secondsSinceLastIntervention < 120
  ) {
    score -= RECEPTIVITY_DECREMENTS.recentIntervention; // -10
  }

  if (ctx.isMobile) {
    score -= RECEPTIVITY_DECREMENTS.mobile; // -5
  }

  // Increments
  if (ctx.widgetOpenedVoluntarily) {
    score += RECEPTIVITY_INCREMENTS.voluntaryWidgetOpen; // +10
  }

  if (ctx.idleSeconds > 60) {
    score += RECEPTIVITY_INCREMENTS.idleOver60s; // +10
  }

  // Blend in LLM hint (10% weight)
  score = score * 0.9 + llmHint * 0.1;

  return Math.max(0, Math.min(100, Math.round(score)));
}
