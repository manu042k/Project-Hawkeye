# Project Hawkeye

AI-powered pre-deployment testing platform where autonomous agents execute verification tests against web applications inside observable Docker sandbox containers. Agents reason about what to do next based on **visual screenshots + accessibility tree** — no brittle recorded scripts.

The agent is fundamentally a **visual QA agent**: it takes a screenshot at every step, sends it to a vision-capable LLM alongside the accessibility tree, and decides actions based on what it *sees*. An optional second pass diffs final screenshots against a provided Figma/design file to catch visual regressions.

Spec document: `C:\Users\vjayr\Downloads\spec.md` (Hawkeye Implementation Specification v1.0)

---

## Architecture

```
Client Layer (Dashboard / CLI / CI Plugin)
        │
        ▼
Orchestration Layer (Python)
  ├── Agent Loop Engine    — observe → reason → act cycle (LangGraph)
  ├── Tool Router          — routes calls: Playwright MCP vs custom tools
  ├── Sandbox Manager      — Docker container lifecycle
  └── Trace Collector      — step-level logging
        │
        ▼
Sandbox Containers (Docker, one per test run)
  ├── Playwright + Browser (Chromium/Firefox/WebKit)
  ├── Playwright MCP Server (:3100)
  ├── Xvfb → x11vnc → websockify → noVNC (:6080)
  └── CDP endpoint (:9222)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.2, React 19, Tailwind 4, shadcn/ui, Zustand, NextAuth (Google/GitHub OAuth) |
| Orchestrator | Python 3.11+, LangGraph (Python), LangChain, Ollama (local LLM) |
| Vision LLM | Any multimodal model: GPT-4o, Claude Sonnet, Gemini — user-selectable via `--model` |
| API (Phase 3) | FastAPI, WebSocket |
| Database (Phase 2) | PostgreSQL + JSONB |
| Sandbox | Docker, Playwright, Xvfb, x11vnc, websockify, noVNC, @playwright/mcp |
| Visual diffing | Pillow + numpy (pixelmatch-style) — Phase 2.5, opt-in with Figma file |
| Container networking | Docker bridge (`hawkeye-net`) with container DNS (Phase 3) |

---

## Repository Layout

```
Project-Hawkeye/
├── Frontend/hawkeye-web/          # Next.js dashboard
│   ├── src/app/                   # App Router pages
│   │   ├── auth/                  # Login, signup, password recovery
│   │   ├── app/(global-hub)/      # Project selector, account, billing
│   │   └── app/(workspace)/       # Dashboard, runs, suites, vault, baselines, settings
│   ├── src/components/            # UI components (app chrome, auth, theme, shadcn)
│   ├── src/lib/mock-data/         # Demo data (all pages currently use this)
│   └── src/lib/                   # Stores (Zustand), auth config, utils
│
├── Backend/
│   ├── hawkeye_sandbox/           # Python sandbox manager package
│   │   ├── sandbox.py             # SandboxManager, SandboxConfig, SandboxHandle
│   │   ├── cli.py                 # CLI: spawn containers & record
│   │   ├── mcp.py                 # MCP config generation for Playwright/Chrome DevTools
│   │   ├── sandbox_image/         # Docker image definition
│   │   │   ├── Dockerfile
│   │   │   ├── entrypoint.sh
│   │   │   ├── launch_browser.py
│   │   │   └── supervisord.conf
│   │   └── examples/              # Example scripts
│   ├── orchestrator/              # Agent harness (CLI-only, no API yet)
│   │   ├── agent/                 # LangGraph StateGraph (nodes, edges, graph, prompt_builder)
│   │   ├── models/                # TestCase, AgentState, StepTrace, RunResult dataclasses
│   │   ├── runner/                # RunManager — full test lifecycle orchestration
│   │   ├── tools/                 # Custom tools: wait_for_stable, assert_text_present, etc.
│   │   ├── mcp/                   # PlaywrightMcpClient (stdio transport)
│   │   ├── cdp/                   # Chrome DevTools Protocol session
│   │   ├── trace/                 # Per-step trace collector (tokens, latency, cost)
│   │   ├── assertions/            # AssertionEngine (content + console + network + state + visual_design)
│   │   ├── llm/                   # LLM provider factory (Ollama / Groq / OpenRouter / NVIDIA NIM)
│   │   ├── vision/                # Visual QA: figma_client.py, pixel_diff.py, visual_assertions.py
│   │   ├── reporting/             # HTML + Markdown report generator
│   │   ├── db/                    # asyncpg DB layer + schema.sql (gated by HAWKEYE_DB_URL)
│   │   ├── loader/                # YAML test case loader
│   │   ├── cli/                   # Click CLI entry point
│   │   └── test_cases/            # wikipedia_search.yaml (TC-001), saucedemo_cart.yaml (TC-002b)
│   └── pyproject.toml             # uv / pyproject config
│
├── Docs/                          # Architecture & design docs
│   ├── SystemArchitecture.md
│   ├── SystemDesign.md
│   ├── UI-flow.md
│   └── Project_Hawkeye_Flow_Analysis.md
│
├── scripts/
│   └── test_spawn_all_browsers_groq_mcp.py  # PoC: spawn → MCP → LLM → tool execution
│
├── docker-compose.yml
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
- **Fallback**: text-only models (Ollama local) skip the screenshot and use accessibility tree only — no crash, graceful degradation

### Pass 1 — Visual reasoning agent (always on)

| Step | What happens |
|------|--------------|
| Observe | Screenshot via CDP + accessibility tree via MCP |
| Reason | Multimodal message: image + tree sent to vision LLM |
| Act | Playwright MCP tool call using element refs from tree |
| Goal check | LLM emits `<GOAL_COMPLETE>` or `<GOAL_BLOCKED>` based on visual state |

### Pass 2 — Design diff (opt-in, requires Figma file)

Triggered only when user provides `--figma-url` + `--figma-token`. Runs after Pass 1 completes.

| Step | What happens |
|------|--------------|
| Export | Fetch target frames from Figma API as PNG |
| Capture | Take full-page screenshots from the completed run |
| Diff | Pixelmatch (Pillow-based) — actual vs Figma frame |
| Report | Diff % + highlighted diff image appended to HTML report |

**Design diff YAML schema:**
```yaml
assertions:
  - id: "V1"
    type: "visual_design"
    description: "Cart page matches Figma design"
    params:
      figma_frame: "E-Commerce / Cart Page"
      threshold: 0.05   # max 5% pixel deviation
      viewport: { width: 1280, height: 720 }
```

### AgentState fields added in Phase 2.5

```python
current_screenshot: bytes | None       # raw PNG from CDP
screenshot_b64: str | None             # base64 for LLM message
step_screenshots: list[bytes]          # all step screenshots (for Pass 2)
```

---

## Current Progress

### Done
- [x] **Frontend UI** — All pages implemented with responsive design + dark mode
  - Landing page, auth (login/signup/recovery), global hub, account, billing
  - Project dashboard, test config, live execution, run report
  - Test suites, visual baselines, vault, settings/integrations
  - Middleware route protection, JWT validation, OAuth (Google/GitHub)
  - Zustand stores for project context and theme
  - Phase 1 mock data (dashboard, runs, suites) shaped to match backend API types exactly
- [x] **Sandbox container image** — Dockerfile with Xvfb, x11vnc, websockify, noVNC, Playwright, supervisord
- [x] **SandboxManager** — Spawn/stop Docker containers, random host port mapping, health checks
- [x] **VNC streaming** — Xvfb → x11vnc (view-only) → websockify → noVNC HTML client
- [x] **CDP proxy** — socat proxy (9222→9223) for Chromium-family remote debugging
- [x] **FFmpeg recording** — x11grab capture to MP4 inside container
- [x] **MCP config generation** — Dynamic server entries for chrome-devtools-mcp + @playwright/mcp
- [x] **CLI** — `hawkeye-sandbox spawn --url <URL> --browser chromium [--record]`
- [x] **PoC LLM integration** — Groq API + Playwright MCP stdio in `test_spawn_all_browsers_groq_mcp.py`
- [x] **Agent loop engine** — LangGraph StateGraph (observe→reason→act→goal_check→error_handler→finalize) in `Backend/orchestrator/agent/`
- [x] **Test case YAML format** — Pydantic schema in `Backend/orchestrator/models/test_case.py`; TC-001 + TC-002 YAML files ready
- [x] **CLI runner** — `python -m orchestrator run --test <file.yaml>` via `Backend/orchestrator/cli/main.py`
- [x] **Custom tools** — `wait_for_stable`, `assert_text_present`, `get_console_errors`, `report_step_result` in `Backend/orchestrator/tools/`
- [x] **MCP client** — `PlaywrightMcpClient` (stdio transport) in `Backend/orchestrator/mcp/`
- [x] **CDP session** — Chrome DevTools Protocol session manager in `Backend/orchestrator/cdp/`
- [x] **Trace collector** — Per-step token/latency/cost tracking in `Backend/orchestrator/trace/`
- [x] **Assertion engine** — Content + console assertion types in `Backend/orchestrator/assertions/`
- [x] **Phase 1 smoke test cases** — `wikipedia_search.yaml` (TC-001) and `saucedemo_cart.yaml` (TC-002b) — both PASS with `--record`
- [x] **Phase 2 observability** — DB layer, guard-rails node, 3 new tools, HTML+MD reports, `--record` flag, OpenRouter support
- [x] **Phase 2.5 visual QA agent** — screenshot capture in `observe_node`, multimodal LLM messages in `reason_node`, `is_vision_capable()` helper, NVIDIA NIM provider, Figma design diff pipeline (`vision/` package), `--figma-url`/`--figma-token` CLI flags, per-step screenshots embedded in HTML report, context trimming + rate-limit backoff in reason node

#### Phase 1 Orchestrator — Complete ✓ (branch: `feat/phase1-orchestrator`)
- [x] **Data models** — `orchestrator/models/` — `TestCase`, `AgentState`, `RunResult`, `StepTrace`, `ErrorInfo` (Pydantic + dataclasses)
- [x] **YAML loader** — `orchestrator/loader/yaml_loader.py` — full validation with `TestCaseValidationError`
- [x] **System prompt builder** — `orchestrator/agent/prompt_builder.py` — guided/unguided modes, checkpoints, tool conventions, login-wall `<GOAL_BLOCKED>` rule
- [x] **LLM provider** — `orchestrator/llm/provider.py` — `get_llm()` supports `ollama:*`, `groq:*`, `openrouter:*`
- [x] **Playwright MCP client** — `orchestrator/mcp/client.py` — stdio transport, stderr drain, JSON-RPC, 90s init timeout
- [x] **MCP tool adapter** — `orchestrator/mcp/tool_adapter.py` — 8 confirmed tools in `DEFAULT_ALLOWLIST`; diagnostic warning on missing tools
- [x] **CDP session** — `orchestrator/cdp/session.py` — websockets-based, Network + Console domains
- [x] **Custom tools** — `wait_for_stable`, `assert_text_present`, `get_console_errors`, `report_step_result`, `tool_registry`
- [x] **Agent nodes** — `observe`, `reason`, `act`, `goal_check`, `error_handler`, `finalize`
- [x] **Edge functions** — `route_after_reason`, `route_after_act` (→ `goal_check`), `route_after_goal_check`, `route_after_error`
- [x] **StateGraph** — `orchestrator/agent/graph.py` — compiled LangGraph with full observe→reason→act→goal_check loop
- [x] **Trace collector** — `orchestrator/trace/collector.py` — per-step accumulator + stdout renderer
- [x] **Assertion engine** — `orchestrator/assertions/engine.py` — `content` + `console` types; others → `skipped`
- [x] **Run manager** — `orchestrator/runner/run_manager.py` — resource lifecycle, try/finally teardown, `--record` MP4 support, single-tab enforcement
- [x] **CLI** — `orchestrator/cli/main.py` — `run`, `validate`, `list-tools` commands with Click; `--record` flag
- [x] **OpenRouter provider** — `openrouter:<provider/model>` format via `ChatOpenAI` + custom headers; `OPENROUTER_API_KEY` env var
- [x] **Retry logic** — standard 429/500 backoff `[2s, 4s, 8s]`; soft rate-limit (OpenRouter free tier) `[15s, 30s, 60s]`
- [x] **Tool arg sanitization** — strips `null` values and `[ref=eXX]` brackets from LLM tool calls in `act.py`
- [x] **MCP stderr drain** — background drainer prevents pipe-buffer deadlock on npx startup
- [x] **URL parsing fix** — `observe.py` `_parse_url_title()` handles unquoted `Page URL: https://...` format from `@playwright/mcp`
- [x] **Scroll tracking** — `page_scroll_count` state field resets on URL change; exposed in reason context
- [x] **Single-tab enforcement** — `_ensure_single_tab()` in run_manager closes Chrome session-restore ghost tabs before MCP connects
- [x] **Test case YAMLs**:
  - `wikipedia_search.yaml` (TC-001) — unguided, PASSED ✓
  - `saucedemo_cart.yaml` (TC-002b) — unguided, PASSED ✓ (SauceDemo demo store)
  - `amazon_add_to_cart.yaml` (TC-002) — Amazon blocked by bot detection (CAPTCHA); see notes
  - `temu_cart.yaml` (TC-003) — Temu blocked by mandatory login wall; emits `<GOAL_BLOCKED>` correctly

#### Phase 1 — Confirmed Working
- **TC-001 Wikipedia** — PASSED in ~6 steps, ~44s, ~$0.03 with `openrouter:openai/gpt-oss-120b:free`
- **TC-002b SauceDemo** — PASSED in ~8 steps, ~55s, ~$0.03 with `openrouter:openai/gpt-oss-120b:free`
- **Recording** — `--record` flag saves MP4 to `artifacts/<run-id>.mp4` via ffmpeg x11grab
- **Bot detection sites** (Amazon, Temu) — fail gracefully: Amazon loops on 908-char CAPTCHA page; Temu correctly emits `<GOAL_BLOCKED>` after 2 steps

#### Platform Compatibility Notes
- **Amazon** — headless Chromium is fingerprinted; product pages return 908-char CAPTCHA shell. Requires Playwright stealth mode (Phase 3).
- **Temu** — forces login on first visit; no guest browsing. Agent now blocks correctly within 2 steps.
- **Ollama** — `qwen3:8b` (thinking model) emits reasoning tokens but not tool_call format. Use `openrouter:openai/gpt-oss-120b:free` instead.
- **`@playwright/mcp@latest`** — only 8 tools confirmed present: `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, `browser_press_key`, `browser_wait_for`, `browser_hover`, `browser_select_option`. Tools `browser_scroll`, `browser_screenshot`, `browser_go_back`, `browser_tab_*` are absent in current version.

### Not Built Yet (Phase 6 scope)
- [ ] **PostgreSQL persistence** — swap in-memory stores (projects, test_cases, suites, vault, schedules) for real asyncpg-backed tables; Phase 5 used dict-based stores
- [ ] **Stripe billing** — checkout portal, webhook, plan enforcement on `POST /api/runs`
- [ ] **Visual baseline approval UI** — side-by-side diff viewer, approve/reject queue
- [ ] **Eval observability** — MLflow / Arize Phoenix trace instrumentation in `TraceCollector`
- [ ] **Celery Beat scheduling** — persist cron schedules to Redis/DB and fire via Celery Beat worker
- [ ] **GitHub Check Run API** — post pass/fail status back to PR; Slack failure notifications
- [ ] **Organization management UI** — invite members, assign roles, per-org billing

---

## Phased Roadmap

### Phase 1 — CLI Agent Harness ✓ COMPLETE

**Verified passing:**
- TC-001 Wikipedia — search, open article, scroll → PASSED (6–20 steps)
- TC-002b SauceDemo — login, add to cart, verify → PASSED (6 steps)
- Both with `--record` producing MP4 + MD + HTML artifacts

**What was built:**
- LangGraph StateGraph: `OBSERVE → REASON → ACT → GOAL_CHECK → ERROR_HANDLER → FINALIZE`
- Playwright MCP client (stdio) + 4 custom tools
- YAML test case loader + Pydantic schema
- Per-step trace collector, assertion engine (content + console)
- Click CLI: `python -m orchestrator run --test <file.yaml> [--record]`

**Passing tests:**
| Test | File | Status | Steps | Cost |
|------|------|--------|-------|------|
| TC-001 Wikipedia search + scroll | `wikipedia_search.yaml` | PASSED ✓ | ~6 | ~$0.03 |
| TC-002b SauceDemo add-to-cart | `saucedemo_cart.yaml` | PASSED ✓ | ~8 | ~$0.03 |
| TC-002 Amazon add-to-cart | `amazon_add_to_cart.yaml` | BLOCKED (bot detection) | — | — |
| TC-003 Temu add-to-cart | `temu_cart.yaml` | BLOCKED (login wall) | 2 | ~$0.01 |

### Phase 2 — Observability & Tracing ✓ COMPLETE

**What was built:**
- PostgreSQL persistence: 5 tables via asyncpg, gated by `HAWKEYE_DB_URL`
- CDP enhancements: `NetworkRequest` buffer, `take_screenshot()`, `enable_page_capture()`
- 3 new custom tools: `get_network_log`, `assert_network_request`, `assert_element_state` (7 total)
- Guard-rails node between reason → act (navigation policy + forbidden action checks)
- Assertion engine: `network` + `state` types added
- HTML + Markdown report generator — saved to `artifacts/` after every run
- CLI: `--record` MP4 capture, `--db-url`, `init-db` command
- LLM provider: `openrouter:` prefix routes to OpenRouter API

### Phase 2.5 — Visual QA Agent ✓ COMPLETE

**What was built:**
- `observe_node`: captures screenshot via `cdp_session.take_screenshot()` at every step; non-fatal on failure
- `reason_node`: detects vision-capable model via `is_vision_capable()`; sends multimodal `HumanMessage` (image + accessibility tree) to vision LLMs; text-only models receive tree only (no crash)
- `llm/provider.py`: `is_vision_capable(model)` helper + NVIDIA NIM provider (`nvidia:<name>`, requires `NVIDIA_API_KEY`)
- `AgentState`: new fields `current_screenshot`, `screenshot_b64`, `step_screenshots`
- `orchestrator/vision/`: `figma_client.py` (Figma API export), `pixel_diff.py` (Pillow/numpy pixelmatch), `visual_assertions.py` (runs `visual_design` assertion type)
- `assertions/engine.py`: `visual_design` type wired through vision package
- `cli/main.py`: `--figma-url` + `--figma-token` flags (also read from `FIGMA_URL`/`FIGMA_TOKEN` env vars)
- `reporting/report_generator.py`: per-step screenshots embedded inline in HTML report
- `reason_node` reliability: context trimming (24K char limit, keep last 3 pairs), exponential backoff for 429/5xx, emergency trim + retry on 413 context overflow, fast-fail on auth/billing errors

### Phase 3 — Multi-Browser & API ✓ COMPLETE

**What was built:**
- FastAPI REST API at `Backend/api/` — `POST /api/runs`, `GET /api/runs`, `GET /api/runs/{id}`, `DELETE /api/runs/{id}`
- WebSocket live trace streaming — `WS /api/ws/runs/{run_id}/trace`; `WebSocketManager` broadcasts per-step events to connected clients
- asyncio-based job queue (`api/job_queue.py`) — single background worker, 100-run in-memory history, cancel support
- `TraceCollector` gains optional `ws_emitter` callback — wired by job queue to push events over WebSocket
- `GET /api/test-cases` + `POST /api/test-cases/validate` — scans `orchestrator/test_cases/*.yaml`
- `GET /health` — readiness probe
- `Backend/Dockerfile.api` — slim Python 3.11 image with uv
- `docker-compose.yml` updated: `hawkeye-net` bridge network, `hawkeye-api` service on port 8000
- `pyproject.toml`: added `fastapi`, `uvicorn[standard]`, `python-multipart`; `hawkeye-api` script entry point

- Firefox/WebKit support: `PlaywrightMcpClient` now accepts `browser` param; uses `--browser firefox/webkit` (MCP launches headless browser) when CDP URL is absent
- Container pool (`api/container_pool.py`): `ContainerPool` pre-warms N chromium containers; `acquire()`/`release()` used by job queue; controlled by `HAWKEYE_POOL_SIZE` env var (default 0 = disabled)
- `RunManager` accepts `_prewarmed_handle`: skips spawn (1s settle vs 6s), releases back to pool after run
- `GET /api/runs/{run_id}/observe` endpoint returns live noVNC URL for a run
- Nginx reverse proxy (`nginx/nginx.conf`): proxies `/api/` + WebSocket upgrade to `hawkeye-api:8000`; `hawkeye-nginx` service added to docker-compose on port 80

- Celery + Redis job queue (`api/celery_app.py`, `api/tasks.py`, `api/redis_store.py`): persistent runs (survive API restart), parallel execution via `--concurrency N` worker
- Redis pub/sub for WebSocket streaming across worker/API process boundary
- `cancel()` revokes Celery task by stored `celery_task_id`
- Redis service + `hawkeye-worker` Celery service added to docker-compose
- **Tested:** persistence survives API restart; 2 parallel runs confirmed running simultaneously

### Phase 4 — Frontend ↔ Backend Wiring ✓ COMPLETE

**What was built:**
- API client layer (`src/lib/api/client.ts`, `hooks.ts`) — typed fetch wrappers + React polling hooks
- WebSocket hook (`useRunTraceStream`) — StrictMode-safe, defers close on CONNECTING state
- Dashboard page wired to `useRuns()` — live KPIs, pass rate, active run count
- New Run page wired to `useTestCases()` + `useCreateRun()` — real test case picker
- Live Execution page — WebSocket trace stream + noVNC iframe (`resize=scale&autoconnect=1`)
- Run Report page — `useRun()` + `useRunTraces()`, assertion table, step trace accordion
- `novnc_url` propagation: `TraceCollector.on_sandbox_ready()` → `ws_emitter` → Redis → frontend poll
- Redis deduplication fix in `list_runs()` (seen-set dedupe)
- Full SaaS platform architecture designed in `Docs/workflow.md`

### Phase 5 — SaaS Platform ✓ COMPLETE

Full design spec: `Docs/workflow.md` (layer diagram, PostgreSQL DDL, complete API reference, ADRs)

#### Phase 5F — Artifact Store ✓
- `Backend/api/artifact_store.py` — `ArtifactStore` protocol + `LocalArtifactStore`; serves files via `FileResponse` at `/api/runs/{id}/artifacts/{file}`
- `Backend/api/routes/artifacts.py` — manifest endpoint + per-file download route
- `report_generator.py` — `write_screenshot_files()` writes `screenshots/step_NN.png` from base64
- `tasks.py` — saves all artifacts after run; stores `artifact_manifest` in Redis record
- Run Report page — screenshot gallery with lightbox, download buttons (HTML/video/trace JSON)

#### Phase 5A — Project & Test Case Management ✓
- In-memory project CRUD (`Backend/api/routes/projects.py`) + project stats endpoint
- In-memory test case CRUD (`Backend/api/routes/test_cases_crud.py`) — full CRUD, clone, import-yaml
- `seed_from_yaml_dir()` — auto-imports all YAML test cases into default project on startup
- `RunRequest` accepts `test_case_id`; resolves to temp YAML before handing off to `RunManager`
- Frontend: test case library (`/app/test-cases`), 5-step creation wizard (`/app/test-cases/new`), detail page (`/app/test-cases/[id]`)
- `/runs/new` — unified DB + YAML picker with `?tc=<id>` pre-selection; sends `test_case_id` or `test_case_path`

#### Phase 5B — Test Suites ✓
- `Backend/api/routes/suites.py` — suite CRUD + `POST .../run` returns test_case_ids to dispatch
- Suites page fully wired — create, delete, run-all with live toast; loading skeleton

#### Phase 5C — Environments & Vault ✓
- `Backend/api/routes/vault.py` — secret CRUD with reveal-on-demand; name-uniqueness guard per project
- Vault page fully rewritten — add-secret inline form, reveal/hide toggle, clipboard copy, delete

#### Phase 5D — Scheduling & CI/CD ✓
- `Backend/api/routes/schedules.py` — cron schedule CRUD per suite; GitHub push webhook with HMAC-SHA256 verification (`GITHUB_WEBHOOK_SECRET`)
- Suites page — calendar icon per card opens schedule modal with cron presets + branch filter
- Integrations page — real webhook URL display with copy button; `CORS_ORIGINS` env var wired

#### Phase 5E — Multi-tenancy & Auth ✓
- `apiFetch` sends `X-User-Email` header sourced from NextAuth session via `setAuthUser()`
- Sidebar shows user avatar, name, and email when authenticated
- `Backend/api/routes/me.py` — `/api/me` echoes identity from header; returns role

#### Phase 5G — Billing & Usage Metering ✓
- `Backend/api/routes/usage.py` — real usage from run count, vault secrets, artifact disk size
- Billing page — replaced all mock imports; usage meters + cost fetched from `/api/usage`; loading skeleton while fetching

### Phase 6 — Agent Evaluation & Benchmarking 🔧 NEXT
- MLflow / Arize Phoenix trace instrumentation in `TraceCollector`
- Curated eval dataset from past run traces with ground-truth labels
- Eval metrics: goal completion rate, steps-to-completion, cost per run, hallucination rate
- Regression gate: block prompt changes that drop completion rate >5% or raise cost >20%
- PostgreSQL persistence — swap in-memory Phase 5 stores for real asyncpg-backed tables
- Stripe billing — checkout portal, webhook, plan limit enforcement on `POST /api/runs`

---

## Development Commands

```bash
# Frontend
cd Frontend/hawkeye-web && npm run dev      # Dev server (http://localhost:3000)
cd Frontend/hawkeye-web && npm run build    # Production build
cd Frontend/hawkeye-web && npm run lint     # ESLint

# Sandbox container
docker compose build                         # Build sandbox image
docker compose up                            # Run sandbox (uses .env)

# Sandbox CLI (Python)
python -m hawkeye_sandbox --url https://example.com --browser chromium
python -m hawkeye_sandbox --url https://example.com --all   # All browsers

# PoC test script
set GROQ_API_KEY=<key>
python scripts/test_spawn_all_browsers_groq_mcp.py --url https://example.com

# Orchestrator CLI (run from Backend/ directory)
cd Backend
uv sync --extra dev

# Validate a test case
python -m orchestrator validate --test orchestrator/test_cases/wikipedia_search.yaml

# List available tools
python -m orchestrator list-tools

# Basic run (default model is gpt-4o — visual agent always on)
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-) python -m orchestrator run \
  --test orchestrator/test_cases/wikipedia_search.yaml

# With recording
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-) python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml --record

# With Figma design diff
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-) python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml --record \
  --figma-url https://www.figma.com/file/xxx --figma-token <token>

# Override to a cheaper text-only model (disables visual agent)
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-) python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml \
  --model openrouter:openai/gpt-oss-120b:free

# Init DB
python -m orchestrator init-db --db-url postgres://user:pass@localhost/hawkeye
```

---

## Spec Reference Map

The full Hawkeye spec lives at `C:\Users\vjayr\Downloads\spec.md`. Key sections:

| Feature | Spec Section |
|---|---|
| Hybrid tool architecture (MCP + custom) | §2.3 |
| Test case YAML schema | §3 |
| Sandbox container (Dockerfile, entrypoint, networking) | §4 |
| Agent loop engine (state graph, nodes, edges) | §5 |
| Page readiness system (`wait_for_stable`) | §6 |
| Orchestrator structure (directory layout, tools, CDP) | §7 |
| Database schema (test_cases, test_runs, agent_traces) | §8 |
| API endpoints (REST + WebSocket) | §9 |
| Tracing & observability | §10 |
| Implementation roadmap | §11 |
| Cost estimation per test run | §12 |
| Security considerations | §13 |

---

## Conventions

- **Python**: 3.11+, type hints everywhere, dataclasses, minimal dependencies (prefer stdlib)
- **TypeScript** (frontend): strict mode, App Router patterns, shadcn/ui components
- **No comments** unless explaining WHY (hidden constraints, workarounds, non-obvious behavior)
- **No abstractions** beyond what the task requires — three similar lines > premature abstraction
- **Test before reporting done** — for UI changes, verify in browser; for CLI, run the actual command
- **Spec is the source of truth** for feature design — consult it before implementing
