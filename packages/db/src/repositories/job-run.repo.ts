// ============================================================================
// JobRun Repository — scheduled/manual job execution tracking
// ============================================================================

import { prisma } from "../client.js";

export type CreateJobRunInput = {
  jobName: string;
  triggeredBy?: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createJobRun(data: CreateJobRunInput) {
  return prisma.jobRun.create({
    data: {
      jobName: data.jobName,
      triggeredBy: data.triggeredBy ?? "scheduler",
      status: "running",
    },
  });
}

export async function completeJobRun(
  id: string,
  summary: Record<string, unknown>,
  durationMs: number,
) {
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: "completed",
      completedAt: new Date(),
      summary: JSON.stringify(summary),
      durationMs,
    },
  });
}

export async function failJobRun(
  id: string,
  errorMessage: string,
  durationMs: number,
) {
  return prisma.jobRun.update({
    where: { id },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorMessage,
      durationMs,
    },
  });
}

export async function getJobRun(id: string) {
  return prisma.jobRun.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listJobRuns(options?: {
  jobName?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (options?.jobName) where.jobName = options.jobName;
  if (options?.status) where.status = options.status;

  return prisma.jobRun.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

export async function getLastRun(jobName: string) {
  return prisma.jobRun.findFirst({
    where: { jobName },
    orderBy: { startedAt: "desc" },
  });
}

export async function pruneOldRuns(olderThan: Date) {
  return prisma.jobRun.deleteMany({
    where: { startedAt: { lt: olderThan } },
  });
}
