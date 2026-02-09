/**
 * Adjust clarity score with server-side context.
 * - +10 if rule-based detector corroborates LLM finding
 * - -15 if session is very young (< 60s)
 * - -10 if only 1-2 events in batch
 */
export function adjustClarity(
  llmRaw: number,
  ctx: {
    sessionAgeSec: number;
    eventCount: number;
    ruleBasedCorroboration: boolean;
  }
): number {
  let score = llmRaw;

  // Rule-based corroboration boost
  if (ctx.ruleBasedCorroboration) score += 10;

  // Young session penalty
  if (ctx.sessionAgeSec < 60) score -= 15;

  // Low event count penalty
  if (ctx.eventCount <= 2) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}
