import type {
    ProductContext,
    CartContext,
    ComparisonContext,
    SearchContext,
    UserEvent,
} from '../shared/types';

// ============================================================
// Intervention Context (returned by resolvers)
// ============================================================

export interface InterventionContext {
    product?: any;
    products?: any[];
    cart_items?: any[];
    message_type: string;
    last_query?: string;
    suggested_category?: string | null;
    field?: string;
    stock_level?: number | null;
    recent_purchases?: number | null;
    time_spent_ms?: number;
    user_location?: string;
    [key: string]: any;
}

// ============================================================
// Search Intent Inference System
// ============================================================

// Comprehensive category mapping for product search terms
const CATEGORY_MAP: Record<string, string> = {
    // Electronics - Laptops
    laptop: 'laptops',
    macbook: 'laptops',
    notebook: 'laptops',
    chromebook: 'laptops',
    ultrabook: 'laptops',
    gaming: 'gaming laptops',

    // Electronics - Phones & Tablets
    phone: 'smartphones',
    iphone: 'smartphones',
    android: 'smartphones',
    smartphone: 'smartphones',
    tablet: 'tablets',
    ipad: 'tablets',

    // Electronics - Accessories
    headphone: 'headphones',
    earbuds: 'earbuds',
    airpods: 'earbuds',
    charger: 'chargers & cables',
    cable: 'chargers & cables',
    case: 'cases & covers',
    keyboard: 'keyboards',
    mouse: 'mice & accessories',
    monitor: 'monitors',

    // Fashion - Clothing
    dress: 'dresses',
    shirt: 'shirts',
    tshirt: 't-shirts',
    jeans: 'jeans',
    pants: 'pants',
    jacket: 'jackets',
    coat: 'coats',
    sweater: 'sweaters',
    hoodie: 'hoodies',

    // Fashion - Footwear
    shoe: 'footwear',
    sneaker: 'sneakers',
    boot: 'boots',
    sandal: 'sandals',
    heel: 'heels',

    // Fashion - Accessories
    bag: 'bags',
    purse: 'bags',
    wallet: 'wallets',
    watch: 'watches',
    ring: 'rings',
    necklace: 'necklaces',
    bracelet: 'bracelets',
    sunglasses: 'eyewear',

    // Home & Kitchen
    furniture: 'furniture',
    chair: 'chairs',
    desk: 'desks',
    table: 'tables',
    lamp: 'lighting',
    rug: 'rugs',

    // Sports & Outdoors
    fitness: 'fitness equipment',
    yoga: 'yoga & pilates',
    camping: 'camping gear',
    hiking: 'outdoor gear',
};

// Brand detection for specific product searches
const BRAND_MAP: Record<string, { category: string; brand: string }> = {
    apple: { category: 'electronics', brand: 'Apple' },
    macbook: { category: 'laptops', brand: 'Apple' },
    iphone: { category: 'smartphones', brand: 'Apple' },
    ipad: { category: 'tablets', brand: 'Apple' },
    airpods: { category: 'earbuds', brand: 'Apple' },
    samsung: { category: 'electronics', brand: 'Samsung' },
    galaxy: { category: 'smartphones', brand: 'Samsung' },
    dell: { category: 'laptops', brand: 'Dell' },
    hp: { category: 'laptops', brand: 'HP' },
    lenovo: { category: 'laptops', brand: 'Lenovo' },
    thinkpad: { category: 'laptops', brand: 'Lenovo' },
    asus: { category: 'laptops', brand: 'ASUS' },
    acer: { category: 'laptops', brand: 'Acer' },
    sony: { category: 'electronics', brand: 'Sony' },
    bose: { category: 'headphones', brand: 'Bose' },
    nike: { category: 'footwear', brand: 'Nike' },
    adidas: { category: 'footwear', brand: 'Adidas' },
    puma: { category: 'footwear', brand: 'Puma' },
};

// Price intent signals
const BUDGET_SIGNALS = ['cheap', 'budget', 'affordable', 'under', 'less than', 'inexpensive', 'deal', 'sale', 'discount'];
const PREMIUM_SIGNALS = ['best', 'premium', 'pro', 'high-end', 'luxury', 'professional', 'top'];

// Specificity signals (indicates user knows what they want)
const SPECIFICITY_SIGNALS = ['inch', 'gb', 'tb', 'ram', 'ssd', 'hz', 'core', 'i5', 'i7', 'i9', 'ryzen', 'size', 'color'];

export interface SearchIntentResult {
    category: string | null;
    brand: string | null;
    intent_type: 'browsing' | 'specific_product' | 'comparison' | 'research';
    price_sensitivity: 'budget' | 'premium' | 'neutral';
    confidence: number;
    suggested_filters?: string[];
}

export function inferSearchIntent(searchContext: SearchContext): string | null {
    const result = analyzeSearchIntent(searchContext);
    return result.category;
}

export function analyzeSearchIntent(searchContext: SearchContext): SearchIntentResult {
    const queries = searchContext.queries;

    if (queries.length === 0) {
        return {
            category: null,
            brand: null,
            intent_type: 'browsing',
            price_sensitivity: 'neutral',
            confidence: 0,
        };
    }

    // Combine all search terms for analysis
    const allTerms = queries.map(q => q.query.toLowerCase()).join(' ');
    const words = allTerms.split(/\s+/).filter(w => w.length > 1);

    // Build word frequency map
    const wordFreq: Record<string, number> = {};
    for (const w of words) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
    }

    // Detect category
    let category: string | null = null;
    let categoryConfidence = 0;
    for (const word of words) {
        if (CATEGORY_MAP[word]) {
            category = CATEGORY_MAP[word];
            categoryConfidence = Math.min(0.9, 0.5 + (wordFreq[word] * 0.1));
            break;
        }
    }

    // Detect brand (more specific intent)
    let brand: string | null = null;
    for (const word of words) {
        if (BRAND_MAP[word]) {
            brand = BRAND_MAP[word].brand;
            if (!category) {
                category = BRAND_MAP[word].category;
            }
            categoryConfidence = Math.min(0.95, categoryConfidence + 0.2);
            break;
        }
    }

    // Detect price sensitivity
    let price_sensitivity: 'budget' | 'premium' | 'neutral' = 'neutral';
    if (BUDGET_SIGNALS.some(signal => allTerms.includes(signal))) {
        price_sensitivity = 'budget';
    } else if (PREMIUM_SIGNALS.some(signal => allTerms.includes(signal))) {
        price_sensitivity = 'premium';
    }

    // Determine intent type based on search patterns
    let intent_type: 'browsing' | 'specific_product' | 'comparison' | 'research' = 'browsing';

    // Specific product: has specs, model numbers, or brand + category
    const hasSpecs = SPECIFICITY_SIGNALS.some(signal => allTerms.includes(signal));
    if (hasSpecs || (brand && category)) {
        intent_type = 'specific_product';
    }

    // Comparison: multiple searches with "vs", "or", "compare", or 2+ different brands
    if (allTerms.includes('vs') || allTerms.includes('versus') || allTerms.includes('compare') || allTerms.includes(' or ')) {
        intent_type = 'comparison';
    }

    // Research: queries like "best", "review", "which"
    if (allTerms.includes('best') || allTerms.includes('review') || allTerms.includes('which') || allTerms.includes('recommend')) {
        intent_type = 'research';
    }

    // Browsing: short generic queries with no results
    const failedQueries = queries.filter(q => q.results_count === 0);
    if (failedQueries.length >= 2 && !hasSpecs && !brand) {
        intent_type = 'browsing';
    }

    // Generate suggested filters based on detected patterns
    const suggested_filters: string[] = [];
    if (brand) suggested_filters.push(`brand:${brand}`);
    if (price_sensitivity === 'budget') suggested_filters.push('price:low-to-high');
    if (price_sensitivity === 'premium') suggested_filters.push('price:high-to-low');

    // Calculate overall confidence
    let confidence = categoryConfidence;
    if (brand) confidence = Math.min(0.95, confidence + 0.15);
    if (queries.length > 2) confidence = Math.min(0.95, confidence + 0.1);
    if (failedQueries.length > 0) confidence = Math.max(0.3, confidence - 0.1);

    return {
        category,
        brand,
        intent_type,
        price_sensitivity,
        confidence,
        suggested_filters: suggested_filters.length > 0 ? suggested_filters : undefined,
    };
}

// Helper: Get the most likely category from failed searches
export function getCategorySuggestion(searchContext: SearchContext): string | null {
    const failedQueries = searchContext.queries.filter(q => q.results_count === 0);

    if (failedQueries.length === 0) return null;

    // Extract all words from failed queries
    const allWords = failedQueries
        .flatMap(q => q.query.toLowerCase().split(/\s+/))
        .filter(w => w.length > 2);

    // Count occurrences
    const wordFreq: Record<string, number> = {};
    for (const w of allWords) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
    }

    // Find best category match
    for (const [word, count] of Object.entries(wordFreq).sort((a, b) => b[1] - a[1])) {
        if (CATEGORY_MAP[word]) {
            return CATEGORY_MAP[word];
        }
        if (BRAND_MAP[word]) {
            return BRAND_MAP[word].category;
        }
    }

    return null;
}

// ============================================================
// 6.3.1 Exit Intent
// ============================================================

export function resolveExitIntentContext(
    productContext: ProductContext,
    cartContext: CartContext
): InterventionContext {
    // Priority 1: Highest value cart item
    if (cartContext.items.length > 0) {
        const sorted = [...cartContext.items].sort((a, b) => b.total_price - a.total_price);
        return {
            product: sorted[0],
            cart_items: cartContext.items,
            message_type: 'cart_save',
        };
    }

    // Priority 2: Last viewed product (within 60s)
    if (productContext.last_product) {
        const timeSince = Date.now() - productContext.last_product.last_interaction;
        if (timeSince < 60000) {
            return {
                product: productContext.last_product,
                message_type: 'product_save',
            };
        }
    }

    // Priority 3: Generic
    return {
        product: null,
        message_type: 'generic',
    };
}

// ============================================================
// 6.3.2 Price Sensitivity
// ============================================================

export function resolvePriceSensitivityContext(
    productContext: ProductContext
): InterventionContext {
    return {
        product: productContext.current_product || null,
        message_type: 'price_justification',
    };
}

// ============================================================
// 6.3.3 Search Frustration
// ============================================================

export function resolveSearchFrustrationContext(
    searchContext: SearchContext
): InterventionContext {
    const analysis = analyzeSearchIntent(searchContext);
    const lastQuery = searchContext.queries.length > 0
        ? searchContext.queries[searchContext.queries.length - 1].query
        : '';

    // Determine the best message type based on intent analysis
    let message_type = 'generic_help';
    if (analysis.category) {
        message_type = 'category_suggestion';
    } else if (analysis.brand) {
        message_type = 'brand_suggestion';
    } else if (analysis.intent_type === 'comparison') {
        message_type = 'comparison_help';
    }

    return {
        last_query: lastQuery,
        suggested_category: analysis.category,
        suggested_brand: analysis.brand,
        intent_type: analysis.intent_type,
        price_sensitivity: analysis.price_sensitivity,
        suggested_filters: analysis.suggested_filters,
        confidence: analysis.confidence,
        message_type,
    };
}

// ============================================================
// 6.3.4 Specs Confusion
// ============================================================

export function resolveSpecsConfusionContext(
    productContext: ProductContext
): InterventionContext {
    return {
        product: productContext.current_product || null,
        message_type: 'spec_clarification',
    };
}

// ============================================================
// 6.3.5 Indecision
// ============================================================

export function resolveIndecisionContext(
    comparisonContext: ComparisonContext
): InterventionContext {
    const products = Array.from(comparisonContext.products.values());
    products.sort((a, b) => b.view_count - a.view_count);

    const top2 = products.slice(0, 2);
    return {
        products: top2,
        message_type: 'comparison_help',
    };
}

// ============================================================
// 6.3.6 Comparison Loop
// ============================================================

export function resolveComparisonLoopContext(
    productContext: ProductContext
): InterventionContext {
    return {
        product: productContext.current_product || null,
        message_type: 'price_match',
    };
}

// ============================================================
// 6.3.7 High Interest Stalling
// ============================================================

export function resolveHighInterestStallingContext(
    productContext: ProductContext
): InterventionContext {
    const product = productContext.current_product;
    return {
        product: product || null,
        stock_level: null,
        recent_purchases: null,
        time_spent_ms: product ? Date.now() - product.focus_start : 0,
        message_type: 'urgency_nudge',
    };
}

// ============================================================
// 6.3.8 Checkout Hesitation
// ============================================================

export function resolveCheckoutHesitationContext(
    event: UserEvent,
    cartContext: CartContext,
    frictionContext?: { evidence?: string[]; context?: any }
): InterventionContext {
    const fieldName = event.payload?.field_name || '';
    const evidence = frictionContext?.evidence || [];
    const ctx = frictionContext?.context || {};

    // Base context with evidence and cart info
    const baseContext: InterventionContext = {
        message_type: 'generic_checkout_help',
        field_name: fieldName,
        evidence: evidence,
        cart_items: cartContext.items,
        cart_value: cartContext.total_value,
        cart_count: cartContext.item_count,
    };

    // Add friction-specific context
    if (ctx.field_name) baseContext.field_name = ctx.field_name;
    if (ctx.idle_duration_ms) baseContext.idle_duration_ms = ctx.idle_duration_ms;
    if (ctx.time_since_checkout_ms) baseContext.time_since_checkout_ms = ctx.time_since_checkout_ms;
    if (ctx.shipping_views) baseContext.shipping_views = ctx.shipping_views;
    if (ctx.payment_views) baseContext.payment_views = ctx.payment_views;
    if (ctx.payment_method) baseContext.payment_method = ctx.payment_method;
    if (ctx.viewing_time_ms) baseContext.viewing_time_ms = ctx.viewing_time_ms;
    if (ctx.cart_opens) baseContext.cart_opens = ctx.cart_opens;
    if (ctx.time_since_add_ms) baseContext.time_since_add_ms = ctx.time_since_add_ms;

    // Determine message type based on evidence
    const primaryEvidence = evidence[0] || '';

    if (primaryEvidence === 'shipping_indecision' || fieldName.includes('shipping')) {
        baseContext.message_type = 'shipping_help';
    } else if (primaryEvidence === 'payment_anxiety' || primaryEvidence === 'pre_order_hesitation' || fieldName.includes('payment') || fieldName.includes('card')) {
        baseContext.message_type = 'payment_security';
    } else if (primaryEvidence === 'cart_quick_close' || primaryEvidence === 'repeated_cart_viewing' || primaryEvidence === 'cart_abandonment_signal') {
        baseContext.message_type = 'cart_hesitation';
    } else if (primaryEvidence === 'checkout_form_idle' || primaryEvidence === 'checkout_field_hesitation' || primaryEvidence === 'checkout_no_progress') {
        baseContext.message_type = 'form_hesitation';
    }

    return baseContext;
}

// ============================================================
// 6.3.9 Navigation Confusion
// ============================================================

export function resolveNavigationConfusionContext(): InterventionContext {
    return { message_type: 'navigation_help' };
}

// ============================================================
// 6.3.10 Gift Anxiety
// ============================================================

export function resolveGiftAnxietyContext(): InterventionContext {
    return { message_type: 'gift_receipt' };
}

// ============================================================
// 6.3.11 Form Fatigue
// ============================================================

export function resolveFormFatigueContext(): InterventionContext {
    return { message_type: 'autofill_suggestion' };
}

// ============================================================
// 6.3.12 Doom Scrolling
// ============================================================

export function resolveDoomScrollingContext(): InterventionContext {
    return { message_type: 'search_assist' };
}

// ============================================================
// 6.3.13 Trust Gap
// ============================================================

export function resolveTrustGapContext(userLocation?: string): InterventionContext {
    return {
        user_location: userLocation || 'your area',
        message_type: 'verification_badge',
    };
}

// ============================================================
// Master resolver
// ============================================================

export function resolveContext(
    frictionType: string,
    event: UserEvent,
    productContext: ProductContext,
    cartContext: CartContext,
    comparisonContext: ComparisonContext,
    searchContext: SearchContext,
    frictionContext?: { evidence?: string[]; context?: any }
): InterventionContext {
    switch (frictionType) {
        case 'exit_intent':
            return resolveExitIntentContext(productContext, cartContext);
        case 'price_sensitivity':
            return resolvePriceSensitivityContext(productContext);
        case 'search_frustration':
            return resolveSearchFrustrationContext(searchContext);
        case 'specs_confusion':
            return resolveSpecsConfusionContext(productContext);
        case 'indecision':
            return resolveIndecisionContext(comparisonContext);
        case 'comparison_loop':
            return resolveComparisonLoopContext(productContext);
        case 'high_interest_stalling':
            return resolveHighInterestStallingContext(productContext);
        case 'checkout_hesitation':
            return resolveCheckoutHesitationContext(event, cartContext, frictionContext);
        case 'navigation_confusion':
            return resolveNavigationConfusionContext();
        case 'gift_anxiety':
            return resolveGiftAnxietyContext();
        case 'form_fatigue':
            return resolveFormFatigueContext();
        case 'visual_doom_scrolling':
            return resolveDoomScrollingContext();
        case 'trust_gap':
            return resolveTrustGapContext();
        default:
            return { message_type: 'generic' };
    }
}
