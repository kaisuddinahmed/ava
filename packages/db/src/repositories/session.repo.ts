// ============================================================================
// Session Repository — CRUD + MSWIM counter updates
// ============================================================================

import { prisma } from "../client.js";
import type { Prisma } from "@prisma/client";

export type CreateSessionInput = {
  visitorId?: string;
  siteUrl: string;
  deviceType: string;
  referrerType: string;
  isLoggedIn?: boolean;
  isRepeatVisitor?: boolean;
};

export type UpdateSessionInput = Partial<{
  lastActivityAt: Date;
  cartValue: number;
  cartItemCount: number;
  status: string;
  isLoggedIn: boolean;
  totalInterventionsFired: number;
  totalDismissals: number;
  totalConversions: number;
  suppressNonPassive: boolean;
}>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createSession(data: CreateSessionInput) {
  return prisma.session.create({ data });
}

export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: { events: false, evaluations: false, interventions: false },
  });
}

export async function getSessionFull(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      events: { orderBy: { timestamp: "asc" } },
      evaluations: { orderBy: { timestamp: "desc" }, take: 5 },
      interventions: { orderBy: { timestamp: "desc" }, take: 10 },
    },
  });
}

export async function updateSession(id: string, data: UpdateSessionInput) {
  return prisma.session.update({ where: { id }, data });
}

export async function touchSession(id: string) {
  return prisma.session.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });
}

export async function endSession(id: string) {
  return prisma.session.update({
    where: { id },
    data: { status: "ended", lastActivityAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// MSWIM counter helpers
// ---------------------------------------------------------------------------

export async function incrementInterventionsFired(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalInterventionsFired: { increment: 1 } },
  });
}

export async function incrementDismissals(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalDismissals: { increment: 1 } },
  });
}

export async function incrementConversions(id: string) {
  return prisma.session.update({
    where: { id },
    data: { totalConversions: { increment: 1 } },
  });
}

export async function setSuppressNonPassive(id: string, suppress: boolean) {
  return prisma.session.update({
    where: { id },
    data: { suppressNonPassive: suppress },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listActiveSessions(siteUrl?: string) {
  const where: Prisma.SessionWhereInput = { status: "active" };
  if (siteUrl) where.siteUrl = siteUrl;

  return prisma.session.findMany({
    where,
    orderBy: { lastActivityAt: "desc" },
    take: 50,
  });
}

export async function getRecentSessions(limit = 20) {
  return prisma.session.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
