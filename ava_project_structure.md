# AVA — AI Virtual Shopping Assistant
## Project Structure & Build Plan for Claude Code
### Scoring Engine: MSWIM (Multi-Signal Weighted Intervention Model)

---

## ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       ANALYST SERVER (Backend)                           │
│                         Node.js + TypeScript                            │
│                                                                          │
│  ┌──────────────┐    ┌───────────────────────┐    ┌──────────────────┐  │
│  │    TRACK      │───▶│      EVALUATE          │───▶│    INTERVENE      │  │
│  │              │    │                       │    │                  │  │
│  │ Raw event    │    │ LLM-powered analyst   │    │ Intervention     │  │
│  │ logging      │    │ reasoning & decisions │    │ commands sent    │  │
│  │              │    │                       │    │ to Agent         │  │
│  │ [timestamp]  │    │ ┌───────────────────┐ │    │                  │  │
│  │ User action  │    │ │  MSWIM Scoring    │ │    │ ACTIVE / READY / │  │
│  │              │    │ │                   │ │    │ MONITORING       │  │
│  │              │    │ │ Intent    × 0.25  │ │    │                  │  │
│  │              │    │ │ Friction  × 0.25  │ │    │                  │  │
│  │              │    │ │ Clarity   × 0.15  │ │    │                  │  │
│  │              │    │ │ Receptvty × 0.20  │ │    │                  │  │
│  │              │    │ │ Value     × 0.15  │ │    │                  │  │
│  │              │    │ │                   │ │    │                  │  │
│  │              │    │ │ 0–29  MONITOR     │ │    │                  │  │
│  │              │    │ │ 30–49 PASSIVE     │ │    │                  │  │
│  │              │    │ │ 50–64 NUDGE       │ │    │                  │  │
│  │              │    │ │ 65–79 ACTIVE      │ │    │                  │  │
│  │              │    │ │ 80+   ESCALATE    │ │    │                  │  │
│  │              │    │ └───────────────────┘ │    │                  │  │
│  └──────────────┘    └───────────────────────┘    └──────────────────┘  │
│         │                       │                        │              │
│         └───────────────────────┴────────────────────────┘              │
│                                 │                                        │
│                       Broadcast via WebSocket                            │
└─────────────────────────────────┼────────────────────────────────────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │   Analyst     │  │  Agent Widget │  │  Demo View   │
      │   Dashboard   │  │  (on store)  │  │  (port 4000) │
      │  (port 3000)  │  │              │  │              │
      │              │  │  Receives    │  │ Side-by-side │
      │  TRACK tab   │  │  intervention│  │ store +      │
      │  EVALUATE tab│  │  commands    │  │ dashboard    │
      │  INTERVENE   │  │              │  │              │
      │  tab         │  │  AVA Agent   │  │              │
      └──────────────┘  └──────────────┘  └──────────────┘
```

---

## MSWIM — Multi-Signal Weighted Intervention Model

### Core Formula

```
MSWIM_Score = (Intent × W_intent) + (Friction × W_friction) + (Clarity × W_clarity)
            + (Receptivity × W_receptivity) + (Value × W_value)
```

All 5 signals scored **0–100**. All weights configurable. Default weights:

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| **Intent** | 0.25 | How close is user to purchasing? Funnel position + cart state + behavioral signals |
| **Friction** | 0.25 | How severe is the detected friction? From catalog severity (F001–F325) |
| **Clarity** | 0.15 | How confident are we in the friction diagnosis? Corroborating signals + LLM confidence |
| **Receptivity** | 0.20 | How open is user to intervention? Fatigue, dismiss history, engagement depth, user type |
| **Value** | 0.15 | How valuable is this conversion? Cart value, customer LTV, acquisition channel |

### Signal Computation

#### Intent (0–100)

```
Base score from funnel position:
  landing = 10, category = 25, search = 30, pdp = 45, cart = 70, checkout = 85

Additive boosts:
  + 10  cart has items
  + 5   user is logged in
  + 8   repeat customer (recognized visitor)
  + 3   per 2 minutes of session time (max +15)
  + 5   added product to wishlist
  + 10  engaged with checkout form fields

Multiplicative:
  × 1.2  on checkout page
  × 0.7  if bouncing pattern detected (rapid back-button presses)

Cap at 100.
```

#### Friction (0–100)

```
Static severity per friction_id from catalog:

  F001 (slow page load)         = 45
  F002 (quick bounce)           = 30
  F028 (zero search results)    = 65
  F058 (ATC hover hesitation)   = 55
  F068 (cart abandonment)       = 80
  F089 (forced account creation)= 90
  F091 (form validation errors) = 60
  F094 (payment field pause)    = 75
  F117 (sticker shock)          = 70
  F131 (missing SSL indicator)  = 50
  F297 (decision paralysis)     = 65
  ... (full lookup table for all 325 friction_ids)

If multiple frictions active simultaneously:
  Use highest severity as base, add +5 per additional friction (max +15)
```

#### Clarity (0–100)

```
Base: LLM returns explicit confidence (0–100) in its evaluation response

Adjustments:
  + 15  if 3+ corroborating behavioral signals support the diagnosis
  + 10  if friction matches a rule-based detector (not just LLM inference)
  + 5   if similar friction detected in previous session for same visitor
  - 20  if LLM notes ambiguity or multiple possible explanations
  - 10  if user behavior contradicts the friction
  - 15  if session < 60 seconds (insufficient data)

Cap at 100, floor at 0.
```

#### Receptivity (0–100)

```
Start at 80 (assume receptive).

Decrements:
  - 15  per non-passive intervention already fired this session
  - 25  per user dismissal this session
  - 10  if last intervention < 2 minutes ago
  - 10  if user is in rapid browsing mode (< 5 sec per page)
  - 5   if mobile device

Increments:
  + 10  if user voluntarily opened widget or interacted with AVA
  + 5   if user converted from previous AVA intervention (cross-session)
  + 10  if user idle > 60 seconds
  + 5   if first-time visitor

Cap at 100, floor at 0.
```

#### Value (0–100)

```
Cart-based (if cart has items):
  $0–$20 = 15, $21–$50 = 30, $51–$100 = 50, $101–$200 = 70, $201–$500 = 85, $500+ = 95

No-cart (browsing):
  Top 20% price product = 60, mid-range = 35, bottom 20% = 15

Customer LTV boosts:
  + 15  repeat customer with purchases
  + 10  logged-in customer
  + 5   came from paid ad

Cap at 100.
```

### Tiered Output

```
MSWIM Score    Tier         Description
 0 – 29        MONITOR      Log only, no action taken
30 – 49        PASSIVE      Silent UI adjustment (no widget interaction)
50 – 64        NUDGE        Single message bubble above widget
65 – 79        ACTIVE       Widget opens with cards/suggestions
80 – 100       ESCALATE     Maximum effort or human handoff
```

### Hard Gate Overrides (12 Rules)

```
ALWAYS SUPPRESS (non-passive) IF:
  1.  Session age < 30 seconds
  2.  Receptivity < 15
  3.  User dismissed ≥ 3 times → suppress ALL non-passive for session
  4.  Same friction_id already intervened on
  5.  Cooldown active: 2 min after ACTIVE, 1 min after NUDGE, 5 min after dismiss
  6.  Caps hit: 2 ACTIVE/session, 3 NUDGE/session, 6 total non-passive/session

ALWAYS FIRE AS PASSIVE (bypass scoring) IF:
  7.  Technical error (broken button, JS crash, 404 on key page)
  8.  Out-of-stock product actively viewed
  9.  Shipping cost > 20% of cart value, shipping bar not yet shown

ALWAYS ESCALATE (bypass scoring) IF:
  10. Payment failed 2+ times
  11. Checkout timeout (>5 min) with cart > $200
  12. Help-seeking search ("contact", "support", "help", "phone")
```

### Weight Tuning (Future A/B Testing)

```
All weights/thresholds stored in ScoringConfig table.

To fine-tune:
  1. Log every MSWIM evaluation (5 signals + composite + decision + outcome)
  2. Track outcome: dismissed | ignored | converted
  3. A/B test weight profiles per site or segment
  4. Optimize: conversions / interventions_fired
  5. Penalize: dismiss_rate > 20%
```

---

## TECH STACK

| Layer | Tech | Why |
|-------|------|-----|
| **TRACK** | Vanilla JS snippet → WebSocket → Node.js server | Zero host dependencies. MutationObserver + event listeners. Real-time streaming. |
| **EVALUATE** | Node.js + Anthropic Claude API + **MSWIM engine** | LLM reasons about friction, outputs 5 signal scores. MSWIM applies configurable weights → tier. |
| **INTERVENE** | Node.js → WebSocket broadcast to widget | Structured JSON commands. Tier from MSWIM score. |
| **Analyst Dashboard** | React + Vite (port 3000) | 3-tab view. MSWIM breakdown visualized in EVALUATE tab. |
| **Agent Widget (AVA)** | Vanilla JS + Shadow DOM | Zero framework dependency. Injects into any website. |
| **Demo View** | React + Vite (port 4000) | Side-by-side mock store + dashboard. MSWIM tuning panel. |
| **Database** | SQLite (dev) → PostgreSQL (prod) via Prisma | Session state, events, interventions, MSWIM config. |
| **Message Queue** | In-memory (dev) → Redis (prod) | Buffers TRACK events for batch EVALUATE. |

---

## PROJECT STRUCTURE

```
ava/
├── package.json
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── .env
├── docker-compose.yml
│
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   ├── events.ts            # TrackEvent, RawSignal
│   │       │   ├── evaluation.ts        # EvaluationResult, FrictionDetection
│   │       │   ├── intervention.ts      # InterventionCommand, PayloadTypes
│   │       │   ├── session.ts           # SessionState, UserContext
│   │       │   ├── widget.ts            # WidgetMessage, ProductCard, ComparisonCard
│   │       │   └── mswim.ts             # ★ MSWIMSignals, MSWIMConfig, MSWIMResult,
│   │       │                            #   SignalWeights, ScoreTier, GateOverride
│   │       ├── constants/
│   │       │   ├── friction-catalog.ts  # F001–F325 friction scenarios
│   │       │   ├── severity-scores.ts   # Severity per friction_id
│   │       │   ├── intervention-types.ts# MONITOR/PASSIVE/NUDGE/ACTIVE/ESCALATE
│   │       │   └── mswim-defaults.ts    # ★ Default weights, thresholds, gate rules
│   │       └── utils/
│   │           ├── mswim.ts             # ★ MSWIM composite calculator (pure function)
│   │           └── helpers.ts
│   │
│   └── db/
│       ├── package.json
│       ├── tsconfig.json
│       ├── prisma/
│       │   ├── schema.prisma            # ★ Includes ScoringConfig table
│       │   └── migrations/
│       └── src/
│           ├── index.ts
│           ├── client.ts
│           └── repositories/
│               ├── session.repo.ts
│               ├── event.repo.ts
│               ├── evaluation.repo.ts
│               ├── intervention.repo.ts
│               └── scoring-config.repo.ts # ★ CRUD for MSWIM weight profiles
│
├── apps/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── config.ts
│   │       │
│   │       ├── track/
│   │       │   ├── track.service.ts
│   │       │   ├── track.handlers.ts
│   │       │   ├── event-normalizer.ts
│   │       │   ├── session-manager.ts
│   │       │   └── event-buffer.ts
│   │       │
│   │       ├── evaluate/
│   │       │   ├── evaluate.service.ts
│   │       │   ├── analyst.ts
│   │       │   ├── prompts/
│   │       │   │   ├── system-prompt.ts
│   │       │   │   ├── evaluate-prompt.ts
│   │       │   │   └── friction-detect.ts
│   │       │   ├── context-builder.ts
│   │       │   ├── friction-detector.ts
│   │       │   │
│   │       │   ├── mswim/               # ★ MSWIM SCORING ENGINE
│   │       │   │   ├── mswim.engine.ts  # Orchestrator: 5 signals → composite → gates → tier
│   │       │   │   ├── signals/
│   │       │   │   │   ├── intent.signal.ts
│   │       │   │   │   ├── friction.signal.ts
│   │       │   │   │   ├── clarity.signal.ts
│   │       │   │   │   ├── receptivity.signal.ts
│   │       │   │   │   └── value.signal.ts
│   │       │   │   ├── gate-checks.ts   # 12 hard override rules
│   │       │   │   ├── tier-resolver.ts # Score → MONITOR/PASSIVE/NUDGE/ACTIVE/ESCALATE
│   │       │   │   └── config-loader.ts # Load weights from DB (per-site, cached 60s)
│   │       │   │
│   │       │   └── decision-engine.ts
│   │       │
│   │       ├── intervene/
│   │       │   ├── intervene.service.ts
│   │       │   ├── payload-builder.ts
│   │       │   ├── product-intelligence.ts
│   │       │   ├── message-templates.ts
│   │       │   └── action-registry.ts
│   │       │
│   │       ├── broadcast/
│   │       │   ├── ws-server.ts
│   │       │   ├── channel-manager.ts
│   │       │   └── broadcast.service.ts
│   │       │
│   │       ├── site-analyzer/
│   │       │   ├── analyzer.service.ts
│   │       │   ├── hook-generator.ts
│   │       │   ├── selectors.ts
│   │       │   └── platform-detectors/
│   │       │       ├── shopify.ts
│   │       │       ├── woocommerce.ts
│   │       │       ├── magento.ts
│   │       │       └── generic.ts
│   │       │
│   │       └── api/
│   │           ├── routes.ts
│   │           ├── sessions.api.ts
│   │           ├── events.api.ts
│   │           ├── config.api.ts
│   │           ├── analytics.api.ts
│   │           └── scoring-config.api.ts # ★ CRUD for MSWIM profiles
│   │
│   ├── dashboard/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── hooks/
│   │       │   ├── useWebSocket.ts
│   │       │   └── useSessionData.ts
│   │       ├── components/
│   │       │   ├── Layout.tsx
│   │       │   ├── SessionSelector.tsx
│   │       │   ├── tabs/
│   │       │   │   ├── TrackTab.tsx
│   │       │   │   ├── EvaluateTab.tsx
│   │       │   │   └── InterveneTab.tsx
│   │       │   ├── track/
│   │       │   │   ├── EventList.tsx
│   │       │   │   ├── EventItem.tsx
│   │       │   │   └── EventFilters.tsx
│   │       │   ├── evaluate/
│   │       │   │   ├── AnalystNarrative.tsx
│   │       │   │   ├── MSWIMBreakdown.tsx    # ★ 5-signal radar + score gauge
│   │       │   │   ├── SignalTimeline.tsx     # ★ Signal evolution line chart
│   │       │   │   └── SessionTimeline.tsx
│   │       │   └── intervene/
│   │       │       ├── InterventionStatus.tsx
│   │       │       ├── MSWIMGate.tsx          # ★ Gate check visual (pass/block/N/A)
│   │       │       ├── InterventionHistory.tsx
│   │       │       └── ConversionFunnel.tsx
│   │       └── styles/
│   │           └── dashboard.css
│   │
│   ├── widget/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ava.ts
│   │       ├── tracker/
│   │       │   ├── collector.ts
│   │       │   ├── observers/
│   │       │   │   ├── click.observer.ts
│   │       │   │   ├── scroll.observer.ts
│   │       │   │   ├── hover.observer.ts
│   │       │   │   ├── form.observer.ts
│   │       │   │   ├── navigation.observer.ts
│   │       │   │   ├── cart.observer.ts
│   │       │   │   ├── search.observer.ts
│   │       │   │   ├── visibility.observer.ts
│   │       │   │   ├── copy.observer.ts
│   │       │   │   └── performance.observer.ts
│   │       │   ├── auto-detect.ts
│   │       │   └── ws-transport.ts
│   │       ├── agent/
│   │       │   ├── agent.controller.ts
│   │       │   ├── passive-executor.ts
│   │       │   └── intervention-handler.ts
│   │       ├── ui/
│   │       │   ├── widget-shell.ts
│   │       │   ├── components/
│   │       │   │   ├── toggle-button.ts
│   │       │   │   ├── nudge-bubble.ts
│   │       │   │   ├── panel.ts
│   │       │   │   ├── message-bubble.ts
│   │       │   │   ├── product-card.ts
│   │       │   │   ├── comparison-card.ts
│   │       │   │   ├── typing-indicator.ts
│   │       │   │   └── input-bar.ts
│   │       │   ├── styles/
│   │       │   │   └── widget.css
│   │       │   └── animations.ts
│   │       └── config.ts
│   │
│   └── demo/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── components/
│           │   ├── MockStore.tsx
│           │   ├── DashboardEmbed.tsx
│           │   ├── SplitView.tsx
│           │   └── ScenarioRunner.tsx
│           └── mock-data/
│               ├── products.ts
│               └── scenarios.ts
│
├── scripts/
│   ├── setup.sh
│   ├── dev.sh
│   ├── generate-tracker.sh
│   ├── seed-friction-catalog.ts
│   └── seed-mswim-defaults.ts       # ★ Seed default weight profile
│
└── docs/
    ├── ARCHITECTURE.md
    ├── MSWIM.md                      # ★ Full MSWIM algorithm docs
    ├── TRACK-EVENTS.md
    ├── EVALUATE-PROMPTS.md
    ├── FRICTION-CATALOG.md
    ├── INTERVENTION-ACTIONS.md
    └── EMBED-GUIDE.md
```

---

## DATABASE SCHEMA (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Session {
  id              String   @id @default(uuid())
  visitorId       String?
  siteUrl         String
  startedAt       DateTime @default(now())
  lastActivityAt  DateTime @default(now())
  deviceType      String   // mobile | tablet | desktop
  referrerType    String   // direct | organic | paid | social | email
  isLoggedIn      Boolean  @default(false)
  isRepeatVisitor Boolean  @default(false)
  cartValue       Float    @default(0)
  cartItemCount   Int      @default(0)
  status          String   @default("active") // active | idle | ended

  // ★ MSWIM session-level tracking
  totalInterventionsFired  Int     @default(0)
  totalDismissals          Int     @default(0)
  totalConversions         Int     @default(0)
  suppressNonPassive       Boolean @default(false)

  events          TrackEvent[]
  evaluations     Evaluation[]
  interventions   Intervention[]
}

model TrackEvent {
  id          String   @id @default(uuid())
  sessionId   String
  session     Session  @relation(fields: [sessionId], references: [id])
  timestamp   DateTime @default(now())
  category    String   // navigation | search | product | cart | checkout
  eventType   String   // click | scroll | hover | form_input | page_view
  frictionId  String?  // F001–F325 if detected client-side
  pageType    String   // landing | category | pdp | cart | checkout | other
  pageUrl     String
  rawSignals  String   // JSON blob
  metadata    String?

  @@index([sessionId, timestamp])
  @@index([frictionId])
}

model Evaluation {
  id             String   @id @default(uuid())
  sessionId      String
  session        Session  @relation(fields: [sessionId], references: [id])
  timestamp      DateTime @default(now())
  eventBatchIds  String   // JSON array of TrackEvent IDs

  // LLM output
  narrative      String   // Prose reasoning (EVALUATE tab)
  frictionsFound String   // JSON array of friction_ids

  // ★ MSWIM 5 signals (0–100)
  intentScore       Float
  frictionScore     Float
  clarityScore      Float
  receptivityScore  Float
  valueScore        Float

  // ★ MSWIM composite + decision
  compositeScore    Float   // Weighted sum
  weightsUsed       String  // JSON: weight profile applied
  tier              String  // MONITOR | PASSIVE | NUDGE | ACTIVE | ESCALATE
  decision          String  // fire | suppress | queue
  gateOverride      String? // Which gate triggered, null if none
  interventionType  String? // passive | nudge | active | escalate
  reasoning         String  // Why

  intervention      Intervention?

  @@index([sessionId, timestamp])
  @@index([tier])
}

model Intervention {
  id             String   @id @default(uuid())
  sessionId      String
  session        Session  @relation(fields: [sessionId], references: [id])
  evaluationId   String   @unique
  evaluation     Evaluation @relation(fields: [evaluationId], references: [id])
  timestamp      DateTime @default(now())

  type           String   // passive | nudge | active | escalate
  actionCode     String
  frictionId     String
  payload        String   // JSON sent to widget

  // ★ Outcome tracking (feeds MSWIM tuning)
  status           String    @default("sent") // sent | delivered | dismissed | converted | ignored
  deliveredAt      DateTime?
  dismissedAt      DateTime?
  convertedAt      DateTime?
  ignoredAt        DateTime?
  conversionAction String?

  // ★ MSWIM snapshot at fire time (for A/B analysis)
  mswimScoreAtFire Float
  tierAtFire       String

  @@index([sessionId, timestamp])
  @@index([status])
  @@index([type, status])
}

// ★ Configurable MSWIM weight profiles
model ScoringConfig {
  id       String  @id @default(uuid())
  name     String  // "default", "aggressive", "conservative", "site_xyz"
  siteUrl  String? // null = global default, or site-specific override
  isActive Boolean @default(false)

  // Signal weights (must sum to 1.0)
  weightIntent        Float @default(0.25)
  weightFriction      Float @default(0.25)
  weightClarity       Float @default(0.15)
  weightReceptivity   Float @default(0.20)
  weightValue         Float @default(0.15)

  // Tier thresholds
  thresholdMonitor  Float @default(29)
  thresholdPassive  Float @default(49)
  thresholdNudge    Float @default(64)
  thresholdActive   Float @default(79)

  // Gate config
  minSessionAgeSec        Int @default(30)
  maxActivePerSession     Int @default(2)
  maxNudgePerSession      Int @default(3)
  maxNonPassivePerSession Int @default(6)
  cooldownAfterActiveSec  Int @default(120)
  cooldownAfterNudgeSec   Int @default(60)
  cooldownAfterDismissSec Int @default(300)
  dismissalsToSuppress    Int @default(3)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([siteUrl, isActive])
}

model SiteConfig {
  id             String   @id @default(uuid())
  siteUrl        String   @unique
  platform       String   // shopify | woocommerce | magento | custom
  trackingConfig String   // JSON: auto-detected selectors
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

---

## KEY FILE CONTENTS

### 1. Root package.json

```json
{
  "name": "ava",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "dev:server": "turbo run dev --filter=@ava/server",
    "dev:dashboard": "turbo run dev --filter=@ava/dashboard",
    "dev:widget": "turbo run dev --filter=@ava/widget",
    "dev:demo": "turbo run dev --filter=@ava/demo",
    "db:push": "turbo run db:push --filter=@ava/db",
    "db:seed": "tsx scripts/seed-friction-catalog.ts && tsx scripts/seed-mswim-defaults.ts",
    "setup": "bash scripts/setup.sh"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.6.0",
    "tsx": "^4.19.0"
  }
}
```

### 2. Server package.json

```json
{
  "name": "@ava/server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@ava/shared": "workspace:*",
    "@ava/db": "workspace:*",
    "@anthropic-ai/sdk": "^0.39.0",
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.0",
    "uuid": "^10.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/ws": "^8.5.0",
    "@types/cors": "^2.8.0",
    "@types/uuid": "^10.0.0"
  }
}
```

### 3. Widget vite.config.ts

```typescript
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "AVA",
      fileName: "ava-widget",
      formats: ["iife"],
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: "terser",
    cssCodeSplit: false,
  },
  define: { "process.env.NODE_ENV": '"production"' },
});
```

### 4. Embed snippet

```html
<!-- AVA Shopping Assistant -->
<script>
  window.__AVA_CONFIG__ = {
    serverUrl: "wss://your-ava-server.com",
    siteId: "site_abc123",
    agentName: "AVA",
    brandColor: "#1A1A2E",
    accentColor: "#E94560",
    position: "bottom-right",
  };
</script>
<script src="https://cdn.yourdomain.com/ava-widget.iife.js" async></script>
```

---

## EVALUATE LAYER — LLM INTEGRATION (MSWIM-aware)

### System Prompt (apps/server/src/evaluate/prompts/system-prompt.ts)

```
You are AVA's Analyst — a behavioral analyst AI embedded in an ecommerce store.

You receive a stream of user behavioral events (TRACK data) for a single shopping session.
Your job is to:

1. NARRATE: Describe what the user is doing in natural prose (story form)
2. ANALYZE: Reason about their intent, hesitation, friction, and emotional state
3. SCORE: Provide raw scores for all 5 MSWIM signals
4. DECIDE: Recommend whether to intervene

═══ MSWIM SIGNALS YOU MUST SCORE ═══

Score each 0–100. The server-side MSWIM engine applies weights and thresholds.

1. INTENT (0–100): How close is this user to making a purchase?
   Consider: funnel position, cart contents, session depth, logged-in status,
   repeat visitor signals, engagement with checkout elements.
   0 = random drive-by, 100 = actively completing payment.

2. FRICTION (0–100): How severe is the friction they're experiencing?
   Match detected behaviors to friction IDs from catalog (F001–F325).
   Use catalog severity as baseline, adjust based on context.
   0 = no friction, 100 = completely blocked from proceeding.

3. CLARITY (0–100): How confident are you in your friction diagnosis?
   High = multiple corroborating signals, obvious pattern.
   Low = ambiguous behavior, multiple possible explanations.
   Be honest — if you're guessing, score low.
   0 = total guess, 100 = unmistakable friction.

4. RECEPTIVITY (0–100): How open is this user to being helped right now?
   Consider: intervention fatigue, dismiss history, browsing pace,
   device type, idle vs active, voluntary widget interactions.
   0 = clearly does not want help, 100 = actively seeking assistance.

5. VALUE (0–100): How valuable is converting this specific user?
   Consider: cart value, product price range, logged-in/repeat status,
   acquisition channel (paid vs organic), potential LTV.
   0 = trivial, 100 = high-value conversion opportunity.

═══ FRICTION CATALOG ═══

Cite specific friction_ids. Examples:
  F028 = zero search results, F058 = ATC hover without clicking,
  F068 = cart abandonment, F089 = forced account creation,
  F117 = sticker shock, F297 = decision paralysis

═══ SESSION CONTEXT ═══

You receive: full event history, session metadata, previous evaluations/interventions.
Understand the user's JOURNEY, not just the latest event.

═══ RULES ═══

- Narrative = story, not data dump
- Be specific about WHAT and WHY
- Cite friction_ids
- 5 signal scores must be defensible from evidence
- If uncertain, LOWER clarity rather than guessing
- Consider full journey, not just last batch

═══ OUTPUT FORMAT (strict JSON) ═══

{
  "narrative": "The user arrived 3 minutes ago from a Google search for 'wireless earbuds under $50'. They've viewed 4 products...",
  "detected_frictions": ["F058", "F073"],
  "signals": {
    "intent": 62,
    "friction": 55,
    "clarity": 78,
    "receptivity": 85,
    "value": 45
  },
  "recommended_action": "nudge_comparison_offer",
  "reasoning": "User is moderately high intent with clear friction. A comparison nudge would help resolve the decision paralysis without being pushy."
}
```

### Evaluation Pipeline Flow

```
Event Buffer (5s / 10 events)
    │
    ▼
Context Builder
    │ Assembles: session metadata + event history + previous evaluations
    ▼
Anthropic Claude API
    │ Returns: narrative + 5 signals + friction_ids + recommendation
    ▼
MSWIM Engine (server-side)
    │
    ├── Load weight profile from ScoringConfig (per-site or global)
    ├── Adjust signals server-side (receptivity from session state, etc.)
    ├── Compute composite = Σ(signal × weight)
    ├── Run 12 gate checks
    │   ├── Gate triggered? → SUPPRESS / FORCE_PASSIVE / FORCE_ESCALATE
    │   └── No gate? → Continue
    ├── Resolve tier: MONITOR / PASSIVE / NUDGE / ACTIVE / ESCALATE
    ▼
Decision Engine
    │ Combines: MSWIM tier + LLM recommended_action + gate overrides
    │ → { fire/suppress/queue, type, action_code, fullMSWIMResult }
    ▼
    ├── fire    → INTERVENE builds payload → broadcast to widget
    ├── suppress → log reason → broadcast evaluation to dashboard only
    └── queue   → hold, re-evaluate on next batch
```

---

## AUTO-DETECTION: How AVA finds tracking hooks on ANY website

```
1. PLATFORM DETECTION
   → Shopify (window.Shopify), WooCommerce (body.woocommerce),
     Magento (require.js config), BigCommerce, custom

2. ADD TO CART BUTTONS
   → [data-action="add-to-cart"], .add-to-cart, button[name="add"],
     form[action*="/cart"] button[type="submit"],
     text matching /add to (cart|bag|basket)/i

3. CART ELEMENTS
   → .cart-count, .cart-total, [data-cart-count],
     Shopify: fetch('/cart.js'), WooCommerce: .cart-contents-count

4. SEARCH
   → input[type="search"], .search-input, [name="q"], [name="search"],
     form[action*="search"] input

5. PRODUCT PAGE
   → meta[property="og:type"][content="product"], .product-detail,
     JSON-LD type=Product

6. PRICE ELEMENTS
   → .price, .product-price, [data-price], meta[itemprop="price"]

7. CHECKOUT
   → URL /checkout or /cart, form with payment fields

8. PAGE TYPE
   → URL patterns + DOM signals → landing | category | pdp | cart | checkout
```

---

## CLAUDE CODE COMMANDS

Execute these in order in your terminal with Claude Code:

### Phase 1: Project Scaffolding
```
Create a new monorepo project called "ava" using Turborepo with TypeScript.
Set up the following workspace packages:
- packages/shared (shared types and constants)
- packages/db (Prisma ORM with SQLite)
- apps/server (Express + WebSocket backend)
- apps/dashboard (React + Vite on port 3000)
- apps/widget (Vanilla TS, Vite IIFE build)
- apps/demo (React + Vite on port 4000)

Use the project structure from the ARCHITECTURE document I'm providing.
Install all dependencies listed in the package.json files.
```

### Phase 2: Shared Types & Database
```
In packages/shared, create all TypeScript types for:
- TrackEvent (behavioral events with friction_id, category, rawSignals)
- EvaluationResult with all 5 MSWIM signal scores (intent, friction, clarity,
  receptivity, value) plus compositeScore, tier, and weightsUsed
- InterventionCommand (type, actionCode, payload with products/comparison/uiAdjustment)
- SessionState, UserContext, PageContext
- ProductCard, ComparisonCard, UIAdjustment
- MSWIMSignals: { intent, friction, clarity, receptivity, value } (all 0–100)
- MSWIMConfig: { weights, thresholds, gateRules } (loaded from ScoringConfig table)
- MSWIMResult: { signals, composite, tier, gateOverride, decision }
- SignalWeights: { wIntent, wFriction, wClarity, wReceptivity, wValue }
- ScoreTier enum: MONITOR | PASSIVE | NUDGE | ACTIVE | ESCALATE
- GateOverride enum: SESSION_TOO_YOUNG | RECEPTIVITY_FLOOR | DISMISS_CAP |
  DUPLICATE_FRICTION | COOLDOWN_ACTIVE | SESSION_CAP | FORCE_PASSIVE_TECHNICAL |
  FORCE_PASSIVE_OOS | FORCE_PASSIVE_SHIPPING | FORCE_ESCALATE_PAYMENT |
  FORCE_ESCALATE_CHECKOUT_TIMEOUT | FORCE_ESCALATE_HELP_SEARCH
- All other enums: FrictionCategory, InterventionType, InterventionStatus

In packages/shared/src/constants/mswim-defaults.ts, define the default weight profile
and all gate rule constants.

In packages/shared/src/utils/mswim.ts, implement the pure MSWIM composite score
calculator: MSWIMSignals + SignalWeights → weighted sum (0–100).

In packages/db, set up Prisma with the schema from this document. Tables: Session
(with MSWIM session tracking), TrackEvent, Evaluation (5 signals + composite + tier
+ gateOverride), Intervention (outcome tracking + MSWIM snapshot), ScoringConfig
(tunable weight profiles), SiteConfig.

Run initial migration. Seed friction catalog (F001–F325) and default MSWIM weight profile.
```

### Phase 3: TRACK Layer
```
Build the TRACK layer in apps/server/src/track/:
- WebSocket handler that receives raw behavioral events from the widget
- Event normalizer that standardizes events from different site structures
- Session manager that creates/updates/expires sessions, maintains MSWIM session
  fields (totalInterventionsFired, totalDismissals, suppressNonPassive)
- Event buffer that batches events (every 5 seconds or 10 events) before
  sending to EVALUATE

Build the client-side tracker in apps/widget/src/tracker/:
- Auto-detect module that discovers site structure (ATC buttons, cart, search,
  product pages) without manual configuration
- Individual observers for: clicks, scroll, hover, form, navigation, cart,
  search, visibility, copy, performance
- WebSocket transport that streams events to the server
- Use MutationObserver to detect dynamic DOM changes (SPAs)
```

### Phase 4: EVALUATE Layer + MSWIM Engine
```
Build the EVALUATE layer in apps/server/src/evaluate/:

1. LLM Analyst (analyst.ts):
   - Calls Anthropic Claude API with full session context
   - System prompt instructs LLM to output: narrative, detected friction_ids,
     and RAW SCORES for all 5 MSWIM signals (0–100)
   - Use the system prompt from this architecture doc verbatim

2. Context Builder (context-builder.ts):
   - Assembles: session metadata, full event history, previous evaluations
     and interventions for this session
   - Formats as structured prompt for the LLM

3. MSWIM Scoring Engine (mswim/ directory):
   - mswim.engine.ts: Main orchestrator. Takes LLM output signals + session
     state → runs signal adjustments → applies weights → composite → gates → tier

   - signals/intent.signal.ts: Takes LLM raw intent. Applies server-side
     adjustments (funnel position boost). Returns adjusted 0–100.

   - signals/friction.signal.ts: Cross-references LLM friction_ids with catalog
     severity. Uses max(LLM score, catalog severity). Multiple frictions:
     highest + 5 per additional (max +15). Returns 0–100.

   - signals/clarity.signal.ts: Takes LLM clarity. Adjusts: +10 if rule-based
     detector corroborates, -15 if session < 60s. Returns 0–100.

   - signals/receptivity.signal.ts: Primarily server-side from session state.
     Start at 80. -15 per intervention fired, -25 per dismissal, -10 if last
     intervention < 2 min, -5 mobile. +10 if widget opened voluntarily,
     +10 if idle > 60s. Returns 0–100.

   - signals/value.signal.ts: From cart value + customer data. Tiered brackets
     + LTV boosts. Returns 0–100.

   - gate-checks.ts: 12 hard rules from MSWIM spec. Returns GateOverride or null.

   - tier-resolver.ts: Score → tier using ScoringConfig thresholds.

   - config-loader.ts: Loads active ScoringConfig (per-site or global).
     Cached in memory with 60-second TTL.

4. Decision Engine (decision-engine.ts):
   - Combines: MSWIM tier + LLM recommended_action + gate overrides
   - Final: { decision, type, action_code, fullMSWIMResult }
   - Stores Evaluation record with all 5 signals + composite + tier
```

### Phase 5: INTERVENE Layer
```
Build the INTERVENE layer in apps/server/src/intervene/:
- Payload builder maps friction_id + MSWIM tier to structured command
- Message templates for AVA's contextual responses
- Action registry of all possible widget actions
- Product intelligence stub (vector search placeholder)

Build broadcast layer in apps/server/src/broadcast/:
- WebSocket server with 3 channels: dashboard, widget, demo
- Dashboard receives: TRACK events + EVALUATE narrative + MSWIM breakdown
  (all 5 signals + composite + tier + gate status) + INTERVENE status
- Widget receives: INTERVENE commands only
- Demo receives: everything
```

### Phase 6: Widget (AVA Agent)
```
Build the AVA widget in apps/widget/:
- Shadow DOM shell isolating styles from host page
- Agent controller receives INTERVENE commands via WebSocket
- Passive executor silently modifies host DOM (shipping bars, trust badges,
  sticky price, BNPL callouts)
- Widget UI: toggle button, nudge bubble, expanded panel with chat,
  product cards, comparison cards, input bar
- Builds to single IIFE file, auto-initializes from window.__AVA_CONFIG__
- Must work on ANY website with zero framework dependencies
```

### Phase 7: Dashboard
```
Build the Analyst Dashboard in apps/dashboard/:
- 3-tab layout: TRACK | EVALUATE | INTERVENE

- TRACK tab: Real-time event log [HH:MM:SS] Action. Filter by category.
  No analysis — just facts with timestamps.

- EVALUATE tab: Two sections:
  (a) Analyst narrative (prose, no timestamps)
  (b) ★ MSWIM Breakdown: 5-signal radar/spider chart or horizontal bars.
      Composite score gauge. Tier color badge (grey=MONITOR, blue=PASSIVE,
      yellow=NUDGE, orange=ACTIVE, red=ESCALATE).
      SignalTimeline: line chart showing how each signal evolved across
      evaluations in the session.

- INTERVENE tab:
  (a) Status badge: ACTIVE/READY/MONITORING
  (b) ★ MSWIM Gate Display: visual checklist of 12 gates (pass/block/N/A)
  (c) Intervention history with MSWIM score at fire time
  (d) Analytics: friction breakdown, conversion funnel,
      intervention efficiency (conversions / interventions_fired)

- Session selector for monitoring different active sessions
- All data via WebSocket (real-time)
```

### Phase 8: Demo View
```
Build Demo View in apps/demo/:
- Side-by-side: mock store (left) + dashboard (right)
- Mock store: product grid, product pages, cart, checkout
- AVA widget embedded in mock store
- Scenario runner: buttons to simulate friction scenarios
  ("Cart abandonment", "Search friction", "Payment failure",
  "Decision paralysis")
- Full pipeline visible: action → TRACK → EVALUATE (MSWIM scores
  updating real-time) → INTERVENE → AVA responds
- ★ MSWIM tuning panel: sliders to adjust weights in real-time,
  see how score/tier changes for current session (dev/demo only)
```

---

## ENVIRONMENT VARIABLES (.env)

```bash
# Server
PORT=8080
WS_PORT=8081

# Database
DATABASE_URL="file:./dev.db"

# LLM
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# ★ MSWIM Defaults (overridden by ScoringConfig in DB)
MSWIM_W_INTENT=0.25
MSWIM_W_FRICTION=0.25
MSWIM_W_CLARITY=0.15
MSWIM_W_RECEPTIVITY=0.20
MSWIM_W_VALUE=0.15
MSWIM_T_MONITOR=29
MSWIM_T_PASSIVE=49
MSWIM_T_NUDGE=64
MSWIM_T_ACTIVE=79

# Dashboard
VITE_WS_URL=ws://localhost:8081
VITE_API_URL=http://localhost:8080

# Widget (dev)
AVA_DEV_SERVER_URL=ws://localhost:8081
```

---

## DEV STARTUP SEQUENCE

```bash
cd ava
npm install
npm run db:push          # Create SQLite tables
npm run db:seed          # Seed friction catalog + MSWIM defaults
npm run dev              # Starts all apps via Turborepo

# Or individually:
npm run dev:server       # Backend on :8080 + WS on :8081
npm run dev:dashboard    # Dashboard on :3000
npm run dev:widget       # Widget dev server on :5173
npm run dev:demo         # Demo view on :4000
```
