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
  triggered_by: string | null;
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
  browser_used: string | null;
  model_used: string | null;
  recording: boolean | null;
  max_steps_override: number | null;
  timeout_override: number | null;
  viewport: { width: number; height: number; device_scale_factor?: number } | null;
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
  test_case_path?: string;
  test_case_id?: string | null;
  model?: string;
  browser?: string | null;
  record?: boolean;
  max_steps?: number | null;
  timeout?: number | null;
  triggered_by?: string | null;
};

export type TestCaseSummary = {
  id: string;
  name: string;
  status: string;
  version: number;
  priority: string;
  tags: string[];
  created_by: string | null;
  last_run_status: string | null;
  last_run_at: string | null;
  last_run_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AssertionType =
  | "content" | "console" | "network" | "state" | "visual_design"
  | "text_present" | "element_present" | "url_contains"
  | "console_no_errors" | "network_request_made";

export type Auth = {
  method: "none" | "cookie_inject" | "login_flow" | "token_header";
  credentials_ref: string | null;
};

export type AssertionSpec = {
  id: string;
  type: AssertionType | string;
  description: string;
  params: Record<string, unknown>;
};

export type Checkpoint = {
  id: string;
  description: string;
  success_signal: string;
  data?: Record<string, unknown> | null;
  assertions?: AssertionSpec[];
};

export type GoalSpec = {
  objective: string;
  constraints: {
    max_steps: number;
    timeout_seconds: number;
    max_retries_per_action: number;
  };
  extra_details: string | null;
  steps: { checkpoints: Checkpoint[] } | null;
};

export type VaultEntry = {
  key: string;
  value: string;
};

export type TestCaseSpec = TestCaseSummary & {
  save_record: boolean;
  spec: {
    id: string;
    name: string;
    goal: GoalSpec;
    suite: string | null;
    priority: string;
    tags: string[];
    created_by: string | null;
    project: string | null;
    save_record: boolean;
    target: {
      url: string;
      browser: string;
      viewport: { width: number; height: number; device_scale_factor: number } | null;
      page_type: string;
      app_description: string | null;
      vault: VaultEntry[];
      locale: string | null;
      timezone: string | null;
      extra_headers: Record<string, string> | null;
      block_urls: string[];
    };
    assertions: AssertionSpec[];
    on_failure: {
      capture: {
        screenshot: boolean;
        dom_snapshot: boolean;
        network_log: boolean;
        console_log: boolean;
        agent_trace: boolean;
        video: boolean;
      };
      notify: Record<string, unknown>;
    } | null;
  };
};

export type Environment = {
  id: string;
  project_id: string;
  name: string;
  base_url: string;
  is_default: boolean;
  headers: Record<string, string>;
  created_at: string;
};

export type Baseline = {
  id: string;
  project_id: string;
  test_case_id: string | null;
  run_id: string | null;
  checkpoint_id: string | null;
  status: "pending_review" | "approved" | "rejected";
  diff_pct: number | null;
  screenshot_url: string | null;
  baseline_url: string | null;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

export type Schedule = {
  id: string;
  project_id: string;
  suite_id: string;
  cron: string;
  branch: string;
  enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
};

export type VaultSecret = {
  id: string;
  name: string;
  environment: string;
  type: string;
  masked_value: string;
  value: string | null;
  updated_at: string;
  created_at: string;
};

export type SuiteSummary = {
  id: string;
  name: string;
  description: string;
  test_case_ids: string[];
  test_count: number;
  pass_rate: number;
  last_run_at: string | null;
  created_at: string;
  group?: string | null;
};

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown>;
  created_at: string;
};

export type TraceEvent = {
  event_type: string;
  run_id: string;
  step_number?: number | null;
  data: Record<string, unknown>;
  timestamp: string;
};

// Module-level session state — set by the sidebar on session change
let _authEmail: string | null = null;
let _authToken: string | null = null;

export function setAuthUser(email: string | null) { _authEmail = email; }
export function setAuthToken(token: string | null) { _authToken = token; }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders: Record<string, string> = {};
  if (_authToken) {
    authHeaders["Authorization"] = `Bearer ${_authToken}`;
  } else if (_authEmail) {
    // Dev fallback when backend has no HAWKEYE_AUTH_SECRET configured
    authHeaders["X-User-Email"] = _authEmail;
  }
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders, ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const apiClient = {
  // Runs
  getRuns: () => apiFetch<{ runs: RunSummary[]; total: number }>("/api/runs"),
  getRun: (id: string) => apiFetch<RunSummary>(`/api/runs/${id}`),
  getRunTraces: (id: string) => apiFetch<{ run_id: string; traces: StepTrace[] }>(`/api/runs/${id}/traces`),
  createRun: (req: RunRequest) =>
    apiFetch<RunSummary>("/api/runs", { method: "POST", body: JSON.stringify(req) }),
  deleteRun: (id: string) =>
    apiFetch<{ cancelled: boolean }>(`/api/runs/${id}`, { method: "DELETE" }),
  getRunObserveUrl: (id: string) =>
    apiFetch<{ run_id: string; novnc_url: string }>(`/api/runs/${id}/observe`),
  getRunArtifacts: (id: string) =>
    apiFetch<{ run_id: string; artifacts: Array<{ name: string; type: string; url: string; size_bytes: number; step?: number }> }>(`/api/runs/${id}/artifacts`),
  wsUrl: (runId: string) =>
    `${API_URL.replace(/^https/, "wss").replace(/^http/, "ws")}/api/ws/runs/${runId}/trace`,

  // Legacy YAML test cases (used by /runs/new picker)
  getTestCases: () => apiFetch<{ test_cases: TestCaseInfo[] }>("/api/test-cases"),

  // Projects (Phase 5A)
  getProjects: () => apiFetch<{ projects: ProjectSummary[]; total: number }>("/api/projects"),
  createProject: (body: { name: string; slug: string; description?: string }) =>
    apiFetch<ProjectSummary>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  getProjectStats: (projectId: string) =>
    apiFetch<{ pass_rate: number; total_runs: number; active_runs: number; cost_this_month_usd: number }>(`/api/projects/${projectId}/stats`),

  // Test cases CRUD (Phase 5A)
  listProjectTestCases: (projectId: string, params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams({ status: "active", ...params }).toString();
    return apiFetch<{ test_cases: TestCaseSummary[]; total: number }>(`/api/projects/${projectId}/test-cases?${qs}`);
  },
  getProjectTestCase: (projectId: string, tcId: string) =>
    apiFetch<TestCaseSpec>(`/api/projects/${projectId}/test-cases/${tcId}`),
  getTestCaseRuns: (projectId: string, tcId: string) =>
    apiFetch<{ runs: RunSummary[]; total: number }>(`/api/projects/${projectId}/test-cases/${tcId}/runs`),
  createProjectTestCase: (projectId: string, body: unknown) =>
    apiFetch<TestCaseSummary>(`/api/projects/${projectId}/test-cases`, { method: "POST", body: JSON.stringify(body) }),
  updateProjectTestCase: (projectId: string, tcId: string, body: unknown) =>
    apiFetch<TestCaseSummary>(`/api/projects/${projectId}/test-cases/${tcId}`, { method: "PUT", body: JSON.stringify(body) }),
  archiveProjectTestCase: (projectId: string, tcId: string) =>
    apiFetch<{ archived: boolean }>(`/api/projects/${projectId}/test-cases/${tcId}`, { method: "DELETE" }),
  cloneProjectTestCase: (projectId: string, tcId: string) =>
    apiFetch<TestCaseSummary>(`/api/projects/${projectId}/test-cases/${tcId}/clone`, { method: "POST" }),
  importYaml: (projectId: string, yamlContent: string) =>
    apiFetch<TestCaseSummary>(`/api/projects/${projectId}/test-cases/import-yaml`, {
      method: "POST", body: JSON.stringify({ yaml_content: yamlContent }),
    }),

  // Test suites (Phase 5B)
  listSuites: (projectId: string) =>
    apiFetch<{ suites: SuiteSummary[]; total: number }>(`/api/projects/${projectId}/suites`),
  createSuite: (projectId: string, body: { name: string; description?: string; test_case_ids?: string[]; group?: string }) =>
    apiFetch<SuiteSummary>(`/api/projects/${projectId}/suites`, { method: "POST", body: JSON.stringify(body) }),
  getSuite: (projectId: string, suiteId: string) =>
    apiFetch<SuiteSummary>(`/api/projects/${projectId}/suites/${suiteId}`),
  updateSuite: (projectId: string, suiteId: string, body: Partial<{ name: string; description: string; test_case_ids: string[] }>) =>
    apiFetch<SuiteSummary>(`/api/projects/${projectId}/suites/${suiteId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSuite: (projectId: string, suiteId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/projects/${projectId}/suites/${suiteId}`, { method: "DELETE" }),

  addSuiteMember: (projectId: string, suiteId: string, testCaseId: string) =>
    apiFetch<{ suite_id: string; test_case_ids: string[] }>(
      `/api/projects/${projectId}/suites/${suiteId}/members`,
      { method: "POST", body: JSON.stringify({ test_case_id: testCaseId }) },
    ),

  removeSuiteMember: (projectId: string, suiteId: string, tcId: string) =>
    apiFetch<{ removed: boolean; test_case_ids: string[] }>(
      `/api/projects/${projectId}/suites/${suiteId}/members/${tcId}`,
      { method: "DELETE" },
    ),

  getSuiteSchedule: (projectId: string, suiteId: string) =>
    apiFetch<{ cron_expr: string | null; timezone: string; enabled: boolean; next_run_at: string | null }>(
      `/api/projects/${projectId}/suites/${suiteId}/schedule`,
    ),

  setSuiteSchedule: (projectId: string, suiteId: string, body: { cron_expr: string; timezone?: string; enabled?: boolean }) =>
    apiFetch<{ cron_expr: string | null; timezone: string; enabled: boolean; next_run_at: string | null }>(
      `/api/projects/${projectId}/suites/${suiteId}/schedule`,
      { method: "PUT", body: JSON.stringify(body) },
    ),

  getSuiteRuns: (projectId: string, suiteId: string) =>
    apiFetch<{ runs: RunSummary[]; total: number }>(`/api/projects/${projectId}/suites/${suiteId}/runs`),

  getSuiteGroups: (projectId: string) =>
    apiFetch<{ groups: string[] }>(`/api/projects/${projectId}/suite-groups`),
  updateSuiteGroup: (projectId: string, suiteId: string, group: string | null) =>
    apiFetch<SuiteSummary>(`/api/projects/${projectId}/suites/${suiteId}`, {
      method: "PUT",
      body: JSON.stringify({ group }),
    }),
  runSuite: (projectId: string, suiteId: string) =>
    apiFetch<{ suite_id: string; test_case_ids: string[]; message: string }>(`/api/projects/${projectId}/suites/${suiteId}/run`, { method: "POST" }),

  // Vault secrets (Phase 5C)
  listSecrets: (projectId: string, params?: { environment?: string; type?: string }) => {
    const qs = new URLSearchParams(params ?? {}).toString();
    return apiFetch<{ secrets: VaultSecret[]; total: number }>(`/api/projects/${projectId}/vault${qs ? `?${qs}` : ""}`);
  },
  createSecret: (projectId: string, body: { name: string; value: string; environment?: string; type?: string }) =>
    apiFetch<VaultSecret>(`/api/projects/${projectId}/vault`, { method: "POST", body: JSON.stringify(body) }),
  revealSecret: (projectId: string, secretId: string) =>
    apiFetch<VaultSecret>(`/api/projects/${projectId}/vault/${secretId}/reveal`),
  updateSecret: (projectId: string, secretId: string, body: { value?: string; environment?: string; type?: string }) =>
    apiFetch<VaultSecret>(`/api/projects/${projectId}/vault/${secretId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSecret: (projectId: string, secretId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/projects/${projectId}/vault/${secretId}`, { method: "DELETE" }),

  // Schedules (Phase 5D)
  listSchedules: (projectId: string, suiteId: string) =>
    apiFetch<{ schedules: Schedule[]; total: number }>(`/api/projects/${projectId}/suites/${suiteId}/schedules`),
  createSchedule: (projectId: string, suiteId: string, body: { cron: string; branch?: string; enabled?: boolean }) =>
    apiFetch<Schedule>(`/api/projects/${projectId}/suites/${suiteId}/schedules`, { method: "POST", body: JSON.stringify(body) }),
  deleteSchedule: (projectId: string, suiteId: string, scheduleId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/projects/${projectId}/suites/${suiteId}/schedules/${scheduleId}`, { method: "DELETE" }),

  // Billing / usage (Phase 5G)
  getUsage: () => apiFetch<{
    period: string;
    meters: Array<{ id: string; label: string; description: string; used: number; limit: number; unit: string }>;
    cost_usd: number;
    subscription: { plan: string; price_monthly: number; next_billing_date: string | null };
  }>("/api/usage"),

  getBillingPlans: () => apiFetch<{ plans: Array<{ id: string; name: string; price_monthly: number; limits: Record<string, number> }> }>("/api/billing/plans"),

  createBillingCheckout: (body: { plan: string; org_id: string }) =>
    apiFetch<{ checkout_url: string; stub?: boolean }>("/api/billing/checkout", { method: "POST", body: JSON.stringify(body) }),

  createBillingPortal: (body: { org_id: string }) =>
    apiFetch<{ portal_url: string; stub?: boolean }>("/api/billing/portal", { method: "POST", body: JSON.stringify(body) }),

  // Orgs + members (Phase 6F)
  getOrg: (orgId: string) => apiFetch<{ id: string; name: string; slug: string; plan: string; billing_email: string | null; created_at: string }>(`/api/orgs/${orgId}`),
  updateOrg: (orgId: string, body: { name?: string; billing_email?: string }) =>
    apiFetch<{ id: string; name: string }>(`/api/orgs/${orgId}`, { method: "PATCH", body: JSON.stringify(body) }),
  listMembers: (orgId: string) => apiFetch<{ members: Array<{ id: string; email: string; name: string; avatar_url?: string; role: string; joined_at: string }>; total: number }>(`/api/orgs/${orgId}/members`),
  updateMemberRole: (orgId: string, userId: string, role: string) =>
    apiFetch<{ updated: boolean }>(`/api/orgs/${orgId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (orgId: string, userId: string) =>
    apiFetch<{ removed: boolean }>(`/api/orgs/${orgId}/members/${userId}`, { method: "DELETE" }),
  inviteMember: (orgId: string, body: { email: string; role: string }) =>
    apiFetch<{ id: string; email: string; role: string; status: string }>(`/api/orgs/${orgId}/invitations`, { method: "POST", body: JSON.stringify(body) }),
  listInvitations: (orgId: string) => apiFetch<{ invitations: Array<{ id: string; email: string; role: string; status: string }> }>(`/api/orgs/${orgId}/invitations`),
  revokeInvitation: (orgId: string, invId: string) =>
    apiFetch<{ revoked: boolean }>(`/api/orgs/${orgId}/invitations/${invId}`, { method: "DELETE" }),

  // Environments (Phase 5)
  listEnvironments: (projectId: string) =>
    apiFetch<{ environments: Environment[]; total: number }>(`/api/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, body: { name: string; base_url: string; is_default?: boolean; headers?: Record<string, string> }) =>
    apiFetch<Environment>(`/api/projects/${projectId}/environments`, { method: "POST", body: JSON.stringify(body) }),
  updateEnvironment: (projectId: string, envId: string, body: Partial<{ name: string; base_url: string; is_default: boolean; headers: Record<string, string> }>) =>
    apiFetch<Environment>(`/api/projects/${projectId}/environments/${envId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteEnvironment: (projectId: string, envId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/projects/${projectId}/environments/${envId}`, { method: "DELETE" }),

  // Visual baselines (Phase 5 / 6F)
  listBaselines: (projectId: string, params?: { status?: string; test_case_id?: string }) => {
    const qs = new URLSearchParams(params ?? {}).toString();
    return apiFetch<{ baselines: Baseline[]; total: number }>(`/api/projects/${projectId}/baselines${qs ? `?${qs}` : ""}`);
  },
  getBaseline: (projectId: string, baselineId: string) =>
    apiFetch<Baseline>(`/api/projects/${projectId}/baselines/${baselineId}`),
  approveBaseline: (projectId: string, baselineId: string) =>
    apiFetch<{ approved: boolean }>(`/api/projects/${projectId}/baselines/${baselineId}/approve`, { method: "POST" }),
  rejectBaseline: (projectId: string, baselineId: string, reason: string) =>
    apiFetch<{ rejected: boolean }>(`/api/projects/${projectId}/baselines/${baselineId}/reject`, {
      method: "POST", body: JSON.stringify({ reason }),
    }),

  // Identity
  getMe: () => apiFetch<{ email: string; authenticated: boolean; role: string }>("/api/me"),
};
