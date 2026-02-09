import type { Request, Response } from "express";
import { ScoringConfigRepo } from "@ava/db";
import { invalidateConfigCache } from "../evaluate/mswim/config-loader.js";

export async function listConfigs(_req: Request, res: Response) {
  try {
    const configs = await ScoringConfigRepo.listScoringConfigs();
    res.json({ configs });
  } catch (error) {
    console.error("[API] List scoring configs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getConfig(req: Request, res: Response) {
  try {
    const config = await ScoringConfigRepo.getScoringConfig(req.params.id);
    if (!config) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json({ config });
  } catch (error) {
    console.error("[API] Get scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function createConfig(req: Request, res: Response) {
  try {
    const config = await ScoringConfigRepo.createScoringConfig(req.body);
    res.status(201).json({ config });
  } catch (error) {
    console.error("[API] Create scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateConfig(req: Request, res: Response) {
  try {
    const config = await ScoringConfigRepo.updateScoringConfig(req.params.id, req.body);
    invalidateConfigCache();
    res.json({ config });
  } catch (error) {
    console.error("[API] Update scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function activateConfig(req: Request, res: Response) {
  try {
    const config = await ScoringConfigRepo.activateConfig(req.params.id);
    invalidateConfigCache();
    res.json({ config });
  } catch (error) {
    console.error("[API] Activate scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteConfig(req: Request, res: Response) {
  try {
    await ScoringConfigRepo.deleteScoringConfig(req.params.id);
    invalidateConfigCache();
    res.json({ ok: true });
  } catch (error) {
    console.error("[API] Delete scoring config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
