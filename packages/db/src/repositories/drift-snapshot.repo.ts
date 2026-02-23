// ============================================================================
// DriftSnapshot Repository — periodic metric snapshots for trend analysis
// ============================================================================

import { prisma } from "../client.js";

export type CreateDriftSnapshotInput = {
  siteUrl?: string | null;
  windowType: string;
  tierAgreementRate: number;
  decisionAgreementRate: number;
  avgCompositeDivergence: number;
  sampleCount: number;
  avgIntentConverted?: number | null;
  avgIntentDismissed?: number | null;
  avgFrictionConverted?: number | null;
  avgFrictionDismissed?: number | null;
  avgClarityConverted?: number | null;
  avgClarityDismissed?: number | null;
  avgReceptivityConverted?: number | null;
  avgReceptivityDismissed?: number | null;
  avgValueConverted?: number | null;
  avgValueDismissed?: number | null;
  avgCompositeConverted?: number | null;
  avgCompositeDismissed?: number | null;
  conversionRate?: number | null;
  dismissalRate?: number | null;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createSnapshot(data: CreateDriftSnapshotInput) {
  return prisma.driftSnapshot.create({ data });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listSnapshots(options?: {
  siteUrl?: string | null;
  windowType?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};

  if (options?.siteUrl !== undefined) where.siteUrl = options.siteUrl;
  if (options?.windowType) where.windowType = options.windowType;

  if (options?.since || options?.until) {
    const createdAt: Record<string, Date> = {};
    if (options.since) createdAt.gte = options.since;
    if (options.until) createdAt.lte = options.until;
    where.createdAt = createdAt;
  }

  return prisma.driftSnapshot.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

export async function getLatestSnapshot(
  windowType: string,
  siteUrl?: string | null,
) {
  return prisma.driftSnapshot.findFirst({
    where: {
      windowType,
      siteUrl: siteUrl ?? null,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function pruneOldSnapshots(olderThan: Date) {
  return prisma.driftSnapshot.deleteMany({
    where: { createdAt: { lt: olderThan } },
  });
}
