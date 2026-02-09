import type {
    DetectedFriction,
    ProductContext,
    CartContext,
    ComparisonContext,
    SearchContext,
    UserEvent,
} from '../shared/types';
import { analyzeSearchIntent } from './context-resolvers';

// ============================================================
// Exit Intent
// ============================================================

export function detectExitIntent(
    event: UserEvent,
    productContext: ProductContext,
    cartContext: CartContext
): DetectedFriction | null {
    if (event.event_type !== 'exit_intent') return null;

    return {
        type: 'exit_intent',
        confidence: 1.0,
        evidence: ['exit_detected'],
        timestamp: Date.now(),
        context: {
            product: productContext.last_product || productContext.current_product || null,
            cart_items: cartContext.items,
        },
    };
}

// ============================================================
// Price Sensitivity
// ============================================================

export function detectPriceSensitivity(
    event: UserEvent,
    history: UserEvent[],
    productContext: ProductContext
): DetectedFriction | null {
    // Pattern 1: Sort Cycling (Low -> High -> Low)
    if (event.event_type === 'sort_changed' && event.payload?.pattern === 'cycling') {
        return {
            type: 'price_sensitivity',
            confidence: 0.9,
            evidence: ['price_sort_cycling'],
            timestamp: Date.now(),
            context: {
                sequence: event.payload.sequence
            }
        };
    }

    // Pattern 2: Coupon Seeking
    if (event.event_type === 'coupon_exploration') {
        return {
            type: 'price_sensitivity',
            confidence: 0.7,
            evidence: ['coupon_seeking'],
            timestamp: Date.now(),
            context: {
                action: event.payload.action
            }
        };
    }

    // Pattern 3: Variant Downgrade
    if (event.event_type === 'variant_downgraded') {
        return {
            type: 'price_sensitivity',
            confidence: 0.8,
            evidence: ['downgrade_intent'],
            timestamp: Date.now(),
            context: {
                price_decrease: event.payload.price_decrease
            }
        };
    }

    // Pattern 4: Sticker Shock (Cart added, no wishlist, then hesitation)
    // This is complex, could also be simple Price Filtering
    if (event.event_type === 'price_filter_changed') {
         return {
            type: 'price_sensitivity',
            confidence: 0.6,
            evidence: ['price_filtering'],
            timestamp: Date.now(),
            context: {
                range: event.payload.range
            }
        };
    }

    return null;
}

// ============================================================
// Search Frustration & Decision Narrowing
// ============================================================

export function detectSearchFrustration(
    event: UserEvent,
    searchContext: SearchContext
): DetectedFriction | null {
    // Pattern 1: Semantic Search Refinement (Agent detected)
    if (event.event_type === 'semantic_search_refinement') {
        return {
            type: 'search_frustration',
            confidence: 0.85,
            evidence: ['search_refinement'],
            timestamp: Date.now(),
            context: {
                original: event.payload.original_query,
                refined: event.payload.refined_query
            }
        };
    }

    // Pattern 2: Zero Results (Legacy)
    const recentQueries = searchContext.queries.slice(-5);
    const failedQueries = recentQueries.filter((q) => q.results_count === 0);
    if (failedQueries.length >= 2) {
        return {
            type: 'search_frustration',
            confidence: 0.9,
            evidence: ['multiple_zero_results'],
            timestamp: Date.now(),
            context: {
                failed_queries: failedQueries.map(q => q.query)
            },
        };
    }
    
    // Pattern 3: Filter Reset Loop
    if (event.event_type === 'filter_reset') {
        return {
            type: 'indecision', // or search_frustration
            confidence: 0.8,
            evidence: ['filter_loop'],
            timestamp: Date.now(),
            context: {
                filter: event.payload.filter
            }
        };
    }

    return null;
}

// ============================================================
// Indecision & Confusion
// ============================================================

export function detectIndecision(event: UserEvent): DetectedFriction | null {
    // Spec Loop
    if (event.event_type === 'spec_review_loop') {
         return {
            type: 'specs_confusion',
            confidence: 0.85,
            evidence: ['info_loop'],
            timestamp: Date.now(),
            context: { count: event.payload.loop_count }
        };
    }

    // Variant Toggle
    if (event.event_type === 'variant_toggle') {
        return {
            type: 'indecision',
            confidence: 0.8,
            evidence: ['variant_indecision'],
            timestamp: Date.now(),
            context: { count: event.payload.toggle_count }
        };
    }
    
    // Sizing Anxiety
    if (event.event_type === 'size_chart_first') {
        return {
            type: 'specs_confusion', // or indecision
            confidence: 0.75,
            evidence: ['sizing_anxiety'],
            timestamp: Date.now(),
            context: { time: event.payload.time_to_open_ms }
        };
    }

    return null;
}


// ============================================================
// Expectation Mismatch & Trust
// ============================================================

export function detectTrustIssues(event: UserEvent): DetectedFriction | null {
    // Quick Bounce
    if (event.event_type === 'quick_bounce') {
        return {
            type: 'trust_gap', // or expectation mismatch
            confidence: 0.8,
            evidence: ['bad_landing'],
            timestamp: Date.now(),
            context: { product_id: event.payload.product_id }
        };
    }

    // Return Check
    if (event.event_type === 'return_hover') {
        return {
            type: 'trust_gap',
            confidence: 0.6,
            evidence: ['return_policy_check'],
            timestamp: Date.now(),
            context: {}
        };
    }
    
    // Help Seeking
    if (event.event_type === 'faq_visit') {
        return {
            type: 'trust_gap',
            confidence: 0.7,
            evidence: ['help_seeking'],
            timestamp: Date.now(),
            context: { link: event.payload.link_text }
        };
    }

    return null;
}

// ============================================================
// Momentum Loss
// ============================================================

export function detectMomentumLoss(event: UserEvent): DetectedFriction | null {
    if (event.event_type === 'brief_tab_blur') {
        return {
            type: 'high_interest_stalling', // or momentum loss
            confidence: 0.6,
            evidence: ['brief_tab_blur'],
            timestamp: Date.now(),
            context: {}
        };
    }
    
    if (event.event_type === 'cursor_idle_mid_page') {
        return {
            type: 'high_interest_stalling',
            confidence: 0.5,
            evidence: ['cursor_idle_mid_page'],
            timestamp: Date.now(),
            context: {}
        };
    }
    
    if (event.event_type === 'region_rescroll') {
         return {
            type: 'indecision',
            confidence: 0.65,
            evidence: ['region_rescroll'],
            timestamp: Date.now(),
            context: { count: event.payload.revisit_count }
        };
    }

    return null;
}

// ============================================================
// Checkout Friction
// ============================================================

export function detectCheckoutFriction(event: UserEvent): DetectedFriction | null {
     if (event.event_type === 'address_field_loop') {
         return {
            type: 'checkout_hesitation', // or form_fatigue
            confidence: 0.85,
            evidence: ['address_field_loop'],
            timestamp: Date.now(),
            context: { field: event.payload.field_name }
        };
    }
    return null;
}


// ============================================================
// Main Runner
// ============================================================

export function runAllDetectors(
    event: UserEvent,
    history: UserEvent[],
    productContext: ProductContext,
    cartContext: CartContext,
    comparisonContext: ComparisonContext,
    searchContext: SearchContext,
    idleTime: number,
    deviceType: string,
    isNewUser: boolean,
    scrollData: any,
    productClicks: number
): DetectedFriction[] {
    const frictions: DetectedFriction[] = [];

    // 1. Exit Intent
    const exit = detectExitIntent(event, productContext, cartContext);
    if (exit) frictions.push(exit);

    // 2. Price Sensitivity
    const price = detectPriceSensitivity(event, history, productContext);
    if (price) frictions.push(price);

    // 3. Search Frustration
    const search = detectSearchFrustration(event, searchContext);
    if (search) frictions.push(search);
    
    // 4. Indecision (Specs, Pattern)
    const indecision = detectIndecision(event);
    if (indecision) frictions.push(indecision);
    
    // 5. Trust
    const trust = detectTrustIssues(event);
    if (trust) frictions.push(trust);
    
    // 6. Momentum
    const momentum = detectMomentumLoss(event);
    if (momentum) frictions.push(momentum);
    
    // 7. Checkout
    const checkout = detectCheckoutFriction(event);
    if (checkout) frictions.push(checkout);

    return frictions;
}
