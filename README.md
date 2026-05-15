# Hawkeye

> AI-powered pre-deployment testing platform. Autonomous agents execute visual QA tests against web applications inside observable Docker sandbox containers — no brittle recorded scripts.

The agent takes a **screenshot at every step**, sends it to a vision-capable LLM alongside the accessibility tree, and decides what to do based on what it *sees*. An optional second pass diffs final screenshots against a Figma design file to catch visual regressions.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                            │
│   Next.js Dashboard  │  CI/CD Plugin  │  GitHub Webhook      │
└──────────────┬───────────────────────────────────┬──────────┘
               │ HTTPS / WebSocket                  │ Webhook
┌──────────────▼───────────────────────────────────▼──────────┐
│                    FastAPI  (port 8000)                       │
│  Auth · Projects · Test Cases · Suites · Vault · Orgs        │
└──────────────┬──────────────────────────────────────────────┘
               │ Celery task
┌──────────────▼──────────┐        ┌──────────────────────────┐
│    Celery Worker         │        │        Redis             │
│  run_test_case           │───────▶│  Run records · Traces    │
│  tick_schedules (Beat)   │ events │  Pub/Sub channels        │
└──────────────┬──────────┘        └──────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                  Agent Orchestrator (LangGraph)              │
│   OBSERVE → REASON → GUARD_RAILS → ACT → GOAL_CHECK         │
└──────────────┬──────────────────────────────────────────────┘
               │ MCP / CDP
┌──────────────▼──────────────────────────────────────────────┐
│           Sandbox Container (Docker)                         │
│   Playwright · noVNC (:6080) · Chrome DevTools (:9222)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind 4, shadcn/ui, Zustand, NextAuth |
| API | FastAPI, Uvicorn, WebSocket |
| Agent | Python 3.11+, LangGraph, LangChain |
| Vision LLM | GPT-4o, Claude Sonnet, Gemini, NVIDIA NIM — user-selectable |
| Task queue | Celery + Redis |
| Database | PostgreSQL (+ SQLite fallback for dev) |
| Sandbox | Docker, Playwright, Xvfb, noVNC, `@playwright/mcp` |
| Secrets | AES-256-GCM vault |
| Billing | Stripe |

---

## Repository Layout

```
Project-Hawkeye/
├── Backend/
│   ├── api/                  # FastAPI application + Celery tasks
│   │   ├── routes/           # REST endpoints (runs, projects, suites, vault, …)
│   │   ├── models.py         # SQLAlchemy ORM models
│   │   ├── database.py       # Async engine + session factory
│   │   ├── tasks.py          # Celery run_test_case task
│   │   ├── tasks_beat.py     # Celery Beat schedule ticker
│   │   └── redis_store.py    # Run record + trace persistence
│   ├── orchestrator/         # LangGraph agent harness
│   │   ├── agent/            # Graph nodes + edges
│   │   ├── runner/           # RunManager — full test lifecycle
│   │   ├── tools/            # Custom Playwright tools
│   │   └── test_cases/       # Built-in YAML test cases
│   ├── hawkeye_sandbox/      # Docker sandbox manager package
│   └── .env.example          # ← backend environment template
│
├── Frontend/hawkeye-web/
│   ├── src/app/              # Next.js App Router pages
│   │   ├── auth/             # Login, signup, OAuth
│   │   ├── app/(global-hub)/ # Project selector, account, billing
│   │   └── app/(workspace)/  # Dashboard, runs, suites, vault, settings
│   ├── src/components/       # UI components
│   ├── src/lib/api/          # Typed API client + React hooks
│   ├── src/lib/project/      # Per-user project store (Zustand)
│   ├── src/lib/notifications/ # Per-user notification store (Zustand)
│   └── .env.example          # ← frontend environment template
│
├── Docs/                     # HLD/LLD, architecture, UI flow docs
├── docker-compose.yml        # Full stack: api · worker · redis · nginx · sandbox
├── start.sh                  # Local dev launcher (Redis + API + Worker + Beat)
└── nginx/nginx.conf          # Reverse proxy (port 80 → api:8000)
```

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- Redis (or use the Docker Compose service)
- PostgreSQL (or use SQLite fallback — no setup needed)

### 1 — Clone & configure

```bash
git clone https://github.com/your-org/project-hawkeye.git
cd project-hawkeye
```

**Backend:**
```bash
cp Backend/.env.example Backend/.env
# Edit Backend/.env — set HAWKEYE_AUTH_SECRET, HAWKEYE_INTERNAL_SECRET,
# VAULT_ENCRYPTION_KEY, and at least one LLM provider key.
```

**Frontend:**
```bash
cp Frontend/hawkeye-web/.env.example Frontend/hawkeye-web/.env.local
# Edit .env.local — set NEXTAUTH_SECRET, HAWKEYE_INTERNAL_SECRET (must match
# backend), and OAuth credentials (GOOGLE_CLIENT_ID / GITHUB_ID).
```

### 2 — Start with Docker Compose (recommended)

```bash
docker compose up --build
```

Services started:
| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Sandbox noVNC | http://localhost:6080 |

### 3 — Start locally (dev mode)

```bash
# Terminal 1 — Frontend
cd Frontend/hawkeye-web
npm install
npm run dev              # http://localhost:3000

# Terminal 2 — Backend (API + Worker + Beat + Redis)
./start.sh
```

`start.sh` launches Redis, the FastAPI server (`uvicorn`), a Celery worker, and Celery Beat — all with live reload, logging to `Backend/logs/`.

---

## Running Tests (Agent CLI)

```bash
cd Backend
uv sync --extra dev

# Validate a test case
python -m orchestrator validate --test orchestrator/test_cases/wikipedia_search.yaml

# Run a test (requires a running sandbox container)
NVIDIA_API_KEY=<key> python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml

# Run with a different model
OPENROUTER_API_KEY=<key> python -m orchestrator run \
  --test orchestrator/test_cases/wikipedia_search.yaml \
  --model openrouter:anthropic/claude-3-5-haiku

# Run with Figma visual diff
NVIDIA_API_KEY=<key> python -m orchestrator run \
  --test orchestrator/test_cases/saucedemo_cart.yaml \
  --figma-url https://www.figma.com/file/xxx --figma-token <token>
```

---

## Environment Variables

### Backend — `Backend/.env`

| Variable | Required | Description |
|---|---|---|
| `HAWKEYE_DB_URL` | | PostgreSQL URL. Omit to use SQLite. |
| `REDIS_URL` | | Redis broker. Default: `redis://localhost:6379/0` |
| `HAWKEYE_AUTH_SECRET` | ✓ | Signs backend JWTs. Generate: `openssl rand -hex 32` |
| `HAWKEYE_INTERNAL_SECRET` | ✓ | Shared with frontend for OAuth token exchange. |
| `VAULT_ENCRYPTION_KEY` | ✓ | AES-256-GCM key for vault secrets. |
| `HAWKEYE_DEV_EMAIL` | | Dev user email seeded on startup. |
| `HAWKEYE_DEV_PASSWORD` | | Dev user password. |
| `NVIDIA_API_KEY` | | NVIDIA NIM (default model provider). |
| `OPENROUTER_API_KEY` | | OpenRouter cloud models. |
| `GROQ_API_KEY` | | Groq inference. |
| `STRIPE_SECRET_KEY` | | Billing. Omit for stub mode. |
| `GITHUB_WEBHOOK_SECRET` | | GitHub push webhook HMAC. |
| `SLACK_WEBHOOK_URL` | | Slack failure notifications. |

See `Backend/.env.example` for the full list.

### Frontend — `Frontend/hawkeye-web/.env.local`

| Variable | Required | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | ✓ | NextAuth JWT secret. Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✓ | App base URL. `http://localhost:3000` in dev. |
| `NEXT_PUBLIC_API_URL` | ✓ | Backend API URL. |
| `HAWKEYE_INTERNAL_SECRET` | ✓ | Must match backend value. |
| `GOOGLE_CLIENT_ID/SECRET` | | Google OAuth SSO. |
| `GITHUB_ID/SECRET` | | GitHub OAuth SSO. |

---

## Key Features

- **Visual QA agent** — screenshot + accessibility tree at every step; vision LLMs see the page as a human would
- **Multi-browser** — Chromium, Firefox, WebKit
- **Test suites** — group test cases, run all at once, schedule with cron
- **Vault** — AES-256-GCM encrypted secrets injected at runtime
- **Live execution view** — noVNC iframe + real-time trace stream via WebSocket
- **Project isolation** — each project has its own test cases, vault, environments, and members
- **Per-user workspaces** — last open project and notifications are scoped to each logged-in user
- **Figma diff** — optional visual regression against design files (Pass 2)
- **CI/CD** — GitHub push webhook triggers suite runs on branch push
- **Scheduling** — cron-based suite scheduling via Celery Beat
- **Billing** — Stripe checkout, usage metering, plan limits

---

## Agent State Machine

```
START → OBSERVE → REASON → GUARD_RAILS → ACT → GOAL_CHECK → OBSERVE (loop)
                                                     ↓
                                               FINALIZE → END
                     ERROR_HANDLER ←── (on error)
```

| Node | Role |
|---|---|
| OBSERVE | Screenshot (CDP) + accessibility tree (MCP) |
| REASON | Multimodal LLM call with context trimming |
| GUARD_RAILS | Blocks cross-domain navigation and policy violations |
| ACT | Executes the first tool call |
| GOAL_CHECK | Detects `<GOAL_COMPLETE>` / `<GOAL_BLOCKED>` signals |
| ERROR_HANDLER | Classifies errors, retries MCP reconnect |
| FINALIZE | Runs assertions, saves artifacts, prints report |

---

## Development

```bash
# Frontend lint + type check
cd Frontend/hawkeye-web
npm run lint
npx tsc --noEmit

# Backend
cd Backend
uv run ruff check api/ orchestrator/
```

Logs (when using `start.sh`):
```
Backend/logs/api.log
Backend/logs/worker.log
Backend/logs/beat.log
Backend/logs/redis.log
```

---

## Documentation

| Doc | Contents |
|---|---|
| `Docs/HLD_LLD.md` | Authoritative API contracts, data models, Redis schema, run lifecycle |
| `Docs/SystemArchitecture.md` | High-level architecture |
| `Docs/UI-flow.md` | Frontend navigation and page flow |
| `CLAUDE.md` | AI assistant context and implementation progress |
