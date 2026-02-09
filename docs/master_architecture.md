# Master Architecture (MA)
**Status**: V1.6 (Friction Handler & Port Standardization)
**Last Updated**: 2026-01-30
**Scope**: Virtual Salesman System (Voice & Chat)

---

## 1. High-Level Concept: The Dual-Mind System

The system is composed of two distinct agents operating in parallel:

1.  **The Analyst Agent ("The Brain")**
    *   **Location**: Backend (`packages/analyst`)
    *   **Package**: `@virtual-salesman/analyst`
    *   **Role**: Silent observer, strategist, rule-maker.
    *   **Responsibility**: Ingests high-frequency user events (clicks, scrolls, hovers), analyzes behavior (friction detection, intent modeling), and issues a **Contract** using the `ContractGenerator`. Also serves its own monitoring UI.
    *   **Architecture**: Event-Driven / Pub-Sub with static file serving.

2.  **The Sales Agent ("The Face")**
    *   **Location**: Frontend Widget (`packages/agent`)
    *   **Package**: `@virtual-salesman/agent`
    *   **Role**: Executioner, interface.
    *   **Responsibility**: dumb terminal with **Voice & Chat Capabilities**.
        *   **ContractGuard**: Polling/Listening for permissions.
        *   **VoiceModule**: Browser Native TTS (Text-to-Speech) for speaking approved messages.
    *   **Architecture**: State Machine driven by External Props (The Contract).

---

## 2. The Core Data Structure: The Contract

The **Analyst Contract** is the single source of truth for the entire session. It decouples the "Brain" from the "Face".

**Schema Location**: `packages/shared/types.ts`

```typescript
export interface AnalystContract {
  session_id: string;
  timestamp: string;
  
  // 1. Diagnosis
  intent_state: {
      primary_intent: 'exploratory' | 'research' | 'friction' | ...;
      confidence: number; // 0.0 - 1.0
  };
  
  // 2. Observations
  friction_types: DetectedFriction[]; // e.g., 'price_sensitivity'
  
  // 3. Commandment (The Permitted Actions)
  recommended_actions: {
      action_type: 'chat_proactive' | 'voice_proactive' | ...;
      priority: number;
      message_template: string; // The exact script to speak/show
      constraints: ActionConstraint;
  }[];
  
  // 4. Guardrails
  forbidden_actions: ActionType[];
  expiry: string;
}
```

---

## 3. Monorepo Structure

The project uses `npm workspaces` for module isolation. **Note**: As of 2026-01-28, the dashboard package has been consolidated into the analyst package.

| Package | Path | Tech Stack | Purpose |
| :--- | :--- | :--- | :--- |
| **Shared** | `packages/shared` | TypeScript | Shared Types (Contract, UserEvent) & Utilities. **No dependencies**. |
| **Analyst** | `packages/analyst` | Node.js, Express, WS, React, Vite | **Analyst Engine + UI** (Port 3000). Hosts API `POST /api/event`, `WS /` for stream, and serves dashboard UI from `ui/dist/`. |
| **Agent** | `packages/agent` | Preact, Vite, Tailwind | **Sales Agent** (Port 3001). Embeddable bundle. Contains `ContractGuard`, `SignalDetector` & `VoiceModule`. |
| **Demo View** | `packages/demo-view` | HTML, Vite | **Showcase Container** (Port 4000). Split-view iframe orchestrator (65% store / 35% dashboard) for demos. |

---

## 4. Data Flow (The "Friction Loop")

1.  **User Action**: User hovers on a price tag (`<div data-analyze="price">`).
2.  **Signal**: Widget `SignalDetector` captures event -> `POST /api/event`.
3.  **Analysis**:
    *   Server receives event.
    *   `IntentModel` detects `price_sensitivity` pattern.
    *   `ContractGenerator` creates a new Contract with `recommended_actions: [{ type: 'voice_proactive', template: 'Free shipping?' }]`.
4.  **Distribution**:
    *   Server returns Contract to Widget (HTTP Response).
    *   Server broadcasts Contract to Dashboard (WebSocket).
5.  **Execution**:
    *   Widget `ContractGuard` verifies `recommended_actions` includes `voice_proactive`.
    *   Widget **Speaks** the `message_template` using `VoiceModule` AND renders the Chat Bubble.

---

## 5. Key Project Files & Functions (Implementation Map)

### 1. The Sales Agent (Client)
*   **Path**: `packages/agent`
*   **Tech**: Vanilla HTML/JS + React Widget (Vite), Tailwind CSS
*   **Role**: The e-commerce storefront + AI Overlay.
*   **Store Logic (New)**:
    *   **SPA Architecture**: `index.html` renders dynamically via `src/store/products.ts`.
    *   **Data Generation**: 128-item mock database with "Demo Scenarios" (Sony XM5, Aurora Laptop) pinned.
    *   **State Management**: `localStorage` used for Cart and User Profile.
    *   **Flow**: `index.html` (Catalog) -> `checkout.html` (Payment) -> `Success`.
*   **Key Components**:
    *   **Widget**: The chat/voice interface (`src/main.tsx`).
        *   **Icon**: Professional 3D female customer support avatar with blue-purple gradient and light crossing shine animation.
        *   **UI**: Clean interface with mute toggle and close button (heatmap toggle removed from user view).
    *   **Heatmap**: Canvas overlay (`src/components/Heatmap.tsx`) for visual attention tracking.
        *   **Backend Analytics**: Runs in background for analyst's use, no user-facing controls.
        *   **Purpose**: Session summaries for business owners and developers.
    *   **DemoTrigger**: Global window object to signal the Analyst manually.
    *   **Visual Feedback**: Global CSS animations (`risk-pulse`, `success-glow`) driven by Analyst state.
*   **Tech**: Preact, TailwindCSS, Web Speech API.
*   **Performance Stability**:
    *   **Async Audio**: Non-blocking TTS execution.
    *   **Memoized Event Loop**: `useCallback` stable references to prevent checking/re-attaching listeners.
    *   **Throttled Sensors**: Input limiting on `mousemove` (Heatmap) and `hover` (Analyst) to preventing flooding.
*   **State**: `uiMode` (hidden, bubble, full), `isMuted`, `showHeatmap`.

### 2. Analyst Brain (`packages/analyst`)
*   **Role**: The central intelligence. It maintains the "Contract" state, generates human-readable reasoning traces, and serves its own monitoring UI.
*   **Structure**: 
    *   **Backend**: `index.ts` - Express server with API endpoints and WebSocket
    *   **Frontend**: `ui/` directory containing the dashboard React app
        *   `ui/src/main.tsx` - Dashboard application
        *   `ui/dist/` - Built static files served by Express
*   **Key Logic**:
    *   **Intents**: `exploratory`, `high_intent`, `high_interest`, `abandonment_risk`, `comparison`, `research`, `purchase`, `friction`.
    *   **Frictions**: `confusion`, `frustration`, `price_sensitivity`, `click_rage`, `indecision`, `hesitation`.
*   **Tech**: Node.js, Express, WebSocket, React (for UI), Vite (for UI build).
*   **Intervention Management System** (V1.5):
    *   **Session Tracking**: In-memory Maps track intervention history per session.
    *   **Cooldown Enforcement**: Prevents repetitive interventions with configurable cooldown periods (2-10 min).
    *   **Context Awareness**: Checks session duration, user behavior patterns before allowing interventions.
    *   **Minimum Session Times**: Requires users to browse for set duration before interrupting (1-5 min).
    *   **Implementation**: `canFireIntervention()` and `recordIntervention()` functions manage intervention state.
*   **Output**: 
    *   Generates `AnalystContract` with `recommended_actions`.
    *   Generates **Narrative Logs** using dual-prefix format:
        *   `TRACKING:` - Records user activity (e.g., "Page loaded: 'Product Page'", "Customer viewing 'Headphones' at $349").
        *   `ANALYST:` - Explains reasoning (e.g., "⚠️ EXIT INTENT DETECTED", ">>> GENERATING INTERVENTION", "Confidence: 95%").
    *   **Log Structure**: Timestamp on separate line, then event/reasoning, empty lines between sections for readability.
    *   **Log Buffer**: Maintains last 200 entries for persistent visibility.
*   **Rate Limiting**: 300ms throttle between events to prevent flooding and UI freezes.
*   **Static Serving**: Serves dashboard UI from `ui/dist/` on the same port (3000) as the API.

### 3. The Dashboard (Admin View)
*   **Path**: `packages/analyst/ui/` (consolidated from standalone package)
*   **Role**: Real-time "Brain Monitor" visualization showing the AI's decision-making process.
*   **Architecture**: **Terminal-Style Single-Column Interface** (Redesigned 2026-01-28, Consolidated 2026-01-28).
*   **Integration**: Served as static files by the Analyst Express server on `http://localhost:3000`.
*   **Build Process**: 
    *   Development: `vite build --watch` (auto-rebuilds on changes)
    *   Production: `vite build` → outputs to `ui/dist/`
*   **Design Philosophy**: Cyberpunk aesthetic with deep purple gradient background, cyan/purple accents, and monospace typography.
*   **Components**:
    *   **Status Banner**: Dynamic purple gradient banner with animated cyan pulse indicator.
        *   States: "Analyst in action", "Analyst in action → Risk detected", "Analyst in action → Intervention".
    *   **Terminal Log Stream**: Full-height scrollable log panel with auto-scroll behavior.
        *   **Log Format**: Two-prefix system for clarity:
            *   `TRACKING:` - User activity events (light purple text).
            *   `ANALYST:` - Brain reasoning and decisions (cyan text).
        *   **Timestamps**: `[HH:MM:SS]` format in indigo, separate lines.
        *   **Highlights**: Amber for warnings/detections, pink for intervention generation.
        *   **Buffer**: Maintains 200 log entries (increased from 20 to prevent message vanishing).
    *   **Smart Scroll**: Auto-scrolls to latest logs, pauses on manual scroll, shows "↓ New activity" button when scrolled up.
    *   **Visual Polish**:
        *   Custom gradient scrollbar (purple theme).
        *   Empty state with brain emoji (🧠) and "Initializing neural pathways..." text.
        *   Smooth scroll animations and fade-in effects.
*   **Tech**: React, WebSocket, Tailwind CSS, Inter + JetBrains Mono fonts, Vite.
*   **Previous Architecture**:
    *   ~~Standalone `packages/dashboard` package (eliminated)~~
    *   ~~Separate dev server on port 5174 (now served by analyst on 3000)~~
*   **Previous Components (Removed in Redesign)**:
    *   ~~Analyst Core panel (Intent/Friction display)~~
    *   ~~Projected Uplift metrics~~
    *   ~~Live Control manual trigger buttons~~
    *   ~~Confidence Radar visualization~~

### 4. Attribution & Success Logic
*   **Tracking**: `store.ts` tracks `hasIntervention` flag if AI speaks/suggests actions.
*   **Verification**: Checkout page checks this flag to trigger:
    *   Confetti Explosion (Visual Reward).
    *   "Conversion Saved" Badge (Attribution).
*   **Flow**: Intervention -> Cart Add -> Purchase -> ROI Calculation.

### **3. The Sales Agent Widget (`packages/agent/`)**
*   **[main.tsx](../packages/agent/src/main.tsx)**: The Widget Application.
    *   `useSignalDetector(sendEvent)`: **The Eyes & Ears**. Hooks into window events (`mousemove`, `scroll`, `click`, `mouseleave`, `selectionchange`, `copy`) to detect behaviors.
        *   **Signals**: Idle, Exit Intent, Click Rage, Scroll Velocity (Doom Scrolling), Text Selection (Price/Name), Copy Events.
    *   `window.DemoTrigger`: **Testing API**. Exposed global function for specific events (Search Frustration, Add/Remove Cycle) used by the demo store.
    *   `useVoice()`: **The Mouth**. Wrapper around `window.speechSynthesis` to speak proactive messages.
    *   `App Component`: Manages state, renders the UI (Chat Bubble), and executes the *Contract*.
*   **[index.html](../packages/agent/index.html)**: **"TechSpace" Demo Store**. The standalone mock e-commerce site used for demos. Contains custom JS logic to trigger `confusion` and `frustration` events.

### **4. The Analyst Dashboard (`packages/analyst/ui/`)**
*   **[main.tsx](../packages/analyst/ui/src/main.tsx)**: The Admin UI (consolidated from standalone package).
    *   `WebSocket Listener`: Connects to `ws://localhost:3000` to receive live updates.
    *   `Terminal UI`: Renders the cyberpunk-themed terminal view of the internal state.
    *   `Wishlist Tracking`: Fixed per-product state management using `Map` data structure.

### **5. The Showcase Container (`packages/demo-view/`)**
*   **[index.html](../packages/demo-view/index.html)**: **Split View Orchestrator**. Uses IFrames to display the Store (Widget) and Brain (Dashboard) side-by-side for investor demos.
    *   **Toggle Feature**: "See how analyst work" button on right edge allows hiding/showing analyst panel.
        *   **Default State**: Panel hidden (0% width), store at 100% width.
        *   **Active State**: Panel slides to 35% width, store resizes to 65%.
        *   **Animation**: Smooth 400ms cubic-bezier transition with opacity fade.
        *   **Button Design**: Vertical purple gradient with light bulb icon and shimmer effect.

---

## 6. Deployment Architecture (Planned)

*   **Widget**: Built to `dist/bundle.js`, hosted on CDN. Embedded via `<script src="...">`.
*   **Server**: Stateless Docker container (or Serverless Functions).
*   **Database**: (Future) Redis for Session State, Postgres for History.

---

## 6. Intervention Cooldown System (V1.5)

### Philosophy
The intervention system balances **helpfulness** with **non-intrusiveness**. The agent only speaks when:
1. It has something valuable to say
2. Enough time has passed since last intervention
3. User behavior warrants assistance
4. Context requirements are met

### Implementation

#### Session Context Tracking
The analyst builds a context profile for each session:
- **priceHoverCount**: Number of times user checked prices
- **scrollCount**: Amount of scrolling activity
- **productsViewed**: Unique products seen
- **cartItems**: Items added to cart

#### Cooldown Periods
| Intervention Type | Cooldown | Min Session Time | Context Check |
|:-----------------|:---------|:----------------|:--------------|
| Exit Intent | 5 min | 2 min | Cart items OR session duration |
| Price Sensitivity | Once/session | 1 min | 3+ price hovers |
| Search Frustration | Once/session | 5 min | 50+ scrolls, 10+ products |
| Indecision | 3 min | None | None |
| Comparison Loop | 3 min | None | None |
| High Interest | 4 min | None | None |
| Hesitation | 2 min | None | None |
| Confusion | 3 min | None | None |
| Specs Help | **Disabled** | N/A | Removed (annoying) |

#### Intervention Gating Logic
**Lines 29-120** in \`packages/analyst/index.ts\`:
```typescript
function canFireIntervention(sessionId: string, interventionType: string, sessionContext: any): boolean {
    // 1. Check minimum session time
    // 2. Check context requirements (e.g., 3+ price hovers)
    // 3. Check cooldown period
    // 4. Check max intervention limits (e.g., exit intent max 2x)
    return allowed;
}
```

**Lines 371-472** - All recommendations use:
```typescript
const tryIntervention = (type, priority, message) => {
    if (canFireIntervention(session_id, type, sessionContext)) {
        contract.recommended_actions.push({...});
        recordIntervention(session_id, type, message);
    }
};
```

### Behavior Changes from V1.4
- ❌ **Removed**: Specs help intervention (fired on every specs open)
- ⏱️ **Delayed**: Price sensitivity (1 hover → 3+ hovers + 1 min)
- ⏱️ **Delayed**: Search frustration (30s → 5 min + 50 scrolls + 10 products)
- ⏱️ **Delayed**: Exit intent (instant → 2 min + 5 min cooldown + max 2x)
- 🔒 **Protected**: All interventions now have cooldown periods

### Client-Side Changes
**Element Hover Tracking** (`packages/agent/src/main.tsx` lines 192-249):
- Fixed to only track product-related elements (price, image, button, title)
- Eliminated "hovering on other" log spam

**Browsing Pattern Thresholds** (`packages/agent/src/main.tsx` lines 267-293):
- Scroll frustration: 30s + 10 scrolls → **5 min + 50 scrolls**
- Search frustration: 2 searches/15s → **4 searches/3 min**

### Performance Notes
- **Storage**: In-memory Maps (lost on restart)
- **Lookup**: O(1) Map lookups, O(n) array filtering (n ≤ 20)
- **Production TODO**: Consider Redis for session persistence

---

## 7. Navigation Tracking System (V1.5)

### Overview
Accurate tracking of user navigation flows is critical for understanding customer journey and attribution. The system differentiates between initial session starts, page loads, and client-side navigation in the SPA.

### Implementation

#### Session Start Detection
**Location**: `packages/agent/src/main.tsx` (Lines 548-565)
- **First Visit**: Detects using `sessionStorage.getItem('analyst_session_started')`
- **Event**: Emits `session_started` with `entry_page` parameter
- **Page Name Extraction**: Uses `getPageName()` helper to parse URL pathname

#### Page Navigation Tracking
**Location**: `packages/agent/src/main.tsx` (Lines 594-610)
- **Mechanism**: Click event listener on navigation links
- **Detection**: Captures clicks on `<a>` tags, validates internal navigation
- **Page Types**: Differentiates between `collection` pages (Laptops, Audio, Wearables, Accessories) and regular pages
- **Timing**: 100ms delay to ensure navigation completes before event emission

#### Page Name Resolution
The `getPageName()` helper function maps URL pathnames to human-readable page names:
- `/` → "Home"
- `/laptops`, `/audio`, `/wearables`, `/accessories` → Capitalized collection names
- Other paths → Capitalized pathname with "/" removed

### Backend Event Handling
**Location**: `packages/analyst/index.ts`

#### session_started Event (Lines 580-588)
- Logs: `"New user detected - Entry via: {entry_page}"`
- Creates session context for future intervention decisions
- Initializes session tracking Maps

#### page_navigation Event (Lines 589-601)
- Logs: `"Page loaded - {page_name}"` or `"Navigating to {page_name} collection"`
- Updates session context with page view history
- Tracks collection browsing patterns for intent modeling

### Demo Log Cleanup
**Location**: `packages/analyst/ui/src/main.tsx` (Line 332)
- **Background Events Filter**: Prevents unwanted "Processed event" messages for:
  - `device_context`, `attention`, `cursor_stream`, `heartbeat`
  - `idle`, `scroll`, `scroll_depth`, `session_journey`
- **Result**: Clean, demo-friendly logs showing only meaningful user actions

### Design Decisions
- **SPA Compatibility**: Click-based tracking instead of URL change listeners addresses single-page application challenges
- **SessionStorage vs LocalStorage**: Uses sessionStorage for first-visit detection to reset on browser tab close
- **Delay Strategy**: 100ms navigation delay ensures DOM updates complete before event capture
- **Clean Logs**: Explicit event filtering in both backend and frontend prevents log spam during demonstrations

### Known Issues & Debugging

#### SessionStorage Persistence Bug (Identified 2026-01-29)
**Problem**: The `session_started` event does not fire reliably on page loads.

**Root Cause**: The `sessionStorage.getItem('analyst_session_started')` check (Line 564 in `packages/agent/src/main.tsx`) persists across page reloads within the same browser session. Once set, it remains `true` even for what should be treated as a "new session" from the user's perspective, causing all subsequent page loads to emit `page_navigation` instead of `session_started`.

**Diagnosis Method**: 
1. Browser subagent testing with manual sessionStorage manipulation
2. Steps: Navigate to app → Clear sessionStorage via console → Reload page → Verify console logs
3. **Confirmation**: After clearing sessionStorage, `session_started` event correctly emits with payload `{entry_page: Home}`

**Impact**: 
- Dashboard only shows `page_navigation` events, missing session initialization events
- Session attribution and journey tracking is incomplete
- First-visit analytics are inaccurate

**Status**: Bug confirmed, fix required to first-visit detection logic

