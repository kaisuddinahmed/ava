import { prisma } from "../client.js";

// ============================================================================
// SiteConfig Repository — per-site tracking & platform configuration
// ============================================================================

/** Get site config by URL. */
export async function getSiteConfigByUrl(siteUrl: string) {
  return prisma.siteConfig.findUnique({ where: { siteUrl } });
}

/** Get site config by ID. */
export async function getSiteConfig(id: string) {
  return prisma.siteConfig.findUnique({ where: { id } });
}

/** List all site configs. */
export async function listSiteConfigs() {
  return prisma.siteConfig.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

/** Create or update site config (upsert by siteUrl). */
export async function upsertSiteConfig(data: {
  siteUrl: string;
  platform: string;
  trackingConfig: string;
}) {
  return prisma.siteConfig.upsert({
    where: { siteUrl: data.siteUrl },
    create: data,
    update: {
      platform: data.platform,
      trackingConfig: data.trackingConfig,
    },
  });
}

/** Create a new site config. */
export async function createSiteConfig(data: {
  siteUrl: string;
  platform: string;
  trackingConfig: string;
}) {
  return prisma.siteConfig.create({ data });
}

/** Update an existing site config. */
export async function updateSiteConfig(
  id: string,
  data: Partial<{
    platform: string;
    trackingConfig: string;
    integrationStatus: string;
    activeAnalyzerRunId: string | null;
  }>,
) {
  return prisma.siteConfig.update({ where: { id }, data });
}

/** Delete a site config. */
export async function deleteSiteConfig(id: string) {
  return prisma.siteConfig.delete({ where: { id } });
}

/** Update site integration status and optionally the active analyzer run. */
export async function setIntegrationStatus(
  id: string,
  integrationStatus: string,
  activeAnalyzerRunId?: string | null,
) {
  return prisma.siteConfig.update({
    where: { id },
    data: {
      integrationStatus,
      ...(activeAnalyzerRunId !== undefined ? { activeAnalyzerRunId } : {}),
    },
  });
}

/** Set or clear active analyzer run pointer for a site. */
export async function setActiveAnalyzerRun(
  id: string,
  activeAnalyzerRunId: string | null,
) {
  return prisma.siteConfig.update({
    where: { id },
    data: { activeAnalyzerRunId },
  });
}

/** Get tracking config (parsed JSON) for a site URL. */
export async function getTrackingConfig(
  siteUrl: string,
): Promise<Record<string, unknown> | null> {
  const config = await prisma.siteConfig.findUnique({
    where: { siteUrl },
    select: { trackingConfig: true },
  });
  if (!config) return null;
  try {
    return JSON.parse(config.trackingConfig);
  } catch {
    return null;
  }
}
