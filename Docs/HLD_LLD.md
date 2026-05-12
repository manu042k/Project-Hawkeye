# Project Hawkeye — HLD & LLD
**Based on master template:** `Backend/orchestrator/test_cases/_template.yaml`

---

## Table of Contents
1. [High-Level Design (HLD)](#1-high-level-design)
2. [API Reference — LLD](#2-api-reference)
3. [Agent Graph — LLD](#3-agent-graph)
4. [Data Models](#4-data-models)
5. [Redis Schema](#5-redis-schema)
6. [Run Lifecycle](#6-run-lifecycle)
7. [Implementation Status](#7-implementation-status)
8. [Changes Required](#8-changes-required)

---

## 1. High-Level Design

### 1.1 System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                            │
│   Next.js Dashboard  │  CI/CD Plugin  │  GitHub Webhook        │
└──────────────┬─────────────────────────────────────┬──────────┘
               │ HTTPS / WebSocket                    │ Webhook
┌──────────────▼─────────────────────────────────────▼──────────┐
│                      FASTAPI (port 8000)                        │
│  Auth │ Projects │ Test Cases │ Suites │ Vault │ Billing │ Orgs │
└──────────────┬──────────────────────────────────────┬──────────┘
               │ Celery task                          │ Pub/Sub
┌──────────────▼──────────┐           ┌───────────────▼──────────┐
│    CELERY WORKER         │           │      REDIS               │
│  run_test_case task      │──────────▶│  Run records             │
│  Notifications           │  events   │  Trace lists             │
│  Artifact upload         │           │  Pub/Sub channels        │
└──────────────┬──────────┘           └──────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                    AGENT ORCHESTRATOR                            │
│                                                                  │
│   OBSERVE → REASON → GUARD_RAILS → ACT → GOAL_CHECK             │
│       ↑__________________________|      |                        │
│                                         ▼                        │
│              ERROR_HANDLER ←───── FINALIZE → END                │
└──────────────┬──────────────────────────────────────────────────┘
               │ MCP / CDP
┌──────────────▼──────────────────────────────────────────────────┐
│              SANDBOX CONTAINER (Docker)                          │
│   Playwright + Browser │ noVNC (:6080) │ CDP (:9222)            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Responsibility |
|---|---|
| **FastAPI** | REST API, auth, CRUD, plan enforcement, WebSocket relay |
| **Celery Worker** | Async test execution, artifact upload, notifications |
| **Redis** | Run state, trace persistence, real-time pub/sub |
| **Agent Graph** | Observe → Reason → Act loop with LangGraph |
| **Sandbox** | Isolated Docker container with browser + VNC + CDP |
| **Vault** | Encrypted credential store (AES-256-GCM) |
| **Artifact Store** | Screenshot, video, trace file storage (local or S3) |

### 1.3 Test Case Schema (from `_template.yaml`)

Every test case flowing through the system conforms to this structure:

```
TestCase
├── id, name, suite, priority, tags
├── created_by (user-id), project (project-id)
├── save_record (bool)
├── target
│   ├── url, browser, viewport, page_type
│   ├── app_description
│   ├── vault [ {key, value} ]       ← secret references
│   ├── locale (optional)
│   └── timezone (optional)
├── goal
│   ├── objective                    ← natural language goal
│   ├── constraints (max_steps, timeout_seconds, max_retries_per_action)
│   ├── extra_details (optional)     ← agent context warnings
│   └── steps
│       └── checkpoints [ {id, description, success_signal} ]
└── on_failure
    ├── capture {screenshot, dom_snapshot, network_log,
    │            console_log, agent_trace, video}
    └── notify {}
```

### 1.4 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js, React, Tailwind, shadcn/ui | 16.2 / 19 / 4 |
| API | FastAPI, Uvicorn | latest |
| Task Queue | Celery + Redis | latest |
| Agent | LangGraph (Python) | latest |
| Browser | Playwright + MCP | latest |
| Vision LLM | OpenRouter / Groq / NVIDIA NIM | — |
| Database | PostgreSQL (optional) + in-memory fallback | — |
| Containers | Docker + noVNC + CDP | — |
| Secrets | AES-256-GCM via `api.crypto` | — |
| Billing | Stripe | — |

---

## 2. API Reference

### 2.1 Authentication

All protected routes require either:
- `Authorization: Bearer <jwt>` header
- `X-User-Email: <email>` header (dev fallback)

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | `{email, password, name?}` | `{id, email, name, access_token}` | 201 / 409 | ✅ |
| POST | `/api/auth/login` | `{email, password}` | `{id, email, name, access_token}` | 200 / 401 | ✅ |
| POST | `/api/auth/oauth-token` | `{email, name?}` + X-Internal-Secret | `{email, name, access_token}` | 200 / 403 | ✅ |
| GET | `/api/me` | — | `{email, authenticated, role}` | 200 | ✅ |

---

### 2.2 Test Runs

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| POST | `/api/runs` | `RunRequest` | `RunResponse` | 201 | ✅ |
| GET | `/api/runs` | — | `{runs[], total}` | 200 | ✅ |
| GET | `/api/runs/{id}` | — | `RunResponse` | 200 / 404 | ✅ |
| DELETE | `/api/runs/{id}` | — | `{cancelled}` | 200 / 404 | ✅ |
| GET | `/api/runs/{id}/traces` | — | `{run_id, traces[]}` | 200 / 404 | ✅ |
| GET | `/api/runs/{id}/observe` | — | `{run_id, novnc_url}` | 200 / 404 | ✅ |
| GET | `/api/runs/{id}/artifacts` | — | `{artifacts[]}` | 200 / 404 | ✅ |
| GET | `/api/runs/{id}/artifacts/{file}` | — | `FileResponse` | 200 / 404 | ✅ |
| WS | `/api/ws/runs/{id}/trace` | — | event stream | 101 | ✅ |

**RunRequest schema:**
```json
{
  "test_case_id": "uuid (optional)",
  "model provider": "openrouter",
  "model": "openrouter:openai/gpt-4o",
  "browser": "chromium",
  "max_steps": 20,
  "timeout": 300,
  "record": false,
}
```

**RunResponse schema:**
```json
{
  "run_id": "uuid",
  "status": "queued|running|passed|failed|errored|timed_out|blocked|cancelled",
  "test_name": "str",
  "created_at": "ISO8601",
  "duration_s": 0.0,
  "total_steps": 0,
  "estimated_cost_usd": 0.0,
  "termination_reason": "str|null",
  "novnc_url": "ws://...|null",
  "assertion_results": [],
  "steps_completed": [],
  "total_input_tokens": 0,
  "total_output_tokens": 0,
  "error_count": 0,
  "tool_call_count": 0,
  "artifact_manifest": []
}
```

**⚠ Changes required:**
- `save_record` from YAML template is not yet wired into `RunRequest` — needs to override the test case `save_record` flag
- `vault` secrets from `target.vault[]` are not resolved/injected into the agent before execution
- `goal.extra_details` is not passed to the agent prompt builder
- Steps `description` / `success_signal` are not used by the prompt builder (only `goal` text is sent)

---

### 2.3 Projects

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| POST | `/api/projects` | `{name, slug, description, org_id?, settings?}` | Project | 201 | ✅ |
| GET | `/api/projects` | — | `{projects[], total}` | 200 | ✅ |
| GET | `/api/projects/{id}` | — | Project | 200 / 404 | ✅ |
| PUT | `/api/projects/{id}` | `ProjectCreate` | Project | 200 / 404 | ✅ |
| GET | `/api/projects/{id}/stats` | — | `{pass_rate, total_runs, active_runs, cost_this_month_usd}` | 200 | ✅ |

---

### 2.4 Test Cases CRUD

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| POST | `/api/projects/{pid}/test-cases` | `TestCaseCreate` | Summary | 201 | ✅ |
| GET | `/api/projects/{pid}/test-cases` | `?status&q` | `{test_cases[], total}` | 200 | ✅ |
| GET | `/api/projects/{pid}/test-cases/{id}` | — | Summary + spec | 200 / 404 | ✅ |
| PUT | `/api/projects/{pid}/test-cases/{id}` | `TestCaseCreate` | Summary | 200 / 404 | ✅ |
| DELETE | `/api/projects/{pid}/test-cases/{id}` | — | `{archived}` | 200 / 404 | ✅ |
| POST | `/api/projects/{pid}/test-cases/{id}/clone` | — | Summary | 201 / 404 | ✅ |
| POST | `/api/projects/{pid}/test-cases/import-yaml` | `{yaml_content}` | Summary | 201 / 422 | ✅ |
| GET | `/api/projects/{pid}/test-cases/{id}/runs` | `?limit&page` | `{runs[], total, page, limit}` | 200 | ✅ |

**TestCaseCreate body** (aligned to `_template.yaml`):
```json
{
  "name": "str",
  "goal": "str",
  "suite": "str|null",
  "priority": "P0|P1|P2|P3",
  "tags": ["str"],
  "created_by": "user-id",
  "project": "project-id",
  "save_record": false,
  "target": {
    "url": "str",
    "browser": "chromium|firefox|webkit|chrome|msedge",
    "viewport": { "width": 1280, "height": 720, "device_scale_factor": 1.0 },
    "page_type": "spa|ssr|static|streaming",
    "app_description": "str|null",
    "vault": [{ "key": "str", "value": "str" }],
    "locale": "str|null",
    "timezone": "str|null"
  },
  "goal_config": {
    "objective": "str",
    "constraints": {
      "max_steps": 20,
      "timeout_seconds": 300,
      "max_retries_per_action": 2
    },
    "extra_details": "str|null",
    "steps": {
      "checkpoints": [
        { "id": "S1", "description": "str", "success_signal": "str" }
      ]
    }
  },
  "on_failure": {
    "capture": {
      "screenshot": true,
      "dom_snapshot": true,
      "network_log": true,
      "console_log": true,
      "agent_trace": true,
      "video": true
    },
    "notify": {}
  }
}
```

**⚠ Changes required:**
- Current `TestCaseCreate` in `test_cases_crud.py` still uses the old flat schema (`goal: str`, `steps: StepsBody`, `constraints: ConstraintsBody`). Needs to be restructured to match the nested `goal_config` block from the template.
- `target.vault[]` and `target.page_type` / `target.app_description` need to be added to `TargetBody`.
- `created_by` and `project` fields need to be added to `TestCaseCreate`.
- `save_record` should be renamed from `record` everywhere.

---

### 2.5 Test Suites

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| POST | `/api/projects/{pid}/suites` | `{name, description?, test_case_ids[], group?}` | Suite | 201 | ✅ |
| GET | `/api/projects/{pid}/suites` | — | `{suites[], total}` | 200 | ✅ |
| GET | `/api/projects/{pid}/suites/{id}` | — | Suite | 200 / 404 | ✅ |
| PUT | `/api/projects/{pid}/suites/{id}` | `SuiteUpdate` | Suite | 200 / 404 | ✅ |
| DELETE | `/api/projects/{pid}/suites/{id}` | — | `{deleted}` | 200 / 404 | ✅ |
| POST | `/api/projects/{pid}/suites/{id}/run` | — | `{suite_id, dispatched_run_ids[], total}` | 202 / 404 | ✅ |
| POST | `/api/projects/{pid}/suites/{id}/members` | `{test_case_id}` | Updated suite | 200 | ✅ |
| DELETE | `/api/projects/{pid}/suites/{id}/members/{tc_id}` | — | `{removed}` | 200 | ✅ |
| GET | `/api/projects/{pid}/suite-groups` | — | `{groups[]}` | 200 | ✅ |
| GET | `/api/projects/{pid}/suites/{id}/schedule` | — | `{cron_expr, timezone, enabled, next_run_at}` | 200 | ✅ |
| PUT | `/api/projects/{pid}/suites/{id}/schedule` | `{cron_expr, timezone?, enabled?}` | Schedule | 200 | ✅ |

---

### 2.6 Vault (Secrets)

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| GET | `/api/projects/{pid}/vault` | `?environment&type` | `{secrets[], total}` | 200 | ✅ |
| POST | `/api/projects/{pid}/vault` | `{name, value, environment?, type?}` | Secret (masked) | 201 / 409 | ✅ |
| GET | `/api/projects/{pid}/vault/{id}/reveal` | — | Secret (revealed) | 200 / 404 | ✅ |
| PUT | `/api/projects/{pid}/vault/{id}` | `{value?, environment?, type?}` | Secret | 200 / 404 | ✅ |
| DELETE | `/api/projects/{pid}/vault/{id}` | — | `{deleted}` | 200 / 404 | ✅ |

**⚠ Changes required:**
- `target.vault[]` in YAML references secret keys — the runner must resolve these against the vault API before passing credentials to the agent.

---

### 2.7 Environments

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| GET | `/api/projects/{pid}/environments` | — | `{environments[], total}` | 200 | ✅ |
| POST | `/api/projects/{pid}/environments` | `{name, base_url, is_default?, headers?}` | Environment | 201 | ✅ |
| PUT | `/api/projects/{pid}/environments/{id}` | `EnvUpdate` | Environment | 200 / 404 | ✅ |
| DELETE | `/api/projects/{pid}/environments/{id}` | — | `{deleted}` | 200 / 404 | ✅ |

---

### 2.8 Schedules & Webhooks

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| GET | `/api/projects/{pid}/suites/{sid}/schedules` | — | `{schedules[], total}` | 200 | ✅ |
| POST | `/api/projects/{pid}/suites/{sid}/schedules` | `{cron, branch?, enabled?}` | Schedule | 201 | ✅ |
| PUT | `/api/projects/{pid}/suites/{sid}/schedules/{id}` | same | Schedule | 200 / 404 | ✅ |
| DELETE | `/api/projects/{pid}/suites/{sid}/schedules/{id}` | — | `{deleted}` | 200 / 404 | ✅ |
| POST | `/api/webhook/github` | GitHub push payload | `{triggered, runs[]}` | 200 | ✅ |
| POST | `/api/webhooks/{token}/trigger` | `{suite_id, environment, ref, model?, target_url?}` | `{triggered, run_ids[]}` | 202 | ✅ |

---

### 2.9 Visual Baselines

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| GET | `/api/projects/{pid}/baselines` | `?status&test_case_id` | `{baselines[], total}` | 200 | ✅ |
| GET | `/api/projects/{pid}/baselines/{id}` | — | Baseline | 200 / 404 | ✅ |
| POST | `/api/projects/{pid}/baselines/{id}/approve` | — | `{approved}` | 200 / 404 | ✅ |
| POST | `/api/projects/{pid}/baselines/{id}/reject` | `{reason}` | `{rejected}` | 200 / 404 | ✅ |

---

### 2.10 Integrations

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| GET | `/api/projects/{pid}/integrations` | — | `{integrations[], total}` | 200 | ✅ |
| POST | `/api/projects/{pid}/integrations/github` | `{repo, installation_id, suite_id?, branch}` | Integration | 201 | ✅ |
| POST | `/api/projects/{pid}/integrations/slack` | `{webhook_url, notify_on}` | Integration | 201 | ✅ |
| DELETE | `/api/projects/{pid}/integrations/{id}` | — | `{deleted}` | 200 / 404 | ✅ |

---

### 2.11 Billing & Usage

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| GET | `/api/billing/plans` | — | `{plans[]}` | 200 | ✅ |
| POST | `/api/billing/checkout` | `{plan, org_id}` | `{checkout_url}` | 200 | ✅ |
| POST | `/api/billing/portal` | `{org_id}` | `{portal_url}` | 200 | ✅ |
| POST | `/api/billing/webhook` | Stripe payload | `{received}` | 200 | ✅ |
| GET | `/api/billing/usage` | `?org_id` | Usage meters | 200 | ✅ |
| GET | `/api/billing/subscription` | `?org_id` | Subscription | 200 | ✅ |
| GET | `/api/usage` | — | `{period, meters[], cost_usd, subscription}` | 200 | ✅ |

**Plan limits:**

| Plan | Runs/mo | Parallel | Secrets | Storage |
|---|---|---|---|---|
| free | 50 | 1 | 50 | 1 GB |
| pro | 500 | 2 | 500 | 20 GB |
| team | 5,000 | 5 | 2,000 | 100 GB |
| enterprise | unlimited | 20 | 10,000 | 1 TB |

---

### 2.12 Organizations

| Method | Path | Request | Response | Status | Implemented |
|---|---|---|---|---|---|
| GET | `/api/orgs/me` | — | Org | 200 / 404 | ✅ |
| PATCH | `/api/orgs/me` | `{name?, billing_email?}` | Org | 200 | ✅ |
| GET | `/api/orgs/{id}/members` | — | `{members[], total}` | 200 | ✅ |
| POST | `/api/orgs/{id}/invitations` | `{email, role?}` | Invitation | 201 | ✅ |
| PATCH | `/api/orgs/{id}/members/{uid}` | `{role}` | `{updated}` | 200 | ✅ |
| DELETE | `/api/orgs/{id}/members/{uid}` | — | `{removed}` | 200 | ✅ |
| GET | `/api/orgs/{id}/invitations` | — | `{invitations[]}` | 200 | ✅ |
| DELETE | `/api/orgs/{id}/invitations/{id}` | — | `{revoked}` | 200 | ✅ |

---

## 3. Agent Graph

### 3.1 State Machine Diagram

```
              START
                │
            OBSERVE ◄──────────────────────────────────┐
                │                                       │
        ┌───────┴───────┐                               │
    goal_complete?   continue                           │
        │               │                               │
    FINALIZE         REASON                             │
        │               │                               │
       END      ┌───────┼───────┐                       │
                │       │       │                       │
             error    tool   no-tool                    │
                │     call   (goal?)                    │
        ERROR_HANDLER  │    GOAL_CHECK                  │
                │   GUARD_RAILS   │                     │
          ┌─────┘      │      goal?                     │
        fatal      blocked?   │                         │
          │          │     FINALIZE                     │
       FINALIZE   OBSERVE      │                        │
          │               loop back ───────────────────┘
         END
```

### 3.2 Node LLD

#### OBSERVE
| Field | Detail |
|---|---|
| **Purpose** | Capture page state; check limits |
| **Inputs** | `test_case`, `step_number`, `run_start_time`, `page_snapshot`, `status` |
| **Actions** | Timeout check → `wait_for_stable` → `browser_snapshot` (MCP, 5 retries) → CDP screenshot |
| **Outputs** | `step_number+1`, `current_url`, `page_title`, `page_snapshot`, `screenshot_b64` |
| **Fail path** | 5 MCP retries exhausted → `status=errored`, `goal_complete=True` |
| **Timeout** | Wall-clock ≥ `timeout_seconds` or steps > `max_steps` → `status=timed_out` |
| **⚠ Gap** | `extra_details` from YAML not injected into observation context |

#### REASON
| Field | Detail |
|---|---|
| **Purpose** | Call LLM; decide next action |
| **Inputs** | `messages`, `page_snapshot`, `screenshot_b64`, `completed_checkpoints` |
| **Actions** | Build observation → trim context (24K limit, keep last 3 pairs) → `llm.ainvoke()` |
| **Retry policy** | [0s, 2s, 4s, 8s] standard; [0s, 15s, 30s, 60s] soft-limit providers |
| **Fatal errors** | 401 / 403 / 402 / 404 model → no retry, `status=errored` |
| **Context overflow** | 413 → emergency trim → 1 retry |
| **Outputs** | `messages` (appended), `last_error` (if failed) |
| **⚠ Gap** | Step `description` / `success_signal` fields from YAML not included in system prompt |

#### GUARD_RAILS
| Field | Detail |
|---|---|
| **Purpose** | Block policy violations before ACT |
| **Checks** | `navigation_policy=interact_only` + `forbidden_actions` list |
| **Block action** | Inject corrective ToolMessage; set `guard_blocked=True` |
| **Route** | `guard_blocked=True` → back to OBSERVE; else → ACT |
| **⚠ Gap** | `forbidden_actions` removed from new template schema — guard_rails now has nothing to enforce |

#### ACT
| Field | Detail |
|---|---|
| **Purpose** | Execute first tool call from LLM response |
| **Tool dispatch** | `browser_*` → MCP client; others → `tool_registry` |
| **Repetition** | Same call ×4 → meta-prompt injected; ×10 → `status=blocked` |
| **Arg sanitization** | Strip `null` values, `[ref=eXX]` brackets |
| **Outputs** | `messages` (ToolMessage), `last_tool_name`, `last_tool_success`, `consecutive_errors` |

#### GOAL_CHECK
| Field | Detail |
|---|---|
| **Purpose** | Parse completion signals from agent text |
| **Signals** | `<GOAL_COMPLETE>` → passed; `<GOAL_BLOCKED>` → blocked; `[Sn complete]` → advance checkpoint |
| **Auto-complete** | Unguided test, step ≥ 3, all content assertions pass → passed |
| **Strict mode** | `[Sn failed]` → `status=failed` |

#### ERROR_HANDLER
| Field | Detail |
|---|---|
| **Purpose** | Classify and recover from errors |
| **Fatal** | `llm_auth_error`, not recoverable → FINALIZE |
| **Tool errors ≥ 3** | `status=errored` → FINALIZE |
| **MCP disconnect** | 3 reconnect attempts (1s delay); success → OBSERVE; fail → FINALIZE |
| **Recoverable** | Inject recovery message → OBSERVE |

#### FINALIZE
| Field | Detail |
|---|---|
| **Purpose** | Run assertions; persist trace; print summary |
| **Assertion types** | `content`, `console`, `network`, `state`, `visual_design` |
| **Status upgrade** | If `status=passed` and any assertion fails → `status=failed` |
| **Outputs** | Trace JSON, assertion_results, summary print |
| **⚠ Gap** | `on_failure.capture` flags from YAML not checked — currently always captures everything |

---

## 4. Data Models

### 4.1 TestCase (Orchestrator)

```python
class TestCase(BaseModel):
    id: str
    name: str
    goal: str               # ⚠ should become goal.objective
    target: Target
    suite: str | None
    priority: Literal["P0","P1","P2","P3"]
    tags: list[str]
    record: bool            # ⚠ should rename to save_record
    created_by: str | None
    created_at: str | None
    steps: Steps | None
    assertions: list[Assertion]
    constraints: Constraints
    context: Context        # ⚠ should move into goal block
    on_failure: OnFailure
```

### 4.2 Checkpoint

```python
class Checkpoint(BaseModel):
    id: str
    description: str        # what the agent should DO
    success_signal: str     # what the agent should EXPECT
    data: dict | None
    # ⚠ assertions removed — now global only
```

### 4.3 AgentState

```python
AgentState = {
    "test_case": TestCase,
    "run_id": str,
    "messages": list,
    "step_number": int,
    "current_checkpoint": str | None,
    "completed_checkpoints": list[str],
    "current_url": str,
    "page_title": str,
    "page_snapshot": str,
    "last_tool_name": str | None,
    "last_tool_result": str | None,
    "last_tool_success": bool,
    "consecutive_errors": int,
    "last_error": ErrorInfo | None,
    "error_history": list[ErrorInfo],
    "status": str,
    "goal_complete": bool,
    "termination_reason": str | None,
    "guard_blocked": bool,
    "run_start_time": float,
    "current_screenshot": bytes | None,
    "screenshot_b64": str | None,
    "step_screenshots": list[bytes],
}
```

---

## 5. Redis Schema

| Key | Type | TTL | Content |
|---|---|---|---|
| `hawkeye:run:{run_id}` | String (JSON) | 7 days | Full run record |
| `hawkeye:run_ids` | List | None | Last 100 run IDs (LRU) |
| `hawkeye:events:{run_id}` | Pub/Sub | N/A | Real-time events |
| `hawkeye:traces:{run_id}` | List (JSON) | 7 days | Per-step trace entries |

### Run Record Shape

```json
{
  "run_id": "uuid",
  "status": "queued|running|passed|failed|errored|timed_out|blocked|cancelled",
  "test_name": "str",
  "created_at": "ISO8601",
  "started_at": "ISO8601",
  "completed_at": "ISO8601",
  "duration_s": 0.0,
  "total_steps": 0,
  "steps_completed": ["S1", "S2"],
  "estimated_cost_usd": 0.0,
  "total_input_tokens": 0,
  "total_output_tokens": 0,
  "error_count": 0,
  "tool_call_count": 0,
  "termination_reason": "str|null",
  "novnc_url": "ws://...|null",
  "assertion_results": [],
  "error_message": "str|null",
  "artifact_manifest": []
}
```

### WebSocket Event Shape

```json
{
  "event_type": "run_started|complete|error|sandbox_ready|ping",
  "run_id": "uuid",
  "data": { "status": "str", "novnc_url": "str|null", "message": "str|null" },
  "timestamp": "ISO8601"
}
```

---

## 6. Run Lifecycle

```
POST /api/runs
  → plan limit check (HAWKEYE_PLAN_ENFORCE)
  → resolve test_case_id → write temp YAML
  → Redis: create run record (status=queued)
  → Celery: dispatch run_test_case.delay(run_id, request)
  → return RunResponse(run_id, status=queued)

[Celery Worker]
  → load TestCase from YAML
  → get LLM provider
  → Redis: update status=running, started_at=now
  → Pub/Sub: publish run_started
  → [optional] container pool acquire
  → RunManager.run(test_case)
      → spawn sandbox (or use prewarmed)
      → connect CDP session
      → init MCP client
      → navigate to target.url
      → build LangGraph graph
      → graph.ainvoke(initial_state)
          OBSERVE → REASON → GUARD_RAILS → ACT → GOAL_CHECK → loop
          ERROR_HANDLER (on errors)
          FINALIZE (on completion)
      → cleanup (MCP, CDP, sandbox, recording)
  → build RunResult
  → Redis: persist traces (hawkeye:traces:{run_id})
  → write artifact files + upload to artifact store
  → Redis: update run record (final status, results, manifest)
  → Pub/Sub: publish complete
  → notifications (Slack, GitHub Check Run)
```

---

## 7. Implementation Status

| Area | Status | Notes |
|---|---|---|
| FastAPI routes (all) | ✅ Implemented | Full CRUD for all resources |
| Auth (JWT + OAuth) | ✅ Implemented | Register, login, OAuth token |
| Redis persistence | ✅ Implemented | Run records, traces, pub/sub |
| Celery task queue | ✅ Implemented | run_test_case with full lifecycle |
| LangGraph agent (7 nodes) | ✅ Implemented | observe, reason, act, goal_check, guard_rails, error_handler, finalize |
| WebSocket streaming | ✅ Implemented | Real-time events via Redis pub/sub |
| Artifact store | ✅ Implemented | Local FS + S3 compatible |
| Vault (encrypted secrets) | ✅ Implemented | AES-256-GCM |
| Billing (Stripe) | ✅ Implemented | Plans, checkout, portal, webhooks |
| GitHub integration | ✅ Implemented | Push webhook, Check Run |
| Slack integration | ✅ Implemented | Pass/fail notifications |
| PostgreSQL persistence | ⚠️ Optional | Falls back to in-memory if no `HAWKEYE_DB_URL` |
| Visual baselines | ⚠️ Partial | In-memory store only, no DB persistence |
| Celery Beat scheduling | ⚠️ Stub | Cron stored but no Beat worker wired |
| Container pool | ⚠️ Partial | Disabled by default (`HAWKEYE_POOL_SIZE=0`) |
| Figma design diff | ⚠️ Partial | Flag accepted, integration not fully shown |

---

## 8. Changes Required

These changes are needed to align the codebase with the master `_template.yaml` schema:

### 8.1 Schema Restructuring (Backend)

| File | Change |
|---|---|
| `orchestrator/models/test_case.py` | Rename `record` → `save_record`; move `context` fields into a `Goal` wrapper model; add `vault: list[{key, value}]` to `Target` |
| `api/routes/test_cases_crud.py` | Restructure `TestCaseCreate`: nest `constraints` + `steps` + `extra_details` under a `goal` block; add `created_by`, `project` fields; rename `record` → `save_record`; add `vault[]` to `TargetBody` |
| `orchestrator/loader/yaml_loader.py` | Update loader to parse new nested `goal:` block from YAML |

### 8.2 Agent Prompt Builder

| File | Change |
|---|---|
| `orchestrator/agent/prompt_builder.py` | Inject step `description` + `success_signal` into system prompt per checkpoint; include `extra_details` as agent context; include `target.app_description` |

### 8.3 Vault Resolution

| File | Change |
|---|---|
| `api/tasks.py` | Before `RunManager.run()`, resolve `target.vault[]` key references against the vault API and inject as env vars or auth context into the agent |

### 8.4 On Failure Capture

| File | Change |
|---|---|
| `orchestrator/agent/finalize.py` | Check `test_case.on_failure.capture` flags before collecting each artifact type; skip screenshot if `capture.screenshot=False`; skip video if `capture.video=False` |

### 8.5 Guard Rails

| File | Change |
|---|---|
| `orchestrator/agent/guard_rails.py` | `forbidden_actions` and `navigation_policy` removed from new template schema — guard_rails node needs to be updated to still enforce goal-level constraints or be removed |

### 8.6 Frontend Types

| File | Change |
|---|---|
| `src/lib/api/client.ts` | Update `TestCaseSpec` to match new nested `goal` block structure; rename `record` → `save_record`; add `vault[]` to target type |
| `src/app/app/(workspace)/test-cases/[id]/page.tsx` | Update all state vars and save payload to match new schema |
