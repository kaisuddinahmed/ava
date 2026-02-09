// ============================================================================
// ScoringConfig Repository — MSWIM weight profile CRUD
// ============================================================================

import { prisma } from "../client.js";

export type CreateScoringConfigInput = {
  name: string;
  siteUrl?: string;
  isActive?: boolean;

  // Weights
  weightIntent?: number;
  weightFriction?: number;
  weightClarity?: number;
  weightReceptivity?: number;
  weightValue?: number;

  // Thresholds
  thresholdMonitor?: number;
  thresholdPassive?: number;
  thresholdNudge?: number;
  thresholdActive?: number;

  // Gates
  minSessionAgeSec?: number;
  maxActivePerSession?: number;
  maxNudgePerSession?: number;
  maxNonPassivePerSession?: number;
  cooldownAfterActiveSec?: number;
  cooldownAfterNudgeSec?: number;
  cooldownAfterDismissSec?: number;
  dismissalsToSuppress?: number;
};

export type UpdateScoringConfigInput = Partial<CreateScoringConfigInput>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createScoringConfig(data: CreateScoringConfigInput) {
  return prisma.scoringConfig.create({ data });
}

export async function getScoringConfig(id: string) {
  return prisma.scoringConfig.findUnique({ where: { id } });
}

export async function updateScoringConfig(
  id: string,
  data: UpdateScoringConfigInput
) {
  return prisma.scoringConfig.update({ where: { id }, data });
}

export async function deleteScoringConfig(id: string) {
  return prisma.scoringConfig.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Active config resolution
// ---------------------------------------------------------------------------

/**
 * Get the active scoring config for a given site URL.
 * Falls back to global default (siteUrl == null) if no site-specific config.
 */
export async function getActiveConfig(siteUrl?: string) {
  // Try site-specific first
  if (siteUrl) {
    const siteConfig = await prisma.scoringConfig.findFirst({
      where: { siteUrl, isActive: true },
    });
    if (siteConfig) return siteConfig;
  }

  // Fall back to global default
  return prisma.scoringConfig.findFirst({
    where: { siteUrl: null, isActive: true },
  });
}

/**
 * Set a config as active, deactivating any other active config for the same scope.
 */
export async function activateConfig(id: string) {
  const config = await prisma.scoringConfig.findUnique({ where: { id } });
  if (!config) throw new Error(`ScoringConfig ${id} not found`);

  // Deactivate other configs in the same scope
  await prisma.scoringConfig.updateMany({
    where: {
      siteUrl: config.siteUrl,
      isActive: true,
      id: { not: id },
    },
    data: { isActive: false },
  });

  // Activate the target config
  return prisma.scoringConfig.update({
    where: { id },
    data: { isActive: true },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listScoringConfigs() {
  return prisma.scoringConfig.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
}

export async function listScoringConfigsBySite(siteUrl: string) {
  return prisma.scoringConfig.findMany({
    where: { OR: [{ siteUrl }, { siteUrl: null }] },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
}
