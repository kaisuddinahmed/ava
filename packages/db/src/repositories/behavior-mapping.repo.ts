// ============================================================================
// BehaviorPatternMapping Repository — B001-B614 site mapping records
// ============================================================================

import { prisma } from "../client.js";

export type CreateBehaviorMappingInput = {
  analyzerRunId: string;
  siteConfigId: string;
  patternId: string;
  patternName: string;
  mappedFunction: string;
  eventType: string;
  selector?: string;
  confidence: number;
  source: string;
  evidence?: string;
  isVerified?: boolean;
  isActive?: boolean;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createBehaviorMapping(data: CreateBehaviorMappingInput) {
  return prisma.behaviorPatternMapping.create({ data });
}

export async function createBehaviorMappings(
  data: CreateBehaviorMappingInput[],
) {
  if (data.length === 0) return { count: 0 };
  return prisma.behaviorPatternMapping.createMany({ data });
}

export async function getBehaviorMapping(id: string) {
  return prisma.behaviorPatternMapping.findUnique({ where: { id } });
}

export async function updateBehaviorMapping(
  id: string,
  data: Partial<{
    mappedFunction: string;
    eventType: string;
    selector: string | null;
    confidence: number;
    source: string;
    evidence: string | null;
    isVerified: boolean;
    isActive: boolean;
  }>,
) {
  return prisma.behaviorPatternMapping.update({ where: { id }, data });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listBehaviorMappingsByRun(
  analyzerRunId: string,
  limit = 200,
) {
  return prisma.behaviorPatternMapping.findMany({
    where: { analyzerRunId },
    orderBy: [{ confidence: "desc" }, { patternId: "asc" }],
    take: limit,
  });
}

export async function listBehaviorMappingsBySite(
  siteConfigId: string,
  limit = 200,
) {
  return prisma.behaviorPatternMapping.findMany({
    where: { siteConfigId },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
}

export async function listLowConfidenceBehaviorMappings(
  siteConfigId: string,
  threshold = 0.75,
  limit = 200,
) {
  return prisma.behaviorPatternMapping.findMany({
    where: {
      siteConfigId,
      confidence: { lt: threshold },
      isActive: true,
    },
    orderBy: [{ confidence: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });
}

export async function countBehaviorMappings(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  return prisma.behaviorPatternMapping.count({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
  });
}

export async function countDistinctBehaviorPatterns(
  siteConfigId: string,
  analyzerRunId?: string,
) {
  const rows = await prisma.behaviorPatternMapping.findMany({
    where: {
      siteConfigId,
      ...(analyzerRunId ? { analyzerRunId } : {}),
    },
    select: { patternId: true },
    distinct: ["patternId"],
  });
  return rows.length;
}
