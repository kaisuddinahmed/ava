// ============================================================================
// Rollout Repository — staged config changes with health checks
// ============================================================================

import { prisma } from "../client.js";

export type CreateRolloutInput = {
  name: string;
  siteUrl?: string | null;
  changeType: string;
  newConfigId?: string;
  newEvalEngine?: string;
  configPayload?: string;
  stages: string; // JSON array of RolloutStage
  healthCriteria: string; // JSON of RolloutHealthCriteria
  experimentId?: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createRollout(data: CreateRolloutInput) {
  return prisma.rollout.create({ data });
}

export async function getRollout(id: string) {
  return prisma.rollout.findUnique({
    where: { id },
    include: { experiment: true },
  });
}

export async function updateRollout(
  id: string,
  data: Partial<{
    status: string;
    currentStage: number;
    startedAt: Date;
    completedAt: Date;
    rolledBackAt: Date;
    rollbackReason: string;
    lastHealthCheck: Date;
    lastHealthStatus: string;
    experimentId: string;
  }>,
) {
  return prisma.rollout.update({ where: { id }, data });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function advanceStage(id: string) {
  return prisma.rollout.update({
    where: { id },
    data: { currentStage: { increment: 1 } },
  });
}

export async function completeRollout(id: string) {
  return prisma.rollout.update({
    where: { id },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });
}

export async function rollback(id: string, reason: string) {
  return prisma.rollout.update({
    where: { id },
    data: {
      status: "rolled_back",
      rolledBackAt: new Date(),
      rollbackReason: reason,
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getActiveRollout(siteUrl?: string | null) {
  // Site-specific first
  if (siteUrl) {
    const siteRollout = await prisma.rollout.findFirst({
      where: { status: "rolling", siteUrl },
      include: { experiment: true },
    });
    if (siteRollout) return siteRollout;
  }

  // Global fallback
  return prisma.rollout.findFirst({
    where: { status: "rolling", siteUrl: null },
    include: { experiment: true },
  });
}

export async function listRollouts(options?: {
  status?: string;
  siteUrl?: string | null;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (options?.status) where.status = options.status;
  if (options?.siteUrl !== undefined) where.siteUrl = options.siteUrl;

  return prisma.rollout.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
    include: { experiment: true },
  });
}
