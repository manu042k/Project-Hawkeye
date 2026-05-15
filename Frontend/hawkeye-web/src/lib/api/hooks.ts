"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiClient,
  type RunSummary,
  type RunStatus,
  type StepTrace,
  type TestCaseInfo,
  type TraceEvent,
  type RunRequest,
} from "./client";

const TERMINAL = new Set<RunStatus>(["passed", "failed", "errored", "timed_out", "blocked", "cancelled"]);

export type ApiState<T> = { data: T | null; loading: boolean; error: string | null };

function initState<T>(): ApiState<T> {
  return { data: null, loading: true, error: null };
}

export function useRuns(): ApiState<RunSummary[]> & { refetch: () => void } {
  const [state, setState] = useState<ApiState<RunSummary[]>>(initState);
  const runsMapRef = useRef<Map<string, RunSummary>>(new Map());
  const esRef = useRef<EventSource | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await apiClient.getRuns();
      const seen = new Set<string>();
      const unique = data.runs.filter((r) => !seen.has(r.run_id) && seen.add(r.run_id));
      runsMapRef.current = new Map(unique.map((r) => [r.run_id, r]));
      setState({ data: unique, loading: false, error: null });
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
    const es = new EventSource(`${API_BASE}/api/runs/stream`);
    esRef.current = es;

    es.addEventListener("snapshot", (e) => {
      const runs: RunSummary[] = JSON.parse(e.data);
      runsMapRef.current = new Map(runs.map((r) => [r.run_id, r]));
      setState({ data: runs, loading: false, error: null });
    });

    es.addEventListener("run_update", (e) => {
      const run: RunSummary = JSON.parse(e.data);
      runsMapRef.current.set(run.run_id, run);
      const updated = Array.from(runsMapRef.current.values());
      setState({ data: updated, loading: false, error: null });
    });

    es.onerror = () => {
      // SSE disconnected — fall back to a single fetch then retry
      setState((prev) => ({ ...prev, error: null }));
      refetch();
      es.close();
      // Reconnect after 3s
      setTimeout(() => {
        esRef.current = null;
      }, 3_000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [refetch]);

  return { ...state, refetch };
}

export function useProjectRuns(projectId: string | null): ApiState<RunSummary[]> & { refetch: () => void } {
  const [state, setState] = useState<ApiState<RunSummary[]>>(initState);

  const refetch = useCallback(async () => {
    if (!projectId) { setState({ data: [], loading: false, error: null }); return; }
    try {
      const data = await apiClient.getProjectRuns(projectId);
      setState({ data: data.runs, loading: false, error: null });
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, [projectId]);

  useEffect(() => {
    setState(initState);
    refetch();
    const t = setInterval(refetch, 5_000);
    return () => clearInterval(t);
  }, [refetch]);

  return { ...state, refetch };
}

export function useRun(id: string | null): ApiState<RunSummary> & { refetch: () => void } {
  const [state, setState] = useState<ApiState<RunSummary>>(initState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiClient.getRun(id);
      setState({ data, loading: false, error: null });
      if (TERMINAL.has(data.status) && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setState(initState);
    fetch();
    intervalRef.current = setInterval(fetch, 3_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id, fetch]);

  return { ...state, refetch: fetch };
}

export function useRunTraces(id: string | null): ApiState<StepTrace[]> {
  const [state, setState] = useState<ApiState<StepTrace[]>>(initState);

  useEffect(() => {
    if (!id) return;
    setState(initState);
    apiClient
      .getRunTraces(id)
      .then((r) => setState({ data: r.traces, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: String(e) }));
  }, [id]);

  return state;
}

export function useTestCases(): ApiState<TestCaseInfo[]> {
  const [state, setState] = useState<ApiState<TestCaseInfo[]>>(initState);

  useEffect(() => {
    apiClient
      .getTestCases()
      .then((r) => setState({ data: r.test_cases, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: String(e) }));
  }, []);

  return state;
}

export function useCreateRun() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRun = useCallback(
    async (req: RunRequest) => {
      setLoading(true);
      setError(null);
      try {
        const run = await apiClient.createRun(req);
        router.push(`/app/runs/live?id=${run.run_id}`);
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    },
    [router],
  );

  return { createRun, loading, error };
}

export function useDeleteRun() {
  const [loading, setLoading] = useState(false);

  const deleteRun = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await apiClient.deleteRun(id);
      return res.cancelled;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteRun, loading };
}

export type TraceStreamState = {
  events: TraceEvent[];
  liveStatus: RunStatus | null;
  connected: boolean;
};

export function useRunTraceStream(runId: string | null): TraceStreamState {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [liveStatus, setLiveStatus] = useState<RunStatus | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!runId) return;
    setEvents([]);
    setLiveStatus(null);
    setConnected(false);

    let active = true;
    const ws = new WebSocket(apiClient.wsUrl(runId));

    ws.onopen = () => { if (active) setConnected(true); };
    ws.onclose = () => { if (active) setConnected(false); };
    ws.onerror = () => { /* suppress — onclose fires next */ };

    ws.onmessage = (e: MessageEvent<string>) => {
      if (!active) return;
      const event = JSON.parse(e.data) as TraceEvent;
      if (event.event_type === "ping") return;
      if (event.event_type === "current_state") {
        const s = (event.data as { status?: RunStatus }).status;
        if (s) setLiveStatus(s);
        return;
      }
      if (event.event_type === "run_started") setLiveStatus("running");
      if (event.event_type === "complete") {
        const s = (event.data as { status?: RunStatus }).status;
        if (s) setLiveStatus(s);
      }
      setEvents((prev) => [...prev, event]);
    };

    return () => {
      active = false;
      // Don't call close() while still CONNECTING — wait for open then close,
      // or just let it open and close. Prevents the StrictMode dev error.
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close();
      } else {
        ws.close();
      }
    };
  }, [runId]);

  return { events, liveStatus, connected };
}
