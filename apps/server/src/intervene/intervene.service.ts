import { InterventionRepo, SessionRepo, SiteConfigRepo } from "@ava/db";
import type { DecisionOutput } from "../evaluate/decision-engine.js";
import type { EvaluationResult } from "../evaluate/evaluate.service.js";
import { getAction } from "./action-registry.js";
import { buildPayload } from "./payload-builder.js";
import { captureTrainingDatapoint } from "../training/training-collector.service.js";

export interface InterventionOutput {
  interventionId: string;
  sessionId: string;
  type: string;
  actionCode: string;
  frictionId: string;
  payload: Record<string, unknown>;
  mswimScore: number;
  tier: string;
  runtimeMode: "active" | "limited_active";
  guardApplied: boolean;
  guardReason?: string;
  originalType?: string;
  originalActionCode?: string;
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

  const runtimeMode = await resolveRuntimeMode(sessionId);
  const guardResult = applyRevenueFirstGuard(decision, runtimeMode);
  const effectiveDecision = guardResult.decision;

  // Build the intervention payload
  const payload = buildPayload(
    effectiveDecision.type ?? "passive",
    effectiveDecision.actionCode,
    effectiveDecision.frictionId,
    evaluation
  );

  // Persist intervention
  const intervention = await InterventionRepo.createIntervention({
    sessionId,
    evaluationId: effectiveDecision.evaluationId,
    type: effectiveDecision.type ?? "passive",
    actionCode: effectiveDecision.actionCode,
    frictionId: effectiveDecision.frictionId,
    payload: JSON.stringify(payload),
    mswimScoreAtFire: evaluation.compositeScore,
    tierAtFire: evaluation.tier,
  });

  // Update session counters
  await SessionRepo.incrementInterventionsFired(sessionId);

  return {
    interventionId: intervention.id,
    sessionId,
    type: effectiveDecision.type ?? "passive",
    actionCode: effectiveDecision.actionCode,
    frictionId: effectiveDecision.frictionId,
    payload,
    mswimScore: evaluation.compositeScore,
    tier: evaluation.tier,
    runtimeMode,
    guardApplied: guardResult.applied,
    guardReason: guardResult.reason,
    originalType: guardResult.applied ? decision.type : undefined,
    originalActionCode: guardResult.applied ? decision.actionCode : undefined,
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

  // Capture training datapoint on terminal outcomes (non-blocking)
  captureTrainingDatapoint(interventionId, status).catch((error) => {
    console.error("[Intervene] Training datapoint capture failed:", error);
  });

  return intervention;
}

type RuntimeMode = "active" | "limited_active";

async function resolveRuntimeMode(sessionId: string): Promise<RuntimeMode> {
  const session = await SessionRepo.getSession(sessionId);
  if (!session) return "limited_active";

  const siteConfig = await SiteConfigRepo.getSiteConfigByUrl(session.siteUrl);
  if (!siteConfig) return "limited_active";

  return siteConfig.integrationStatus === "active" ? "active" : "limited_active";
}

function applyRevenueFirstGuard(
  decision: DecisionOutput,
  runtimeMode: RuntimeMode
): {
  decision: DecisionOutput;
  applied: boolean;
  reason?: string;
} {
  if (runtimeMode !== "limited_active") {
    return { decision, applied: false };
  }

  if (decision.decision !== "fire" || !decision.type) {
    return { decision, applied: false };
  }

  if (decision.type === "passive" || decision.type === "nudge") {
    const safeActionCode = enforceLowRiskAction(decision.type, decision.actionCode);
    if (safeActionCode === decision.actionCode) {
      return { decision, applied: false };
    }
    return {
      decision: { ...decision, actionCode: safeActionCode },
      applied: true,
      reason: "limited_active_low_risk_action_adjustment",
    };
  }

  return {
    decision: {
      ...decision,
      type: "nudge",
      actionCode: "nudge_suggestion",
    },
    applied: true,
    reason: `limited_active_downgrade_${decision.type}_to_nudge`,
  };
}

function enforceLowRiskAction(type: "passive" | "nudge", actionCode: string): string {
  const action = getAction(actionCode);
  if (action && action.tier === type) {
    return actionCode;
  }

  return type === "passive" ? "passive_info_adjust" : "nudge_suggestion";
}
