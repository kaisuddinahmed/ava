import type { Request, Response } from "express";
import {
  AnalyzerRunRepo,
  BehaviorMappingRepo,
  FrictionMappingRepo,
  IntegrationStatusRepo,
  SiteConfigRepo,
} from "@ava/db";
import { analyzeSite, reanalyzeSite } from "../site-analyzer/analyzer.service.js";
import {
  OnboardingResultsQuerySchema,
  OnboardingStartSchema,
} from "../validation/schemas.js";

const TOTAL_BEHAVIOR_PATTERNS = 614;
const TOTAL_FRICTION_SCENARIOS = 325;

/**
 * POST /api/onboarding/start
 * Starts onboarding for a site and creates an analyzer run record.
 */
export async function startOnboarding(req: Request, res: Response) {
  try {
    const parsed = OnboardingStartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }

    const payload = parsed.data;
    let siteConfig = payload.siteId
      ? await SiteConfigRepo.getSiteConfig(payload.siteId)
      : null;

    if (!siteConfig && payload.siteUrl) {
      if (payload.forceReanalyze && payload.html) {
        await reanalyzeSite(payload.siteUrl, payload.html);
      } else {
        await analyzeSite(payload.siteUrl, payload.html);
      }
      siteConfig = await SiteConfigRepo.getSiteConfigByUrl(payload.siteUrl);
    }

    // Fallback path: explicit upsert if analyzer did not produce a config.
    if (!siteConfig && payload.siteUrl) {
      siteConfig = await SiteConfigRepo.upsertSiteConfig({
        siteUrl: payload.siteUrl,
        platform: payload.platform,
        trackingConfig: JSON.stringify(payload.trackingConfig ?? {}),
      });
    }

    if (!siteConfig) {
      res.status(404).json({ error: "Site config not found" });
      return;
    }

    const run = await AnalyzerRunRepo.createAnalyzerRun({
      siteConfigId: siteConfig.id,
      status: "running",
      phase: "detect_platform",
    });

    await Promise.all([
      SiteConfigRepo.setIntegrationStatus(siteConfig.id, "analyzing", run.id),
      IntegrationStatusRepo.createIntegrationStatus({
        siteConfigId: siteConfig.id,
        analyzerRunId: run.id,
        status: "analyzing",
        progress: 10,
        details: JSON.stringify({
          message: "Onboarding run started",
          startedAt: run.startedAt.toISOString(),
        }),
      }),
    ]);

    res.status(201).json({
      runId: run.id,
      siteId: siteConfig.id,
      status: run.status,
      phase: run.phase,
    });
  } catch (error) {
    console.error("[API] Start onboarding error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/onboarding/:runId/status
 * Returns current onboarding status and high-level coverage metrics.
 */
export async function getOnboardingStatus(req: Request, res: Response) {
  try {
    const { runId } = req.params;
    const run = await AnalyzerRunRepo.getAnalyzerRun(runId);

    if (!run) {
      res.status(404).json({ error: "Analyzer run not found" });
      return;
    }

    const [
      latestStatus,
      behaviorMapped,
      frictionMapped,
    ] = await Promise.all([
      IntegrationStatusRepo.getLatestIntegrationStatusByRun(runId),
      BehaviorMappingRepo.countDistinctBehaviorPatterns(run.siteConfigId, run.id),
      FrictionMappingRepo.countDistinctFrictions(run.siteConfigId, run.id),
    ]);

    res.json({
      run: {
        id: run.id,
        status: run.status,
        phase: run.phase,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        behaviorCoverage: run.behaviorCoverage,
        frictionCoverage: run.frictionCoverage,
        avgConfidence: run.avgConfidence,
        errorMessage: run.errorMessage,
      },
      site: {
        id: run.siteConfig.id,
        siteUrl: run.siteConfig.siteUrl,
        platform: run.siteConfig.platform,
        integrationStatus: run.siteConfig.integrationStatus,
      },
      progress: latestStatus?.progress ?? 0,
      metrics: {
        behaviorMapped,
        behaviorTarget: TOTAL_BEHAVIOR_PATTERNS,
        frictionMapped,
        frictionTarget: TOTAL_FRICTION_SCENARIOS,
      },
      latestStatus,
    });
  } catch (error) {
    console.error("[API] Get onboarding status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/onboarding/:runId/results
 * Returns mapping outputs and coverage for a completed/active run.
 */
export async function getOnboardingResults(req: Request, res: Response) {
  try {
    const { runId } = req.params;
    const parsed = OnboardingResultsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }

    const { limit } = parsed.data;
    const run = await AnalyzerRunRepo.getAnalyzerRunWithMappings(runId, {
      behaviorLimit: limit,
      frictionLimit: limit,
    });

    if (!run) {
      res.status(404).json({ error: "Analyzer run not found" });
      return;
    }

    const [
      behaviorMapped,
      frictionMapped,
      latestStatus,
      lowConfidenceBehaviors,
      lowConfidenceFrictions,
    ] = await Promise.all([
      BehaviorMappingRepo.countDistinctBehaviorPatterns(run.siteConfigId, run.id),
      FrictionMappingRepo.countDistinctFrictions(run.siteConfigId, run.id),
      IntegrationStatusRepo.getLatestIntegrationStatusByRun(runId),
      BehaviorMappingRepo.listLowConfidenceBehaviorMappings(run.siteConfigId, 0.75, 20),
      FrictionMappingRepo.listLowConfidenceFrictionMappings(run.siteConfigId, 0.75, 20),
    ]);

    res.json({
      run: {
        id: run.id,
        status: run.status,
        phase: run.phase,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        behaviorCoverage: run.behaviorCoverage,
        frictionCoverage: run.frictionCoverage,
        avgConfidence: run.avgConfidence,
        summary: run.summary,
      },
      site: {
        id: run.siteConfig.id,
        siteUrl: run.siteConfig.siteUrl,
        platform: run.siteConfig.platform,
        integrationStatus: run.siteConfig.integrationStatus,
      },
      coverage: {
        behaviorMapped,
        behaviorTarget: TOTAL_BEHAVIOR_PATTERNS,
        behaviorMissing: Math.max(0, TOTAL_BEHAVIOR_PATTERNS - behaviorMapped),
        frictionMapped,
        frictionTarget: TOTAL_FRICTION_SCENARIOS,
        frictionMissing: Math.max(0, TOTAL_FRICTION_SCENARIOS - frictionMapped),
      },
      mappings: {
        behavior: run.behaviorMappings,
        friction: run.frictionMappings,
      },
      feedback: {
        lowConfidenceBehaviorMappings: lowConfidenceBehaviors,
        lowConfidenceFrictionMappings: lowConfidenceFrictions,
      },
      latestStatus,
    });
  } catch (error) {
    console.error("[API] Get onboarding results error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

