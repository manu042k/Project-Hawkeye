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
- [x] **Phase 1 smoke test cases** — `wikipedia_search.yaml` (TC-001) and `amazon_add_to_cart.yaml` (TC-002)

> **Phase 1 exit criteria status:** Backend ready. Pending real Ollama/Groq run against live Docker sandbox to confirm both test cases pass end-to-end from CLI.

### Not Built Yet
- [ ] **Orchestrator HTTP API** — FastAPI service (Phase 3)
- [ ] **Database** — PostgreSQL schema; RunResult currently in-memory only, not persisted
- [ ] **Docker bridge network** — hawkeye-net with container DNS (Phase 3)
- [ ] **Reverse proxy** — Nginx routing noVNC by run ID
- [ ] **Container pool** — Pre-warmed containers
- [ ] **Frontend ↔ backend wiring** — All pages use mock data; no real API calls (Phase 4)
- [ ] **WebSocket live trace streaming** — real-time agent trace in Live Execution page (Phase 3)
- [ ] **CI/CD integration** — GitHub Actions webhook (Phase 4)
- [ ] **Billing** — Stripe integration (Phase 4)
- [ ] **Extended assertion types** — visual (pixelmatch), network, a11y, performance (Phase 2)

---

## Phased Roadmap

### Phase 1 — CLI Agent Harness ✓ BACKEND COMPLETE

**Goal:** Run end-to-end agentic tests from CLI that reliably pass on:
1. **Wikipedia** — search a term, open article, scroll through content (TC-001)
2. **Amazon** — find a product, add to cart, navigate to cart, verify item present (TC-002)

**What was built:**
- `Backend/orchestrator/` — full Python package with LangGraph agent loop
- StateGraph nodes: `OBSERVE → REASON → ACT → GOAL_CHECK → ERROR_HANDLER → FINALIZE`
- Playwright MCP client (stdio transport) + 4 custom tools
- YAML test case loader + Pydantic schema
- Per-step trace collector (tokens, latency, cost, page context)
- Assertion engine (content + console types)
- Click CLI: `python -m orchestrator run --test <file.yaml>`
- Unit tests in `Backend/tests/unit/`, e2e stubs in `Backend/tests/e2e/`

**Remaining to validate:**
- Run `python -m orchestrator run --test Backend/orchestrator/test_cases/wikipedia_search.yaml` against a live Docker sandbox with Ollama or Groq configured
- Confirm both TC-001 and TC-002 pass with console trace output

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

# Orchestrator CLI (Phase 1 — built, pending live sandbox validation)
python -m orchestrator run --test Backend/orchestrator/test_cases/wikipedia_search.yaml
python -m orchestrator run --test Backend/orchestrator/test_cases/amazon_add_to_cart.yaml
python -m orchestrator validate --test Backend/orchestrator/test_cases/wikipedia_search.yaml
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
