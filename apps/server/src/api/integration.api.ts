import type { Request, Response } from "express";
import {
  AnalyzerRunRepo,
  IntegrationStatusRepo,
  SiteConfigRepo,
} from "@ava/db";
import { IntegrationActivateSchema } from "../validation/schemas.js";

const GO_LIVE_THRESHOLDS = {
  behaviorCoveragePct: 85,
  frictionCoveragePct: 80,
  avgConfidence: 0.75,
} as const;

/**
 * POST /api/integration/:siteId/activate
 * Activates a site as `active` or `limited_active`.
 */
export async function activateIntegration(req: Request, res: Response) {
  try {
    const parsed = IntegrationActivateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }

    const { siteId } = req.params;
    const payload = parsed.data;

    const site = await SiteConfigRepo.getSiteConfig(siteId);
    if (!site) {
      res.status(404).json({ error: "Site config not found" });
      return;
    }

    const latestRun = await AnalyzerRunRepo.getLatestAnalyzerRunBySite(siteId);

    const gates = {
      behaviorCoverage:
        (latestRun?.behaviorCoverage ?? 0) >= GO_LIVE_THRESHOLDS.behaviorCoveragePct,
      frictionCoverage:
        (latestRun?.frictionCoverage ?? 0) >= GO_LIVE_THRESHOLDS.frictionCoveragePct,
      avgConfidence:
        (latestRun?.avgConfidence ?? 0) >= GO_LIVE_THRESHOLDS.avgConfidence,
      criticalJourneys: payload.criticalJourneysPassed,
    };

    const canBeFullyActive =
      gates.behaviorCoverage &&
      gates.frictionCoverage &&
      gates.avgConfidence &&
      gates.criticalJourneys;

    let mode: "active" | "limited_active";
    if (payload.mode === "active") {
      if (!canBeFullyActive) {
        res.status(400).json({
          error:
            "Cannot activate in full mode. Thresholds not met; use limited_active or mode=auto.",
          gates,
          thresholds: GO_LIVE_THRESHOLDS,
        });
        return;
      }
      mode = "active";
    } else if (payload.mode === "limited_active") {
      mode = "limited_active";
    } else {
      mode = canBeFullyActive ? "active" : "limited_active";
    }

    if (latestRun && latestRun.status !== "failed") {
      await AnalyzerRunRepo.completeAnalyzerRun(latestRun.id, { phase: "activate" });
    }

    await Promise.all([
      SiteConfigRepo.setIntegrationStatus(siteId, mode, latestRun?.id ?? null),
      IntegrationStatusRepo.createIntegrationStatus({
        siteConfigId: siteId,
        analyzerRunId: latestRun?.id,
        status: mode,
        progress: mode === "active" ? 100 : 85,
        details: JSON.stringify({
          mode,
          gates,
          thresholds: GO_LIVE_THRESHOLDS,
          notes: payload.notes,
        }),
      }),
    ]);

    res.json({
      siteId,
      mode,
      gates,
      thresholds: GO_LIVE_THRESHOLDS,
      runId: latestRun?.id ?? null,
    });
  } catch (error) {
    console.error("[API] Activate integration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

