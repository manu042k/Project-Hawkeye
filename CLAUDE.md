# Project Hawkeye

AI-powered pre-deployment testing platform where autonomous agents execute verification tests against web applications inside observable Docker sandbox containers. Agents reason about what to do next based on **visual screenshots + accessibility tree** — no brittle recorded scripts.

The agent is fundamentally a **visual QA agent**: it takes a screenshot at every step, sends it to a vision-capable LLM alongside the accessibility tree, and decides actions based on what it *sees*. An optional second pass diffs final screenshots against a provided Figma/design file to catch visual regressions.

Spec document: `C:\Users\vjayr\Downloads\spec.md` (Hawkeye Implementation Specification v1.0)
HLD/LLD reference: `Docs/HLD_LLD.md` (authoritative design document — API contracts, data models, Redis schema, run lifecycle)

---

## Architecture

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

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.2, React 19, Tailwind 4, shadcn/ui, Zustand, NextAuth (Google/GitHub OAuth) |
| Orchestrator | Python 3.11+, LangGraph (Python), LangChain |
| Vision LLM | Any multimodal model: GPT-4o, Claude Sonnet, Gemini — user-selectable via `--model` |
| API | FastAPI, Uvicorn, WebSocket |
| Task Queue | Celery + Redis |
| Database | PostgreSQL (optional) + in-memory fallback |
| Sandbox | Docker, Playwright, Xvfb, x11vnc, websockify, noVNC, @playwright/mcp |
| Secrets | AES-256-GCM via `api/crypto.py` |
| Visual diffing | Pillow + numpy (pixelmatch-style) — Phase 2.5, opt-in with Figma file |
| Billing | Stripe |
| Container networking | Docker bridge (`hawkeye-net`) |

---

## Repository Layout

```
Project-Hawkeye/
├── Frontend/hawkeye-web/          # Next.js dashboard
│   ├── src/app/                   # App Router pages
│   │   ├── auth/                  # Login, signup, password recovery
│   │   ├── app/(global-hub)/      # Project selector, account, billing
│   │   └── app/(workspace)/       # Dashboard, runs, suites, vault, baselines, settings
│   │       ├── dashboard/         # KPI summary, active runs
│   │       ├── runs/              # New run, live execution, run report
│   │       ├── test-cases/        # Library, creation wizard, detail page
│   │       ├── suites/            # Suite management, schedule modal
│   │       ├── vault/             # Secret management
│   │       ├── visual-baselines/  # Baseline approve/reject UI
│   │       └── settings/          # Environments, integrations
│   ├── src/components/            # UI components (app chrome, auth, theme, shadcn)
│   ├── src/lib/api/               # Typed API client (client.ts, hooks.ts) — 80+ endpoints
│   └── src/lib/                   # Stores (Zustand), auth config, utils
│
├── Backend/
│   ├── api/                       # FastAPI application
│   │   ├── app.py                 # FastAPI app, all routers registered
│   │   ├── main.py                # Uvicorn entry point
│   │   ├── db.py                  # asyncpg pool singleton + get_conn() dependency
│   │   ├── crypto.py              # AES-256-GCM vault encryption
│   │   ├── auth_utils.py          # JWT creation, password hashing, HMAC
│   │   ├── artifact_store.py      # ArtifactStore protocol + LocalArtifactStore
│   │   ├── celery_app.py          # Celery app configuration
│   │   ├── tasks.py               # run_test_case Celery task
│   │   ├── tasks_beat.py          # check_due_schedules Beat task (every minute)
│   │   ├── redis_store.py         # Run record + trace persistence
│   │   ├── job_queue.py           # Asyncio job queue (legacy; Celery is primary)
│   │   ├── container_pool.py      # ContainerPool pre-warming (HAWKEYE_POOL_SIZE)
│   │   ├── github_checks.py       # Post Check Run pass/fail to GitHub
│   │   ├── slack.py               # Slack failure notifications
│   │   └── routes/
│   │       ├── auth.py            # Register, login, OAuth token, dev user seed
│   │       ├── runs.py            # Run CRUD + traces + observe endpoint
│   │       ├── test_cases.py      # Legacy YAML test case discovery
│   │       ├── test_cases_crud.py # Full CRUD per project (create, clone, import-yaml)
│   │       ├── projects.py        # Project CRUD + stats
│   │       ├── suites.py          # Suite CRUD, members, schedule, run-suite
│   │       ├── vault.py           # Secret CRUD with reveal-on-demand
│   │       ├── schedules.py       # Cron schedule CRUD per suite
│   │       ├── environments.py    # Environment CRUD per project
│   │       ├── baselines.py       # Visual baseline approve/reject
│   │       ├── integrations.py    # GitHub + Slack integration config
│   │       ├── orgs.py            # Org + member + invitation CRUD
│   │       ├── billing.py         # Stripe checkout, portal, webhook, plans
│   │       ├── me.py              # /api/me identity endpoint
│   │       ├── usage.py           # Billing usage metering
│   │       ├── artifacts.py       # Artifact manifest + file download
│   │       ├── ws.py              # WebSocket trace streaming
│   │       └── webhooks.py        # GitHub push webhook handler
│   ├── hawkeye_sandbox/           # Python sandbox manager package
│   │   ├── sandbox.py             # SandboxManager, SandboxConfig, SandboxHandle
│   │   ├── cli.py                 # CLI: spawn containers & record
│   │   ├── mcp.py                 # MCP config generation for Playwright/Chrome DevTools
│   │   └── sandbox_image/         # Docker image definition
│   │       ├── Dockerfile
│   │       ├── entrypoint.sh
│   │       ├── launch_browser.py
│   │       └── supervisord.conf
│   ├── orchestrator/              # Agent harness
│   │   ├── agent/                 # LangGraph StateGraph
│   │   │   ├── graph.py           # Compiled LangGraph with full state machine
│   │   │   ├── prompt_builder.py  # System prompt (guided/unguided modes)
│   │   │   ├── nodes/             # observe, reason, act, goal_check, error_handler, finalize, guard_rails
│   │   │   └── edges/             # route_after_* edge functions (6 total)
│   │   ├── models/                # TestCase, AgentState, RunResult (Pydantic + dataclasses)
│   │   ├── runner/                # RunManager — full test lifecycle
│   │   ├── tools/                 # Custom tools: wait_for_stable, assert_text_present, etc.
│   │   ├── mcp/                   # PlaywrightMcpClient (stdio transport)
│   │   ├── cdp/                   # Chrome DevTools Protocol session
│   │   ├── trace/                 # Per-step trace collector (tokens, latency, cost)
│   │   ├── assertions/            # AssertionEngine (content+console+network+state+visual_design)
│   │   ├── llm/                   # LLM provider factory + is_vision_capable()
│   │   ├── vision/                # figma_client.py, pixel_diff.py, visual_assertions.py
│   │   ├── reporting/             # HTML + Markdown report generator
│   │   ├── db/                    # asyncpg DB layer + schema.sql (gated by HAWKEYE_DB_URL)
│   │   ├── loader/                # YAML test case loader
│   │   ├── cli/                   # Click CLI entry point
│   │   └── test_cases/            # wikipedia_search.yaml, saucedemo_cart.yaml, _template.yaml
│   └── pyproject.toml             # uv / pyproject config
│
├── Docs/
│   ├── HLD_LLD.md                 # Authoritative design doc (API contracts, data models, Redis schema)
│   ├── SystemArchitecture.md
│   ├── SystemDesign.md
│   ├── UI-flow.md
│   └── Project_Hawkeye_Flow_Analysis.md
│
├── nginx/nginx.conf               # Reverse proxy config (port 80 → hawkeye-api:8000)
├── scripts/
│   └── test_spawn_all_browsers_groq_mcp.py
├── docker-compose.yml             # All services: api, worker, redis, nginx, sandbox
├── .env.example
└── CLAUDE.md                      # ← This file
```

---

## Visual QA Agent Design

### How it works

Every agent step has two parallel inputs to the LLM:

```
Observe step
  ├── take_screenshot() via CDP  →  base64 PNG  ──┐
  └── browser_snapshot() via MCP →  accessibility  ─┤→ multimodal LLM → action
                                      tree (text)  ──┘
```

- **Screenshot** (primary): vision LLM sees the page exactly as a human would. Used for intent verification — "does this look correct?", "is the cart visible?", "is there a login wall?"
- **Accessibility tree** (secondary): provides precise element references (`e53`, `.cart-link`) needed for Playwright MCP tool calls (click, type, navigate)
- **Fallback**: text-only models skip the screenshot and use accessibility tree only — no crash, graceful degradation

### Agent State Machine

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

### Node Summary

| Node | Purpose |
|---|---|
| OBSERVE | Timeout check → wait_for_stable → browser_snapshot (MCP) → CDP screenshot |
| REASON | Build observation → trim context (24K, last 3 pairs) → llm.ainvoke() with retry/backoff |
| GUARD_RAILS | Block policy violations; currently stub (no-op) — always passes to ACT |
| ACT | Execute first tool call; dispatch `browser_*` → MCP, others → tool_registry |
| GOAL_CHECK | Parse `<GOAL_COMPLETE>` / `<GOAL_BLOCKED>` / `[Sn complete]` signals |
| ERROR_HANDLER | Classify error; MCP reconnect (3 attempts); inject recovery message |
| FINALIZE | Run assertions; persist trace; save artifacts; print summary |

### AgentState key fields

```python
current_screenshot: bytes | None       # raw PNG from CDP
screenshot_b64: str | None             # base64 for LLM message
step_screenshots: list[bytes]          # all step screenshots (for Pass 2 / Figma diff)
```

---

## Data Models

### TestCase (Orchestrator — `orchestrator/models/test_case.py`)

```python
class TestCase(BaseModel):
    id: str
    name: str
    target: Target          # url, browser, viewport, page_type, app_description, vault[]
    goal: str               # objective (natural language)
    steps: Steps | None     # checkpoints: [{id, description, success_signal}]
    constraints: Constraints  # max_steps, timeout_seconds, max_retries_per_action
    assertions: list[Assertion]
    save_record: bool       # renamed from `record`
    suite: str | None
    priority: Literal["P0","P1","P2","P3"]
    tags: list[str]
    created_by: str | None
    on_failure: OnFailure
```

### RunResponse (API — `api/routes/runs.py`)

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

### Redis Schema

| Key | Type | TTL | Content |
|---|---|---|---|
| `hawkeye:run:{run_id}` | String (JSON) | 7 days | Full run record |
| `hawkeye:run_ids` | List | None | Last 100 run IDs (LRU) |
| `hawkeye:events:{run_id}` | Pub/Sub | N/A | Real-time WebSocket events |
| `hawkeye:traces:{run_id}` | List (JSON) | 7 days | Per-step trace entries |

---

## Current Progress

### Phase 1 — CLI Agent Harness ✓ COMPLETE

- LangGraph StateGraph: `OBSERVE → REASON → GUARD_RAILS → ACT → GOAL_CHECK → ERROR_HANDLER → FINALIZE`
- Playwright MCP client (stdio) + 7 custom tools
- YAML test case loader + Pydantic schema
- Per-step trace collector, assertion engine (content + console + network + state)
- Click CLI: `python -m orchestrator run --test <file.yaml> [--record]`

**Confirmed passing:**
| Test | File | Status | Steps | Cost |
|------|------|--------|-------|------|
| TC-001 Wikipedia search + scroll | `wikipedia_search.yaml` | PASSED ✓ | ~6 | ~$0.03 |
| TC-002b SauceDemo add-to-cart | `saucedemo_cart.yaml` | PASSED ✓ | ~8 | ~$0.03 |
| TC-002 Amazon add-to-cart | `amazon_add_to_cart.yaml` | BLOCKED (bot detection) | — | — |
| TC-003 Temu add-to-cart | `temu_cart.yaml` | BLOCKED (login wall) | 2 | ~$0.01 |

### Phase 2 — Observability & Tracing ✓ COMPLETE

- PostgreSQL persistence via asyncpg, gated by `HAWKEYE_DB_URL`
- CDP: `NetworkRequest` buffer, `take_screenshot()`, `enable_page_capture()`
- 3 new custom tools: `get_network_log`, `assert_network_request`, `assert_element_state`
- Guard-rails node between reason → act
- HTML + Markdown report generator saved to `artifacts/` after every run

### Phase 2.5 — Visual QA Agent ✓ COMPLETE

- `observe_node`: screenshot via CDP at every step (non-fatal on failure)
- `reason_node`: multimodal `HumanMessage` (image + accessibility tree) for vision LLMs; text-only models receive tree only
- `is_vision_capable(model)` helper; NVIDIA NIM provider (`nvidia:<name>`)
- `orchestrator/vision/`: Figma API export, Pillow/numpy pixelmatch, visual_design assertion type
- `--figma-url` + `--figma-token` CLI flags
- Context trimming (24K char limit, keep last 3 pairs), exponential backoff for 429/5xx, emergency trim on 413

### Phase 3 — Multi-Browser & API ✓ COMPLETE

- FastAPI REST API at `Backend/api/` on port 8000
- WebSocket live trace streaming via Redis pub/sub (`WS /api/ws/runs/{run_id}/trace`)
- Celery + Redis job queue (persistent runs, parallel execution)
- `GET /api/runs/{run_id}/observe` — returns live noVNC URL
- Firefox/WebKit support in `PlaywrightMcpClient`
- `ContainerPool` pre-warming (disabled by default, `HAWKEYE_POOL_SIZE=0`)
- Nginx reverse proxy (`nginx/nginx.conf`) on port 80

### Phase 4 — Frontend ↔ Backend Wiring ✓ COMPLETE

- API client layer (`src/lib/api/client.ts`, `hooks.ts`) — typed fetch wrappers + React polling hooks
- WebSocket hook (`useRunTraceStream`) — StrictMode-safe
- Dashboard → `useRuns()`, New Run → `useTestCases()` + `useCreateRun()`
- Live Execution → WebSocket trace stream + noVNC iframe
- Run Report → `useRun()` + `useRunTraces()`, assertion table, step trace accordion
- `novnc_url` propagation: `TraceCollector.on_sandbox_ready()` → `ws_emitter` → Redis → frontend poll

### Phase 5 — SaaS Platform ✓ COMPLETE

#### 5A — Project & Test Case Management ✓
- In-memory project CRUD + stats endpoint (`api/routes/projects.py`)
- Full test case CRUD per project — create, clone, import-yaml (`api/routes/test_cases_crud.py`)
- `seed_from_yaml_dir()` — auto-imports all YAML test cases into default project on startup
- Frontend: test case library, 5-step creation wizard, detail page with YAML editor

#### 5B — Test Suites ✓
- Suite CRUD + member management + `POST .../run` (`api/routes/suites.py`)
- Frontend: suite management page, run-all with live toast, schedule modal

#### 5C — Environments & Vault ✓
- Secret CRUD with reveal-on-demand (`api/routes/vault.py`)
- Environment CRUD with base_url + custom headers + default flag (`api/routes/environments.py`)
- Frontend: vault page (add, reveal/hide, copy, delete), environments settings page

#### 5D — Scheduling & CI/CD ✓
- Cron schedule CRUD per suite (`api/routes/schedules.py`)
- GitHub push webhook with HMAC-SHA256 verification (`api/routes/webhooks.py`)
- Frontend: schedule modal with cron presets + branch filter; integrations page with webhook URL

#### 5E — Multi-tenancy & Auth ✓
- `apiFetch` sends `X-User-Email` header from NextAuth session via `setAuthUser()`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/oauth-token`
- Dev user seeded on startup (`HAWKEYE_DEV_EMAIL` / `HAWKEYE_DEV_PASSWORD`)
- JWT via `create_access_token()` in `auth_utils.py`
- `GET /api/me` returns identity + role

#### 5F — Artifact Store ✓
- `ArtifactStore` protocol + `LocalArtifactStore` (`api/artifact_store.py`)
- `GET /api/runs/{id}/artifacts` manifest + `GET /api/runs/{id}/artifacts/{file}` download
- Run Report: screenshot gallery with lightbox, download buttons (HTML/video/trace JSON)

#### 5G — Billing & Usage Metering ✓
- Usage metering from run count, vault secrets, artifact disk size (`api/routes/usage.py`)
- Stripe plans, checkout, portal, webhook handler (`api/routes/billing.py`)
- Stub mode when `STRIPE_SECRET_KEY` absent
- Frontend billing page with usage meters + cost fetched from `/api/usage`

### Phase 6 — Production Hardening 🔧 IN PROGRESS (current branch: `feat/phase6-api-changes`)

#### Track A — SQLAlchemy Persistence ✓ COMPLETE
- **NEW**: `api/models.py` — SQLAlchemy 2.0 async ORM models: `Project`, `TestCase`, `TestSuite`, `SuiteSchedule`, `VaultSecret`
- **NEW**: `api/database.py` — `AsyncSessionLocal`, `async_sessionmaker`, `create_async_engine`; auto-detects `postgresql://` → `postgresql+asyncpg://`; SQLite fallback (`sqlite+aiosqlite:///./hawkeye.db`) when no `HAWKEYE_DB_URL`
- `api/app.py` lifespan: calls `init_db()` (creates tables) + seeds default project + 4 YAML test cases on startup
- All 5 routes fully migrated to SQLAlchemy: `projects.py`, `suites.py`, `schedules.py`, `vault.py`, `test_cases_crud.py`
- `api/routes/runs.py` — replaced `_store` import with SQLAlchemy `TestCase` lookup
- `api/routes/webhooks.py` — replaced `_store as suite_store` import with SQLAlchemy query
- `api/routes/usage.py` — vault count now async via SQLAlchemy
- `api/tasks.py` — `_resolve_tc_path()`: fetches test case spec from DB, writes temp YAML for Celery worker; `_inject_vault_secrets()` reads from SQLAlchemy; viewport + test_name + triggered_by stored in Redis record after test case loads
- `api/tasks_beat.py` — `_check_and_fire()` and `_fire_suite()` rewritten to use SQLAlchemy
- Dependencies added: `sqlalchemy[asyncio]>=2.0.0`, `aiosqlite>=0.20.0`
- `HAWKEYE_DB_URL=postgresql://hawkeye:hawkeye@localhost:5432/hawkeye` in `Backend/.env` (not committed)

#### Track A+ — Celery Worker Stability ✓ FIXED
- **Fixed**: `api/redis_store.py` — global `_redis` singleton caused "Future attached to a different loop" crash in Celery prefork workers (each task creates a new event loop via `asyncio.run()`). `get_redis()` now detects event loop change and recreates connection pool. `save_traces()` accepts optional `client=` kwarg.
- **Fixed**: `api/tasks.py` — passes `client=r` to `save_traces()` to use the per-task Redis client, bypassing the stale global entirely. Prevented passing runs from being marked `errored`.
- **Fixed**: Suite runs now correctly pass `triggered_by` (read from `X-User-Email` header) and viewport into the Redis run record.

#### Track A++ — Live Log Lag ✓ FIXED
- **Fixed**: `orchestrator/agent/nodes/observe.py`, `reason.py`, `act.py` — `collector._emit()` uses `asyncio.create_task()` which only schedules Redis publish at the next await point, causing each log event to appear one operation late. Added `await asyncio.sleep(0)` after every `on_step_start`, `on_observe`, `on_reason`, `on_act` call to flush the pending task immediately before the next operation begins.

#### Track B — Stripe Billing ✓ COMPLETE
- Full checkout, portal, webhook handler with Stripe SDK
- `PLAN_LIMITS` dict enforced; `get_plan_limits()` exported for runs router
- Stub mode when `STRIPE_SECRET_KEY` absent

#### Track C — Celery Beat Scheduling ✓ COMPLETE
- `api/tasks_beat.py` — `tick_schedules()` task fires every minute; reads `SuiteSchedule` via SQLAlchemy
- `celery beat` service in docker-compose with `croniter` dependency

#### Track D — GitHub CI Integration ✓ COMPLETE
- `api/github_checks.py` — posts Check Run pass/fail after each run
- `api/slack.py` — failure notification to org Slack webhook
- `api/routes/webhooks.py` — GitHub push webhook with HMAC verification
- Schedule stores branch filter; webhook captures `head_commit.id`

#### Track E — Eval Observability ✗ NOT STARTED
- No Arize Phoenix / MLflow tracing in `TraceCollector`
- No eval CLI module (`orchestrator/eval/`)
- No eval dataset JSONL writing
- No benchmark comparison harness

#### Track F — Organization Management ⚠ PARTIAL
- `api/routes/orgs.py` — full org + member + invitation CRUD ✓
- `GET /api/orgs/me`, `PATCH /api/orgs/me`, member CRUD, invitation flow ✓
- **Gap:** No frontend org settings page (no `/app/settings/orgs` or `/app/settings/members` route)

#### Track G — Frontend Polish ✓ DONE
- Live execution sidebar (`runs/live/page.tsx`) now shows both test name and run ID (8-char truncated) per row

---

## Known Gaps (from HLD_LLD.md §8)

These gaps exist between the design spec and current implementation:

| Area | Gap | File to Change |
|---|---|---|
| TestCaseCreate API schema | `api/routes/test_cases_crud.py` still uses old flat schema; needs nested `goal_config` block matching `_template.yaml` | `api/routes/test_cases_crud.py` |
| Vault secret resolution | `target.vault[]` key references resolved via `_inject_vault_secrets()` in `api/tasks.py` but only at task execution time — not validated at dispatch | `api/tasks.py` |
| Agent prompt — step details | Step `description` + `success_signal` not injected into system prompt per checkpoint | `orchestrator/agent/prompt_builder.py` |
| Agent prompt — extra_details | `goal.extra_details` and `target.app_description` not passed to prompt builder | `orchestrator/agent/prompt_builder.py` |
| On-failure capture flags | `test_case.on_failure.capture` flags not checked — always captures everything | `orchestrator/agent/finalize.py` |
| Guard-rails policies | `forbidden_actions` / `navigation_policy` removed from template schema; guard_rails node is a no-op stub | `orchestrator/agent/nodes/guard_rails.py` |
| Frontend TestCaseSpec type | `src/lib/api/client.ts` `TestCaseSpec` may not match nested `goal_config` structure | `src/lib/api/client.ts` |
| Orchestrator DB layer | `orchestrator/db/` asyncpg layer has its own schema (different from SQLAlchemy models) — `DB upsert_test_case failed: column "suite" does not exist` (non-fatal) | `orchestrator/db/` |
| Org management UI | No frontend pages for org settings, member management, invite flow | `src/app/app/(workspace)/settings/` |
| Vault secrets for SauceDemo | `standard_user` / `secret_sauce` vault entries must be added manually via UI for SauceDemo tests to pass credential injection | Vault UI |

---

## Platform Compatibility Notes

- **Amazon** — headless Chromium fingerprinted; returns 908-char CAPTCHA shell. Requires Playwright stealth mode.
- **Temu** — forces login on first visit; agent blocks correctly within 2 steps.
- **Ollama** — `qwen3:8b` emits reasoning tokens but not tool_call format. Use `openrouter:openai/gpt-oss-120b:free` instead.
- **`@playwright/mcp@latest`** — only 8 tools confirmed present: `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, `browser_press_key`, `browser_wait_for`, `browser_hover`, `browser_select_option`. Tools `browser_scroll`, `browser_screenshot`, `browser_go_back`, `browser_tab_*` absent in current version.

---

## Development Commands

```bash
# Frontend
cd Frontend/hawkeye-web && npm run dev      # Dev server (http://localhost:3000)
cd Frontend/hawkeye-web && npm run build    # Production build
cd Frontend/hawkeye-web && npm run lint     # ESLint

# API server (from Backend/)
cd Backend
uv sync --extra dev
uvicorn api.main:app --reload --port 8000   # Dev API server

# Full stack (Docker)
docker compose build                         # Build all images
docker compose up                            # Start all services (api, worker, redis, nginx, sandbox)

# Celery worker (standalone)
cd Backend
celery -A api.celery_app worker --loglevel=info --concurrency 2

# Celery Beat scheduler
cd Backend
celery -A api.celery_app beat --loglevel=info

# Orchestrator CLI (from Backend/)
cd Backend
uv sync --extra dev

python -m orchestrator validate --test orchestrator/test_cases/wikipedia_search.yaml
python -m orchestrator list-tools

# Basic run
OPENROUTER_API_KEY=<key> python -m orchestrator run \
  --test orchestrator/test_cases/wikipedia_search.yaml

# With recording
OPENROUTER_API_KEY=<key> python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml --record

# With Figma design diff
OPENROUTER_API_KEY=<key> python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml --record \
  --figma-url https://www.figma.com/file/xxx --figma-token <token>

# Override to text-only model (disables visual agent)
OPENROUTER_API_KEY=<key> python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml \
  --model openrouter:openai/gpt-oss-120b:free

# Init DB
python -m orchestrator init-db --db-url postgres://user:pass@localhost/hawkeye
```

---

## Spec Reference Map

| Feature | Document |
|---|---|
| Full API contracts, data models, Redis schema, run lifecycle | `Docs/HLD_LLD.md` |
| Hybrid tool architecture (MCP + custom) | `Docs/HLD_LLD.md` §2 + spec.md §2.3 |
| Test case YAML schema + `_template.yaml` | `Docs/HLD_LLD.md` §1.3 + `orchestrator/test_cases/_template.yaml` |
| Agent graph nodes + edges | `Docs/HLD_LLD.md` §3 |
| Redis schema + run lifecycle | `Docs/HLD_LLD.md` §5–6 |
| Implementation gaps | `Docs/HLD_LLD.md` §8 |
| Sandbox container (Dockerfile, entrypoint) | spec.md §4 |
| Tracing & observability | spec.md §10 |
| Phase 7 eval plan | spec.md §11 |

---

## Conventions

- **Python**: 3.11+, type hints everywhere, dataclasses, minimal dependencies (prefer stdlib)
- **TypeScript** (frontend): strict mode, App Router patterns, shadcn/ui components
- **No comments** unless explaining WHY (hidden constraints, workarounds, non-obvious behavior)
- **No abstractions** beyond what the task requires — three similar lines > premature abstraction
- **Test before reporting done** — for UI changes, verify in browser; for CLI, run the actual command
- **HLD_LLD.md is the source of truth** for API contracts, data models, and design decisions
