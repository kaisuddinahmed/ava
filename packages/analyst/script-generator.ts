import type { FrictionType, InterventionUIType } from '../shared/types';
import type { InterventionContext } from './context-resolvers';

// ============================================================
// Result type
// ============================================================

export interface GeneratedIntervention {
    script: string;
    ui_type: InterventionUIType;
}

// ============================================================
// Friction → UI Type mapping
// ============================================================

const FRICTION_UI_MAP: Record<FrictionType, InterventionUIType> = {
    exit_intent: 'popup_product_card',
    price_sensitivity: 'popup_product_card',
    search_frustration: 'voice_only',
    specs_confusion: 'popup_small',
    indecision: 'popup_comparison',
    comparison_loop: 'popup_product_card',
    high_interest_stalling: 'popup_product_card',
    checkout_hesitation: 'voice_only',
    navigation_confusion: 'voice_only',
    gift_anxiety: 'popup_custom',
    form_fatigue: 'popup_small',
    visual_doom_scrolling: 'voice_only',
    trust_gap: 'popup_custom',
};

// ============================================================
// 6.3.1 Exit Intent (3 stages)
// Stage 1: Helpful - save for later
// Stage 2: Persuasive - urgency/scarcity
// Stage 3: Offer - discount code
// ============================================================

function generateExitIntentScript(ctx: InterventionContext, stage: number = 1): GeneratedIntervention {
    const productName = ctx.product?.product_name || 'item';
    let script: string;

    if (stage === 1) {
        // Helpful - save suggestion
        switch (ctx.message_type) {
            case 'cart_save':
                script = `Wait! Save the ${productName} to your Wishlist and we'll notify you if the price drops.`;
                break;
            case 'product_save':
                script = `Don't go yet! Save the ${productName} to your Wishlist so you don't lose it.`;
                break;
            default:
                script = `Before you go, would you like to save your favorites? We'll notify you of any price drops.`;
        }
    } else if (stage === 2) {
        // Persuasive - urgency/social proof
        if (ctx.cart_total && ctx.cart_total > 0) {
            script = `Your cart ($${ctx.cart_total.toFixed(2)}) is waiting! Complete your order now — these items are popular and may sell out.`;
        } else {
            script = `The ${productName} is one of our bestsellers — 47 people are viewing it right now.`;
        }
    } else {
        // Offer - discount
        if (ctx.cart_total && ctx.cart_total > 50) {
            script = `Wait! Here's 10% off your order: EXIT10. Your cart is worth keeping!`;
        } else {
            script = `Before you go — here's free shipping on your order: FREESHIP. Complete your purchase now!`;
        }
    }

    return { script, ui_type: 'popup_product_card' };
}

// ============================================================
// 6.3.2 Price Sensitivity (3 stages)
// Stage 1: Helpful - value proposition
// Stage 2: Persuasive - comparison/justification
// Stage 3: Offer - discount code
// ============================================================

function generatePriceSensitivityScript(ctx: InterventionContext, stage: number = 1): GeneratedIntervention {
    const productName = ctx.product?.product_name || 'this item';
    const price = ctx.product?.product_price;
    let script: string;

    if (stage === 1) {
        // Helpful - highlight value
        script = `The ${productName} includes a 2-year warranty, free returns, and free shipping. Great value for the quality!`;
    } else if (stage === 2) {
        // Persuasive - justify the price
        if (price && price > 100) {
            script = `The ${productName} pays for itself! Customers report using it daily for 3+ years. That's less than $${(price / 1000).toFixed(2)} per day.`;
        } else {
            script = `${productName} is rated 4.8/5 stars by verified buyers. Quality that lasts — you won't need to replace it.`;
        }
    } else {
        // Offer - discount
        script = `Here's 10% off the ${productName} if you buy now: SAVE10. This code expires in 30 minutes!`;
    }

    return { script, ui_type: 'popup_product_card' };
}

// ============================================================
// 6.3.3 Search Frustration
// ============================================================

function generateSearchFrustrationScript(ctx: InterventionContext): GeneratedIntervention {
    let script: string;
    let ui_type: InterventionUIType = 'voice_only';

    // Enhanced script generation based on search intent analysis
    if (ctx.message_type === 'category_suggestion' && ctx.suggested_category) {
        // We identified a category - offer to show it
        if (ctx.suggested_brand) {
            script = `Looking for ${ctx.suggested_brand} ${ctx.suggested_category}? Let me show you our ${ctx.suggested_brand} collection!`;
        } else {
            script = `Can't find "${ctx.last_query}"? I can show you our ${ctx.suggested_category} collection instead.`;
        }
    } else if (ctx.message_type === 'brand_suggestion' && ctx.suggested_brand) {
        // We identified a brand - offer brand-specific help
        script = `Looking for ${ctx.suggested_brand} products? Let me show you everything we have from ${ctx.suggested_brand}.`;
    } else if (ctx.message_type === 'comparison_help') {
        // User seems to be comparing - offer comparison help
        script = `Looking to compare options? Tell me what features matter most and I'll help you find the best match.`;
    } else if (ctx.intent_type === 'specific_product') {
        // User has a specific product in mind - offer direct assistance
        script = `Can't find what you're looking for? I can help track down that specific item or find a similar alternative.`;
    } else if (ctx.intent_type === 'research') {
        // User is researching - offer guidance
        script = `Doing some research? I can help you narrow down the options. What matters most to you — price, features, or brand?`;
    } else if (ctx.price_sensitivity === 'budget') {
        // User seems budget-conscious
        script = `Looking for a deal? Let me show you our best value options or current sale items.`;
    } else if (ctx.price_sensitivity === 'premium') {
        // User seems to want premium options
        script = `Looking for the best quality? Let me show you our top-rated premium options.`;
    } else {
        // Generic help
        script = `Having trouble finding something? Just tell me what you need and I'll help you find it.`;
    }

    // Use popup_small for higher-confidence suggestions
    if (ctx.confidence && ctx.confidence > 0.7) {
        ui_type = 'popup_small';
    }

    return { script, ui_type };
}

// ============================================================
// 6.3.4 Specs Confusion
// ============================================================

function generateSpecsConfusionScript(ctx: InterventionContext): GeneratedIntervention {
    const productName = ctx.product?.product_name || 'this product';
    const script = `Wondering if this fits your needs? The ${productName} has great specs — let me highlight the key features for you.`;
    return { script, ui_type: 'popup_small' };
}

// ============================================================
// 6.3.5 Indecision (2 stages)
// Stage 1: Helpful - offer comparison
// Stage 2: Persuasive - make recommendation
// ============================================================

function generateIndecisionScript(ctx: InterventionContext, stage: number = 1): GeneratedIntervention {
    const p1 = ctx.products?.[0];
    const p2 = ctx.products?.[1];
    const name1 = p1?.product_name || 'Product A';
    const name2 = p2?.product_name || 'Product B';
    let script: string;

    if (stage === 1) {
        // Helpful - comparison offer
        script = `Stuck between the ${name1} and ${name2}? Here's a quick comparison to help you decide.`;
    } else {
        // Persuasive - make a recommendation
        const price1 = p1?.product_price || 0;
        const price2 = p2?.product_price || 0;
        if (price1 > price2) {
            script = `Quick tip: The ${name1} is our most popular choice — customers love the premium features. The ${name2} is great if you're on a budget.`;
        } else {
            script = `My recommendation: The ${name2} offers the best value for most customers. Want me to add it to your cart?`;
        }
    }

    return { script, ui_type: 'popup_comparison' };
}

// ============================================================
// 6.3.6 Comparison Loop (2 stages)
// Stage 1: Helpful - price match offer
// Stage 2: Persuasive - urgency + guarantee
// ============================================================

function generateComparisonLoopScript(ctx: InterventionContext, stage: number = 1): GeneratedIntervention {
    const productName = ctx.product?.product_name || 'this item';
    let script: string;

    if (stage === 1) {
        // Helpful - price match
        script = `We price match! Found the ${productName} cheaper elsewhere? Let us know and we'll match it right now.`;
    } else {
        // Persuasive - urgency + guarantee
        script = `Stop searching! Buy the ${productName} here with our 30-day lowest price guarantee. If you find it cheaper within 30 days, we'll refund the difference.`;
    }

    return { script, ui_type: 'popup_product_card' };
}

// ============================================================
// 6.3.7 High Interest Stalling (3 stages)
// Stage 1: Helpful - social proof/popularity
// Stage 2: Persuasive - urgency/scarcity
// Stage 3: Offer - limited time deal
// ============================================================

function generateHighInterestStallingScript(ctx: InterventionContext, stage: number = 1): GeneratedIntervention {
    const productName = ctx.product?.product_name || 'this item';
    let script: string;

    if (stage === 1) {
        // Helpful - social proof
        if (ctx.recent_purchases && ctx.recent_purchases >= 10) {
            script = `Great choice! ${ctx.recent_purchases} people bought the ${productName} today.`;
        } else {
            script = `The ${productName} is a popular item with a 4.8★ rating. Want to know more?`;
        }
    } else if (stage === 2) {
        // Persuasive - urgency/scarcity
        if (ctx.stock_level && ctx.stock_level <= 3) {
            script = `Heads up! Only ${ctx.stock_level} left of the ${productName}. It sells out fast — don't miss it!`;
        } else {
            script = `${productName} is trending! 23 people added it to cart in the last hour. Grab yours before it's gone.`;
        }
    } else {
        // Offer - time-limited deal
        script = `Add the ${productName} to cart now and get free express shipping! Offer ends in 15 minutes.`;
    }

    return { script, ui_type: 'popup_product_card' };
}

// ============================================================
// 6.3.8 Checkout Hesitation (2 stages)
// Stage 1: Helpful - reassurance
// Stage 2: Persuasive - urgency + incentive
// ============================================================

function generateCheckoutHesitationScript(ctx: InterventionContext, stage: number = 1): GeneratedIntervention {
    let script: string;
    let ui_type: InterventionUIType = 'voice_only';

    // Determine the specific type of checkout friction from evidence
    const evidence = ctx.evidence?.[0] || 'generic';

    if (stage === 1) {
        // Helpful - reassurance based on specific friction pattern
        switch (evidence) {
            case 'checkout_form_idle':
            case 'checkout_field_hesitation':
                // User stuck on a form field
                const fieldName = ctx.field_name || 'this field';
                script = `Need help with ${fieldName}? Take your time - your cart is saved. Let me know if you have any questions!`;
                break;

            case 'checkout_no_progress':
                // Started checkout but not filling form
                script = `I noticed you started checkout. Need any help? All our orders come with free returns and 24/7 support.`;
                break;

            case 'shipping_indecision':
                // Hovering over shipping options
                script = `Not sure which shipping to pick? Standard is our most popular - arrives in 3-5 days. Express gets it there in 1-2!`;
                ui_type = 'popup_small';
                break;

            case 'payment_anxiety':
                // Viewing payment methods repeatedly
                script = `Your payment is 100% secure. We use bank-level encryption and never store your card details. Cash on delivery also available!`;
                ui_type = 'popup_small';
                break;

            case 'pre_order_hesitation':
                // Selected payment but hesitating to place order
                script = `Ready to complete your order? Remember, you can return anything within 30 days - no questions asked.`;
                break;

            case 'cart_quick_close':
                // Opened cart, closed it quickly
                script = `Changed your mind? No worries! Your items are saved. Let me know if you have any questions about them.`;
                break;

            case 'repeated_cart_viewing':
                // Opening cart multiple times without checkout
                const cartValue = ctx.cart_value ? `$${ctx.cart_value.toFixed(2)}` : 'your items';
                script = `I see you're thinking about ${cartValue}. Would you like me to walk you through the checkout process?`;
                break;

            case 'cart_abandonment_signal':
                // Added to cart but no activity
                script = `Still interested? Your cart items are waiting! Let me know if you need help deciding.`;
                break;

            case 'shipping_help':
                script = `Standard shipping takes 3-5 days. Need it faster? Upgrade for just $2 more.`;
                break;

            case 'payment_security':
                script = `Checkout is secure with 256-bit encryption. Your payment info is safe with us.`;
                break;

            default:
                script = `Need help with checkout? I'm here to assist. All orders include free returns!`;
        }
    } else {
        // Stage 2: Persuasive - urgency + incentive
        switch (evidence) {
            case 'shipping_indecision':
                script = `Can't decide on shipping? Order in the next 10 minutes and I'll upgrade you to Express for free!`;
                ui_type = 'popup_small';
                break;

            case 'payment_anxiety':
            case 'pre_order_hesitation':
                script = `Complete your order now and get an exclusive 5% off your next purchase. Your items are reserved for 10 minutes!`;
                ui_type = 'popup_small';
                break;

            case 'cart_quick_close':
            case 'repeated_cart_viewing':
            case 'cart_abandonment_signal':
                if (ctx.cart_value && ctx.cart_value > 100) {
                    script = `You have great taste! Complete your order now and get free express shipping on your $${ctx.cart_value.toFixed(0)}+ order.`;
                } else {
                    script = `Your cart is calling! Complete checkout in the next 10 minutes and get a surprise discount.`;
                }
                ui_type = 'popup_product_card';
                break;

            default:
                if (ctx.cart_total && ctx.cart_total > 50) {
                    script = `You're so close! Complete your order now and get free expedited shipping. Your items are reserved for 10 minutes.`;
                } else {
                    script = `Almost there! Your cart is reserved for 10 minutes. Complete now to lock in today's prices.`;
                }
        }
    }

    return { script, ui_type };
}

// ============================================================
// 6.3.9 Navigation Confusion
// ============================================================

function generateNavigationConfusionScript(_ctx: InterventionContext): GeneratedIntervention {
    return {
        script: `Looking for something specific? You can tell me, I can take you there.`,
        ui_type: 'voice_only',
    };
}

// ============================================================
// 6.3.10 Gift Anxiety
// ============================================================

function generateGiftAnxietyScript(_ctx: InterventionContext): GeneratedIntervention {
    return {
        script: `Buying a gift? We offer a 'Digital Gift Receipt' so they can swap the size/color instantly before we even ship it. No awkward returns.`,
        ui_type: 'popup_custom',
    };
}

// ============================================================
// 6.3.11 Form Fatigue
// ============================================================

function generateFormFatigueScript(_ctx: InterventionContext): GeneratedIntervention {
    return {
        script: `Skip the typing. Use Apple Pay / Google Pay to autofill everything in one click.`,
        ui_type: 'popup_small',
    };
}

// ============================================================
// 6.3.12 Doom Scrolling
// ============================================================

function generateDoomScrollingScript(_ctx: InterventionContext): GeneratedIntervention {
    return {
        script: `Do you need any help finding a specific product?`,
        ui_type: 'voice_only',
    };
}

// ============================================================
// 6.3.13 Trust Gap
// ============================================================

function generateTrustGapScript(ctx: InterventionContext): GeneratedIntervention {
    const location = ctx.user_location || 'your area';
    return {
        script: `Verified: We've shipped 5,000+ orders to ${location} this month. Rated 4.9/5 on Trustpilot.`,
        ui_type: 'popup_custom',
    };
}

// ============================================================
// Master Generator
// ============================================================

export function generateScript(
    frictionType: FrictionType,
    context: InterventionContext,
    stage: number = 1
): GeneratedIntervention {
    switch (frictionType) {
        // Multi-stage frictions (3 stages)
        case 'exit_intent':
            return generateExitIntentScript(context, stage);
        case 'price_sensitivity':
            return generatePriceSensitivityScript(context, stage);
        case 'high_interest_stalling':
            return generateHighInterestStallingScript(context, stage);

        // Multi-stage frictions (2 stages)
        case 'indecision':
            return generateIndecisionScript(context, stage);
        case 'comparison_loop':
            return generateComparisonLoopScript(context, stage);
        case 'checkout_hesitation':
            return generateCheckoutHesitationScript(context, stage);

        // Single-stage frictions
        case 'search_frustration':
            return generateSearchFrustrationScript(context);
        case 'specs_confusion':
            return generateSpecsConfusionScript(context);
        case 'navigation_confusion':
            return generateNavigationConfusionScript(context);
        case 'gift_anxiety':
            return generateGiftAnxietyScript(context);
        case 'form_fatigue':
            return generateFormFatigueScript(context);
        case 'visual_doom_scrolling':
            return generateDoomScrollingScript(context);
        case 'trust_gap':
            return generateTrustGapScript(context);
        default:
            return {
                script: 'Need any help? I\'m here to assist.',
                ui_type: FRICTION_UI_MAP[frictionType] || 'voice_only',
            };
    }
}
