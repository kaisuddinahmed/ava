import { broadcastToChannel } from "../broadcast/broadcast.service.js";

export interface OnboardingProgressEvent {
  siteConfigId: string;
  analyzerRunId: string;
  status: string;
  progress: number;
  details: Record<string, unknown>;
}

export function broadcastOnboardingProgress(event: OnboardingProgressEvent): void {
  const payload = {
    type: "onboarding_progress",
    payload: {
      siteConfigId: event.siteConfigId,
      analyzerRunId: event.analyzerRunId,
      status: event.status,
      progress: event.progress,
      details: event.details,
      timestamp: new Date().toISOString(),
    },
  };

  broadcastToChannel("dashboard", payload);
  broadcastToChannel("demo", payload);
}
