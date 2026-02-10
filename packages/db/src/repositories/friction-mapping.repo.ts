// ============================================================================
// FrictionMapping Repository — F001-F325 site detector mapping records
// ============================================================================

import { prisma } from "../client.js";

export type CreateFrictionMappingInput = {
  analyzerRunId: string;
  siteConfigId: string;
  frictionId: string;
  detectorType: string;
  triggerEvent: string;
  selector?: string;
  thresholdConfig?: string;
  confidence: number;
  evidence?: string;
  isVerified?: boolean;
  isActive?: boolean;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createFrictionMapping(data: CreateFrictionMappingInput) {
  return prisma.frictionMapping.create({ data });
}

export async function createFrictionMappings(data: CreateFrictionMappingInput[]) {
  if (data.length === 0) return { count: 0 };
  return prisma.frictionMapping.createMany({ data });
}

export async function getFrictionMapping(id: string) {
  return prisma.frictionMapping.findUnique({ where: { id } });
}

export async function updateFrictionMapping(
  id: string,
  data: Partial<{
    detectorType: string;
    triggerEvent: string;
    selector: string | null;
    thresholdConfig: string | null;
    confidence: number;
    evidence: string | null;
    isVerified: boolean;
    isActive: boolean;
  }>,
) {
  return prisma.frictionMapping.update({ where: { id }, data });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listFrictionMappingsByRun(
  analyzerRunId: string,
  limit = 200,
) {
  return prisma.frictionMapping.findMany({
    where: { analyzerRunId },
    orderBy: [{ confidence: "desc" }, { frictionId: "asc" }],
    take: limit,
  });
}

export async function listFrictionMappingsBySite(siteConfigId: string, limit = 200) {
  return prisma.frictionMapping.findMany({
    where: { siteConfigId },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
}

export async function listLowConfidenceFrictionMappings(
  siteConfigId: string,
  threshold = 0.75,
  limit = 200,
) {
  return prisma.frictionMapping.findMany({
    where: {
      siteConfigId,
      confidence: { lt: threshold },
      isActive: true,
    },
    orderBy: [{ confidence: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });
}

export async function countFrictionMappings(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  return prisma.frictionMapping.count({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
  });
}

export async function countDistinctFrictions(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  const rows = await prisma.frictionMapping.findMany({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
    select: { frictionId: true },
    distinct: ["frictionId"],
  });
  return rows.length;
}
