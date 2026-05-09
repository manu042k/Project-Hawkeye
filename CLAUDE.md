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
│   ├── orchestrator/              # Phase 1 agent harness (CLI-only, no API yet)
│   │   ├── agent/                 # LangGraph StateGraph (nodes, edges, graph, prompt_builder)
│   │   ├── models/                # TestCase, AgentState, StepTrace, RunResult dataclasses
│   │   ├── runner/                # RunManager — full test lifecycle orchestration
│   │   ├── tools/                 # Custom tools: wait_for_stable, assert_text_present, etc.
│   │   ├── mcp/                   # PlaywrightMcpClient (stdio transport)
│   │   ├── cdp/                   # Chrome DevTools Protocol session
│   │   ├── trace/                 # Per-step trace collector (tokens, latency, cost)
│   │   ├── assertions/            # AssertionEngine (content + console types)
│   │   ├── llm/                   # LLM provider factory (Ollama / Groq)
│   │   ├── loader/                # YAML test case loader
│   │   ├── cli/                   # Click CLI entry point
│   │   └── test_cases/            # wikipedia_search.yaml (TC-001), amazon_add_to_cart.yaml (TC-002)
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

Triggered only when user provides `--figma-file` (Figma URL + access token). Runs after Pass 1 completes.

| Step | What happens |
|------|--------------|
| Export | Fetch target frames from Figma API as PNG |
| Capture | Take full-page screenshots from the completed run |
| Diff | Pixelmatch (Pillow-based) — actual vs Figma frame |
| Report | Diff % + highlighted diff image appended to HTML report |

**Design diff YAML schema** (future):
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

### AgentState additions

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

### Not Built Yet
- [ ] **Visual QA agent (Pass 1)** — screenshot capture in observe node, multimodal LLM message in reason node
- [ ] **Design diff (Pass 2)** — Figma API export + pixelmatch against actual screenshots (opt-in)
- [ ] **Orchestrator HTTP API** — FastAPI service (Phase 3)
- [ ] **Docker bridge network** — hawkeye-net with container DNS (Phase 3)
- [ ] **Reverse proxy** — Nginx routing noVNC by run ID
- [ ] **Container pool** — Pre-warmed containers
- [ ] **Frontend ↔ backend wiring** — All pages use mock data; no real API calls (Phase 4)
- [ ] **WebSocket live trace streaming** — real-time agent trace in Live Execution page (Phase 3)
- [ ] **CI/CD integration** — GitHub Actions webhook (Phase 4)
- [ ] **Billing** — Stripe integration (Phase 4)
- [ ] **a11y + performance assertion types** — Phase 3

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

### Phase 2.5 — Visual QA Agent 🔜 NEXT

**Goal:** Transform the agent into a true visual QA agent — sees the page via screenshot, not just accessibility tree.

**Pass 1 — Vision reasoning (always on):**
- `observe_node`: capture screenshot via `cdp_session.take_screenshot()` every step
- Store as `current_screenshot` + `screenshot_b64` in `AgentState`
- `reason_node`: build multimodal `HumanMessage` with image + truncated accessibility tree
- Vision LLM understands visual intent; tree provides element refs for tool calls
- Fallback: text-only models skip screenshot, use tree only (no crash)
- `AgentState` gains: `current_screenshot`, `screenshot_b64`, `step_screenshots`

**Pass 2 — Design diff (opt-in, requires Figma):**
- CLI flag: `--figma-url <url> --figma-token <token>`
- After Pass 1: export Figma frames via Figma API → pixelmatch vs actual screenshots
- Output: diff % + highlighted diff PNG appended to HTML report
- YAML assertion type: `visual_design` with `figma_frame` + `threshold` params
- Only runs when `--figma-url` is provided

**Implementation plan:**
1. `AgentState` — add `current_screenshot`, `screenshot_b64`, `step_screenshots` fields
2. `observe_node` — call `cdp_session.take_screenshot()` after `browser_snapshot`; store both
3. `reason_node` — detect vision-capable model; build multimodal message if screenshot present
4. `llm/provider.py` — add `is_vision_capable(model: str) -> bool` helper
5. `models/test_case.py` — add `visual_design` assertion type + `figma_frame`/`threshold` params
6. `orchestrator/vision/` — new package: `figma_client.py`, `pixel_diff.py`, `visual_assertions.py`
7. `assertions/engine.py` — wire `visual_design` type through vision package
8. `cli/main.py` — add `--figma-url`, `--figma-token` flags
9. `reporting/report_generator.py` — embed diff images in HTML report

### Phase 3 — Multi-Browser & API

- Docker bridge network (`hawkeye-net`) with container DNS — no host port mapping
- WebKit + Firefox browser support
- FastAPI REST API: test CRUD, run triggers, results
- WebSocket live trace streaming
- Job queue (Celery/Redis) for run scheduling
- Container pool with pre-warming
- Nginx reverse proxy routing noVNC by run ID (`/observe/:run_id`)

### Phase 4 — Dashboard Integration & Polish

- Wire Next.js frontend to FastAPI (replace all mock data)
- Real-time noVNC + agent trace in Live Execution page
- CI/CD webhook integration (GitHub Actions)
- Visual baseline management with approval workflow (uses Pass 2 diff)
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

# Orchestrator CLI
# Basic run
uv run python -m orchestrator run --test Backend/orchestrator/test_cases/wikipedia_search.yaml \
  --model openrouter:openai/gpt-oss-120b:free

# With recording
uv run python -m orchestrator run --test Backend/orchestrator/test_cases/saucedemo_cart.yaml \
  --model openrouter:openai/gpt-oss-120b:free --record

# With vision model (Phase 2.5)
uv run python -m orchestrator run --test Backend/orchestrator/test_cases/saucedemo_cart.yaml \
  --model openrouter:openai/gpt-4o --record

# With Figma design diff (Phase 2.5 Pass 2)
uv run python -m orchestrator run --test Backend/orchestrator/test_cases/saucedemo_cart.yaml \
  --model openrouter:openai/gpt-4o --record \
  --figma-url https://www.figma.com/file/xxx --figma-token <token>

# Validate test case
uv run python -m orchestrator validate --test Backend/orchestrator/test_cases/wikipedia_search.yaml

# List all tools
uv run python -m orchestrator list-tools

# Init DB
uv run python -m orchestrator init-db --db-url postgres://user:pass@localhost/hawkeye
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
