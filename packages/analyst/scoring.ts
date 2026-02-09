import type { SessionScores, ScenarioContributions, DetectedFriction } from '../shared/types';

// ============================================================
// Constants
// ============================================================

export const INTEREST_THRESHOLD = 60;
export const HELP_NEED_THRESHOLD = 20;
export const MAX_SCENARIO_CONTRIBUTION = 40;

export const IDLE_DECAY_INTERVAL = 20000;       // 20s
export const ENGAGEMENT_DECAY_INTERVAL = 30000;  // 30s

// ============================================================
// Advanced Scoring Configuration
// ============================================================

// Time decay: how quickly old events lose influence (half-life in ms)
export const SCORE_HALF_LIFE_MS = 120000; // 2 minutes - scores decay by 50% every 2 min

// Diminishing returns: multiplier decreases with each occurrence
// Formula: base_delta * (DIMINISHING_FACTOR ^ occurrence_count)
export const DIMINISHING_FACTOR = 0.7; // Each repeat = 70% of previous impact
export const MAX_OCCURRENCES_TRACKED = 5; // Stop tracking after 5 occurrences

// Probabilistic intervention thresholds
export const INTERVENTION_PROBABILITY_MIN = 0.3; // Minimum probability at threshold
export const INTERVENTION_PROBABILITY_MAX = 0.95; // Maximum probability at high scores
export const SOFT_THRESHOLD_RANGE = 15; // How much below threshold we start considering

// ============================================================
// Score Delta Map — secondary signal → score impacts
// ============================================================

export const SCORE_DELTAS: Record<string, { interest: number; friction: number; clarity: number }> = {
    // Engagement signals
    extended_viewing: { interest: 15, friction: 0, clarity: 5 },
    variant_selection: { interest: 20, friction: 0, clarity: 10 },
    review_reading: { interest: 15, friction: 5, clarity: 5 },
    wishlist_save: { interest: 25, friction: 5, clarity: 10 },
    product_revisit: { interest: 30, friction: 10, clarity: 5 },

    // Decision fatigue
    rapid_browsing: { interest: 10, friction: 25, clarity: -15 },
    navigation_loops: { interest: 5, friction: 20, clarity: -10 },
    filter_indecision: { interest: 5, friction: 20, clarity: -10 },
    filter_loop: { interest: 0, friction: 30, clarity: -20 },
    search_refinement: { interest: 10, friction: 20, clarity: 0 },

    // Price Sensitivity
    price_sort_cycling: { interest: 0, friction: 10, clarity: -10 }, // P-Score logic folded into Friction
    price_filtering: { interest: 10, friction: 0, clarity: 5 },
    coupon_seeking: { interest: 10, friction: 0, clarity: 5 },
    downgrade_intent: { interest: 0, friction: 10, clarity: 0 },
    sticker_shock: { interest: 0, friction: 20, clarity: -5 },

    // Trust gap
    trust_seeking: { interest: 10, friction: 30, clarity: -20 },
    cart_hesitation: { interest: 15, friction: 25, clarity: -15 },

    // Comparison conflict
    comparison_loop: { interest: 20, friction: 30, clarity: -20 },

    // Information gap
    spec_confusion: { interest: 10, friction: 25, clarity: -20 },
    sizing_uncertainty: { interest: 10, friction: 25, clarity: -20 },
    external_research: { interest: 15, friction: 30, clarity: -25 },

    // Checkout anxiety
    checkout_hesitation: { interest: 20, friction: 30, clarity: -25 },
    payment_anxiety: { interest: 10, friction: 25, clarity: -20 },

    // Momentum loss
    external_distraction: { interest: 10, friction: 20, clarity: -15 },

    // Gift anxiety
    gift_uncertainty: { interest: 10, friction: 25, clarity: -20 },

    // Friction Library (Additional)
    bad_landing: { interest: -20, friction: 40, clarity: 0 },
    sizing_anxiety: { interest: 0, friction: 20, clarity: -10 },
    return_policy_check: { interest: 0, friction: 15, clarity: -5 },
    help_seeking: { interest: 5, friction: 20, clarity: 0 },
    info_loop: { interest: 0, friction: 35, clarity: -25 },
    variant_indecision: { interest: 0, friction: 25, clarity: -15 }, // Override previous definition if needed
    mid_session_idle: { interest: 5, friction: 15, clarity: -10 }, // Ensure consistent definition
    brief_tab_blur: { interest: 0, friction: 10, clarity: -5 },
    cursor_idle_mid_page: { interest: 0, friction: 10, clarity: -5 },
    region_rescroll: { interest: 5, friction: 15, clarity: -5 },
    address_field_loop: { interest: 0, friction: 25, clarity: -15 },

    // High interest stalling (user engaged but not acting)
    high_interest_stalling: { interest: 30, friction: 20, clarity: 0 },

    // Exit
    exit_detected: { interest: 0, friction: 50, clarity: 0 },
};

// ============================================================
// Time-Weighted Score Event Tracking
// ============================================================

export interface ScoredEvent {
    scenario: string;
    delta: SessionScores;
    timestamp: number;
    confidence: number; // 0-1, from friction detection
    occurrenceIndex: number; // For diminishing returns
}

export interface AdvancedScoreState {
    events: ScoredEvent[];
    occurrenceCounts: Record<string, number>;
    sessionStart: number;
}

export function createAdvancedScoreState(): AdvancedScoreState {
    return {
        events: [],
        occurrenceCounts: {},
        sessionStart: Date.now(),
    };
}

// ============================================================
// Core Functions
// ============================================================

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Calculate time decay factor using exponential decay
 * Returns a value between 0 and 1, where 1 = no decay (just happened)
 */
export function calculateTimeDecay(eventTimestamp: number, currentTime: number = Date.now()): number {
    const ageMs = currentTime - eventTimestamp;
    // Exponential decay: e^(-lambda * t) where lambda = ln(2) / half_life
    const lambda = Math.LN2 / SCORE_HALF_LIFE_MS;
    return Math.exp(-lambda * ageMs);
}

/**
 * Calculate diminishing returns multiplier based on occurrence count
 */
export function calculateDiminishingMultiplier(occurrenceIndex: number): number {
    // First occurrence (index 0) = full impact
    // Each subsequent occurrence = 70% of previous
    return Math.pow(DIMINISHING_FACTOR, Math.min(occurrenceIndex, MAX_OCCURRENCES_TRACKED));
}

/**
 * Apply a new event with confidence weighting and diminishing returns
 */
export function applyEventAdvanced(
    state: AdvancedScoreState,
    scenario: string,
    baseDelta: Partial<SessionScores>,
    confidence: number = 1.0
): AdvancedScoreState {
    // Track occurrence count for diminishing returns
    const currentCount = state.occurrenceCounts[scenario] || 0;
    const occurrenceIndex = currentCount;

    // Calculate diminishing multiplier
    const diminishingMultiplier = calculateDiminishingMultiplier(occurrenceIndex);

    // Apply confidence and diminishing returns to the delta
    const adjustedDelta: SessionScores = {
        interest: (baseDelta.interest || 0) * confidence * diminishingMultiplier,
        friction: (baseDelta.friction || 0) * confidence * diminishingMultiplier,
        clarity: (baseDelta.clarity || 0) * confidence * diminishingMultiplier,
    };

    const newEvent: ScoredEvent = {
        scenario,
        delta: adjustedDelta,
        timestamp: Date.now(),
        confidence,
        occurrenceIndex,
    };

    return {
        events: [...state.events, newEvent],
        occurrenceCounts: {
            ...state.occurrenceCounts,
            [scenario]: currentCount + 1,
        },
        sessionStart: state.sessionStart,
    };
}

/**
 * Calculate current scores by summing all time-decayed events
 * This is the main function for getting the "live" scores
 */
export function calculateCurrentScores(
    state: AdvancedScoreState,
    baseClarity: number = 100
): SessionScores {
    const now = Date.now();

    let interest = 0;
    let friction = 0;
    let clarityDelta = 0;

    for (const event of state.events) {
        const decayFactor = calculateTimeDecay(event.timestamp, now);

        interest += event.delta.interest * decayFactor;
        friction += event.delta.friction * decayFactor;
        clarityDelta += event.delta.clarity * decayFactor;
    }

    return normalize({
        interest,
        friction,
        clarity: baseClarity + clarityDelta,
    });
}

/**
 * Legacy: Simple event application (for backward compatibility)
 */
export function applyEvent(scores: SessionScores, delta: Partial<SessionScores>): SessionScores {
    return {
        interest: clamp(scores.interest + (delta.interest || 0), 0, 100),
        friction: clamp(scores.friction + (delta.friction || 0), 0, 100),
        clarity: clamp(scores.clarity + (delta.clarity || 0), 0, 100),
    };
}

/**
 * Legacy: Simple time-based decay (kept for backward compatibility)
 */
export function decay(scores: SessionScores, idleSec: number): SessionScores {
    let result = { ...scores };

    // Every 20 seconds without friction signals
    if (idleSec > 20) {
        result.friction = result.friction - 5;
        result.clarity = result.clarity + 3;
    }

    // Every 30 seconds without engagement
    if (idleSec > 30) {
        result.interest = result.interest - 5;
    }

    return normalize(result);
}

export function normalize(scores: SessionScores): SessionScores {
    return {
        interest: clamp(scores.interest, 0, 100),
        friction: clamp(scores.friction, 0, 100),
        clarity: clamp(scores.clarity, 0, 100),
    };
}

// ============================================================
// Probabilistic Intervention Decision
// ============================================================

/**
 * Calculate intervention probability based on scores
 * Returns a value between 0 and 1
 *
 * This creates a "soft threshold" - instead of hard cutoffs, we gradually
 * increase intervention probability as scores approach/exceed thresholds.
 */
export function calculateInterventionProbability(scores: SessionScores): number {
    const helpNeed = scores.friction - scores.clarity;

    // Calculate how far above/below thresholds we are
    const interestMargin = scores.interest - INTEREST_THRESHOLD;
    const helpNeedMargin = helpNeed - HELP_NEED_THRESHOLD;

    // If both are well below threshold, probability is 0
    if (interestMargin < -SOFT_THRESHOLD_RANGE && helpNeedMargin < -SOFT_THRESHOLD_RANGE) {
        return 0;
    }

    // Calculate individual probabilities using sigmoid-like curves
    const interestProb = sigmoid(interestMargin, SOFT_THRESHOLD_RANGE);
    const helpNeedProb = sigmoid(helpNeedMargin, SOFT_THRESHOLD_RANGE);

    // Combined probability: both conditions should be somewhat met
    // Using geometric mean to require both to be high
    const combinedProb = Math.sqrt(interestProb * helpNeedProb);

    // Scale to our probability range
    return INTERVENTION_PROBABILITY_MIN +
           (INTERVENTION_PROBABILITY_MAX - INTERVENTION_PROBABILITY_MIN) * combinedProb;
}

/**
 * Sigmoid function for smooth probability transitions
 * Returns 0.5 when x=0, approaches 0 as x→-scale, approaches 1 as x→+scale
 */
function sigmoid(x: number, scale: number): number {
    return 1 / (1 + Math.exp(-x / (scale / 3)));
}

/**
 * Make a probabilistic intervention decision
 * Returns true if we should intervene
 */
export function shouldInterveneProbabilistic(
    scores: SessionScores,
    dismissed: boolean,
    inPayment: boolean,
    randomValue: number = Math.random()
): { shouldIntervene: boolean; probability: number; reason: string } {
    // Hard blockers - these always prevent intervention
    if (dismissed) {
        return { shouldIntervene: false, probability: 0, reason: 'User dismissed previous intervention' };
    }
    if (inPayment) {
        return { shouldIntervene: false, probability: 0, reason: 'User in payment flow' };
    }

    const probability = calculateInterventionProbability(scores);

    // If probability is very low, don't bother with random check
    if (probability < 0.05) {
        return {
            shouldIntervene: false,
            probability,
            reason: `Scores too low (Interest: ${scores.interest.toFixed(1)}, HelpNeed: ${(scores.friction - scores.clarity).toFixed(1)})`
        };
    }

    const shouldAct = randomValue < probability;

    return {
        shouldIntervene: shouldAct,
        probability,
        reason: shouldAct
            ? `Intervention triggered (p=${(probability * 100).toFixed(1)}%)`
            : `Random check failed (p=${(probability * 100).toFixed(1)}%, roll=${(randomValue * 100).toFixed(1)}%)`
    };
}

/**
 * Legacy: Binary intervention decision (kept for backward compatibility)
 */
export function shouldIntervene(
    scores: SessionScores,
    dismissed: boolean,
    inPayment: boolean
): boolean {
    const helpNeed = scores.friction - scores.clarity;
    const engagementIndex = scores.interest;

    return (
        engagementIndex >= INTEREST_THRESHOLD &&
        helpNeed >= HELP_NEED_THRESHOLD &&
        !dismissed &&
        !inPayment
    );
}

// ============================================================
// Confidence-Weighted Friction Scoring
// ============================================================

/**
 * Apply friction detections with confidence weighting
 * Higher confidence = greater score impact
 */
export function applyFrictionsWithConfidence(
    state: AdvancedScoreState,
    frictions: DetectedFriction[]
): AdvancedScoreState {
    let newState = state;

    for (const friction of frictions) {
        const baseDelta = SCORE_DELTAS[friction.type];
        if (baseDelta) {
            newState = applyEventAdvanced(
                newState,
                friction.type,
                baseDelta,
                friction.confidence // Use detected confidence
            );
        }
    }

    return newState;
}

// ============================================================
// Session Normalization
// ============================================================

/**
 * Normalize scores relative to session duration
 * Short sessions with high scores might be noise; long sessions are more reliable
 */
export function getSessionReliability(sessionStartTime: number): number {
    const sessionDurationMs = Date.now() - sessionStartTime;
    const sessionMinutes = sessionDurationMs / 60000;

    // Reliability ramps up over first 2 minutes, then stays at 1.0
    // This prevents flash-decisions on brand new sessions
    if (sessionMinutes < 0.5) return 0.3; // First 30 seconds: 30% reliability
    if (sessionMinutes < 1) return 0.6;   // 30s - 1min: 60% reliability
    if (sessionMinutes < 2) return 0.85;  // 1-2 min: 85% reliability
    return 1.0; // 2+ minutes: full reliability
}

/**
 * Adjust intervention probability based on session reliability
 */
export function adjustProbabilityForSession(
    baseProbability: number,
    sessionStartTime: number
): number {
    const reliability = getSessionReliability(sessionStartTime);
    return baseProbability * reliability;
}

// ============================================================
// Scenario Weight Caps (unchanged)
// ============================================================

export function canApplyScenario(
    scenario: string,
    contributions: ScenarioContributions,
    delta: number
): boolean {
    const current = contributions[scenario] || 0;
    return (current + delta) <= MAX_SCENARIO_CONTRIBUTION;
}

export function applyScenarioScore(
    scenario: string,
    contributions: ScenarioContributions,
    delta: number
): void {
    contributions[scenario] = (contributions[scenario] || 0) + delta;
}

// ============================================================
// Debug/Analytics Helpers
// ============================================================

/**
 * Get detailed breakdown of current score contributions
 * Useful for debugging and analytics dashboards
 */
export function getScoreBreakdown(state: AdvancedScoreState): {
    totalEvents: number;
    activeEvents: number; // Events still contributing >5% of original value
    topContributors: Array<{ scenario: string; currentImpact: number }>;
    decayedEvents: number;
} {
    const now = Date.now();
    const ACTIVE_THRESHOLD = 0.05; // Events contributing less than 5% are considered "decayed"

    const eventImpacts = state.events.map(event => {
        const decay = calculateTimeDecay(event.timestamp, now);
        const totalImpact = Math.abs(event.delta.interest) +
                           Math.abs(event.delta.friction) +
                           Math.abs(event.delta.clarity);
        return {
            scenario: event.scenario,
            currentImpact: totalImpact * decay,
            isActive: decay >= ACTIVE_THRESHOLD,
        };
    });

    const activeEvents = eventImpacts.filter(e => e.isActive);
    const topContributors = [...activeEvents]
        .sort((a, b) => b.currentImpact - a.currentImpact)
        .slice(0, 5);

    return {
        totalEvents: state.events.length,
        activeEvents: activeEvents.length,
        topContributors,
        decayedEvents: state.events.length - activeEvents.length,
    };
}
