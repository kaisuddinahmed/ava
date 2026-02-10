# CLAUDE.md — AVA Project Instructions

## What is AVA

AI shopping assistant. Plug-and-play for ecommerce websites.
Flow is: ONBOARDING (analyze -> map -> verify -> activate) then runtime TRACK -> EVALUATE -> INTERVENE.
Onboarding maps 614 behavior patterns (B001-B614) and 325 friction scenarios (F001-F325) to the site's real functions/selectors before live intervention.
Full spec in `docs/` and `ava_project_structure.md`.

## Architecture

- **Monorepo**: Turborepo workspaces. `packages/shared`, `packages/db`, `apps/server`, `apps/dashboard`, `apps/widget`, `apps/demo`.
- **Backend** (`apps/server`): Express + WebSocket on ports 8080/8081. Four layers:
  - `src/onboarding/` — runs site analysis, behavior/friction mapping, verification, activation.
  - `src/track/` — receives behavioral events from widget, buffers, stores.
  - `src/evaluate/` — calls Groq LLM API (Llama 3.3 70B), runs MSWIM scoring engine (`src/evaluate/mswim/`).
  - `src/intervene/` — builds intervention payloads, broadcasts via WebSocket.
- **Dashboard** (`apps/dashboard`): React + Vite, port 3000. Three tabs: TRACK / EVALUATE / INTERVENE.
- **Widget** (`apps/widget`): Vanilla TS, Shadow DOM, builds to single IIFE via Vite. Zero framework dependencies. Embeds on any website.
- **Demo** (`apps/demo`): React + Vite, port 4000. Side-by-side mock store + dashboard + integration wizard/progress view.

## Tech Stack

- Runtime: Node.js + TypeScript (strict mode)
- Backend: Express 4, ws 8, groq-sdk (Llama 3.3 70B via Groq)
- Onboarding: site analyzer + rule engine + Groq-assisted mapping
- Frontend: React 18 (dashboard/demo), Vanilla TS (widget)
- DB: Prisma ORM, SQLite (dev), PostgreSQL (prod)
- Build: Turborepo, Vite, terser
- Validation: Zod for all API/WebSocket payloads

## Key Data Models

- `Session` — visitor session with MSWIM tracking fields (totalInterventionsFired, totalDismissals, suppressNonPassive)
- `TrackEvent` — behavioral event with category, eventType, frictionId, rawSignals (JSON)
- `Evaluation` — LLM output + 5 MSWIM scores (intentScore, frictionScore, clarityScore, receptivityScore, valueScore) + compositeScore + tier + gateOverride
- `Intervention` — payload sent to widget + outcome (status, mswimScoreAtFire)
- `ScoringConfig` — tunable MSWIM weights and thresholds per site
- `SiteConfig` — site runtime config + integration lifecycle status
- `AnalyzerRun` — onboarding run status, phase, coverage, confidence, errors
- `BehaviorPatternMapping` — mapping from B001-B614 patterns to site functions/selectors/events
- `FrictionMapping` — mapping from F001-F325 frictions to site detector rules
- `IntegrationStatus` — progress/status history (analyzing, mapped, verified, limited_active, active, failed)
- Schema: `packages/db/prisma/schema.prisma`. Run `npm run db:push` after changes.

## MSWIM Scoring

Formula: `composite = (intent × 0.25) + (friction × 0.25) + (clarity × 0.15) + (receptivity × 0.20) + (value × 0.15)`
All signals 0–100. Weights loaded from `ScoringConfig` table.
Tiers: 0–29 MONITOR, 30–49 PASSIVE, 50–64 NUDGE, 65–79 ACTIVE, 80+ ESCALATE.
12 hard gate overrides in `apps/server/src/evaluate/mswim/gate-checks.ts`.
Signal calculators: `apps/server/src/evaluate/mswim/signals/*.signal.ts`.

## Coding Rules

- All shared types go in `packages/shared/src/types/`. Import as `@ava/shared`.
- All DB access through repositories in `packages/db/src/repositories/`. Import as `@ava/db`.
- Never put business logic in API routes — routes call services, services contain logic.
- WebSocket messages are typed. Every message has `{ type: string, payload: T, session_id: string, timestamp: number }`.
- Widget code must have ZERO external dependencies. No React, no lodash, nothing. Shadow DOM for style isolation.
- Behavior catalog (B001-B614) lives in `packages/shared/src/constants/behavior-pattern-catalog.ts`.
- LLM prompts live in `apps/server/src/evaluate/prompts/`. System prompt instructs LLM to return strict JSON with 5 signal scores.
- Friction catalog (F001–F325) in `packages/shared/src/constants/friction-catalog.ts`. Reference by friction_id everywhere.
- Severity scores per friction_id in `packages/shared/src/constants/severity-scores.ts`.
- Onboarding results must be persisted in mapping/status tables; no in-memory-only integration state.
- Activation is mode-based:
  - `active` only when full go-live thresholds pass.
  - `limited_active` allowed below thresholds to avoid revenue loss, with guarded behavior and feedback loop.

## Commands

```
npm run dev              # Start all apps (Turborepo)
npm run dev:server       # Backend only (:8080 + WS :8081)
npm run dev:dashboard    # Dashboard only (:3000)
npm run dev:widget       # Widget dev (:5173)
npm run dev:demo         # Demo view (:4000)
npm run db:push          # Apply schema to SQLite
npm run db:seed          # Seed behavior catalog + friction catalog + MSWIM defaults
npm run build            # Production build all apps
```

## Environment

Required in `.env`: `GROQ_API_KEY`, `DATABASE_URL`, `PORT`, `WS_PORT`.
MSWIM defaults: `MSWIM_W_INTENT=0.25`, `MSWIM_W_FRICTION=0.25`, `MSWIM_W_CLARITY=0.15`, `MSWIM_W_RECEPTIVITY=0.20`, `MSWIM_W_VALUE=0.15`.
DB overrides env defaults via `ScoringConfig` table.

## Go-Live Modes & Thresholds

`active` (full mode) when all pass:
- Behavior mapping coverage `>= 85%` (B001-B614)
- Friction mapping coverage `>= 80%` (F001-F325)
- Average mapping confidence `>= 0.75`
- Critical journeys pass: add-to-cart, cart, checkout, payment

`limited_active` (revenue-protection mode) is allowed when thresholds are below target, with guardrails:
- TRACK and EVALUATE run immediately.
- INTERVENE is restricted to low-risk scope (PASSIVE + NUDGE by default).
- Use only high-confidence mappings for automated actions.
- Emit structured feedback on unmapped/low-confidence patterns until full thresholds are met.

## File Naming

- Services: `*.service.ts` — business logic orchestrators
- Handlers: `*.handlers.ts` — WebSocket/event handlers
- APIs: `*.api.ts` — Express route handlers
- Signals: `*.signal.ts` — MSWIM signal calculators
- Observers: `*.observer.ts` — widget-side behavior trackers
- Repos: `*.repo.ts` — database access layer
- Mappers: `*.mapper.ts` — onboarding mapping logic (behavior/friction)
- Runner/Verifier: `*runner.ts`, `*verifier.ts` — onboarding execution and validation

## Testing

Write tests alongside source files as `*.test.ts`. Test MSWIM signal calculators with known inputs/outputs. Test gate-checks with edge cases. Test onboarding mappers/verifier with coverage/confidence edge cases. Mock Groq API in evaluate/onboarding tests.

## Do Not

- Do not add dependencies to `apps/widget` — it must be zero-dep vanilla TS.
- Do not call Prisma directly from services — always go through repositories.
- Do not hardcode MSWIM weights — always load from `ScoringConfig` via `config-loader.ts`.
- Do not store raw PII — `visitorId` is an anonymous fingerprint, never email/name.
- Do not skip Zod validation on WebSocket messages — malformed events crash the pipeline.
- Do not set full `active` mode when go-live thresholds fail; use `limited_active`.
- Do not bypass `BehaviorPatternMapping` / `FrictionMapping` tables with hardcoded per-site logic.
