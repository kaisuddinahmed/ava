import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = "http://localhost:8080/api";

/**
 * Thin fetch wrapper for the AVA REST API.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Hook for one-shot API fetches with optional polling.
 */
export function useApi<T>(
  path: string | null,
  opts?: { pollMs?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const result = await apiFetch<T>(path);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
    if (opts?.pollMs && path) {
      timerRef.current = setInterval(load, opts.pollMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, opts?.pollMs, path]);

  return { data, loading, error, reload: load };
}

export { apiFetch };
