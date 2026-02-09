import { InterventionRepo, SessionRepo } from "@ava/db";
import type { DecisionOutput } from "../evaluate/decision-engine.js";
import type { EvaluationResult } from "../evaluate/evaluate.service.js";
import { buildPayload } from "./payload-builder.js";

export interface InterventionOutput {
  interventionId: string;
  sessionId: string;
  type: string;
  actionCode: string;
  frictionId: string;
  payload: Record<string, unknown>;
  mswimScore: number;
  tier: string;
}

/**
 * Handle a fire decision: build payload, persist intervention, update session.
 */
export async function handleDecision(
  sessionId: string,
  decision: DecisionOutput,
  evaluation: EvaluationResult
): Promise<InterventionOutput | null> {
  if (decision.decision !== "fire" || !decision.type) return null;

  // Build the intervention payload
  const payload = buildPayload(
    decision.type,
    decision.actionCode,
    decision.frictionId,
    evaluation
  );

  // Persist intervention
  const intervention = await InterventionRepo.createIntervention({
    sessionId,
    evaluationId: decision.evaluationId,
    type: decision.type,
    actionCode: decision.actionCode,
    frictionId: decision.frictionId,
    payload: JSON.stringify(payload),
    mswimScoreAtFire: evaluation.compositeScore,
    tierAtFire: evaluation.tier,
  });

  // Update session counters
  await SessionRepo.incrementInterventionsFired(sessionId);

  return {
    interventionId: intervention.id,
    sessionId,
    type: decision.type,
    actionCode: decision.actionCode,
    frictionId: decision.frictionId,
    payload,
    mswimScore: evaluation.compositeScore,
    tier: evaluation.tier,
  };
}

/**
 * Record the outcome of an intervention (delivered, dismissed, converted, ignored).
 */
export async function recordInterventionOutcome(
  interventionId: string,
  status: "delivered" | "dismissed" | "converted" | "ignored",
  conversionAction?: string
) {
  const intervention = await InterventionRepo.recordOutcome(interventionId, {
    status,
    conversionAction,
  });

  // Update session counters
  if (status === "dismissed") {
    await SessionRepo.incrementDismissals(intervention.sessionId);
  } else if (status === "converted") {
    await SessionRepo.incrementConversions(intervention.sessionId);
  }

  return intervention;
}
