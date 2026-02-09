import { VALUE_CART_BRACKETS, VALUE_BOOSTS } from "@ava/shared";

/**
 * Compute value signal from cart value, customer data, and channel.
 * Uses tiered cart value brackets + LTV boosts.
 */
export function computeValue(
  llmHint: number,
  ctx: {
    cartValue: number;
    isLoggedIn: boolean;
    isRepeatVisitor: boolean;
    referrerType: string;
  }
): number {
  // Base from cart value brackets
  let score = 20; // minimum base
  for (const bracket of VALUE_CART_BRACKETS) {
    if (ctx.cartValue >= bracket.min) {
      score = bracket.score;
    }
  }

  // Logged-in boost
  if (ctx.isLoggedIn) score += VALUE_BOOSTS.loggedIn;

  // Repeat visitor boost
  if (ctx.isRepeatVisitor) score += VALUE_BOOSTS.repeatVisitor;

  // Paid acquisition boost
  if (ctx.referrerType === "paid") score += VALUE_BOOSTS.paidAcquisition;

  // Blend in LLM hint (20% weight)
  score = score * 0.8 + llmHint * 0.2;

  return Math.max(0, Math.min(100, Math.round(score)));
}
