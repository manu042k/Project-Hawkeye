# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project-Hawkeye is an autonomous QA testing system that uses LLM-driven agents to execute browser-based test plans inside isolated Docker sandboxes. The agent loops through Think→Act→Decide cycles using LangGraph, controls Chrome via Playwright, and streams visual output via noVNC.

## Running the Agent

```bash
# Run from a JSON test plan
python -m Backend.agent.entrypoints.cli --input-json test.json

# Run with inline arguments
python -m Backend.agent.entrypoints.cli --objective "Add item to cart" --url "https://example.com"

# With Groq cloud LLM (set env var first)
export GROQ_API_KEY="your-key"
python -m Backend.agent.entrypoints.cli --input-json test.json
```

## Setup

```bash
# Install Python dependencies (from Backend/)
pip install -r Backend/requirements.txt

# Ensure Ollama is running locally with required models
ollama pull qwen2.5:7b
ollama pull llama3

# Build sandbox Docker image
cd Backend/hawkeye_sandbox && docker build -t hawkeye-sandbox .
```

## Architecture

### Execution Flow
1. `AgentService` (`Backend/agent/core/service.py`) receives a JSON test plan and spins up a Docker sandbox via `SandboxManager`.
2. `SandboxManager` (`Backend/hawkeye_sandbox/sandbox.py`) provisions an ephemeral container with Playwright, Xvfb, x11vnc, noVNC (port 6080), and CDP access.
3. `AgentWorkflow` (`Backend/agent/execution/workflow.py`) runs a LangGraph state graph: LLM plans the next action → Playwright executes it → results feed back into state.
4. Actions: `navigate`, `click`, `type`, `scroll`, `wait`, `complete`, `fail`.
5. Assertions: `url_contains`, `text_present`, `selector_visible`, `title_contains`.
6. Artifacts are written to `artifacts/agent-runs/{run_id}/` (JSON summary, Markdown report, JSONL action log, browser logs, sandbox logs).

### Key Modules
| Module | Purpose |
|---|---|
| `Backend/agent/core/service.py` | Top-level orchestrator; manages sandbox lifecycle and delegates to workflow |
| `Backend/agent/execution/workflow.py` | LangGraph state graph (Think→Act→Decide loop) |
| `Backend/agent/core/ollama_runtime.py` | LLM interface; supports Ollama (local) and Groq (cloud) |
| `Backend/hawkeye_sandbox/sandbox.py` | Docker container provisioning and teardown |
| `Backend/agent/models/schemas.py` | Pydantic models: `TestCase`, `Action`, `Assertion`, `AgentState` |
| `Backend/agent/storage/` | Artifact persistence — JSON, Markdown, JSONL writers |
| `Backend/agent/utils/` | CDP/network inspector, browser helpers |

### LLM Configuration
- Default: Ollama local (`qwen2.5:7b` or `llama3`) on `localhost:11434`.
- Cloud fallback: Groq API via `GROQ_API_KEY` env var.
- Model and endpoint are configurable in `Backend/agent/core/ollama_runtime.py`.

### MCP Integration
Scripts in `scripts/` wire up Model Context Protocol servers for `chrome-devtools` and `playwright` tools, allowing external MCP clients to drive the agent.

## Test Plan JSON Format

See `Backend\agent\examples\sample_test_plan.json` for a full example. Top-level fields: `objective`, `url`, `steps` (array of `{action, params}` or `{assert, params}`), `max_iterations`.

## Docs

- `Docs/SystemArchitecture.md` — 4-phase architecture diagram (control plane, orchestrator, sandbox, LLM)
- `Docs/SystemDesign.md` — Mermaid component flow diagrams
- `Docs/Project_Hawkeye_Flow_Analysis.md` — QA test phases with MCP integration detail
- `CHANGELOG.md` — Task-tracked version history

## Frontend

`Frontend/` is a placeholder for a future Next.js dashboard. It is not yet implemented.
