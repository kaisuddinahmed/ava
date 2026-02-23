import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { createWSServer } from "./broadcast/ws-server.js";
import { apiRouter } from "./api/routes.js";
import { getJobRunner } from "./jobs/job-runner.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", apiRouter);

// Start HTTP server
app.listen(config.port, () => {
  console.log(`[AVA] HTTP server running on port ${config.port}`);
});

// Start WebSocket server
const wss = createWSServer(config.wsPort);
console.log(`[AVA] WebSocket server running on port ${config.wsPort}`);

// Start scheduled job runner (nightly batch, drift snapshots, canary checks)
if (!config.jobs.disableScheduler) {
  const jobRunner = getJobRunner();
  jobRunner.start();
  console.log(
    `[AVA] Job scheduler started — next nightly batch: ${jobRunner.getNextRunTime().toISOString()}`,
  );
} else {
  console.log(`[AVA] Job scheduler disabled (DISABLE_SCHEDULER=true)`);
}

export { app, wss };
