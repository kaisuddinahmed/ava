// ============================================================================
// Event Repository — TrackEvent persistence & queries
// ============================================================================

import { prisma } from "../client.js";

export type CreateEventInput = {
  sessionId: string;
  category: string;
  eventType: string;
  frictionId?: string;
  pageType: string;
  pageUrl: string;
  rawSignals: string; // JSON blob
  metadata?: string;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createEvent(data: CreateEventInput) {
  return prisma.trackEvent.create({ data });
}

export async function createEventBatch(events: CreateEventInput[]) {
  return prisma.trackEvent.createMany({ data: events });
}

export async function getEvent(id: string) {
  return prisma.trackEvent.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getEventsBySession(
  sessionId: string,
  options?: { since?: Date; limit?: number }
) {
  return prisma.trackEvent.findMany({
    where: {
      sessionId,
      ...(options?.since ? { timestamp: { gte: options.since } } : {}),
    },
    orderBy: { timestamp: "asc" },
    take: options?.limit,
  });
}

export async function getRecentEvents(
  sessionId: string,
  count: number = 10
) {
  return prisma.trackEvent.findMany({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
    take: count,
  });
}

export async function getEventsByIds(ids: string[]) {
  return prisma.trackEvent.findMany({
    where: { id: { in: ids } },
    orderBy: { timestamp: "asc" },
  });
}

export async function getEventsByFriction(frictionId: string) {
  return prisma.trackEvent.findMany({
    where: { frictionId },
    orderBy: { timestamp: "desc" },
    take: 50,
  });
}

export async function getUnevaluatedEvents(
  sessionId: string,
  evaluatedEventIds: string[]
) {
  return prisma.trackEvent.findMany({
    where: {
      sessionId,
      id: { notIn: evaluatedEventIds },
    },
    orderBy: { timestamp: "asc" },
  });
}

export async function countEventsBySession(sessionId: string) {
  return prisma.trackEvent.count({ where: { sessionId } });
}
