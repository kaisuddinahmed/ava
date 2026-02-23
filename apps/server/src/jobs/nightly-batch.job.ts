// ============================================================================
// Nightly Batch Job — orchestrates daily maintenance + analysis tasks.
// Each subtask is independent and catches its own errors.
// ============================================================================

import { DriftSnapshotRepo, JobRunRepo } from "@ava/db";
import type { NightlyBatchResult, SubtaskResult } from "@ava/shared";
import { getQualityStats } from "../training/training-quality.service.js";
import {
  loadTestSet,
  evaluate,
  type EvalReport,
} from "./eval-harness-lib.js";
import { runDriftCheck } from "./drift-detector.js";
import { checkAllRolloutsHealth } from "../rollout/rollout-health.service.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full nightly batch. Each subtask runs independently;
 * a failure in one does not block the others.
 */
export async function runNightlyBatch(): Promise<NightlyBatchResult> {
  const startedAt = new Date().toISOString();
  const subtasks: SubtaskResult[] = [];
  const errors: string[] = [];

  // 1. Aggregate training quality stats for last 24h
  subtasks.push(await runSubtask("training_quality_aggregate", aggregateTrainingQuality));

  // 2. Run eval harness against recent data
  subtasks.push(await runSubtask("eval_harness", runEvalHarnessCheck));

  // 3. Compute drift snapshots (24h and 7d windows)
  subtasks.push(await runSubtask("drift_snapshots", computeDriftSnapshots));

  // 4. Check drift alerts
  subtasks.push(await runSubtask("drift_alerts", checkDriftAlerts));

  // 5. Check rollout health and auto-promote/rollback
  subtasks.push(await runSubtask("rollout_health", checkRollouts));

  // 6. Generate daily summary
  subtasks.push(await runSubtask("daily_summary", generateDailySummary));

  // 7. Cleanup stale data
  subtasks.push(await runSubtask("cleanup", cleanupStaleData));

  // Collect errors
  for (const st of subtasks) {
    if (st.status === "failed" && st.error) {
      errors.push(`${st.name}: ${st.error}`);
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();

  return { startedAt, completedAt, durationMs, subtasks, errors };
}

// ---------------------------------------------------------------------------
// Subtask runner
// ---------------------------------------------------------------------------

async function runSubtask(
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<SubtaskResult> {
  const start = Date.now();
  try {
    const summary = await fn();
    return {
      name,
      status: "completed",
      durationMs: Date.now() - start,
      summary,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[NightlyBatch] Subtask ${name} failed:`, errorMsg);
    return {
      name,
      status: "failed",
      durationMs: Date.now() - start,
      summary: {},
      error: errorMsg,
    };
  }
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

/**
 * Aggregate training data quality stats for the last 24 hours.
 */
async function aggregateTrainingQuality(): Promise<Record<string, unknown>> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stats = await getQualityStats({
    since: yesterday.toISOString(),
  });

  return {
    period: "24h",
    total: stats.total,
    gradeDistribution: stats.gradeDistribution,
    avgQualityScore: stats.avgQualityScore,
  };
}

/**
 * Run eval harness against recent training data to detect regressions.
 */
async function runEvalHarnessCheck(): Promise<Record<string, unknown>> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const datapoints = await loadTestSet({
    testSize: 500,
    sampling: "stratified",
    outcomeFilter: "converted,dismissed,ignored",
    since: yesterday.toISOString(),
  });

  if (datapoints.length === 0) {
    return { skipped: true, reason: "No recent training data" };
  }

  const report: EvalReport = evaluate(
    datapoints,
    ["converted", "dismissed", "ignored"],
    { sampling: "stratified", since: yesterday.toISOString() },
  );

  return {
    totalEvaluated: report.overall.totalEvaluated,
    interventionEffectiveness: report.tierAccuracy.interventionEffectiveness,
    fireConversionRate: report.decisionMetrics.fireConversionRate,
    fireDismissalRate: report.decisionMetrics.fireDismissalRate,
    regressionDetected: report.regressionFlags.detected,
    regressionIssues: report.regressionFlags.issues,
  };
}

/**
 * Compute 24h and 7d drift snapshots from ShadowComparison + Intervention data.
 */
async function computeDriftSnapshots(): Promise<Record<string, unknown>> {
  // These are computed as part of the drift check
  return { note: "Drift snapshots computed in drift_alerts subtask" };
}

/**
 * Run drift detection and create alerts.
 */
async function checkDriftAlerts(): Promise<Record<string, unknown>> {
  const result = await runDriftCheck();

  return {
    snapshotsComputed: result.snapshots.length,
    alertsCreated: result.alerts.length,
    isHealthy: result.summary.isHealthy,
    activeAlertCount: result.summary.activeAlertCount,
    criticalAlertCount: result.summary.criticalAlertCount,
  };
}

/**
 * Check all active rollouts for health and auto-promote/rollback.
 */
async function checkRollouts(): Promise<Record<string, unknown>> {
  await checkAllRolloutsHealth();
  return { checked: true };
}

/**
 * Generate a daily summary (aggregated from other subtask results).
 */
async function generateDailySummary(): Promise<Record<string, unknown>> {
  const lastRun = await JobRunRepo.getLastRun("nightly_batch");
  return {
    previousRunAt: lastRun?.startedAt?.toISOString() ?? null,
    previousRunStatus: lastRun?.status ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Cleanup stale data: prune old drift snapshots and job runs.
 */
async function cleanupStaleData(): Promise<Record<string, unknown>> {
  const snapshotRetention = new Date(
    Date.now() - config.drift.snapshotRetentionDays * 24 * 60 * 60 * 1000,
  );
  const jobRunRetention = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ); // 30 days

  const [snapshotResult, jobRunResult] = await Promise.all([
    DriftSnapshotRepo.pruneOldSnapshots(snapshotRetention),
    JobRunRepo.pruneOldRuns(jobRunRetention),
  ]);

  return {
    prunedSnapshots: snapshotResult.count,
    prunedJobRuns: jobRunResult.count,
    snapshotRetentionDays: config.drift.snapshotRetentionDays,
  };
}
