// ============================================================================
// @ava/db — Database layer
// Re-exports Prisma client singleton and all repository functions
// ============================================================================

// Prisma client
export { prisma } from "./client.js";
export type { PrismaClient } from "./client.js";

// Repositories
export * as SessionRepo from "./repositories/session.repo.js";
export * as EventRepo from "./repositories/event.repo.js";
export * as EvaluationRepo from "./repositories/evaluation.repo.js";
export * as InterventionRepo from "./repositories/intervention.repo.js";
export * as ScoringConfigRepo from "./repositories/scoring-config.repo.js";
export * as SiteConfigRepo from "./repositories/site-config.repo.js";
export * as AnalyzerRunRepo from "./repositories/analyzer-run.repo.js";
export * as BehaviorMappingRepo from "./repositories/behavior-mapping.repo.js";
export * as FrictionMappingRepo from "./repositories/friction-mapping.repo.js";
export * as IntegrationStatusRepo from "./repositories/integration-status.repo.js";
