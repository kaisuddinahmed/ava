// ============================================================================
// AnalyzerRun Repository — onboarding analysis lifecycle
// ============================================================================

import { prisma } from "../client.js";

export type CreateAnalyzerRunInput = {
  siteConfigId: string;
  status?: string;
  phase?: string;
  behaviorCoverage?: number;
  frictionCoverage?: number;
  avgConfidence?: number;
  summary?: string;
  errorMessage?: string;
};

export type UpdateAnalyzerRunInput = Partial<{
  status: string;
  phase: string;
  behaviorCoverage: number;
  frictionCoverage: number;
  avgConfidence: number;
  summary: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
}>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createAnalyzerRun(data: CreateAnalyzerRunInput) {
  return prisma.analyzerRun.create({ data });
}

export async function getAnalyzerRun(id: string) {
  return prisma.analyzerRun.findUnique({
    where: { id },
    include: { siteConfig: true },
  });
}

export async function updateAnalyzerRun(id: string, data: UpdateAnalyzerRunInput) {
  return prisma.analyzerRun.update({
    where: { id },
    data,
  });
}

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

export async function setAnalyzerRunPhase(id: string, phase: string) {
  return prisma.analyzerRun.update({
    where: { id },
    data: { phase },
  });
}

export async function completeAnalyzerRun(
  id: string,
  data?: Partial<{
    phase: string;
    behaviorCoverage: number;
    frictionCoverage: number;
    avgConfidence: number;
    summary: string;
  }>,
) {
  return prisma.analyzerRun.update({
    where: { id },
    data: {
      status: "completed",
      completedAt: new Date(),
      ...(data?.phase ? { phase: data.phase } : {}),
      ...(data?.behaviorCoverage !== undefined
        ? { behaviorCoverage: data.behaviorCoverage }
        : {}),
      ...(data?.frictionCoverage !== undefined
        ? { frictionCoverage: data.frictionCoverage }
        : {}),
      ...(data?.avgConfidence !== undefined
        ? { avgConfidence: data.avgConfidence }
        : {}),
      ...(data?.summary ? { summary: data.summary } : {}),
    },
  });
}

export async function failAnalyzerRun(id: string, errorMessage: string) {
  return prisma.analyzerRun.update({
    where: { id },
    data: {
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listAnalyzerRunsBySite(siteConfigId: string, limit = 20) {
  return prisma.analyzerRun.findMany({
    where: { siteConfigId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function getLatestAnalyzerRunBySite(siteConfigId: string) {
  return prisma.analyzerRun.findFirst({
    where: { siteConfigId },
    orderBy: { startedAt: "desc" },
  });
}

export async function getAnalyzerRunWithMappings(
  id: string,
  options?: { behaviorLimit?: number; frictionLimit?: number },
) {
  return prisma.analyzerRun.findUnique({
    where: { id },
    include: {
      siteConfig: true,
      behaviorMappings: {
        orderBy: { confidence: "desc" },
        take: options?.behaviorLimit ?? 100,
      },
      frictionMappings: {
        orderBy: { confidence: "desc" },
        take: options?.frictionLimit ?? 100,
      },
    },
  });
}

