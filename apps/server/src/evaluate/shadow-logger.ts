// ============================================================================
// Shadow Logger — compares production vs shadow MSWIM results and persists
// the comparison to ShadowComparison table.
//
// This is fire-and-forget. Errors are caught and logged, never propagated.
// ============================================================================

import { ShadowComparisonRepo } from "@ava/db";
import type { MSWIMResult } from "@ava/shared";
import { tierToString } from "./mswim/tier-resolver.js";
import type { LLMOutput } from "./mswim/mswim.engine.js";
import { config } from "../config.js";

export interface ComparisonInput {
  sessionId: string;
  evaluationId: string;
  prodResult: MSWIMResult;
  shadowResult: MSWIMResult;
  syntheticHints: LLMOutput;
  pageType: string;
  eventCount: number;
  cartValue: number;
}

/**
 * Compare production and shadow MSWIM results, compute divergence metrics,
 * and persist the comparison.
 */
export async function logShadowComparison(input: ComparisonInput): Promise<void> {
  try {
    const {
      sessionId,
      evaluationId,
      prodResult,
      shadowResult,
      syntheticHints,
      pageType,
      eventCount,
      cartValue,
    } = input;

    const compositeDivergence = Math.abs(
      prodResult.composite_score - shadowResult.composite_score
    );
    const prodTierStr = tierToString(prodResult.tier);
    const shadowTierStr = tierToString(shadowResult.tier);
    const tierMatch = prodTierStr === shadowTierStr;
    const decisionMatch = prodResult.decision === shadowResult.decision;
    const gateOverrideMatch =
      (prodResult.gate_override ?? null) === (shadowResult.gate_override ?? null);

    if (config.shadow.logToConsole) {
      const symbol = tierMatch && decisionMatch ? "=" : "!";
      console.log(
        `[Shadow ${symbol}] session=${sessionId.slice(0, 8)} ` +
          `prod=${prodTierStr}/${prodResult.decision}(${prodResult.composite_score.toFixed(1)}) ` +
          `shadow=${shadowTierStr}/${shadowResult.decision}(${shadowResult.composite_score.toFixed(1)}) ` +
          `div=${compositeDivergence.toFixed(1)}`
      );
    }

    await ShadowComparisonRepo.createComparison({
      sessionId,
      evaluationId,

      prodIntentScore: prodResult.signals.intent,
      prodFrictionScore: prodResult.signals.friction,
      prodClarityScore: prodResult.signals.clarity,
      prodReceptivityScore: prodResult.signals.receptivity,
      prodValueScore: prodResult.signals.value,
      prodCompositeScore: prodResult.composite_score,
      prodTier: prodTierStr,
      prodDecision: prodResult.decision,
      prodGateOverride: prodResult.gate_override?.toString(),

      shadowIntentScore: shadowResult.signals.intent,
      shadowFrictionScore: shadowResult.signals.friction,
      shadowClarityScore: shadowResult.signals.clarity,
      shadowReceptivityScore: shadowResult.signals.receptivity,
      shadowValueScore: shadowResult.signals.value,
      shadowCompositeScore: shadowResult.composite_score,
      shadowTier: shadowTierStr,
      shadowDecision: shadowResult.decision,
      shadowGateOverride: shadowResult.gate_override?.toString(),

      compositeDivergence,
      tierMatch,
      decisionMatch,
      gateOverrideMatch,

      pageType,
      eventCount,
      cartValue,

      syntheticHints: JSON.stringify(syntheticHints),
    });
  } catch (error) {
    // Shadow logging must NEVER crash the production path
    console.error("[Shadow] Failed to log comparison:", error);
  }
}
