#!/usr/bin/env tsx
// ============================================================================
// Seed Script: Friction Catalog
// Verifies that the friction catalog (F001–F325) is loaded and accessible.
// The catalog lives as constants in @ava/shared — no DB seeding needed.
// This script validates data integrity.
// ============================================================================

import {
  FRICTION_CATALOG,
  FrictionCategory,
  getAllFrictionIds,
  getScenariosByCategory,
  SEVERITY_SCORES,
  getSeverity,
} from "@ava/shared";

function main() {
  console.log("═══ AVA Friction Catalog Validation ═══\n");

  // 1. Total count
  const allIds = getAllFrictionIds();
  console.log(`Total friction scenarios: ${allIds.length}`);

  if (allIds.length !== 325) {
    console.error(`❌ Expected 325 scenarios, got ${allIds.length}`);
    process.exit(1);
  }
  console.log("✅ All 325 scenarios present\n");

  // 2. Category breakdown
  console.log("Category breakdown:");
  const categories = Object.values(FrictionCategory);
  for (const category of categories) {
    const scenarios = getScenariosByCategory(category);
    console.log(`  ${category.padEnd(20)} → ${scenarios.length} scenarios`);
  }

  // 3. Severity score coverage
  const severityKeys = Object.keys(SEVERITY_SCORES);
  console.log(`\nSeverity scores: ${severityKeys.length} entries`);

  const missingSeverity = allIds.filter((id) => !SEVERITY_SCORES[id]);
  if (missingSeverity.length > 0) {
    console.warn(`⚠️  Missing severity for: ${missingSeverity.join(", ")}`);
  } else {
    console.log("✅ All friction IDs have severity scores");
  }

  // 4. Severity range check
  const severityValues = Object.values(SEVERITY_SCORES);
  const minSev = Math.min(...severityValues);
  const maxSev = Math.max(...severityValues);
  const avgSev = severityValues.reduce((a, b) => a + b, 0) / severityValues.length;
  console.log(`\nSeverity range: ${minSev}–${maxSev} (avg: ${avgSev.toFixed(1)})`);

  // 5. Sample entries
  console.log("\nSample entries:");
  const samples = ["F001", "F058", "F096", "F117", "F297", "F325"];
  for (const id of samples) {
    const entry = FRICTION_CATALOG.get(id);
    const severity = getSeverity(id);
    if (entry) {
      console.log(`  ${id} [${entry.category}] severity=${severity} — ${entry.scenario}`);
    }
  }

  console.log("\n✅ Friction catalog validation complete!");
}

main();
