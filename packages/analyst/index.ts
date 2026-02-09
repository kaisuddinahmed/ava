console.log('--- STARTING ANALYST SERVER ---');
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import type { AnalystContract, UserEvent, IntentState, DetectedFriction } from '../shared/types.ts';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve the UI static files
app.use(express.static(path.join(__dirname, 'ui/dist')));

// Explicitly serve index.html for root if not handled by static
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui/dist/index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// --- Mock "Analyst Brain" State ---
const activeSessions = new Map<string, AnalystContract>();
const eventHistory = new Map<string, UserEvent[]>(); // Store last N events per session
const dashboardClients = new Set<WebSocket>();
const sessionTimestamps = new Map<string, number>();

// Intervention tracking
interface InterventionRecord {
    type: string;
    timestamp: number;
    message: string;
}

const sessionInterventions: Map<string, InterventionRecord[]> = new Map();
const sessionStartTimes: Map<string, number> = new Map();

function canFireIntervention(sessionId: string, interventionType: string, sessionContext: any): boolean {
    const now = Date.now();

    // Track session start
    if (!sessionStartTimes.has(sessionId)) {
        sessionStartTimes.set(sessionId, now);
    }

    const sessionDuration = now - (sessionStartTimes.get(sessionId) || now);
    const interventions = sessionInterventions.get(sessionId) || [];

    // Cooldown periods (in milliseconds)
    const COOLDOWNS: Record<string, number> = {
        'exit_intent': 5 * 60 * 1000,         // 5 minutes
        'price_sensitivity': 5 * 60 * 1000,   // 5 minutes (Changed from Infinity)
        'search_frustration': 2 * 60 * 1000,  // 2 minutes
        'specs_help': 2 * 60 * 1000,          // Re-enabled
        'indecision': 3 * 60 * 1000,          // 3 minutes
        'comparison_loop': 3 * 60 * 1000,     // 3 minutes
        'high_interest': 4 * 60 * 1000,       // 4 minutes
        'checkout_hesitation': 2 * 60 * 1000, // 2 minutes
        'confusion': 3 * 60 * 1000,           // 3 minutes
        'trust_gap': Infinity,                // Once per session
        'gift_anxiety': 5 * 60 * 1000,        // 5 minutes
        'visual_doom_scrolling': 5 * 60 * 1000, // 5 minutes
        'form_fatigue': Infinity              // Once per session
    };

    // Minimum session time before allowing intervention
    const MIN_SESSION_TIME: Record<string, number> = {
        'exit_intent': 2 * 60 * 1000,         // 2 minutes
        'price_sensitivity': 1 * 60 * 1000,   // 1 minute
        'search_frustration': 5 * 60 * 1000,  // 5 minutes
    };

    // Check minimum session time
    const minTime = MIN_SESSION_TIME[interventionType] || 0;
    if (sessionDuration < minTime) {
        return false;
    }

    // Context-specific checks
    if (interventionType === 'price_sensitivity') {
        // Only fire after 3+ price hovers
        const priceHovers = (sessionContext.priceHoverCount || 0);
        if (priceHovers < 3) return false;
    }

    if (interventionType === 'search_frustration') {
        // Require extensive browsing
        const scrolls = sessionContext.scrollCount || 0;
        const products = sessionContext.productsViewed || 0;
        if (scrolls < 50 || products < 10) return false;
    }

    // Check cooldown
    const lastFired = interventions.find(i => i.type === interventionType);
    if (lastFired) {
        const cooldown = COOLDOWNS[interventionType] || 0;
        if (cooldown === Infinity) {
            return false; // Already fired, never fire again
        }
        if (now - lastFired.timestamp < cooldown) {
            return false; // Still in cooldown
        }
    }

    // Max 2 interventions for exit intent
    if (interventionType === 'exit_intent') {
        const exitCount = interventions.filter(i => i.type === 'exit_intent').length;
        if (exitCount >= 2) return false;
    }

    return true;
}

function recordIntervention(sessionId: string, interventionType: string, message: string) {
    if (!sessionInterventions.has(sessionId)) {
        sessionInterventions.set(sessionId, []);
    }
    sessionInterventions.get(sessionId)!.push({
        type: interventionType,
        timestamp: Date.now(),
        message
    });
}

// Cursor movement aggregation (1-minute summaries)
const cursorAggregation: Map<string, { totalSamples: number; lastLoggedTime: number }> = new Map();

function shouldLogCursorMovement(sessionId: string, sampleCount: number): { shouldLog: boolean; totalSamples?: number } {
    const now = Date.now();
    const oneMinute = 60 * 1000;

    if (!cursorAggregation.has(sessionId)) {
        cursorAggregation.set(sessionId, { totalSamples: 0, lastLoggedTime: now });
    }

    const aggData = cursorAggregation.get(sessionId)!;
    aggData.totalSamples += sampleCount;

    // Only log once per minute
    if (now - aggData.lastLoggedTime >= oneMinute) {
        const totalSamples = aggData.totalSamples;
        aggData.totalSamples = 0;
        aggData.lastLoggedTime = now;
        return { shouldLog: true, totalSamples };
    }

    return { shouldLog: false };
}

function getLastEventTime(sessionId: string): number {
    return sessionTimestamps.get(sessionId) || 0;
}

// --- Analytics Aggregation ---
interface AnalyticsData {
    totalSessions: number;
    activeSessions: number;
    avgSessionDuration: number;
    conversionRate: number;
    frictionBreakdown: Record<string, number>;
    interventionBreakdown: Record<string, number>;
    funnel: {
        browsed: number;
        addedToCart: number;
        checkedOut: number;
    };
    predictiveScores?: {
        exitProbability: number;
        purchaseProbability: number;
    };
}

const analyticsData: AnalyticsData = {
    totalSessions: 0,
    activeSessions: 0,
    avgSessionDuration: 0,
    conversionRate: 0,
    frictionBreakdown: {},
    interventionBreakdown: {},
    funnel: { browsed: 0, addedToCart: 0, checkedOut: 0 }
};

const sessionConversions: Set<string> = new Set();
const sessionFunnelTracking: Map<string, { browsed: boolean; addedToCart: boolean; checkedOut: boolean }> = new Map();

function updateAnalytics(sessionId: string, contract: AnalystContract) {
    // Track unique sessions
    if (!sessionStartTimes.has(sessionId)) {
        analyticsData.totalSessions++;
        sessionFunnelTracking.set(sessionId, { browsed: false, addedToCart: false, checkedOut: false });
    }

    // Active sessions
    analyticsData.activeSessions = sessionStartTimes.size;

    // Avg session duration
    const durations: number[] = [];
    sessionStartTimes.forEach((startTime, sid) => {
        durations.push(Date.now() - startTime);
    });
    analyticsData.avgSessionDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Friction breakdown
    contract.friction_types.forEach(friction => {
        analyticsData.frictionBreakdown[friction.type] = (analyticsData.frictionBreakdown[friction.type] || 0) + 1;
    });

    // Intervention breakdown
    const interventions = sessionInterventions.get(sessionId) || [];
    interventions.forEach(intervention => {
        analyticsData.interventionBreakdown[intervention.type] = (analyticsData.interventionBreakdown[intervention.type] || 0) + 1;
    });

    // Funnel tracking
    const funnelState = sessionFunnelTracking.get(sessionId);
    if (funnelState) {
        const history = eventHistory.get(sessionId) || [];

        // Browsed = any view_item or browsing_pattern
        if (!funnelState.browsed && history.some(e => e.event_type === 'view_item' || e.event_type === 'browsing_pattern')) {
            funnelState.browsed = true;
            analyticsData.funnel.browsed++;
        }

        // Added to cart
        if (!funnelState.addedToCart && history.some(e => e.event_type === 'add_to_cart' || (e.event_type === 'cart_action' && e.payload?.action === 'item_added'))) {
            funnelState.addedToCart = true;
            analyticsData.funnel.addedToCart++;
        }

        // Checked out
        if (!funnelState.checkedOut && history.some(e => e.event_type === 'checkout_step')) {
            funnelState.checkedOut = true;
            analyticsData.funnel.checkedOut++;
            sessionConversions.add(sessionId);
        }
    }

    // Conversion rate
    analyticsData.conversionRate = analyticsData.totalSessions > 0
        ? (sessionConversions.size / analyticsData.totalSessions) * 100
        : 0;

    // Predictive scores (basic algorithm for now)
    analyticsData.predictiveScores = {
        exitProbability: calculateExitProbability(sessionId),
        purchaseProbability: calculatePurchaseProbability(sessionId)
    };
}

function calculateExitProbability(sessionId: string): number {
    const history = eventHistory.get(sessionId) || [];
    const recentExitIntents = history.filter(e => e.event_type === 'exit_intent').length;
    const sessionDuration = Date.now() - (sessionStartTimes.get(sessionId) || Date.now());

    // High exit probability if: multiple exit intents OR very short session
    let score = 0;
    if (recentExitIntents > 0) score += Math.min(recentExitIntents * 30, 60);
    if (sessionDuration < 30000) score += 20; // Less than 30s

    return Math.min(score, 100);
}

function calculatePurchaseProbability(sessionId: string): number {
    const history = eventHistory.get(sessionId) || [];
    const cartItems = history.filter(e => e.event_type === 'add_to_cart').length;
    const wishlistItems = history.filter(e => e.event_type === 'product_detail' && e.payload?.action === 'add_to_wishlist').length;
    const sessionDuration = Date.now() - (sessionStartTimes.get(sessionId) || Date.now());

    // High purchase probability if: items in cart, long session, wishlist activity
    let score = 0;
    if (cartItems > 0) score += 40;
    if (wishlistItems > 0) score += 15;
    if (sessionDuration > 120000) score += 25; // More than 2 min
    if (history.some(e => e.event_type === 'checkout_step')) score += 20;

    return Math.min(score, 100);
}

// Broadcast analytics to dashboard every 3 seconds
setInterval(() => {
    dashboardClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'analytics_update',
                analytics: analyticsData
            }));
        }
    });
}, 3000);


function setLastEventTime(sessionId: string, time: number) {
    sessionTimestamps.set(sessionId, time);
}

// Basic Rule Engine (The "Model")
function generateContract(event: UserEvent): AnalystContract {
    // History Management
    if (!eventHistory.has(event.session_id)) {
        eventHistory.set(event.session_id, []);
    }
    const history = eventHistory.get(event.session_id)!;
    history.push(event);
    if (history.length > 20) history.shift(); // Keep last 20 events

    let friction: DetectedFriction[] = [];
    let intent: IntentState = {
        primary_intent: 'exploratory',
        confidence: 0.8
    };

    // --- DETECTION LOGIC ---

    // --- DETECTOR LOGIC (Updated for Phase 3 Demo Suite) ---

    // 1. Confusion (Add -> Remove Cycle)
    if (event.event_type === 'remove_from_cart') {
        const addedItem = event.payload?.product_id;
        const recentAdd = history.find(e => e.event_type === 'add_to_cart' && e.payload?.product_id === addedItem);
        if (recentAdd) {
            friction.push({ type: 'confusion', confidence: 0.85, evidence: ['add_remove_cycle'] });
            intent = { primary_intent: 'friction', confidence: 0.85 };
        }
    }

    // 2. Search Frustration (Zero Results)
    if (event.event_type === 'search_zero_results') {
        friction.push({ type: 'frustration', confidence: 0.9, evidence: ['zero_results_search'] });
        intent = { primary_intent: 'friction', confidence: 0.9 };
    }

    // 3. Filter Loop (Indecision) [NEW]
    if (event.event_type === 'click' && event.payload?.target === 'filter') {
        // Count recent filter clicks
        const recentFilters = history.filter(e =>
            e.event_type === 'click' &&
            e.payload?.target === 'filter' &&
            new Date(e.timestamp).getTime() > Date.now() - 10000 // Last 10s
        ).length;

        if (recentFilters >= 3) {
            friction.push({ type: 'indecision', confidence: 0.8, evidence: ['rapid_filter_change'] });
            intent = { primary_intent: 'friction', confidence: 0.8 };
        }
    }

    // 4. Specs Interest (Technical Buyer) [NEW]
    if (event.event_type === 'click' && event.payload?.target === 'specs_toggle' && event.payload?.state === 'open') {
        intent = { primary_intent: 'research', confidence: 0.8 };
    }

    // 5. Checkout Stall (Hesitation on Add to Cart) [NEW]
    if (event.event_type === 'hover' && event.payload?.element === 'add_to_cart_btn') {
        intent = { primary_intent: 'purchase', confidence: 0.7 };
        // If they hover for a while (handled by client debounce mainly, but simple check here)
        friction.push({ type: 'hesitation', confidence: 0.6, evidence: ['hover_add_cart'] });
    }

    // 6. Wishlist Activity (High Interest Signal)
    if (event.event_type === 'add_to_wishlist') {
        intent = { primary_intent: 'high_interest', confidence: 0.85 };
        // Wishlist is a strong purchase signal - customer is considering but not ready yet
    }

    // 7. Similar Items (Comparison Shopping)
    if (event.event_type === 'view_item' && event.payload?.type === 'similar_trigger') {
        intent = { primary_intent: 'comparison', confidence: 0.75 };
    }

    // Existing Signals
    if (event.event_type === 'click_rage') {
        friction.push({ type: 'trust', confidence: 0.95, evidence: ['click_rage_detected'] });
        intent = { primary_intent: 'friction', confidence: 0.95 };
    } else if (event.event_type === 'exit_intent') {
        intent = { primary_intent: 'abandonment_risk', confidence: 0.95 };
    }
    // NOTE: Old single-hover price sensitivity removed - now requires pattern (see element_hover below)


    // --- P0 NEW EVENTS ---

    // 8. Product Detail Modal - High Interest Signals
    if (event.event_type === 'product_detail') {
        if (event.payload?.action === 'description_expanded') {
            intent = { primary_intent: 'high_interest', confidence: 0.9 };
        } else if (event.payload?.action === 'add_to_wishlist') {
            intent = { primary_intent: 'high_interest', confidence: 0.85 };
        } else if (event.payload?.action === 'quantity_increased') {
            intent = { primary_intent: 'purchase', confidence: 0.85 };
        } else if (event.payload?.action === 'quantity_decreased') {
            friction.push({ type: 'hesitation', confidence: 0.7, evidence: ['quantity_reduction'] });
        } else if (event.payload?.action === 'add_to_cart') {
            intent = { primary_intent: 'purchase', confidence: 0.95 };
        } else if (event.payload?.action === 'closed' && event.payload?.time_spent_ms > 30000) {
            // Spent 30+ seconds in modal = high interest
            intent = { primary_intent: 'high_interest', confidence: 0.8 };
        }
    }

    // 9. Enhanced Hover - Product Context
    if (event.event_type === 'element_hover') {
        // Price Sensitivity: Only detect if user is REALLY examining price (5s+ hover OR multiple products)
        if (event.payload?.element_type === 'product_price' && event.payload?.hover_duration_ms > 5000) {
            // User staring at price for 5+ seconds = genuine price concern
            friction.push({ type: 'price_sensitivity', confidence: 0.85, evidence: ['extended_price_examination'] });
        } else if (event.payload?.element_type === 'product_price') {
            // Short price hover - check if this is a pattern across multiple products
            const recentPriceHovers = history.filter(e =>
                (e.event_type === 'element_hover' && e.payload?.element_type === 'product_price') ||
                (e.event_type === 'hover' && e.payload?.element === 'price')
            ).length;

            // If user has checked prices on 5+ different products, they're price shopping
            if (recentPriceHovers >= 5) {
                friction.push({ type: 'price_sensitivity', confidence: 0.75, evidence: ['multiple_price_comparisons'] });
            }
        }

        // Other hover behaviors
        if (event.payload?.element_type === 'product_image' && event.payload?.hover_duration_ms > 3000) {
            intent = { primary_intent: 'research', confidence: 0.7 };
        } else if (event.payload?.element_type === 'add_to_cart_btn' && event.payload?.hover_duration_ms > 2000) {
            friction.push({ type: 'hesitation', confidence: 0.75, evidence: ['cart_button_hesitation'] });
        }
    }

    // 10. Cart Actions - Purchase Intent
    if (event.event_type === 'cart_action') {
        if (event.payload?.action === 'item_added') {
            intent = { primary_intent: 'purchase', confidence: 0.9 };
        } else if (event.payload?.action === 'item_removed') {
            friction.push({ type: 'confusion', confidence: 0.75, evidence: ['cart_item_removed'] });
        } else if (event.payload?.action === 'quantity_decreased') {
            friction.push({ type: 'hesitation', confidence: 0.7, evidence: ['cart_quantity_reduced'] });
        }
    }

    // 11. Similar Product Clicked - Comparison Loop Detection
    if (event.event_type === 'similar_product_clicked') {
        const recentSimilarClicks = history.filter(e =>
            e.event_type === 'similar_product_clicked' &&
            new Date(e.timestamp).getTime() > Date.now() - 30000 // Last 30s
        ).length;

        if (recentSimilarClicks >= 3) {
            friction.push({ type: 'indecision', confidence: 0.85, evidence: ['comparison_loop'] });
            intent = { primary_intent: 'comparison', confidence: 0.9 };
        } else {
            intent = { primary_intent: 'comparison', confidence: 0.75 };
        }
    }

    // 12. Session Journey - Track abandonment risk
    if (event.event_type === 'session_journey') {
        const path = event.payload?.path || [];
        if (path.length > 5 && path.filter((p: any) => p.url.includes('cart')).length === 0) {
            // Browsing many pages but never visiting cart = low intent
            intent = { primary_intent: 'exploratory', confidence: 0.8 };
        }
    }

    // --- P1 NEW EVENTS ---

    // 13. Browsing Pattern Detection
    if (event.event_type === 'browsing_pattern') {
        if (event.payload?.pattern === 'scroll_without_click') {
            friction.push({ type: 'frustration', confidence: 0.75, evidence: ['scrolling_no_engagement'] });
            intent = { primary_intent: 'friction', confidence: 0.75 };
        } else if (event.payload?.pattern === 'searching_frustrated') {
            friction.push({ type: 'frustration', confidence: 0.85, evidence: ['search_without_results'] });
            intent = { primary_intent: 'friction', confidence: 0.85 };
        }
    }

    // 14. Predictive Purchase Score
    let purchaseScore = 50;
    if (event.event_type === 'product_detail' || event.event_type === 'cart_action') {
        const hasCartItems = history.some(e => e.event_type === 'add_to_cart' || (e.event_type === 'cart_action' && e.payload?.action === 'item_added'));
        const hasWishlist = history.some(e => e.event_type === 'add_to_wishlist');
        const expandedDescription = history.some(e => e.event_type === 'product_detail' && e.payload?.action === 'description_expanded');
        const hasExitIntent = history.some(e => e.event_type === 'exit_intent');

        if (hasCartItems) purchaseScore += 20;
        if (hasWishlist) purchaseScore += 15;
        if (expandedDescription) purchaseScore += 15;
        if (event.event_type === 'cart_action') purchaseScore += 10;
        if (hasExitIntent) purchaseScore -= 25;
        if (friction.length > 0) purchaseScore -= 10;

        purchaseScore = Math.max(0, Math.min(100, purchaseScore));

        if (purchaseScore > 75) {
            intent = { primary_intent: 'purchase', confidence: purchaseScore / 100 };
        }
    }

    // --- P2 NEW EVENTS ---

    // 15. Search Actions
    if (event.event_type === 'search_action') {
        if (event.payload?.action === 'typing' && event.payload?.time_to_type > 3000) {
            friction.push({ type: 'indecision', confidence: 0.65, evidence: ['slow_search_typing'] });
        }
    }

    // 16. Attention Indicators
    if (event.event_type === 'attention') {
        if (event.payload?.signal === 'tab_hidden') {
            friction.push({ type: 'trust', confidence: 0.6, evidence: ['tab_switch_comparison'] });
        }
    }

    // --- P3 NEW EVENTS ---

    // --- P3 NEW EVENTS ---

    // 17. Filter Usage Patterns
    if (event.event_type === 'filter_usage') {
        if (event.payload?.pattern === 'rapid_change') {
            friction.push({ type: 'indecision', confidence: 0.8, evidence: ['rapid_filter_switching'] });
            intent = { primary_intent: 'friction', confidence: 0.8 };
        }
    }

    // 18. Network Speed
    if (event.event_type === 'network_speed') {
        if (event.payload?.effective_type === 'slow-2g' || event.payload?.effective_type === '2g') {
            friction.push({ type: 'frustration', confidence: 0.7, evidence: ['slow_network'] });
        }
    }

    // 19. Device Context
    if (event.event_type === 'device_context') {
        if (event.payload?.device_type === 'mobile' && event.payload?.viewport_width < 400) {
            friction.push({ type: 'clarity', confidence: 0.5, evidence: ['small_screen_mobile'] });
        }
    }

    // 20. Text Selection (Price/Name)
    if (event.event_type === 'text_selection') {
        if (event.payload?.context === 'price') {
            friction.push({ type: 'price_sensitivity', confidence: 0.9, evidence: ['highlighted_price'] });
        } else if (event.payload?.context === 'product_name') {
            intent = { primary_intent: 'comparison', confidence: 0.85 };
        }
    }

    // 21. Copy Action (Comparison)
    if (event.event_type === 'copy_action') {
        intent = { primary_intent: 'comparison', confidence: 0.95 };
        friction.push({ type: 'indecision', confidence: 0.7, evidence: ['copied_product_name'] });
    }

    // 22. Doom Scrolling (High Velocity)
    if (event.event_type === 'scroll_velocity' && event.payload?.sustained) {
        friction.push({ type: 'frustration', confidence: 0.85, evidence: ['doom_scrolling'] });
        intent = { primary_intent: 'friction', confidence: 0.85 };
    }

    // 23. Footer Interaction (Trust / Gift)
    if (event.event_type === 'footer_interaction') {
        const type = event.payload?.type;
        if (type === 'about' || type === 'shipping') {
            friction.push({ type: 'trust', confidence: 0.8, evidence: ['checking_credential_links'] });
        } else if (type === 'returns' || type === 'gift-guide') {
            // New "Gift Anxiety" signal
            friction.push({ type: 'hesitation', confidence: 0.85, evidence: ['gift_anxiety_check'] });
            intent = { primary_intent: 'research', confidence: 0.8 };
        }
    }

    // 24. Oscillation Detection (A-B-A Navigation)
    // Check if user went Page A -> Page B -> Page A
    if (event.event_type === 'page_navigation') {
        const recentNavs = history.filter(e => e.event_type === 'page_navigation').slice(-3);
        if (recentNavs.length === 3) {
            const [a, b, c] = recentNavs.map(e => e.payload?.page_name);
            if (a === c && a !== b) {
                friction.push({ type: 'indecision', confidence: 0.9, evidence: ['oscillation_detected'] });
                intent = { primary_intent: 'comparison', confidence: 0.9 };
            }
        }
    }


    // --- CONTRACT CONSTRUCTION ---
    const contract: AnalystContract = {
        session_id: event.session_id,
        timestamp: new Date().toISOString(),
        intent_state: intent,
        friction_types: friction,
        recommended_actions: [],
        forbidden_actions: [],
        rationale: "Analysis based on Demo Suite patterns.",
        expiry: new Date(Date.now() + 1000 * 60 * 5).toISOString()
    };

    // --- BUILD SESSION CONTEXT ---
    const priceHoverCount = history.filter(e =>
        (e.event_type === 'hover' && e.payload?.element === 'price') ||
        (e.event_type === 'element_hover' && e.payload?.element_type === 'product_price')
    ).length;

    const scrollCount = history.filter(e =>
        e.event_type === 'scroll' || e.event_type === 'browsing_pattern'
    ).length;

    const productsViewed = new Set(history.filter(e =>
        e.event_type === 'view_item' || e.event_type === 'product_detail'
    ).map(e => e.payload?.product_id)).size;

    const cartItems = history.filter(e =>
        e.event_type === 'add_to_cart' ||
        (e.event_type === 'cart_action' && e.payload?.action === 'item_added')
    ).length;

    const sessionContext = {
        priceHoverCount,
        scrollCount,
        productsViewed,
        cartItems
    };

    // --- INTERVENTION RECOMMENDATION LOGIC (with cooldowns) ---

    // Helper function to attempt intervention
    const tryIntervention = (type: string, priority: number, message: string): boolean => {
        if (canFireIntervention(event.session_id, type, sessionContext)) {
            contract.recommended_actions.push({
                action_type: 'voice_proactive',
                priority,
                message_template: message,
                constraints: { max_frequency: '1/session', requires_user_consent: false }
            });
            recordIntervention(event.session_id, type, message);
            return true;
        }
        return false;
    };

    // Priority 1: HIGH URGENCY ALERTS (Immediate Action)

    // 1. Exit Intent (The "Wait, Don't Go" Save)
    if (intent.primary_intent === 'abandonment_risk') {
        tryIntervention('exit_intent', 1,
            "Not ready to decide? Save this item to your Wishlist and we'll notify you if the price drops.");
    }

    // 2. Search Frustration (Proactive Search Assistant)
    else if (friction.some(f => f.type === 'frustration' && f.evidence.includes('zero_results_search'))) {
        tryIntervention('search_frustration', 1,
            "It looks like you're having trouble finding the right match. Are you looking for a specific shade or style?");
    }

    // 3. Checkout Hesitation (Reassurance Agent)
    else if (friction.some(f => f.type === 'hesitation' && (event.event_type === 'checkout_step' || event.event_type === 'form_field'))) {
        tryIntervention('checkout_hesitation', 1,
            "Standard shipping takes 3-5 days. Need it faster? Upgrade for just $2 more. Checkout is secure with 256-bit encryption.");
    }

    // 4. Form Fatigue (Mobile "Lazy" Checkout)
    else if (friction.some(f => f.type === 'clarity' && f.evidence.includes('small_screen_mobile'))) {
        tryIntervention('form_fatigue', 1,
            "Skip the typing. Use Apple Pay / Google Pay to autofill everything in one click.");
    }

    // 5. Gift Anxiety ("Gift Safe" Guarantee)
    else if (friction.some(f => f.type === 'hesitation' && f.evidence.includes('gift_anxiety_check'))) {
        tryIntervention('gift_anxiety', 1,
            "Buying a gift? We offer a 'Digital Gift Receipt' so they can swap the size/color instantly before we even ship it.");
    }

    // Priority 2: BEHAVIORAL NUDGES (Mid-Session)

    // 6. Price Sensitivity (Dynamic Value Prop)
    else if (friction.some(f => f.type === 'price_sensitivity')) {
        tryIntervention('price_sensitivity', 2,
            "This price includes a 2-year warranty and free returns. (Plus, use code WELCOME5 for 5% off).");
    }

    // 7. Indecision (Side-by-Side Closer)
    else if (friction.some(f => f.type === 'indecision' && f.evidence.includes('rapid_filter_change'))) {
        tryIntervention('indecision', 2,
            "Stuck between options? I can help you find the best match for your budget/style.");
    }

    // 8. Comparison Loop (Price Match Guarantee)
    else if (intent.primary_intent === 'comparison') {
        tryIntervention('comparison_loop', 2,
            "We price match! Found it cheaper elsewhere? Let us know and we'll match it right now.");
    }

    // 9. Confusion (Navigation Guide)
    else if (friction.some(f => f.type === 'confusion')) {
        tryIntervention('confusion', 2,
            "Lost? Here are the most popular categories. Or ask me to find something specific.");
    }

    // 10. High Interest (Social Proof Nudge)
    else if (intent.primary_intent === 'high_interest') {
        tryIntervention('high_interest', 2,
            "Great choice! 12 other people have this in their cart right now. Only 3 left in this size.");
    }

    // 11. Visual Doom-Scrolling (Pattern Interruption)
    else if (friction.some(f => f.type === 'frustration' && f.evidence.includes('doom_scrolling'))) {
        tryIntervention('visual_doom_scrolling', 3,
            "You’ve scrolled past a lot of bright colors. Would you prefer to see just our minimalist styles?");
    }

    // 12. Trust Gap (Authority Injection)
    else if (friction.some(f => f.type === 'trust' && f.evidence.includes('checking_credential_links'))) {
        tryIntervention('trust_gap', 2,
            "Verified: We’ve shipped 5,000+ orders to your region this month. Rated 4.9/5 on Trustpilot.");
    }

    // 13. Specs Content (Contextual Simplifier)
    else if (event.event_type === 'click' && event.payload?.target === 'specs_toggle') {
        tryIntervention('specs_help', 3,
            "Wondering if this fits your needs? All our items have a 30-day fit guarantee.");
    }


    // --- FILTER ---
    // Rule: Only recommend actions if confidence is > 0.7
    contract.recommended_actions = contract.recommended_actions.filter(action => {
        // Find the friction driving this action
        // (Simplified logic: taking the highest confidence friction present)
        const maxFriction = Math.max(...friction.map(f => f.confidence), 0);
        const intentConf = intent.confidence;

        return Math.max(maxFriction, intentConf) > 0.7;
    });

    return contract;
}

// --- Endpoints ---

// 1. Event Ingestor
app.post('/api/event', (req, res) => {
    const event = req.body as UserEvent;
    console.log(`[Event] ${event.event_type} from ${event.session_id}`);

    // 0. Rate Limiting (Prevent Flooding)
    const lastEventTime = getLastEventTime(event.session_id);
    const now = Date.now();
    if (now - lastEventTime < 300) { // 300ms throttle per session
        console.warn(`[Throttle] Dropped event from ${event.session_id} (Too fast)`);
        res.json(activeSessions.get(event.session_id) || null); // Return last known state logic
        return;
    }
    setLastEventTime(event.session_id, now);

    // 1. Analyze
    const contract = generateContract(event);
    activeSessions.set(event.session_id, contract);

    // Update analytics after generating contract
    updateAnalytics(event.session_id, contract);

    // 2. Generate Narrative (Thought Process)
    const narrative = generateNarrative(event, contract);
    addToLogHistory(narrative);

    // 2. Broadcast to Dashboard
    const broadcastMsg = JSON.stringify({ type: 'analysis_update', event, contract, narrative });
    dashboardClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(broadcastMsg);
        }
    });

    // 3. Return Contract to Sales Agent (Client)
    res.json(contract);
});

// Global Log Buffer for Dashboard (Last 50 lines)
const recentNarrativeLogs: string[] = [];

function addToLogHistory(logs: string[]) {
    recentNarrativeLogs.push(...logs);
    if (recentNarrativeLogs.length > 50) {
        recentNarrativeLogs.splice(0, recentNarrativeLogs.length - 50);
    }
}

// 3. System Reset (Demo Support)
app.post('/api/reset', (req, res) => {
    console.log('[System] Global Reset Triggered');

    // Clear all in-memory state
    activeSessions.clear();
    eventHistory.clear();
    sessionTimestamps.clear();
    sessionInterventions.clear();
    sessionStartTimes.clear();
    cursorAggregation.clear();
    sessionConversions.clear();
    sessionFunnelTracking.clear();

    // Reset Analytics
    analyticsData.totalSessions = 0;
    analyticsData.activeSessions = 0;
    analyticsData.avgSessionDuration = 0;
    analyticsData.conversionRate = 0;
    analyticsData.frictionBreakdown = {};
    analyticsData.interventionBreakdown = {};
    analyticsData.funnel = { browsed: 0, addedToCart: 0, checkedOut: 0 };
    analyticsData.predictiveScores = undefined;

    // Clear Logs
    recentNarrativeLogs.length = 0;

    // Broadcast Reset
    const broadcastMsg = JSON.stringify({ type: 'reset' });
    dashboardClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(broadcastMsg);
        }
    });

    res.json({ success: true, message: 'System state wiped.' });
});

// 2. Dashboard Stream
wss.on('connection', (ws) => {
    console.log('Dashboard connected');
    dashboardClients.add(ws);

    // Send history immediately on connection
    if (recentNarrativeLogs.length > 0) {
        ws.send(JSON.stringify({
            type: 'analysis_update',
            narrative: recentNarrativeLogs
        }));
    }

    ws.on('close', () => dashboardClients.delete(ws));
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Analyst Server running on http://0.0.0.0:${PORT}`);
});
function generateNarrative(event: UserEvent, contract: AnalystContract): string[] {
    const logs: string[] = [];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timestamp = `[${time}]`;

    // 1. User Activity Tracking (TRACKING prefix)
    if (event.event_type === 'view_item') {
        logs.push(timestamp);
        logs.push(`TRACKING: Page loaded: "${event.payload?.name || 'Product Page'}"`);
        logs.push('');
        logs.push(timestamp);
        logs.push(`TRACKING: Customer viewing "${event.payload?.name}" priced at $${event.payload?.price}`);
    }
    else if (event.event_type === 'add_to_cart') {
        logs.push(timestamp);
        logs.push(`TRACKING: "${event.payload?.product_id}" added to cart`);
    }
    else if (event.event_type === 'remove_from_cart') {
        logs.push(timestamp);
        logs.push(`TRACKING: Item removed from cart`);
        if (contract.friction_types.some(f => f.type === 'confusion')) {
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: DETECTED CONFUSION: Add/Remove cycle observed`);
        }
    }
    else if (event.event_type === 'search') {
        logs.push(timestamp);
        logs.push(`TRACKING: Search query detected: "${event.payload?.query}"`);
    }
    else if (event.event_type === 'search_zero_results') {
        logs.push(timestamp);
        logs.push(`TRACKING: Search yielded ZERO results`);
        logs.push('');
        logs.push(timestamp);
        logs.push(`ANALYST: FRUSTRATION SIGNAL DETECTED via Zero Interaction`);
    }
    else if (event.event_type === 'click' && event.payload?.target === 'filter') {
        logs.push(timestamp);
        logs.push(`TRACKING: Filter criteria changed: ${event.payload?.filter}`);
        if (contract.friction_types.some(f => f.type === 'indecision')) {
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: DETECTED INDECISION: Rapid filter switching`);
        }
    }
    else if (event.event_type === 'add_to_wishlist') {
        const action = event.payload?.action || 'add';
        logs.push(timestamp);
        if (action === 'add') {
            logs.push(`TRACKING: Customer added "${event.payload?.product_id}" to WISHLIST`);
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: HIGH INTEREST signal detected (Confidence: ${(contract.intent_state.confidence * 100).toFixed(0)}%)`);
        } else {
            logs.push(`TRACKING: Customer removed item from wishlist`);
        }
    }
    else if (event.event_type === 'hover' && event.payload?.element === 'price') {
        logs.push(timestamp);
        logs.push(`TRACKING: User evaluating Price Tag ($${event.payload?.price || '??'})`);
        logs.push('');
        logs.push(timestamp);
        logs.push(`ANALYST: Price sensitivity friction detected`);
    }
    // P0 New Events Narrative
    else if (event.event_type === 'product_detail') {
        logs.push(timestamp);
        if (event.payload?.action === 'opened') {
            logs.push(`TRACKING: Product modal opened - "${event.payload?.product_name}"`);
        } else if (event.payload?.action === 'description_expanded') {
            logs.push(`TRACKING: Product Description Expanded`);
        } else if (event.payload?.action === 'quantity_increased') {
            logs.push(`TRACKING: Quantity increased to ${event.payload?.quantity}`);
        } else if (event.payload?.action === 'quantity_decreased') {
            logs.push(`TRACKING: Quantity decreased (HESITATION signal)`);
        } else if (event.payload?.action === 'add_to_cart') {
            const { product_name, quantity, size } = event.payload || {};
            const sizeInfo = size ? `, size: ${size}` : '';
            logs.push(`TRACKING: "${product_name}" added to cart${sizeInfo}, quantity: ${quantity}`);
        } else if (event.payload?.action === 'closed') {
            const timeSpent = Math.round(event.payload?.time_spent_ms / 1000);
            const productName = event.payload?.product_name || 'Product';
            logs.push(`TRACKING: "${productName}" window closed after ${timeSpent}s viewing time`);
        } else if (event.payload?.action === 'add_to_wishlist') {
            logs.push(`TRACKING: Product added to wishlist from modal`);
        } else {
            logs.push(`TRACKING: Product modal interaction - ${event.payload?.action}`);
        }
    }
    else if (event.event_type === 'element_hover') {
        const duration = Math.round(event.payload?.hover_duration_ms / 1000);
        logs.push(timestamp);
        logs.push(`TRACKING: User hovering on ${event.payload?.element_type} for ${duration}s`);
        if (event.payload?.element_type === 'product_price' && duration > 2) {
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: Price evaluation detected - possible sensitivity`);
        }
    }
    else if (event.event_type === 'cart_action') {
        logs.push(timestamp);
        if (event.payload?.action === 'item_added') {
            const { product_name, quantity, size } = event.payload || {};
            const sizeInfo = size ? `, size: ${size}` : '';
            logs.push(`TRACKING: "${product_name}" added to cart${sizeInfo}, quantity: ${quantity}`);
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: PURCHASE INTENT detected (Confidence: 90%)`);
        } else if (event.payload?.action === 'item_removed') {
            const productName = event.payload?.product_name || 'Item';
            logs.push(`TRACKING: "${productName}" removed from cart`);
        } else if (event.payload?.action === 'checkout_started') {
            const { item_count, total_value } = event.payload || {};
            logs.push(`TRACKING: Checkout started with ${item_count} items worth $${total_value}`);
        }
    }
    else if (event.event_type === 'similar_product_clicked') {
        logs.push(timestamp);
        logs.push(`TRACKING: User clicked similar product: ${event.payload?.product_id}`);
        if (contract.friction_types.some(f => f.type === 'indecision' && f.evidence.includes('comparison_loop'))) {
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: COMPARISON LOOP detected - User stuck comparing products`);
        }
    }
    else if (event.event_type === 'browsing_pattern') {
        logs.push(timestamp);
        const pattern = event.payload?.pattern;
        const metrics = event.payload?.metrics;
        logs.push(`TRACKING: Browsing pattern detected: ${pattern}`);
        if (pattern === 'scroll_without_click') {
            logs.push(`TRACKING: User scrolled ${metrics?.scroll_count} times without clicking`);
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: LOW ENGAGEMENT - User not finding relevant products`);
        } else if (pattern === 'searching_frustrated') {
            logs.push(`TRACKING: ${metrics?.searches_made} searches with no product clicks`);
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: SEARCH FRUSTRATION - Intervention recommended`);
        }
    }
    else if (event.event_type === 'search_action') {
        logs.push(timestamp);
        if (event.payload?.action === 'typing') {
            logs.push(`TRACKING: Search query: "${event.payload?.query}" (${event.payload?.time_to_type}ms)`);
        } else if (event.payload?.action === 'focus') {
            logs.push(`TRACKING: User focused on search bar`);
        } else {
            logs.push(`TRACKING: Search action - ${event.payload?.action}`);
        }
    }
    else if (event.event_type === 'attention') {
        // Skip all attention events from demo logs (tracked in background for analytics)
    }
    else if (event.event_type === 'cursor_stream') {
        // Skip from demo logs (still tracked in background for analytics)
    }
    else if (event.event_type === 'filter_usage') {
        logs.push(timestamp);
        if (event.payload?.pattern === 'rapid_change') {
            logs.push(`TRACKING: Rapid filter changes detected (${event.payload?.count} changes)`);
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: INDECISION pattern - User cannot find right product`);
        } else {
            logs.push(`TRACKING: Filter applied: ${event.payload?.filter}`);
        }
    }
    else if (event.event_type === 'network_speed') {
        // Only log if network is slow (actionable insight)
        if (event.payload?.effective_type === 'slow-2g' || event.payload?.effective_type === '2g') {
            logs.push(timestamp);
            logs.push(`TRACKING: Network speed: ${event.payload?.effective_type} (${event.payload?.downlink}Mbps)`);
            logs.push('');
            logs.push(timestamp);
            logs.push(`ANALYST: SLOW NETWORK detected - May impact user experience`);
        }
        // Skip normal network speed (not actionable)
    }
    else if (event.event_type === 'device_context') {
        // Skip - not actionable during session (collected once at start)
    }
    else if (event.event_type === 'exit_intent') {
        logs.push(timestamp);
        logs.push(`TRACKING: Mouse cursor left viewport`);
        logs.push('');
        logs.push(timestamp);
        logs.push(`ANALYST: ⚠️ EXIT INTENT DETECTED`);
    }
    else if (event.event_type === 'click_rage') {
        logs.push(timestamp);
        logs.push(`TRACKING: Rapid clicking detected on element`);
        logs.push('');
        logs.push(timestamp);
        logs.push(`ANALYST: FRUSTRATION signal - user experiencing difficulty`);
    }
    else if (event.event_type === 'scroll' || event.event_type === 'scroll_depth') {
        // Skip logging for scroll events - too noisy
    }
    else if (event.event_type === 'heartbeat') {
        // Skip logging for heartbeat - too noisy
    }
    else if (event.event_type === 'idle') {
        // Skip - not actionable (user is idle)
    }
    else if (event.event_type === 'session_journey') {
        // Skip logging - aggregated journey data
    }
    // Enhanced Tracking Events
    else if (event.event_type === 'session_started') {
        logs.push(timestamp);
        logs.push(`TRACKING: Page loaded - ${event.payload?.entry_page || 'Home'}`);
        logs.push('');
        logs.push(timestamp);
        logs.push(`TRACKING: New user detected - Creating behavioral profile`);
    }
    else if (event.event_type === 'page_navigation') {
        logs.push(timestamp);
        const pageName = event.payload?.page_name || 'Unknown';
        logs.push(`TRACKING: Page loaded - ${pageName}`);

        // Check if it's a collection page
        if (event.payload?.page_type === 'collection') {
            logs.push('');
            logs.push(timestamp);
            logs.push(`TRACKING: "${pageName}" collection page accessed`);
        }
    }
    else if (event.event_type === 'product_viewed') {
        logs.push(timestamp);
        const { product_name, price } = event.payload || {};
        logs.push(`TRACKING: Customer viewing "${product_name}" priced at $${price}`);
    }
    else if (event.event_type === 'product_variant_changed') {
        logs.push(timestamp);
        const { variant_type, from_value, to_value } = event.payload || {};
        const fromDisplay = from_value || 'none';
        logs.push(`TRACKING: Product ${variant_type} changed from "${fromDisplay}" to "${to_value}"`);
    }
    else if (event.event_type === 'cart_opened') {
        logs.push(timestamp);
        const { item_count, total_value } = event.payload || {};
        logs.push(`TRACKING: Cart opened with ${item_count} items totaling $${total_value}`);
    }
    else if (event.event_type === 'cart_closed') {
        logs.push(timestamp);
        const viewingTime = Math.round((event.payload?.viewing_time_ms || 0) / 1000);
        logs.push(`TRACKING: Cart closed after ${viewingTime}s viewing time`);
    }
    else if (event.event_type === 'wishlist_opened') {
        logs.push(timestamp);
        const itemCount = event.payload?.item_count || 0;
        logs.push(`TRACKING: Wishlist opened with ${itemCount} saved items`);
    }
    else if (event.event_type === 'wishlist_closed') {
        logs.push(timestamp);
        const viewingTime = Math.round((event.payload?.viewing_time_ms || 0) / 1000);
        logs.push(`TRACKING: Wishlist closed after ${viewingTime}s viewing time`);
    }
    else if (event.event_type === 'wishlist_item_added') {
        logs.push(timestamp);
        const productName = event.payload?.product_name || 'Unknown product';
        logs.push(`TRACKING: "${productName}" added to wishlist`);
    }
    else if (event.event_type === 'form_field_change') {
        logs.push(timestamp);
        const { form_type, field_name, value } = event.payload || {};
        const displayValue = field_name === 'phone' || field_name === 'email' ? value :
            field_name === 'fullName' ? value : value;
        logs.push(`TRACKING: ${form_type.charAt(0).toUpperCase() + form_type.slice(1)} "${field_name}" field filled with "${displayValue}"`);
    }
    else if (event.event_type === 'shipping_option_selected') {
        logs.push(timestamp);
        const { option_name, cost, delivery_time } = event.payload || {};
        logs.push(`TRACKING: "${option_name} (${delivery_time})" shipping selected for $${cost}`);
    }
    else if (event.event_type === 'delivery_slot_selected') {
        logs.push(timestamp);
        const { slot_name, time_range } = event.payload || {};
        logs.push(`TRACKING: "${slot_name}" delivery window selected (${time_range})`);
    }
    else {
        // Skip logging for demo-hidden background events
        const hiddenEvents = ['device_context', 'attention', 'cursor_stream', 'heartbeat', 'idle', 'scroll', 'scroll_depth', 'session_journey'];
        if (!hiddenEvents.includes(event.event_type)) {
            logs.push(timestamp);
            logs.push(`TRACKING: Event captured - ${event.event_type}`);
        }
    }

    // 2. Intervention Generation
    const action = contract.recommended_actions[0];
    if (action && action.action_type !== 'none') {
        logs.push('');
        logs.push(timestamp);
        logs.push(`ANALYST: >>> GENERATING INTERVENTION`);
        logs.push('');
        logs.push(timestamp);
        logs.push(`ANALYST: Action: ${action.action_type.replace('_', ' ')}`);
        logs.push(`ANALYST: "${action.message_template}"`);
    }

    return logs;
}


