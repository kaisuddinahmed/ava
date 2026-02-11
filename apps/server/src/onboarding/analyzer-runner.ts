import {
  AnalyzerRunRepo,
  IntegrationStatusRepo,
  SiteConfigRepo,
} from "@ava/db";
import type { TrackingHooks } from "../site-analyzer/hook-generator.js";
import { generateHooks } from "../site-analyzer/hook-generator.js";
import { mapBehaviorsForRun } from "./behavior-mapper.js";
import { mapFrictionsForRun } from "./friction-mapper.js";
import {
  FULL_ACTIVE_THRESHOLDS,
  verifyIntegrationReadiness,
} from "./integration-verifier.js";
import { broadcastOnboardingProgress } from "./progress-broadcaster.js";

export async function runAnalyzerPipeline(analyzerRunId: string): Promise<void> {
  const run = await AnalyzerRunRepo.getAnalyzerRun(analyzerRunId);
  if (!run) throw new Error(`Analyzer run ${analyzerRunId} not found`);

  const siteConfigId = run.siteConfigId;
  const siteUrl = run.siteConfig.siteUrl;
  const platform = run.siteConfig.platform;
  const trackingHooks = parseTrackingHooks(run.siteConfig.trackingConfig, platform);

  try {
    await AnalyzerRunRepo.updateAnalyzerRun(analyzerRunId, {
      status: "running",
      phase: "detect_platform",
    });

    await pushProgress({
      siteConfigId,
      analyzerRunId,
      status: "analyzing",
      progress: 15,
      details: { phase: "detect_platform", siteUrl, platform },
    });

    await AnalyzerRunRepo.updateAnalyzerRun(analyzerRunId, {
      status: "running",
      phase: "map_behaviors",
    });
    await pushProgress({
      siteConfigId,
      analyzerRunId,
      status: "analyzing",
      progress: 30,
      details: { phase: "map_behaviors", message: "Mapping behavior patterns" },
    });

    const behaviorResult = await mapBehaviorsForRun({
      analyzerRunId,
      siteConfigId,
      platform,
      trackingHooks,
    });

    await AnalyzerRunRepo.updateAnalyzerRun(analyzerRunId, {
      phase: "map_frictions",
      avgConfidence: behaviorResult.avgConfidence,
    });
    await pushProgress({
      siteConfigId,
      analyzerRunId,
      status: "mapped",
      progress: 55,
      details: {
        phase: "map_frictions",
        behavior: behaviorResult,
      },
    });

    const frictionResult = await mapFrictionsForRun({
      analyzerRunId,
      siteConfigId,
      platform,
      trackingHooks,
    });

    await AnalyzerRunRepo.updateAnalyzerRun(analyzerRunId, {
      phase: "verify",
      avgConfidence: (behaviorResult.avgConfidence + frictionResult.avgConfidence) / 2,
    });
    await pushProgress({
      siteConfigId,
      analyzerRunId,
      status: "mapped",
      progress: 75,
      details: {
        phase: "verify",
        friction: frictionResult,
      },
    });

    const verification = await verifyIntegrationReadiness({
      analyzerRunId,
      siteConfigId,
      trackingHooks,
    });

    const summary = JSON.stringify({
      thresholds: FULL_ACTIVE_THRESHOLDS,
      verification,
      behavior: behaviorResult,
      friction: frictionResult,
      generatedAt: new Date().toISOString(),
    });

    await AnalyzerRunRepo.completeAnalyzerRun(analyzerRunId, {
      phase: "verify",
      behaviorCoverage: verification.behaviorCoveragePct,
      frictionCoverage: verification.frictionCoveragePct,
      avgConfidence: verification.avgConfidence,
      summary,
    });

    await SiteConfigRepo.setIntegrationStatus(siteConfigId, "verified", analyzerRunId);
    await pushProgress({
      siteConfigId,
      analyzerRunId,
      status: "verified",
      progress: 90,
      details: {
        phase: "verify",
        verification,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await AnalyzerRunRepo.failAnalyzerRun(analyzerRunId, message);
    await SiteConfigRepo.setIntegrationStatus(siteConfigId, "failed", analyzerRunId);
    await pushProgress({
      siteConfigId,
      analyzerRunId,
      status: "failed",
      progress: 100,
      details: {
        error: message,
      },
    });
    throw error;
  }
}

function parseTrackingHooks(trackingConfig: string, platform: string): TrackingHooks {
  try {
    const parsed = JSON.parse(trackingConfig) as TrackingHooks;
    if (parsed && parsed.selectors && parsed.eventMappings) return parsed;
  } catch {
    // Fallback below.
  }
  return generateHooks(platform);
}

async function pushProgress(input: {
  siteConfigId: string;
  analyzerRunId: string;
  status: string;
  progress: number;
  details: Record<string, unknown>;
}) {
  await IntegrationStatusRepo.createIntegrationStatus({
    siteConfigId: input.siteConfigId,
    analyzerRunId: input.analyzerRunId,
    status: input.status,
    progress: input.progress,
    details: JSON.stringify(input.details),
  });

  broadcastOnboardingProgress({
    siteConfigId: input.siteConfigId,
    analyzerRunId: input.analyzerRunId,
    status: input.status,
    progress: input.progress,
    details: input.details,
  });
}
