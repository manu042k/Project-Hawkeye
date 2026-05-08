# Project Hawkeye

AI-powered pre-deployment testing platform where autonomous agents execute verification tests against web applications inside observable Docker sandbox containers. Agents reason about what to do next based on a natural-language test goal and the current page state — no brittle recorded scripts.

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
| API (Phase 3) | FastAPI, WebSocket |
| Database (Phase 2) | PostgreSQL + JSONB |
| Sandbox | Docker, Playwright, Xvfb, x11vnc, websockify, noVNC, @playwright/mcp |
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
│   └── pyproject.toml             # Poetry config
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

## Current Progress

### Done
- [x] **Frontend UI** — All pages implemented with responsive design + dark mode
  - Landing page, auth (login/signup/recovery), global hub, account, billing
  - Project dashboard, test config, live execution, run report
  - Test suites, visual baselines, vault, settings/integrations
  - Middleware route protection, JWT validation, OAuth (Google/GitHub)
  - Zustand stores for project context and theme
- [x] **Sandbox container image** — Dockerfile with Xvfb, x11vnc, websockify, noVNC, Playwright, supervisord
- [x] **SandboxManager** — Spawn/stop Docker containers, random host port mapping, health checks
- [x] **VNC streaming** — Xvfb → x11vnc (view-only) → websockify → noVNC HTML client
- [x] **CDP proxy** — socat proxy (9222→9223) for Chromium-family remote debugging
- [x] **FFmpeg recording** — x11grab capture to MP4 inside container
- [x] **MCP config generation** — Dynamic server entries for chrome-devtools-mcp + @playwright/mcp
- [x] **CLI** — `hawkeye-sandbox spawn --url <URL> --browser chromium [--record]`
- [x] **PoC LLM integration** — Groq API + Playwright MCP stdio in `test_spawn_all_browsers_groq_mcp.py`

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

### Not Built Yet
- [ ] **Orchestrator API** — FastAPI service
- [ ] **Database** — PostgreSQL schema (test_cases, test_runs, agent_traces, etc.)
- [ ] **Docker bridge network** — hawkeye-net with container DNS
- [ ] **Reverse proxy** — Nginx routing noVNC by run ID
- [ ] **Tracing/observability** — Full per-step token/latency/cost tracking (Phase 2)
- [ ] **Assertion engine (advanced)** — Visual, state, network, a11y, performance types (Phase 2)
- [ ] **Container pool** — Pre-warmed containers
- [ ] **Frontend ↔ backend wiring** — All pages use mock data; no real API calls
- [ ] **CI/CD integration** — GitHub Actions webhook
- [ ] **Billing** — Stripe integration

---

## Phased Roadmap

### Phase 1 — CLI Agent Harness ✅ COMPLETE

**Primary model:** `openrouter:openai/gpt-oss-120b:free` — free tier, reliable tool calling, ~$0.03/run

**LLM providers available:**
- `openrouter:<provider/model>` — primary; requires `OPENROUTER_API_KEY` in `Backend/.env`
- `groq:<model>` — fallback; 200K token/day limit; requires `GROQ_API_KEY`
- `ollama:<model>` — local only; thinking models (qwen3) don't emit tool calls, avoid

**Passing tests:**
| Test | File | Status | Steps | Cost |
|------|------|--------|-------|------|
| TC-001 Wikipedia search + scroll | `wikipedia_search.yaml` | PASSED ✓ | ~6 | ~$0.03 |
| TC-002b SauceDemo add-to-cart | `saucedemo_cart.yaml` | PASSED ✓ | ~8 | ~$0.03 |
| TC-002 Amazon add-to-cart | `amazon_add_to_cart.yaml` | BLOCKED (bot detection) | — | — |
| TC-003 Temu add-to-cart | `temu_cart.yaml` | BLOCKED (login wall) | 2 | ~$0.01 |

### Phase 2 — Observability & Tracing

- Full per-step tracing: tokens, latency, cost breakdown per agent step
- PostgreSQL persistence: `agent_traces`, `run_traces_summary` tables (see spec §8)
- CDP-based custom tools: `get_network_log`, `get_console_errors`, `assert_network_request`
- Assertion engine: visual (`pixelmatch`), content, state, network, console types (spec §3.3)
- `wait_for_stable` upgraded to multi-signal (DOM mutations, network quiescence, visual stability)
- Structured HTML/markdown report generation
- Guard rails node: navigation policy enforcement, forbidden action checks (spec §7.4)

### Phase 3 — Multi-Browser & API

- Docker bridge network (`hawkeye-net`) with container DNS — no host port mapping (spec §4.4)
- WebKit + Firefox browser support
- FastAPI REST API: test CRUD, run triggers, results (spec §9.1)
- WebSocket live trace streaming (spec §9.2)
- Job queue (Celery/Redis or similar) for run scheduling
- Container pool with pre-warming
- Nginx reverse proxy routing noVNC by run ID (`/observe/:run_id`)

### Phase 4 — Dashboard Integration & Polish

- Wire Next.js frontend to FastAPI (replace all mock data)
- Real-time noVNC + agent trace in Live Execution page
- CI/CD webhook integration (GitHub Actions)
- Visual baseline management with approval workflow
- Vault secrets injection into test runs
- Billing/usage metering
- Suite-level orchestration: parallel runs, dependency chains
- Cross-run analytics dashboard

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

# Orchestrator (Phase 1 — BUILT, run from Backend/ directory)
cd Backend

# Install/sync dependencies
uv sync --extra dev

# Validate a test case YAML
python -m orchestrator validate --test orchestrator/test_cases/wikipedia_search.yaml

# List available Playwright MCP tools (useful for debugging tool name changes)
python -m orchestrator list-tools

# Run TC-001 Wikipedia (PASSING)
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-) python -m orchestrator run \
  --test orchestrator/test_cases/wikipedia_search.yaml \
  --model openrouter:openai/gpt-oss-120b:free --verbose

# Run TC-002b SauceDemo add-to-cart (PASSING)
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-) python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml \
  --model openrouter:openai/gpt-oss-120b:free --verbose

# Run any test with MP4 recording saved to artifacts/
OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' .env | cut -d= -f2-) python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml \
  --model openrouter:openai/gpt-oss-120b:free --verbose --record

# Run unit tests (no external deps)
pytest tests/unit/ -v

# Run integration tests (requires running Docker)
pytest tests/integration/ -v -m integration
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
