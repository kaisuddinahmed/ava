# AVA Reorganization & New Architecture Build Plan

## Constraints
- **DO NOT TOUCH**: `packages/agent/` (demo frontend) and `packages/demo-view/`
- **Keep intact**: `packages/analyst/` (old backend — remove later)
- **Keep intact**: `docs/` (reference implementations)
- **Keep intact**: `packages/shared/types.ts` (old types — will coexist with new)

## Phase 1: Project Scaffolding & Config

**Goal**: Set up Turborepo, root configs, new directory structure

### Files to create/modify:
1. **Root `package.json`** — Update: add `apps/*` to workspaces, add turbo + tsx devDeps, add new scripts
2. **`turbo.json`** — Turborepo pipeline config (dev, build, db:push, db:seed)
3. **`tsconfig.base.json`** — Base TS config all packages/apps extend
4. **`.env.example`** — Template with all env vars (ports, DB, Anthropic, MSWIM defaults)
5. **Update `.env`** — Add DATABASE_URL, ANTHROPIC_API_KEY placeholder, MSWIM vars
6. Create directories: `apps/server/src/`, `apps/dashboard/src/`, `apps/widget/src/`, `packages/db/`
7. Install: `turbo`, `tsx`, `typescript` as root devDeps

## Phase 2: `packages/shared` — Types, Constants, Utils

**Goal**: Build the complete shared type system for the new MSWIM architecture

### New directory structure:
```
packages/shared/
├── package.json (update)
├── tsconfig.json (new)
└── src/
    ├── index.ts (barrel export)
    ├── types/
    │   ├── events.ts        — TrackEvent, RawSignal, PageContext, UserContext
    │   ├── evaluation.ts    — EvaluationResult, FrictionDetection, LLMResponse
    │   ├── intervention.ts  — InterventionCommand, InterventionPayload, InterventionStatus
    │   ├── session.ts       — SessionState, SessionMetadata
    │   ├── widget.ts        — WidgetMessage, ProductCard, ComparisonCard, UIAdjustment
    │   └── mswim.ts         — MSWIMSignals, MSWIMConfig, MSWIMResult, SignalWeights, ScoreTier, GateOverride
    ├── constants/
    │   ├── friction-catalog.ts    — F001-F325 friction IDs with categories + severity
    │   ├── severity-scores.ts     — Severity score lookup per friction_id
    │   ├── intervention-types.ts  — MONITOR/PASSIVE/NUDGE/ACTIVE/ESCALATE constants
    │   └── mswim-defaults.ts      — Default weights, thresholds, gate rule constants
    └── utils/
        ├── mswim.ts    — Pure MSWIM composite calculator function
        └── helpers.ts  — Clamp, UUID, timestamp utilities
```

- Old `types.ts` stays at root for backward compat with existing packages

## Phase 3: `packages/db` — Prisma + SQLite

**Goal**: Database layer with schema and repositories

### Files:
```
packages/db/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma    — Session, TrackEvent, Evaluation, Intervention, ScoringConfig, SiteConfig
└── src/
    ├── index.ts         — Export client + repositories
    ├── client.ts        — PrismaClient singleton
    └── repositories/
        ├── session.repo.ts
        ├── event.repo.ts
        ├── evaluation.repo.ts
        ├── intervention.repo.ts
        └── scoring-config.repo.ts
```

- Schema matches `ava_project_structure.md` exactly (Session with MSWIM tracking, Evaluation with 5 signals, ScoringConfig for weight profiles)
- Run `npx prisma db push` to create SQLite tables

## Phase 4: `apps/server` — New Backend with MSWIM Engine

**Goal**: Modular Express + WebSocket server with the MSWIM scoring engine

### Files:
```
apps/server/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              — Express server + WS setup on ports 8080/8081
    ├── config.ts             — Load env vars
    │
    ├── track/
    │   ├── track.service.ts      — Orchestrates event ingestion
    │   ├── track.handlers.ts     — WebSocket message handlers
    │   ├── event-normalizer.ts   — Standardize event shape
    │   ├── session-manager.ts    — Create/update/expire sessions
    │   └── event-buffer.ts       — Batch events (5s / 10 events) → trigger evaluate
    │
    ├── evaluate/
    │   ├── evaluate.service.ts   — Orchestrates: context → LLM → MSWIM → decision
    │   ├── analyst.ts            — Anthropic Claude API call
    │   ├── context-builder.ts    — Assemble session + events + history for LLM
    │   ├── friction-detector.ts  — Rule-based fallback detectors
    │   ├── prompts/
    │   │   ├── system-prompt.ts  — LLM system prompt (from ava_project_structure.md)
    │   │   ├── evaluate-prompt.ts — Build user message for LLM
    │   │   └── friction-detect.ts — Friction detection prompt
    │   ├── mswim/
    │   │   ├── mswim.engine.ts       — Orchestrator: signals → composite → gates → tier
    │   │   ├── signals/
    │   │   │   ├── intent.signal.ts      — Intent score computation
    │   │   │   ├── friction.signal.ts    — Friction score w/ catalog severity
    │   │   │   ├── clarity.signal.ts     — Clarity score adjustments
    │   │   │   ├── receptivity.signal.ts — Server-side receptivity from session state
    │   │   │   └── value.signal.ts       — Cart value + LTV computation
    │   │   ├── gate-checks.ts        — 12 hard gate override rules
    │   │   ├── tier-resolver.ts      — Score → tier mapping
    │   │   └── config-loader.ts      — Load ScoringConfig from DB (cached 60s)
    │   └── decision-engine.ts    — Combine MSWIM tier + LLM recommendation → final decision
    │
    ├── intervene/
    │   ├── intervene.service.ts  — Build and dispatch intervention
    │   ├── payload-builder.ts    — friction_id + tier → structured widget command
    │   ├── message-templates.ts  — Contextual message templates
    │   └── action-registry.ts    — Registry of all intervention action codes
    │
    ├── broadcast/
    │   ├── ws-server.ts          — WebSocket server setup
    │   ├── channel-manager.ts    — Dashboard/widget/demo channels
    │   └── broadcast.service.ts  — Send to appropriate channels
    │
    └── api/
        ├── routes.ts             — Express router
        ├── sessions.api.ts       — Session CRUD endpoints
        ├── events.api.ts         — Event query endpoints
        ├── config.api.ts         — Site config endpoints
        └── scoring-config.api.ts — MSWIM weight profile CRUD
```

## Phase 5: Seed Scripts

```
scripts/
├── seed-friction-catalog.ts  — Insert F001-F325 severity scores into constants
└── seed-mswim-defaults.ts    — Seed default ScoringConfig into DB
```

## Execution Order

1. Phase 1: Scaffold + configs (~5 min)
2. Phase 2: Shared types + constants + utils (~15 min)
3. Phase 3: Prisma DB setup (~10 min)
4. Phase 4: Server with MSWIM engine (~30 min)
5. Phase 5: Seed scripts (~5 min)

Dashboard and widget will come in a follow-up session — the server + shared + db are the critical foundation.

## What's NOT in scope for this session
- `apps/dashboard/` — Later
- `apps/widget/` — Later
- `apps/demo/` — Later
- Modifying `packages/agent/` or `packages/demo-view/`
- Removing `packages/analyst/` (old backend stays until new is proven)
