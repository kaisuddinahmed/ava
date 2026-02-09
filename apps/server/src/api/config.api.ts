import type { Request, Response } from "express";
import { config } from "../config.js";
import { getClientCounts } from "../broadcast/channel-manager.js";

export async function getConfig(_req: Request, res: Response) {
  res.json({
    server: {
      port: config.port,
      wsPort: config.wsPort,
    },
    mswim: {
      weights: config.mswim.weights,
      thresholds: config.mswim.thresholds,
    },
    evaluation: config.evaluation,
    connections: getClientCounts(),
  });
}
