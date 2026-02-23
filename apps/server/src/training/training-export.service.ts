// ============================================================================
// Training Export Service — exports TrainingDatapoints as JSONL or CSV
// Supports filtering, formatting for fine-tuning, and summary stats.
// ============================================================================

import { TrainingDatapointRepo } from "@ava/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportFilters {
  outcome?: string;
  tier?: string;
  siteUrl?: string;
  frictionId?: string;
  interventionType?: string;
  since?: string; // ISO date
  until?: string; // ISO date
  limit?: number;
  offset?: number;
}

export interface ExportStats {
  totalDatapoints: number;
  filteredCount: number;
  outcomeDistribution: Record<string, number>;
  tierDistribution: Record<string, number>;
  avgCompositeScore: number;
  avgOutcomeDelayMs: number | null;
  dateRange: { earliest: string | null; latest: string | null };
}

/**
 * Fine-tuning record format — what gets written to JSONL.
 * Structured as input/output pairs for supervised fine-tuning.
 */
export interface FineTuningRecord {
  // -- Input context (what the model sees) --
  input: {
    sessionContext: {
      deviceType: string;
      referrerType: string;
      isLoggedIn: boolean;
      isRepeatVisitor: boolean;
      cartValue: number;
      cartItemCount: number;
      sessionAgeSec: number;
      totalInterventionsFired: number;
      totalDismissals: number;
      totalConversions: number;
    };
    events: unknown[]; // parsed rawEventData
    pageType: string;
  };

  // -- Model output (what we want the model to produce) --
  output: {
    narrative: string;
    frictionsFound: string[];
    scores: {
      intent: number;
      friction: number;
      clarity: number;
      receptivity: number;
      value: number;
    };
  };

  // -- Decision & outcome (labels for reward modeling) --
  decision: {
    compositeScore: number;
    tier: string;
    decision: string;
    gateOverride: string | null;
    interventionType: string;
    actionCode: string;
    frictionId: string;
  };

  outcome: {
    label: string; // dismissed | converted | ignored
    conversionAction: string | null;
    outcomeDelayMs: number | null;
  };

  // -- Metadata --
  meta: {
    datapointId: string;
    sessionId: string;
    evaluationId: string;
    interventionId: string;
    siteUrl: string;
    createdAt: string;
    weightsUsed: unknown;
    mswimScoreAtFire: number;
    tierAtFire: string;
  };
}

// ---------------------------------------------------------------------------
// Export functions
// ---------------------------------------------------------------------------

/**
 * Export training datapoints as an array of FineTuningRecords.
 */
export async function exportAsRecords(
  filters: ExportFilters
): Promise<FineTuningRecord[]> {
  const datapoints = await TrainingDatapointRepo.listDatapoints({
    outcome: filters.outcome,
    tier: filters.tier,
    siteUrl: filters.siteUrl,
    frictionId: filters.frictionId,
    interventionType: filters.interventionType,
    since: filters.since ? new Date(filters.since) : undefined,
    until: filters.until ? new Date(filters.until) : undefined,
    limit: filters.limit ?? 1000,
    offset: filters.offset ?? 0,
  });

  return datapoints.map(toFineTuningRecord);
}

/**
 * Export as JSONL string (one JSON object per line).
 * Standard format for fine-tuning pipelines.
 */
export async function exportAsJsonl(filters: ExportFilters): Promise<string> {
  const records = await exportAsRecords(filters);
  return records.map((r) => JSON.stringify(r)).join("\n");
}

/**
 * Export as CSV string.
 * Flattened format for spreadsheet analysis / quick inspection.
 */
export async function exportAsCsv(filters: ExportFilters): Promise<string> {
  const datapoints = await TrainingDatapointRepo.listDatapoints({
    outcome: filters.outcome,
    tier: filters.tier,
    siteUrl: filters.siteUrl,
    frictionId: filters.frictionId,
    interventionType: filters.interventionType,
    since: filters.since ? new Date(filters.since) : undefined,
    until: filters.until ? new Date(filters.until) : undefined,
    limit: filters.limit ?? 1000,
    offset: filters.offset ?? 0,
  });

  if (datapoints.length === 0) return "";

  const headers = [
    "id",
    "createdAt",
    "sessionId",
    "siteUrl",
    "deviceType",
    "referrerType",
    "isLoggedIn",
    "isRepeatVisitor",
    "cartValue",
    "cartItemCount",
    "sessionAgeSec",
    "pageType",
    "intentScore",
    "frictionScore",
    "clarityScore",
    "receptivityScore",
    "valueScore",
    "compositeScore",
    "tier",
    "decision",
    "gateOverride",
    "interventionType",
    "actionCode",
    "frictionId",
    "mswimScoreAtFire",
    "tierAtFire",
    "outcome",
    "conversionAction",
    "outcomeDelayMs",
    "totalInterventionsFired",
    "totalDismissals",
    "totalConversions",
    "frictionsFound",
  ];

  const rows = datapoints.map((dp) =>
    [
      dp.id,
      dp.createdAt.toISOString(),
      dp.sessionId,
      csvEscape(dp.siteUrl),
      dp.deviceType,
      dp.referrerType,
      dp.isLoggedIn,
      dp.isRepeatVisitor,
      dp.cartValue,
      dp.cartItemCount,
      dp.sessionAgeSec,
      dp.pageType,
      dp.intentScore,
      dp.frictionScore,
      dp.clarityScore,
      dp.receptivityScore,
      dp.valueScore,
      dp.compositeScore,
      dp.tier,
      dp.decision,
      dp.gateOverride ?? "",
      dp.interventionType,
      dp.actionCode,
      dp.frictionId,
      dp.mswimScoreAtFire,
      dp.tierAtFire,
      dp.outcome,
      dp.conversionAction ?? "",
      dp.outcomeDelayMs ?? "",
      dp.totalInterventionsFired,
      dp.totalDismissals,
      dp.totalConversions,
      csvEscape(dp.frictionsFound),
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Get summary statistics for the training dataset (with optional filters).
 */
export async function getExportStats(
  filters: ExportFilters
): Promise<ExportStats> {
  const [totalDatapoints, datapoints] = await Promise.all([
    TrainingDatapointRepo.countDatapoints(),
    TrainingDatapointRepo.listDatapoints({
      outcome: filters.outcome,
      tier: filters.tier,
      siteUrl: filters.siteUrl,
      frictionId: filters.frictionId,
      interventionType: filters.interventionType,
      since: filters.since ? new Date(filters.since) : undefined,
      until: filters.until ? new Date(filters.until) : undefined,
      limit: filters.limit ?? 10000,
      offset: 0,
    }),
  ]);

  const outcomeDistribution: Record<string, number> = {};
  const tierDistribution: Record<string, number> = {};
  let compositeSum = 0;
  let delaySum = 0;
  let delayCount = 0;
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const dp of datapoints) {
    outcomeDistribution[dp.outcome] =
      (outcomeDistribution[dp.outcome] || 0) + 1;
    tierDistribution[dp.tier] = (tierDistribution[dp.tier] || 0) + 1;
    compositeSum += dp.compositeScore;

    if (dp.outcomeDelayMs != null) {
      delaySum += dp.outcomeDelayMs;
      delayCount++;
    }

    if (!earliest || dp.createdAt < earliest) earliest = dp.createdAt;
    if (!latest || dp.createdAt > latest) latest = dp.createdAt;
  }

  return {
    totalDatapoints,
    filteredCount: datapoints.length,
    outcomeDistribution,
    tierDistribution,
    avgCompositeScore:
      datapoints.length > 0
        ? Math.round((compositeSum / datapoints.length) * 100) / 100
        : 0,
    avgOutcomeDelayMs:
      delayCount > 0 ? Math.round(delaySum / delayCount) : null,
    dateRange: {
      earliest: earliest?.toISOString() ?? null,
      latest: latest?.toISOString() ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toFineTuningRecord(dp: {
  id: string;
  createdAt: Date;
  sessionId: string;
  evaluationId: string;
  interventionId: string;
  siteUrl: string;
  deviceType: string;
  referrerType: string;
  isLoggedIn: boolean;
  isRepeatVisitor: boolean;
  cartValue: number;
  cartItemCount: number;
  sessionAgeSec: number;
  totalInterventionsFired: number;
  totalDismissals: number;
  totalConversions: number;
  rawEventData: string;
  pageType: string;
  narrative: string;
  frictionsFound: string;
  intentScore: number;
  frictionScore: number;
  clarityScore: number;
  receptivityScore: number;
  valueScore: number;
  compositeScore: number;
  weightsUsed: string;
  tier: string;
  decision: string;
  gateOverride: string | null;
  interventionType: string;
  actionCode: string;
  frictionId: string;
  mswimScoreAtFire: number;
  tierAtFire: string;
  outcome: string;
  conversionAction: string | null;
  outcomeDelayMs: number | null;
}): FineTuningRecord {
  let events: unknown[] = [];
  try {
    events = JSON.parse(dp.rawEventData);
  } catch {
    // keep empty
  }

  let frictionsFound: string[] = [];
  try {
    frictionsFound = JSON.parse(dp.frictionsFound);
  } catch {
    // keep empty
  }

  let weightsUsed: unknown = {};
  try {
    weightsUsed = JSON.parse(dp.weightsUsed);
  } catch {
    // keep empty
  }

  return {
    input: {
      sessionContext: {
        deviceType: dp.deviceType,
        referrerType: dp.referrerType,
        isLoggedIn: dp.isLoggedIn,
        isRepeatVisitor: dp.isRepeatVisitor,
        cartValue: dp.cartValue,
        cartItemCount: dp.cartItemCount,
        sessionAgeSec: dp.sessionAgeSec,
        totalInterventionsFired: dp.totalInterventionsFired,
        totalDismissals: dp.totalDismissals,
        totalConversions: dp.totalConversions,
      },
      events,
      pageType: dp.pageType,
    },
    output: {
      narrative: dp.narrative,
      frictionsFound,
      scores: {
        intent: dp.intentScore,
        friction: dp.frictionScore,
        clarity: dp.clarityScore,
        receptivity: dp.receptivityScore,
        value: dp.valueScore,
      },
    },
    decision: {
      compositeScore: dp.compositeScore,
      tier: dp.tier,
      decision: dp.decision,
      gateOverride: dp.gateOverride,
      interventionType: dp.interventionType,
      actionCode: dp.actionCode,
      frictionId: dp.frictionId,
    },
    outcome: {
      label: dp.outcome,
      conversionAction: dp.conversionAction,
      outcomeDelayMs: dp.outcomeDelayMs,
    },
    meta: {
      datapointId: dp.id,
      sessionId: dp.sessionId,
      evaluationId: dp.evaluationId,
      interventionId: dp.interventionId,
      siteUrl: dp.siteUrl,
      createdAt: dp.createdAt.toISOString(),
      weightsUsed,
      mswimScoreAtFire: dp.mswimScoreAtFire,
      tierAtFire: dp.tierAtFire,
    },
  };
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
