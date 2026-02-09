import type { Request, Response } from "express";
import { EventRepo } from "@ava/db";

export async function getEvents(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    const events = await EventRepo.getEventsBySession(sessionId, {
      limit,
      since,
    });
    res.json({ events });
  } catch (error) {
    console.error("[API] Get events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
