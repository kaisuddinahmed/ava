import type { Request, Response } from "express";
import { EvaluationRepo, InterventionRepo, EventRepo } from "@ava/db";

/**
 * Analytics API — Aggregated metrics for dashboard visualization.
 * Provides: friction breakdown, conversion funnel, intervention efficiency.
 */

/**
 * GET /api/analytics/session/:sessionId
 * Session-level analytics: MSWIM signal history, intervention outcomes.
 */
export async function getSessionAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;

    const [evaluations, interventions, events] = await Promise.all([
      EvaluationRepo.getEvaluationsBySession(sessionId),
      InterventionRepo.getInterventionsBySession(sessionId),
      EventRepo.getEventsBySession(sessionId, { limit: 500 }),
    ]);

    // MSWIM signal timeline
    const signalTimeline = evaluations.map((e) => ({
      timestamp: e.timestamp,
      intent: e.intentScore,
      friction: e.frictionScore,
      clarity: e.clarityScore,
      receptivity: e.receptivityScore,
      value: e.valueScore,
      composite: e.compositeScore,
      tier: e.tier,
    }));

    // Intervention outcomes
    const outcomeBreakdown = {
      total: interventions.length,
      delivered: interventions.filter((i) => i.status === "delivered").length,
      dismissed: interventions.filter((i) => i.status === "dismissed").length,
      converted: interventions.filter((i) => i.status === "converted").length,
      ignored: interventions.filter((i) => i.status === "ignored").length,
    };

    // Friction IDs detected
    const frictionIds = events
      .filter((e) => e.frictionId)
      .map((e) => e.frictionId as string);
    const frictionBreakdown = frictionIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});

    // Event category breakdown
    const categoryBreakdown = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    }, {});

    res.json({
      sessionId,
      signalTimeline,
      outcomeBreakdown,
      frictionBreakdown,
      categoryBreakdown,
      totalEvents: events.length,
      totalEvaluations: evaluations.length,
    });
  } catch (error) {
    console.error("[Analytics] Session analytics error:", error);
    res.status(500).json({ error: "Failed to compute session analytics" });
  }
}

/**
 * GET /api/analytics/overview
 * Global overview: intervention efficiency, friction hotspots.
 */
export async function getOverview(_req: Request, res: Response): Promise<void> {
  try {
    const [allInterventions, allEvaluations] = await Promise.all([
      InterventionRepo.listInterventions({ limit: 1000 }),
      EvaluationRepo.listEvaluations({ limit: 1000 }),
    ]);

    // Intervention efficiency
    const totalFired = allInterventions.length;
    const totalConverted = allInterventions.filter((i) => i.status === "converted").length;
    const totalDismissed = allInterventions.filter((i) => i.status === "dismissed").length;
    const conversionRate = totalFired > 0 ? (totalConverted / totalFired) * 100 : 0;
    const dismissRate = totalFired > 0 ? (totalDismissed / totalFired) * 100 : 0;

    // Tier distribution
    const tierDistribution = allEvaluations.reduce<Record<string, number>>((acc, e) => {
      acc[e.tier] = (acc[e.tier] || 0) + 1;
      return acc;
    }, {});

    // Intervention type breakdown
    const typeBreakdown = allInterventions.reduce<Record<string, number>>((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {});

    // Average composite score
    const avgComposite =
      allEvaluations.length > 0
        ? allEvaluations.reduce((sum, e) => sum + e.compositeScore, 0) / allEvaluations.length
        : 0;

    // Friction hotspots (top 10 most detected frictions)
    const frictionCounts: Record<string, number> = {};
    for (const eval_ of allEvaluations) {
      try {
        const frictions = JSON.parse(eval_.frictionsFound) as string[];
        for (const f of frictions) {
          frictionCounts[f] = (frictionCounts[f] || 0) + 1;
        }
      } catch {
        // Skip malformed JSON
      }
    }
    const frictionHotspots = Object.entries(frictionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([frictionId, count]) => ({ frictionId, count }));

    res.json({
      interventionEfficiency: {
        totalFired,
        totalConverted,
        totalDismissed,
        conversionRate: Math.round(conversionRate * 100) / 100,
        dismissRate: Math.round(dismissRate * 100) / 100,
      },
      tierDistribution,
      typeBreakdown,
      averageCompositeScore: Math.round(avgComposite * 100) / 100,
      frictionHotspots,
      totalEvaluations: allEvaluations.length,
    });
  } catch (error) {
    console.error("[Analytics] Overview error:", error);
    res.status(500).json({ error: "Failed to compute analytics overview" });
  }
}
