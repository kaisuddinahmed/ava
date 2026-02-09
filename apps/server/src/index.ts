import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { createWSServer } from "./broadcast/ws-server.js";
import { apiRouter } from "./api/routes.js";

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

export { app, wss };
