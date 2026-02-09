import type { EvaluationResult } from "../evaluate/evaluate.service.js";
import { getMessageTemplate } from "./message-templates.js";

/**
 * Build the intervention payload to send to the widget.
 */
export function buildPayload(
  type: string,
  actionCode: string,
  frictionId: string,
  evaluation: EvaluationResult
): Record<string, unknown> {
  const template = getMessageTemplate(type, frictionId);

  const base: Record<string, unknown> = {
    type,
    actionCode,
    frictionId,
    message: template.message,
    tier: evaluation.tier,
    timestamp: new Date().toISOString(),
  };

  switch (type) {
    case "passive":
      return {
        ...base,
        uiAdjustments: template.uiAdjustments ?? [],
        silent: true,
      };

    case "nudge":
      return {
        ...base,
        bubbleText: template.bubbleText ?? template.message,
        dismissable: true,
        autoHideMs: 8000,
      };

    case "active":
      return {
        ...base,
        showPanel: true,
        products: [], // TODO: product intelligence
        comparison: null,
      };

    case "escalate":
      return {
        ...base,
        showPanel: true,
        urgent: true,
        products: [],
        comparison: null,
        offerDiscount: evaluation.tier === "ESCALATE",
      };

    default:
      return base;
  }
}
