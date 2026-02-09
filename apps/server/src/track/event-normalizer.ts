/**
 * Normalize raw event data from the widget into a standard format.
 */
export interface NormalizedEvent {
  category: string;
  eventType: string;
  frictionId?: string;
  pageType: string;
  pageUrl: string;
  rawSignals: string;
  metadata?: string;
}

export function normalizeEvent(raw: Record<string, unknown>): NormalizedEvent {
  return {
    category: String(raw.category ?? "unknown"),
    eventType: String(raw.eventType ?? raw.type ?? "unknown"),
    frictionId: raw.frictionId ? String(raw.frictionId) : undefined,
    pageType: String(raw.pageType ?? "other"),
    pageUrl: String(raw.pageUrl ?? raw.url ?? ""),
    rawSignals: JSON.stringify(raw.signals ?? raw.data ?? {}),
    metadata: raw.metadata ? JSON.stringify(raw.metadata) : undefined,
  };
}
