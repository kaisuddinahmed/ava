/**
 * Format a timestamp (ms or ISO string) as HH:MM:SS.
 */
export function fmtTime(ts: number | string): string {
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format a number with commas.
 */
export function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Format a percentage (0-1 → "42.0%").
 */
export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Format a score (0-100 → "72").
 */
export function fmtScore(n: number): string {
  return Math.round(n).toString();
}

/**
 * Tier colour from CSS variables.
 */
export function tierColor(tier: string): string {
  const map: Record<string, string> = {
    MONITOR: "var(--tier-monitor)",
    PASSIVE: "var(--tier-passive)",
    NUDGE: "var(--tier-nudge)",
    ACTIVE: "var(--tier-active)",
    ESCALATE: "var(--tier-escalate)",
  };
  return map[tier] ?? "var(--muted)";
}

/**
 * Truncate a string with ellipsis.
 */
export function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
