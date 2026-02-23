import { useState, useEffect } from "react";

export type ActivationState = {
  activated: boolean;
  /** ISO timestamp of when the dashboard was activated (for filtering stale data) */
  activatedAt: string | null;
};

/**
 * Listens for an `ava:activate` postMessage from the parent demo frame.
 * Returns activation state including a timestamp for "since" filtering.
 */
export function useActivation(): ActivationState {
  const [state, setState] = useState<ActivationState>({
    activated: false,
    activatedAt: null,
  });

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "ava:activate"
      ) {
        setState({
          activated: true,
          activatedAt: new Date().toISOString(),
        });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return state;
}
