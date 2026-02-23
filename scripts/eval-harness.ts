#!/usr/bin/env tsx
// ============================================================================
// AVA Evaluation Harness
// Benchmarks model quality against historical training data with known outcomes.
// Computes precision, recall, F1, confusion matrices, and regression detection.
//
// Usage:
//   npx tsx scripts/eval-harness.ts [options]
//
// Options:
//   --test-size       N             Number of datapoints to evaluate (default: 500)
//   --sampling        random | stratified   Sampling strategy (default: stratified)
//   --outcome         converted,dismissed   Outcomes to include (default: all terminal)
//   --site            https://...           Filter by site (optional)
//   --since           2025-01-01            Date range start (optional)
//   --until           2025-12-31            Date range end (optional)
//   --output          path/to/report.json   Output file (default: data/eval-{timestamp}.json)
//   --csv             path/to/report.csv    Also write CSV summary
//   --verbose                               Show per-datapoint results
//
// Evaluates:
//   1. Tier prediction accuracy (did the tier match the outcome quality?)
//   2. Decision effectiveness (fire/suppress vs actual outcome)
//   3. Signal calibration (score distributions by outcome)
//   4. Friction detection accuracy (frictions detected vs outcome)
//   5. Regression detection (sub-group performance drops)
//
// Requires: DB accessible (runs Prisma directly)
// ============================================================================

import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { TrainingDatapointRepo } from "@ava/db";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const TEST_SIZE = Number(getArg("test-size", "500"));
const SAMPLING = getArg("sampling", "stratified") as "random" | "stratified";
const OUTCOME_FILTER = getArg("outcome", "converted,dismissed,ignored");
const SITE_FILTER = getArg("site", "");
const SINCE = getArg("since", "");
const UNTIL = getArg("until", "");
const VERBOSE = hasFlag("verbose");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUTPUT_PATH = resolve(getArg("output", `data/eval-${timestamp}.json`));
const CSV_PATH = getArg("csv", "");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvalDatapoint {
  id: string;
  outcome: string; // ground truth
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

interface ConfusionMatrix {
  // outcome (rows) × tier (cols)
  matrix: Record<string, Record<string, number>>;
  labels: { rows: string[]; cols: string[] };
}

interface MetricsPerClass {
  precision: number;
  recall: number;
  f1: number;
  support: number; // count
}

interface EvalReport {
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
    /** Did the tier match a "good" outcome? */
    interventionEffectiveness: number; // % of fire decisions that converted
    suppressionAccuracy: number; // % of suppress decisions that were dismissed/ignored
    confusionMatrix: ConfusionMatrix;
  };
  decisionMetrics: {
    /** fire/suppress vs outcome */
    fireConversionRate: number;
    fireDismissalRate: number;
    suppressConversionRate: number; // should be low (missed opportunities)
    perOutcome: Record<string, MetricsPerClass>;
  };
  signalCalibration: {
    /** Average signal scores grouped by outcome */
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
    /** Performance by device type */
    byDevice: Record<string, { total: number; converted: number; rate: number }>;
    /** Performance by page type */
    byPage: Record<string, { total: number; converted: number; rate: number }>;
    /** Performance by tier */
    byTier: Record<string, { total: number; converted: number; dismissed: number; ignored: number }>;
  };
  regressionFlags: {
    detected: boolean;
    issues: string[];
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              AVA Evaluation Harness                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // 1. Load test set
  console.log(`▸ Loading test set (${SAMPLING} sampling, target ${TEST_SIZE})...`);

  const validOutcomes = OUTCOME_FILTER.split(",").map((o) => o.trim());
  const datapoints = await loadTestSet(validOutcomes);

  if (datapoints.length === 0) {
    console.error("✗ No datapoints found matching filters. Check DB and filters.");
    process.exit(1);
  }

  console.log(`  Loaded ${datapoints.length} datapoints for evaluation`);

  // 2. Run evaluation
  console.log("▸ Computing metrics...");
  const report = evaluate(datapoints, validOutcomes);

  // 3. Print summary
  printReport(report);

  // 4. Check for regressions
  if (report.regressionFlags.detected) {
    console.log("\n⚠  REGRESSION FLAGS DETECTED:");
    for (const issue of report.regressionFlags.issues) {
      console.log(`   • ${issue}`);
    }
  }

  // 5. Write output
  const dir = dirname(OUTPUT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n✓ Full report written to ${OUTPUT_PATH}`);

  if (CSV_PATH) {
    writeCsvSummary(report, resolve(CSV_PATH));
    console.log(`✓ CSV summary written to ${CSV_PATH}`);
  }

  console.log("\n✓ Evaluation complete.");
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadTestSet(validOutcomes: string[]): Promise<EvalDatapoint[]> {
  const listOptions: {
    limit: number;
    siteUrl?: string;
    since?: Date;
    until?: Date;
  } = { limit: TEST_SIZE * 3 }; // overfetch for filtering

  if (SITE_FILTER) listOptions.siteUrl = SITE_FILTER;
  if (SINCE) listOptions.since = new Date(SINCE);
  if (UNTIL) listOptions.until = new Date(UNTIL);

  const raw = await TrainingDatapointRepo.listDatapoints(listOptions);

  // Filter by outcome
  const filtered = raw.filter((dp) => validOutcomes.includes(dp.outcome));

  // Parse into eval datapoints
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

  // Apply sampling strategy
  if (SAMPLING === "stratified") {
    return stratifiedSample(parsed, validOutcomes, TEST_SIZE);
  }

  // Random sampling
  return shuffle(parsed).slice(0, TEST_SIZE);
}

function stratifiedSample(
  data: EvalDatapoint[],
  outcomes: string[],
  targetSize: number
): EvalDatapoint[] {
  const buckets: Record<string, EvalDatapoint[]> = {};
  for (const outcome of outcomes) buckets[outcome] = [];
  for (const dp of data) {
    if (buckets[dp.outcome]) buckets[dp.outcome].push(dp);
  }

  // Proportional allocation (at least 1 per bucket if available)
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

function evaluate(datapoints: EvalDatapoint[], validOutcomes: string[]): EvalReport {
  const tiers = ["MONITOR", "PASSIVE", "NUDGE", "ACTIVE", "ESCALATE"];

  // Overall distributions
  const outcomeDistribution: Record<string, number> = {};
  const tierDistribution: Record<string, number> = {};

  for (const dp of datapoints) {
    outcomeDistribution[dp.outcome] = (outcomeDistribution[dp.outcome] || 0) + 1;
    tierDistribution[dp.tier] = (tierDistribution[dp.tier] || 0) + 1;
  }

  // --- Tier accuracy (confusion matrix: outcome × tier) ---
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
  const interventionEffectiveness = fired.length > 0 ? (firedConverted / fired.length) * 100 : 0;

  const suppressed = datapoints.filter((dp) => dp.decision === "suppress");
  const suppressedNonConverted = suppressed.filter(
    (dp) => dp.outcome === "dismissed" || dp.outcome === "ignored"
  ).length;
  const suppressionAccuracy =
    suppressed.length > 0 ? (suppressedNonConverted / suppressed.length) * 100 : 0;

  // --- Decision metrics ---
  const fireDismissed = fired.filter((dp) => dp.outcome === "dismissed").length;
  const suppressConverted = suppressed.filter((dp) => dp.outcome === "converted").length;

  // Per-outcome precision/recall (treating each outcome as a binary class)
  const perOutcome: Record<string, MetricsPerClass> = {};

  for (const outcome of validOutcomes) {
    // For "converted": we want to measure if high-tier decisions lead to conversions
    // Simplified: treat decision="fire" as positive prediction, outcome="converted" as positive label
    if (outcome === "converted") {
      const tp = firedConverted;
      const fp = fired.length - firedConverted;
      const fn = suppressConverted;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      perOutcome[outcome] = {
        precision: round2(precision * 100),
        recall: round2(recall * 100),
        f1: round2(f1 * 100),
        support: outcomeDistribution[outcome] || 0,
      };
    } else if (outcome === "dismissed") {
      // For "dismissed": fire → dismissed is a bad outcome (false positive)
      const tp = suppressedNonConverted; // correctly suppressed
      const fp = suppressConverted; // wrongly suppressed (missed conversion)
      const fn = fireDismissed; // wrongly fired (dismissed)
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      perOutcome[outcome] = {
        precision: round2(precision * 100),
        recall: round2(recall * 100),
        f1: round2(f1 * 100),
        support: outcomeDistribution[outcome] || 0,
      };
    } else {
      // For "ignored" or other outcomes
      const count = outcomeDistribution[outcome] || 0;
      perOutcome[outcome] = { precision: 0, recall: 0, f1: 0, support: count };
    }
  }

  // --- Signal calibration by outcome ---
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

  // --- Segment analysis ---
  const byDevice: Record<string, { total: number; converted: number }> = {};
  const byPage: Record<string, { total: number; converted: number }> = {};
  const byTier: Record<string, { total: number; converted: number; dismissed: number; ignored: number }> = {};

  for (const dp of datapoints) {
    // Device
    if (!byDevice[dp.deviceType]) byDevice[dp.deviceType] = { total: 0, converted: 0 };
    byDevice[dp.deviceType].total++;
    if (dp.outcome === "converted") byDevice[dp.deviceType].converted++;

    // Page
    if (!byPage[dp.pageType]) byPage[dp.pageType] = { total: 0, converted: 0 };
    byPage[dp.pageType].total++;
    if (dp.outcome === "converted") byPage[dp.pageType].converted++;

    // Tier
    if (!byTier[dp.tier]) byTier[dp.tier] = { total: 0, converted: 0, dismissed: 0, ignored: 0 };
    byTier[dp.tier].total++;
    if (dp.outcome === "converted") byTier[dp.tier].converted++;
    if (dp.outcome === "dismissed") byTier[dp.tier].dismissed++;
    if (dp.outcome === "ignored") byTier[dp.tier].ignored++;
  }

  const segDevice: EvalReport["segmentAnalysis"]["byDevice"] = {};
  for (const [k, v] of Object.entries(byDevice)) {
    segDevice[k] = { ...v, rate: v.total > 0 ? round2((v.converted / v.total) * 100) : 0 };
  }

  const segPage: EvalReport["segmentAnalysis"]["byPage"] = {};
  for (const [k, v] of Object.entries(byPage)) {
    segPage[k] = { ...v, rate: v.total > 0 ? round2((v.converted / v.total) * 100) : 0 };
  }

  // --- Regression detection ---
  const regressionIssues: string[] = [];

  // Flag 1: conversion rate on fired interventions < 10%
  if (fired.length >= 10 && interventionEffectiveness < 10) {
    regressionIssues.push(
      `Low intervention effectiveness: only ${interventionEffectiveness.toFixed(1)}% of fired interventions converted.`
    );
  }

  // Flag 2: dismissal rate on fired > 70%
  const fireDismissalRate = fired.length > 0 ? (fireDismissed / fired.length) * 100 : 0;
  if (fired.length >= 10 && fireDismissalRate > 70) {
    regressionIssues.push(
      `High dismissal rate: ${fireDismissalRate.toFixed(1)}% of fired interventions were dismissed.`
    );
  }

  // Flag 3: converted users being suppressed
  const suppressConvertedRate =
    suppressed.length > 0 ? (suppressConverted / suppressed.length) * 100 : 0;
  if (suppressed.length >= 10 && suppressConvertedRate > 20) {
    regressionIssues.push(
      `Missed conversions: ${suppressConvertedRate.toFixed(1)}% of suppressed sessions actually converted.`
    );
  }

  // Flag 4: ESCALATE tier has low conversion
  if (byTier["ESCALATE"] && byTier["ESCALATE"].total >= 5) {
    const escConv = byTier["ESCALATE"].converted / byTier["ESCALATE"].total;
    if (escConv < 0.15) {
      regressionIssues.push(
        `ESCALATE tier underperforming: only ${(escConv * 100).toFixed(1)}% conversion rate.`
      );
    }
  }

  // Flag 5: calibration gap — converted should have higher composite than dismissed
  if (calibration["converted"] && calibration["dismissed"]) {
    const gap = calibration["converted"].avgComposite - calibration["dismissed"].avgComposite;
    if (gap < 5) {
      regressionIssues.push(
        `Weak signal separation: converted avg composite (${calibration["converted"].avgComposite}) ` +
          `only ${gap.toFixed(1)} points above dismissed (${calibration["dismissed"].avgComposite}).`
      );
    }
  }

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      testSize: datapoints.length,
      sampling: SAMPLING,
      outcomeFilter: validOutcomes,
      siteFilter: SITE_FILTER,
      dateRange: { since: SINCE || "all", until: UNTIL || "all" },
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
        fired.length > 0 ? (firedConverted / fired.length) * 100 : 0
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
// Report printing
// ---------------------------------------------------------------------------

function printReport(report: EvalReport): void {
  console.log();
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                  Evaluation Results                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // Overall
  console.log(`▸ Dataset: ${report.overall.totalEvaluated} datapoints`);
  console.log("  Outcomes:", fmtDist(report.overall.outcomeDistribution));
  console.log("  Tiers:   ", fmtDist(report.overall.tierDistribution));
  console.log();

  // Decision effectiveness
  console.log("▸ Decision Effectiveness:");
  console.log(
    `  Fire → Converted:   ${report.decisionMetrics.fireConversionRate.toFixed(1)}%`
  );
  console.log(
    `  Fire → Dismissed:   ${report.decisionMetrics.fireDismissalRate.toFixed(1)}%`
  );
  console.log(
    `  Suppress → Convert: ${report.decisionMetrics.suppressConversionRate.toFixed(1)}% (missed opportunities)`
  );
  console.log(
    `  Intervention Eff:   ${report.tierAccuracy.interventionEffectiveness.toFixed(1)}%`
  );
  console.log(
    `  Suppression Acc:    ${report.tierAccuracy.suppressionAccuracy.toFixed(1)}%`
  );
  console.log();

  // Per-outcome metrics
  console.log("▸ Per-Outcome Metrics:");
  for (const [outcome, m] of Object.entries(report.decisionMetrics.perOutcome)) {
    console.log(
      `  ${outcome.padEnd(12)} P=${m.precision.toFixed(1)}%  R=${m.recall.toFixed(1)}%  F1=${m.f1.toFixed(1)}%  (n=${m.support})`
    );
  }
  console.log();

  // Signal calibration
  console.log("▸ Signal Calibration by Outcome:");
  console.log(
    "  " +
      "Outcome".padEnd(12) +
      "Intent".padStart(8) +
      "Frict".padStart(8) +
      "Clar".padStart(8) +
      "Recep".padStart(8) +
      "Value".padStart(8) +
      "Comp".padStart(8)
  );
  console.log("  " + "─".repeat(60));
  for (const [outcome, cal] of Object.entries(report.signalCalibration.byOutcome)) {
    console.log(
      "  " +
        outcome.padEnd(12) +
        cal.avgIntent.toFixed(1).padStart(8) +
        cal.avgFriction.toFixed(1).padStart(8) +
        cal.avgClarity.toFixed(1).padStart(8) +
        cal.avgReceptivity.toFixed(1).padStart(8) +
        cal.avgValue.toFixed(1).padStart(8) +
        cal.avgComposite.toFixed(1).padStart(8)
    );
  }
  console.log();

  // Tier breakdown
  console.log("▸ Tier Breakdown:");
  for (const [tier, data] of Object.entries(report.segmentAnalysis.byTier)) {
    const convRate = data.total > 0 ? ((data.converted / data.total) * 100).toFixed(1) : "0.0";
    console.log(
      `  ${tier.padEnd(10)} n=${String(data.total).padStart(4)}  conv=${convRate.padStart(5)}%  dismiss=${data.dismissed}  ignored=${data.ignored}`
    );
  }
  console.log();

  // Confusion matrix
  console.log("▸ Confusion Matrix (Outcome × Tier):");
  const { matrix, labels } = report.tierAccuracy.confusionMatrix;
  console.log("  " + "".padEnd(12) + labels.cols.map((c) => c.padStart(10)).join(""));
  for (const row of labels.rows) {
    const vals = labels.cols.map((col) => String(matrix[row]?.[col] ?? 0).padStart(10));
    console.log("  " + row.padEnd(12) + vals.join(""));
  }
}

function fmtDist(dist: Record<string, number>): string {
  return Object.entries(dist)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function writeCsvSummary(report: EvalReport, path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const lines: string[] = [];

  // Header section
  lines.push("section,metric,value");
  lines.push(`metadata,timestamp,${report.metadata.timestamp}`);
  lines.push(`metadata,test_size,${report.metadata.testSize}`);
  lines.push(`metadata,sampling,${report.metadata.sampling}`);

  // Decision metrics
  lines.push(`decision,fire_conversion_rate,${report.decisionMetrics.fireConversionRate}`);
  lines.push(`decision,fire_dismissal_rate,${report.decisionMetrics.fireDismissalRate}`);
  lines.push(`decision,suppress_conversion_rate,${report.decisionMetrics.suppressConversionRate}`);
  lines.push(`decision,intervention_effectiveness,${report.tierAccuracy.interventionEffectiveness}`);
  lines.push(`decision,suppression_accuracy,${report.tierAccuracy.suppressionAccuracy}`);

  // Per-outcome
  for (const [outcome, m] of Object.entries(report.decisionMetrics.perOutcome)) {
    lines.push(`outcome_${outcome},precision,${m.precision}`);
    lines.push(`outcome_${outcome},recall,${m.recall}`);
    lines.push(`outcome_${outcome},f1,${m.f1}`);
    lines.push(`outcome_${outcome},support,${m.support}`);
  }

  // Signal calibration
  for (const [outcome, cal] of Object.entries(report.signalCalibration.byOutcome)) {
    lines.push(`calibration_${outcome},avg_intent,${cal.avgIntent}`);
    lines.push(`calibration_${outcome},avg_friction,${cal.avgFriction}`);
    lines.push(`calibration_${outcome},avg_clarity,${cal.avgClarity}`);
    lines.push(`calibration_${outcome},avg_receptivity,${cal.avgReceptivity}`);
    lines.push(`calibration_${outcome},avg_value,${cal.avgValue}`);
    lines.push(`calibration_${outcome},avg_composite,${cal.avgComposite}`);
  }

  // Regression flags
  lines.push(`regression,detected,${report.regressionFlags.detected}`);
  lines.push(`regression,issue_count,${report.regressionFlags.issues.length}`);

  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("Evaluation harness failed:", err);
  process.exit(1);
});
