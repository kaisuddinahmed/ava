// ============================================================================
// IntegrationStatus Repository — onboarding progress + activation state log
// ============================================================================

import { prisma } from "../client.js";

export type CreateIntegrationStatusInput = {
  siteConfigId: string;
  analyzerRunId?: string;
  status: string;
  progress?: number;
  details?: string;
};

export type UpdateIntegrationStatusInput = Partial<{
  status: string;
  progress: number;
  details: string | null;
}>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createIntegrationStatus(data: CreateIntegrationStatusInput) {
  return prisma.integrationStatus.create({ data });
}

export async function getIntegrationStatus(id: string) {
  return prisma.integrationStatus.findUnique({ where: { id } });
}

export async function updateIntegrationStatus(
  id: string,
  data: UpdateIntegrationStatusInput,
) {
  return prisma.integrationStatus.update({
    where: { id },
    data,
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listIntegrationStatusesBySite(
  siteConfigId: string,
  limit = 50,
) {
  return prisma.integrationStatus.findMany({
    where: { siteConfigId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getLatestIntegrationStatusBySite(siteConfigId: string) {
  return prisma.integrationStatus.findFirst({
    where: { siteConfigId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestIntegrationStatusByRun(analyzerRunId: string) {
  return prisma.integrationStatus.findFirst({
    where: { analyzerRunId },
    orderBy: { createdAt: "desc" },
  });
}

