# Hawkeye — Platform Architecture & Design

> AI-powered visual QA SaaS. Autonomous agents test web apps inside observable Docker sandboxes.
> Last updated: 2026-05-09 | Status: Phase 4 complete, Phase 5 in design

---

## 1. System Architecture

### 1.1 Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                                │
│  Browser (Next.js 16 / React 19)  │  CI/CD Webhook  │  CLI      │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS / WSS
┌────────────────────▼────────────────────────────────────────────┐
│                   API GATEWAY (Nginx)                           │
│  /api/* → hawkeye-api:8000   /novnc/* → sandbox containers     │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│              APPLICATION LAYER (FastAPI)                        │
│  REST Routes  │  WebSocket Manager  │  Auth Middleware          │
│  JobQueue     │  ArtifactStore      │  CORS / Rate-limit        │
└──────┬─────────────────┬────────────────────────────────────────┘
       │ Celery task      │ Redis pub/sub
┌──────▼──────┐   ┌──────▼──────────────────────────────────────┐
│   Redis     │   │          WORKER LAYER (Celery)              │
│  - run KV   │   │  run_test_case task                         │
│  - traces   │   │  ┌─────────────────────────────────────┐   │
│  - pub/sub  │   │  │         DOMAIN LAYER                │   │
│  - run IDs  │◄──│  │  RunManager → LangGraph Agent        │   │
└─────────────┘   │  │  ┌──────────────────────────────┐  │   │
                  │  │  │  OBSERVE → REASON → ACT       │  │   │
                  │  │  │  GOAL_CHECK → FINALIZE        │  │   │
                  │  │  └──────────────────────────────┘  │   │
                  │  │  TraceCollector │ AssertionEngine   │   │
                  │  │  ReportGenerator│ ArtifactStore     │   │
                  │  └─────────────────────────────────────┘   │
                  └─────────────────────────────────────────────┘
                          │ Docker API
┌─────────────────────────▼───────────────────────────────────────┐
│              SANDBOX LAYER (Docker containers)                   │
│  Playwright + Chromium │ Xvfb │ x11vnc │ websockify │ noVNC     │
│  Playwright MCP :3100  │ CDP :9222 proxied via socat :9223      │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│              STORAGE LAYER                                       │
│  PostgreSQL (entities)  │  Redis (runtime state)                │
│  LocalFS / S3 (artifacts)                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Request Data Flows

**Flow A — Submit a new run**
```
User clicks "Run" in UI
  → POST /api/runs { test_case_id, model, browser, ... }
  → JobQueue.submit() → generate run_id
  → save_run(record, status=queued) to Redis
  → celery_app.run_test_case.delay(run_id, request)
  → return RunResponse { run_id, status: queued }

Celery worker picks up task:
  → load_test_case(path or DB id)
  → RunManager.run(test_case)
    → SandboxManager.spawn() → Docker container
    → collector.on_sandbox_ready() → publish sandbox_ready event
    → tasks._ws_emitter intercepts → save novnc_url to Redis
    → LangGraph: OBSERVE → REASON → ACT loop
      → each step: TraceCollector.record_step()
      → ws_emitter publishes step event to Redis pub/sub
    → FINALIZE: AssertionEngine.run_all()
    → ReportGenerator → write artifacts/ dir
    → ArtifactStore.save_all() → upload to storage
  → _update_record(result) → Redis
  → save_traces(run_id, traces) → Redis
  → publish "complete" event
```

**Flow B — Live trace stream (WebSocket)**
```
Frontend opens: WS /api/ws/runs/{run_id}/trace
  → send current_state snapshot (Redis get_run)
  → if already terminal: close immediately
  → else: subscribe to Redis pub/sub channel hawkeye:events:{run_id}
    → forward each message to WS client
    → on complete/error event or terminal status: close

Worker publishes events:
  sandbox_ready  → { novnc_url }
  step_start     → { step_number }
  observe        → { url, title, snapshot_len }
  reason         → { agent_text }
  act            → { tool_name, tool_input }
  error          → { message, recoverable }
  complete       → { status }
```

**Flow C — Artifact retrieval**
```
Frontend: GET /api/runs/{id}/artifacts
  → ArtifactStore.list(run_id)
  → return manifest: [{ name, type, url, size_bytes }]

Frontend: GET /api/runs/{id}/artifacts/report.html
  → LocalArtifactStore: FileResponse(artifacts/{id}/report.html)
  → S3ArtifactStore: RedirectResponse(presigned_url, ttl=3600)
```

---

## 2. Entity Model (Database Schema)

### 2.1 PostgreSQL Tables

```sql
-- ─── IDENTITY ────────────────────────────────────────────────────

CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free'  -- free|pro|team|enterprise
                CHECK (plan IN ('free','pro','team','enterprise')),
  billing_email       TEXT,
  stripe_customer_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'google',  -- google|github|email
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'developer'  -- owner|admin|developer|viewer
               CHECK (role IN ('owner','admin','developer','viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- ─── PROJECT ─────────────────────────────────────────────────────

CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  description  TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at  TIMESTAMPTZ,
  settings     JSONB NOT NULL DEFAULT '{}',
  -- settings shape:
  -- { default_model, default_browser, default_max_steps,
  --   default_timeout, notify_on_failure, slack_webhook_url,
  --   email_recipients[] }
  UNIQUE (org_id, slug)
);

CREATE TABLE environments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,  -- production|staging|preview|local|custom
  base_url    TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  headers     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── TEST CASES ──────────────────────────────────────────────────

CREATE TABLE test_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'active'  -- active|draft|archived
                    CHECK (status IN ('active','draft','archived')),
  version         INT NOT NULL DEFAULT 1,
  spec            JSONB NOT NULL,
  -- spec mirrors orchestrator/models/test_case.py TestCase:
  -- { id, name, goal, target: { url, browser, viewport, auth, ... },
  --   priority, tags, steps: { mode, checkpoints[] },
  --   assertions[], constraints, context, on_failure }
  last_run_id     TEXT,
  last_run_status TEXT,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON test_cases (project_id, status);

-- ─── SUITES ──────────────────────────────────────────────────────

CREATE TABLE test_suites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  run_mode    TEXT NOT NULL DEFAULT 'parallel'  -- parallel|sequential
                CHECK (run_mode IN ('parallel','sequential')),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE suite_members (
  suite_id      UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  test_case_id  UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  position      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (suite_id, test_case_id)
);

CREATE TABLE suite_schedules (
  suite_id        UUID PRIMARY KEY REFERENCES test_suites(id) ON DELETE CASCADE,
  cron_expr       TEXT NOT NULL,  -- e.g. "0 9 * * 1-5"
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  environment_id  UUID REFERENCES environments(id),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ
);

CREATE TABLE suite_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id        UUID NOT NULL REFERENCES test_suites(id),
  triggered_by    TEXT NOT NULL,  -- user_id | "schedule" | "webhook"
  environment_id  UUID REFERENCES environments(id),
  status          TEXT NOT NULL DEFAULT 'running',
                  -- running|passed|failed|partial|cancelled
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  total_cases     INT NOT NULL DEFAULT 0,
  passed          INT NOT NULL DEFAULT 0,
  failed          INT NOT NULL DEFAULT 0,
  errored         INT NOT NULL DEFAULT 0,
  skipped         INT NOT NULL DEFAULT 0,
  total_cost_usd  NUMERIC(10,6),
  run_ids         JSONB NOT NULL DEFAULT '[]'  -- ["run-abc", "run-def", ...]
);

-- ─── VAULT ───────────────────────────────────────────────────────

CREATE TABLE vault_secrets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  encrypted_value  TEXT NOT NULL,  -- AES-256-GCM, key from KMS/env
  description      TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- ─── VISUAL BASELINES ────────────────────────────────────────────

CREATE TABLE visual_baselines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id     UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  checkpoint_id    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending_review',
                   -- pending_review|approved|rejected
  screenshot_url   TEXT,   -- artifact store URL
  diff_url         TEXT,   -- diff overlay artifact URL
  actual_url       TEXT,   -- actual screenshot URL
  diff_pct         NUMERIC(6,4),
  run_id           TEXT,   -- source run
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── INTEGRATIONS ────────────────────────────────────────────────

CREATE TABLE integrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,  -- github|slack|webhook
  config       JSONB NOT NULL DEFAULT '{}',
  -- github:  { repo, installation_id, suite_id, block_merge, env_id }
  -- slack:   { channel_id, webhook_url, notify_on: ["failure"] }
  -- webhook: { url, secret, events: ["run.complete"] }
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2 Redis Key Schema

```
hawkeye:run:{run_id}         STRING  JSON run record  TTL: 7d
hawkeye:run_ids              LIST    [run_id, ...]    max 100 entries
hawkeye:traces:{run_id}      LIST    [JSON StepTrace, ...]  TTL: 7d
hawkeye:events:{run_id}      CHANNEL pub/sub stream of TraceEvent JSON
hawkeye:artifacts:{run_id}   STRING  JSON artifact manifest  TTL: 7d
```

**Run record shape (Redis):**
```json
{
  "run_id": "run-abc12345",
  "status": "running",
  "test_name": "SauceDemo cart",
  "test_case_id": "uuid-or-null",
  "model": "nvidia:moonshotai/kimi-k2.6",
  "browser": "chromium",
  "request": { ...original RunRequest... },
  "created_at": "2026-05-09T10:00:00Z",
  "started_at": "2026-05-09T10:00:01Z",
  "completed_at": null,
  "novnc_url": "http://localhost:6080/vnc.html",
  "duration_s": null,
  "total_steps": null,
  "estimated_cost_usd": null,
  "termination_reason": null,
  "output_dir": null,
  "artifact_manifest": null,
  "assertion_results": null,
  "steps_completed": null,
  "total_input_tokens": null,
  "total_output_tokens": null,
  "error_count": null,
  "tool_call_count": null,
  "error_message": null,
  "celery_task_id": "celery-uuid",
  "expires_at": "2026-05-16T10:00:00Z"
}
```

**WebSocket event shape:**
```json
{
  "event_type": "observe",
  "run_id": "run-abc12345",
  "data": { "url": "https://example.com", "title": "Home" },
  "timestamp": "2026-05-09T10:00:05Z"
}
```

Event types: `sandbox_ready` | `run_started` | `step_start` | `observe` | `reason` | `act` | `error` | `complete` | `ping`

---

## 3. API Reference

### 3.1 Common Conventions

```
Base URL:        http://localhost:8000  (or NEXT_PUBLIC_API_URL)
Content-Type:    application/json
Auth header:     Authorization: Bearer <jwt>  (Phase 5E)
Error shape:     { "detail": "message" }  (FastAPI default)
Timestamps:      ISO 8601 UTC strings
IDs:             UUID v4 (DB entities) | "run-{hex8}" (Redis run records)
```

### 3.2 Health

```
GET /health
→ 200 { "status": "ok", "version": "0.1.0" }
```

### 3.3 Test Cases

```
GET /api/test-cases
→ 200 TestCaseListResponse
  {
    "test_cases": [
      {
        "id": "TC-001",
        "name": "Wikipedia search",
        "path": "/abs/path/wikipedia_search.yaml",
        "goal": "Search for 'LangGraph' ...",
        "browser": "chromium",
        "assertions": 2
      }
    ]
  }

POST /api/test-cases/validate
Body: { "path": "/abs/path/file.yaml" }
→ 200 { "valid": true, "error": null }
     | 200 { "valid": false, "error": "<reason>" }

# Phase 5A additions:
POST /api/projects/{project_id}/test-cases
Body: TestCaseCreateRequest
  {
    "name": "SauceDemo checkout",
    "goal": "Add item to cart and complete checkout",
    "target": {
      "url": "https://www.saucedemo.com",
      "browser": "chromium",
      "auth": { "method": "login_flow", "credentials_ref": "vault.SAUCE_USER" }
    },
    "priority": "P1",
    "tags": ["e2e", "checkout"],
    "steps": {
      "mode": "guided",
      "checkpoints": [
        { "id": "S1", "description": "Logged in", "success_signal": "Products page visible" },
        { "id": "S2", "description": "Item in cart", "success_signal": "Cart badge shows 1" }
      ]
    },
    "assertions": [
      { "id": "A1", "type": "content", "description": "Cart shows item",
        "params": { "check_type": "text_present", "text": "Sauce Labs" } }
    ],
    "constraints": { "max_steps": 20, "timeout_seconds": 120 }
  }
→ 201 TestCaseSummary { id, name, status, version, created_at }

GET /api/projects/{project_id}/test-cases
Query: ?status=active&tag=e2e&q=sauce&suite_id=&page=1&limit=20
→ 200 { "test_cases": [TestCaseSummary], "total": 12, "page": 1 }

GET /api/projects/{project_id}/test-cases/{tc_id}
→ 200 full TestCase spec (includes spec JSONB + metadata)

PUT /api/projects/{project_id}/test-cases/{tc_id}
Body: partial TestCaseCreateRequest (only changed fields)
→ 200 TestCaseSummary  (version auto-incremented)

DELETE /api/projects/{project_id}/test-cases/{tc_id}
→ 200 { "archived": true }

POST /api/projects/{project_id}/test-cases/{tc_id}/clone
→ 201 TestCaseSummary  (new id, version=1, name="{name} (copy)")

GET /api/projects/{project_id}/test-cases/{tc_id}/runs
Query: ?limit=20&page=1
→ 200 { "runs": [RunSummary], "total": 8 }

POST /api/projects/{project_id}/test-cases/import-yaml
Body: { "yaml_content": "..." }
→ 201 TestCaseSummary
```

### 3.4 Runs

```
POST /api/runs
Body: RunRequest
  {
    "test_case_path": "wikipedia_search.yaml",  # legacy: filename in test_cases/
    "test_case_id": "uuid",                      # Phase 5A: DB id (takes precedence)
    "model": "nvidia:moonshotai/kimi-k2.6",
    "browser": "chromium",                       # optional override
    "record": false,
    "figma_url": null,
    "figma_token": null,
    "max_steps": null,                           # null = use test case default
    "timeout": null,
    "environment_id": null                       # Phase 5A: override base URL
  }
→ 201 RunResponse

GET /api/runs
Query: ?status=running&test_case_id=uuid&project_id=uuid&limit=50&page=1
→ 200 { "runs": [RunSummary], "total": 142 }

GET /api/runs/{run_id}
→ 200 RunResponse
  {
    "run_id": "run-abc12345",
    "status": "passed",
    "test_name": "SauceDemo cart",
    "created_at": "2026-05-09T10:00:00Z",
    "duration_s": 47.3,
    "total_steps": 8,
    "estimated_cost_usd": 0.031,
    "termination_reason": "goal_complete",
    "novnc_url": null,
    "artifact_manifest": [
      { "name": "report.html", "type": "report",  "url": "/api/runs/run-abc12345/artifacts/report.html", "size_bytes": 48200 },
      { "name": "video.mp4",   "type": "video",   "url": "/api/runs/run-abc12345/artifacts/video.mp4",   "size_bytes": 9800000 },
      { "name": "screenshots/step_01.png", "type": "screenshot", "step": 1, "url": "..." }
    ],
    "assertion_results": [
      { "id": "A1", "type": "content", "description": "Cart shows item", "passed": true, "status": "passed", "details": null }
    ],
    "steps_completed": ["S1", "S2"],
    "total_input_tokens": 14200,
    "total_output_tokens": 3100,
    "error_count": 0,
    "tool_call_count": 12,
    "error_message": null
  }

DELETE /api/runs/{run_id}
→ 200 { "cancelled": true }

GET /api/runs/{run_id}/traces
→ 200 { "run_id": "run-abc12345", "traces": [StepTrace, ...] }

StepTrace shape:
  {
    "step_number": 3,
    "timestamp": 1715248805.123,
    "tool_name": "browser_click",
    "tool_input": { "element": "[ref=e47]", "ref": "e47" },
    "tool_success": true,
    "page_url": "https://www.saucedemo.com/inventory.html",
    "page_title": "Swag Labs",
    "input_tokens": 1820,
    "output_tokens": 340,
    "estimated_cost_usd": 0.00391,
    "llm_latency_ms": 1240,
    "tool_execution_latency_ms": 380,
    "total_step_latency_ms": 1650,
    "screenshot_b64": null  # base64 PNG or null
  }

GET /api/runs/{run_id}/observe
→ 200 { "run_id": "run-abc12345", "novnc_url": "http://localhost:6080/vnc.html" }
→ 404 if no novnc_url yet

GET /api/runs/{run_id}/artifacts
→ 200 { "run_id": "run-abc12345", "artifacts": [ArtifactMeta, ...] }

GET /api/runs/{run_id}/artifacts/{filename}
→ FileResponse (local) or 302 redirect to presigned URL (S3)

WS /api/ws/runs/{run_id}/trace
Messages from server → client:
  { "event_type": "current_state", "run_id": "...", "data": {RunRecord}, "timestamp": "..." }
  { "event_type": "sandbox_ready", "data": { "novnc_url": "http://..." } }
  { "event_type": "step_start",    "data": { "step_number": 3 } }
  { "event_type": "observe",       "data": { "url": "...", "title": "..." } }
  { "event_type": "reason",        "data": { "text": "I will click the Add to Cart button" } }
  { "event_type": "act",           "data": { "tool": "browser_click", "input": {...} } }
  { "event_type": "error",         "data": { "message": "...", "recoverable": true } }
  { "event_type": "complete",      "data": { "status": "passed" } }
  { "event_type": "ping" }
```

### 3.5 Test Suites (Phase 5B)

```
POST   /api/projects/{project_id}/suites
Body:  { "name", "description", "run_mode": "parallel|sequential" }
→ 201  SuiteSummary { id, name, run_mode, member_count, created_at }

GET    /api/projects/{project_id}/suites
→ 200  { "suites": [SuiteSummary], "total": N }

GET    /api/projects/{project_id}/suites/{suite_id}
→ 200  SuiteDetail { ...SuiteSummary, members: [TestCaseSummary], schedule }

PUT    /api/projects/{project_id}/suites/{suite_id}
→ 200  SuiteSummary

DELETE /api/projects/{project_id}/suites/{suite_id}
→ 200  { "archived": true }

POST   /api/projects/{project_id}/suites/{suite_id}/members
Body:  { "test_case_id": "uuid", "position": 0 }
→ 200  { "added": true }

DELETE /api/projects/{project_id}/suites/{suite_id}/members/{tc_id}
→ 200  { "removed": true }

PUT    /api/projects/{project_id}/suites/{suite_id}/members/reorder
Body:  { "order": ["tc_id_1", "tc_id_2", "tc_id_3"] }
→ 200  { "reordered": true }

POST   /api/projects/{project_id}/suites/{suite_id}/run
Body:  { "environment_id": null, "model": null }  # optional overrides
→ 202  SuiteRunResponse { suite_run_id, status, run_ids: [...] }

GET    /api/projects/{project_id}/suites/{suite_id}/runs
→ 200  { "runs": [SuiteRunSummary], "total": N }

GET    /api/projects/{project_id}/suites/{suite_id}/runs/{suite_run_id}
→ 200  SuiteRunDetail { id, status, runs: [RunSummary], total_cost_usd, ... }

GET    /api/projects/{project_id}/suites/{suite_id}/schedule
→ 200  { "cron_expr": "0 9 * * 1-5", "timezone": "UTC", "enabled": true, "next_run_at": "..." }

PUT    /api/projects/{project_id}/suites/{suite_id}/schedule
Body:  { "cron_expr": "0 9 * * 1-5", "timezone": "America/New_York", "environment_id": null, "enabled": true }
→ 200  schedule record

WS     /api/ws/suite-runs/{suite_run_id}
Messages: { "event_type": "run_update", "run_id": "...", "status": "passed" }
          { "event_type": "suite_complete", "data": { "passed": 4, "failed": 1 } }
```

### 3.6 Projects & Organizations (Phase 5A/5E)

```
POST   /api/projects
Body:  { "name", "slug", "description", "org_id" }
→ 201  ProjectSummary

GET    /api/projects
Query: ?org_id=uuid
→ 200  { "projects": [ProjectSummary], "total": N }

GET    /api/projects/{project_id}
→ 200  ProjectDetail { ...ProjectSummary, settings, environments }

PUT    /api/projects/{project_id}
→ 200  ProjectSummary

GET    /api/projects/{project_id}/stats
→ 200  {
         "pass_rate": 0.87,
         "total_runs": 142,
         "runs_today": 12,
         "active_runs": 2,
         "cost_this_month_usd": 4.23,
         "trend_7d": [{ "date": "2026-05-03", "passed": 8, "failed": 2 }]
       }

POST   /api/orgs
GET    /api/orgs/{slug}
PUT    /api/orgs/{slug}
GET    /api/orgs/{slug}/members
POST   /api/orgs/{slug}/members    Body: { email, role }
PUT    /api/orgs/{slug}/members/{user_id}  Body: { role }
DELETE /api/orgs/{slug}/members/{user_id}
```

### 3.7 Environments & Vault (Phase 5C)

```
POST   /api/projects/{project_id}/environments
Body:  { "name", "base_url", "is_default": false, "headers": {} }
→ 201  Environment { id, name, base_url, is_default }

GET    /api/projects/{project_id}/environments
→ 200  { "environments": [Environment] }

PUT    /api/projects/{project_id}/environments/{env_id}
DELETE /api/projects/{project_id}/environments/{env_id}

GET    /api/projects/{project_id}/vault
→ 200  { "secrets": [{ "id", "key", "description", "created_at" }] }  # values masked

POST   /api/projects/{project_id}/vault
Body:  { "key": "SAUCE_PASSWORD", "value": "secret_sauce", "description": "" }
→ 201  { "id", "key", "created_at" }

PUT    /api/projects/{project_id}/vault/{key}
Body:  { "value": "new_value" }
→ 200  { "updated": true }

DELETE /api/projects/{project_id}/vault/{key}
→ 200  { "deleted": true }
```

### 3.8 Visual Baselines

```
GET    /api/projects/{project_id}/baselines
Query: ?status=pending_review&test_case_id=uuid
→ 200  { "baselines": [BaselineSummary], "total": N }

GET    /api/projects/{project_id}/baselines/{baseline_id}
→ 200  BaselineDetail {
         id, test_case_id, checkpoint_id, status, diff_pct,
         screenshot_url, actual_url, diff_url,  # from artifact store
         run_id, created_at
       }

POST   /api/projects/{project_id}/baselines/{baseline_id}/approve
→ 200  { "approved": true }

POST   /api/projects/{project_id}/baselines/{baseline_id}/reject
Body:  { "reason": "" }
→ 200  { "rejected": true }
```

### 3.9 Integrations & Webhooks (Phase 5D)

```
GET    /api/projects/{project_id}/integrations
→ 200  { "integrations": [Integration] }

POST   /api/projects/{project_id}/integrations/github
Body:  { "repo": "org/repo", "installation_id": 12345, "suite_id": "uuid",
          "block_merge": true, "environment_id": "uuid" }
→ 201  Integration

POST   /api/projects/{project_id}/integrations/slack
Body:  { "webhook_url": "https://hooks.slack.com/...", "notify_on": ["failure"] }
→ 201  Integration

DELETE /api/projects/{project_id}/integrations/{integration_id}
→ 200  { "deleted": true }

POST   /api/webhooks/{project_token}/trigger
Body:  { "suite_id": "uuid", "environment": "staging", "ref": "main",
          "preview_url": "https://pr-42.preview.example.com" }
→ 202  { "suite_run_id": "uuid", "status": "queued" }
```

### 3.10 Auth

```
POST /auth/login    Body: { provider: "google"|"github" }  → redirect to OAuth
POST /auth/logout
GET  /auth/me
→ 200  { "id", "email", "name", "avatar_url",
          "memberships": [{ org_id, org_slug, role }] }
```

### 3.11 Billing (Phase 5E)

```
GET  /api/billing/plans
→ 200  { "plans": [PlanDef] }

GET  /api/billing/usage
→ 200  { "plan": "pro", "period_start": "...", "period_end": "...",
          "runs_used": 87, "runs_limit": 500,
          "cost_usd": 4.23, "parallel_used": 1, "parallel_limit": 2 }

POST /api/billing/checkout   Body: { plan: "pro", org_id: "uuid" }
→ 200 { "checkout_url": "https://checkout.stripe.com/..." }

POST /api/billing/portal
→ 200 { "portal_url": "https://billing.stripe.com/..." }
```

---

## 4. Artifact Management

### 4.1 Storage Interface

```python
class ArtifactStore(Protocol):
    def save(self, run_id: str, filename: str, data: bytes) -> ArtifactMeta: ...
    def get_url(self, run_id: str, filename: str, ttl_s: int = 3600) -> str: ...
    def list(self, run_id: str) -> list[ArtifactMeta]: ...
    def delete_run(self, run_id: str) -> None: ...

@dataclass
class ArtifactMeta:
    name: str          # relative path: "screenshots/step_01.png"
    type: str          # report|video|screenshot|diff|trace
    url: str           # served URL or presigned URL
    size_bytes: int
    step: int | None = None          # for screenshots
    assertion_id: str | None = None  # for diffs
```

Backend selection via `ARTIFACT_STORE=local|s3` env var.

### 4.2 Artifact Bundle per Run

```
artifacts/
  run-{id}/
    report.html          # self-contained: inline CSS, base64 screenshots
    report.md            # markdown summary
    trace.json           # full StepTrace[] as JSON
    video.mp4            # screen recording (only if record=true)
    screenshots/
      step_01.png        # individual PNG per step (written by report_generator)
      step_02.png
    diffs/
      {assertion_id}_baseline.png
      {assertion_id}_actual.png
      {assertion_id}_diff.png      # pixel diff overlay
```

### 4.3 Retention by Plan

| Plan | TTL | Max per run | Total quota |
|------|-----|-------------|-------------|
| Free | 7d | 100 MB | 500 MB |
| Pro | 30d | 500 MB | 10 GB |
| Team | 90d | 1 GB | 100 GB |
| Enterprise | Custom | Custom | Custom |

Cleanup: Celery Beat daily task, `expires_at` stored in Redis run record.

---

## 5. User Roles & Permissions

| Action | Viewer | Developer | Admin | Owner |
|--------|:------:|:---------:|:-----:|:-----:|
| View runs & reports | ✓ | ✓ | ✓ | ✓ |
| View artifacts | ✓ | ✓ | ✓ | ✓ |
| Run test cases | – | ✓ | ✓ | ✓ |
| Create/edit test cases | – | ✓ | ✓ | ✓ |
| Delete own test cases | – | ✓ | ✓ | ✓ |
| Delete any test case | – | – | ✓ | ✓ |
| Manage suites | – | ✓ | ✓ | ✓ |
| Approve visual baselines | – | ✓ | ✓ | ✓ |
| Manage vault secrets | – | – | ✓ | ✓ |
| Manage environments | – | – | ✓ | ✓ |
| Manage integrations | – | – | ✓ | ✓ |
| Invite/remove members | – | – | ✓ | ✓ |
| Billing & plan | – | – | – | ✓ |

---

## 6. UI Page Structure

```
# Auth
/auth/login
/auth/signup
/auth/recovery

# Global Hub (no project context)
/app                                  Project selector
/app/account                          Profile, API keys
/app/billing                          Plan, usage meter, upgrade
/app/orgs/:slug/settings              Org settings, members

# Project Workspace
/app/:projectSlug/dashboard           KPIs, recent runs, quick actions

/app/:projectSlug/test-cases          Library (card grid, search, filter)
/app/:projectSlug/test-cases/new      5-step creation wizard
/app/:projectSlug/test-cases/:id      Detail: spec + run history + baselines
/app/:projectSlug/test-cases/:id/edit Edit wizard

/app/:projectSlug/suites              Suite library
/app/:projectSlug/suites/new          Create suite
/app/:projectSlug/suites/:id          Detail: members + runs + schedule

/app/:projectSlug/runs                All runs (filterable table)
/app/:projectSlug/runs/new            Launch drawer → selects test case + overrides
/app/:projectSlug/runs/live           Live view: WS trace + noVNC iframe
/app/:projectSlug/runs/:id/report     Report: summary + assertions + screenshots

/app/:projectSlug/baselines           Visual baseline approval queue
/app/:projectSlug/vault               Secret management
/app/:projectSlug/settings            Settings + environments + integrations
```

---

## 7. Key User Workflows

### A. Onboarding
```
1. OAuth login (Google / GitHub)
2. Create Organization (name, slug)
3. Create Project (name, base URL → auto-creates "production" environment)
4. Invite teammates → role assignment → email invite
5. Create first Test Case via wizard
6. Run it → live feed → view report
```

### B. Test Case Creation Wizard (5 steps)
```
Step 1 — Basics
  Name, Target URL, Browser, Priority (P0–P3), Tags
  Suite (optional — assign to existing suite)

Step 2 — Goal
  Natural language goal (textarea)
  Page type: SPA | SSR | static | streaming
  App description: auth method, known quirks, hints

Step 3 — Checkpoints (guided mode)
  Toggle: Guided mode on/off
  Rows: [ ID ] [ What should happen ] [ Success signal ]
  e.g.: S1 | Logged in     | Products page is visible
        S2 | Item in cart   | Cart badge shows 1

Step 4 — Assertions
  Add assertion cards (type-driven):
  content:  check_type (text_present|text_absent|selector_present), value
  console:  max_error_count, ignore_patterns[]
  network:  url_pattern, expected_status_code

Step 5 — Constraints & Auth
  Max steps (slider 10–100), Timeout (seconds)
  Agent hints (ordered list)
  Forbidden actions
  Auth: none | login_flow (vault refs) | cookie_inject | token_header

Right panel: live YAML preview (mirrors TestCase Pydantic model)
Save → /test-cases/:id
Save & Run → run drawer → /runs/live?id=X
```

### C. Suite Management
```
Suites page → New Suite → name, description, run mode
Add test cases (search + multi-select + drag to reorder)

Suite detail:
  Members tab: list, reorder, add/remove
  Runs tab:    suite run history, pass rate per run
  Schedule tab:
    Cron expression (with human-readable preview)
    Environment selector, notify-on-failure toggle

Run Suite button:
  → drawer: environment override, model override
  → POST …/suites/:id/run
  → Suite Run live view: grid of test case cards (live status each)
    Aggregate: X/N passed, cost so far, elapsed time
    Click card → individual run live page
```

### D. CI/CD Integration
```
Settings → Integrations → Connect GitHub App
  Select repo, select suite, select environment
  "Block merge on failure" toggle

On PR open/update:
  GitHub → POST /api/webhooks/:token/trigger { suite_id, preview_url }
  Hawkeye runs suite against preview URL
  Posts GitHub Check Run (pending → pass/fail)
  PR comment: table of results + report links
```

### E. Visual Baseline Approval
```
After visual_design assertion run:
  Screenshots captured per checkpoint
  Diffed against approved baseline
  No baseline → pending_review entry created
  Diff > threshold → run fails + pending_review created

Baselines page:
  Approval queue (pending items)
  Three-panel: baseline | actual | diff overlay
  Approve → screenshot becomes new baseline
  Reject → regression flag, run stays failed
  Bulk approve for initial setup
```

### F. Vault Usage
```
Vault page: add secret
  Key: SAUCE_PASSWORD
  Value: secret_sauce  (AES-256-GCM encrypted at rest)

In test case wizard, Step 5 → Auth:
  Method: login_flow
  Credential ref: {{ vault.SAUCE_PASSWORD }}

At run time:
  Vault ref resolved by RunManager before agent receives system prompt
  Value never written to traces, logs, or artifacts
```

---

## 8. Architecture Decisions (ADRs)

### ADR-001: Redis as primary runtime store, PostgreSQL for entities
**Context:** Runs need sub-second status updates; entities need relational integrity.
**Decision:** Redis for run records, traces, pub/sub (TTL-based, survives API restart via Celery). PostgreSQL for test cases, suites, projects, users (durable, queryable).
**Trade-off:** Two stores to operate. Mitigated by docker-compose and clear boundary: Redis = runtime, Postgres = entities.

### ADR-002: Celery + Redis over asyncio task queue
**Context:** Phase 3 started with in-process asyncio job queue.
**Decision:** Migrated to Celery so runs survive API restarts and support N parallel workers.
**Trade-off:** Adds Redis dependency and worker process. Justified by persistence and horizontal scale.

### ADR-003: ArtifactStore protocol for pluggable storage
**Context:** Local filesystem works for dev but breaks in container restarts and won't scale.
**Decision:** `LocalArtifactStore` (FileResponse) for dev/self-hosted; `S3ArtifactStore` (presigned URLs) for production. Swapped via `ARTIFACT_STORE` env var.
**Trade-off:** Extra abstraction layer. Justified: forces correct URL contract from day 1.

### ADR-004: TestCase stored as JSONB spec in PostgreSQL
**Context:** TestCase Pydantic model has nested structure (target, steps, assertions, constraints).
**Decision:** Store full spec as JSONB column. Validate against Pydantic model on read/write.
**Trade-off:** No SQL-level querying of spec fields. Acceptable: filtering is by project/status/tag, not spec internals.

### ADR-005: Modular monolith → extract workers only when justified
**Context:** Team is small; domain boundaries inside orchestrator are not fully stable yet.
**Decision:** Single FastAPI app + Celery workers in same repo. No microservices split.
**Trigger to split:** Worker CPU/memory profile diverges significantly, OR separate team needs independent deploy.

---

## 9. Infrastructure & Deployment

### 9.1 Docker Compose (dev)
```yaml
services:
  hawkeye-api:      # FastAPI on :8000
  hawkeye-worker:   # Celery --concurrency 2
  hawkeye-redis:    # Redis 7 on :6379
  hawkeye-nginx:    # Nginx on :80 (proxy + noVNC)
  hawkeye-db:       # PostgreSQL 16 on :5432  (Phase 5A)
```

### 9.2 Environment Variables
```bash
# Required
REDIS_URL=redis://localhost:6379/0
NEXT_PUBLIC_API_URL=http://localhost:8000

# LLM providers (at least one required)
OPENROUTER_API_KEY=
NVIDIA_API_KEY=
GROQ_API_KEY=

# Optional
HAWKEYE_POOL_SIZE=0          # pre-warmed container pool size
HAWKEYE_DB_URL=              # PostgreSQL DSN (enables DB persistence)
ARTIFACT_STORE=local         # local|s3
ARTIFACT_S3_BUCKET=          # required if ARTIFACT_STORE=s3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
VAULT_ENCRYPTION_KEY=        # 32-byte hex for AES-256-GCM vault encryption
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

### 9.3 Nginx Config (dev)
```nginx
/api/*           → proxy_pass http://hawkeye-api:8000
/api/ws/*        → proxy_pass + upgrade WebSocket
/novnc/*         → proxy_pass http://{container_ip}:6080  # per-run routing
```

---

## 10. Implementation Roadmap

### Phase 4 — Frontend ↔ Backend Wiring ✅ COMPLETE
- API client layer (`src/lib/api/client.ts`, `hooks.ts`)
- Dashboard, New Run, Live Execution, Run Report pages wired to real API
- WebSocket trace stream with StrictMode-safe lifecycle
- noVNC iframe with `resize=scale&autoconnect=1`
- Redis deduplication fix, `novnc_url` propagation via `sandbox_ready` event

### Phase 5A — Project & Test Case Management
*Unlocks: users create tests from UI, no YAML files required*

Backend:
- `projects`, `test_cases`, `environments` tables (schema §2.1)
- `GET/POST/PUT/DELETE /api/projects/:id/test-cases`
- `RunRequest` accepts `test_case_id` → DB lookup → override target URL if `environment_id` set
- Auto-import existing YAML files into DB on startup

Frontend:
- Test case library page with search/filter/card grid
- 5-step creation wizard (§7B) with live YAML preview
- Test case detail page (spec + run history)
- `/runs/new` becomes a drawer: pick test case + overrides

### Phase 5B — Test Suites
*Unlocks: run groups of tests together, aggregate results*

Backend:
- `test_suites`, `suite_members`, `suite_runs` tables
- `POST …/suites/:id/run` → batch N Celery tasks → `SuiteRun` record
- `WS /api/ws/suite-runs/:srid` aggregates per-run status updates

Frontend:
- Suite library, detail (members + drag reorder), schedule form
- Suite Run live view: grid of run cards with live status

### Phase 5C — Environments & Vault
*Unlocks: run same test against staging/production, inject secrets*

Backend:
- `environments`, `vault_secrets` tables
- Vault CRUD with AES-256-GCM encryption
- `RunManager` resolves `{{ vault.KEY }}` refs in test case before agent start
- `environment_id` in `RunRequest` → overrides `target.url` at runtime

Frontend:
- Vault page (keys visible, values masked)
- Environment management in project settings

### Phase 5D — Scheduling & CI/CD
*Unlocks: automated regression runs on commit/PR*

Backend:
- Celery Beat: `suite_schedules` table → fire suite runs at cron time
- `POST /api/webhooks/:token/trigger` → GitHub Actions integration
- GitHub Check Run API: post pass/fail status + PR comment
- Slack notification on run failure

### Phase 5E — Multi-tenancy & Auth
*Unlocks: team accounts, role-based access, commercial operations*

Backend:
- `organizations`, `memberships` tables
- JWT middleware: validate token → attach user + org context to every request
- Row-level auth: all project/test-case endpoints check `membership.role`
- Invitation flow: send email (Resend/SendGrid) with signed invite token

Frontend:
- Organization settings + member management
- Role-based UI gating (hide write actions for viewer role)
- Invitation acceptance flow

### Phase 5F — Artifact Store
*Unlocks: downloadable reports, video playback, baseline screenshots*

Backend:
- `Backend/api/artifact_store.py`: `ArtifactStore` protocol + `LocalArtifactStore`
- `Backend/api/routes/artifacts.py`: manifest + file serve endpoints
- `report_generator.py`: write `screenshots/step_N.png` files (not base64-only)
- `tasks.py`: call `store.save_all()` after run; write `artifact_manifest` to Redis
- `schemas.py`: add `artifact_manifest` to `RunResponse`
- Celery Beat cleanup task for expired artifacts

Frontend:
- Report page: download buttons (HTML, video, JSON)
- Report page: screenshot gallery with lightbox
- Report page: diff three-panel viewer (baseline / actual / overlay)
- Baselines page: `screenshot_url` / `diff_url` from artifact store

### Phase 5G — Billing & Usage Metering
*Unlocks: SaaS monetization*

Backend:
- Usage counter: increment `runs_used` per org per month on run completion
- Enforce plan limits: reject `POST /api/runs` when `runs_used >= runs_limit`
- Stripe: checkout session, customer portal, webhook for subscription events

Frontend:
- Billing page (plan card, usage meter, Stripe portal embed)
- Upgrade prompts on limit hit

---

## 11. Critical Files

### Existing (Phase 4)
```
Backend/api/app.py                       FastAPI app, CORS, lifespan
Backend/api/routes/runs.py               Run CRUD + traces + observe
Backend/api/routes/test_cases.py         YAML scanner (to be replaced in 5A)
Backend/api/routes/ws.py                 WebSocket trace stream
Backend/api/tasks.py                     Celery task: run_test_case
Backend/api/redis_store.py               Run KV, traces list, pub/sub
Backend/api/job_queue.py                 JobQueue: submit, cancel, get
Backend/api/schemas.py                   Pydantic request/response models
Backend/api/celery_app.py                Celery config
Backend/orchestrator/runner/run_manager.py  Full test lifecycle
Backend/orchestrator/agent/graph.py         LangGraph StateGraph
Backend/orchestrator/trace/collector.py     Per-step trace accumulator
Backend/orchestrator/reporting/report_generator.py  HTML + MD reports
Frontend/hawkeye-web/src/lib/api/client.ts  Typed API client
Frontend/hawkeye-web/src/lib/api/hooks.ts   React hooks (polling + WS)
```

### To Create (Phase 5A–5G)
```
Backend/api/routes/projects.py           Project CRUD + stats
Backend/api/routes/artifacts.py          Artifact manifest + serve
Backend/api/artifact_store.py            ArtifactStore protocol + LocalArtifactStore
Backend/api/routes/suites.py             Suite CRUD + run + schedule
Backend/api/routes/environments.py       Environment CRUD
Backend/api/routes/vault.py              Vault CRUD (encrypted)
Backend/api/routes/baselines.py          Visual baseline approval
Backend/api/routes/integrations.py       GitHub/Slack/webhook
Backend/api/routes/webhooks.py           CI/CD trigger endpoint
Backend/api/routes/billing.py            Stripe checkout/portal
Backend/api/routes/auth.py               JWT middleware + /auth/me
Backend/orchestrator/db/schema.sql       Full PostgreSQL schema (§2.1)
Frontend/src/app/app/(workspace)/test-cases/        Library + wizard + detail
Frontend/src/app/app/(workspace)/suites/            Suite pages
Frontend/src/app/app/(workspace)/baselines/         Approval queue
Frontend/src/app/app/(workspace)/vault/             Secrets manager
Frontend/src/app/app/(workspace)/settings/          Environments + integrations
Frontend/src/components/test-case/WizardSteps.tsx   5-step wizard
Frontend/src/components/run/RunDrawer.tsx            Shared run launch drawer
Frontend/src/components/artifacts/                  Report viewer, gallery, diff
```

---

## 12. Billing & Plans

| Feature | Free | Pro ($49/mo) | Team ($199/mo) | Enterprise |
|---------|:----:|:------------:|:--------------:|:----------:|
| Projects | 1 | 5 | Unlimited | Unlimited |
| Team members | 1 | 3 | 20 | Unlimited |
| Runs / month | 50 | 500 | 2,000 | Custom |
| Parallel runs | 1 | 2 | 5 | Custom |
| Artifact retention | 7d | 30d | 90d | Custom |
| Visual diff (Figma) | – | ✓ | ✓ | ✓ |
| Scheduled suites | – | ✓ | ✓ | ✓ |
| GitHub CI integration | – | ✓ | ✓ | ✓ |
| Vault secrets | – | ✓ | ✓ | ✓ |
| SSO / SAML | – | – | – | ✓ |
| Self-hosted option | – | – | – | ✓ |

Billing model: subscription + LLM cost pass-through at cost (no markup).
