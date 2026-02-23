// ============================================================================
// DriftAlert Repository — detected scoring/model anomalies
// ============================================================================

import { prisma } from "../client.js";

export type CreateDriftAlertInput = {
  siteUrl?: string | null;
  alertType: string;
  severity: string;
  windowType: string;
  metric: string;
  expected: number;
  actual: number;
  message: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createAlert(data: CreateDriftAlertInput) {
  return prisma.driftAlert.create({ data });
}

export async function acknowledgeAlert(id: string) {
  return prisma.driftAlert.update({
    where: { id },
    data: { acknowledged: true, acknowledgedAt: new Date() },
  });
}

export async function resolveAlert(id: string) {
  return prisma.driftAlert.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listAlerts(options?: {
  siteUrl?: string | null;
  alertType?: string;
  severity?: string;
  acknowledged?: boolean;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};

  if (options?.siteUrl !== undefined) where.siteUrl = options.siteUrl;
  if (options?.alertType) where.alertType = options.alertType;
  if (options?.severity) where.severity = options.severity;
  if (options?.acknowledged !== undefined) where.acknowledged = options.acknowledged;

  return prisma.driftAlert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

export async function getActiveAlerts(siteUrl?: string | null) {
  return prisma.driftAlert.findMany({
    where: {
      resolvedAt: null,
      ...(siteUrl !== undefined ? { siteUrl } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function countBySeverity(since?: Date) {
  const where: Record<string, unknown> = {};
  if (since) where.createdAt = { gte: since };

  const results = await prisma.driftAlert.groupBy({
    by: ["severity"],
    where,
    _count: { id: true },
  });

  return results.reduce(
    (acc, r) => {
      acc[r.severity] = r._count.id;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * Check if a similar alert already exists (for dedup).
 * Returns true if an unresolved alert of the same type/window exists within the last N hours.
 */
export async function hasRecentAlert(
  alertType: string,
  windowType: string,
  siteUrl: string | null,
  withinHours: number = 6,
) {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);

  const count = await prisma.driftAlert.count({
    where: {
      alertType,
      windowType,
      siteUrl,
      resolvedAt: null,
      createdAt: { gte: since },
    },
  });

  return count > 0;
}
