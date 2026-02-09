#!/usr/bin/env tsx
// ============================================================================
// Seed Script: MSWIM Default Weight Profile
// Creates the default ScoringConfig in the database if it doesn't exist.
// ============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("═══ AVA MSWIM Default Seed ═══\n");

  // Check if default config already exists
  const existing = await prisma.scoringConfig.findFirst({
    where: { name: "default", siteUrl: null },
  });

  if (existing) {
    console.log(`Default config already exists (id: ${existing.id})`);
    console.log(`  Active: ${existing.isActive}`);
    console.log(`  Weights: I=${existing.weightIntent} F=${existing.weightFriction} C=${existing.weightClarity} R=${existing.weightReceptivity} V=${existing.weightValue}`);
    console.log(`  Thresholds: M=${existing.thresholdMonitor} P=${existing.thresholdPassive} N=${existing.thresholdNudge} A=${existing.thresholdActive}`);
    console.log("\n⏭  Skipping seed (already exists).");
    return;
  }

  // Create default profile
  const config = await prisma.scoringConfig.create({
    data: {
      name: "default",
      siteUrl: null,
      isActive: true,

      // Signal weights (sum = 1.0)
      weightIntent: 0.25,
      weightFriction: 0.25,
      weightClarity: 0.15,
      weightReceptivity: 0.20,
      weightValue: 0.15,

      // Tier thresholds
      thresholdMonitor: 29,
      thresholdPassive: 49,
      thresholdNudge: 64,
      thresholdActive: 79,

      // Gate config
      minSessionAgeSec: 30,
      maxActivePerSession: 2,
      maxNudgePerSession: 3,
      maxNonPassivePerSession: 6,
      cooldownAfterActiveSec: 120,
      cooldownAfterNudgeSec: 60,
      cooldownAfterDismissSec: 300,
      dismissalsToSuppress: 3,
    },
  });

  console.log(`✅ Created default MSWIM config (id: ${config.id})`);
  console.log(`  Weights: I=${config.weightIntent} F=${config.weightFriction} C=${config.weightClarity} R=${config.weightReceptivity} V=${config.weightValue}`);
  console.log(`  Thresholds: MONITOR≤${config.thresholdMonitor} PASSIVE≤${config.thresholdPassive} NUDGE≤${config.thresholdNudge} ACTIVE≤${config.thresholdActive} ESCALATE>80`);

  // Also create "aggressive" profile (inactive)
  const aggressive = await prisma.scoringConfig.create({
    data: {
      name: "aggressive",
      siteUrl: null,
      isActive: false,

      weightIntent: 0.20,
      weightFriction: 0.30,
      weightClarity: 0.10,
      weightReceptivity: 0.20,
      weightValue: 0.20,

      thresholdMonitor: 24,
      thresholdPassive: 39,
      thresholdNudge: 54,
      thresholdActive: 69,

      minSessionAgeSec: 15,
      maxActivePerSession: 3,
      maxNudgePerSession: 5,
      maxNonPassivePerSession: 8,
      cooldownAfterActiveSec: 60,
      cooldownAfterNudgeSec: 30,
      cooldownAfterDismissSec: 180,
      dismissalsToSuppress: 5,
    },
  });
  console.log(`✅ Created "aggressive" profile (id: ${aggressive.id}, inactive)`);

  // Create "conservative" profile (inactive)
  const conservative = await prisma.scoringConfig.create({
    data: {
      name: "conservative",
      siteUrl: null,
      isActive: false,

      weightIntent: 0.30,
      weightFriction: 0.20,
      weightClarity: 0.20,
      weightReceptivity: 0.15,
      weightValue: 0.15,

      thresholdMonitor: 39,
      thresholdPassive: 59,
      thresholdNudge: 74,
      thresholdActive: 89,

      minSessionAgeSec: 60,
      maxActivePerSession: 1,
      maxNudgePerSession: 2,
      maxNonPassivePerSession: 4,
      cooldownAfterActiveSec: 300,
      cooldownAfterNudgeSec: 120,
      cooldownAfterDismissSec: 600,
      dismissalsToSuppress: 2,
    },
  });
  console.log(`✅ Created "conservative" profile (id: ${conservative.id}, inactive)`);

  console.log("\n✅ MSWIM seed complete! 3 profiles created.");
}

main()
  .catch((error) => {
    console.error("❌ Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
