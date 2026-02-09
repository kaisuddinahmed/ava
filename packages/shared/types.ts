// ============================================================
// LEGACY TYPES (kept for backward compatibility during migration)
// ============================================================

export type IntentType =
    | 'exploratory'
    | 'comparison'
    | 'research'
    | 'high_intent'
    | 'high_interest'
    | 'purchase'
    | 'friction'
    | 'abandonment_risk';

export interface IntentState {
    primary_intent: IntentType;
    confidence: number;
    secondary_intents?: { intent: IntentType; confidence: number }[];
}

// ============================================================
// V2 TYPES — Comprehensive Tracking & Intervention System
// ============================================================

// --- Friction Types (13) ---
export type FrictionType =
    | 'exit_intent'
    | 'price_sensitivity'
    | 'search_frustration'
    | 'specs_confusion'
    | 'indecision'
    | 'comparison_loop'
    | 'high_interest_stalling'
    | 'checkout_hesitation'
    | 'navigation_confusion'
    | 'gift_anxiety'
    | 'form_fatigue'
    | 'visual_doom_scrolling'
    | 'trust_gap';

// --- Intervention UI Types ---
export type InterventionUIType =
    | 'voice_only'
    | 'popup_small'
    | 'popup_product_card'
    | 'popup_comparison'
    | 'popup_custom';

// --- Action Types ---
export type ActionType = 'chat_proactive' | 'voice_proactive' | 'email_recovery' | 'none';

export interface ActionConstraint {
    max_frequency: '1/session' | '1/day' | 'always';
    requires_user_consent: boolean;
}

export interface RecommendedAction {
    action_type: ActionType;
    priority: number;
    message_template: string;
    constraints: ActionConstraint;
}

// --- Detected Friction ---
export interface DetectedFriction {
    type: FrictionType;
    confidence: number;       // 0.0 - 1.0
    evidence: string[];
    timestamp: number;
    context: any;
}

// --- Session Scores ---
export interface SessionScores {
    interest: number;   // 0-100
    friction: number;   // 0-100
    clarity: number;    // 0-100 (starts at 100, decreases)
}

// --- Product Context ---
export interface ProductContextItem {
    product_id: string;
    product_name: string;
    price: number;
    variant?: string;
}

export interface ProductContext {
    current_product?: ProductContextItem & {
        focus_start: number;
        actions: string[];
    };
    last_product?: ProductContextItem & {
        last_interaction: number;
    };
}

// --- Comparison Context ---
export interface ComparisonProduct {
    product_id: string;
    product_name: string;
    price: number;
    view_count: number;
    last_viewed: number;
    total_time_ms: number;
}

export interface ComparisonContext {
    products: Map<string, ComparisonProduct>;
}

// --- Search Context ---
export interface SearchQuery {
    query: string;
    timestamp: number;
    results_count: number;
    clicked_any: boolean;
}

export interface SearchContext {
    queries: SearchQuery[];
}

// --- Cart Context ---
export interface CartContextItem {
    product_id: string;
    product_name: string;
    variant: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

export interface CartContext {
    items: CartContextItem[];
    total_value: number;
    item_count: number;
}

// --- Session History ---
export interface SessionHistory {
    pages_visited: string[];
    products_viewed: string[];
    search_queries: string[];
    filters_applied: string[];
    session_start: number;
    session_duration_ms: number;
    total_products_viewed: number;
    total_cart_adds: number;
    total_cart_removes: number;
    total_wishlist_adds: number;
}

// --- Cooldown State ---
export interface CooldownState {
    lastInterventionTime: number;
    dismissedUntil: number;
    interventionCount: number;
    lastInterventionType: FrictionType | null;
}

// --- Scenario Contributions ---
export interface ScenarioContributions {
    [scenarioKey: string]: number;
}

// --- Advanced Score Event (for time-weighted scoring) ---
export interface ScoredEvent {
    scenario: string;
    delta: SessionScores;
    timestamp: number;
    confidence: number; // 0-1, from friction detection
    occurrenceIndex: number; // For diminishing returns
}

// --- Advanced Score State ---
export interface AdvancedScoreState {
    events: ScoredEvent[];
    occurrenceCounts: Record<string, number>;
    sessionStart: number;
}

// --- Intervention Stage ---
export type InterventionApproach = 'helpful' | 'persuasive' | 'offer';

// --- Intervention Log ---
export interface InterventionLog {
    timestamp: number;
    friction_type: FrictionType;
    intervention_type: InterventionUIType;
    script: string;
    context: any;
    user_response: 'accepted' | 'dismissed' | 'ignored' | null;
    outcome?: 'conversion' | 'abandoned' | 'pending';
    stage?: 1 | 2 | 3;
    approach?: InterventionApproach;
}

// --- Intervention Payload ---
export interface InterventionPayload {
    ui_type: InterventionUIType;
    script: string;
    friction_type: FrictionType;
    context: any;
    priority: number;
    stage?: 1 | 2 | 3;
    approach?: InterventionApproach;
}

// --- Session State (master) ---
export interface SessionState {
    session_id: string;
    device_type: 'mobile' | 'tablet' | 'desktop';
    is_new_user: boolean;
    visit_count: number;

    scores: SessionScores;
    advanced_scores?: AdvancedScoreState; // V2: Time-weighted scoring

    product_context: ProductContext;
    comparison_context: ComparisonContext;
    search_context: SearchContext;
    cart_context: CartContext;
    session_history: SessionHistory;

    events: UserEvent[];
    frictions: DetectedFriction[];
    interventions: InterventionLog[];

    current_page: string;

    session_start: number;
    last_activity: number;
    idle_seconds: number;

    cooldown: CooldownState;
    scenario_contributions: ScenarioContributions;
}

// --- Analyst Contract ---
export interface AnalystContract {
    session_id: string;
    timestamp: string;
    // Legacy fields
    intent_state: IntentState;
    friction_types: DetectedFriction[];
    recommended_actions: RecommendedAction[];
    forbidden_actions: ActionType[];
    rationale: string;
    expiry: string;
    // V2 fields
    scores?: SessionScores;
    detected_frictions?: DetectedFriction[];
    intervention?: InterventionPayload;
}

// --- User Event ---
export interface UserEvent {
    session_id: string;
    event_type:
        | 'view_item'
        | 'add_to_cart'
        | 'remove_from_cart'
        | 'add_to_wishlist'
        | 'search'
        | 'search_zero_results'
        | 'scroll'
        | 'click'
        | 'hover'
        | 'heartbeat'
        | 'idle'
        | 'exit_intent'
        | 'click_rage'
        | 'scroll_depth'
        // P0
        | 'product_detail'
        | 'element_hover'
        | 'cart_action'
        | 'session_journey'
        | 'similar_product_clicked'
        // P1
        | 'browsing_pattern'
        | 'checkout_step'
        | 'form_field'
        | 'predictive_score'
        // P2
        | 'search_action'
        | 'attention'
        | 'cursor_stream'
        | 'heatmap_data'
        // P3
        | 'filter_usage'
        | 'network_speed'
        | 'device_context'
        | 'user_profile_update'
        // Enhanced Tracking
        | 'page_navigation'
        | 'product_viewed'
        | 'product_variant_changed'
        | 'cart_opened'
        | 'cart_closed'
        | 'wishlist_opened'
        | 'wishlist_closed'
        | 'wishlist_item_added'
        | 'session_started'
        | 'page_loaded'
        | 'new_user_detected'
        | 'form_field_change'
        | 'shipping_option_selected'
        | 'delivery_slot_selected'
        | 'text_selection'
        // V2 New Events
        | 'product_description_expanded'
        | 'product_reviews_viewed'
        | 'product_return_policy_viewed'
        | 'product_modal_closed'
        | 'cart_item_added'
        | 'cart_item_removed'
        | 'cart_quantity_changed'
        | 'checkout_started'
        | 'shipping_method_viewed'
        | 'payment_method_viewed'
        | 'payment_method_selected'
        | 'order_placed'
        | 'search_query'
        | 'filter_applied'
        | 'visibility_change'
        | 'existing_user_detected'
        // Price Sensitivity Redesign Events
        | 'sort_changed'
        | 'price_filter_changed'
        | 'coupon_exploration'
        | 'coupon_field_clicked'
        | 'variant_downgraded'
        // Friction Library v2 Pre-Signals
        | 'filter_reset'
        | 'semantic_search_refinement'
        | 'spec_review_loop'
        | 'variant_toggle'
        | 'quick_bounce'
        | 'size_chart_first'
        | 'return_hover'
        | 'faq_visit'
        | 'delivery_estimator_check'
        | 'brief_tab_blur'
        | 'cursor_idle_mid_page'
        | 'region_rescroll'
        | 'address_field_loop'
        | 'keyboard_toggle'
        | 'checkout_idle'
        | 'intervention_dismissed'
        | 'intervention_accepted'
        | 'intervention_ignored';
    url: string;
    payload?: any;
    timestamp: string;
}
