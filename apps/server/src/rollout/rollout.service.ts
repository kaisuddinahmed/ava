// ============================================================================
// Rollout Service — staged config change lifecycle management.
// A rollout creates a linked experiment for traffic splitting.
// ============================================================================

import { ExperimentRepo, RolloutRepo, ScoringConfigRepo } from "@ava/db";
import type { RolloutStage, RolloutHealthCriteria, ExperimentVariant } from "@ava/shared";
import { invalidateConfigCache } from "../evaluate/mswim/config-loader.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateRolloutInput {
  name: string;
  siteUrl?: string | null;
  changeType: "scoring_config" | "eval_engine" | "gate_thresholds";
  newConfigId?: string;
  newEvalEngine?: "llm" | "fast" | "auto";
  configPayload?: string;
  stages: RolloutStage[];
  healthCriteria: RolloutHealthCriteria;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new rollout with a linked experiment for traffic splitting.
 */
export async function createRollout(input: CreateRolloutInput) {
  // Validate stages
  if (input.stages.length === 0) {
    throw new Error("Rollout requires at least one stage");
  }

  const finalStage = input.stages[input.stages.length - 1];
  if (finalStage.percent !== 100) {
    throw new Error("Final rollout stage must be 100%");
  }

  // Check for conflicting active rollout
  const activeRollout = await RolloutRepo.getActiveRollout(
    input.siteUrl ?? null,
  );
  if (activeRollout) {
    throw new Error(
      `Another rollout (${activeRollout.name}) is already active for this site`,
    );
  }

  // Build experiment variants: control (current config) vs treatment (new config)
  const firstStagePercent = input.stages[0].percent;
  const controlWeight = (100 - firstStagePercent) / 100;
  const treatmentWeight = firstStagePercent / 100;

  const variants: ExperimentVariant[] = [
    {
      id: "control",
      name: "control",
      weight: controlWeight,
      // Control uses the current active config (no override)
    },
    {
      id: "treatment",
      name: "treatment",
      weight: treatmentWeight,
      scoringConfigId: input.newConfigId,
      evalEngine: input.newEvalEngine,
    },
  ];

  // Create the linked experiment
  const experiment = await ExperimentRepo.createExperiment({
    name: `Rollout: ${input.name}`,
    description: `Auto-created experiment for rollout "${input.name}"`,
    siteUrl: input.siteUrl,
    trafficPercent: 100,
    variants: JSON.stringify(variants),
    primaryMetric: "conversion_rate",
  });

  // Create the rollout
  const rollout = await RolloutRepo.createRollout({
    name: input.name,
    siteUrl: input.siteUrl,
    changeType: input.changeType,
    newConfigId: input.newConfigId,
    newEvalEngine: input.newEvalEngine,
    configPayload: input.configPayload,
    stages: JSON.stringify(input.stages),
    healthCriteria: JSON.stringify(input.healthCriteria),
    experimentId: experiment.id,
  });

  return rollout;
}

/**
 * Start a rollout (pending → rolling).
 */
export async function startRollout(id: string) {
  const rollout = await RolloutRepo.getRollout(id);
  if (!rollout) throw new Error(`Rollout ${id} not found`);
  if (rollout.status !== "pending" && rollout.status !== "paused") {
    throw new Error(`Cannot start rollout in ${rollout.status} status`);
  }

  // Start the linked experiment
  if (rollout.experimentId) {
    await ExperimentRepo.startExperiment(rollout.experimentId);
  }

  return RolloutRepo.updateRollout(id, {
    status: "rolling",
    startedAt: new Date(),
  });
}

/**
 * Promote to the next stage. If final stage (100%), complete the rollout.
 */
export async function promoteStage(id: string) {
  const rollout = await RolloutRepo.getRollout(id);
  if (!rollout) throw new Error(`Rollout ${id} not found`);
  if (rollout.status !== "rolling") {
    throw new Error(`Cannot promote rollout in ${rollout.status} status`);
  }

  const stages = JSON.parse(rollout.stages) as RolloutStage[];
  const nextStageIdx = rollout.currentStage + 1;

  if (nextStageIdx >= stages.length) {
    // Final stage reached — complete the rollout
    return completeRollout(id, rollout);
  }

  // Advance to next stage
  const nextStage = stages[nextStageIdx];

  // Update experiment variant weights
  if (rollout.experimentId) {
    const experiment = await ExperimentRepo.getExperiment(
      rollout.experimentId,
    );
    if (experiment) {
      const variants = JSON.parse(
        experiment.variants,
      ) as ExperimentVariant[];
      const controlWeight = (100 - nextStage.percent) / 100;
      const treatmentWeight = nextStage.percent / 100;

      variants[0].weight = controlWeight;
      variants[1].weight = treatmentWeight;

      await ExperimentRepo.updateExperiment(rollout.experimentId, {
        variants: JSON.stringify(variants),
      });
    }
  }

  await RolloutRepo.advanceStage(id);
  return RolloutRepo.getRollout(id);
}

/**
 * Complete a rollout: activate the new config as default, end experiment.
 */
async function completeRollout(
  id: string,
  rollout: { experimentId: string | null; newConfigId: string | null; changeType: string },
) {
  // Activate the new scoring config as default
  if (rollout.newConfigId && rollout.changeType === "scoring_config") {
    await ScoringConfigRepo.activateConfig(rollout.newConfigId);
    invalidateConfigCache();
  }

  // End the linked experiment
  if (rollout.experimentId) {
    await ExperimentRepo.endExperiment(rollout.experimentId);
  }

  return RolloutRepo.completeRollout(id);
}

/**
 * Rollback a rollout.
 */
export async function rollbackRollout(id: string, reason: string) {
  const rollout = await RolloutRepo.getRollout(id);
  if (!rollout) throw new Error(`Rollout ${id} not found`);

  // End the linked experiment
  if (rollout.experimentId) {
    await ExperimentRepo.endExperiment(rollout.experimentId);
  }

  // Config stays at current (control) — no action needed
  return RolloutRepo.rollback(id, reason);
}

/**
 * Pause a rollout.
 */
export async function pauseRollout(id: string) {
  const rollout = await RolloutRepo.getRollout(id);
  if (!rollout) throw new Error(`Rollout ${id} not found`);
  if (rollout.status !== "rolling") {
    throw new Error(`Cannot pause rollout in ${rollout.status} status`);
  }

  // Pause the linked experiment
  if (rollout.experimentId) {
    await ExperimentRepo.updateExperiment(rollout.experimentId, {
      status: "paused",
    });
  }

  return RolloutRepo.updateRollout(id, { status: "paused" });
}

/**
 * List rollouts with optional filters.
 */
export async function listRollouts(options?: {
  status?: string;
  siteUrl?: string | null;
  limit?: number;
  offset?: number;
}) {
  return RolloutRepo.listRollouts(options);
}

/**
 * Get rollout details.
 */
export async function getRollout(id: string) {
  const rollout = await RolloutRepo.getRollout(id);
  if (!rollout) return null;

  return {
    ...rollout,
    parsedStages: JSON.parse(rollout.stages) as RolloutStage[],
    parsedHealthCriteria: JSON.parse(
      rollout.healthCriteria,
    ) as RolloutHealthCriteria,
  };
}
