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

### Not Built Yet
- [ ] **Agent loop engine** — LangGraph StateGraph (observe→reason→act→check)
- [ ] **Orchestrator API** — FastAPI service
- [ ] **Test case format** — YAML schema with goal, steps, assertions, constraints
- [ ] **CLI runner** — `hawkeye run --test <file.yaml>`
- [ ] **Custom tools** — wait_for_stable, assertions, network/console capture
- [ ] **Database** — PostgreSQL schema (test_cases, test_runs, agent_traces, etc.)
- [ ] **Docker bridge network** — hawkeye-net with container DNS
- [ ] **Reverse proxy** — Nginx routing noVNC by run ID
- [ ] **Tracing/observability** — Per-step token/latency/cost tracking
- [ ] **Assertion engine** — Visual, content, state, network, a11y, performance types
- [ ] **Container pool** — Pre-warmed containers
- [ ] **Frontend ↔ backend wiring** — All pages use mock data; no real API calls
- [ ] **CI/CD integration** — GitHub Actions webhook
- [ ] **Billing** — Stripe integration

---

## Phased Roadmap

### Phase 1 — CLI Agent Harness ★ CURRENT PRIORITY

**Goal:** Run end-to-end agentic tests from CLI that reliably pass on:
1. **Wikipedia** — search a term, scroll through results
2. **Amazon** — find a product, add to cart, navigate to cart, verify item present

**Work items:**
1. Set up Python orchestrator package (`Backend/orchestrator/`)
   - Dependencies: `langgraph`, `langchain-community`, `langchain-ollama`, `pyyaml`
   - Reuse existing `hawkeye_sandbox` for container management
2. Implement LangGraph agent loop as StateGraph:
   - `OBSERVE` node — call `wait_for_stable` + `browser_snapshot` via Playwright MCP
   - `REASON` node — send goal + page state + history to Ollama LLM
   - `ACT` node — execute tool call returned by LLM (route to Playwright MCP)
   - `CHECK` node — detect goal completion (`<GOAL_COMPLETE>` / `<GOAL_BLOCKED>`)
3. Connect to Playwright MCP inside container
   - Use Streamable HTTP transport on container port `:3100`
   - Or fall back to stdio transport via `npx @playwright/mcp` with `--cdp-endpoint`
4. Implement minimal custom tools:
   - `wait_for_stable` — basic page readiness (network idle + DOM settle)
   - `report_step_result` — log step outcomes
5. Define test case YAML format (simplified for Phase 1):
   ```yaml
   id: "TC-001"
   name: "Wikipedia search"
   target:
     url: "https://www.wikipedia.org"
     browser: "chromium"
   goal: "Search for 'artificial intelligence' and scroll through the article"
   steps:
     mode: "guided"
     checkpoints:
       - id: "S1"
         description: "Search for 'artificial intelligence'"
         success_signal: "Article page is displayed"
       - id: "S2"
         description: "Scroll through the article content"
         success_signal: "Multiple sections of the article are visible"
   constraints:
     max_steps: 20
     timeout_seconds: 120
   ```
6. Build CLI entry point: `python -m orchestrator run --test tests/wikipedia_search.yaml`
7. Console output: step-by-step trace with reasoning, tool calls, pass/fail verdict
8. Validate both scenarios work reliably with Ollama

**Exit criteria:** Both test cases pass from CLI with console trace output.

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

# Orchestrator (Phase 1 — once built)
python -m orchestrator run --test tests/wikipedia_search.yaml
python -m orchestrator run --test tests/amazon_add_to_cart.yaml
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
