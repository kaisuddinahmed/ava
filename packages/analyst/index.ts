import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import type {
    AnalystContract, UserEvent, IntentState, DetectedFriction,
    SessionState, SessionScores, ProductContext, ComparisonContext,
    SearchContext, CartContext, SessionHistory, CooldownState,
    ScenarioContributions, InterventionPayload, FrictionType,
    AdvancedScoreState,
} from '../shared/types.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load environment variables
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

// V2 modules
import {
    SCORE_DELTAS, applyEvent, decay, normalize, shouldIntervene,
    canApplyScenario, applyScenarioScore, INTEREST_THRESHOLD, HELP_NEED_THRESHOLD,
    // Advanced scoring imports
    createAdvancedScoreState, applyEventAdvanced, calculateCurrentScores,
    shouldInterveneProbabilistic, applyFrictionsWithConfidence, getSessionReliability,
    adjustProbabilityForSession, getScoreBreakdown,
} from './scoring.ts';
import { runAllDetectors } from './friction-detectors.ts';
import {
    selectIntervention, canIntervene, handleDismissal,
    recordIntervention as recordInterventionCooldown, createCooldownState,
    getInterventionStage, recordStageUsed, detectConversionOpportunity,
    clearSessionStages,
} from './intervention-engine.ts';
import { resolveContext } from './context-resolvers.ts';
import { generateScript } from './script-generator.ts';

console.log('--- STARTING ANALYST SERVER ---');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'ui/dist')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui/dist/index.html'));
});

// ============================================================
// Deepgram TTS Endpoint
// ============================================================

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

app.post('/api/tts', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    if (!DEEPGRAM_API_KEY || DEEPGRAM_API_KEY === 'your_deepgram_api_key_here') {
        console.warn('Deepgram API key not configured, falling back to empty response');
        return res.status(503).json({ error: 'TTS service not configured' });
    }

    try {
        // Call Deepgram Nova TTS API - Helena voice (feminine, caring, natural, friendly)
        const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-helena-en', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Deepgram API error:', response.status, errorText);
            return res.status(response.status).json({ error: 'TTS generation failed', details: errorText });
        }

        // Get the audio buffer
        const audioBuffer = await response.arrayBuffer();

        // Send audio back to client
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.byteLength,
        });
        res.send(Buffer.from(audioBuffer));

    } catch (error) {
        console.error('TTS error:', error);
        res.status(500).json({ error: 'TTS generation failed', details: String(error) });
    }
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// ============================================================
// State
// ============================================================

const sessionStates = new Map<string, SessionState>();
const eventHistory = new Map<string, UserEvent[]>();
const dashboardClients = new Set<WebSocket>();
const sessionTimestamps = new Map<string, number>();
const sessionStartTimes = new Map<string, number>();

// Cursor aggregation (legacy, kept for log filtering)
const cursorAggregation: Map<string, { totalSamples: number; lastLoggedTime: number }> = new Map();

// Narration cooldowns: prevent repeating the same scenario narration within a short window
const narrationCooldowns = new Map<string, number>(); // key: "sessionId:scenarioOrEvent" → last timestamp

// ============================================================
// Session State Factory
// ============================================================

function createSessionState(sessionId: string): SessionState {
    return {
        session_id: sessionId,
        device_type: 'desktop',
        is_new_user: true,
        visit_count: 1,
        scores: { interest: 0, friction: 0, clarity: 100 },
        advanced_scores: createAdvancedScoreState(), // V2: Time-weighted scoring
        product_context: {},
        comparison_context: { products: new Map() },
        search_context: { queries: [] },
        cart_context: { items: [], total_value: 0, item_count: 0 },
        session_history: {
            pages_visited: [], products_viewed: [], search_queries: [],
            filters_applied: [], session_start: Date.now(), session_duration_ms: 0,
            total_products_viewed: 0, total_cart_adds: 0, total_cart_removes: 0, total_wishlist_adds: 0,
        },
        events: [],
        frictions: [],
        interventions: [],
        current_page: 'home',
        session_start: Date.now(),
        last_activity: Date.now(),
        idle_seconds: 0,
        cooldown: createCooldownState(),
        scenario_contributions: {},
    };
}

function getOrCreateSession(sessionId: string): SessionState {
    if (!sessionStates.has(sessionId)) {
        sessionStates.set(sessionId, createSessionState(sessionId));
        sessionStartTimes.set(sessionId, Date.now());
    }
    return sessionStates.get(sessionId)!;
}

// ============================================================
// Context Updaters
// ============================================================

function updateProductContext(state: SessionState, event: UserEvent): void {
    const p = event.payload;

    if (event.event_type === 'product_viewed' || (event.event_type === 'product_detail' && p?.action === 'opened')) {
        state.product_context.current_product = {
            product_id: p?.product_id || p?.sku || '',
            product_name: p?.product_name || p?.name || '',
            price: p?.price || 0,
            variant: p?.variant || undefined,
            focus_start: Date.now(),
            actions: ['viewed'],
        };
        state.session_history.total_products_viewed++;
        if (p?.product_id) state.session_history.products_viewed.push(p.product_id);
    }

    if (event.event_type === 'product_modal_closed' || (event.event_type === 'product_detail' && p?.action === 'closed')) {
        if (state.product_context.current_product) {
            state.product_context.last_product = {
                product_id: state.product_context.current_product.product_id,
                product_name: state.product_context.current_product.product_name,
                price: state.product_context.current_product.price,
                variant: state.product_context.current_product.variant,
                last_interaction: Date.now(),
            };
            state.product_context.current_product = undefined;
        }
    }

    if (event.event_type === 'product_description_expanded') {
        if (state.product_context.current_product) {
            state.product_context.current_product.actions.push('expanded_specs');
            state.product_context.current_product.actions.push('viewed_description');
        }
    }

    if (event.event_type === 'product_reviews_viewed') {
        if (state.product_context.current_product) {
            state.product_context.current_product.actions.push('viewed_reviews');
        }
    }



    // Track variant changes as actions
    if (event.event_type === 'product_variant_changed') {
        if (state.product_context.current_product) {
            state.product_context.current_product.actions.push('variant_changed');
        }
    }
}

function updateComparisonContext(state: SessionState, event: UserEvent): void {
    if (event.event_type === 'product_viewed' || (event.event_type === 'product_detail' && event.payload?.action === 'opened')) {
        const productId = event.payload?.product_id || event.payload?.sku || '';
        if (!productId) return;

        const existing = state.comparison_context.products.get(productId);
        if (existing) {
            existing.view_count++;
            existing.last_viewed = Date.now();
        } else {
            state.comparison_context.products.set(productId, {
                product_id: productId,
                product_name: event.payload?.product_name || event.payload?.name || '',
                price: event.payload?.price || 0,
                view_count: 1,
                last_viewed: Date.now(),
                total_time_ms: 0,
            });
        }
    }

    // Update total_time when product modal closes
    if (event.event_type === 'product_modal_closed' || (event.event_type === 'product_detail' && event.payload?.action === 'closed')) {
        const productId = event.payload?.product_id || '';
        const entry = state.comparison_context.products.get(productId);
        if (entry && event.payload?.time_spent_ms) {
            entry.total_time_ms += event.payload.time_spent_ms;
        }
    }
}

function updateSearchContext(state: SessionState, event: UserEvent): void {
    if (event.event_type === 'search_query' || event.event_type === 'search_zero_results') {
        state.search_context.queries.push({
            query: event.payload?.query || '',
            timestamp: Date.now(),
            results_count: event.payload?.results_count ?? (event.event_type === 'search_zero_results' ? 0 : -1),
            clicked_any: false,
        });
        state.session_history.search_queries.push(event.payload?.query || '');
    }

    // Mark last query as clicked if user views a product after searching
    if (event.event_type === 'product_viewed' || event.event_type === 'product_detail') {
        const lastQuery = state.search_context.queries[state.search_context.queries.length - 1];
        if (lastQuery && Date.now() - lastQuery.timestamp < 30000) {
            lastQuery.clicked_any = true;
        }
    }
}

function updateCartContext(state: SessionState, event: UserEvent): void {
    const p = event.payload;

    if (event.event_type === 'cart_item_added' || (event.event_type === 'cart_action' && p?.action === 'item_added') || event.event_type === 'add_to_cart') {
        const unitPrice = p?.product_price || p?.price || p?.unit_price || 0;
        const qty = p?.quantity || 1;
        state.cart_context.items.push({
            product_id: p?.product_id || '',
            product_name: p?.product_name || '',
            variant: p?.variant || p?.size || '',
            quantity: qty,
            unit_price: unitPrice,
            total_price: p?.total_price || (unitPrice * qty) || 0,
        });
        state.cart_context.item_count = state.cart_context.items.length;
        state.cart_context.total_value = state.cart_context.items.reduce((s, i) => s + i.total_price, 0);
        state.session_history.total_cart_adds++;
    }

    if (event.event_type === 'cart_item_removed' || (event.event_type === 'cart_action' && p?.action === 'item_removed') || event.event_type === 'remove_from_cart') {
        const idx = state.cart_context.items.findIndex((i) => i.product_id === (p?.product_id || ''));
        if (idx !== -1) state.cart_context.items.splice(idx, 1);
        state.cart_context.item_count = state.cart_context.items.length;
        state.cart_context.total_value = state.cart_context.items.reduce((s, i) => s + i.total_price, 0);
        state.session_history.total_cart_removes++;
    }
}

function updateSessionHistory(state: SessionState, event: UserEvent): void {
    if (event.event_type === 'page_navigation' || event.event_type === 'page_loaded') {
        const pageName = event.payload?.page_name || '';
        state.session_history.pages_visited.push(pageName);
        state.current_page = pageName;
    }

    if (event.event_type === 'filter_applied' || event.event_type === 'filter_usage') {
        state.session_history.filters_applied.push(event.payload?.filter_value || event.payload?.filter || '');
    }

    if (event.event_type === 'wishlist_item_added' || event.event_type === 'add_to_wishlist') {
        state.session_history.total_wishlist_adds++;
    }

    if (event.event_type === 'new_user_detected') {
        state.is_new_user = true;
    }
    if (event.event_type === 'existing_user_detected') {
        state.is_new_user = false;
        state.visit_count = event.payload?.visit_count || 2;
    }
    if (event.event_type === 'device_context') {
        if (event.payload?.device_type) state.device_type = event.payload.device_type;
    }

    state.session_history.session_duration_ms = Date.now() - state.session_history.session_start;
}

// ============================================================
// Score Delta Mapping (event → scenario key)
// ============================================================

function getScenarioKey(event: UserEvent, state: SessionState): string | null {
    const p = event.payload;
    const et = event.event_type;
    const history = eventHistory.get(state.session_id) || [];

    // ========================================
    // 2.2.1 Engagement Signals (Interest +)
    // ========================================

    // Extended viewing — product dwell >15s
    if ((et === 'product_modal_closed' || (et === 'product_detail' && p?.action === 'closed')) && (p?.time_spent_ms || 0) > 15000) {
        return 'extended_viewing';
    }

    // Variant selected — but check for variant_indecision (5+ changes) first
    if (et === 'product_variant_changed') {
        const cp = state.product_context.current_product;
        if (cp) {
            const variantChanges = cp.actions.filter(a => a === 'variant_changed').length;
            if (variantChanges >= 5) return 'variant_indecision';
        }
        return 'variant_selection';
    }

    // Review section opened
    if (et === 'product_reviews_viewed') return 'review_reading';

    // Wishlist add
    if (et === 'wishlist_item_added' || et === 'add_to_wishlist') return 'wishlist_save';

    // Revisit / comparison — product viewed 2+ times, or comparison loop (2 SKUs at 3+ each)
    if (et === 'product_viewed' || (et === 'product_detail' && p?.action === 'opened')) {
        const products = state.comparison_context.products;
        // Check comparison_loop first (higher friction)
        const highViewProducts = Array.from(products.values()).filter(pp => pp.view_count >= 3);
        if (highViewProducts.length >= 2) return 'comparison_loop';
        // Otherwise check single product revisit
        const productId = p?.product_id || p?.sku;
        if (productId) {
            const entry = products.get(productId);
            if (entry && entry.view_count >= 2) return 'product_revisit';
        }
    }

    // ========================================
    // 2.2.2 Decision Fatigue (Friction +)
    // ========================================

    // 5+ products opened in <90s — rapid browsing
    if (et === 'browsing_pattern' && p?.pattern === 'rapid_browsing') return 'rapid_browsing';

    // Rapid back navigation — session_journey with back-and-forth pattern
    if (et === 'session_journey') {
        const path = p?.path || [];
        if (path.length >= 4) {
            // Detect back-forth pattern: A→B→A→B or rapid path changes
            const recent = path.slice(-4);
            if (recent[0] === recent[2] && recent[1] === recent[3]) return 'navigation_loops';
        }
    }
    if (et === 'browsing_pattern' && p?.pattern === 'searching_frustrated') return 'navigation_loops';

    // Sort/filter changes >3 times — filter indecision
    if (et === 'filter_applied' || et === 'filter_usage') {
        const recentFilters = state.session_history.filters_applied.slice(-5);
        if (recentFilters.length >= 3) return 'filter_indecision';
    }
    if (et === 'filter_reset') return 'filter_loop';
    if (et === 'semantic_search_refinement') return 'search_refinement';

    // Price Sensitivity
    if (et === 'sort_changed' && p?.pattern === 'cycling') return 'price_sort_cycling';
    if (et === 'price_filter_changed') return 'price_filtering';
    if (et === 'coupon_exploration') return 'coupon_seeking';
    if (et === 'variant_downgraded') return 'downgrade_intent';


    // ========================================
    // 2.2.3 Trust Gap (Friction +)
    // ========================================

    // Policy → Reviews → Security sequence — trust seeking
    if (et === 'page_navigation') {
        const trustPages = ['about', 'contact', 'reviews', 'security', 'privacy', 'return', 'faq', 'help', 'terms'];
        const pageName = (p?.page_name || '').toLowerCase();
        if (trustPages.some((tp) => pageName.includes(tp))) return 'trust_seeking';
    }
    if (et === 'click_rage') return 'trust_seeking';

    // Cart opened → closed immediately (<3s)
    if (et === 'cart_closed' && (p?.viewing_time_ms || 0) < 3000) return 'cart_hesitation';

    // 2.2.4 Comparison Conflict — handled above in product_viewed (comparison_loop) and product_variant_changed (variant_indecision)

    // ========================================
    // 2.2.5 Information Gap (Friction +)
    // ========================================

    // Spec/description expanded 2+ times — spec confusion
    if (et === 'product_description_expanded' || (et === 'click' && p?.target === 'specs_toggle')) {
        const cp = state.product_context.current_product;
        if (cp) {
            const specCount = cp.actions.filter((a) => a === 'expanded_specs' || a === 'viewed_description').length;
            if (specCount >= 2) return 'spec_confusion';
        }
    }

    // Size chart opened 2+ times — sizing uncertainty
    if (et === 'product_detail' && p?.action === 'size_chart_viewed') {
        const cp = state.product_context.current_product;
        if (cp) {
            const sizeCount = cp.actions.filter(a => a === 'size_chart_viewed').length;
            if (sizeCount >= 2) return 'sizing_uncertainty';
        }
    }

    // External tab after viewing specs/product — external research
    if (et === 'visibility_change' && p?.state === 'hidden' && state.product_context.current_product) {
        return 'external_research';
    }

    // Price hover >5s or price text selection — price sensitivity (uses info gap delta)
    if (et === 'text_selection' && p?.context === 'price') return 'spec_confusion';

    // ========================================
    // 2.2.6 Checkout Anxiety (Friction +)
    // ========================================

    // Checkout opened → idle 20s
    if (et === 'checkout_idle') return 'checkout_hesitation';
    if (et === 'browsing_pattern' && p?.pattern === 'checkout_idle') return 'checkout_hesitation';

    // Payment method hover loops
    if (et === 'payment_method_viewed') return 'payment_anxiety';
    if (et === 'address_field_loop') return 'address_field_loop';

    // Information Loop & Confusion
    if (et === 'spec_review_loop') return 'info_loop';
    if (et === 'variant_toggle') return 'variant_indecision';
    if (et === 'size_chart_first') return 'sizing_anxiety';
    
    // Trust Issues
    if (et === 'quick_bounce') return 'bad_landing';
    if (et === 'return_hover') return 'return_policy_check';
    if (et === 'faq_visit') return 'help_seeking';

    // Momentum Loss
    if (et === 'brief_tab_blur') return 'brief_tab_blur';
    if (et === 'cursor_idle_mid_page') return 'cursor_idle_mid_page';
    if (et === 'region_rescroll') return 'region_rescroll';


    // ========================================
    // 2.2.7 Momentum Loss
    // ========================================

    // Idle mid-page >25s (the idle event fires at 5s, but doom_scrolling and scroll_without_click indicate real stalling)
    if (et === 'idle' && (p?.duration || 0) >= 25000) return 'mid_session_idle';
    if (et === 'browsing_pattern' && p?.pattern === 'doom_scrolling') return 'mid_session_idle';
    if (et === 'browsing_pattern' && p?.pattern === 'scroll_without_click') return 'mid_session_idle';

    // Tab switch after cart add — external distraction
    if (et === 'attention' && p?.signal === 'tab_hidden') {
        const recentCartAdd = history.slice(-5).some(
            (e) => e.event_type === 'add_to_cart' || e.event_type === 'cart_item_added'
        );
        if (recentCartAdd) return 'external_distraction';
    }

    // ========================================
    // 2.2.8 Gift Anxiety
    // ========================================

    // Return → Size → Shipping sequence — gift uncertainty
    if (et === 'browsing_pattern' && p?.pattern === 'gift_anxiety') return 'gift_uncertainty';
    if (et === 'product_return_policy_viewed') {
        // Check if they've also viewed size/shipping-related pages
        const recentTypes = history.slice(-10).map(e => e.event_type);
        const hasShipping = recentTypes.includes('shipping_method_viewed');
        const hasVariant = recentTypes.includes('product_variant_changed');
        if (hasShipping || hasVariant) return 'gift_uncertainty';
        // Single return policy view still indicates gift anxiety if product is being viewed
        if (state.product_context.current_product) return 'gift_uncertainty';
    }

    // ========================================
    // Exit Intent
    // ========================================
    if (et === 'exit_intent') return 'exit_detected';

    return null;
}

// ============================================================
// Process Event (V2 — replaces generateContract)
// ============================================================

function processEvent(event: UserEvent): AnalystContract {
    const state = getOrCreateSession(event.session_id);

    // Store event in history
    if (!eventHistory.has(event.session_id)) {
        eventHistory.set(event.session_id, []);
    }
    const history = eventHistory.get(event.session_id)!;
    history.push(event);
    if (history.length > 30) history.shift();

    state.events = history;
    state.last_activity = Date.now();
    state.idle_seconds = 0;

    // Step 1: Update all contexts
    updateProductContext(state, event);
    updateComparisonContext(state, event);
    updateSearchContext(state, event);
    updateCartContext(state, event);
    updateSessionHistory(state, event);

    // Step 2: Calculate score deltas (LEGACY + ADVANCED)
    const scenarioKey = getScenarioKey(event, state);
    if (scenarioKey && SCORE_DELTAS[scenarioKey]) {
        const delta = SCORE_DELTAS[scenarioKey];
        const maxDelta = Math.max(Math.abs(delta.interest), Math.abs(delta.friction), Math.abs(delta.clarity));
        if (canApplyScenario(scenarioKey, state.scenario_contributions, maxDelta)) {
            // Legacy scoring (kept for backward compatibility)
            state.scores = applyEvent(state.scores, delta);
            applyScenarioScore(scenarioKey, state.scenario_contributions, maxDelta);

            // ADVANCED: Apply to time-weighted scoring system
            if (state.advanced_scores) {
                state.advanced_scores = applyEventAdvanced(
                    state.advanced_scores,
                    scenarioKey,
                    delta,
                    1.0 // Full confidence for scenario-based events
                );
            }
        }
    }

    // Boost interest for core engagement events even without scenario key
    if (['add_to_cart', 'cart_item_added'].includes(event.event_type)) {
        const cartDelta = { interest: 20, friction: 0, clarity: 5 };
        state.scores = applyEvent(state.scores, cartDelta);
        // ADVANCED: Apply cart add with high confidence
        if (state.advanced_scores) {
            state.advanced_scores = applyEventAdvanced(state.advanced_scores, 'cart_add', cartDelta, 1.0);
        }
    }
    if (event.event_type === 'checkout_started' || (event.event_type === 'cart_action' && event.payload?.action === 'checkout_started')) {
        const checkoutDelta = { interest: 25, friction: 0, clarity: 10 };
        state.scores = applyEvent(state.scores, checkoutDelta);
        // ADVANCED: Apply checkout start
        if (state.advanced_scores) {
            state.advanced_scores = applyEventAdvanced(state.advanced_scores, 'checkout_start', checkoutDelta, 1.0);
        }
    }

    // Step 3: Run friction detectors
    const idleTime = (Date.now() - state.last_activity);
    const scrollData = event.event_type === 'browsing_pattern' && event.payload?.pattern === 'doom_scrolling'
        ? { duration_ms: event.payload.duration_ms || 0, items_passed: event.payload.items_passed || 0 }
        : null;
    const productClicks = state.session_history.total_products_viewed;

    const detectedFrictions = runAllDetectors(
        event, history, state.product_context, state.cart_context,
        state.comparison_context, state.search_context,
        idleTime, state.device_type, state.is_new_user,
        scrollData, productClicks
    );

    state.frictions = detectedFrictions;

    // ADVANCED: Apply friction detections with confidence weighting
    if (state.advanced_scores && detectedFrictions.length > 0) {
        state.advanced_scores = applyFrictionsWithConfidence(state.advanced_scores, detectedFrictions);
    }

    // Step 4: Determine intervention
    const isDismissed = Date.now() < state.cooldown.dismissedUntil;
    const inPayment = state.current_page.toLowerCase().includes('payment') ||
        event.event_type === 'payment_method_selected';

    let interventionPayload: InterventionPayload | undefined;

    // Handle intervention response events
    if (event.event_type === 'intervention_dismissed') {
        handleDismissal(state.cooldown);
        // Log to intervention history
        if (state.interventions.length > 0) {
            const lastIntervention = state.interventions[state.interventions.length - 1];
            if (!lastIntervention.user_response) {
                lastIntervention.user_response = 'dismissed';
            }
        }
    }
    if (event.event_type === 'intervention_accepted') {
        // Log to intervention history
        if (state.interventions.length > 0) {
            const lastIntervention = state.interventions[state.interventions.length - 1];
            if (!lastIntervention.user_response) {
                lastIntervention.user_response = 'accepted';
                lastIntervention.outcome = 'pending'; // Will be updated if conversion happens
            }
        }
    }
    if (event.event_type === 'intervention_ignored') {
        // Log to intervention history
        if (state.interventions.length > 0) {
            const lastIntervention = state.interventions[state.interventions.length - 1];
            if (!lastIntervention.user_response) {
                lastIntervention.user_response = 'ignored';
            }
        }
    }

    // Track conversion outcomes for interventions
    if (event.event_type === 'order_placed') {
        // Mark any "accepted" interventions as conversions
        for (const intervention of state.interventions) {
            if (intervention.user_response === 'accepted' && intervention.outcome === 'pending') {
                intervention.outcome = 'conversion';
            }
        }
    }

    // Mark abandoned outcomes on exit_intent with cart items (likely abandonment)
    if (event.event_type === 'exit_intent' && state.cart_context.item_count > 0) {
        // Mark pending interventions as potentially abandoned
        for (const intervention of state.interventions) {
            if (intervention.outcome === 'pending') {
                intervention.outcome = 'abandoned';
            }
        }
    }

    // ADVANCED: Calculate time-decayed scores and probabilistic decision
    let shouldAct = false;
    let interventionProbability = 0;
    let interventionReason = '';

    if (state.advanced_scores) {
        // Get current time-decayed scores
        const advancedScores = calculateCurrentScores(state.advanced_scores);

        // Use probabilistic intervention decision
        const probabilisticResult = shouldInterveneProbabilistic(
            advancedScores,
            isDismissed,
            inPayment
        );

        // Adjust probability based on session reliability (new sessions are less reliable)
        const adjustedProbability = adjustProbabilityForSession(
            probabilisticResult.probability,
            state.session_start
        );

        // Make the final decision with adjusted probability
        shouldAct = Math.random() < adjustedProbability;
        interventionProbability = adjustedProbability;
        interventionReason = probabilisticResult.reason;

        // Also update the legacy scores with time-decayed values for dashboard display
        state.scores = advancedScores;
    } else {
        // Fallback to legacy binary decision
        shouldAct = shouldIntervene(state.scores, isDismissed, inPayment);
        interventionReason = shouldAct ? 'Legacy threshold met' : 'Legacy threshold not met';
    }

    // Detect proactive conversion opportunities (for new users especially)
    const conversionOpp = detectConversionOpportunity(
        state.session_history,
        state.product_context,
        state.cart_context,
        state.is_new_user
    );

    if (shouldAct && (detectedFrictions.length > 0 || conversionOpp)) {
        // selectIntervention now considers both frictions and conversion opportunities
        const selected = selectIntervention(detectedFrictions, conversionOpp);
        if (selected && canIntervene(selected.friction, state.cooldown, state.is_new_user)) {
            // Get the current intervention stage for this friction type
            const stageInfo = getInterventionStage(event.session_id, selected.friction.type as FrictionType);

            const ctx = resolveContext(
                selected.friction.type, event,
                state.product_context, state.cart_context,
                state.comparison_context, state.search_context,
                { evidence: selected.friction.evidence, context: selected.friction.context }
            );

            // Add cart_total to context for stage-aware scripts
            (ctx as any).cart_total = state.cart_context.total_value;

            // Generate script with stage awareness
            const generated = generateScript(selected.friction.type as FrictionType, ctx, stageInfo.stage);

            interventionPayload = {
                ui_type: generated.ui_type,
                script: generated.script,
                friction_type: selected.friction.type,
                context: ctx,
                priority: selected.priority,
                stage: stageInfo.stage,
                approach: stageInfo.approach,
            };

            recordInterventionCooldown(state.cooldown, selected.friction);
            recordStageUsed(event.session_id, selected.friction.type as FrictionType);

            state.interventions.push({
                timestamp: Date.now(),
                friction_type: selected.friction.type,
                intervention_type: generated.ui_type,
                script: generated.script,
                context: ctx,
                user_response: null,
                stage: stageInfo.stage,
                approach: stageInfo.approach,
            });
        }
    }

    // Step 5: Build legacy intent from scores (backward compat)
    const legacyIntent = deriveLegacyIntent(state, event);
    const legacyFrictions: DetectedFriction[] = detectedFrictions.map((f) => ({
        type: f.type,
        confidence: f.confidence,
        evidence: f.evidence,
        timestamp: f.timestamp,
        context: f.context,
    }));

    // Step 6: Build legacy recommended actions from intervention
    const legacyActions = interventionPayload
        ? [{
            action_type: interventionPayload.ui_type === 'voice_only' ? 'voice_proactive' as const : 'chat_proactive' as const,
            priority: interventionPayload.priority,
            message_template: interventionPayload.script,
            constraints: { max_frequency: '1/session' as const, requires_user_consent: false },
        }]
        : [];

    const contract: AnalystContract = {
        session_id: event.session_id,
        timestamp: new Date().toISOString(),
        intent_state: legacyIntent,
        friction_types: legacyFrictions,
        recommended_actions: legacyActions,
        forbidden_actions: inPayment ? ['chat_proactive', 'voice_proactive'] : [],
        rationale: buildRationale(state, detectedFrictions, interventionPayload, { probability: interventionProbability, reason: interventionReason }),
        expiry: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        // V2 fields
        scores: { ...state.scores },
        detected_frictions: detectedFrictions,
        intervention: interventionPayload,
    };

    return contract;
}

// ============================================================
// Legacy Intent Derivation
// ============================================================

function deriveLegacyIntent(state: SessionState, event: UserEvent): IntentState {
    const s = state.scores;
    if (event.event_type === 'exit_intent') return { primary_intent: 'abandonment_risk', confidence: 0.95 };
    if (s.interest >= 80 && s.friction < 20) return { primary_intent: 'purchase', confidence: s.interest / 100 };
    if (s.interest >= 60) return { primary_intent: 'high_interest', confidence: s.interest / 100 };
    if (s.friction >= 50) return { primary_intent: 'friction', confidence: s.friction / 100 };

    const comparisonProducts = Array.from(state.comparison_context.products.values()).filter((p) => p.view_count >= 2);
    if (comparisonProducts.length >= 2) return { primary_intent: 'comparison', confidence: 0.8 };

    if (state.session_history.total_products_viewed > 5) return { primary_intent: 'research', confidence: 0.7 };

    return { primary_intent: 'exploratory', confidence: 0.6 };
}

// ============================================================
// Rationale Builder
// ============================================================

function buildRationale(
    state: SessionState,
    frictions: DetectedFriction[],
    intervention?: InterventionPayload,
    probabilityInfo?: { probability: number; reason: string }
): string {
    const parts: string[] = [];

    // Basic scores
    parts.push(`Scores: I=${state.scores.interest.toFixed(0)} F=${state.scores.friction.toFixed(0)} C=${state.scores.clarity.toFixed(0)}`);

    // Advanced scoring breakdown
    if (state.advanced_scores) {
        const breakdown = getScoreBreakdown(state.advanced_scores);
        const reliability = getSessionReliability(state.session_start);
        parts.push(`Events: ${breakdown.activeEvents}/${breakdown.totalEvents} active (${(reliability * 100).toFixed(0)}% reliability)`);
    }

    // Friction detections with confidence
    if (frictions.length > 0) {
        parts.push(`Frictions: ${frictions.map((f) => `${f.type}(${(f.confidence * 100).toFixed(0)}%)`).join(', ')}`);
    }

    // Probabilistic intervention info
    if (probabilityInfo && probabilityInfo.probability > 0) {
        parts.push(`P(intervene): ${(probabilityInfo.probability * 100).toFixed(1)}%`);
    }

    // Intervention taken
    if (intervention) {
        parts.push(`Intervention: ${intervention.friction_type} → ${intervention.ui_type}`);
    }

    return parts.join(' | ');
}

// ============================================================
// Analytics
// ============================================================

interface AnalyticsData {
    totalSessions: number;
    activeSessions: number;
    avgSessionDuration: number;
    conversionRate: number;
    frictionBreakdown: Record<string, number>;
    interventionBreakdown: Record<string, number>;
    funnel: { browsed: number; addedToCart: number; checkedOut: number };
    predictiveScores?: { exitProbability: number; purchaseProbability: number };
    scores?: SessionScores;
}

const analyticsData: AnalyticsData = {
    totalSessions: 0, activeSessions: 0, avgSessionDuration: 0, conversionRate: 0,
    frictionBreakdown: {}, interventionBreakdown: {},
    funnel: { browsed: 0, addedToCart: 0, checkedOut: 0 },
};

const sessionConversions: Set<string> = new Set();
const sessionFunnelTracking: Map<string, { browsed: boolean; addedToCart: boolean; checkedOut: boolean }> = new Map();

function updateAnalytics(sessionId: string, contract: AnalystContract) {
    if (!sessionFunnelTracking.has(sessionId)) {
        analyticsData.totalSessions++;
        sessionFunnelTracking.set(sessionId, { browsed: false, addedToCart: false, checkedOut: false });
    }

    analyticsData.activeSessions = sessionStates.size;

    const durations: number[] = [];
    sessionStartTimes.forEach((startTime) => durations.push(Date.now() - startTime));
    analyticsData.avgSessionDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Friction breakdown
    if (contract.detected_frictions) {
        contract.detected_frictions.forEach((f) => {
            analyticsData.frictionBreakdown[f.type] = (analyticsData.frictionBreakdown[f.type] || 0) + 1;
        });
    }

    // Intervention breakdown
    if (contract.intervention) {
        analyticsData.interventionBreakdown[contract.intervention.friction_type] =
            (analyticsData.interventionBreakdown[contract.intervention.friction_type] || 0) + 1;
    }

    // Funnel tracking
    const funnelState = sessionFunnelTracking.get(sessionId)!;
    const history = eventHistory.get(sessionId) || [];

    if (!funnelState.browsed && history.some((e) => e.event_type === 'view_item' || e.event_type === 'product_viewed' || e.event_type === 'browsing_pattern')) {
        funnelState.browsed = true;
        analyticsData.funnel.browsed++;
    }
    if (!funnelState.addedToCart && history.some((e) => e.event_type === 'add_to_cart' || e.event_type === 'cart_item_added' || (e.event_type === 'cart_action' && e.payload?.action === 'item_added'))) {
        funnelState.addedToCart = true;
        analyticsData.funnel.addedToCart++;
    }
    if (!funnelState.checkedOut && history.some((e) => e.event_type === 'checkout_started' || e.event_type === 'order_placed' || e.event_type === 'checkout_step')) {
        funnelState.checkedOut = true;
        analyticsData.funnel.checkedOut++;
        sessionConversions.add(sessionId);
    }

    analyticsData.conversionRate = analyticsData.totalSessions > 0
        ? (sessionConversions.size / analyticsData.totalSessions) * 100 : 0;

    // Scores from active session
    const state = sessionStates.get(sessionId);
    if (state) {
        analyticsData.scores = { ...state.scores };
        analyticsData.predictiveScores = {
            exitProbability: Math.min(state.scores.friction, 100),
            purchaseProbability: Math.min(state.scores.interest, 100),
        };
    }
}

// Broadcast analytics every 3 seconds
setInterval(() => {
    dashboardClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'analytics_update', analytics: analyticsData }));
        }
    });
}, 3000);

// Score decay timer — every 5 seconds
setInterval(() => {
    sessionStates.forEach((state) => {
        const idleSec = (Date.now() - state.last_activity) / 1000;
        state.idle_seconds = idleSec;
        if (idleSec > 20) {
            state.scores = decay(state.scores, idleSec);
        }
    });
}, 5000);

// ============================================================
// Analyst Thinking — Context-Aware Reasoning Engine
// ============================================================

function generateAnalystThinking(event: UserEvent, state: SessionState, scenarioKey: string | null, contract: AnalystContract): string | null {
    const s = state.scores;
    const p = event.payload;
    const history = eventHistory.get(state.session_id) || [];
    const cp = state.product_context.current_product;
    const lp = state.product_context.last_product;
    const cart = state.cart_context;
    const search = state.search_context;
    const comparison = state.comparison_context;
    const sh = state.session_history;
    const pName = p?.product_name || p?.name || cp?.product_name || lp?.product_name || '';

    // Cooldown check: don't repeat the same reasoning within 30 seconds
    const cooldownKey = `${state.session_id}:${scenarioKey || event.event_type}`;
    const now = Date.now();
    const lastNarrated = narrationCooldowns.get(cooldownKey) || 0;
    const COOLDOWN_MS = 30000; // 30 seconds
    // Apply cooldown to noisy/repetitive signals (including scenarios that can trigger often)
    const cooldownEvents = ['exit_detected', 'exit_intent', 'element_hover', 'mid_session_idle', 'extended_viewing', 'product_modal_closed', 'cart_item_removed', 'comparison_loop', 'navigation_confusion'];
    if (cooldownEvents.includes(scenarioKey || event.event_type) && (now - lastNarrated) < COOLDOWN_MS) {
        return null; // Skip — too soon
    }
    const pPrice = p?.product_price || p?.price || cp?.price || lp?.price || 0;

    // Helper: get session duration in seconds
    const sessionSec = Math.round((Date.now() - state.session_start) / 1000);

    // Helper: find cheaper similar products the user viewed
    const getCheaperAlternatives = () => {
        if (!pPrice) return [];
        return Array.from(comparison.products.values())
            .filter(pp => pp.price > 0 && pp.price < Number(pPrice) && pp.product_id !== (p?.product_id || ''))
            .sort((a, b) => b.view_count - a.view_count);
    };

    // Helper: get most-viewed products
    const getTopViewed = () => {
        return Array.from(comparison.products.values())
            .sort((a, b) => b.view_count - a.view_count)
            .slice(0, 3);
    };

    // Helper: infer what user might be looking for from search + filters
    const inferUserIntent = () => {
        const queries = search.queries.map(q => q.query).filter(Boolean);
        const filters = sh.filters_applied.filter(Boolean);
        if (queries.length > 0) return queries[queries.length - 1];
        if (filters.length > 0) return filters[filters.length - 1];
        return null;
    };

    // Helper: assess purchase likelihood
    const purchaseLikelihood = () => {
        if (s.interest >= 80 && s.friction < 30) return 'very likely';
        if (s.interest >= 60 && s.friction < 50) return 'likely';
        if (s.interest >= 40) return 'possible but uncertain';
        if (s.interest >= 20) return 'unlikely unless something changes';
        return 'very unlikely';
    };

    // ==========================================
    // Scenario-based reasoning
    // ==========================================

    if (scenarioKey === 'extended_viewing') {
        const dwellSec = Math.round((p?.time_spent_ms || 0) / 1000);
        if (dwellSec > 30) {
            return `I think the user is seriously considering "${pName}". ${dwellSec} seconds is a long time to stay on one product — this isn't casual browsing, this is evaluation. ${cart.item_count > 0 ? `They already have ${cart.item_count} item${cart.item_count > 1 ? 's' : ''} in cart worth $${cart.total_value}, so they're in a buying mindset.` : 'No items in cart yet, but the interest is clearly there.'}`;
        }
        return `I think the user is warming up to "${pName}". The time they spent tells me this one has caught their attention more than the others.`;
    }

    if (scenarioKey === 'variant_selection') {
        return `I think the user is getting closer to a decision on "${pName}". Choosing a specific ${p?.variant_type || 'variant'} means they're already imagining owning it.`;
    }

    if (scenarioKey === 'variant_indecision') {
        return `I think the user is stuck. They keep switching between options on "${pName}" — too many choices might be paralyzing them. They probably like the product but can't commit to one specific configuration.`;
    }

    if (scenarioKey === 'review_reading') {
        return `I think the user wants to buy "${pName}" but needs reassurance first. Reading reviews is a classic sign — they're looking for someone else to validate their choice.`;
    }

    if (scenarioKey === 'wishlist_save') {
        return `I think the user likes "${pName}" but isn't ready to commit right now. Could be the price ($${pPrice}), could be they're comparing with something else, or they might just want to think about it.`;
    }

    if (scenarioKey === 'product_revisit') {
        const entry = comparison.products.get(p?.product_id || '');
        const viewCount = entry?.view_count || 2;
        return `I think "${pName}" is the frontrunner. This is visit #${viewCount} — the user keeps coming back to it, which tells me they want it. Something is just stopping them from pulling the trigger.${Number(pPrice) > 200 ? ` At $${pPrice}, price might be the hesitation.` : ''}`;
    }

    if (scenarioKey === 'comparison_loop') {
        const topTwo = getTopViewed().slice(0, 2);
        if (topTwo.length >= 2) {
            const priceDiff = Math.abs(topTwo[0].price - topTwo[1].price);
            return `I think the user is torn between "${topTwo[0].product_name}" ($${topTwo[0].price}) and "${topTwo[1].product_name}" ($${topTwo[1].price}). ${priceDiff > 50 ? `The $${priceDiff} price difference might be the deciding factor.` : `They're similarly priced, so it's probably about features or aesthetics.`} They need a nudge to decide.`;
        }
        return `I think the user is stuck comparing products and can't choose. Classic analysis paralysis.`;
    }

    if (scenarioKey === 'rapid_browsing') {
        return `I think the user is overwhelmed. ${sh.total_products_viewed} products browsed and nothing has stuck — they're either looking for something very specific that we don't obviously have, or they have too many options and can't focus.${inferUserIntent() ? ` Based on their activity, I think they might be looking for "${inferUserIntent()}".` : ''}`;
    }

    if (scenarioKey === 'navigation_loops') {
        return `I think the user is frustrated with the navigation. They keep going back and forth, which means they either can't find what they're looking for, or the site layout is confusing them.`;
    }

    if (scenarioKey === 'filter_indecision') {
        const recentFilters = sh.filters_applied.slice(-4);
        return `I think the user doesn't know exactly what they want yet. They've tried ${recentFilters.length} different filters (${recentFilters.join(', ')}) — still exploring their options rather than zeroing in.`;
    }

    if (scenarioKey === 'trust_seeking') {
        const pageName = (p?.page_name || '').toLowerCase();
        return `I think the user is checking whether this store is trustworthy. ${state.is_new_user ? 'As a first-time visitor, this is natural — ' : ''}Visiting "${pageName}" tells me they need confidence before spending money here.`;
    }

    if (scenarioKey === 'cart_hesitation') {
        return `I think the user is second-guessing their choices. Opening the cart and closing it quickly (under 3 seconds) usually means they looked at the total and had a moment of doubt.${cart.total_value > 200 ? ` At $${cart.total_value}, the total might feel too high.` : ''}`;
    }

    if (scenarioKey === 'spec_confusion') {
        return `I think the product information isn't clear enough. The user keeps re-reading the specs — if they understood everything the first time, they wouldn't need to come back to it. The description might need to be simpler or more visual.`;
    }

    if (scenarioKey === 'sizing_uncertainty') {
        return `I think the user is worried about getting the wrong size. Checking the size chart multiple times signals anxiety — they might abandon if they're not confident it'll fit.`;
    }

    if (scenarioKey === 'external_research') {
        if (cp) {
            const cheaper = getCheaperAlternatives();
            if (cheaper.length > 0) {
                return `I think the user just switched tabs to check if "${cp.product_name}" ($${cp.price}) is cheaper elsewhere. They've already looked at lower-priced alternatives like "${cheaper[0].product_name}" ($${cheaper[0].price}), so price is definitely a factor.`;
            }
            return `I think the user is price-comparing "${cp.product_name}" ($${cp.price}) on another site. The tab switch right while viewing the product is a strong signal — they like it but want to make sure they're getting the best deal.`;
        }
        return `I think the user switched tabs to check prices or reviews elsewhere. External research is common for high-consideration items.`;
    }

    // ==========================================
    // Friction Scenarios
    // ==========================================

    if (scenarioKey === 'info_loop') {
        return `I think the user is caught in a loop. Going back and forth between specs and reviews means they can't verify if the product meets their needs. The info is there, but it's not convincing them.`;
    }

    if (scenarioKey === 'gift_uncertainty') {
        return `I think they're buying for someone else. Checking return policies and size charts this much usually means "I hope they like it/it fits". Reassurance about easy returns is key here.`;
    }

    if (scenarioKey === 'bad_landing') {
        return `I think we missed the mark. Bouncing this quickly implies the landing page didn't match their expectations at all.`;
    }

    if (scenarioKey === 'return_policy_check') {
        return `I think the user is risk-averse. Checking the return policy closer typically happens when they're close to deciding but afraid of commitment.`;
    }

    if (scenarioKey === 'help_seeking') {
        return `I think the user is stuck and looking for a lifeline. Visiting FAQ or Help pages is a cry for assistance — they're trying to solve a problem on their own.`;
    }

    if (scenarioKey === 'mid_session_idle') {
        return `I think the user got distracted. They were active, now they've gone dark. Life probably intervened, but I need to be ready when they come back.`;
    }

    if (scenarioKey === 'external_distraction') {
        return `I think they're multi-tasking. Switching tabs right after adding to cart is dangerous — they might be price checking or just got distracted. Keeping the cart visible in their mind is crucial.`;
    }

    if (scenarioKey === 'address_field_loop') {
        return `I think the user is struggling with the checkout form. Editing the address repeatedly suggests a validation error or confusion about formatting.`;
    }

    if (scenarioKey === 'payment_anxiety') {
        return `I think the user is hesitant about the payment. Hovering over options without selecting one suggests trust issues or wallet anxiety.`;
    }

    if (scenarioKey === 'price_sort_cycling') {
        return `I think the user is price-anchoring. Cycling between "Price: Low to High" and back tells me they're trying to find the sweet spot between what they can afford and what they actually want.`;
    }

    if (scenarioKey === 'price_filtering') {
        return `I think the user has a strict budget. Adjusting the price filter implies they have a hard limit. I should respect that limit in my recommendations.`;
    }

    if (scenarioKey === 'coupon_seeking') {
        return `I think the user is hunting for a deal. Interacting with the coupon field suggests they might be ready to buy but just need that extra "win" of a discount to feel good about it.`;
    }

    if (scenarioKey === 'downgrade_intent') {
        return `I think the user loves the product but hates the price. Downgrading the variant is a compromise — they're trying to make it work financially.`;
    }

    if (scenarioKey === 'filter_loop') {
        return `I think the user is chasing a perfect combination that might not exist. Resetting and reapplying filters usually means they're over-constrained and getting zero results.`;
    }

    if (scenarioKey === 'search_refinement') {
        return `I think the user knows what they want but is struggling to describe it. Refining the search query shows persistence — they believe we have it, they just need to find the right words.`;
    }


    if (scenarioKey === 'checkout_hesitation') {
        return `I think the user wants to buy but something in the checkout process is holding them back. ${p?.field_name ? `They stalled on the "${p.field_name}" field — maybe they don't have that information handy, or they're rethinking the purchase.` : 'The hesitation could be about price, shipping costs, or just cold feet.'}`;
    }









    if (scenarioKey === 'exit_detected') {
        if (cart.item_count > 0) {
            return `I think the user is about to leave with ${cart.item_count} item${cart.item_count > 1 ? 's' : ''} still in cart ($${cart.total_value}). This is a potential lost sale — they were interested enough to add to cart but something made them want to leave.`;
        }
        if (lp) {
            return `I think the user is about to leave. They last looked at "${lp.product_name}" ($${lp.price}) — if there's any product that resonated, it's that one.`;
        }
        return `I think the user is about to abandon the session. ${sh.total_products_viewed > 3 ? `They browsed ${sh.total_products_viewed} products but nothing convinced them enough to add to cart.` : 'Not much engagement this session — they might not have found what they were looking for.'}`;
    }

    // ==========================================
    // Non-scenario context reasoning (for events without a scenarioKey)
    // ==========================================

    // Cart removal reasoning
    if (event.event_type === 'cart_item_removed' || event.event_type === 'remove_from_cart') {
        const removedName = p?.product_name || 'the item';
        const removedPrice = p?.product_price || p?.price || 0;
        // Check if they recently added a cheaper similar item
        const recentAdds = history.slice(-8).filter(e =>
            (e.event_type === 'cart_item_added' || e.event_type === 'add_to_cart') &&
            e.payload?.product_id !== p?.product_id
        );
        if (recentAdds.length > 0) {
            const lastAdd = recentAdds[recentAdds.length - 1];
            const addedPrice = lastAdd.payload?.product_price || lastAdd.payload?.price || 0;
            if (Number(addedPrice) < Number(removedPrice)) {
                return `I think the user removed "${removedName}" because they just found a cheaper alternative ("${lastAdd.payload?.product_name}"). Price was the deciding factor here.`;
            }
            return `I think the user is refining their cart — swapping "${removedName}" for "${lastAdd.payload?.product_name}". They're getting closer to their final selection.`;
        }
        if (cart.total_value > 200 && Number(removedPrice) > 0) {
            return `I think the user removed "${removedName}" ($${removedPrice}) to bring the cart total down. The overall price was likely too high for their budget.`;
        }
        return `I think the user changed their mind about "${removedName}". ${sh.total_cart_removes > 1 ? 'This is the second removal — they\'re being very selective.' : 'Could be reconsidering priorities or comparing with something they haven\'t added yet.'}`;
    }

    // Similar/suggested product click reasoning


    // Search reasoning
    if (event.event_type === 'search_query' || event.event_type === 'search') {
        const query = p?.query || '';
        const resultsCount = p?.results_count ?? 0;
        if (resultsCount === 0) {
            return `I think the user is looking for something specific ("${query}") that we might not carry. ${search.queries.length > 1 ? 'This is their ' + search.queries.length + 'th search — frustration is building.' : 'If the next search also fails, we might lose them.'}`;
        }
        return `I think the user wants "${query}". This gives me a clear signal about their intent — everything they do from here should be evaluated against this search.`;
    }

    // Price hover reasoning


    // Tab return reasoning
    if (event.event_type === 'visibility_change' && p?.state !== 'hidden') {
        if (cp) {
            return `The user came back. They were looking at "${cp.product_name}" before leaving — the fact that they returned tells me interest is still alive.`;
        }
        if (cart.item_count > 0) {
            return `The user came back with ${cart.item_count} item${cart.item_count > 1 ? 's' : ''} still in cart. Good sign — they haven't given up on the purchase.`;
        }
    }

    // Order placed celebration
    if (event.event_type === 'order_placed') {
        const sessionMin = Math.round(sessionSec / 60);
        return `Purchase complete! The user converted after ${sessionMin} minutes. ${sh.total_products_viewed > 5 ? `They browsed ${sh.total_products_viewed} products before deciding` : 'Fairly decisive shopper'}. ${contract.intervention ? 'The intervention played a role in saving this conversion.' : 'They made it on their own.'}`;
    }

    // Checkout progress reasoning
    if (event.event_type === 'checkout_started' || (event.event_type === 'cart_action' && p?.action === 'checkout_started')) {
        return `I think this purchase is ${purchaseLikelihood()}. The user has committed to checkout — this is the strongest intent signal. ${s.friction > 40 ? 'But friction is elevated, so they might still bail at payment.' : 'Low friction so far — looking good for conversion.'}`;
    }

    // Add to cart reasoning
    if (event.event_type === 'cart_item_added' || event.event_type === 'add_to_cart') {
        if (cart.item_count > 1) {
            return `I think the user is building a real order now. ${cart.item_count} items worth $${cart.total_value} — this is beyond window shopping.`;
        }
        return `I think "${pName}" convinced them. First add-to-cart of the session — purchase intent just jumped significantly.`;
    }

    return null;
}

// ============================================================
// Narrative Generation (preserved from v1 with V2 additions)
// ============================================================

function generateNarrative(event: UserEvent, contract: AnalystContract, state: SessionState, scenarioKey: string | null): { tracking: string[], analyst: string[] } {
    const tracking: string[] = [];
    const analyst: string[] = [];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ts = `[${time}] `;

    // ========================================
    // TRACKING LOGS (Live Feed) — Major + Secondary Signals
    // ========================================

    // === 2.1 MAJOR SIGNALS ===

    // 2.1.1 Session Initialization
    if (event.event_type === 'page_loaded') {
        tracking.push(`${ts}Page loaded — ${event.payload?.page_name || 'Home'}`);
    } else if (event.event_type === 'new_user_detected') {
        tracking.push(`${ts}New user detected — Creating behavioral profile`);
    } else if (event.event_type === 'existing_user_detected') {
        tracking.push(`${ts}Existing user detected — Visit #${event.payload?.visit_count || 2}`);
    } else if (event.event_type === 'session_started') {
        tracking.push(`${ts}Session started — ${event.payload?.entry_page || 'Home'}`);
    }

    // 2.1.2 Navigation
    else if (event.event_type === 'page_navigation') {
        tracking.push(`${ts}Accessed — ${event.payload?.page_name || 'Unknown'}`);
    }

    // 2.1.3 Product Interactions
    else if (event.event_type === 'product_viewed') {
        tracking.push(`${ts}User viewing "${event.payload?.product_name}" priced at $${event.payload?.product_price || event.payload?.price}`);
    } else if (event.event_type === 'product_description_expanded') {
        tracking.push(`${ts}Description expanded for "${event.payload?.product_name}"`);
    } else if (event.event_type === 'product_reviews_viewed') {
        tracking.push(`${ts}User viewing customers' review of "${event.payload?.product_name}"`);
    } else if (event.event_type === 'product_return_policy_viewed') {
        tracking.push(`${ts}User viewing return policy of "${event.payload?.product_name || event.payload?.source || 'store'}"`);
    } else if (event.event_type === 'product_variant_changed') {
        tracking.push(`${ts}Product ${event.payload?.variant_type} changed from "${event.payload?.from_value}" to "${event.payload?.to_value}"`);
    } else if (event.event_type === 'product_modal_closed') {
        const timeSpent = Math.round((event.payload?.time_spent_ms || 0) / 1000);
        tracking.push(`${ts}"${event.payload?.product_name || 'Product'}" window closed after ${timeSpent}s viewing time`);
    } else if (event.event_type === 'product_detail') {
        if (event.payload?.action === 'opened') {
            // Skip - already logged by product_viewed event
        } else if (event.payload?.action === 'closed') {
            // Skip - already logged by product_modal_closed event
        } else if (event.payload?.action === 'description_expanded') {
            // Skip - already logged by product_description_expanded event
        } else if (event.payload?.action === 'add_to_cart') {
            // Skip - already logged by cart_item_added event
        } else if (event.payload?.action === 'add_to_wishlist') {
            // Skip - already logged by wishlist_item_added event
        } else if (event.payload?.action === 'quantity_increased') {
            tracking.push(`${ts}Quantity increased to ${event.payload?.quantity} for "${event.payload?.product_name || 'Product'}"`);
        } else if (event.payload?.action === 'quantity_decreased') {
            tracking.push(`${ts}Quantity decreased to ${event.payload?.quantity} for "${event.payload?.product_name || 'Product'}"`);
        }
    }

    // 2.1.4 Wishlist Actions
    else if (event.event_type === 'wishlist_item_added' || event.event_type === 'add_to_wishlist') {
        const price = event.payload?.price || event.payload?.product_price || '?';
        tracking.push(`${ts}"${event.payload?.product_name || 'Item'}" priced at $${price} added to wishlist`);
    } else if (event.event_type === 'wishlist_opened') {
        tracking.push(`${ts}Wishlist opened with ${event.payload?.item_count || 0} saved items`);
    } else if (event.event_type === 'wishlist_closed') {
        const vt = Math.round((event.payload?.viewing_time_ms || 0) / 1000);
        tracking.push(`${ts}Wishlist closed after ${vt}s viewing time`);
    }

    // 2.1.5 Cart Actions
    else if (event.event_type === 'cart_item_added' || event.event_type === 'add_to_cart') {
        const qty = event.payload?.quantity || 1;
        const price = event.payload?.product_price || event.payload?.price || '?';
        tracking.push(`${ts}${qty} "${event.payload?.product_name || event.payload?.product_id}" priced at $${price} added to cart`);
    } else if (event.event_type === 'cart_item_removed' || event.event_type === 'remove_from_cart') {
        const price = event.payload?.product_price || event.payload?.price || '?';
        tracking.push(`${ts}"${event.payload?.product_name || 'Item'}" priced at $${price} removed from cart`);
    } else if (event.event_type === 'cart_quantity_changed') {
        tracking.push(`${ts}"${event.payload?.product_name || 'Item'}" quantity changed in cart from ${event.payload?.previous_quantity || event.payload?.from_quantity} to ${event.payload?.new_quantity || event.payload?.to_quantity}`);
    } else if (event.event_type === 'cart_opened') {
        tracking.push(`${ts}Cart opened with ${event.payload?.item_count} items totaling $${event.payload?.total_value}`);
    } else if (event.event_type === 'cart_closed') {
        const vt = Math.round((event.payload?.viewing_time_ms || 0) / 1000);
        const nextPage = event.payload?.next_page ? `. Accessed ${event.payload.next_page}` : '';
        tracking.push(`${ts}Cart closed after ${vt}s viewing time${nextPage}`);
    } else if (event.event_type === 'cart_action') {
        if (event.payload?.action === 'item_added') {
            // Skip - already logged by cart_item_added event
        } else if (event.payload?.action === 'item_removed') {
            // Skip - already logged by cart_item_removed event
        } else if (event.payload?.action === 'checkout_started') {
            // Skip - already logged by checkout_started event
        }
    }

    // 2.1.6 Checkout Flow
    else if (event.event_type === 'checkout_started') {
        tracking.push(`${ts}Proceeds to checkout with ${event.payload?.items?.length || event.payload?.item_count || 0} items worth $${event.payload?.total_value}`);
    } else if (event.event_type === 'form_field_change') {
        tracking.push(`${ts}Shipping "${event.payload?.field_name}" field filled with "${event.payload?.value}"`);
    } else if (event.event_type === 'shipping_method_viewed') {
        const optCount = event.payload?.options_available ? `, ${event.payload.options_available} options available` : '';
        tracking.push(`${ts}Shipping method section viewed${optCount}`);
    } else if (event.event_type === 'shipping_option_selected') {
        tracking.push(`${ts}Shipping method selected "${event.payload?.option_name}", worth $${event.payload?.cost}`);
    } else if (event.event_type === 'delivery_slot_selected') {
        tracking.push(`${ts}Preferred delivery window selected "${event.payload?.slot_name}"`);
    } else if (event.event_type === 'payment_method_viewed') {
        const optCount = event.payload?.options_available ? `, ${event.payload.options_available} options available` : '';
        tracking.push(`${ts}Payment method section viewed${optCount}`);
    } else if (event.event_type === 'payment_method_selected') {
        tracking.push(`${ts}Payment method selected "${event.payload?.method}"`);
    } else if (event.event_type === 'order_placed') {
        tracking.push(`${ts}Order placed for $${event.payload?.total_value}`);
    }

    // 2.1.7 Search & Filter
    else if (event.event_type === 'search_query' || event.event_type === 'search') {
        tracking.push(`${ts}User searched for "${event.payload?.query}" — ${event.payload?.results_count ?? '?'} results`);
    } else if (event.event_type === 'search_zero_results') {
        tracking.push(`${ts}Search for "${event.payload?.query}" returned 0 results`);
    } else if (event.event_type === 'filter_applied') {
        tracking.push(`${ts}User filtered the products based on "${event.payload?.filter_name || event.payload?.filter_type}"${event.payload?.filter_value ? ` = ${event.payload.filter_value}` : ''}`);
    }

    // === 2.2 SECONDARY SIGNALS ===
    // Only FACTUAL user actions go to tracking. Detections/assumptions go ONLY to analyst logs (Evaluation tab).

    // These are analyst detections/assumptions — NOT user actions. Do NOT put in tracking.
    // exit_intent, click_rage, checkout_idle, browsing_pattern → handled only in analyst narrative below.

    else if (event.event_type === 'exit_intent') {
        // Analyst detection only — no tracking entry
    } else if (event.event_type === 'click_rage') {
        // Analyst detection only — no tracking entry
    } else if (event.event_type === 'checkout_idle') {
        // Analyst detection only — no tracking entry
    } else if (event.event_type === 'browsing_pattern') {
        // Analyst detection only — no tracking entry
    }

    // These are factual user actions — go to tracking with neutral language
    else if (event.event_type === 'price_hover') {
        tracking.push(`${ts}Hovered on price of "${event.payload?.product_name}" ($${event.payload?.price})`);

    } else if (event.event_type === 'visibility_change') {
        // Skip - too noisy for tracking log, used internally for comparison_loop detection
    } else if (event.event_type === 'element_hover') {
        const dur = Math.round((event.payload?.hover_duration_ms || 0) / 1000);
        if (dur >= 5) {
            tracking.push(`${ts}Hovered on ${event.payload?.element_type} for ${dur}s`);
        }
    } else if (event.event_type === 'view_item') {
        tracking.push(`${ts}Viewing "${event.payload?.name}" priced at $${event.payload?.price}`);


    }

    // Text selection
    else if (event.event_type === 'text_selection') {
        tracking.push(`${ts}Selected text: "${event.payload?.text}" (${event.payload?.context || 'page'})`);
    }

    // Sort behavior
    else if (event.event_type === 'sort_changed') {
        const sortType = event.payload?.sort_type || 'unknown';
        const sortName = event.payload?.sort_name; // Use frontend provided name if available
        
        let readableSort = sortName || sortType;
        if (!sortName) {
            // Fallback mapping if frontend name missing
            const map: Record<string, string> = {
                'price_low': 'Price: Low to High',
                'price_high': 'Price: High to Low',
                'newest': 'Newest Arrivals',
                'featured': 'Featured'
            };
            readableSort = map[sortType] || sortType;
        }
        
        tracking.push(`${ts}Sort changed to: ${readableSort}`);
    }

    // Search behavior
    else if (event.event_type === 'search_action') {
        if (event.payload?.action === 'focus') {
            tracking.push(`${ts}Search bar focused`);
        } else if (event.payload?.action === 'typing') {
            tracking.push(`${ts}Typing in search: "${event.payload?.query}"`);
        }
    }

    // Filter usage patterns
    else if (event.event_type === 'filter_usage') {
        if (event.payload?.pattern === 'rapid_change') {
            tracking.push(`${ts}Rapidly switching filters (${event.payload?.count} changes)`);
        } else {
            tracking.push(`${ts}Filter applied: "${event.payload?.filter}"`);
        }
    }



    // Generic click events
    else if (event.event_type === 'click') {
        if (event.payload?.target === 'specs_toggle') {
            tracking.push(`${ts}Toggled specs panel for "${event.payload?.product_id}" — ${event.payload?.state}`);
        } else if (event.payload?.target === 'filter') {
            tracking.push(`${ts}Filter clicked: "${event.payload?.filter}"`);
        } else {
            tracking.push(`${ts}Clicked on ${event.payload?.target || 'element'}`);
        }
    }

    // Scroll depth milestones
    else if (event.event_type === 'scroll_depth') {
        tracking.push(`${ts}Scrolled to ${event.payload?.depth}% of page`);
    }

    // Intervention response
    else if (event.event_type === 'intervention_dismissed') {
        tracking.push(`${ts}Dismissed intervention popup`);
    }
    else if (event.event_type === 'intervention_accepted') {
        const action = event.payload?.action_taken || 'primary action';
        tracking.push(`${ts}Accepted intervention — clicked "${action}"`);
    }
    else if (event.event_type === 'intervention_ignored') {
        tracking.push(`${ts}Ignored intervention popup (no interaction for 30s)`);
    }

    // Checkout step
    else if (event.event_type === 'checkout_step') {
        tracking.push(`${ts}Checkout step: ${event.payload?.step || event.payload?.action || 'progressed'}`);
    }

    // Form field (generic)
    else if (event.event_type === 'form_field') {
        tracking.push(`${ts}Form field interaction: "${event.payload?.field_name || event.payload?.field}"`);
    }

    else {
        // Only suppress true noise events
        const hidden = ['device_context', 'attention', 'cursor_stream', 'heartbeat', 'idle', 'scroll', 'session_journey', 'network_speed', 'heatmap_data', 'predictive_score', 'hover'];
        if (!hidden.includes(event.event_type)) {
            tracking.push(`${ts}${event.event_type.replace(/_/g, ' ')}`);
        }
    }

    // ========================================
    // ANALYST LOGS (Evaluation Tab) — Story/Script narration
    // Written as an observer's journal: what the user did, what the analyst
    // interpreted, what action was taken and why. No timestamps, no prefixes.
    // When session ends, this reads as a complete user journey script.
    // ========================================

    const s = contract.scores || { interest: 0, friction: 0, clarity: 100 };
    const pName = event.payload?.product_name || event.payload?.name || '';
    const pPrice = event.payload?.product_price || event.payload?.price || '';

    // --- Part 1: Narrate what the user just did (the story) ---

    // Session events
    if (event.event_type === 'page_loaded') {
        const pageName = event.payload?.page_name || 'home';
        const isReturning = state.session_history.total_products_viewed > 0 || state.session_history.pages_visited.length > 1;
        if (isReturning) {
            const cart = state.cart_context;
            if (cart.item_count > 0) {
                analyst.push(`The user returned to the ${pageName} page with ${cart.item_count} item${cart.item_count > 1 ? 's' : ''} still in cart ($${cart.total_value}). They might be looking for more products to add.`);
            } else if (state.session_history.total_cart_adds > 0) {
                analyst.push(`The user returned to the ${pageName} page after emptying their cart. They might be rethinking their choices or looking for alternatives.`);
            } else {
                analyst.push(`The user returned to the ${pageName} page. Maybe looking for something else — I'll follow their activity to figure out what they're searching for.`);
            }
        } else {
            analyst.push(`The user landed on the ${pageName} page. A new session begins.`);
        }
    } else if (event.event_type === 'new_user_detected') {
        analyst.push(`This is a first-time visitor. No previous behavioral data exists — starting with a blank profile.`);
    } else if (event.event_type === 'existing_user_detected') {
        analyst.push(`A returning visitor (visit #${event.payload?.visit_count || 2}). Previous browsing patterns may inform expectations.`);
    } else if (event.event_type === 'session_started') {
        analyst.push(`Session started from the ${event.payload?.entry_page || 'home'} page.`);
    }

    // Navigation
    else if (event.event_type === 'page_navigation') {
        analyst.push(`The user navigated to "${event.payload?.page_name || 'another page'}".`);
    }

    // Product interactions
    else if (event.event_type === 'product_viewed') {
        const viewEntry = state.comparison_context.products.get(event.payload?.product_id || '');
        const viewCount = viewEntry?.view_count || 1;
        const revisitNote = viewCount > 1 ? ` — this is the ${viewCount}${viewCount === 2 ? 'nd' : viewCount === 3 ? 'rd' : 'th'} time they've looked at it` : '';
        analyst.push(`The user opened "${pName}" ($${pPrice})${revisitNote}. They're now examining this product.`);
    } else if (event.event_type === 'product_description_expanded') {
        analyst.push(`They expanded the full description of "${pName}" — wanting to know more before deciding.`);
    } else if (event.event_type === 'product_reviews_viewed') {
        analyst.push(`The user scrolled down to read customer reviews of "${pName}". They're looking for social proof.`);
    } else if (event.event_type === 'product_return_policy_viewed') {
        const source = event.payload?.source;
        const productName = event.payload?.product_name || pName;
        if (source === 'modal' && productName) {
            analyst.push(`The user checked the return policy for "${productName}". This suggests some uncertainty — they want to know they can return it if needed.`);
        } else {
            analyst.push(`The user checked the return policy. This suggests some uncertainty — they want to know they can change their mind.`);
        }
    } else if (event.event_type === 'product_variant_changed') {
        analyst.push(`The user changed the ${event.payload?.variant_type} from "${event.payload?.from_value}" to "${event.payload?.to_value}". They're customizing their choice.`);
    } else if (event.event_type === 'product_modal_closed') {
        const timeSpent = Math.round((event.payload?.time_spent_ms || 0) / 1000);
        const quickClose = timeSpent < 5 ? ' That was quick — not much interest.' : timeSpent > 30 ? ' They spent a good amount of time — this one has potential.' : '';
        analyst.push(`The user closed the product window after ${timeSpent} seconds of viewing.${quickClose}`);
    } else if (event.event_type === 'product_detail') {
        if (event.payload?.action === 'opened') {
            const detailEntry = state.comparison_context.products.get(event.payload?.product_id || '');
            const detailViewCount = detailEntry?.view_count || 1;
            const detailRevisit = detailViewCount > 1 ? ` (visit #${detailViewCount})` : '';
            analyst.push(`The user opened the product detail modal for "${event.payload?.product_name}"${detailRevisit}.`);
        } else if (event.payload?.action === 'closed') {
            // Skip - already logged by product_modal_closed event
        } else if (event.payload?.action === 'description_expanded') {
            analyst.push(`They expanded the product description — deeper interest.`);
        } else if (event.payload?.action === 'add_to_cart') {
            analyst.push(`They added "${event.payload?.product_name}" ($${event.payload?.product_price || '?'}) to cart directly from the modal. Strong intent.`);
        } else if (event.payload?.action === 'add_to_wishlist') {
            analyst.push(`They saved "${event.payload?.product_name}" ($${event.payload?.product_price || '?'}) to their wishlist — interested but not ready to commit.`);
        }
    }

    // Wishlist
    else if (event.event_type === 'wishlist_item_added' || event.event_type === 'add_to_wishlist') {
        analyst.push(`"${event.payload?.product_name || 'An item'}" was added to the wishlist. The user is bookmarking for later.`);
    } else if (event.event_type === 'wishlist_opened') {
        analyst.push(`The user opened their wishlist (${event.payload?.item_count || 0} saved items). They're reviewing what they've been considering.`);
    } else if (event.event_type === 'wishlist_closed') {
        const vt = Math.round((event.payload?.viewing_time_ms || 0) / 1000);
        analyst.push(`Wishlist closed after ${vt}s. They reviewed their saved items but didn't act.`);
    }

    // Cart
    else if (event.event_type === 'cart_item_added' || event.event_type === 'add_to_cart') {
        analyst.push(`"${event.payload?.product_name || event.payload?.product_id}" was added to cart. This is a clear purchase intent signal.`);
    } else if (event.event_type === 'cart_item_removed' || event.event_type === 'remove_from_cart') {
        const remainingItems = state.cart_context.item_count;
        const remainingValue = state.cart_context.total_value;
        const remainingNote = remainingItems > 0 ? ` They still have ${remainingItems} item${remainingItems > 1 ? 's' : ''} worth $${remainingValue} in cart.` : ' The cart is now empty.';
        analyst.push(`"${event.payload?.product_name || 'An item'}" ($${event.payload?.product_price || event.payload?.price || '?'}) was removed from cart.${remainingNote}`);
    } else if (event.event_type === 'cart_quantity_changed') {
        const qtyDir = Number(event.payload?.new_quantity || 0) > Number(event.payload?.previous_quantity || event.payload?.from_quantity || 0) ? 'increased' : 'decreased';
        analyst.push(`Cart quantity for "${event.payload?.product_name || 'an item'}" ${qtyDir} from ${event.payload?.previous_quantity || event.payload?.from_quantity} to ${event.payload?.new_quantity || event.payload?.to_quantity}.`);
    } else if (event.event_type === 'cart_opened') {
        analyst.push(`The user opened their cart — ${event.payload?.item_count} items totaling $${event.payload?.total_value}. They're reviewing before checkout.`);
    } else if (event.event_type === 'cart_closed') {
        const vt = Math.round((event.payload?.viewing_time_ms || 0) / 1000);
        analyst.push(`Cart closed after ${vt}s without proceeding to checkout.`);
    } else if (event.event_type === 'cart_action') {
        if (event.payload?.action === 'item_added') {
            analyst.push(`"${event.payload?.product_name}" was added to cart.`);
        } else if (event.payload?.action === 'item_removed') {
            analyst.push(`"${event.payload?.product_name || 'An item'}" was removed from cart.`);
        } else if (event.payload?.action === 'checkout_started') {
            analyst.push(`The user initiated checkout with ${event.payload?.item_count} items worth $${event.payload?.total_value}. They're moving toward conversion.`);
        }
    }

    // Checkout
    else if (event.event_type === 'checkout_started') {
        analyst.push(`The user proceeded to checkout with ${event.payload?.items?.length || event.payload?.item_count || 0} items worth $${event.payload?.total_value}. This is a strong conversion signal.`);
    } else if (event.event_type === 'form_field_change') {
        analyst.push(`They filled in the "${event.payload?.field_name}" field. Progressing through the checkout form.`);
    } else if (event.event_type === 'shipping_method_viewed') {
        analyst.push(`The user is looking at shipping options. They're evaluating delivery costs and times.`);
    } else if (event.event_type === 'shipping_option_selected') {
        analyst.push(`Shipping method chosen: "${event.payload?.option_name}" at $${event.payload?.cost}. Moving forward.`);
    } else if (event.event_type === 'delivery_slot_selected') {
        analyst.push(`Delivery window selected: "${event.payload?.slot_name}". They're planning around when they need it.`);
    } else if (event.event_type === 'payment_method_viewed') {
        analyst.push(`The user is now looking at payment options. This is the final decision gate.`);
    } else if (event.event_type === 'payment_method_selected') {
        analyst.push(`Payment method selected: "${event.payload?.method}". One step from completing the order.`);
    } else if (event.event_type === 'order_placed') {
        analyst.push(`Order placed for $${event.payload?.total_value}. Conversion complete. The user made their purchase.`);
    }

    // Search & Filter
    else if (event.event_type === 'search_query' || event.event_type === 'search') {
        const count = event.payload?.results_count;
        if (count === 0) {
            analyst.push(`The user searched for "${event.payload?.query}" but got no results. This is frustrating — they're looking for something specific and can't find it.`);
        } else {
            analyst.push(`The user searched for "${event.payload?.query}" and found ${count ?? 'several'} results.`);
        }
    } else if (event.event_type === 'search_zero_results') {
        analyst.push(`Another failed search for "${event.payload?.query}". Zero results again. Frustration is building.`);
    } else if (event.event_type === 'filter_applied') {
        analyst.push(`The user applied a filter: "${event.payload?.filter_type || event.payload?.filter_name}" = ${event.payload?.filter_value}. They're trying to narrow down their options.`);
    }

    // Secondary signals
    else if (event.event_type === 'exit_intent') {
        // Exit intent reasoning is fully handled by Part 2 (generateAnalystThinking) when scenarioKey === 'exit_detected'.
        // No Part 1 narration needed — avoids redundancy.
    } else if (event.event_type === 'price_hover') {
        analyst.push(`The user is staring at the price of "${event.payload?.product_name}" ($${event.payload?.price}). They're evaluating whether it's worth it.`);
    } else if (event.event_type === 'price_hover_end') {
        const dur = Math.round((event.payload?.hover_duration_ms || 0) / 1000);
        analyst.push(`Price evaluation ended after ${dur}s. ${dur >= 5 ? 'That was a long pause — price sensitivity likely.' : 'Quick glance.'}`);
    } else if (event.event_type === 'visibility_change') {
        if (event.payload?.state === 'hidden') {
            analyst.push(`The user switched away to another tab. They might be comparing prices elsewhere or got distracted.`);
        } else {
            analyst.push(`The user returned to the tab. They're back — let's see what they do next.`);
        }
    } else if (event.event_type === 'click_rage') {
        analyst.push(`Rapid, frustrated clicking detected. The user is having trouble with the interface.`);
    } else if (event.event_type === 'checkout_idle') {
        const idleSec = Math.round((event.payload?.idle_duration_ms || 0) / 1000);
        analyst.push(`The user has been idle on the "${event.payload?.field_name}" checkout field for ${idleSec}s. They're hesitating — something is holding them back.`);
    } else if (event.event_type === 'element_hover') {
        const dur = Math.round((event.payload?.hover_duration_ms || 0) / 1000);
        // Only narrate significant hovers (>5s) and skip if same element type narrated recently
        if (dur >= 5) {
            const hoverCooldownKey = `${state.session_id}:hover_${event.payload?.element_type}`;
            const lastHoverNarrated = narrationCooldowns.get(hoverCooldownKey) || 0;
            if (Date.now() - lastHoverNarrated > 30000) {
                analyst.push(`The user spent ${dur}s hovering over ${event.payload?.element_type}. Extended attention here.`);
                narrationCooldowns.set(hoverCooldownKey, Date.now());
            }
        }
    } else if (event.event_type === 'browsing_pattern') {
        const patternNarrations: Record<string, string> = {
            'doom_scrolling': 'The user is doom scrolling — endlessly browsing without engaging with any product.',
            'scroll_without_click': 'Scrolling through products without clicking — nothing is catching their eye.',
            'searching_frustrated': 'Multiple search attempts with few clicks — the user is frustrated, can\'t find what they want.',
            'rapid_browsing': 'Rapidly opening and closing products — decision fatigue is building.',
            'gift_anxiety': 'Browsing pattern suggests gift-buying anxiety — unsure about choosing for someone else.',
            'checkout_idle': 'The user stalled during checkout — something is holding them back from completing the purchase.',
        };
        analyst.push(patternNarrations[event.payload?.pattern] || `A behavioral pattern was detected: ${event.payload?.pattern?.replace(/_/g, ' ')}.`);
    } else if (event.event_type === 'view_item') {
        analyst.push(`The user is looking at "${event.payload?.name}" ($${event.payload?.price}).`);

    }

    // Text selection
    else if (event.event_type === 'text_selection') {
        const ctx = event.payload?.context;
        if (ctx === 'price') {
            analyst.push(`The user selected the price text — likely copying it to compare elsewhere.`);
        } else if (ctx === 'product_name') {
            analyst.push(`The user highlighted the product name — might be searching for it externally.`);
        } else {
            analyst.push(`The user selected text on the page: "${event.payload?.text}".`);
        }
    }

    // Search behavior signals
    else if (event.event_type === 'search_action') {
        if (event.payload?.action === 'focus') {
            analyst.push(`The user clicked into the search bar. They have something specific in mind.`);
        } else if (event.payload?.action === 'typing') {
            analyst.push(`Typing in search: "${event.payload?.query}". Actively looking for something.`);
        }
    }

    // Filter usage patterns
    else if (event.event_type === 'filter_usage') {
        if (event.payload?.pattern === 'rapid_change') {
            analyst.push(`Rapid filter switching detected (${event.payload?.count} changes). The user is indecisive about what category they want.`);
        } else {
            analyst.push(`A filter was applied: "${event.payload?.filter}". Narrowing down choices.`);
        }
    }



    // Specific click events
    else if (event.event_type === 'click') {
        if (event.payload?.target === 'specs_toggle') {
            analyst.push(`The user toggled the specs panel — studying technical details more closely.`);
        } else if (event.payload?.target === 'filter') {
            analyst.push(`Filter clicked: "${event.payload?.filter}".`);
        }
    }

    // Scroll depth
    else if (event.event_type === 'scroll_depth') {
        const depth = event.payload?.depth;
        if (depth >= 80) {
            analyst.push(`The user scrolled to ${depth}% of the page — deep browsing, exploring everything available.`);
        }
    }

    // Intervention dismissed
    else if (event.event_type === 'intervention_dismissed') {
        analyst.push(`The user dismissed the intervention popup. They're not receptive right now — backing off.`);
    }

    // Intervention accepted
    else if (event.event_type === 'intervention_accepted') {
        const action = event.payload?.action_taken || 'the suggested action';
        analyst.push(`Excellent! The user accepted the intervention and clicked "${action}". This is a positive engagement signal — the intervention was helpful.`);
    }

    // Intervention ignored
    else if (event.event_type === 'intervention_ignored') {
        analyst.push(`The intervention popup was visible for 30 seconds without any interaction. User may be distracted or not interested in the suggestion right now.`);
    }

    else {
        // Only narrate non-noise events
        const hidden = ['device_context', 'attention', 'cursor_stream', 'heartbeat', 'idle', 'scroll', 'session_journey', 'network_speed', 'heatmap_data', 'predictive_score', 'hover', 'checkout_step', 'form_field'];
        if (!hidden.includes(event.event_type)) {
            analyst.push(`User action observed: ${event.event_type.replace(/_/g, ' ')}.`);
        }
    }

    // --- Part 2: Analyst thinking (context-aware first-person reasoning) ---

    const analystThinking = generateAnalystThinking(event, state, scenarioKey, contract);
    if (analystThinking) {
        analyst.push(analystThinking);
        // Record cooldown so the same reasoning won't repeat within 30s
        const thinkingCooldownKey = `${state.session_id}:${scenarioKey || event.event_type}`;
        narrationCooldowns.set(thinkingCooldownKey, Date.now());
    }

    // --- Part 3: Friction & intervention reasoning (first-person analyst voice) ---

    const helpNeed = s.friction - s.clarity;
    const canAct = s.interest >= INTEREST_THRESHOLD && helpNeed >= HELP_NEED_THRESHOLD;

    if (contract.detected_frictions && contract.detected_frictions.length > 0) {
        const cp = state.product_context.current_product;
        const lp = state.product_context.last_product;
        const cart = state.cart_context;

        // Skip friction types already covered by Part 2 analyst thinking to avoid redundancy
        const coveredByThinking = analystThinking ? ['exit_intent', 'comparison_loop', 'checkout_hesitation'] : [];

        contract.detected_frictions.forEach((f) => {
            if (coveredByThinking.includes(f.type)) return; // Already addressed in analyst reasoning

            // Cooldown check: Don't repeat same friction narration within 60 seconds
            const frictionCooldownKey = `${state.session_id}:friction:${f.type}`;
            const lastFrictionNarrated = narrationCooldowns.get(frictionCooldownKey) || 0;
            if (Date.now() - lastFrictionNarrated < 60000) return; // Skip if narrated within 60s

            switch (f.type) {
                case 'exit_intent':
                    if (cart.item_count > 0) {
                        analyst.push(`I'm sensing exit intent — and they have $${cart.total_value} worth of items in cart. This is a potential lost sale I need to act on.`);
                    } else if (lp) {
                        analyst.push(`I'm sensing exit intent. They last engaged with "${lp.product_name}" — if anything can bring them back, it's that.`);
                    } else {
                        analyst.push(`I'm sensing exit intent. They're about to leave without finding what they wanted.`);
                    }
                    break;
                case 'price_sensitivity':
                    analyst.push(`I can see price sensitivity here. The way they're studying the price tells me the product appeals to them, but the cost is a barrier.`);
                    break;
                case 'search_frustration':
                    // Use enhanced search intent analysis for better narrative
                    const searchIntentContext = friction.context;
                    let searchNarrative = `I'm picking up search frustration. ${state.search_context.queries.length} searches and they're still not finding what they need.`;

                    if (searchIntentContext?.inferred_category) {
                        searchNarrative += ` Based on their queries, they're looking for ${searchIntentContext.inferred_category}`;
                        if (searchIntentContext.inferred_brand) {
                            searchNarrative += ` (specifically ${searchIntentContext.inferred_brand} products)`;
                        }
                        searchNarrative += `.`;
                    }

                    if (searchIntentContext?.intent_type === 'specific_product') {
                        searchNarrative += ` They seem to know exactly what they want — I should help them find it or suggest alternatives.`;
                    } else if (searchIntentContext?.intent_type === 'comparison') {
                        searchNarrative += ` They're comparing options — I could offer to help narrow down their choices.`;
                    } else if (searchIntentContext?.intent_type === 'research') {
                        searchNarrative += ` They're in research mode — I should offer guidance rather than pushing products.`;
                    }

                    if (searchIntentContext?.price_sensitivity === 'budget') {
                        searchNarrative += ` Their searches suggest they're budget-conscious — should highlight deals and value.`;
                    } else if (searchIntentContext?.price_sensitivity === 'premium') {
                        searchNarrative += ` They seem to want premium options — should focus on quality and top-rated items.`;
                    }

                    analyst.push(searchNarrative);
                    break;
                case 'specs_confusion':
                    analyst.push(`I notice the user keeps going back to the specs — the product information isn't clear enough for them to make a decision confidently.`);
                    break;
                case 'indecision':
                    analyst.push(`I see classic indecision playing out. They're bouncing between products without committing to any — too many options, not enough conviction.`);
                    break;
                case 'comparison_loop':
                    analyst.push(`I see them stuck in a comparison loop. They keep going back and forth — they need a clear differentiator to break the deadlock.`);
                    break;
                case 'high_interest_stalling':
                    analyst.push(`I notice high engagement but zero action. Something invisible is holding them back — could be price, could be trust, could be they're waiting for a sign.`);
                    break;
                case 'checkout_hesitation':
                    analyst.push(`I see checkout hesitation. They got this far in the funnel but now they're frozen — the commitment of actually paying is creating anxiety.`);
                    break;
                case 'navigation_confusion':
                    analyst.push(`I think the user is lost. Their navigation pattern is erratic — they're clicking around without a clear path.`);
                    break;
                case 'gift_anxiety':
                    analyst.push(`I think they're buying a gift. The pattern of checking returns and sizing suggests they're worried about choosing wrong for someone else.`);
                    break;
                case 'form_fatigue':
                    analyst.push(`I can see form fatigue setting in. The checkout process feels too long — especially on their device.`);
                    break;
                case 'visual_doom_scrolling':
                    analyst.push(`I see them doom scrolling — endlessly browsing without engaging. Nothing on the page is compelling enough to stop and click.`);
                    break;
                case 'trust_gap':
                    analyst.push(`I'm sensing a trust gap. ${state.is_new_user ? 'As a first-time visitor, they' : 'They'} need more confidence that this store is legitimate before spending money.`);
                    break;
                default:
                    analyst.push(`I'm detecting ${f.type.replace(/_/g, ' ')} friction. Something about this interaction isn't going smoothly.`);
            }

            // Record cooldown so same friction narration won't repeat within 60s
            narrationCooldowns.set(frictionCooldownKey, Date.now());
        });
    }

    if (contract.intervention) {
        const iv = contract.intervention;
        const cooldown = state.cooldown;
        const cart = state.cart_context;
        const lp = state.product_context.last_product;
        const cp = state.product_context.current_product;

        // Context-aware intervention reasoning
        let interventionReason = '';
        if (iv.friction_type === 'exit_intent' && cart.item_count > 0) {
            interventionReason = `I think it's time to step in. They're about to leave with $${cart.total_value} in their cart — showing them what they'll miss.`;
        } else if (iv.friction_type === 'exit_intent' && (lp || cp)) {
            const prod = cp || lp;
            interventionReason = `I think it's time to step in. They're leaving but showed interest in "${prod!.product_name}" ($${prod!.price}) — a gentle nudge might bring them back.`;
        } else if (iv.friction_type === 'checkout_hesitation') {
            interventionReason = `I think it's time to step in. They've stalled at checkout — a bit of reassurance about security and easy returns could help them finish.`;
        } else if (iv.friction_type === 'comparison_loop' || iv.friction_type === 'indecision') {
            interventionReason = `I think it's time to step in. They can't decide on their own — showing a direct comparison might break the deadlock.`;
        } else if (iv.friction_type === 'price_sensitivity') {
            interventionReason = `I think it's time to step in. Price is clearly the issue — highlighting the value proposition or offering an incentive could tip the balance.`;
        } else if (iv.friction_type === 'search_frustration') {
            // Use detected intent for better intervention reasoning
            const searchCtx = iv.context;
            if (searchCtx?.inferred_category) {
                interventionReason = `I think it's time to step in. They're searching for ${searchCtx.inferred_category}${searchCtx.inferred_brand ? ` (${searchCtx.inferred_brand})` : ''} but not finding it — I'll offer to guide them to the right products.`;
            } else {
                interventionReason = `I think it's time to step in. They can't find what they want — I'll offer to help before they give up entirely.`;
            }
        } else {
            interventionReason = `I think it's time to step in with some help for the ${iv.friction_type.replace(/_/g, ' ')} I'm seeing.`;
        }

        // Stage-aware attempt note
        let attemptNote = '';
        if (iv.stage && iv.stage > 1) {
            const stageApproach = iv.approach === 'persuasive' ? 'more persuasive approach' : 'discount offer';
            attemptNote = ` This is stage ${iv.stage} — escalating to a ${stageApproach} since the helpful approach didn't work.`;
        } else if (cooldown.interventionCount > 0) {
            attemptNote = ` This is attempt #${cooldown.interventionCount + 1} — I need to be careful not to be too pushy.`;
        }
        analyst.push(`${interventionReason}${attemptNote}`);
    } else if (canAct && (!contract.detected_frictions || contract.detected_frictions.length === 0)) {
        // Only narrate "watching" status once per 60s to avoid spam
        const watchKey = `${state.session_id}:watching_no_friction`;
        const lastWatch = narrationCooldowns.get(watchKey) || 0;
        if (s.interest >= 50 && (Date.now() - lastWatch) > 60000) {
            analyst.push(`I could intervene right now — the scores support it — but there's no clear friction to address. I'll keep watching for a specific moment to step in.`);
            narrationCooldowns.set(watchKey, Date.now());
        }
    } else if (contract.detected_frictions && contract.detected_frictions.length > 0 && !canAct) {
        // Only narrate "friction building" once per 60s to avoid spam
        const buildKey = `${state.session_id}:friction_building`;
        const lastBuild = narrationCooldowns.get(buildKey) || 0;
        if ((Date.now() - lastBuild) > 60000) {
            analyst.push(`I can see friction building but the user hasn't shown enough engagement yet for me to intervene. Stepping in too early could backfire — I'll wait for a stronger signal.`);
            narrationCooldowns.set(buildKey, Date.now());
        }
    }

    return { tracking, analyst };
}

// ============================================================
// System Reset
// ============================================================

const recentNarrativeLogs: string[] = [];

function addToLogHistory(logs: string[]) {
    recentNarrativeLogs.push(...logs);
    if (recentNarrativeLogs.length > 50) recentNarrativeLogs.splice(0, recentNarrativeLogs.length - 50);
}

function resetSystem() {
    console.log('[System] Global Reset Triggered');
    sessionStates.clear();
    eventHistory.clear();
    sessionTimestamps.clear();
    sessionStartTimes.clear();
    cursorAggregation.clear();
    sessionConversions.clear();
    sessionFunnelTracking.clear();

    analyticsData.totalSessions = 0;
    analyticsData.activeSessions = 0;
    analyticsData.avgSessionDuration = 0;
    analyticsData.conversionRate = 0;
    analyticsData.frictionBreakdown = {};
    analyticsData.interventionBreakdown = {};
    analyticsData.funnel = { browsed: 0, addedToCart: 0, checkedOut: 0 };
    analyticsData.predictiveScores = undefined;
    analyticsData.scores = undefined;

    recentNarrativeLogs.length = 0;

    const msg = JSON.stringify({ type: 'reset' });
    dashboardClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

// ============================================================
// Endpoints
// ============================================================

app.post('/api/reset', (_req, res) => {
    resetSystem();
    res.json({ success: true, message: 'System state wiped.' });
});

app.post('/api/event', (req, res) => {
    const event = req.body as UserEvent;

    if (event.payload?.force_reset === true) {
        console.log(`[Event] Atomic Reset requested by ${event.event_type}`);
        resetSystem();
    }
    console.log(`[Event] ${event.event_type} from ${event.session_id}`);

    // Rate limiting - Critical events bypass throttling
    const lastEventTime = sessionTimestamps.get(event.session_id) || 0;
    const now = Date.now();
    const isCritical = [
        // Session initialization
        'session_started', 'page_loaded', 'new_user_detected', 'page_navigation',
        // Product interactions
        'product_viewed', 'product_detail', 'product_modal_closed', 'product_description_expanded', 'product_reviews_viewed', 'product_variant_changed', 'product_return_policy_viewed',
        // Cart & Wishlist
        'add_to_cart', 'cart_item_added', 'cart_item_removed', 'remove_from_cart', 'cart_opened', 'cart_closed',
        'add_to_wishlist', 'wishlist_item_added', 'wishlist_opened', 'wishlist_closed',
        // Checkout
        'checkout_started', 'order_placed', 'payment_method_selected', 'shipping_option_selected',
        // Secondary signals for evaluation
        'exit_intent', 'price_hover_end', 'click_rage', 'browsing_pattern', 'search_query', 'search_zero_results', 'filter_applied',
        'similar_product_clicked', 'suggested_product_clicked', 'text_selection'
    ].includes(event.event_type);

    if (!isCritical && now - lastEventTime < 300) {
        const state = sessionStates.get(event.session_id);
        const cached: any = state ? {
            session_id: event.session_id, timestamp: new Date().toISOString(),
            intent_state: { primary_intent: 'exploratory', confidence: 0.5 },
            friction_types: [], recommended_actions: [], forbidden_actions: [],
            rationale: 'Throttled', expiry: new Date(now + 300000).toISOString(),
            scores: state.scores,
        } : null;
        res.json(cached);
        return;
    }
    sessionTimestamps.set(event.session_id, now);

    // Process
    const contract = processEvent(event);

    // Analytics
    updateAnalytics(event.session_id, contract);

    // Narrative (split into tracking + analyst streams)
    const scenarioKeyForNarrative = getScenarioKey(event, getOrCreateSession(event.session_id));
    const { tracking: trackingLogs, analyst: analystLogs } = generateNarrative(event, contract, getOrCreateSession(event.session_id), scenarioKeyForNarrative);
    addToLogHistory(trackingLogs);

    // Broadcast with separate streams
    const broadcastMsg = JSON.stringify({
        type: 'analysis_update', event, contract,
        narrative: trackingLogs,  // Legacy compat (Live Feed)
        tracking_logs: trackingLogs,
        analyst_logs: analystLogs,
    });
    dashboardClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(broadcastMsg);
    });

    res.json(contract);
});

// Legacy endpoint compatibility
app.post('/api/analyze', (req, res) => {
    const event = req.body as UserEvent;

    if (event.payload?.force_reset === true) {
        resetSystem();
    }

    const lastEventTime = sessionTimestamps.get(event.session_id) || 0;
    const now = Date.now();
    // Critical events bypass throttling - include major signals AND secondary signals that need to be captured
    const isCritical = [
        // Session initialization
        'session_started', 'page_loaded', 'new_user_detected', 'page_navigation',
        // Product interactions
        'product_viewed', 'product_detail', 'product_modal_closed', 'product_description_expanded', 'product_reviews_viewed', 'product_variant_changed', 'product_return_policy_viewed',
        // Cart & Wishlist
        'add_to_cart', 'cart_item_added', 'cart_item_removed', 'remove_from_cart', 'cart_opened', 'cart_closed',
        'add_to_wishlist', 'wishlist_item_added', 'wishlist_opened', 'wishlist_closed',
        // Checkout
        'checkout_started', 'order_placed', 'payment_method_selected', 'shipping_option_selected',
        // Secondary signals for evaluation
        'exit_intent', 'price_hover_end', 'click_rage', 'browsing_pattern', 'search_query', 'search_zero_results', 'filter_applied',
        'similar_product_clicked', 'suggested_product_clicked', 'text_selection'
    ].includes(event.event_type);

    if (!isCritical && now - lastEventTime < 300) {
        const state = sessionStates.get(event.session_id);
        const cached: any = state ? {
            session_id: event.session_id, timestamp: new Date().toISOString(),
            intent_state: { primary_intent: 'exploratory', confidence: 0.5 },
            friction_types: [], recommended_actions: [], forbidden_actions: [],
            rationale: 'Throttled', expiry: new Date(now + 300000).toISOString(),
            scores: state.scores,
        } : null;
        res.json(cached);
        return;
    }
    sessionTimestamps.set(event.session_id, now);

    const contract = processEvent(event);
    updateAnalytics(event.session_id, contract);

    const scenarioKeyForNarrative = getScenarioKey(event, getOrCreateSession(event.session_id));
    const { tracking: trackingLogs, analyst: analystLogs } = generateNarrative(event, contract, getOrCreateSession(event.session_id), scenarioKeyForNarrative);
    addToLogHistory(trackingLogs);

    const broadcastMsg = JSON.stringify({
        type: 'analysis_update', event, contract,
        narrative: trackingLogs,
        tracking_logs: trackingLogs,
        analyst_logs: analystLogs,
    });
    dashboardClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(broadcastMsg);
    });

    res.json(contract);
});

// ============================================================
// WebSocket
// ============================================================

wss.on('connection', (ws) => {
    console.log('Dashboard connected');
    dashboardClients.add(ws);

    if (recentNarrativeLogs.length > 0) {
        ws.send(JSON.stringify({ type: 'analysis_update', narrative: recentNarrativeLogs }));
    }

    ws.on('close', () => dashboardClients.delete(ws));
});

// ============================================================
// Start
// ============================================================

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Analyst Server running on http://0.0.0.0:${PORT}`);
});
