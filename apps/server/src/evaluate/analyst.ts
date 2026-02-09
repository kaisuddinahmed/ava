import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { SYSTEM_PROMPT } from "./prompts/system-prompt.js";
import { buildEvaluatePrompt } from "./prompts/evaluate-prompt.js";
import type { EvaluationContext } from "./context-builder.js";

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

export interface LLMEvaluationOutput {
  narrative: string;
  detected_frictions: string[];
  signals: {
    intent: number;
    friction: number;
    clarity: number;
    receptivity: number;
    value: number;
  };
  recommended_action: string;
  reasoning: string;
}

/**
 * Call the Anthropic Claude API to evaluate the session.
 */
export async function evaluateWithLLM(
  context: EvaluationContext
): Promise<LLMEvaluationOutput> {
  const userPrompt = buildEvaluatePrompt(context);

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM");
  }

  // Parse the JSON response
  const raw = textBlock.text.trim();

  // Try to extract JSON from markdown code blocks if present
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw;

  try {
    const parsed = JSON.parse(jsonStr) as LLMEvaluationOutput;

    // Validate required fields
    if (!parsed.narrative || !parsed.signals || !parsed.detected_frictions) {
      throw new Error("Missing required fields in LLM response");
    }

    // Clamp signal values
    parsed.signals.intent = clamp(parsed.signals.intent);
    parsed.signals.friction = clamp(parsed.signals.friction);
    parsed.signals.clarity = clamp(parsed.signals.clarity);
    parsed.signals.receptivity = clamp(parsed.signals.receptivity);
    parsed.signals.value = clamp(parsed.signals.value);

    return parsed;
  } catch (error) {
    console.error("[Analyst] Failed to parse LLM response:", raw);
    // Return safe defaults
    return {
      narrative: "Unable to parse analyst response.",
      detected_frictions: [],
      signals: { intent: 30, friction: 20, clarity: 20, receptivity: 80, value: 30 },
      recommended_action: "monitor",
      reasoning: "LLM response parsing failed; defaulting to monitoring.",
    };
  }
}

function clamp(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}
