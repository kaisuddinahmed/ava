# Friction Handler Specification (Phase 3)

This document defines the **Triggers**, **Actions**, and **Scripts** for the 13-point Friction Handling System.

## 1. Exit Intent
- **Signal**: Mouse velocity rapidly towards "X" or back button.
- **Action**: 🛑 **Modal** ("Wait, Don't Go" Save).
- **Script**: "Not ready to decide? Save this item to your Wishlist and we'll notify you if the price drops."

## 2. Price Sensitivity
- **Signal**: User highlights price text, toggles currency (future), or repeatedly checks cart.
- **Action**: 💡 **Tooltip** (Dynamic Value Proposition).
- **Script**: "This price includes a 2-year warranty and free returns." (Follow-up: "Here is a 5% off code if you buy now.")

## 3. Search Frustration
- **Signal**: User reformulates query 3+ times or clicks next page multiple times with no clicks.
- **Action**: 💬 **Chat Bubble** (Proactive Search Assistant).
- **Script**: "It looks like you're having trouble finding the right match. Are you looking for a specific shade or style? I can show you 'Burgundy Cocktail Dresses'."

## 4. Specs Help
- **Signal**: Rapid scroll between photo and specs list.
- **Action**: ✨ **Highlight** (Contextual Simplifier).
- **Script**: "Wondering if this fits your needs? This laptop has 16GB RAM, which is perfect for video editing and gaming."

## 5. Indecision
- **Signal**: Bouncing between 2-3 specific product pages repeatedly.
- **Action**: ⚖️ **Modal** (Side-by-Side Closer).
- **Script**: "Stuck between these two? Here is the main difference: The Model X has better battery life, but the Model Y has a superior camera."

## 6. Comparison Loop
- **Signal**: User copies product name or opens new tabs (visibility change).
- **Action**: 🛡️ **Banner** (Price Match Guarantee).
- **Script**: "We price match! Found it cheaper elsewhere? Let us know and we'll match it right now."

## 7. High Interest
- **Signal**: Deep scrolling, viewing all photos, dwelling 2+ mins.
- **Action**: 🔥 **Nudge** (Social Proof).
- **Script**: "Great choice! 12 other people have this in their cart right now." / "Only 3 left in this size."

## 8. Checkout Hesitation
- **Signal**: Stops at shipping or payment field in checkout.
- **Action**: 🛡️ **Chat/Voice** (Reassurance Agent).
- **Script**: "Standard shipping takes 3-5 days. Need it faster? Upgrade for just $2 more." / "Checkout is secure with 256-bit encryption."

## 9. Confusion
- **Signal**: Erratic clicking, rage clicks, or add/remove cycles.
- **Action**: 🗺️ **Chat Bubble** (Navigation Guide).
- **Script**: "Lost? Here are the most popular categories," or "Chat with a specialist for help."

## 10. Gift Anxiety
- **Signal**: User visits "Gift Guide", checks return policy, or toggles widely different sizes.
- **Action**: 🎁 **Modal** ("Gift Safe" Guarantee).
- **Script**: "Buying a gift? We offer a 'Digital Gift Receipt' so they can swap the size/color instantly before we even ship it. No awkward returns."

## 11. Form Fatigue (Mobile)
- **Signal**: Mobile device + enters checkout + clicks first field then exits/hesitates.
- **Action**: ⚡ **Autofill Prompt** ("Lazy" Checkout).
- **Script**: "Skip the typing. Use Apple Pay / Google Pay to autofill everything in one click."

## 12. Visual Doom-Scrolling
- **Signal**: Scrolls down category page for 3 mins straight, passing 100+ items without clicking.
- **Action**: 🎨 **Pattern Interruption**.
- **Script**: "You’ve scrolled past a lot of bright colors. Would you prefer to see just our minimalist/neutral styles?"

## 13. Trust Gap (First-Time Visitor)
- **Signal**: New visitor navigates to "About Us" or Footer (looking for social/verify).
- **Action**: 🤝 **Badge** (Authority Injection).
- **Script**: "Verified: We’ve shipped 5,000+ orders to [User's City/Country] this month. Rated 4.9/5 on Trustpilot."
