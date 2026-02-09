# Friction Scenarios — Developer Reference

### AI-Powered Virtual Shopping Assistant — Backend Behavior Engine

### Format: `friction_id` | `category` | `scenario` | `detection_signal` | `ai_action`

---

## CATEGORY 01: LANDING & FIRST IMPRESSION FRICTION

```
F001 | landing | Slow page load on entry | page_load_time > 3s | Show skeleton loader + "Almost there" message
F002 | landing | Bounce within 5 seconds | session_duration < 5s AND pages_viewed == 1 | Trigger exit-intent overlay with value prop
F003 | landing | Lands on 404 / broken page | http_status == 404 | Redirect to smart search with original query parsed
F004 | landing | Lands on out-of-stock product (from ad/email) | landing_page == product AND stock == 0 | Show alternatives + back-in-stock signup
F005 | landing | Geo-mismatch (wrong currency/language) | geo_ip != store_locale | Auto-suggest correct locale/currency switch
F006 | landing | Mobile user on non-responsive page | device == mobile AND viewport_mismatch == true | Trigger mobile-optimized overlay or redirect
F007 | landing | First-time visitor with no context | is_new_visitor == true AND referrer == direct | Show welcome guide / category highlights
F008 | landing | Lands from price comparison site | referrer contains comparison_site_domain | Emphasize price match guarantee + free shipping
F009 | landing | Popup/modal blocks content immediately | modal_shown_at < 2s AND close_click_time == null | Delay popup, or auto-dismiss after 3s
F010 | landing | Cookie consent banner covers key CTA | consent_banner == visible AND cta_obscured == true | Minimize banner, float consent as bottom bar
F011 | landing | Aggressive popup triggers immediate exit | popup_shown AND exit_within < 3s | Suppress popup for this user segment going forward
F012 | landing | Promotional banner links to expired offer | click_target == promo_banner AND offer_expired == true | Show updated offer or nearest active promotion
```

---

## CATEGORY 02: NAVIGATION & DISCOVERY FRICTION

```
F013 | navigation | Can't find category (excessive menu depth) | menu_hover_count > 5 AND no_click | Surface AI search prompt: "Looking for something?"
F014 | navigation | Clicks wrong category, immediately backtracks | page_back_within < 3s | Show breadcrumb trail + "Did you mean…?" suggestions
F015 | navigation | Scrolls entire page without clicking anything | scroll_depth == 100% AND click_count == 0 | Trigger floating assistant: "Need help finding something?"
F016 | navigation | Uses browser back button repeatedly | back_button_count >= 3 in 60s | Show persistent navigation sidebar or sticky category menu
F017 | navigation | Dead-end page (no next action visible) | page_has_no_cta == true AND dwell_time > 10s | Inject recommended products or related categories
F018 | navigation | Excessive filter usage with no results | filter_applied_count >= 4 AND results == 0 | Suggest relaxing filters, show nearest matches
F019 | navigation | Filter combination returns 0 results | applied_filters result_count == 0 | Show "No exact match" + auto-suggest closest results
F020 | navigation | Pogo-sticking (repeatedly entering and leaving pages) | page_enter_exit_loop >= 3 | Ask "Not finding what you need?" + offer guided search
F021 | navigation | Hamburger menu not discovered (mobile) | time_on_page > 30s AND menu_opened == false AND scroll_depth > 50% | Highlight menu icon with subtle animation/tooltip
F022 | navigation | Breadcrumb not used, user is lost | page_depth > 4 AND breadcrumb_click == 0 AND back_button > 2 | Show floating "Back to [Category]" shortcut
F023 | navigation | Clicked non-clickable element | dead_click == true on image/text/banner | Make element clickable or show tooltip: "Click here for details"
F024 | navigation | Category page has too many products (overwhelm) | category_product_count > 100 AND scroll_depth < 20% AND exit == true | Suggest sub-filters or "Shop by" curated collections
F025 | navigation | User clicks logo repeatedly | logo_click_count >= 2 in 30s | Possible frustration signal — offer help or reset journey
F026 | navigation | Horizontal scroll on mobile (broken layout) | horizontal_scroll_detected == true AND device == mobile | Flag layout issue; show "Try our app" or simplified view
F027 | navigation | Footer links used as primary navigation | footer_nav_click_count > 2 AND main_nav_click == 0 | Improve main nav visibility; surface popular links higher
```

---

## CATEGORY 03: SEARCH FRICTION

```
F028 | search | Search returns zero results | search_query AND result_count == 0 | Show "Did you mean…?" + popular products + AI suggestions
F029 | search | Misspelled search query | search_query fuzzy_match_score < 0.7 | Auto-correct with "Showing results for [corrected]"
F030 | search | Vague/generic search term | search_query word_count == 1 AND result_count > 200 | Show category disambiguation: "Are you looking for…?"
F031 | search | Multiple refined searches (3+ in session) | search_count >= 3 AND purchase == false | Trigger AI assistant: "Let me help you find the right product"
F032 | search | Search results irrelevant to query | search_query vs results relevance_score < 0.4 | Offer "Did you mean?" + human chat handoff
F033 | search | Searched but didn't click any result | search_completed AND result_click == 0 | Resurface results with better visual layout / filters
F034 | search | Searched for competitor product/brand | search_query matches competitor_brand_list | Show equivalent own-brand product with comparison
F035 | search | Searched for coupon/discount/promo code | search_query contains ["coupon","discount","promo","deal"] | Surface active promotions or signup-for-discount offer
F036 | search | Searched for return/refund/cancel | search_query contains ["return","refund","cancel","exchange"] | Proactive support: "Need help with an order?" + link to policy
F037 | search | Search autocomplete ignored | autocomplete_shown == true AND autocomplete_selected == false | Improve autocomplete relevance; test visual prominence
F038 | search | Voice search failed / not recognized | voice_search_initiated AND result == error | Fallback to text search with pre-filled partial query
F039 | search | Image/visual search returned poor matches | visual_search_initiated AND result_click == 0 | Offer text-based refinement: "Describe what you're looking for"
F040 | search | Searched for product that exists but is hidden/unlisted | search_query matches unlisted_product | Review catalog visibility; show related available products
F041 | search | Repeated identical search across sessions | same_search_query across session_count >= 2 | Proactive notification: "Still looking for [X]? Here's what's new"
```

---

## CATEGORY 04: PRODUCT PAGE FRICTION

```
F042 | product | Viewed product page but left quickly (<10s) | pdp_dwell_time < 10s AND add_to_cart == false | Log as low engagement; retarget with product highlights
F043 | product | Long dwell on product page, no action (>3min) | pdp_dwell_time > 180s AND add_to_cart == false | Trigger "Have questions? Chat with us" or show social proof
F044 | product | Viewed product multiple times across sessions | pdp_view_count >= 3 across sessions AND purchase == false | Show price drop alert signup or limited-time incentive
F045 | product | Scrolled to reviews but bounced after reading | scroll_to_reviews == true AND exit_after_reviews == true | Proactively surface positive reviews; offer comparison
F046 | product | Read mostly negative reviews | review_scroll_focus == negative_reviews | Show brand response to concerns; offer guarantee/warranty info
F047 | product | Zoomed into product images repeatedly | image_zoom_count >= 3 | Offer 360° view, video, or AR try-on if available
F048 | product | Size/variant selector interacted but not confirmed | variant_change_count >= 3 AND add_to_cart == false | Show size guide, fit recommendations, or "Ask about sizing" chat
F049 | product | Size guide opened but user still didn't add to cart | size_guide_viewed == true AND add_to_cart == false within 60s | Offer "Still unsure? Our fit assistant can help" + easy returns note
F050 | product | Product description not scrolled to | description_in_viewport == false AND exit == true | Move key info above fold; add quick-view summary
F051 | product | Checked shipping info, then left | shipping_info_viewed == true AND exit_within < 30s | Shipping cost may be the blocker — offer free shipping threshold
F052 | product | Checked return policy, then left | return_policy_viewed == true AND exit_within < 30s | Emphasize "hassle-free returns" with trust badge on product page
F053 | product | Out-of-stock product viewed | stock_status == 0 AND pdp_viewed == true | Back-in-stock alert + show similar available products
F054 | product | Low stock but user didn't act | stock_count <= 3 AND add_to_cart == false AND dwell > 30s | Show urgency: "Only [X] left" with social proof
F055 | product | Compared variants but chose none | variant_comparison_count >= 2 AND add_to_cart == false | Offer quick comparison table or "Most popular choice" badge
F056 | product | Clicked on product from recommendation but left | source == recommendation AND pdp_exit_within < 15s | Recommendation may be off — refine algorithm for this user
F057 | product | Product video not played (exists but ignored) | video_available == true AND video_play == false | Auto-play muted preview or move video higher on page
F058 | product | Hovered over "Add to Cart" but didn't click | hover_atc_button == true AND click_atc == false within 10s | Micro-nudge: tooltip with "Free shipping" or "Easy returns"
F059 | product | Price not visible without scrolling | price_in_viewport == false on page_load | Restructure layout; pin price near product title
F060 | product | User copied product title/price (comparison shopping) | copy_event on product_title OR price_element | Show price match guarantee or "Best price" badge
F061 | product | Clicked on a trust badge / certification for more info | trust_badge_click == true | Expand trust info inline; reinforce credibility
F062 | product | User tried to share product but feature missing/broken | share_button_click == error OR share_button_absent | Enable/fix social sharing; track share intent
F063 | product | Product page has no reviews | review_count == 0 | Show "Be the first to review" + industry/editorial endorsements
F064 | product | Specification/material info missing | spec_section == empty AND exit_within < 30s | Flag content gap; show AI-generated summary or chat option
F065 | product | Clicked multiple color swatches without adding to cart | swatch_click_count >= 4 AND add_to_cart == false | Show "See it in your space" AR or styled product photos per color
F066 | product | Viewed product bundle option but didn't select | bundle_viewed == true AND bundle_selected == false | Highlight savings amount; show "Popular bundle" social proof
F067 | product | Pricing feels unclear (multiple prices, strikethrough confusion) | price_area_hover_time > 5s OR rage_click on price | Clarify pricing: "You pay [X] — You save [Y]"
```

---

## CATEGORY 05: CART FRICTION

```
F068 | cart | Added to cart but didn't proceed to checkout | atc_event == true AND checkout_initiated == false within 600s | Trigger cart reminder notification or incentive
F069 | cart | Cart idle for extended period (>30 min in session) | cart_last_interaction > 1800s AND session_active == true | Gentle nudge: "Your cart is waiting" + item availability alert
F070 | cart | Removed item from cart | cart_remove_event == true | Ask "Why did you remove this?" (optional quick survey) or show alternative
F071 | cart | Removed item after seeing subtotal | cart_remove_event after subtotal_view within 10s | Price sensitivity detected — offer discount or show cheaper alternatives
F072 | cart | Cleared entire cart | cart_item_count from >0 to 0 | "Changed your mind?" — offer to save cart for later + ask for feedback
F073 | cart | Added then removed same item multiple times | item_add_remove_loop >= 2 | Hesitation detected — show social proof, reviews, or offer assistance
F074 | cart | Cart total exceeds user's apparent budget threshold | cart_total > user_avg_order_value * 2 AND hesitation_signals | Suggest breaking into multiple orders or show BNPL option
F075 | cart | Applied coupon code — rejected | coupon_attempt == true AND coupon_valid == false | Show valid alternatives: "Try these instead" or signup discount
F076 | cart | Tried multiple coupon codes (code hunting) | coupon_attempt_count >= 3 | Auto-apply best available discount or show "Best deal applied"
F077 | cart | Cart contains only sale items | cart_items all discount == true | Upsell with "Complete your look" full-price recommendations
F078 | cart | Cart contains items from different categories (gift shopping?) | cart_categories >= 3 AND distinct_sizes == true | Offer gift wrapping + "Shopping for someone?" prompt
F079 | cart | Cart item went out of stock | cart_item_stock_status changed to 0 | Notify immediately: "This item just sold out" + show equivalent
F080 | cart | Cart not synced across devices | user_logged_in == true AND cart_mismatch across devices | Force cart sync; notify user of merged cart
F081 | cart | Shipping cost revealed in cart (shock) | shipping_cost_shown AND cart_page_exit_within < 20s | Show free shipping threshold: "Add $X more for free shipping"
F082 | cart | Mini-cart doesn't show enough info | mini_cart_hover AND full_cart_page_click_immediately | Enhance mini-cart with product images, variant info, total
F083 | cart | Cart page loads slowly | cart_page_load_time > 3s | Optimize; show cached cart preview while loading
F084 | cart | User edits quantity up then back down | qty_increase then qty_decrease within 30s | Budget hesitation — show bundle deals or volume discounts
F085 | cart | Cart page has distracting upsell overload | upsell_sections > 3 AND checkout_button_below_fold | Reduce upsell noise; pin checkout CTA
F086 | cart | Estimated delivery date too far out | estimated_delivery_days > 7 AND exit == true | Offer express shipping option prominently
F087 | cart | Tax/duty amount surprises user | tax_calculated AND cart_page_exit_within < 15s | Show "Price includes all taxes" or pre-calculate at product level
F088 | cart | User returns to cart page 3+ times without checkout | cart_page_view_count >= 3 AND checkout == false | Strong intent signal — offer time-limited incentive
```

---

## CATEGORY 06: CHECKOUT FRICTION

```
F089 | checkout | Forced account creation blocks checkout | checkout_step == registration AND exit == true | Enable guest checkout; move registration to post-purchase
F090 | checkout | Checkout form too long (too many fields) | form_field_count > 12 AND form_completion_time > 120s | Reduce fields; auto-fill from address API; collapse optional fields
F091 | checkout | Form validation errors on submit | form_error_count >= 1 | Inline real-time validation; highlight errors clearly with fix suggestion
F092 | checkout | Repeated form validation errors (same field) | same_field_error_count >= 2 | Show specific help text for that field; offer chat support
F093 | checkout | Address auto-complete not working | address_autocomplete_fail == true | Fallback to manual entry with simplified fields
F094 | checkout | User pauses at payment information entry | payment_field_focus_time > 30s AND input == empty | Show security badges near payment fields; offer PayPal/wallet alternatives
F095 | checkout | Preferred payment method not available | payment_method_selected == null AND payment_page_exit | Add more payment options; show what's available upfront
F096 | checkout | Payment failed / declined | payment_status == declined | Show clear error message + alternative payment options + "Try again"
F097 | checkout | Multiple payment attempts failed | payment_attempt_count >= 2 AND status == failed | Offer alternative methods; provide customer support contact
F098 | checkout | 3D Secure / OTP verification failed | 3ds_status == failed | Explain why; offer to retry or use different card
F099 | checkout | Promo code field visible but no code to enter | promo_field_visible AND promo_field_focus AND exit within 60s | User leaves to hunt for codes — auto-apply best deal or hide empty field
F100 | checkout | Shipping options confusing (too many choices) | shipping_option_count > 4 AND selection_time > 45s | Pre-select recommended option; simplify to 2-3 choices
F101 | checkout | Checkout page redirects to third party (trust break) | checkout_redirect_to_external == true AND exit == true | Keep checkout in-domain; or show trust messaging for redirect
F102 | checkout | Progress indicator missing (user doesn't know how many steps) | checkout_steps > 2 AND progress_bar == false | Add step indicator: "Step 2 of 3"
F103 | checkout | User backtracks in checkout flow | checkout_step_backward == true | Something in current step caused doubt — review that step's UX
F104 | checkout | Billing address form when same as shipping | billing_form_shown AND same_as_shipping_checked == false | Default to "Same as shipping" pre-checked
F105 | checkout | Slow payment processing (spinner too long) | payment_processing_time > 10s | Show reassuring message: "Securely processing your payment…"
F106 | checkout | Order summary not visible during checkout | order_summary_visible == false on payment_step | Show persistent order summary sidebar/accordion
F107 | checkout | Unexpected fee added at final step | new_fee_shown_at_final_step == true | Reveal all costs earlier; show running total throughout
F108 | checkout | Gift option not available when needed | checkout_flow AND gift_option_absent AND cart_signals_gift | Add gift wrap / gift message option
F109 | checkout | BNPL option not prominent enough | bnpl_available == true AND bnpl_selection == 0 AND cart_value > $50 | Show BNPL installment amount on checkout: "Or pay $X/month"
F110 | checkout | Mobile keyboard covers form fields | device == mobile AND keyboard_overlap_detected | Ensure form scrolls above keyboard; auto-scroll to active field
F111 | checkout | Autofill populates wrong fields | autofill_mismatch_detected == true | Fix form field naming/autocomplete attributes
F112 | checkout | Checkout timeout / session expired | session_timeout during checkout_flow | Save cart state; allow instant resume with "Pick up where you left off"
F113 | checkout | Terms & conditions checkbox buried or confusing | tnc_checkbox_miss_count >= 1 | Make checkbox obvious; show brief summary instead of full legal text
F114 | checkout | Final "Place Order" button not prominent | place_order_button_below_fold OR low_contrast | Pin CTA; use high-contrast, large button
F115 | checkout | Currency mismatch at checkout | user_currency != checkout_currency | Auto-convert to user's currency or show dual prices
F116 | checkout | User toggles between shipping methods repeatedly | shipping_method_change >= 3 | Show delivery speed vs. cost comparison clearly
```

---

## CATEGORY 07: PRICING & VALUE FRICTION

```
F117 | pricing | Price higher than expected (sticker shock) | pdp_exit_within < 10s AND no_interaction | Show value justification, comparisons, or installment option
F118 | pricing | User checks price multiple times across sessions | price_view_count >= 3 across sessions | Trigger price drop alert or limited-time discount
F119 | pricing | Price discrepancy between listing and product page | listing_price != pdp_price | Fix data consistency; show "Price updated" explanation
F120 | pricing | Competitor price found lower (user left to compare) | session_exit AND return_from referrer == competitor | Price match offer or highlight unique value (warranty, shipping)
F121 | pricing | Total cost significantly higher than item price | total_cost > item_price * 1.3 (taxes/shipping) | Break down costs early; offer free shipping threshold
F122 | pricing | BNPL/installment info not shown on product page | bnpl_available == true AND bnpl_display_on_pdp == false | Show "As low as $X/month" on product page
F123 | pricing | Struck-through original price not credible | original_price display AND user_trust_signals low | Show "Price history" or "Verified discount" badge
F124 | pricing | Bulk/volume discount not communicated | qty > 1 potential AND volume_discount_exists AND not shown | Display tiered pricing table: "Buy 2, save 10%"
F125 | pricing | User compares similar products by price only | product_comparison focus == price_column | Highlight differentiating features beyond price
F126 | pricing | Free shipping threshold just out of reach | cart_total < free_shipping_min AND gap < 20% | "Add $X more for FREE shipping" with product suggestions
F127 | pricing | International pricing / duty confusion | user_geo == international AND duty_info_absent | Show landed cost calculator or "Duties included" assurance
F128 | pricing | Subscription price vs one-time price unclear | subscription_option AND one_time_option AND toggle_count >= 2 | Clarify savings: "Subscribe & save $X per month"
F129 | pricing | Sale countdown timer feels fake/manipulative | countdown_timer_displayed AND user_returns_after_expiry_and_sees_same_timer | Ensure genuine scarcity or remove; damages trust
F130 | pricing | Membership/loyalty discount not visible to eligible user | user_loyalty_tier > 0 AND member_price_hidden | Show "Your member price: $X" personalized pricing
```

---

## CATEGORY 08: TRUST & SECURITY FRICTION

```
F131 | trust | No SSL/security indicator visible | ssl_badge_absent AND checkout_page | Display security badges, SSL lock icon, PCI compliance
F132 | trust | User checks About Us / Company info before purchasing | about_page_viewed AND then checkout_hesitation | Strengthen About page; show social proof on checkout
F133 | trust | User reads privacy policy during checkout | privacy_policy_click during checkout_flow | Show privacy summary badge: "We never share your data"
F134 | trust | No customer reviews on product | review_count == 0 | Show editorial reviews, expert endorsements, or "Trusted by X customers"
F135 | trust | Only negative reviews visible (sorted by recent) | visible_reviews avg_rating < 3 | Default sort to "Most helpful"; show brand responses
F136 | trust | User searches for "[brand] reviews" or "[brand] scam" | search_query contains ["scam","legit","reviews","trustworthy"] | Surface trust signals: Trustpilot widget, guarantees, media mentions
F137 | trust | Payment page looks different from rest of site | payment_page_style_mismatch == true | Maintain consistent branding throughout checkout
F138 | trust | Third-party payment redirect without explanation | redirect_to_payment_gateway AND no_explanation | Show "You'll be redirected to [PayPal/Stripe] to complete securely"
F139 | trust | Missing return/refund policy information | return_policy_page == absent OR not_linked_from_pdp | Add visible return policy link on every product page and cart
F140 | trust | User hovers on security badge for details | trust_badge_hover_time > 2s | Expand tooltip with certification details
F141 | trust | New brand / user has never purchased before | user_order_count == 0 AND checkout_page | Show first-order guarantee, satisfaction promise, easy return
F142 | trust | Social proof missing (no purchase count, no testimonials) | social_proof_elements == 0 on pdp | Add "X people bought this" or recent purchase notifications
F143 | trust | User visited third-party review site during session | tab_switch_to review_site_detected | Show aggregated review score on-site; link to verified reviews
F144 | trust | Contact information hard to find | contact_page_search OR footer_scan_for_contact | Make phone/email/chat visible in header or floating widget
F145 | trust | Fake urgency / dark pattern detected by user | urgency_element AND bounce_correlation_high | Remove manipulative elements; use genuine scarcity only
F146 | trust | International buyer worried about legitimacy | user_geo == international AND multiple trust_page_views | Show international shipping partners, customs support, local reviews
```

---

## CATEGORY 09: MOBILE-SPECIFIC FRICTION

```
F147 | mobile | Fat finger / misclick on mobile | unintended_click_detected (click on wrong element) | Increase touch target sizes; add confirmation for critical actions
F148 | mobile | Pinch-to-zoom required (text/images too small) | pinch_zoom_event_count >= 2 | Optimize responsive design; ensure readable font sizes
F149 | mobile | Sticky header/footer covers content | scroll_with_header_overlap > 30% viewport | Reduce sticky element height; auto-hide on scroll down
F150 | mobile | Form input difficult on mobile | form_field_focus AND keyboard_type_mismatch | Use correct input types (tel, email, number) for proper keyboard
F151 | mobile | Horizontal scrolling required | horizontal_scroll_detected | Fix responsive breakpoints; prevent overflow
F152 | mobile | Pop-up/modal hard to close on mobile | modal_shown AND close_button_too_small AND rage_click | Increase close button size; add tap-outside-to-dismiss
F153 | mobile | Page jumps during load (CLS issues) | cumulative_layout_shift > 0.25 | Reserve space for ads/images; prevent layout shifts
F154 | mobile | Checkout form too long on mobile (excessive scrolling) | checkout_form_scroll_depth > 300% viewport | Collapse sections; use accordion; minimize fields
F155 | mobile | App install banner blocks content | app_banner_shown AND dismiss_time > 3s | Show non-intrusive inline banner instead
F156 | mobile | Touch carousel difficult to use | carousel_swipe_failure_count >= 2 | Improve swipe sensitivity or switch to tap navigation
F157 | mobile | Product images too small on mobile | image_zoom_attempt on mobile >= 2 | Enable tap-to-fullscreen gallery
F158 | mobile | Slow network on mobile (3G/poor connection) | connection_speed < 1mbps | Serve compressed images; lazy load; show offline-ready cached content
F159 | mobile | Bottom navigation covers "Add to Cart" | atc_button_obscured_by_nav == true | Reposition ATC above bottom nav; or integrate into sticky bar
F160 | mobile | Mobile keyboard overlaps "Place Order" button | keyboard_open AND place_order_obscured | Auto-scroll to keep CTA visible above keyboard
```

---

## CATEGORY 10: TECHNICAL & PERFORMANCE FRICTION

```
F161 | technical | Page crash / unresponsive | page_crash_event == true | Auto-reload; save user state; show "Something went wrong" with retry
F162 | technical | JavaScript error preventing interaction | js_error_count > 0 on critical_element | Fallback UI; error logging; degrade gracefully
F163 | technical | Image not loading (broken image) | image_load_error == true on pdp | Show placeholder; lazy retry; log for content team
F164 | technical | Video won't play | video_play_error == true | Show thumbnail + transcript; offer alternative format
F165 | technical | Checkout form submit fails silently | form_submit AND no_response AND no_error_shown | Show explicit success/failure feedback
F166 | technical | Cart data lost after page refresh | cart_items_before_refresh > 0 AND cart_items_after == 0 | Persist cart server-side; recover on refresh
F167 | technical | Session expired during shopping | session_expired AND cart_items > 0 | Preserve cart; auto-restore on return; extend timeout
F168 | technical | Infinite loading spinner | spinner_visible > 15s | Timeout and show error with retry; don't leave user hanging
F169 | technical | Search functionality broken | search_submit AND response_error | Show fallback: popular categories + "Browse instead"
F170 | technical | Filter/sort not responding | filter_click AND no_result_change AND no_loader | Fix filter logic; show loading state
F171 | technical | Duplicate charges / double-submit | place_order_click_count >= 2 within 5s | Disable button after first click; show processing state
F172 | technical | Add-to-cart button unresponsive | atc_click AND no_cart_update | Fix handler; show loading feedback on click
F173 | technical | CAPTCHA blocks checkout flow | captcha_shown at checkout AND captcha_fail | Use invisible CAPTCHA or risk-based challenge only
F174 | technical | Third-party script slowing page | third_party_script_load > 2s | Async load; defer non-critical scripts
F175 | technical | Price rounding / calculation error displayed | displayed_total != sum(items + tax + shipping) | Fix calculation logic; show itemized breakdown
F176 | technical | Browser back breaks checkout state | back_button during checkout AND state_lost | Maintain checkout state with history API; warn before leaving
F177 | technical | WebSocket/live feature disconnection | live_feature_disconnected == true | Auto-reconnect; show "Reconnecting…" status
```

---

## CATEGORY 11: CONTENT & INFORMATION FRICTION

```
F178 | content | Product description too short / vague | description_word_count < 30 AND bounce_rate_high | Enrich with AI-generated details; add specs and FAQs
F179 | content | Product description too long / overwhelming | description_word_count > 500 AND scroll_past_without_reading | Add TL;DR summary; use expandable sections
F180 | content | Product images low quality / insufficient | image_count < 3 OR image_resolution < 500px | Add more angles; enable user-uploaded photos
F181 | content | No product video available | video_available == false AND category_avg_has_video | Add product video; even simple 360-spin
F182 | content | Missing size/fit information | size_info_absent AND category == apparel/shoes | Add size guide, fit predictor, or AR try-on
F183 | content | Product specs inconsistent with images | spec_mismatch_flagged OR high_return_rate_for_product | Audit and fix content accuracy
F184 | content | Delivery/shipping info not visible on product page | shipping_info_on_pdp == false | Show estimated delivery date and cost on product page
F185 | content | Return policy hard to find from product page | return_policy_link_on_pdp == false | Add inline return info: "Free returns within 30 days"
F186 | content | Sustainability/ethical info missing when user looks for it | sustainability_page_search AND content_absent | Add sustainability badges and info if applicable
F187 | content | Comparison info missing between similar products | user_views_similar_products >= 3 AND comparison_tool == false | Offer side-by-side comparison tool
F188 | content | FAQ section missing or outdated | faq_section == absent OR faq_last_updated > 180_days | Generate dynamic FAQ from common customer queries
F189 | content | Product labels/badges confusing (too many) | badge_count_on_product > 4 | Limit to 2-3 most impactful badges
F190 | content | Ingredient/material info missing for sensitive categories | category in [beauty, food, supplements] AND ingredient_list == absent | Add ingredient list; required for informed purchasing
F191 | content | Conflicting information between product page and cart | pdp_info != cart_info (price, name, variant) | Sync all data sources; audit consistency
```

---

## CATEGORY 12: PERSONALIZATION FRICTION

```
F192 | personalization | Irrelevant product recommendations | recommendation_click_rate < 2% for user_segment | Refine recommendation model; use collaborative filtering
F193 | personalization | Recommendations show already-purchased items | recommended_product in user_purchase_history | Exclude purchased items from recommendations
F194 | personalization | Not recognizing returning customer | returning_user AND experience == generic | Personalize: "Welcome back" + recently viewed + saved cart
F195 | personalization | Showing wrong gender/demographic products | user_profile_gender != recommended_product_gender | Respect user preference data in recommendations
F196 | personalization | Email personalization mismatch (wrong name/product) | email_opened AND name_mismatch OR product_irrelevant | Audit personalization data pipeline
F197 | personalization | Personalized pricing perceived as unfair | same_product_different_price_for_different_users_detected | Ensure transparent pricing; avoid discriminatory pricing
F198 | personalization | Quiz/preference tool result feels wrong | quiz_completed AND result_page_exit_within < 15s | Allow "Not quite right" refinement; show alternative results
F199 | personalization | "Based on your browsing" shows embarrassing/private items | sensitive_category in browsing_history AND recommendation_shown | Exclude sensitive categories from visible recommendations
F200 | personalization | Geo-based content wrong (travel, VPN) | geo_detected_location != actual_location | Allow manual location override
F201 | personalization | Language auto-detection wrong | detected_language != user_preferred_language | Show easy language switcher; remember preference
F202 | personalization | Recently viewed section cluttered with irrelevant items | recently_viewed_count > 20 AND relevance_score_low | Show smart "Recently Viewed" with category grouping
```

---

## CATEGORY 13: SOCIAL PROOF & URGENCY FRICTION

```
F203 | social_proof | No reviews on product | review_count == 0 | Show "First to review" CTA; display category-level trust stats
F204 | social_proof | Reviews feel fake or unverified | review_verified_badge_absent AND reviews_all_5_star | Add "Verified Purchase" badges; show balanced reviews
F205 | social_proof | Social proof notifications annoying (too frequent) | social_proof_popup_frequency > 1_per_30s | Reduce frequency; make dismissible; respect user preference
F206 | social_proof | Urgency timer feels manipulative | timer_resets_on_refresh OR same_timer_across_days | Use genuine stock-based scarcity only
F207 | social_proof | "X people viewing this" feels fake | concurrent_viewer_count_static OR inflated | Use real data or remove; authenticity builds trust
F208 | social_proof | Low stock warning but stock never decreases | low_stock_shown AND stock_level_unchanged_for_days | Use real inventory data; remove if not genuine
F209 | social_proof | No social media presence / proof | social_links_absent OR social_follower_count_low | Build social presence; show UGC if available
F210 | social_proof | Influencer endorsement feels inauthentic | influencer_content AND negative_sentiment_in_comments | Use micro-influencer authentic reviews instead
F211 | social_proof | Testimonials too generic ("Great product!") | testimonial_word_count < 10 for all displayed | Curate detailed, specific testimonials with use cases
```

---

## CATEGORY 14: COMMUNICATION & NOTIFICATION FRICTION

```
F212 | communication | Abandoned cart email too early (within minutes) | abandon_email_sent_within < 300s | Delay first email to 1-4 hours
F213 | communication | Abandoned cart email too late (days later) | abandon_email_sent_after > 72h | Optimize timing: 1h → 24h → 72h cadence
F214 | communication | Too many marketing emails causing unsubscribe | email_frequency > 5_per_week AND unsubscribe == true | Reduce frequency; let users set preferences
F215 | communication | Push notifications too frequent / irrelevant | push_frequency > 3_per_day OR push_relevance_low | Reduce; personalize based on behavior
F216 | communication | SMS marketing without opt-in consent | sms_sent AND opt_in == false | Ensure compliance; get explicit consent
F217 | communication | Notification arrives at wrong time (timezone) | notification_sent_at AND user_local_time == sleep_hours | Send in user's timezone during active hours
F218 | communication | Customer service response too slow | support_ticket_age > 24h AND unresolved | Escalate; send acknowledgment; offer alternatives
F219 | communication | Live chat unavailable when needed | chat_icon_clicked AND agents_online == 0 | Show chatbot fallback; collect contact for callback
F220 | communication | Chatbot can't understand user query | chatbot_intent_confidence < 0.3 | Escalate to human agent; show "Talk to a person" option
F221 | communication | Chatbot loops without resolution | chatbot_loop_count >= 3 | Force human handoff; apologize for inconvenience
F222 | communication | Order confirmation email delayed | order_placed AND confirmation_email_sent_after > 300s | Send instant confirmation; queue detailed follow-up
F223 | communication | Shipping notification missing | order_shipped AND shipping_email_sent == false | Automate shipping notification with tracking link
F224 | communication | Marketing email content doesn't match landing page | email_offer != landing_page_offer | Sync email campaigns with live site content
```

---

## CATEGORY 15: ACCOUNT & AUTHENTICATION FRICTION

```
F225 | account | Forgot password during checkout | password_reset_initiated during checkout_flow | Offer guest checkout immediately; simplify reset
F226 | account | Social login fails | social_login_attempt AND social_login_error | Offer alternative login methods; show clear error message
F227 | account | Account creation form too long | registration_form_fields > 6 AND registration_abandon == true | Reduce to email + password; collect details later
F228 | account | Email verification blocks immediate shopping | email_verification_required AND delay > 0 | Allow shopping immediately; verify before checkout
F229 | account | Password requirements too strict | password_error_count >= 2 on strength_validation | Show requirements upfront; use password strength meter
F230 | account | Two-factor auth friction at login | 2fa_step AND login_abandon == true | Offer "Remember this device" option
F231 | account | Account locked after failed attempts | login_attempt_count >= 5 AND account_locked | Clear unlock path; offer alternative verification
F232 | account | Guest checkout not remembered on return | returning_user AND previous_order_as_guest AND no_recognition | Offer "Link to account" with previous order data
F233 | account | Saved payment method expired | saved_payment_expired == true during checkout | Prompt to update; pre-fill card form
F234 | account | Profile data outdated (old address, old name) | profile_last_updated > 365d AND checkout_address_changed | Prompt profile update after checkout
F235 | account | Login prompt during browsing interrupts flow | login_modal_shown during browsing AND dismiss == true | Defer login to cart/checkout; don't interrupt browsing
```

---

## CATEGORY 16: SHIPPING & DELIVERY FRICTION

```
F236 | shipping | Shipping cost too high | shipping_cost > 15% of cart_value AND exit == true | Offer free shipping threshold; show cheaper options
F237 | shipping | Shipping cost not shown until checkout | shipping_cost_first_shown_at == checkout | Show estimated shipping on product page and cart
F238 | shipping | Delivery estimate too slow | estimated_delivery > 7_days AND exit == true | Offer express option; show competitor delivery comparison
F239 | shipping | No express/overnight shipping available | express_shipping_available == false AND user_urgency_signals | Add express option or partner with faster carrier
F240 | shipping | International shipping not available | user_geo == international AND intl_shipping == false | Show "Coming soon to your country" + notify signup
F241 | shipping | No in-store pickup option | bopis_available == false AND user_near_store | Enable BOPIS if feasible
F242 | shipping | Delivery date range too wide ("5-15 business days") | delivery_range > 10_days | Narrow estimates; use carrier API for precision
F243 | shipping | No order tracking available | tracking_available == false | Partner with trackable carrier; send updates proactively
F244 | shipping | Shipping to PO Box not supported | address_type == po_box AND shipping_error | Clearly state PO Box policy; offer alternatives
F245 | shipping | Shipping address validation failure | address_validation_error == true | Use address suggestion API; show "Did you mean…?"
F246 | shipping | Split shipment not communicated | order_ships_in_multiple AND notification_absent | Notify: "Your order will arrive in 2 packages"
F247 | shipping | Delivery attempted but failed | delivery_failed AND no_redelivery_option | Offer redelivery scheduling or pickup location
```

---

## CATEGORY 17: RETURN & REFUND FRICTION

```
F248 | returns | Return process too complicated | return_steps > 4 OR return_page_bounce_rate_high | Simplify: one-click return initiation
F249 | returns | Return shipping cost falls on customer | return_shipping_free == false AND return_initiation_abandon | Offer free returns or prepaid labels
F250 | returns | Refund processing too slow | refund_initiated AND refund_completed_after > 14_days | Speed up refund; send status updates
F251 | returns | Return window too short | return_window < 14_days AND return_policy_bounce | Extend return window; show prominently
F252 | returns | No exchange option (return only) | exchange_option_available == false AND return_reason == wrong_size | Offer direct exchange with instant shipping
F253 | returns | Return label generation broken | return_label_request AND error | Provide manual instructions; email label as backup
F254 | returns | No return status tracking | return_shipped AND tracking_absent | Add return tracking; send confirmation emails
F255 | returns | Restocking fee not disclosed upfront | restocking_fee_shown_at == return_confirmation_only | Disclose fees on product page and at purchase
F256 | returns | Return policy different for sale items | sale_item_return_policy_different AND not_disclosed | Clearly flag non-returnable sale items before purchase
F257 | returns | Refund to original payment method only (no store credit option) | refund_method == original_only AND user_wants_store_credit | Offer both options: refund or store credit (with bonus)
```

---

## CATEGORY 18: POST-PURCHASE FRICTION

```
F258 | post_purchase | Order confirmation page unclear | confirmation_page AND support_contact_within < 300s | Clarify order details, delivery timeline, next steps
F259 | post_purchase | No post-purchase engagement | order_complete AND next_touchpoint == none for 30d | Send thank-you email, care tips, complementary product suggestions
F260 | post_purchase | Product doesn't match expectations (returns) | return_reason == "not as described" | Improve product content accuracy for that SKU
F261 | post_purchase | Reorder process difficult | reorder_attempt AND friction_detected | Enable one-click reorder from order history
F262 | post_purchase | Subscription management hard to find | subscription_manage_page_search OR support_ticket == "cancel subscription" | Make subscription management prominent in account
F263 | post_purchase | Review request sent too early (before delivery) | review_email_sent AND delivery_status != delivered | Trigger review request only after confirmed delivery
F264 | post_purchase | No loyalty reward after purchase | loyalty_eligible AND points_not_awarded | Auto-credit points; send confirmation
F265 | post_purchase | Cross-sell email not relevant to purchase | cross_sell_email AND product_relevance_score < 0.3 | Improve recommendation model; use purchase context
F266 | post_purchase | Package arrived damaged | damage_report_filed == true | Expedite replacement; pre-approve refund
F267 | post_purchase | Invoice/receipt not easily accessible | invoice_download_search OR support_ticket == "receipt" | Auto-email invoice; add to order history page
F268 | post_purchase | Order modification not possible after placement | order_edit_attempt AND edit_window_closed | Allow 30-min edit window; or show cancellation option
```

---

## CATEGORY 19: RE-ENGAGEMENT FRICTION

```
F269 | re_engagement | Returning user's cart is empty (was full before) | returning_user AND previous_cart_items > 0 AND current_cart == 0 | Restore saved cart: "Welcome back! Your items are still here"
F270 | re_engagement | Returning user can't find previously viewed product | returning_user AND search_for_previous_product | Show "Recently Viewed" prominently; enable persistent history
F271 | re_engagement | Win-back email ignored | winback_email_sent_count >= 2 AND open_rate == 0 | Try different channel (SMS, push, retargeting ad)
F272 | re_engagement | Previously purchased product now discontinued | reorder_attempt AND product_status == discontinued | Show successor product or close alternative
F273 | re_engagement | Loyalty points about to expire | loyalty_points_expiry < 30d AND user_inactive | Notify: "You have $X in points expiring — use them now"
F274 | re_engagement | User downgraded (was VIP, now inactive) | user_tier_decreased AND session_started | Offer win-back incentive to restore tier
F275 | re_engagement | Subscription cancelled user browsing again | subscription_status == cancelled AND session_active | Show "Restart and save" or "What's new since you left"
F276 | re_engagement | Seasonal shopper not returning this season | seasonal_buyer AND no_visit_in_season | Proactive outreach with seasonal recommendations
F277 | re_engagement | Wishlist items on sale but user not notified | wishlist_item_price_drop AND notification_sent == false | Send price drop alert for wishlisted items
```

---

## CATEGORY 20: ACCESSIBILITY FRICTION

```
F278 | accessibility | Screen reader can't parse product page | aria_labels_missing OR heading_structure_broken | Fix semantic HTML; add ARIA labels
F279 | accessibility | Keyboard navigation trapped in modal | focus_trap_in_modal AND escape_key_not_working | Ensure keyboard trap release; add visible close
F280 | accessibility | Color contrast insufficient | contrast_ratio < 4.5:1 on text_elements | Increase contrast to WCAG AA compliance
F281 | accessibility | No alt text on product images | alt_text_missing on product_images | Add descriptive alt text for all images
F282 | accessibility | Form labels missing / not associated | label_for_mismatch OR label_absent | Fix label-input associations
F283 | accessibility | Touch targets too small (mobile) | touch_target_size < 44px | Increase to minimum 44x44px
F284 | accessibility | Animation causes motion sickness | animation_intense AND prefers_reduced_motion_ignored | Respect prefers-reduced-motion media query
F285 | accessibility | Timeout without warning (accessibility need) | session_timeout AND no_warning AND user_pace_slow | Extend timeout; add warning; allow extension
F286 | accessibility | Error messages not announced to screen reader | form_error AND aria_live_absent | Add aria-live="assertive" on error regions
```

---

## CATEGORY 21: MULTI-CHANNEL & CROSS-DEVICE FRICTION

```
F287 | cross_channel | Cart not synced across devices | cart_on_device_A != cart_on_device_B for same_user | Sync cart via user account in real-time
F288 | cross_channel | Wishlist not accessible on other device | wishlist_on_device_A AND not_on_device_B | Cloud-sync wishlist for logged-in users
F289 | cross_channel | Mobile app experience inconsistent with web | feature_parity_gap between app and web | Audit and align feature set
F290 | cross_channel | In-store inventory shown as online-only | stock_location_type == online_only AND user_near_store | Show "Available at [Store]" with real-time inventory
F291 | cross_channel | BOPIS item not ready at promised time | bopis_ready_time > promised_time | Send delay notification; offer compensation
F292 | cross_channel | Email link opens mobile web instead of app | email_link_opens == mobile_web AND app_installed | Use deep links to open in app
F293 | cross_channel | Promo code from email doesn't work online | promo_code_from_email AND online_validation_fail | Sync promotional systems across all channels
F294 | cross_channel | Different prices on app vs website | app_price != web_price for same_product | Unify pricing engine across platforms
```

---

## CATEGORY 22: DECISION PARALYSIS FRICTION

```
F295 | decision | Too many similar products (overwhelm) | category_viewed AND product_count > 50 AND scroll_depth < 20% AND exit | Show "Top Picks" or AI-curated shortlist
F296 | decision | User views 10+ products without adding any to cart | pdp_view_count >= 10 AND add_to_cart == 0 | Offer "Need help deciding?" quiz or comparison tool
F297 | decision | User toggles between 2-3 products repeatedly | product_toggle_count >= 4 between same products | Show side-by-side comparison automatically
F298 | decision | User adds multiple similar items then removes all but one | add_similar_items >= 3 then remove_all_but_1 | Confirm choice: "Great pick! Here's why others love it"
F299 | decision | Variant selection takes too long | variant_interaction_time > 60s AND add_to_cart == false | Offer "Most popular" variant badge or "Recommended for you"
F300 | decision | Gift shopper doesn't know what to pick | gift_signals == true AND session_duration > 600s AND cart == empty | Offer gift guides, gift cards, or "Shop by recipient" tool
F301 | decision | User reads comparisons but doesn't choose | comparison_tool_used AND no_selection_within 300s | Show "Editor's Pick" or "Best Value" recommendation
F302 | decision | Bundle vs individual items confusion | bundle_viewed AND individual_viewed AND toggle >= 3 | Show clear savings breakdown: bundle vs individual
```

---

## CATEGORY 23: PAYMENT-SPECIFIC FRICTION

```
F303 | payment | Credit card type not accepted | card_type_submitted AND card_type_not_supported | Show accepted cards upfront; offer alternative methods
F304 | payment | Digital wallet not available | user_device supports wallet AND wallet_option_absent | Enable Apple Pay / Google Pay
F305 | payment | BNPL declined | bnpl_application AND bnpl_declined | Offer alternative BNPL or standard payment with empathetic messaging
F306 | payment | Installment terms unclear | bnpl_viewed AND bnpl_terms_page_exit < 10s | Show clear breakdown: "4 payments of $X, 0% interest"
F307 | payment | Currency conversion at bank rate warning | international_card AND no_multi_currency_support | Show price in user's currency; absorb conversion fee
F308 | payment | Saved card details wrong / outdated | saved_card_declined AND user_confusion_signals | Prompt: "Update your card" with clear form
F309 | payment | PayPal popup blocked by browser | paypal_redirect AND popup_blocked | Detect blocker; show "Please allow popups" guidance
F310 | payment | Gift card balance insufficient for order | gift_card_balance < order_total | Allow split payment: gift card + another method
F311 | payment | Crypto payment option confusing | crypto_payment_selected AND payment_abandon | Simplify instructions; show QR code with clear steps
F312 | payment | Invoice / NET terms request not available (B2B) | b2b_user AND invoice_payment_absent | Add invoice option for verified business accounts
```

---

## CATEGORY 24: LEGAL & COMPLIANCE FRICTION

```
F313 | compliance | GDPR consent flow blocks shopping | consent_modal AND interaction_blocked_until_consent | Use non-blocking consent bar; allow browsing immediately
F314 | compliance | Age verification gate too strict | age_gate_shown AND exit_rate_high | Streamline: simple date input vs full document upload
F315 | compliance | Product restricted in user's region | product_available == false for user_geo | Show message clearly; suggest available alternatives
F316 | compliance | Cookie preferences reset on every visit | cookie_preferences AND repeat_modal_shown | Persist cookie choices properly
F317 | compliance | Terms of service too long to accept | tos_page_length > 5000_words AND checkbox_hesitation | Show summary + expandable full text
F318 | compliance | Data export/deletion request difficult | user_data_request AND process_steps > 3 | Self-service data management in account settings
```

---

## CATEGORY 25: SEASONAL & CONTEXTUAL FRICTION

```
F319 | seasonal | Holiday gift deadline approaching but delivery won't make it | order_date + delivery_estimate > holiday_date | Show "Order by [date] for guaranteed delivery" warning
F320 | seasonal | Gift wrapping unavailable during gift season | holiday_season AND gift_wrap_absent | Enable seasonal gift wrapping option
F321 | seasonal | Black Friday/sale site overloaded | server_response_time > 5s during sale_event | Queue system with estimated wait; increase capacity
F322 | seasonal | Seasonal product sold out | seasonal_product AND stock == 0 AND demand_high | Waitlist + notification for restock or next season
F323 | seasonal | Back-to-school items not grouped for easy shopping | seasonal_context == back_to_school AND category_browse_high | Create curated seasonal landing page
F324 | seasonal | Weather-triggered product need not served | weather_api == extreme_cold/heat AND relevant_products_not_promoted | Dynamic merchandising based on local weather
F325 | seasonal | Post-holiday return surge overwhelming support | support_ticket_volume > 200% baseline AND response_time > 48h | Scale support; add self-service return portal
```
