import type { DetectedFriction, FrictionType, CooldownState } from '../shared/types';

// ============================================================
// Constants
// ============================================================

export const MIN_INTERVENTION_INTERVAL = 20000;       // 20s between (reduced from 30s)
export const MAX_INTERVENTIONS_PER_SESSION = 5;       // increased from 3
export const DISMISSAL_COOLDOWN = 90000;              // 1.5 min (reduced from 2 min)
export const REPEAT_INTERVENTION_COOLDOWN = 180000;   // 3 min same type (reduced from 5 min)
export const STAGE_ESCALATION_DELAY = 60000;          // 1 min before escalating to next stage

// ============================================================
// Priority Map (higher = more important)
// ============================================================

const INTERVENTION_PRIORITIES: Record<FrictionType, number> = {
    exit_intent: 10,
    checkout_hesitation: 9,
    price_sensitivity: 8,
    high_interest_stalling: 8,  // Boosted - this is a conversion opportunity
    indecision: 7,
    search_frustration: 7,
    comparison_loop: 6,
    specs_confusion: 5,
    navigation_confusion: 4,
    gift_anxiety: 4,
    form_fatigue: 4,
    trust_gap: 4,               // Boosted for new users
    visual_doom_scrolling: 3,
};

// ============================================================
// Staged Intervention Configuration
// Stage 1: Helpful/Informational
// Stage 2: Persuasive/Value-focused
// Stage 3: Offer/Incentive (final push)
// ============================================================

export interface InterventionStage {
    stage: 1 | 2 | 3;
    approach: 'helpful' | 'persuasive' | 'offer';
}

const FRICTION_STAGES: Record<FrictionType, number> = {
    // Multi-stage frictions (can escalate)
    exit_intent: 3,
    price_sensitivity: 3,
    high_interest_stalling: 3,
    indecision: 2,
    comparison_loop: 2,
    checkout_hesitation: 2,

    // Single-stage frictions
    search_frustration: 1,
    specs_confusion: 1,
    navigation_confusion: 1,
    gift_anxiety: 1,
    form_fatigue: 1,
    trust_gap: 1,
    visual_doom_scrolling: 1,
};

// Track intervention stages per friction type per session
const sessionStages = new Map<string, Map<FrictionType, { currentStage: number; lastStageTime: number }>>();

export function getInterventionStage(sessionId: string, frictionType: FrictionType): InterventionStage {
    if (!sessionStages.has(sessionId)) {
        sessionStages.set(sessionId, new Map());
    }

    const sessionData = sessionStages.get(sessionId)!;
    const maxStages = FRICTION_STAGES[frictionType] || 1;

    if (!sessionData.has(frictionType)) {
        sessionData.set(frictionType, { currentStage: 1, lastStageTime: Date.now() });
    }

    const stageData = sessionData.get(frictionType)!;
    const timeSinceLastStage = Date.now() - stageData.lastStageTime;

    // Escalate if enough time has passed and there are more stages
    if (timeSinceLastStage > STAGE_ESCALATION_DELAY && stageData.currentStage < maxStages) {
        stageData.currentStage++;
        stageData.lastStageTime = Date.now();
    }

    const stage = stageData.currentStage as 1 | 2 | 3;
    const approach = stage === 1 ? 'helpful' : stage === 2 ? 'persuasive' : 'offer';

    return { stage, approach };
}

export function recordStageUsed(sessionId: string, frictionType: FrictionType): void {
    if (!sessionStages.has(sessionId)) {
        sessionStages.set(sessionId, new Map());
    }
    const sessionData = sessionStages.get(sessionId)!;
    if (!sessionData.has(frictionType)) {
        sessionData.set(frictionType, { currentStage: 1, lastStageTime: Date.now() });
    }
    sessionData.get(frictionType)!.lastStageTime = Date.now();
}

// ============================================================
// Proactive Conversion Opportunities (not friction-based)
// ============================================================

export interface ConversionOpportunity {
    type: 'high_engagement' | 'cart_builder' | 'returning_interest' | 'social_proof_moment';
    confidence: number;
    context: any;
}

export function detectConversionOpportunity(
    sessionHistory: any,
    productContext: any,
    cartContext: any,
    isNewUser: boolean
): ConversionOpportunity | null {
    // High Engagement: User spent significant time on a product without adding to cart
    if (productContext.current_product) {
        const timeOnProduct = Date.now() - productContext.current_product.focus_start;
        const hasExpanded = productContext.current_product.actions?.includes('expanded_specs') ||
                           productContext.current_product.actions?.includes('viewed_description');

        if (timeOnProduct > 45000 && hasExpanded) { // 45s with engagement
            return {
                type: 'high_engagement',
                confidence: 0.85,
                context: { product: productContext.current_product, time_spent: timeOnProduct }
            };
        }
    }

    // Cart Builder: User has items but keeps browsing (might need a nudge)
    if (cartContext.item_count >= 1 && sessionHistory.total_products_viewed > cartContext.item_count + 3) {
        return {
            type: 'cart_builder',
            confidence: 0.75,
            context: { cart_count: cartContext.item_count, products_viewed: sessionHistory.total_products_viewed }
        };
    }

    // Returning Interest: User came back to a product they viewed before
    if (productContext.current_product && sessionHistory.products_viewed) {
        const viewCount = sessionHistory.products_viewed.filter(
            (id: string) => id === productContext.current_product?.product_id
        ).length;

        if (viewCount >= 2) {
            return {
                type: 'returning_interest',
                confidence: 0.9,
                context: { product: productContext.current_product, view_count: viewCount }
            };
        }
    }

    // Social Proof Moment: New user viewing popular/reviewed product
    if (isNewUser && productContext.current_product) {
        const timeOnProduct = Date.now() - productContext.current_product.focus_start;
        if (timeOnProduct > 20000) { // 20s on product
            return {
                type: 'social_proof_moment',
                confidence: 0.7,
                context: { product: productContext.current_product }
            };
        }
    }

    return null;
}

// ============================================================
// Priority & Selection
// ============================================================

export function getInterventionPriority(type: FrictionType): number {
    return INTERVENTION_PRIORITIES[type] || 1;
}

export function selectIntervention(
    frictions: DetectedFriction[],
    conversionOpp?: ConversionOpportunity | null
): { friction: DetectedFriction; priority: number } | null {
    // Combine frictions with conversion opportunities
    const allOpportunities = [...frictions];

    // Convert conversion opportunity to friction-like object if present
    if (conversionOpp) {
        const conversionAsFriction: DetectedFriction = {
            type: 'high_interest_stalling' as FrictionType, // Map to closest friction type
            confidence: conversionOpp.confidence,
            evidence: [conversionOpp.type],
            timestamp: Date.now(),
            context: conversionOpp.context,
        };
        allOpportunities.push(conversionAsFriction);
    }

    if (allOpportunities.length === 0) return null;

    // RULE 1: Exit intent ALWAYS takes precedence
    const exitFriction = allOpportunities.find((f) => f.type === 'exit_intent');
    if (exitFriction) {
        return { friction: exitFriction, priority: 10 };
    }

    // RULE 2: Score and prioritize
    const scored = allOpportunities.map((f) => ({
        friction: f,
        score: f.confidence * getInterventionPriority(f.type),
    }));

    scored.sort((a, b) => b.score - a.score);

    return {
        friction: scored[0].friction,
        priority: getInterventionPriority(scored[0].friction.type),
    };
}

// ============================================================
// Cooldown Checks (relaxed for new users)
// ============================================================

export function canIntervene(
    friction: DetectedFriction,
    cooldown: CooldownState,
    isNewUser: boolean = false
): boolean {
    const now = Date.now();

    // RULE 1: User explicitly dismissed
    if (now < cooldown.dismissedUntil) {
        return false;
    }

    // New users get more lenient cooldowns
    const intervalMultiplier = isNewUser ? 0.7 : 1.0;
    const maxInterventions = isNewUser ? MAX_INTERVENTIONS_PER_SESSION + 2 : MAX_INTERVENTIONS_PER_SESSION;

    // RULE 2: Minimum time between interventions (except exit intent)
    if (friction.type !== 'exit_intent') {
        if (now - cooldown.lastInterventionTime < MIN_INTERVENTION_INTERVAL * intervalMultiplier) {
            return false;
        }
    }

    // RULE 3: Maximum interventions per session (except exit intent)
    if (friction.type !== 'exit_intent') {
        if (cooldown.interventionCount >= maxInterventions) {
            return false;
        }
    }

    // RULE 4: Don't repeat same intervention type too quickly
    if (cooldown.lastInterventionType === friction.type) {
        if (now - cooldown.lastInterventionTime < REPEAT_INTERVENTION_COOLDOWN * intervalMultiplier) {
            return false;
        }
    }

    return true;
}

// ============================================================
// State Mutators
// ============================================================

export function handleDismissal(cooldown: CooldownState): void {
    cooldown.dismissedUntil = Date.now() + DISMISSAL_COOLDOWN;
}

export function recordIntervention(
    cooldown: CooldownState,
    friction: DetectedFriction
): void {
    cooldown.lastInterventionTime = Date.now();
    cooldown.interventionCount += 1;
    cooldown.lastInterventionType = friction.type;
}

// ============================================================
// Create Initial Cooldown State
// ============================================================

export function createCooldownState(): CooldownState {
    return {
        lastInterventionTime: 0,
        dismissedUntil: 0,
        interventionCount: 0,
        lastInterventionType: null,
    };
}

// ============================================================
// Session Cleanup
// ============================================================

export function clearSessionStages(sessionId: string): void {
    sessionStages.delete(sessionId);
}
