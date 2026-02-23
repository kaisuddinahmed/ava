// ============================================================================
// Eval Harness Library — extracted evaluation logic used by both
// scripts/eval-harness.ts (CLI) and nightly-batch.job.ts (scheduled)
// ============================================================================

import { TrainingDatapointRepo } from "@ava/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalDatapoint {
  id: string;
  outcome: string;
  tier: string;
  decision: string;
  compositeScore: number;
  intentScore: number;
  frictionScore: number;
  clarityScore: number;
  receptivityScore: number;
  valueScore: number;
  gateOverride: string | null;
  interventionType: string;
  frictionId: string;
  frictionsFound: string[];
  deviceType: string;
  pageType: string;
  cartValue: number;
  sessionAgeSec: number;
}

export interface ConfusionMatrix {
  matrix: Record<string, Record<string, number>>;
  labels: { rows: string[]; cols: string[] };
}

export interface MetricsPerClass {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface EvalReport {
  metadata: {
    timestamp: string;
    testSize: number;
    sampling: string;
    outcomeFilter: string[];
    siteFilter: string;
    dateRange: { since: string; until: string };
  };
  overall: {
    totalEvaluated: number;
    outcomeDistribution: Record<string, number>;
    tierDistribution: Record<string, number>;
  };
  tierAccuracy: {
    interventionEffectiveness: number;
    suppressionAccuracy: number;
    confusionMatrix: ConfusionMatrix;
  };
  decisionMetrics: {
    fireConversionRate: number;
    fireDismissalRate: number;
    suppressConversionRate: number;
    perOutcome: Record<string, MetricsPerClass>;
  };
  signalCalibration: {
    byOutcome: Record<
      string,
      {
        avgIntent: number;
        avgFriction: number;
        avgClarity: number;
        avgReceptivity: number;
        avgValue: number;
        avgComposite: number;
        count: number;
      }
    >;
  };
  segmentAnalysis: {
    byDevice: Record<string, { total: number; converted: number; rate: number }>;
    byPage: Record<string, { total: number; converted: number; rate: number }>;
    byTier: Record<
      string,
      { total: number; converted: number; dismissed: number; ignored: number }
    >;
  };
  regressionFlags: {
    detected: boolean;
    issues: string[];
  };
}

export interface EvalHarnessOptions {
  testSize: number;
  sampling: "random" | "stratified";
  outcomeFilter: string;
  siteFilter?: string;
  since?: string;
  until?: string;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export async function loadTestSet(
  options: EvalHarnessOptions,
): Promise<EvalDatapoint[]> {
  const validOutcomes = options.outcomeFilter.split(",").map((o) => o.trim());

  const listOptions: {
    limit: number;
    siteUrl?: string;
    since?: Date;
    until?: Date;
  } = { limit: options.testSize * 3 };

  if (options.siteFilter) listOptions.siteUrl = options.siteFilter;
  if (options.since) listOptions.since = new Date(options.since);
  if (options.until) listOptions.until = new Date(options.until);

  const raw = await TrainingDatapointRepo.listDatapoints(listOptions);

  const filtered = raw.filter((dp) => validOutcomes.includes(dp.outcome));

  const parsed: EvalDatapoint[] = filtered.map((dp) => {
    let frictionsFound: string[] = [];
    try {
      frictionsFound = JSON.parse(dp.frictionsFound);
    } catch {
      /* empty */
    }

    return {
      id: dp.id,
      outcome: dp.outcome,
      tier: dp.tier,
      decision: dp.decision,
      compositeScore: dp.compositeScore,
      intentScore: dp.intentScore,
      frictionScore: dp.frictionScore,
      clarityScore: dp.clarityScore,
      receptivityScore: dp.receptivityScore,
      valueScore: dp.valueScore,
      gateOverride: dp.gateOverride,
      interventionType: dp.interventionType,
      frictionId: dp.frictionId,
      frictionsFound,
      deviceType: dp.deviceType,
      pageType: dp.pageType,
      cartValue: dp.cartValue,
      sessionAgeSec: dp.sessionAgeSec,
    };
  });

  if (options.sampling === "stratified") {
    return stratifiedSample(parsed, validOutcomes, options.testSize);
  }

  return shuffle(parsed).slice(0, options.testSize);
}

function stratifiedSample(
  data: EvalDatapoint[],
  outcomes: string[],
  targetSize: number,
): EvalDatapoint[] {
  const buckets: Record<string, EvalDatapoint[]> = {};
  for (const outcome of outcomes) buckets[outcome] = [];
  for (const dp of data) {
    if (buckets[dp.outcome]) buckets[dp.outcome].push(dp);
  }

  const total = data.length;
  const result: EvalDatapoint[] = [];

  for (const outcome of outcomes) {
    const bucket = shuffle(buckets[outcome]);
    const proportion = bucket.length / total;
    const take = Math.max(1, Math.round(proportion * targetSize));
    result.push(...bucket.slice(0, take));
  }

  return result.slice(0, targetSize);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Evaluation engine
// ---------------------------------------------------------------------------

export function evaluate(
  datapoints: EvalDatapoint[],
  validOutcomes: string[],
  meta?: { sampling?: string; siteFilter?: string; since?: string; until?: string },
): EvalReport {
  const tiers = ["MONITOR", "PASSIVE", "NUDGE", "ACTIVE", "ESCALATE"];

  // Overall distributions
  const outcomeDistribution: Record<string, number> = {};
  const tierDistribution: Record<string, number> = {};

  for (const dp of datapoints) {
    outcomeDistribution[dp.outcome] = (outcomeDistribution[dp.outcome] || 0) + 1;
    tierDistribution[dp.tier] = (tierDistribution[dp.tier] || 0) + 1;
  }

  // Confusion matrix
  const cm: Record<string, Record<string, number>> = {};
  for (const o of validOutcomes) {
    cm[o] = {};
    for (const t of tiers) cm[o][t] = 0;
  }
  for (const dp of datapoints) {
    if (cm[dp.outcome] && cm[dp.outcome][dp.tier] !== undefined) {
      cm[dp.outcome][dp.tier]++;
    }
  }

  // Intervention effectiveness
  const fired = datapoints.filter((dp) => dp.decision === "fire");
  const firedConverted = fired.filter((dp) => dp.outcome === "converted").length;
  const interventionEffectiveness =
    fired.length > 0 ? (firedConverted / fired.length) * 100 : 0;

  const suppressed = datapoints.filter((dp) => dp.decision === "suppress");
  const suppressedNonConverted = suppressed.filter(
    (dp) => dp.outcome === "dismissed" || dp.outcome === "ignored",
  ).length;
  const suppressionAccuracy =
    suppressed.length > 0 ? (suppressedNonConverted / suppressed.length) * 100 : 0;

  // Decision metrics
  const fireDismissed = fired.filter((dp) => dp.outcome === "dismissed").length;
  const suppressConverted = suppressed.filter(
    (dp) => dp.outcome === "converted",
  ).length;

  const perOutcome: Record<string, MetricsPerClass> = {};
  for (const outcome of validOutcomes) {
    if (outcome === "converted") {
      const tp = firedConverted;
      const fp = fired.length - firedConverted;
      const fn = suppressConverted;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 =
        precision + recall > 0
          ? (2 * precision * recall) / (precision + recall)
          : 0;
      perOutcome[outcome] = {
        precision: round2(precision * 100),
        recall: round2(recall * 100),
        f1: round2(f1 * 100),
        support: outcomeDistribution[outcome] || 0,
      };
    } else if (outcome === "dismissed") {
      const tp = suppressedNonConverted;
      const fp = suppressConverted;
      const fn = fireDismissed;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 =
        precision + recall > 0
          ? (2 * precision * recall) / (precision + recall)
          : 0;
      perOutcome[outcome] = {
        precision: round2(precision * 100),
        recall: round2(recall * 100),
        f1: round2(f1 * 100),
        support: outcomeDistribution[outcome] || 0,
      };
    } else {
      const count = outcomeDistribution[outcome] || 0;
      perOutcome[outcome] = { precision: 0, recall: 0, f1: 0, support: count };
    }
  }

  // Signal calibration
  const signalByOutcome: Record<
    string,
    {
      intentSum: number;
      frictionSum: number;
      claritySum: number;
      receptivitySum: number;
      valueSum: number;
      compositeSum: number;
      count: number;
    }
  > = {};

  for (const dp of datapoints) {
    if (!signalByOutcome[dp.outcome]) {
      signalByOutcome[dp.outcome] = {
        intentSum: 0,
        frictionSum: 0,
        claritySum: 0,
        receptivitySum: 0,
        valueSum: 0,
        compositeSum: 0,
        count: 0,
      };
    }
    const s = signalByOutcome[dp.outcome];
    s.intentSum += dp.intentScore;
    s.frictionSum += dp.frictionScore;
    s.claritySum += dp.clarityScore;
    s.receptivitySum += dp.receptivityScore;
    s.valueSum += dp.valueScore;
    s.compositeSum += dp.compositeScore;
    s.count++;
  }

  const calibration: EvalReport["signalCalibration"]["byOutcome"] = {};
  for (const [outcome, s] of Object.entries(signalByOutcome)) {
    calibration[outcome] = {
      avgIntent: round2(s.intentSum / s.count),
      avgFriction: round2(s.frictionSum / s.count),
      avgClarity: round2(s.claritySum / s.count),
      avgReceptivity: round2(s.receptivitySum / s.count),
      avgValue: round2(s.valueSum / s.count),
      avgComposite: round2(s.compositeSum / s.count),
      count: s.count,
    };
  }

  // Segment analysis
  const byDevice: Record<string, { total: number; converted: number }> = {};
  const byPage: Record<string, { total: number; converted: number }> = {};
  const byTier: Record<
    string,
    { total: number; converted: number; dismissed: number; ignored: number }
  > = {};

  for (const dp of datapoints) {
    if (!byDevice[dp.deviceType])
      byDevice[dp.deviceType] = { total: 0, converted: 0 };
    byDevice[dp.deviceType].total++;
    if (dp.outcome === "converted") byDevice[dp.deviceType].converted++;

    if (!byPage[dp.pageType])
      byPage[dp.pageType] = { total: 0, converted: 0 };
    byPage[dp.pageType].total++;
    if (dp.outcome === "converted") byPage[dp.pageType].converted++;

    if (!byTier[dp.tier])
      byTier[dp.tier] = { total: 0, converted: 0, dismissed: 0, ignored: 0 };
    byTier[dp.tier].total++;
    if (dp.outcome === "converted") byTier[dp.tier].converted++;
    if (dp.outcome === "dismissed") byTier[dp.tier].dismissed++;
    if (dp.outcome === "ignored") byTier[dp.tier].ignored++;
  }

  const segDevice: EvalReport["segmentAnalysis"]["byDevice"] = {};
  for (const [k, v] of Object.entries(byDevice)) {
    segDevice[k] = {
      ...v,
      rate: v.total > 0 ? round2((v.converted / v.total) * 100) : 0,
    };
  }

  const segPage: EvalReport["segmentAnalysis"]["byPage"] = {};
  for (const [k, v] of Object.entries(byPage)) {
    segPage[k] = {
      ...v,
      rate: v.total > 0 ? round2((v.converted / v.total) * 100) : 0,
    };
  }

  // Regression detection
  const regressionIssues: string[] = [];

  if (fired.length >= 10 && interventionEffectiveness < 10) {
    regressionIssues.push(
      `Low intervention effectiveness: only ${interventionEffectiveness.toFixed(1)}% of fired interventions converted.`,
    );
  }

  const fireDismissalRate =
    fired.length > 0 ? (fireDismissed / fired.length) * 100 : 0;
  if (fired.length >= 10 && fireDismissalRate > 70) {
    regressionIssues.push(
      `High dismissal rate: ${fireDismissalRate.toFixed(1)}% of fired interventions were dismissed.`,
    );
  }

  const suppressConvertedRate =
    suppressed.length > 0 ? (suppressConverted / suppressed.length) * 100 : 0;
  if (suppressed.length >= 10 && suppressConvertedRate > 20) {
    regressionIssues.push(
      `Missed conversions: ${suppressConvertedRate.toFixed(1)}% of suppressed sessions actually converted.`,
    );
  }

  if (byTier["ESCALATE"] && byTier["ESCALATE"].total >= 5) {
    const escConv = byTier["ESCALATE"].converted / byTier["ESCALATE"].total;
    if (escConv < 0.15) {
      regressionIssues.push(
        `ESCALATE tier underperforming: only ${(escConv * 100).toFixed(1)}% conversion rate.`,
      );
    }
  }

  if (calibration["converted"] && calibration["dismissed"]) {
    const gap =
      calibration["converted"].avgComposite -
      calibration["dismissed"].avgComposite;
    if (gap < 5) {
      regressionIssues.push(
        `Weak signal separation: converted avg composite (${calibration["converted"].avgComposite}) ` +
          `only ${gap.toFixed(1)} points above dismissed (${calibration["dismissed"].avgComposite}).`,
      );
    }
  }

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      testSize: datapoints.length,
      sampling: meta?.sampling ?? "stratified",
      outcomeFilter: validOutcomes,
      siteFilter: meta?.siteFilter ?? "",
      dateRange: {
        since: meta?.since || "all",
        until: meta?.until || "all",
      },
    },
    overall: {
      totalEvaluated: datapoints.length,
      outcomeDistribution,
      tierDistribution,
    },
    tierAccuracy: {
      interventionEffectiveness: round2(interventionEffectiveness),
      suppressionAccuracy: round2(suppressionAccuracy),
      confusionMatrix: {
        matrix: cm,
        labels: { rows: validOutcomes, cols: tiers },
      },
    },
    decisionMetrics: {
      fireConversionRate: round2(
        fired.length > 0 ? (firedConverted / fired.length) * 100 : 0,
      ),
      fireDismissalRate: round2(fireDismissalRate),
      suppressConversionRate: round2(suppressConvertedRate),
      perOutcome,
    },
    signalCalibration: { byOutcome: calibration },
    segmentAnalysis: {
      byDevice: segDevice,
      byPage: segPage,
      byTier,
    },
    regressionFlags: {
      detected: regressionIssues.length > 0,
      issues: regressionIssues,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
