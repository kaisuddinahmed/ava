// ============================================================================
// Shared utility functions
// ============================================================================

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a UUID v4 string.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Current timestamp in milliseconds.
 */
export function now(): number {
  return Date.now();
}

/**
 * Seconds elapsed since a given timestamp.
 */
export function secondsSince(timestamp: number): number {
  return (Date.now() - timestamp) / 1000;
}

/**
 * Minutes elapsed since a given timestamp.
 */
export function minutesSince(timestamp: number): number {
  return (Date.now() - timestamp) / 60_000;
}

/**
 * Format milliseconds into a human-readable duration (e.g., "2m 35s").
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a timestamp into HH:MM:SS for the TRACK tab.
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour12: false });
}

/**
 * Safe JSON parse that returns null on failure.
 */
export function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Round to N decimal places.
 */
export function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
