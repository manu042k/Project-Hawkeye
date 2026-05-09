const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export type RunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "errored"
  | "timed_out"
  | "blocked"
  | "cancelled";

export type AssertionResult = {
  id: string;
  type: string;
  description: string;
  passed: boolean;
  status: string;
  details: string | null;
};

export type RunSummary = {
  run_id: string;
  status: RunStatus;
  test_name: string | null;
  created_at: string;
  duration_s: number | null;
  total_steps: number | null;
  estimated_cost_usd: number | null;
  termination_reason: string | null;
  output_dir: string | null;
  novnc_url: string | null;
  assertion_results: AssertionResult[] | null;
  error_message: string | null;
  steps_completed: string[] | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  error_count: number | null;
  tool_call_count: number | null;
};

export type StepTrace = {
  step_number: number;
  timestamp: number;
  completed_at: number | null;
  checkpoint_id: string | null;
  checkpoint_completed: boolean;
  model: string;
  input_tokens: number;
  output_tokens: number;
  llm_latency_ms: number;
  tool_name: string | null;
  tool_source: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: unknown;
  tool_success: boolean;
  tool_error: string | null;
  tool_retries: number;
  agent_output_text: string | null;
  stop_reason: string | null;
  page_url: string;
  page_title: string;
  screenshot_b64: string | null;
  wait_for_stable_ms: number;
  tool_execution_latency_ms: number;
  total_step_latency_ms: number;
  estimated_cost_usd: number;
};

export type TestCaseInfo = {
  id: string;
  name: string;
  path: string;
  goal: string;
  browser: string;
  assertions: number;
};

export type RunRequest = {
  test_case_path: string;
  model?: string;
  browser?: string | null;
  record?: boolean;
  max_steps?: number | null;
  timeout?: number | null;
};

export type TraceEvent = {
  event_type: string;
  run_id: string;
  step_number?: number | null;
  data: Record<string, unknown>;
  timestamp: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const apiClient = {
  getRuns: () => apiFetch<{ runs: RunSummary[]; total: number }>("/api/runs"),
  getRun: (id: string) => apiFetch<RunSummary>(`/api/runs/${id}`),
  getRunTraces: (id: string) => apiFetch<{ run_id: string; traces: StepTrace[] }>(`/api/runs/${id}/traces`),
  createRun: (req: RunRequest) =>
    apiFetch<RunSummary>("/api/runs", { method: "POST", body: JSON.stringify(req) }),
  deleteRun: (id: string) =>
    apiFetch<{ cancelled: boolean }>(`/api/runs/${id}`, { method: "DELETE" }),
  getTestCases: () => apiFetch<{ test_cases: TestCaseInfo[] }>("/api/test-cases"),
  getRunObserveUrl: (id: string) =>
    apiFetch<{ run_id: string; novnc_url: string }>(`/api/runs/${id}/observe`),
  wsUrl: (runId: string) =>
    `${API_URL.replace(/^https/, "wss").replace(/^http/, "ws")}/api/ws/runs/${runId}/trace`,
};
