export type IntentType =
    | 'exploratory'
    | 'comparison'    // NEW: Comparing similar items
    | 'research'      // Deep diving into specs
    | 'high_intent'   // Scroll depth, frequent visits
    | 'high_interest' // Wishlist activity - strong purchase signal
    | 'purchase'      // NEW: Cart interaction
    | 'friction'      // Blocked by confusion/price
    | 'abandonment_risk'; // Exit intent

// 3. Friction Signals
// What is stopping them?
export type FrictionType =
    | 'confusion'         // Add/Remove loops
    | 'frustration'       // Zero search results, rage clicks
    | 'price_sensitivity' // Hovering price
    | 'trust'             // Generic hesitation/nav issues
    | 'clarity'           // Spec reading hesitation
    | 'indecision'        // NEW: Filter loops
    | 'hesitation';       // NEW: Checkout stall

export type ActionType = 'chat_proactive' | 'voice_proactive' | 'email_recovery' | 'none';

export interface ActionConstraint {
    max_frequency: '1/session' | '1/day' | 'always';
    requires_user_consent: boolean;
}

export interface RecommendedAction {
    action_type: ActionType;
    priority: number; // 1 (Highest) - 5 (Lowest)
    message_template: string;
    constraints: ActionConstraint;
}

export interface IntentState {
    primary_intent: IntentType;
    confidence: number; // 0.0 - 1.0
    secondary_intents?: { intent: IntentType; confidence: number }[];
}

export interface DetectedFriction {
    type: FrictionType;
    confidence: number;
    evidence: string[];
}

// The "Contract" - Single Source of Truth
export interface AnalystContract {
    session_id: string;
    timestamp: string; // ISO-8601
    intent_state: IntentState;
    friction_types: DetectedFriction[];
    recommended_actions: RecommendedAction[];
    forbidden_actions: ActionType[];
    rationale: string; // Explainable reasoning
    expiry: string; // ISO-8601
}

// Event sent from Client to Server
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
    // P0 New Events
    | 'product_detail'           // Product modal interactions
    | 'element_hover'            // Enhanced hover with context
    | 'cart_action'              // Cart-specific actions
    | 'session_journey'          // Page navigation path
    | 'similar_product_clicked' // Comparison tracking
    // P1 New Events
    | 'browsing_pattern'
    | 'checkout_step'
    | 'form_field'
    | 'predictive_score'
    // P2 New Events
    | 'search_action'
    | 'attention'
    | 'cursor_stream'
    | 'heatmap_data'
    // P3 New Events
    | 'filter_usage'
    | 'network_speed'
    | 'device_context'
    | 'user_profile_update'
    // Enhanced Tracking Events
    | 'page_navigation'          // Page loads and routing
    | 'product_viewed'           // Product viewing with details
    | 'product_variant_changed'  // Variant selection changes
    | 'cart_opened'              // Cart modal opened
    | 'cart_closed'              // Cart modal closed
    | 'wishlist_opened'          // Wishlist opened
    | 'wishlist_closed'          // Wishlist closed
    | 'wishlist_item_added'      // Item added to wishlist
    | 'session_started'          // First page entry
    | 'form_field_change'        // Form field populated
    | 'shipping_option_selected' // Shipping method chosen
    | 'delivery_slot_selected'   // Delivery time slot chosen
    // Phase 3 Friction Signals
    | 'text_selection'           // Highlighted text (Price/Name)
    | 'copy_action'              // Copied text to clipboard
    | 'scroll_velocity'          // Doom scrolling detection
    | 'footer_interaction';      // Trust signal (About/Returns)
    url: string;
    payload?: any;
    timestamp: string;
}
