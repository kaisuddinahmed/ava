import {
  AnalyzerRunRepo,
  IntegrationStatusRepo,
  SiteConfigRepo,
} from "@ava/db";
import { analyzeSite, reanalyzeSite } from "../site-analyzer/analyzer.service.js";
import { runAnalyzerPipeline } from "./analyzer-runner.js";

export interface StartOnboardingInput {
  siteId?: string;
  siteUrl?: string;
  html?: string;
  forceReanalyze?: boolean;
  platform?: "shopify" | "woocommerce" | "magento" | "custom";
  trackingConfig?: Record<string, unknown>;
}

export interface StartOnboardingResult {
  runId: string;
  siteId: string;
  status: string;
  phase: string;
}

const runningRuns = new Set<string>();

export async function startOnboardingRun(
  payload: StartOnboardingInput,
): Promise<StartOnboardingResult> {
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
      platform: payload.platform ?? "custom",
      trackingConfig: JSON.stringify(payload.trackingConfig ?? {}),
    });
  }

  if (!siteConfig) {
    throw new Error("Site config not found");
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
        phase: "detect_platform",
        message: "Onboarding run started",
        startedAt: run.startedAt.toISOString(),
      }),
    }),
  ]);

  triggerAnalyzer(run.id);

  return {
    runId: run.id,
    siteId: siteConfig.id,
    status: run.status,
    phase: run.phase,
  };
}

function triggerAnalyzer(runId: string) {
  if (runningRuns.has(runId)) return;
  runningRuns.add(runId);

  void runAnalyzerPipeline(runId)
    .catch((error) => {
      console.error(`[Onboarding] Analyzer pipeline failed for ${runId}:`, error);
    })
    .finally(() => {
      runningRuns.delete(runId);
    });
}

