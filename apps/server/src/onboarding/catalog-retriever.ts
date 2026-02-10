import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  FRICTION_CATALOG,
  type FrictionScenario,
  SEVERITY_SCORES,
} from "@ava/shared";

export const BEHAVIOR_TARGET_COUNT = 614;
export const FRICTION_TARGET_COUNT = 325;

export interface BehaviorCatalogItem {
  id: string; // B001..B614
  order: number;
  category: string;
  description: string;
  keywords: string[];
}

export interface FrictionCatalogItem extends FrictionScenario {
  severity: number;
  keywords: string[];
}

const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "with",
  "from",
  "into",
  "for",
  "that",
  "this",
  "user",
  "shopper",
  "their",
  "when",
  "after",
  "before",
  "while",
  "without",
  "your",
  "site",
  "page",
]);

let behaviorCache: BehaviorCatalogItem[] | null = null;
let frictionCache: FrictionCatalogItem[] | null = null;

export async function getBehaviorCatalog(): Promise<BehaviorCatalogItem[]> {
  if (behaviorCache) return behaviorCache;

  const filePath = await resolveBehaviorDocPath();
  const markdown = await readFile(filePath, "utf8");
  const lines = markdown.split(/\r?\n/);

  let activeCategory = "general";
  const patterns: BehaviorCatalogItem[] = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (heading) {
      activeCategory = normalizeCategory(heading[1]);
      continue;
    }

    const item = line.match(/^(\d+)\.\s+(.+)$/);
    if (!item) continue;

    const order = Number(item[1]);
    if (!Number.isFinite(order) || order <= 0) continue;

    const description = item[2].trim();
    const id = `B${String(order).padStart(3, "0")}`;

    patterns.push({
      id,
      order,
      category: activeCategory,
      description,
      keywords: extractKeywords(`${activeCategory} ${description}`),
    });
  }

  patterns.sort((a, b) => a.order - b.order);
  behaviorCache = patterns;
  return patterns;
}

export function getFrictionCatalog(): FrictionCatalogItem[] {
  if (frictionCache) return frictionCache;

  const catalog: FrictionCatalogItem[] = Array.from(FRICTION_CATALOG.values())
    .map((item) => ({
      ...item,
      severity: SEVERITY_SCORES[item.id] ?? 50,
      keywords: extractKeywords(
        `${item.category} ${item.scenario} ${item.detection_signal} ${item.ai_action}`,
      ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  frictionCache = catalog;
  return catalog;
}

function normalizeCategory(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));

  return Array.from(new Set(tokens));
}

async function resolveBehaviorDocPath(): Promise<string> {
  const candidates = [
    resolve(process.cwd(), "docs", "shopper_behavior_patterns.md"),
    resolve(process.cwd(), "..", "docs", "shopper_behavior_patterns.md"),
    resolve(process.cwd(), "..", "..", "docs", "shopper_behavior_patterns.md"),
    resolve(process.cwd(), "..", "..", "..", "docs", "shopper_behavior_patterns.md"),
  ];

  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try next path.
    }
  }

  throw new Error("Could not locate docs/shopper_behavior_patterns.md");
}

