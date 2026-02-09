import { EvaluationRepo, SessionRepo } from "@ava/db";
import { buildContext } from "./context-builder.js";
import { evaluateWithLLM } from "./analyst.js";
import { runMSWIM, type SessionContext } from "./mswim/mswim.engine.js";
import type { InterventionRepo } from "@ava/db";
import { ScoreTier } from "@ava/shared";

export interface EvaluationResult {
  evaluationId: string;
  decision: "fire" | "suppress" | "queue";
  tier: string;
  compositeScore: number;
  interventionType: string | null;
  frictionIds: string[];
  narrative: string;
  signals: { intent: number; friction: number; clarity: number; receptivity: number; value: number };
  reasoning: string;
  recommendedAction: string;
}

/**
 * Run the full evaluation pipeline for a batch of events.
 */
export async function evaluateEventBatch(
  sessionId: string,
  eventIds: string[]
): Promise<EvaluationResult | null> {
  // 1. Build context
  const context = await buildContext(sessionId, eventIds);
  if (!context) {
    console.error(`[Evaluate] Session ${sessionId} not found`);
    return null;
  }

  // 2. Call LLM
  const llmOutput = await evaluateWithLLM(context);

  // 3. Build session context for MSWIM
  const session = await SessionRepo.getSession(sessionId);
  if (!session) return null;

  const sessionAgeSec = Math.floor(
    (Date.now() - session.startedAt.getTime()) / 1000
  );

  // Build MSWIM session context (simplified — in production, gather more data)
  const sessionCtx: SessionContext = {
    sessionId,
    siteUrl: session.siteUrl,
    sessionAgeSec,
    pageType: (context.newEvents[context.newEvents.length - 1]?.pageType as string) ?? "other",
    isLoggedIn: session.isLoggedIn,
    isRepeatVisitor: session.isRepeatVisitor,
    cartValue: session.cartValue,
    cartItemCount: session.cartItemCount,
    deviceType: session.deviceType,
    referrerType: session.referrerType,
    eventCount: context.newEvents.length,
    ruleBasedCorroboration: llmOutput.detected_frictions.length > 0,
    totalInterventionsFired: session.totalInterventionsFired,
    totalDismissals: session.totalDismissals,
    totalNudges: 0, // TODO: count from intervention history
    totalActive: 0, // TODO: count from intervention history
    totalNonPassive: session.totalInterventionsFired, // approximation
    secondsSinceLastIntervention: null, // TODO: compute from last intervention
    secondsSinceLastActive: null,
    secondsSinceLastNudge: null,
    secondsSinceLastDismissal: null,
    frictionIdsAlreadyIntervened: [], // TODO: gather from intervention history
    widgetOpenedVoluntarily: false, // TODO: track from events
    idleSeconds: 0, // TODO: compute from event timestamps
    hasTechnicalError: llmOutput.detected_frictions.some(
      (id) => id >= "F161" && id <= "F177"
    ),
    hasOutOfStock: llmOutput.detected_frictions.includes("F053"),
    hasShippingIssue: llmOutput.detected_frictions.some(
      (id) => id >= "F236" && id <= "F247"
    ),
    hasPaymentFailure: llmOutput.detected_frictions.some(
      (id) => id === "F096" || id === "F097"
    ),
    hasCheckoutTimeout: llmOutput.detected_frictions.includes("F112"),
    hasHelpSearch: llmOutput.detected_frictions.includes("F036"),
  };

  // 4. Run MSWIM engine
  const mswimResult = await runMSWIM(
    {
      intent: llmOutput.signals.intent,
      friction: llmOutput.signals.friction,
      clarity: llmOutput.signals.clarity,
      receptivity: llmOutput.signals.receptivity,
      value: llmOutput.signals.value,
      detectedFrictionIds: llmOutput.detected_frictions,
      recommendedAction: llmOutput.recommended_action,
    },
    sessionCtx
  );

  // 5. Map tier to intervention type
  const tierLabels: Record<ScoreTier, string> = {
    [ScoreTier.MONITOR]: "MONITOR",
    [ScoreTier.PASSIVE]: "PASSIVE",
    [ScoreTier.NUDGE]: "NUDGE",
    [ScoreTier.ACTIVE]: "ACTIVE",
    [ScoreTier.ESCALATE]: "ESCALATE",
  };
  const tierLabel = tierLabels[mswimResult.tier];

  const interventionTypeMap: Record<ScoreTier, string | null> = {
    [ScoreTier.MONITOR]: null,
    [ScoreTier.PASSIVE]: "passive",
    [ScoreTier.NUDGE]: "nudge",
    [ScoreTier.ACTIVE]: "active",
    [ScoreTier.ESCALATE]: "escalate",
  };
  const interventionType = interventionTypeMap[mswimResult.tier];

  // 6. Persist evaluation
  const evaluation = await EvaluationRepo.createEvaluation({
    sessionId,
    eventBatchIds: JSON.stringify(eventIds),
    narrative: llmOutput.narrative,
    frictionsFound: JSON.stringify(llmOutput.detected_frictions),
    intentScore: mswimResult.signals.intent,
    frictionScore: mswimResult.signals.friction,
    clarityScore: mswimResult.signals.clarity,
    receptivityScore: mswimResult.signals.receptivity,
    valueScore: mswimResult.signals.value,
    compositeScore: mswimResult.composite_score,
    weightsUsed: JSON.stringify(mswimResult.weights_used),
    tier: tierLabel,
    decision: mswimResult.decision,
    gateOverride: mswimResult.gate_override?.toString() ?? null,
    interventionType,
    reasoning: mswimResult.reasoning,
  });

  return {
    evaluationId: evaluation.id,
    decision: mswimResult.decision,
    tier: tierLabel,
    compositeScore: mswimResult.composite_score,
    interventionType,
    frictionIds: llmOutput.detected_frictions,
    narrative: llmOutput.narrative,
    signals: mswimResult.signals,
    reasoning: mswimResult.reasoning,
    recommendedAction: llmOutput.recommended_action,
  };
}
