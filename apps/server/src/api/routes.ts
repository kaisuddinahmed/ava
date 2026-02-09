import { Router } from "express";
import * as sessionsApi from "./sessions.api.js";
import * as eventsApi from "./events.api.js";
import * as configApi from "./config.api.js";
import * as scoringConfigApi from "./scoring-config.api.js";

export const apiRouter = Router();

// Sessions
apiRouter.get("/sessions", sessionsApi.listSessions);
apiRouter.get("/sessions/:id", sessionsApi.getSession);
apiRouter.post("/sessions/:id/end", sessionsApi.endSession);

// Events
apiRouter.get("/sessions/:sessionId/events", eventsApi.getEvents);

// Config
apiRouter.get("/config", configApi.getConfig);

// Scoring Config (MSWIM weight profiles)
apiRouter.get("/scoring-configs", scoringConfigApi.listConfigs);
apiRouter.get("/scoring-configs/:id", scoringConfigApi.getConfig);
apiRouter.post("/scoring-configs", scoringConfigApi.createConfig);
apiRouter.put("/scoring-configs/:id", scoringConfigApi.updateConfig);
apiRouter.post("/scoring-configs/:id/activate", scoringConfigApi.activateConfig);
apiRouter.delete("/scoring-configs/:id", scoringConfigApi.deleteConfig);
