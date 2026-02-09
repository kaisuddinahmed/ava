import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8080),
  wsPort: Number(process.env.WS_PORT ?? 8081),

  db: {
    url: process.env.DATABASE_URL ?? "file:./packages/db/prisma/dev.db",
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
  },

  mswim: {
    weights: {
      intent: Number(process.env.MSWIM_W_INTENT ?? 0.25),
      friction: Number(process.env.MSWIM_W_FRICTION ?? 0.25),
      clarity: Number(process.env.MSWIM_W_CLARITY ?? 0.15),
      receptivity: Number(process.env.MSWIM_W_RECEPTIVITY ?? 0.20),
      value: Number(process.env.MSWIM_W_VALUE ?? 0.15),
    },
    thresholds: {
      monitor: Number(process.env.MSWIM_T_MONITOR ?? 29),
      passive: Number(process.env.MSWIM_T_PASSIVE ?? 49),
      nudge: Number(process.env.MSWIM_T_NUDGE ?? 64),
      active: Number(process.env.MSWIM_T_ACTIVE ?? 79),
    },
  },

  evaluation: {
    batchIntervalMs: 5000,  // 5 seconds
    batchMaxEvents: 10,
    maxContextEvents: 50,   // last 50 events for context
  },
} as const;

export type Config = typeof config;
