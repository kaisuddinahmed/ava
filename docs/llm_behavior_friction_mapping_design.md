# AVA LLM Mapping Design (No Giant Mapper Files)

## Goal

Use LLM reasoning to map and decide across 614 behavior patterns and 325 friction scenarios without hardcoding huge `if/switch` files.

## Core Principle

Treat behaviors and frictions as **data catalogs**, not code branches.

- Mapper files stay thin orchestration layers.
- Rules/candidates are retrieved dynamically per site/session.
- LLM proposes mappings/decisions in strict JSON.
- Deterministic guardrails approve/block actions.

## High-Level Architecture

1. Catalog layer (source of truth):
- `BehaviorPatternCatalog` (B001-B614): id, category, description, detection hints, linked friction IDs.
- `FrictionScenarioCatalog` (F001-F325): id, category, scenario, detector hints, suggested interventions.

2. Site onboarding layer:
- Analyzer builds site function graph (ATC/search/cart/checkout/payment).
- Mapper retrieves relevant catalog candidates and maps them to site selectors/events.
- Writes mappings to DB (`BehaviorPatternMapping`, `FrictionMapping`) with confidence/evidence.

3. Runtime decision layer:
- Retrieve only mapped, active, high-confidence items for the current session context.
- Prompt LLM with compact candidate set and recent event summary.
- LLM returns strict JSON (detected behaviors, detected frictions, scores, reasoning, proposed action).
- Server applies MSWIM + gate checks + integration mode guardrails (`active` / `limited_active`).

4. Feedback loop:
- Log accepted/rejected mappings and intervention outcomes.
- Store low-confidence/unmapped gaps for operator review.
- Re-run onboarding improvements incrementally (no full remap required).

## Why This Avoids Huge Files

- `behavior-mapper.ts` and `friction-mapper.ts` only:
  - load candidates
  - run matching/scoring
  - persist mappings
- 614/325 domain knowledge lives in catalog data (DB/seed JSON), not in code logic.

## Data Model (Recommended)

Use existing onboarding models already added:
- `AnalyzerRun`
- `BehaviorPatternMapping`
- `FrictionMapping`
- `IntegrationStatus`

Add/maintain two canonical catalog tables (or seeded JSON mirrored to DB):
- `BehaviorPatternCatalog`
  - `patternId` (`B001...B614`), `category`, `description`, `detectionHints` (JSON), `linkedFrictions` (JSON), `isActive`
- `FrictionScenarioCatalog`
  - `frictionId` (`F001...F325`), `category`, `scenario`, `detectorHints` (JSON), `defaultAction`, `severity`, `isActive`

Optional feedback table:
- `MappingFeedback`
  - `siteConfigId`, `mappingType` (behavior/friction), `catalogId`, `verdict` (correct/incorrect/partial), `notes`, `createdAt`

## Retrieval Strategy (Onboarding + Runtime)

### Onboarding Retrieval

Inputs:
- platform
- site function graph
- available selectors/events

Candidate selection:
- Filter catalog by platform compatibility + required signals.
- Rank candidates by overlap with detected site functions.
- Send top-K candidates to LLM for semantic matching and confidence.

### Runtime Retrieval

Inputs:
- session event window (recent N events)
- page type + funnel stage
- active site mappings

Candidate selection:
- Use mapped behaviors/frictions relevant to current page and event types.
- Keep prompt compact (top-K by confidence + recency relevance).

## LLM Prompt Contract (Strict JSON)

LLM output must include:
- `detected_behavior_ids`: `string[]`
- `detected_friction_ids`: `string[]`
- `signals`: intent/friction/clarity/receptivity/value (0-100)
- `recommended_action`: string
- `confidence`: 0-1
- `reasoning`: short text

Server rejects output if:
- invalid JSON
- unknown IDs
- confidence below configured floor for automated use

## Safety and Revenue Modes

`active`:
- full thresholds passed
- full intervention policy allowed

`limited_active`:
- onboarding below thresholds, but system starts to avoid revenue loss
- TRACK + EVALUATE fully enabled
- INTERVENE restricted to low-risk scope (PASSIVE/NUDGE by default)
- only high-confidence mappings used for auto actions

## Learning Loop (No Fine-Tuning Required Initially)

Phase 1:
- Prompt + retrieval + deterministic guards
- collect outcomes and operator feedback

Phase 2:
- improve ranking and confidence calibration
- tighten/expand thresholds per site segment

Phase 3 (optional):
- fine-tune or adapter training using accepted mappings + outcomes
- keep catalogs as source of truth even after tuning

## Implementation Plan (Practical)

1. Create catalog seeds:
- `scripts/seed-behavior-pattern-catalog.ts`
- `scripts/seed-friction-scenario-catalog.ts`

2. Build thin mappers:
- `apps/server/src/onboarding/behavior-mapper.ts`
- `apps/server/src/onboarding/friction-mapper.ts`

3. Add retrieval utilities:
- `apps/server/src/onboarding/catalog-retriever.ts`
- `apps/server/src/onboarding/confidence-scorer.ts`

4. Wire onboarding runner:
- `apps/server/src/onboarding/analyzer-runner.ts`

5. Add feedback endpoints:
- submit mapping corrections
- list low-confidence/unmapped items

## Non-Goals

- Do not place 614/325 logic in massive hardcoded TypeScript switch blocks.
- Do not require immediate model fine-tuning to go live.
- Do not allow low-confidence autonomous actions in `limited_active`.
