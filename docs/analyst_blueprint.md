# Analyst Intelligence: Complete Behavioral Analytics Blueprint

**Version**: 2.0  
**Status**: Specification & Implementation Plan  
**Last Updated**: 2026-01-28

---

## Executive Summary

The current analyst tracks **reactive signals** (what user just did) but lacks **predictive intelligence** (what user will likely do). This blueprint defines a comprehensive behavioral analytics system that captures **every user micro-action** to build a complete behavioral fingerprint—understanding not just *what* the user did, but *why* they did it and *what* they will do next.

---

# Part 1: Current State Analysis

## Gaps in Existing Implementation

| Gap | Current State | Impact |
|:----|:--------------|:-------|
| **No Session Journey** | Events processed in isolation | Cannot understand user's path-to-purchase |
| **No Time-on-Page** | Only tracks idle timeout | Missing engagement depth metrics |
| **No Click Heatmap Analytics** | Visual only, no data persisted | Cannot identify UI problem areas |
| **No Product Affinity** | Tracks single item views | Cannot suggest complementary products |
| **No Return Visitor Detection** | Session-only tracking | Missing loyalty/intent history |
| **No Form Interaction** | Not tracking checkout fields | Cannot detect payment friction |
| **No Video/Media Engagement** | Not implemented | Missing content interest signals |
| **No Device/Viewport Context** | Not captured | Cannot optimize for mobile vs desktop |
| **No A/B Test Correlation** | Not implemented | Cannot measure intervention effectiveness |
| **No Micro-Cursor Tracking** | Basic hover only | Cannot see what user is evaluating |
| **No Product Modal Analytics** | Not tracking in-modal behavior | Missing deep interest signals |
| **No Cart Field Tracking** | Only add/remove | Cannot detect checkout friction |

---

# Part 2: Complete Event Schema Specification

## 1. Session Lifecycle Events

### 1.1 Session Start
```typescript
interface SessionStartEvent {
  event_type: 'session_start';
  session_id: string;
  visitor_id: string;           // Persistent across sessions (localStorage/fingerprint)
  timestamp: string;
  context: {
    referrer: string;           // Where did they come from?
    landing_page: string;       // First page URL
    utm_source?: string;        // Marketing attribution
    utm_campaign?: string;
    device_type: 'mobile' | 'tablet' | 'desktop';
    viewport: { width: number; height: number };
    user_agent: string;
    timezone: string;
    language: string;
    is_returning: boolean;      // Have we seen this visitor before?
    previous_sessions: number;  // How many times have they visited?
  };
}
```
**Files to Modify**: `packages/agent/src/main.tsx`

### 1.2 Page Navigation
```typescript
interface PageViewEvent {
  event_type: 'page_view';
  page_type: 'home' | 'category' | 'product_list' | 'product_detail' | 'cart' | 'checkout' | 'search_results' | 'other';
  page_url: string;
  page_title: string;
  previous_page?: string;       // Where did they come from?
  time_on_previous_page?: number; // Seconds spent on last page
}
```

### 1.3 Session Journey (Aggregated on Exit)
```typescript
type PageVisit = { url: string; timestamp: number; duration: number };
const sessionJourney: PageVisit[] = [];

// Send on page unload
window.addEventListener('beforeunload', () => {
  sendEvent('session_journey', { path: sessionJourney });
});
```

### 1.4 Session End
```typescript
interface SessionEndEvent {
  event_type: 'session_end';
  exit_page: string;
  session_duration: number;     // Total seconds
  pages_viewed: number;
  products_viewed: number;
  cart_value: number;
  converted: boolean;
}
```

---

## 2. Cursor & Attention Tracking

### 2.1 Cursor Position Stream (Sampled every 100ms)
```typescript
interface CursorMoveEvent {
  event_type: 'cursor_move';
  position: { x: number; y: number };
  velocity: number;             // Pixels per second
  element_under_cursor?: {
    type: 'product_image' | 'product_name' | 'product_price' | 'add_to_cart_btn' | 'wishlist_btn' | 'nav_menu' | 'search_bar' | 'filter' | 'other';
    product_id?: string;        // If hovering over product-related element
    element_id?: string;
  };
  timestamp: number;
}
```
**Note**: Sample every 100ms to avoid flooding, aggregate on server.

### 2.2 Element Hover (Meaningful Pauses)
```typescript
interface ElementHoverEvent {
  event_type: 'element_hover';
  element_type: 'product_card' | 'product_image' | 'product_name' | 'product_price' | 'rating' | 'discount_badge' | 'add_to_cart_btn' | 'wishlist_btn' | 'variant_selector' | 'quantity_input' | 'description' | 'specs' | 'reviews' | 'similar_product' | 'nav_item' | 'filter_option' | 'other';
  product_id?: string;
  element_text?: string;        // E.g., the price value, variant name
  hover_duration_ms: number;    // Time cursor stayed on element
  
  // Analyst Interpretation
  analyst_signal?: 'checking_price' | 'evaluating_image' | 'reading_name' | 'considering_rating' | 'attracted_by_discount' | 'hesitating_on_cta' | 'browsing_options';
}
```

### 2.3 Time-on-Element Tracking
```typescript
const elementTimers = new Map<string, number>();

document.querySelectorAll('[data-track-time]').forEach(el => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        elementTimers.set(el.id, Date.now());
      } else {
        const duration = Date.now() - (elementTimers.get(el.id) || Date.now());
        sendEvent('element_dwell', { element: el.id, duration });
      }
    });
  }, { threshold: 0.5 });
  observer.observe(el);
});
```

### 2.4 Scroll Behavior
```typescript
interface ScrollEvent {
  event_type: 'scroll';
  direction: 'up' | 'down';
  velocity: 'fast' | 'medium' | 'slow';  // fast=skimming, slow=reading
  depth_percent: number;        // 0-100
  visible_products?: string[];  // Product IDs currently in viewport
  time_at_depth: number;        // How long at this scroll position
}
```

### 2.5 Scroll Velocity Detection
```typescript
let lastScrollY = 0;
let lastScrollTime = Date.now();

window.addEventListener('scroll', () => {
  const velocity = Math.abs(window.scrollY - lastScrollY) / (Date.now() - lastScrollTime);
  if (velocity > 5) sendEvent('scroll_skim', { velocity });
  else if (velocity < 0.5) sendEvent('scroll_read', { velocity });
  lastScrollY = window.scrollY;
  lastScrollTime = Date.now();
});
```

---

## 3. Product Interaction Tracking

### 3.1 Product Card Interactions (Grid/List View)
```typescript
interface ProductCardEvent {
  event_type: 'product_card_interaction';
  action: 'hover' | 'click' | 'quick_view' | 'add_to_cart' | 'add_to_wishlist';
  product_id: string;
  product_name: string;
  product_price: number;
  product_category: string;
  position_in_list: number;     // Was it #1 or #50 in the grid?
  time_visible_before_action: number; // How long was card visible before interaction?
}
```

### 3.2 Product Detail Modal/Page (Deep Tracking) ⭐ CRITICAL
```typescript
interface ProductDetailEvent {
  event_type: 'product_detail';
  action: 
    | 'opened'                  // Modal/page opened
    | 'image_viewed'            // Looked at main image
    | 'image_zoomed'            // Zoomed into image
    | 'image_gallery_scrolled'  // Viewed multiple images
    | 'description_read'        // Scrolled to description
    | 'description_expanded'    // Clicked "Read More" - HIGH INTEREST
    | 'specs_opened'            // Expanded specifications
    | 'specs_item_hovered'      // Hovered on specific spec
    | 'reviews_scrolled'        // Browsing reviews
    | 'review_helpful_clicked'  // Engaged with review
    | 'variant_selected'        // Changed color/size/etc
    | 'quantity_increased'      // Added more units
    | 'quantity_decreased'      // Removed units (hesitation?)
    | 'add_to_wishlist'         // Saved for later
    | 'add_to_cart'             // Purchase intent!
    | 'similar_product_viewed'  // Scrolled to similar section
    | 'similar_product_clicked' // Clicked a similar product
    | 'closed'                  // Exited modal/page
  ;
  product_id: string;
  product_name: string;
  product_price: number;
  
  // Context for specific actions
  variant_selected?: string;    // "Red, Size M"
  quantity?: number;
  similar_product_clicked_id?: string;
  time_spent_ms?: number;       // For 'closed' action - total time in modal
  description_read_percent?: number; // How much was scrolled
  images_viewed_count?: number;
  
  // Analyst interpretation
  interest_score?: number;      // 0-100, calculated from dwell time + actions
}
```

### 3.3 Similar Products Behavior Pattern ⭐ INTERVENTION TRIGGER
```typescript
interface SimilarProductsPatternEvent {
  event_type: 'similar_products_pattern';
  pattern: 'browsing' | 'comparing' | 'stuck_in_loop';
  products_in_chain: string[];  // [ProductA -> ProductB -> ProductC -> ProductA]
  total_time_in_pattern: number;
  unique_products_viewed: number;
  repeated_products: string[];  // Products viewed more than once
  
  // Intervention trigger
  intervention_recommended: boolean;
  intervention_reason?: 'comparison_paralysis' | 'cant_find_match' | 'price_shopping';
}
```

---

## 4. Search & Filter Behavior

### 4.1 Search Events
```typescript
interface SearchEvent {
  event_type: 'search';
  action: 'focus' | 'typing' | 'submit' | 'clear' | 'suggestion_click' | 'no_results';
  query?: string;
  query_length?: number;
  time_to_type?: number;        // Hesitation indicator
  results_count?: number;
  suggestion_clicked?: string;
  typo_detected?: boolean;      // Did they misspell something?
}
```

### 4.2 Filter & Sort Events
```typescript
interface FilterEvent {
  event_type: 'filter';
  action: 'applied' | 'removed' | 'changed' | 'cleared_all';
  filter_type: 'category' | 'price_range' | 'brand' | 'rating' | 'color' | 'size' | 'availability' | 'other';
  filter_value: string;
  filters_active_count: number;
  results_after_filter: number;
  time_since_last_filter?: number; // Rapid changes = indecision
}
```

### 4.3 Browsing Without Action Pattern ⭐ INTERVENTION TRIGGER
```typescript
interface BrowsingPatternEvent {
  event_type: 'browsing_pattern';
  pattern: 'exploring' | 'searching_frustrated' | 'filter_loop' | 'scroll_without_click';
  
  metrics: {
    pages_visited: number;
    products_seen: number;
    products_clicked: number;      // Low click rate = not finding what they want
    searches_made: number;
    filters_changed: number;
    time_browsing: number;
    scroll_distance_total: number;
  };
  
  intervention_trigger: boolean;
  suggested_intervention: 'offer_help' | 'show_recommendations' | 'ask_what_looking_for';
}
```

---

## 5. Cart & Checkout Tracking

### 5.1 Cart Events
```typescript
interface CartEvent {
  event_type: 'cart';
  action: 
    | 'opened'                  // Viewed cart
    | 'item_added'              // From product page
    | 'item_removed'            // Deleted item
    | 'quantity_increased'      // Added more
    | 'quantity_decreased'      // Reduced (hesitation)
    | 'coupon_entered'          // Trying discount code
    | 'coupon_success'          // Code worked
    | 'coupon_failed'           // Code invalid - FRUSTRATION
    | 'shipping_calculated'     // Viewing shipping options
    | 'proceed_to_checkout'     // Moving forward
    | 'abandoned'               // Left cart page
  ;
  
  product_id?: string;
  product_name?: string;
  quantity_before?: number;
  quantity_after?: number;
  cart_total: number;
  cart_item_count: number;
  coupon_code?: string;
}
```

### 5.2 Checkout Flow Events
```typescript
interface CheckoutEvent {
  event_type: 'checkout';
  step: 'started' | 'contact_info' | 'shipping_address' | 'shipping_method' | 'payment_method' | 'review' | 'place_order' | 'completed' | 'abandoned';
  
  // Form field tracking
  field_interactions?: {
    field_name: string;         // 'email', 'phone', 'address_line_1', etc.
    action: 'focused' | 'typed' | 'cleared' | 'error' | 'completed';
    time_spent_ms: number;
    error_message?: string;     // Validation errors
    attempts?: number;          // How many times did they try?
  }[];
  
  // Selection tracking
  shipping_method_selected?: string;
  shipping_cost?: number;
  payment_method_selected?: 'credit_card' | 'paypal' | 'apple_pay' | 'klarna' | 'other';
  
  // Timing
  time_on_step_ms: number;
  total_checkout_time_ms?: number;  // For 'completed' or 'abandoned'
  
  // Order details (for completed)
  order_total?: number;
  items_purchased?: number;
}
```

### 5.3 Form Field Friction Detection
```typescript
document.querySelectorAll('input, select').forEach(field => {
  let focusTime = 0;
  field.addEventListener('focus', () => focusTime = Date.now());
  field.addEventListener('blur', () => {
    const duration = Date.now() - focusTime;
    if (duration > 10000) { // 10+ seconds on one field = friction
      sendEvent('form_friction', { field: field.name, duration });
    }
  });
});
```

### 5.4 Cart Abandonment Analysis
```typescript
interface CartAbandonmentEvent {
  event_type: 'cart_abandonment';
  abandonment_stage: 'cart_page' | 'checkout_contact' | 'checkout_shipping' | 'checkout_payment' | 'checkout_review';
  
  cart_value: number;
  items_in_cart: number;
  highest_priced_item: string;
  
  potential_reasons: {
    high_shipping_cost: boolean;    // Abandoned after seeing shipping
    payment_friction: boolean;      // Multiple payment errors
    form_friction: boolean;         // Long form fill time
    price_shock: boolean;           // Left after seeing total
    distraction: boolean;           // Tab switched or idle
    comparison_shopping: boolean;   // Copied text / opened new tabs
  };
  
  recovery_action_recommended: 'email_reminder' | 'discount_offer' | 'live_chat' | 'exit_popup';
}
```

---

## 6. Engagement Quality Signals

### 6.1 Attention Indicators
```typescript
interface AttentionEvent {
  event_type: 'attention';
  signal: 
    | 'tab_visible'             // User is on this tab
    | 'tab_hidden'              // Switched to another tab
    | 'window_focused'          // Browser window active
    | 'window_blurred'          // Clicked outside browser
    | 'idle_start'              // No activity for X seconds
    | 'idle_end'                // Activity resumed
    | 'rapid_scroll'            // Skimming content
    | 'slow_scroll'             // Reading content
    | 'zoom_in'                 // Looking closer (mobile pinch)
    | 'zoom_out'
  ;
  
  duration_ms?: number;
  page_url: string;
  product_id?: string;          // If on product page
}
```

### 6.2 Copy & External Actions
```typescript
interface ExternalActionEvent {
  event_type: 'external_action';
  action: 
    | 'text_copied'             // Copying product info (comparison shopping)
    | 'text_selected'           // Highlighting text
    | 'right_click'             // Context menu (save image?)
    | 'print_initiated'         // Ctrl+P
    | 'bookmark_attempted'      // Ctrl+D
    | 'share_clicked'           // Social share button
  ;
  
  content?: string;             // What was copied/selected (first 100 chars)
  product_id?: string;
  element_type?: string;
}
```

### 6.3 Copy/Paste Detection Implementation
```typescript
document.addEventListener('copy', () => {
  const selection = window.getSelection()?.toString();
  if (selection && selection.length > 10) {
    sendEvent('content_copied', { text: selection.substring(0, 50) });
  }
});
```

### 6.4 Additional Browser Signals

| Signal | Detection Method | Forecasting Value |
|:-------|:-----------------|:------------------|
| **Tab Switching** | `visibilitychange` event | Comparison shopping indicator |
| **Back Button Usage** | `popstate` event | Confusion/regret signal |
| **Zoom/Pinch** | Touch events | Mobile UX friction |
| **Text Selection** | `selectionchange` event | Research intent |
| **Right-Click** | `contextmenu` event | Image save = high interest |
| **Keyboard Shortcuts** | `keydown` (Ctrl+D, Ctrl+P) | Bookmark/print = serious buyer |
| **Network Speed** | `navigator.connection` | Adjust media quality |
| **Battery Level** | `navigator.getBattery()` | Urgency context |

---

## 7. Analyst Intelligence Layer

### 7.1 Real-Time User State
```typescript
interface UserState {
  session_id: string;
  visitor_id: string;
  
  // Current context
  current_page: string;
  current_product_id?: string;
  time_on_current_page: number;
  
  // Journey summary
  journey_stage: 'browsing' | 'researching' | 'comparing' | 'deciding' | 'purchasing' | 'abandoning';
  products_viewed: string[];
  products_in_cart: string[];
  products_wishlisted: string[];
  
  // Behavioral scores (0-100)
  purchase_intent_score: number;
  engagement_score: number;
  frustration_score: number;
  price_sensitivity_score: number;
  
  // Detected patterns
  active_patterns: ('comparison_loop' | 'search_frustration' | 'filter_indecision' | 'checkout_hesitation' | 'exit_intent')[];
  
  // Intervention state
  interventions_shown: number;
  last_intervention_time?: number;
  intervention_cooldown_active: boolean;
}
```

### 7.2 Predictive Scoring Model
```typescript
function calculatePurchaseScore(session: SessionData): number {
  let score = 50; // Base score
  
  if (session.addedToCart) score += 20;
  if (session.addedToWishlist) score += 15;
  if (session.viewedSpecs) score += 10;
  if (session.scrollDepth > 80) score += 5;
  if (session.timeOnPage > 120) score += 10;
  if (session.descriptionExpanded) score += 15;  // HIGH INTEREST
  if (session.imagesViewed > 3) score += 10;
  if (session.exitIntentDetected) score -= 25;
  if (session.clickRageDetected) score -= 20;
  if (session.priceHovered) score -= 10;
  if (session.tabSwitched) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}
```

### 7.3 Predictive Signals
```typescript
interface PredictionEvent {
  event_type: 'prediction';
  prediction_type: 'purchase_probability' | 'abandonment_risk' | 'support_needed' | 'upsell_opportunity';
  
  confidence: number;           // 0-100
  reasoning: string[];          // ["Viewed product 3 times", "Added to cart", "Hovering on checkout"]
  
  recommended_action?: {
    type: 'voice_message' | 'chat_popup' | 'discount_offer' | 'product_recommendation' | 'support_offer';
    message: string;
    urgency: 'low' | 'medium' | 'high';
  };
}
```

### 7.4 User Profile Building (Persistent)
```typescript
interface UserProfile {
  visitorId: string;  // Fingerprint or cookie
  totalSessions: number;
  avgSessionDuration: number;
  preferredCategories: string[];
  priceRange: { min: number; max: number };
  conversionHistory: boolean[];
}
```

### 7.5 ML-Ready Feature Vector
```typescript
interface BehaviorFeatureVector {
  // Temporal
  sessionDuration: number;
  timeOfDay: number;
  dayOfWeek: number;
  
  // Engagement
  pageViews: number;
  uniqueProductsViewed: number;
  avgTimePerProduct: number;
  scrollDepthMax: number;
  
  // Intent Signals
  searchQueries: number;
  filterChanges: number;
  cartAdds: number;
  cartRemoves: number;
  wishlistAdds: number;
  descriptionExpands: number;
  specsOpened: number;
  
  // Friction Signals
  exitIntents: number;
  clickRages: number;
  formAbandonments: number;
  tabSwitches: number;
  
  // Context
  deviceType: 'mobile' | 'tablet' | 'desktop';
  isReturningVisitor: boolean;
  referrerType: 'direct' | 'search' | 'social' | 'email';
}
```

---

## 8. Server-Side Persistence

### 8.1 Heatmap Data Storage
```typescript
interface HeatmapPoint { x: number; y: number; count: number; }
const heatmapData = new Map<string, HeatmapPoint[]>();

function storeHeatmap(sessionId: string, points: HeatmapPoint[]) {
  // Store in database/file for later analysis
}
```
**Files to Modify**: `packages/analyst/index.ts`

---

# Part 3: Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Cursor      │  │ Click/Tap   │  │ Scroll      │              │
│  │ Tracker     │  │ Handler     │  │ Observer    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          ▼                                       │
│                ┌─────────────────┐                               │
│                │  Event Queue    │  (Batch & Throttle)           │
│                │  (100ms buffer) │                               │
│                └────────┬────────┘                               │
│                         │                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │ POST /api/events (batched)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ANALYST (Server)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Event       │  │ Pattern     │  │ Prediction  │              │
│  │ Processor   │─▶│ Detector    │─▶│ Engine      │              │
│  └─────────────┘  └─────────────┘  └──────┬──────┘              │
│                                           │                      │
│                          ┌────────────────┴────────────────┐     │
│                          ▼                                 ▼     │
│                ┌─────────────────┐              ┌──────────────┐ │
│                │ User State      │              │ Intervention │ │
│                │ (Real-time)     │              │ Recommender  │ │
│                └─────────────────┘              └──────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

# Part 4: Implementation Roadmap

## Priority Matrix

| Priority | Event/Feature | Complexity | Business Value | Files to Modify |
|:---------|:--------------|:-----------|:---------------|:----------------|
| 🔴 **P0** | Product Detail Tracking (3.2) | Medium | Very High | `packages/agent/index.html` |
| 🔴 **P0** | Element Hover (2.2) | Low | High | `packages/agent/src/main.tsx` |
| 🔴 **P0** | Cart Events (5.1) | Low | Very High | `packages/agent/index.html` |
| 🔴 **P0** | Session Journey (1.3) | Medium | High | `packages/agent/src/main.tsx` |
| 🟡 **P1** | Similar Products Pattern (3.3) | Medium | High | `packages/analyst/index.ts` |
| 🟡 **P1** | Browsing Pattern (4.3) | Medium | High | `packages/analyst/index.ts` |
| 🟡 **P1** | Checkout Flow (5.2) | Medium | Very High | `packages/agent/checkout.html` |
| 🟡 **P1** | Predictive Scoring (7.2) | Medium | High | `packages/analyst/index.ts` |
| 🟡 **P1** | Form Field Friction (5.3) | Low | Medium | `packages/agent/checkout.html` |
| 🟢 **P2** | Cursor Position Stream (2.1) | High | Medium | `packages/agent/src/main.tsx` |
| 🟢 **P2** | Search Events (4.1) | Low | Medium | `packages/agent/index.html` |
| 🟢 **P2** | Attention Indicators (6.1) | Low | Medium | `packages/agent/src/main.tsx` |
| 🟢 **P2** | Heatmap Persistence (8.1) | Medium | Medium | `packages/analyst/index.ts` |
| 🟢 **P2** | User Profile Building (7.4) | High | High | `packages/analyst/index.ts` |
| 🔵 **P3** | External Actions (6.2) | Low | Low | `packages/agent/src/main.tsx` |
| 🔵 **P3** | Predictive Signals (7.3) | High | Very High | `packages/analyst/index.ts` |
| 🔵 **P3** | ML Feature Vector (7.5) | High | Very High | `packages/shared/types.ts` |

---

## Implementation Phases

### Phase 1: Enhanced Event Capture (P0 - Week 1-2)
- [ ] Product detail modal tracking (all actions)
- [ ] Element hover with product_id context
- [ ] Cart event expansion (quantity, coupon)
- [ ] Session journey aggregation

### Phase 2: Pattern Detection (P1 - Week 3-4)
- [ ] Similar products loop detector
- [ ] Browsing frustration detector
- [ ] Checkout friction detector
- [ ] Predictive scoring implementation

### Phase 3: Persistent Analytics (P2 - Week 5-6)
- [ ] Cursor stream with throttling
- [ ] Search query tracking
- [ ] Tab/attention monitoring
- [ ] Heatmap data storage
- [ ] User profile persistence

### Phase 4: Predictive Intelligence (P3 - Week 7-8)
- [ ] External action tracking
- [ ] ML feature vector generation
- [ ] Prediction engine implementation
- [ ] A/B testing correlation

---

## Expected Outcomes

1. **Conversion Rate Improvement**: 15-25% with better-timed interventions
2. **Friction Detection**: Identify UX issues before they cause abandonment
3. **Personalization**: Tailor agent messages based on user profile
4. **A/B Testing**: Measure which interventions work best
5. **Predictive Alerts**: Notify analyst before exit intent, not after
6. **Deep Understanding**: Know exactly what element user is evaluating

---

## Next Steps

1. ✅ **Approve this blueprint** - Review event schemas and priority
2. 🔲 **Implement P0 events** - Focus on product detail + cart tracking
3. 🔲 **Update shared types** - Add new event interfaces to `types.ts`
4. 🔲 **Update analyst reasoner** - Handle new event types
5. 🔲 **Build pattern detectors** - Comparison loop, search frustration, etc.
6. 🔲 **Add intervention triggers** - Connect patterns to voice/chat responses
7. 🔲 **Create analytics dashboard** - Visualize all captured data
