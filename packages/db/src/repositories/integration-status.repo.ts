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
  const db = prisma as any;
  return db.integrationStatus.create({ data });
}

export async function getIntegrationStatus(id: string) {
  const db = prisma as any;
  return db.integrationStatus.findUnique({ where: { id } });
}

export async function updateIntegrationStatus(
  id: string,
  data: UpdateIntegrationStatusInput,
) {
  const db = prisma as any;
  return db.integrationStatus.update({
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
  const db = prisma as any;
  return db.integrationStatus.findMany({
    where: { siteConfigId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getLatestIntegrationStatusBySite(siteConfigId: string) {
  const db = prisma as any;
  return db.integrationStatus.findFirst({
    where: { siteConfigId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestIntegrationStatusByRun(analyzerRunId: string) {
  const db = prisma as any;
  return db.integrationStatus.findFirst({
    where: { analyzerRunId },
    orderBy: { createdAt: "desc" },
  });
}
