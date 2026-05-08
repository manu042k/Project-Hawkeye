# AgentQA — AI Agent Visual Verification & Pre-Deployment Testing Platform

## Implementation Specification v1.0

---

## 1. Product Overview

AgentQA is an AI-powered pre-deployment testing platform where autonomous agents execute verification tests against browser-based web applications inside observable sandbox containers. Unlike traditional automation that replays brittle recorded scripts, agents dynamically reason about what to do next based on a natural-language test goal and the current page state.

### 1.1 Core Differentiators

- **Observable sandbox execution** — every test run streams a real-time noVNC feed so engineers can watch the agent interact with the application live, building trust and enabling human-in-the-loop debugging.
- **Goal-driven agents** — test cases specify *what* to verify, not *how* to click. Agents plan their own action sequences and adapt when the UI changes.
- **Multi-browser coverage** — Chromium, WebKit, and Firefox via Playwright's cross-browser engine.
- **Hybrid tool architecture** — Playwright MCP handles browser interaction (the solved problem); custom orchestrator tools handle testing intelligence (the differentiator).

### 1.2 Target Users

- QA engineers authoring test cases in YAML/JSON and reviewing agent runs.
- Engineering teams integrating the platform into CI/CD pipelines.
- Product teams watching test runs for visual sign-off before deployment.

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                              │
│  Dashboard UI  │  CLI  │  CI/CD Plugin  │  MCP Client (optional) │
└───────┬──────────┬────────┬──────────────┬───────────────────────┘
        │          │        │              │
        ▼          ▼        ▼              ▼
   Host port :8080 (only externally exposed port)
        │
┌───────┴──────────────────────────────────────────────────────────┐
│              Docker Network: agentqa-net (bridge)                  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   ORCHESTRATION LAYER                       │  │
│  │                                                             │  │
│  │  API Gateway (REST + WebSocket)                             │  │
│  │  ├── Test Run Manager       — queues runs, manages lifecycle│  │
│  │  ├── Agent Loop Engine      — observe → reason → act cycle  │  │
│  │  ├── Tool Router            — routes calls (MCP vs custom)  │  │
│  │  ├── Assertion Engine       — evaluates pass/fail criteria  │  │
│  │  ├── Trace Collector        — structured agent step logging │  │
│  │  ├── Results Store          — screenshots, traces, verdicts │  │
│  │  └── Reverse Proxy (Nginx)  — routes noVNC by run ID       │  │
│  │        /observe/:run_id → container:6080                    │  │
│  └──────────┬────────────────────┬────────────────────────────┘  │
│             │                    │                                │
│     ┌───────┴──────┐    ┌───────┴──────┐                         │
│     │ run-abc123   │    │ run-def456   │    ... N containers     │
│     │ :9222 (CDP)  │    │ :9222 (CDP)  │    (same internal ports │
│     │ :3100 (MCP)  │    │ :3100 (MCP)  │     no host mapping,   │
│     │ :6080 (noVNC)│    │ :6080 (noVNC)│     no conflicts)      │
│     └──────────────┘    └──────────────┘                         │
│                                                                   │
│  Orchestrator connects to containers by name on the bridge:       │
│    MCP:   http://run-abc123:3100/mcp                              │
│    CDP:   ws://run-abc123:9222                                    │
│    noVNC: proxied via /observe/run-abc123 → run-abc123:6080       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Networking model:** All containers and the orchestrator share a Docker bridge network (`agentqa-net`). The orchestrator addresses each container by its unique run-ID hostname (e.g., `run-abc123`) using fixed internal ports. No host port mapping is needed, so N parallel containers use identical internal ports (`:9222`, `:3100`, `:6080`) without conflict. The only externally exposed port is the orchestrator's API/proxy on host `:8080`. Human observers access noVNC streams through the reverse proxy at `/observe/:run_id`, which routes to the correct container's `:6080`.

### 2.2 Component Responsibilities

| Component | Responsibility | Lives In |
|---|---|---|
| API Gateway | REST endpoints for test CRUD, run triggers, result retrieval; WebSocket for live status and agent trace streaming | Orchestration layer |
| Reverse Proxy (Nginx) | Routes noVNC observer streams to the correct container by run ID (`/observe/:run_id → container:6080`). The only component exposed to external clients. | Orchestration layer |
| Test Run Manager | Accepts run requests, creates containers on `agentqa-net` with unique names, manages run lifecycle (queued → running → passed/failed/errored), enforces timeouts | Orchestration layer |
| Agent Loop Engine | The core reasoning loop — feeds goal + steps + page state to LLM, receives tool calls, dispatches them, tracks checkpoint completion, feeds results back | Orchestration layer |
| Tool Router | Inspects each tool call from the LLM; routes Playwright tools to the MCP server inside the container; executes custom tools as direct functions in the orchestrator | Orchestration layer |
| Assertion Engine | After the agent signals goal completion, evaluates each assertion from the test case (visual, content, state, network) and produces pass/fail verdicts | Orchestration layer |
| Trace Collector | Records every agent step as a structured trace entry (timestamp, action, reasoning, checkpoint, page state, tokens, latency) | Orchestration layer |
| Sandbox Container | Isolated execution environment with a headed browser, Playwright MCP, virtual display, and noVNC observer stream. Addressed by container name on Docker bridge network. | Container pool (agentqa-net) |

### 2.3 What Runs Where — The Hybrid Tool Architecture

This is the most important architectural decision. The agent's tool set is split across two execution contexts, but the LLM sees a single unified tool list.

**Inside the container (via Playwright MCP):**

All core browser interaction tools. These are mature, battle-tested, and handle cross-browser edge cases. The orchestrator connects to the Playwright MCP server at `http://container:3100/mcp`.

| Tool | Description |
|---|---|
| `browser_navigate` | Navigate to a URL, wait for load |
| `browser_click` | Click an element by accessibility ref |
| `browser_type` | Type text into an input element |
| `browser_snapshot` | Get the accessibility tree (structured DOM) |
| `browser_screenshot` | Capture a PNG screenshot |
| `browser_select_option` | Select from a dropdown |
| `browser_hover` | Hover over an element |
| `browser_scroll` | Scroll the page or a specific element |
| `browser_go_back` | Navigate back in history |
| `browser_go_forward` | Navigate forward in history |
| `browser_press_key` | Press a keyboard key |
| `browser_wait_for` | Wait for a specific text or selector to appear |
| `browser_tab_*` | Manage multiple tabs |
| `browser_file_upload` | Upload a file to a file input |

**In the orchestrator (custom tool functions):**

Testing-specific tools that don't exist in any generic browser automation framework. These are defined as plain LLM tool schemas and executed as direct functions in the orchestrator codebase. They connect to the browser via a separate CDP session (`ws://container:9222`).

| Tool | Description | Why Custom |
|---|---|---|
| `wait_for_stable` | Multi-signal page readiness detection (DOM mutation rate, network quiescence, visual stability, framework hooks) | Playwright MCP has basic `waitForSelector` but nothing that combines DOM/network/visual signals for SPA/streaming page support |
| `assert_visual_match` | Compare current screenshot against a baseline image with configurable tolerance and region masking | Core testing function — not a browser operation |
| `assert_text_present` | Verify specific text or regex pattern exists on the page | Semantic testing assertion, not raw DOM query |
| `assert_element_state` | Verify an element's state (visible, enabled, checked, value) | Higher-level than raw accessibility tree reading |
| `assert_network_request` | Verify a specific HTTP request was made with expected method, URL, status, and response shape | Requires network interception via CDP, not exposed by Playwright MCP |
| `get_network_log` | Retrieve all captured HTTP requests/responses since test start, with optional filtering | Requires persistent network buffer maintained via CDP |
| `get_console_errors` | Retrieve browser console errors and warnings | Requires persistent console buffer maintained via CDP |
| `check_accessibility` | Run an axe-core audit and return violations | Requires JS injection + axe-core library |
| `measure_performance` | Capture Core Web Vitals (LCP, CLS, FID/INP) and custom timing marks | Requires CDP Performance domain |
| `report_step_result` | Log an intermediate or final assertion result with evidence | Platform reporting function |

**How the merge works in code:**

```
Orchestrator starts a test run:
1. Connect to Playwright MCP → get Playwright tool schemas
2. Load custom tool schemas (defined in code)
3. Merge into one `tools` array
4. Pass to LLM API on every agent loop iteration

When the LLM returns a tool_use block:
  if tool.name starts with "browser_" → route to Playwright MCP client
  else → execute custom function directly in orchestrator
```

The LLM has no awareness of where tools execute. It sees one flat list: `browser_navigate`, `browser_click`, `wait_for_stable`, `assert_visual_match`, etc. It picks the tool it needs based on name and description.

---

## 3. Test Case Specification

### 3.1 Format

Test cases are authored in YAML (human-friendly, version-controlled in Git) and stored in the platform database as JSON. The API accepts both formats.

### 3.2 Schema

```yaml
# ═══════════════════════════════════════════════════
#  IDENTITY & METADATA
# ═══════════════════════════════════════════════════
id: "TC-0042"                              # unique identifier
name: "Guest checkout with coupon code"    # human-readable name
suite: "checkout"                          # grouping for filtering/reporting
priority: "P1"                             # P0 (blocker) | P1 (critical) | P2 (major) | P3 (minor)
tags: ["checkout", "coupons", "guest"]     # freeform tags for filtering runs
created_by: "jane@company.com"             # author
created_at: "2026-05-01T10:00:00Z"         # ISO 8601

# ═══════════════════════════════════════════════════
#  TARGET ENVIRONMENT
# ═══════════════════════════════════════════════════
target:
  url: "https://staging.example.com"       # starting URL
  browsers:                                # which engines to test against
    - "chromium"                           # always supported
    - "webkit"                             # Safari engine
    # - "firefox"                          # optional, Phase 2
  viewport:                                # optional, defaults below
    width: 1280
    height: 720
    device_scale_factor: 1
  locale: "en-US"                          # browser locale
  timezone: "America/Los_Angeles"          # browser timezone
  geolocation:                             # optional
    latitude: 34.0522
    longitude: -118.2437
  auth:                                    # optional pre-authentication
    method: "cookie_inject"                # cookie_inject | login_flow | token_header | none
    credentials_ref: "guest_user_01"       # pointer to secrets vault (never inline)
  extra_headers:                           # optional HTTP headers
    X-Test-Mode: "true"
  block_urls:                              # optional URL patterns to block (ads, analytics)
    - "*google-analytics.com*"
    - "*hotjar.com*"

# ═══════════════════════════════════════════════════
#  GOAL — What the agent must accomplish
# ═══════════════════════════════════════════════════
#
# The goal is the high-level intent — the "what",
# not the "how". The agent reads this for overall
# context and success criteria.
#
# If steps are provided below, the agent uses them as
# guided checkpoints. If no steps are provided, the
# agent plans its own action sequence from the goal alone.
#
goal: |
  Starting from the homepage, add any available product to the cart,
  apply coupon code "SAVE20", proceed through guest checkout using
  test payment details (card: 4242424242424242, exp: 12/28, CVC: 123),
  and complete the purchase to reach the order confirmation page.

# ═══════════════════════════════════════════════════
#  STEPS — Guided checkpoints (not rigid instructions)
# ═══════════════════════════════════════════════════
#
# Steps are a SUGGESTED sequence, not a script.
# Each step is a mini-goal the agent figures out HOW
# to accomplish on its own. If the UI changes and a
# step doesn't apply as written, the agent adapts.
#
# Think of these as waypoints on a hiking trail:
# the agent follows the general path but can detour
# around obstacles without failing the test.
#
# Mode controls how strictly the agent follows steps:
#   "guided"   — agent should generally follow this order,
#                 but can reorder or skip if the UI requires it.
#                 (default, recommended for most tests)
#   "strict"   — agent must complete steps in order.
#                 Failing a step fails the test immediately.
#                 (use for compliance/regulatory flows)
#   "unordered" — all steps must be completed, but in any order.
#                 (use for exploratory or setup-heavy tests)
#
steps:
  mode: "guided"                         # guided | strict | unordered
  checkpoints:
    - id: "S1"
      description: "Load the homepage"
      success_signal: "Homepage is visible with product listings or navigation"

    - id: "S2"
      description: "Search or find a product and add it to the cart"
      success_signal: "Cart indicator shows at least 1 item"

    - id: "S3"
      description: "Find the coupon entry field and apply coupon code SAVE20"
      success_signal: "Discount is reflected in the cart or order summary"

    - id: "S4"
      description: "Find and click the checkout button"
      success_signal: "Checkout page or flow is displayed"

    - id: "S5"
      description: "Proceed through guest checkout with test payment details"
      data:                              # structured data the agent needs for this step
        card_number: "4242424242424242"
        expiry: "12/28"
        cvc: "123"
      success_signal: "Payment form is submitted without errors"

    - id: "S6"
      description: "Complete the purchase"
      success_signal: "Order confirmation page is displayed"

    - id: "S7"
      description: "Verify the confirmation page shows an order ID"
      success_signal: "A visible order number or ID is present on the page"

# ═══════════════════════════════════════════════════
#  ASSERTIONS — How we verify the outcome
# ═══════════════════════════════════════════════════
#
# Assertions are evaluated AFTER the agent signals
# goal completion. They are separate from the goal
# because the agent's job is to reach the end state;
# the assertion engine's job is to evaluate it.
#
assertions:
  - id: "A1"
    type: "visual"
    description: "Order confirmation page matches baseline"
    params:
      reference_screenshot: "baselines/checkout_success.png"
      tolerance: 0.02               # 2% pixel diff threshold
      mask_selectors:                # ignore dynamic regions
        - "[data-testid='order-number']"
        - "[data-testid='order-date']"

  - id: "A2"
    type: "content"
    description: "Confirmation page displays an order number"
    params:
      check: "text_matches"
      pattern: "Order #[A-Z0-9]+"

  - id: "A3"
    type: "content"
    description: "Discount was applied correctly"
    params:
      check: "text_present"
      text: "SAVE20"

  - id: "A4"
    type: "state"
    description: "Cart is empty after checkout"
    params:
      navigation: "/cart"
      check: "element_text"
      selector: "[data-testid='cart-count']"
      expected: "0"

  - id: "A5"
    type: "network"
    description: "Order creation API returned 201"
    params:
      method: "POST"
      url_pattern: "/api/orders"
      expected_status: 201

  - id: "A6"
    type: "accessibility"
    description: "No critical a11y violations on confirmation page"
    params:
      severity: "critical"           # critical | serious | moderate | minor
      max_violations: 0

  - id: "A7"
    type: "performance"
    description: "Confirmation page loads within 3s LCP"
    params:
      metric: "LCP"
      threshold_ms: 3000

  - id: "A8"
    type: "console"
    description: "No JS errors during entire flow"
    params:
      level: "error"
      max_count: 0
      ignore_patterns:
        - "favicon.ico"
        - "third-party-analytics"

# ═══════════════════════════════════════════════════
#  CONSTRAINTS — Guardrails for agent behavior
# ═══════════════════════════════════════════════════
constraints:
  max_steps: 40                      # hard cap on total agent actions
  timeout_seconds: 180               # wall-clock timeout for entire run
  max_retries_per_action: 2          # retry a failed action N times
  navigation_policy: "interact_only" # interact_only | explicit_urls_allowed
                                     # interact_only (default): agent must navigate
                                     #   exclusively by clicking links, buttons, and
                                     #   UI elements. Direct URL entry in the address
                                     #   bar is forbidden — the agent should discover
                                     #   paths through the UI, just like a real user.
                                     # explicit_urls_allowed: agent may use
                                     #   browser_navigate to go directly to URLs
                                     #   listed in steps[].data.url or goal text.
  forbidden_actions:                 # things the agent must NEVER do
    - "directly type or modify the URL in the address bar unless navigation_policy is explicit_urls_allowed"
    - "navigate to any external domain"
    - "close the browser or open new tabs"
    - "submit any form without filling required fields"
  required_behaviors:                # things the agent MUST do
    - "use the coupon code field, do not skip it"

# ═══════════════════════════════════════════════════
#  CONTEXT — Help the agent reason more efficiently
# ═══════════════════════════════════════════════════
context:
  app_description: |
    E-commerce storefront built with Next.js. Server-side rendered
    with client-side hydration. Product listings lazy-load on scroll.
  hints:                             # optional nudges (not prescriptive steps)
    - "The coupon field is on the cart page, not the checkout page"
    - "Guest checkout is under a 'Continue as Guest' link below the login form"
    - "Test credit card will be auto-accepted in staging"
  known_issues:                      # things to ignore, not flag as failures
    - "Staging sometimes shows a stale cache banner — ignore it"
    - "The favicon returns a 404 in staging — not a bug"
  page_type: "spa"                   # static | ssr | spa | streaming (informs readiness strategy)

# ═══════════════════════════════════════════════════
#  REPORTING — What happens on failure
# ═══════════════════════════════════════════════════
on_failure:
  capture:
    screenshot: true
    dom_snapshot: true
    network_log: true
    console_log: true
    agent_trace: true                # full reasoning chain
    video: false                     # optional screen recording (expensive)
  notify:
    channels: ["#qa-alerts"]         # Slack channels
    email: ["qa-lead@company.com"]
    webhook: "https://hooks.example.com/test-failures"
```

### 3.3 Assertion Types Reference

| Type | What It Checks | Evaluated By |
|---|---|---|
| `visual` | Pixel-level comparison of current screenshot against a stored baseline. Supports tolerance thresholds and region masking for dynamic content. | `assert_visual_match` custom tool + pixelmatch library |
| `content` | Text presence, regex pattern matching, or exact text comparison on the current page. | `assert_text_present` custom tool reading from accessibility tree |
| `state` | Element state verification — value, visibility, enabled/disabled, checked/unchecked. Can optionally navigate to a different page before checking. | `assert_element_state` custom tool |
| `network` | Verify specific HTTP requests were made with expected method, URL, status code, and optionally response body shape. | `assert_network_request` custom tool reading from captured network buffer |
| `accessibility` | Run axe-core audit and assert violation counts by severity level. | `check_accessibility` custom tool injecting axe-core via CDP |
| `performance` | Assert Core Web Vitals (LCP, CLS, INP) or custom timing marks are within thresholds. | `measure_performance` custom tool using CDP Performance domain |
| `console` | Assert browser console error/warning counts with optional ignore patterns for known noise. | `get_console_errors` custom tool reading from console buffer |

---

## 4. Sandbox Container Specification

### 4.1 Container Image

**Base image:** `mcr.microsoft.com/playwright:v1.59.1-noble` (Ubuntu 24.04 LTS with Playwright browsers pre-installed)

**Additional packages layered on top:**

| Package | Purpose |
|---|---|
| `xvfb` | Virtual framebuffer for headed browser rendering |
| `x11vnc` | VNC server attached to the virtual display |
| `noVNC` | Web-based VNC client for browser-based observer access |
| `Node.js 22 LTS` | Runtime for Playwright MCP server |
| `@playwright/mcp` | Playwright MCP server package |
| `axe-core` | Accessibility audit engine (injected via CDP) |
| `pixelmatch` | Pixel-level image comparison for visual assertions |

### 4.2 Dockerfile

```dockerfile
FROM mcr.microsoft.com/playwright:v1.59.1-noble

# System packages for display and VNC
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

# noVNC for web-based observer access
RUN git clone --depth 1 https://github.com/novnc/noVNC.git /opt/noVNC \
    && git clone --depth 1 https://github.com/novnc/websockify.git /opt/noVNC/utils/websockify

# Playwright MCP server
RUN npm install -g @playwright/mcp@latest

# Evidence directory (ephemeral, per-run)
RUN mkdir -p /tmp/test-evidence

# Expose ports (internal to Docker network only — no host mapping needed)
# Parallel containers reuse the same ports without conflict because each
# container has its own network namespace on the agentqa-net bridge.
EXPOSE 9222  # CDP (browser control) — orchestrator connects via container name
EXPOSE 3100  # Playwright MCP (Streamable HTTP) — orchestrator connects via container name
EXPOSE 6080  # noVNC (observer stream) — reverse proxy routes by run ID

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### 4.3 Container Entrypoint

```bash
#!/bin/bash
set -e

# ── Configuration (from environment variables) ────
DISPLAY_NUM=${DISPLAY_NUM:-99}
SCREEN_WIDTH=${SCREEN_WIDTH:-1280}
SCREEN_HEIGHT=${SCREEN_HEIGHT:-720}
SCREEN_DEPTH=${SCREEN_DEPTH:-24}
VNC_PORT=${VNC_PORT:-5900}
NOVNC_PORT=${NOVNC_PORT:-6080}
CDP_PORT=${CDP_PORT:-9222}
MCP_PORT=${MCP_PORT:-3100}
BROWSER_ENGINE=${BROWSER_ENGINE:-chromium}
NOVNC_TOKEN=${NOVNC_TOKEN:-$(openssl rand -hex 16)}

export DISPLAY=:${DISPLAY_NUM}

# ── 1. Start virtual display ──────────────────────
Xvfb :${DISPLAY_NUM} -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} \
  -ac +extension GLX +render -noreset &
sleep 1

# ── 2. Start minimal window manager ──────────────
fluxbox -display :${DISPLAY_NUM} &
sleep 0.5

# ── 3. Start VNC server ──────────────────────────
x11vnc -display :${DISPLAY_NUM} \
  -forever \
  -shared \
  -rfbport ${VNC_PORT} \
  -passwd "${NOVNC_TOKEN}" \
  -noxdamage \
  -noxfixes &
sleep 0.5

# ── 4. Start noVNC web proxy ─────────────────────
/opt/noVNC/utils/novnc_proxy \
  --vnc localhost:${VNC_PORT} \
  --listen ${NOVNC_PORT} &

# ── 5. Start Playwright MCP server ───────────────
npx @playwright/mcp@latest \
  --browser ${BROWSER_ENGINE} \
  --port ${MCP_PORT} \
  --headed \
  --no-sandbox &

# ── 6. Wait for all services to be ready ─────────
echo "Waiting for services..."
timeout 30 bash -c 'until curl -sf http://localhost:'${MCP_PORT}'/mcp; do sleep 0.5; done'

# ── 7. Signal readiness ──────────────────────────
CONTAINER_HOST=$(hostname)
echo "SANDBOX_READY"
echo "{\"container_host\": \"${CONTAINER_HOST}\", \"novnc_port\": ${NOVNC_PORT}, \"novnc_token\": \"${NOVNC_TOKEN}\", \"mcp_url\": \"http://${CONTAINER_HOST}:${MCP_PORT}/mcp\", \"cdp_url\": \"ws://${CONTAINER_HOST}:${CDP_PORT}\"}" > /tmp/sandbox-info.json

# Keep container alive
wait -n
```

### 4.4 Container Networking

**Problem:** N parallel test runs use N containers. If each maps internal ports to host ports (`-p 9222:9222`), the second container fails on port conflict.

**Solution:** Docker bridge network with container DNS. No host port mapping at all.

```bash
# Create the network (once, at platform startup)
docker network create agentqa-net

# Each container gets a unique name derived from the run ID
docker run \
  --name run-abc123 \
  --network agentqa-net \
  --security-opt=no-new-privileges \
  --shm-size=2g \
  -e BROWSER_ENGINE=chromium \
  -e SCREEN_WIDTH=1280 \
  -e SCREEN_HEIGHT=720 \
  agentqa-sandbox:latest

# Orchestrator (also on agentqa-net) connects by container name:
#   MCP:   http://run-abc123:3100/mcp
#   CDP:   ws://run-abc123:9222
#   noVNC: http://run-abc123:6080
```

Every container uses identical internal ports (`:9222`, `:3100`, `:6080`). No conflicts because Docker gives each container its own network namespace. The orchestrator addresses each container by its unique run-ID hostname on the shared bridge network.

**noVNC for human observers:** The noVNC stream must be reachable by a human browser outside the Docker network. A reverse proxy (Nginx/Caddy) running inside the orchestrator routes by path:

```nginx
# Nginx config — dynamically updated as containers start/stop
location ~ ^/observe/(?<run_id>[a-z0-9-]+)/ {
    proxy_pass         http://$run_id:6080/;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_read_timeout 86400;        # keep WebSocket alive for long runs
}
```

Result: one host port (`:8080`) serves the API, WebSocket, and all noVNC streams for unlimited parallel containers. Observer URL format: `https://agentqa.example.com/observe/run-abc123/vnc.html?password=<token>&autoconnect=true`.

### 4.5 Container Lifecycle

```
1. PROVISION   — Orchestrator creates container on agentqa-net with name "run-{run_id}"
2. BOOT        — Entrypoint starts Xvfb → VNC → noVNC → Playwright MCP
3. READY       — Container writes sandbox-info.json with hostname and ports
                  Orchestrator reads it and registers noVNC route in reverse proxy
4. CONNECT     — Orchestrator connects MCP client to http://run-{id}:3100/mcp
                  Orchestrator opens CDP session to ws://run-{id}:9222
5. EXECUTE     — Agent loop runs: orchestrator sends tool calls to container
6. TEARDOWN    — Orchestrator pulls evidence from /tmp/test-evidence/
                  Removes noVNC proxy route
                  Destroys container (docker rm -f run-{id})
```

Container lifetime: one test run. Fresh container per run ensures deterministic environments, zero cross-contamination. Pre-warmed container pool (2-5 idle containers on the network) eliminates cold-start latency for back-to-back runs.

---

## 5. Agent Loop Engine

### 5.1 Core Loop (implemented as LangGraph StateGraph)

The following pseudocode describes the agent loop logic. In implementation, each phase (OBSERVE, REASON, ACT, CHECK) is a LangGraph node, connected by conditional edges. LangGraph's checkpointer persists state after every superstep, enabling crash recovery without re-executing completed nodes. See Section 7.3 for the full graph definition and Section 7.5 for error recovery patterns.

```
INITIALIZE:
  Load test case
  Connect to Playwright MCP (container) via http://run-{id}:3100/mcp
  Open CDP session (container) via ws://run-{id}:9222 for custom tool monitoring
  Start network interception buffer
  Start console message buffer
  Build merged tool list (Playwright + custom)
  Construct system prompt with goal, steps, constraints, context
  Initialize step tracker (if steps provided)
  Initialize trace accumulator:
    run_start_time = now()
    step_count = 0
    token_accumulator = { input: 0, output: 0, cache_read: 0, cache_create: 0, reasoning: 0 }
    cost_accumulator = 0.0
    tool_call_counter = { mcp: 0, custom: 0, by_name: {} }
    latency_buckets = []

LOOP (max iterations = constraints.max_steps):
  step_count++
  step_start = now()

  1. OBSERVE
     stable_start = now()
     Call wait_for_stable (automatic, injected between every action)
     wait_stable_ms = now() - stable_start

     Call browser_snapshot to get current accessibility tree
     Optionally call browser_screenshot for visual context

  2. REASON
     llm_start = now()
     Send to LLM (with streaming enabled):
       - System prompt (role, rules, constraints, steps)
       - Goal from test case
       - Current step context (which checkpoint is active, which are complete)
       - Current page snapshot (accessibility tree)
       - Conversation history (prior actions + results)
       - Available tools
     Record time_to_first_token_ms = first_chunk_time - llm_start
     LLM returns response with usage metadata
     llm_latency_ms = now() - llm_start

     Extract from Anthropic API response:
       usage.input_tokens
       usage.output_tokens
       usage.cache_read_input_tokens
       usage.cache_creation_input_tokens
       response headers: x-request-id → llm_request_id
       stop_reason ("tool_use" | "end_turn" | "max_tokens")
       thinking blocks → reasoning text
       text blocks → agent_output_text

  3. ACT
     If response contains tool_use block:
       tool_start = now()
       Route tool call:
         browser_* tools → Playwright MCP server (tool_source = "mcp")
         custom tools    → execute directly in orchestrator (tool_source = "custom")
       tool_latency_ms = now() - tool_start
       Record tool success/failure and any retries

     Update accumulators:
       token_accumulator.input += usage.input_tokens
       token_accumulator.output += usage.output_tokens
       cost_accumulator += compute_step_cost(model, usage)
       tool_call_counter.by_name[tool_name]++
       latency_buckets.push(step_latency)

     Record trace entry:
       {
         step_number, checkpoint_id, checkpoint_completed,
         timestamp: step_start, completed_at: now(),
         llm_request_id, model,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         reasoning_tokens, total_tokens,
         llm_latency_ms, llm_time_to_first_token_ms,
         tool_execution_latency_ms, wait_for_stable_ms,
         total_step_latency_ms: now() - step_start,
         tool_name, tool_source, tool_input, tool_output,
         tool_success, tool_error, tool_retries,
         reasoning, agent_output_text, stop_reason,
         page_url, page_title, screenshot_ref,
         estimated_cost_usd
       }

     Stream trace entry to WebSocket subscribers in real-time

  4. CHECK
     If LLM signals step completion ("[S3 complete]"):
       Mark step as complete in tracker
       Log step completion in trace
     If LLM signals goal completion → exit loop, run assertions
     If timeout exceeded → exit loop with TIMEOUT status
     If max_steps exceeded → exit loop with MAX_STEPS status
     If unrecoverable error → exit loop with ERROR status
     If mode is "strict" and current step failed → exit loop with STEP_FAILED status
     Otherwise → continue to next OBSERVE

FINALIZE:
  Run assertion engine against final state
  Collect all evidence (screenshots, traces, network log, console log)
  Compute step completion summary (7/7 complete, or 5/7 with S3, S6 incomplete)

  Compute run_traces_summary from accumulated data:
    - Aggregate all token counts
    - Compute latency percentiles (p50, p95, p99) from latency_buckets
    - Calculate time-in-llm vs time-in-tools vs time-in-waiting percentages
    - Identify slowest step
    - Compute context growth rate from input_tokens progression
    - Build tool_calls_by_name frequency map
    - Sum total estimated cost

  Write run_traces_summary to database
  Update test_runs with final metrics (total_tokens, total_llm_calls, estimated_cost_usd)

  Produce test result: PASSED | FAILED | ERRORED | TIMED_OUT
  Notify if failure (include cost and token summary in notification)
```

### 5.2 System Prompt Template for the Agent

```
You are a QA testing agent. Your job is to interact with a web application
to achieve a specific test goal. You can see the page through accessibility
tree snapshots and screenshots.

## Your Goal
{test_case.goal}

## Guided Steps
{if test_case.steps}
Follow these checkpoints as a general guide. Each step tells you WHAT
to accomplish, not HOW — figure out the specific clicks and interactions
yourself based on what you see on the page.

Mode: {test_case.steps.mode}
- "guided": Follow the general order, but adapt if the UI requires it.
  If a step doesn't match what you see, reason about why and proceed.
- "strict": Complete steps in exact order. Signal GOAL_BLOCKED if stuck.
- "unordered": Complete all steps, but in whatever order makes sense.

{for step in test_case.steps.checkpoints}
  [{step.id}] {step.description}
  → Success signal: {step.success_signal}
  {if step.data} → Data: {step.data} {endif}
{endfor}

After completing each step, briefly note which step you just finished
(e.g., "[S1 complete]") so the trace is easy to follow.
{else}
No steps provided. Plan your own approach based on the goal.
{endif}

## Application Context
{test_case.context.app_description}

## Hints
{test_case.context.hints}

## Rules
- You MUST achieve the goal using the available tools.
- NAVIGATION POLICY: {test_case.constraints.navigation_policy}
  If "interact_only": You MUST NOT type URLs directly into the browser.
  Navigate ONLY by clicking links, buttons, and UI elements — discover
  paths through the interface, just like a real user would. The only
  exception is the initial URL from the test case target, which the
  platform loads for you.
  If "explicit_urls_allowed": You may use browser_navigate for URLs
  explicitly provided in step data or the goal text. Do not invent URLs.
- You MUST NOT: {test_case.constraints.forbidden_actions}
- You MUST: {test_case.constraints.required_behaviors}
- Work efficiently. You have a maximum of {test_case.constraints.max_steps} actions.
- After each action, you will receive an updated page snapshot.
- When you believe the goal is fully achieved, respond with:
  "<GOAL_COMPLETE>" and a brief summary of what you accomplished.
- If you encounter an obstacle you cannot overcome, respond with:
  "<GOAL_BLOCKED>" and explain what went wrong.

## Page Type
This application is a {test_case.context.page_type} application.
The wait_for_stable tool is called automatically between your actions.
You do not need to manually wait for the page to load.

## Available Tools
You have browser interaction tools (browser_navigate, browser_click, etc.)
and testing tools (assert_visual_match, get_network_log, etc.).
Use testing tools to gather evidence when needed, but focus on reaching
the goal state. Assertions are evaluated separately after you finish.
```

### 5.3 Model Selection Strategy

| Scenario | Recommended Model | Rationale |
|---|---|---|
| Standard test runs (P1-P3) | Claude Sonnet 4 | Best cost/performance ratio for tool-use-heavy workloads. ~$0.02-0.10/test run. |
| Complex or critical runs (P0) | Claude Opus 4 | Superior reasoning for multi-step flows with ambiguous UI. ~$0.10-0.50/test run. |
| High-volume regression suites | Claude Haiku 4.5 | Fastest and cheapest for simple, well-defined flows. ~$0.005-0.02/test run. |

The agent loop should be model-agnostic. The `model` field can be set per test case or per suite.

---

## 6. Page Readiness System

### 6.1 The Problem

Different website architectures signal "ready" differently. If the agent reads the page too early, it sees incomplete content and makes bad decisions. The readiness system must handle: static sites, server-rendered apps (Rails, Django, Next.js SSR), client-side SPAs (React, Vue, Angular), lazy-loading content (infinite scroll, tab-fetched data), and real-time streaming pages (websocket dashboards, chat interfaces).

### 6.2 The `wait_for_stable` Tool

This custom tool is called automatically between every agent action and the next observation. It uses a multi-signal approach.

**Signals checked (in parallel):**

| Signal | Method | "Stable" Threshold | Purpose |
|---|---|---|---|
| DOM mutation rate | MutationObserver via CDP `Runtime.evaluate` | < 3 mutations/sec over 500ms window | Catches SPA rendering, dynamic content insertion |
| Network quiescence | CDP `Network.requestWillBeSent` / `Network.loadingFinished` tracking | 0 pending XHR/fetch for 300ms (websockets/SSE whitelisted) | Catches async data fetching |
| Visual stability | Two screenshots 500ms apart, pixel-diffed | < 0.5% changed pixels | Catches CSS animations, skeleton loaders, shimmer effects |
| Framework hooks (optional) | Probe `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`, `window.ng`, `window.__VUE__` | Framework-specific idle check | Catches hydration, pending Suspense boundaries, Zone.js microtasks |

**Returns to agent loop:**

```json
{
  "stable": true,
  "wait_duration_ms": 1200,
  "signals": {
    "dom_mutations_per_sec": 1.2,
    "pending_network_requests": 0,
    "visual_diff_percent": 0.1,
    "framework_detected": "react",
    "framework_idle": true
  }
}
```

### 6.3 Page Type Overrides

The `page_type` field in the test case context tunes the readiness strategy:

| Page Type | Behavior |
|---|---|
| `static` | Simple `load` event + 200ms settle time. Skip visual stability check. |
| `ssr` | `networkidle` + DOM stability. Skip framework hooks. |
| `spa` | Full multi-signal check. Framework hooks enabled. Higher DOM mutation tolerance during initial load. |
| `streaming` | DOM stability check with higher tolerance (< 10 mutations/sec). Visual stability uses masked regions for known-dynamic areas. Network quiescence skipped (websockets never go idle). |

---

## 7. Orchestrator Implementation

### 7.1 Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Orchestrator runtime | Node.js 22 LTS (TypeScript) | Same ecosystem as Playwright MCP; native CDP and MCP SDK support |
| **Agent orchestration** | **`@langchain/langgraph`** | **State-graph-based agent loop with checkpointing, fault recovery, conditional edges, and built-in retry policies. Models the observe → reason → act cycle as a durable state machine rather than a fragile while-loop.** |
| **LLM integration** | **`@langchain/anthropic`** | **LangChain's Anthropic integration provides tool-calling, streaming, and token usage extraction compatible with LangGraph nodes.** |
| **Observability** | **LangSmith (optional)** | **Trace visualization, step-level debugging, token accounting, and latency analysis. Pairs natively with LangGraph — every node execution is auto-traced. Can be replaced with OpenTelemetry if self-hosted observability is preferred.** |
| API framework | Fastify | Lightweight, fast, WebSocket support out of the box |
| Database | PostgreSQL 16 with JSONB | Test cases, run history, and results. JSONB for flexible schema evolution. |
| Object storage | S3-compatible (MinIO for self-hosted, AWS S3 for cloud) | Screenshots, baselines, traces, evidence artifacts |
| Queue | BullMQ (Redis-backed) | Test run job queue with priority, retry, and rate limiting |
| Container orchestration | Docker Engine API (Phase 1), Kubernetes (Phase 2) | Container lifecycle management |
| Reverse proxy | Nginx (with dynamic upstream via lua or conf reload) | Routes noVNC streams to containers by run ID; single external port |
| Real-time | WebSocket (via Fastify) | Live run status, agent trace streaming |
| MCP client | `@modelcontextprotocol/sdk` | Communication with Playwright MCP server in containers |
| Checkpointer | `@langchain/langgraph-checkpoint-postgres` | Durable state persistence for the agent graph — enables crash recovery, time-travel debugging, and resumability |
| Image diffing | `pixelmatch` + `pngjs` | Visual assertion engine |
| Accessibility | `axe-core` (injected via CDP) | Accessibility assertions |

### 7.2 Why LangGraph

The agent loop is a long-running, stateful workflow with cycles, conditional branches, and failure-prone external dependencies (LLM API, browser CDP, MCP server). A raw `while` loop with try/catch blocks handles the happy path but degrades quickly under real-world conditions: LLM API rate limits, container network blips, browser crashes, and mid-run timeouts.

LangGraph models the agent loop as an explicit state graph where each phase (observe, reason, act, check) is a node with typed inputs and outputs, connected by conditional edges. This gives us:

- **Checkpointing at every superstep** — if the LLM call succeeds but the tool execution crashes, LangGraph has already persisted the LLM's output. On resume, it skips the LLM call and retries only the tool execution. No wasted tokens.
- **Retry policies as first-class config** — node-level retries with exponential backoff, configurable per node. The `reason` node gets 3 retries with backoff (LLM API flakiness). The `act` node gets 2 retries (tool execution flakiness). The `observe` node gets 5 retries (page readiness can be flaky on slow apps).
- **Conditional edges for error routing** — instead of a single catch-all error handler, different failure types route to different recovery nodes. An LLM timeout routes to a retry-with-simpler-prompt node. A tool error routes to a log-and-skip node. A browser crash routes to a container-restart node.
- **Time-travel debugging** — every state transition is persisted. When a test fails, engineers can inspect the exact state at any step, modify it, and re-run from that point. This is transformative for debugging agent reasoning failures.
- **Streaming built-in** — LangGraph streams state updates as they happen, which feeds directly into the WebSocket events for live dashboard updates.

### 7.3 Agent State Graph Design

The agent loop is a LangGraph `StateGraph` with the following structure:

```
                    ┌──────────────┐
                    │    START     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   OBSERVE    │ ← wait_for_stable + browser_snapshot
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    REASON    │ ← LLM API call with tools
                    └──────┬───────┘
                           │
                  ┌────────┴────────┐
          tool_use?│                │end_turn?
                  ▼                 ▼
          ┌──────────────┐  ┌──────────────┐
          │     ACT      │  │  GOAL_CHECK  │
          │  (tool exec) │  │  (complete?) │
          └──────┬───────┘  └──────┬───────┘
                 │                  │
          ┌──────┴──────┐   ┌──────┴──────┐
          │success? fail?│  │complete? blocked?│
          ▼              ▼   ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐
    │ OBSERVE  │  │ERROR_    │  │FINALIZE│  │FINALIZE  │
    │ (loop)   │  │HANDLER   │  │(pass)  │  │(blocked) │
    └──────────┘  └────┬─────┘  └────────┘  └──────────┘
                       │
               ┌───────┴───────┐
               │recoverable?   │fatal?
               ▼               ▼
         ┌──────────┐   ┌──────────┐
         │  OBSERVE  │  │ FINALIZE │
         │  (retry)  │  │ (error)  │
         └──────────┘   └──────────┘
```

**State definition:**

```typescript
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

const AgentState = Annotation.Root({
  // ── Test case context (set once at START) ──
  testCase: Annotation<TestCase>,
  runId: Annotation<string>,
  containerHost: Annotation<string>,

  // ── Conversation history (accumulates) ──
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer }),

  // ── Current step tracking ──
  stepNumber: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  currentCheckpoint: Annotation<string | null>,
  completedCheckpoints: Annotation<string[]>({
    reducer: (prev, next) => [...new Set([...prev, ...next])],
    default: () => [],
  }),

  // ── Page state ──
  currentUrl: Annotation<string>,
  pageTitle: Annotation<string>,
  pageSnapshot: Annotation<string>,       // accessibility tree text
  screenshotRef: Annotation<string>,

  // ── Tool execution ──
  lastToolName: Annotation<string | null>,
  lastToolResult: Annotation<any>,
  lastToolSuccess: Annotation<boolean>,

  // ── Error tracking ──
  consecutiveErrors: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  lastError: Annotation<ErrorInfo | null>,
  errorHistory: Annotation<ErrorInfo[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // ── Per-step trace (written to DB after each superstep) ──
  currentTrace: Annotation<StepTrace>,

  // ── Termination ──
  status: Annotation<"running" | "passed" | "failed" | "errored" | "timed_out" | "blocked">,
  goalComplete: Annotation<boolean>({ default: () => false }),
  terminationReason: Annotation<string | null>,
});
```

**Graph construction:**

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = PostgresSaver.fromConnString(DATABASE_URL);

const graph = new StateGraph(AgentState)
  // ── Nodes ──
  .addNode("observe",       observeNode,      { retry: { maxAttempts: 5, delayMs: 1000 } })
  .addNode("reason",        reasonNode,       { retry: { maxAttempts: 3, delayMs: 2000, backoffFactor: 2 } })
  .addNode("act",           actNode,          { retry: { maxAttempts: 2, delayMs: 500 } })
  .addNode("goal_check",    goalCheckNode)
  .addNode("error_handler", errorHandlerNode)
  .addNode("finalize",      finalizeNode)
  .addNode("guard_rails",   guardRailsNode)   // validates agent actions before execution

  // ── Edges ──
  .addEdge("__start__", "observe")

  // observe → reason (always)
  .addEdge("observe", "reason")

  // reason → conditional routing
  .addConditionalEdges("reason", routeAfterReason, {
    "act":         "guard_rails",   // tool call → validate first
    "goal_check":  "goal_check",    // agent says done
    "error":       "error_handler", // LLM error
  })

  // guard_rails → conditional routing
  .addConditionalEdges("guard_rails", routeAfterGuardRails, {
    "act":         "act",           // action allowed
    "observe":     "observe",       // action blocked (e.g., URL modification), skip and re-observe
    "error":       "error_handler", // guard rail violation
  })

  // act → conditional routing
  .addConditionalEdges("act", routeAfterAct, {
    "observe":     "observe",       // success → next iteration
    "error":       "error_handler", // tool execution failed
  })

  // goal_check → conditional routing
  .addConditionalEdges("goal_check", routeAfterGoalCheck, {
    "finalize":    "finalize",      // goal achieved or blocked
    "observe":     "observe",       // not done yet, keep going
  })

  // error_handler → conditional routing
  .addConditionalEdges("error_handler", routeAfterError, {
    "observe":     "observe",       // recoverable → retry
    "finalize":    "finalize",      // fatal → end
  })

  // finalize → END
  .addEdge("finalize", "__end__")

  .compile({ checkpointer });
```

### 7.4 Node Implementations

**observe** — captures current page state:
- Calls `wait_for_stable` to ensure page readiness
- Takes a `browser_snapshot` (accessibility tree) via Playwright MCP
- Takes a screenshot and stores to S3
- Updates `pageSnapshot`, `currentUrl`, `pageTitle`, `screenshotRef` in state
- Increments `stepNumber`
- Checks constraints: if `stepNumber > max_steps` → sets `status: "timed_out"`
- Checks wall-clock: if elapsed > `timeout_seconds` → sets `status: "timed_out"`

**reason** — calls the LLM:
- Constructs messages array from state (system prompt + conversation history + current snapshot)
- Calls `ChatAnthropic.invoke()` with merged tool definitions
- Extracts usage metadata (tokens, cache stats, request ID)
- Records `currentTrace` with all timing and token data
- Returns the LLM response content blocks

**guard_rails** — validates agent actions before execution:
- Checks `navigation_policy`: if `"interact_only"` and the agent called `browser_navigate` with a URL not in the original `target.url`, blocks the action and injects a correction message into the conversation ("You cannot navigate directly to URLs. Use the UI to find your way there.")
- Checks `forbidden_actions`: matches against the action being taken
- If blocked: returns to `observe` with a correction message, no tool execution
- If allowed: forwards to `act`

**act** — executes the tool call:
- Routes to Playwright MCP or custom function based on tool name
- Captures tool execution latency, success/failure, retries
- On success: resets `consecutiveErrors` to 0
- On failure: increments `consecutiveErrors`, captures error details

**goal_check** — evaluates goal completion signals:
- Parses agent text for `<GOAL_COMPLETE>` or `<GOAL_BLOCKED>` markers
- Checks if all required steps are complete (for strict mode)
- Routes to `finalize` if goal is done or blocked, otherwise back to `observe`

**error_handler** — classifies and routes errors:
- Classifies error type: `llm_timeout`, `llm_rate_limit`, `tool_error`, `browser_crash`, `mcp_disconnect`, `constraint_violation`
- For `llm_rate_limit`: waits with exponential backoff, routes back to `observe`
- For `tool_error`: if `consecutiveErrors < 3`, routes back to `observe` with the error context injected into the message history so the agent can adapt. If ≥ 3, routes to `finalize` with `status: "errored"`
- For `browser_crash` or `mcp_disconnect`: attempts container health check and MCP reconnection. If recovery succeeds, routes back to `observe`. If not, routes to `finalize` with `status: "errored"`
- Every error is appended to `errorHistory` for the trace

**finalize** — wraps up the run:
- Runs assertion engine against final page state
- Collects all evidence (screenshots, DOM snapshots, network logs, console logs)
- Computes `run_traces_summary` from accumulated trace data
- Writes results to database
- Sends notifications on failure

### 7.5 Error Recovery and Resilience Patterns

Testing is a long-running task with multiple failure modes. The system is designed to survive failures gracefully rather than crash on the first error.

**Failure taxonomy and recovery strategy:**

| Failure Type | Example | Recovery | Max Retries | Visibility |
|---|---|---|---|---|
| LLM API transient | 429 rate limit, 500 server error, network timeout | Exponential backoff (2s, 4s, 8s), then retry the `reason` node | 3 | Trace shows `tool_retries` count and backoff durations |
| LLM API persistent | 401 auth error, model deprecated | Fatal — route to `finalize` with `status: "errored"` | 0 | Trace shows error class and message |
| Tool execution failure | Playwright element not found, click intercepted, stale reference | Inject error into conversation history so agent can adapt ("The click on 'Submit' failed because the element was obscured by a modal. Try dismissing the modal first.") | 3 per tool, 5 consecutive | Trace shows `tool_error`, `tool_retries`, and agent's adapted reasoning |
| Page readiness timeout | `wait_for_stable` exceeds 10s | Proceed with stale snapshot + inject warning ("Page may still be loading — proceed with caution") | 5 | Trace shows `wait_for_stable_ms` spike and warning flag |
| Browser crash | Chrome OOM, GPU process died, segfault | Detect via CDP disconnect. Restart browser inside container (Playwright MCP can relaunch). Re-navigate to last known URL. Resume from last checkpoint. | 1 | Trace shows `browser_crash` error with recovery status |
| MCP server disconnect | Playwright MCP process died, container network blip | Reconnect MCP client with 3 retries. If Playwright MCP is dead, restart it inside the container via a health-check sidecar. | 3 | Trace shows `mcp_disconnect` with reconnection attempts |
| Container died | OOM-killed, Docker engine issue | Fatal for this run. Orchestrator detects container exit, marks run as `errored`, saves whatever trace data was accumulated. | 0 | Run status shows `errored` with `terminationReason: "container_exited"` |
| Agent stuck in loop | Agent repeats the same action 5+ times without progress | Detect via action repetition counter. Inject a meta-prompt: "You've attempted this action 5 times without progress. Try a different approach." After 3 meta-prompts, route to `finalize` with `status: "blocked"`. | 3 meta-prompts | Trace shows repetition detection and meta-prompt injections |
| Context window overflow | Input tokens approaching model limit | Trigger auto-compaction: summarize conversation history older than the last 5 steps. Log the compaction event. | Automatic | Trace shows `context_compacted: true` with before/after token counts |

**Checkpoint-based recovery in practice:**

```
Step 12: OBSERVE succeeds ← checkpoint saved
Step 12: REASON succeeds (LLM returns browser_click) ← checkpoint saved
Step 12: ACT fails (element not interactable) ← pending writes stored

On resume:
  LangGraph loads checkpoint from after REASON
  Skips OBSERVE and REASON (already completed and saved)
  Retries ACT only
  If ACT fails again → routes to error_handler
  error_handler injects error context into messages
  Routes back to OBSERVE for step 13
  Agent sees the error and adapts its approach
```

This means no wasted LLM tokens on retry — the most expensive operation (REASON) is not re-executed if it already succeeded.

### 7.6 Custom Tool Implementations

Each custom tool is a TypeScript function in the orchestrator. They share a CDP session to the sandbox browser.

```
orchestrator/
├── src/
│   ├── agent/
│   │   ├── graph.ts               # LangGraph StateGraph definition and compilation
│   │   ├── state.ts               # AgentState annotation and types
│   │   ├── nodes/
│   │   │   ├── observe.ts         # Page state capture node
│   │   │   ├── reason.ts          # LLM API call node
│   │   │   ├── act.ts             # Tool execution node
│   │   │   ├── guard-rails.ts     # Action validation (URL policy, forbidden actions)
│   │   │   ├── goal-check.ts      # Goal completion detection
│   │   │   ├── error-handler.ts   # Error classification and recovery routing
│   │   │   └── finalize.ts        # Evidence collection, assertion evaluation, summary
│   │   ├── edges/
│   │   │   ├── route-after-reason.ts
│   │   │   ├── route-after-act.ts
│   │   │   ├── route-after-error.ts
│   │   │   └── route-after-goal-check.ts
│   │   ├── prompt-builder.ts      # Constructs system prompt from test case
│   │   └── context-compactor.ts   # Summarizes conversation history to manage context growth
│   ├── tools/
│   │   ├── custom/
│   │   │   ├── wait-for-stable.ts
│   │   │   ├── assert-visual-match.ts
│   │   │   ├── assert-text-present.ts
│   │   │   ├── assert-element-state.ts
│   │   │   ├── assert-network-request.ts
│   │   │   ├── get-network-log.ts
│   │   │   ├── get-console-errors.ts
│   │   │   ├── check-accessibility.ts
│   │   │   ├── measure-performance.ts
│   │   │   └── report-step-result.ts
│   │   ├── definitions.ts         # Tool schemas for LLM (merged with MCP tools)
│   │   ├── tool-router.ts         # Routes tool calls (MCP vs custom)
│   │   └── cdp-session.ts         # Shared CDP connection manager
│   ├── sandbox/
│   │   ├── container-manager.ts   # Spin up/tear down containers on agentqa-net
│   │   ├── pool.ts                # Pre-warmed container pool
│   │   ├── mcp-client.ts          # Connect to Playwright MCP in container
│   │   └── health-check.ts        # Container and MCP server health monitoring
│   ├── assertions/
│   │   └── engine.ts              # Evaluate all assertions after agent loop
│   ├── reporting/
│   │   ├── trace.ts               # Structured trace collector
│   │   ├── evidence.ts            # Screenshot/DOM/network evidence capture
│   │   └── notifier.ts            # Slack, email, webhook notifications
│   ├── api/
│   │   ├── routes/
│   │   │   ├── test-cases.ts      # CRUD for test cases
│   │   │   ├── runs.ts            # Trigger, list, get run results
│   │   │   └── ws.ts              # WebSocket for live updates
│   │   └── server.ts              # Fastify app setup
│   └── index.ts                   # Entry point
├── test-cases/                    # YAML test case files (Git-versioned)
├── baselines/                     # Visual baseline screenshots
├── Dockerfile                     # Orchestrator container
├── docker-compose.yml             # Full local dev stack
└── package.json
```

### 7.7 CDP Session Management

The orchestrator opens one CDP session per test run for custom tools. This runs alongside the Playwright MCP server's own CDP session — CDP supports concurrent clients.

```
Orchestrator CDP session responsibilities:
├── Network domain
│   ├── Enable Network.requestWillBeSent listener → buffer all requests
│   ├── Enable Network.responseReceived listener → buffer all responses
│   └── Used by: get_network_log, assert_network_request
├── Runtime domain
│   ├── Inject JavaScript for DOM mutation observation
│   ├── Inject axe-core for accessibility audits
│   └── Used by: wait_for_stable, check_accessibility
├── Page domain
│   ├── Capture screenshots for visual diffing
│   └── Used by: assert_visual_match, wait_for_stable (visual stability)
├── Console domain
│   ├── Buffer console.error and console.warn messages
│   └── Used by: get_console_errors
└── Performance domain
    ├── Capture Web Vitals and timing marks
    └── Used by: measure_performance
```

---

## 8. Data Models

### 8.1 Core Entities (PostgreSQL)

**test_cases**

| Column | Type | Description |
|---|---|---|
| `id` | `VARCHAR(64) PK` | Test case ID (e.g., "TC-0042") |
| `name` | `VARCHAR(255)` | Human-readable name |
| `suite` | `VARCHAR(128)` | Suite grouping |
| `priority` | `VARCHAR(4)` | P0-P3 |
| `tags` | `JSONB` | Array of string tags |
| `spec` | `JSONB` | Full test case YAML parsed to JSON |
| `baseline_refs` | `JSONB` | Map of assertion ID → S3 baseline path |
| `created_by` | `VARCHAR(255)` | Author email |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last modification |

**test_runs**

| Column | Type | Description |
|---|---|---|
| `id` | `UUID PK` | Run ID |
| `test_case_id` | `VARCHAR(64) FK` | Test case being run |
| `status` | `VARCHAR(32)` | `queued` / `running` / `passed` / `failed` / `errored` / `timed_out` |
| `browser` | `VARCHAR(32)` | `chromium` / `webkit` / `firefox` |
| `model` | `VARCHAR(64)` | Primary LLM model used |
| `queued_at` | `TIMESTAMPTZ` | When the run was queued |
| `started_at` | `TIMESTAMPTZ` | When the container booted and agent loop began |
| `finished_at` | `TIMESTAMPTZ` | When the run completed (all assertions evaluated) |
| `duration_ms` | `INTEGER` | Total run duration (started_at → finished_at) |
| `container_boot_ms` | `INTEGER` | Time to provision and boot the container |
| `total_steps` | `INTEGER` | Agent steps taken |
| `total_tokens` | `INTEGER` | Total LLM tokens consumed (input + output) |
| `total_llm_calls` | `INTEGER` | Number of LLM API calls |
| `total_tool_calls` | `INTEGER` | Number of tool executions |
| `estimated_cost_usd` | `DECIMAL(10,4)` | Total estimated cost of the run |
| `steps_completed` | `JSONB` | Step completion summary, e.g., `{"total": 7, "completed": ["S1","S2","S3","S4","S5","S6","S7"], "incomplete": []}` |
| `novnc_url` | `VARCHAR(512)` | Observer stream URL (valid during run) |
| `container_name` | `VARCHAR(128)` | Docker container name (e.g., `run-abc123`) |

**test_results**

| Column | Type | Description |
|---|---|---|
| `id` | `UUID PK` | Result ID |
| `run_id` | `UUID FK` | Parent run |
| `assertion_id` | `VARCHAR(32)` | Assertion ID from test case (A1, A2, etc.) |
| `passed` | `BOOLEAN` | Pass/fail verdict |
| `details` | `JSONB` | Assertion-specific result details |
| `evidence` | `JSONB` | Map of evidence type → S3 path |

**agent_traces** — one row per agent action (the granular, per-step trace)

| Column | Type | Description |
|---|---|---|
| `id` | `UUID PK` | Trace entry ID |
| `run_id` | `UUID FK` | Parent run |
| `step_number` | `INTEGER` | Sequential step number (1-indexed) |
| `checkpoint_id` | `VARCHAR(32)` | Current guided step (S1, S2, etc.) or NULL if no steps defined |
| `checkpoint_completed` | `BOOLEAN` | Whether this action completed the current checkpoint |
| **Timestamps** | | |
| `timestamp` | `TIMESTAMPTZ` | When this step started |
| `completed_at` | `TIMESTAMPTZ` | When this step finished (including tool execution) |
| **LLM Call Details** | | |
| `llm_request_id` | `VARCHAR(128)` | Anthropic API request ID (from response header) |
| `model` | `VARCHAR(64)` | Model used for this step (may vary if fallback/retry with different model) |
| `input_tokens` | `INTEGER` | Tokens in the prompt sent to the LLM |
| `output_tokens` | `INTEGER` | Tokens in the LLM response |
| `cache_read_tokens` | `INTEGER` | Tokens served from prompt cache (Anthropic prompt caching) |
| `cache_creation_tokens` | `INTEGER` | Tokens written to prompt cache on this call |
| `reasoning_tokens` | `INTEGER` | Extended thinking tokens (if extended thinking enabled) |
| `total_tokens` | `INTEGER` | Computed: `input_tokens + output_tokens` |
| **Latency Breakdown** | | |
| `llm_latency_ms` | `INTEGER` | Time from API request sent to full response received |
| `llm_time_to_first_token_ms` | `INTEGER` | Time to first token (streaming latency) |
| `tool_execution_latency_ms` | `INTEGER` | Time to execute the tool call (MCP round-trip or custom fn) |
| `wait_for_stable_ms` | `INTEGER` | Time spent in page readiness check before this step's observation |
| `total_step_latency_ms` | `INTEGER` | Wall-clock time for entire step (observe + reason + act) |
| **Tool Call Details** | | |
| `tool_name` | `VARCHAR(128)` | Tool called by the LLM (NULL if LLM responded with text only) |
| `tool_source` | `VARCHAR(16)` | `mcp` or `custom` — which execution path handled it |
| `tool_input` | `JSONB` | Tool call arguments |
| `tool_output` | `JSONB` | Tool call response (truncated to 10KB for large outputs) |
| `tool_output_full_ref` | `VARCHAR(512)` | S3 path to full tool output if truncated |
| `tool_success` | `BOOLEAN` | Whether tool execution succeeded without error |
| `tool_error` | `TEXT` | Error message if tool execution failed |
| `tool_retries` | `INTEGER` | Number of retries before success/failure |
| **Agent Reasoning** | | |
| `reasoning` | `TEXT` | LLM's chain-of-thought / extended thinking output |
| `agent_output_text` | `TEXT` | Any text the LLM produced alongside tool calls (status updates, step completion signals) |
| `stop_reason` | `VARCHAR(32)` | Why the LLM stopped: `tool_use` / `end_turn` / `max_tokens` / `stop_sequence` |
| **Page Context** | | |
| `page_url` | `VARCHAR(2048)` | Current page URL at this step |
| `page_title` | `VARCHAR(512)` | Current page title |
| `screenshot_ref` | `VARCHAR(512)` | S3 path to screenshot captured at this step |
| **Cost** | | |
| `estimated_cost_usd` | `DECIMAL(10,6)` | Estimated cost of this LLM call based on model pricing |

**run_traces_summary** — one row per run (aggregated metrics, computed at FINALIZE)

| Column | Type | Description |
|---|---|---|
| `run_id` | `UUID PK FK` | Parent run (1:1 with test_runs) |
| **Token Aggregates** | | |
| `total_input_tokens` | `INTEGER` | Sum of all input tokens across all steps |
| `total_output_tokens` | `INTEGER` | Sum of all output tokens |
| `total_cache_read_tokens` | `INTEGER` | Sum of all cache-hit tokens |
| `total_cache_creation_tokens` | `INTEGER` | Sum of all cache-write tokens |
| `total_reasoning_tokens` | `INTEGER` | Sum of all extended thinking tokens |
| `total_tokens` | `INTEGER` | Grand total tokens consumed |
| `avg_tokens_per_step` | `INTEGER` | `total_tokens / total_steps` |
| **API Call Aggregates** | | |
| `total_llm_calls` | `INTEGER` | Number of LLM API calls made |
| `total_tool_calls` | `INTEGER` | Number of tool executions (MCP + custom) |
| `total_mcp_tool_calls` | `INTEGER` | Tool calls routed to Playwright MCP |
| `total_custom_tool_calls` | `INTEGER` | Tool calls executed as custom functions |
| `tool_calls_by_name` | `JSONB` | Frequency map, e.g., `{"browser_click": 12, "browser_type": 5, "browser_snapshot": 18, "wait_for_stable": 17, "assert_visual_match": 1}` |
| `failed_tool_calls` | `INTEGER` | Tool calls that returned errors |
| `total_retries` | `INTEGER` | Sum of all tool retries |
| **Latency Aggregates** | | |
| `total_run_duration_ms` | `INTEGER` | Wall-clock time from first step to last step |
| `total_llm_latency_ms` | `INTEGER` | Sum of all LLM API call durations |
| `total_tool_latency_ms` | `INTEGER` | Sum of all tool execution durations |
| `total_wait_stable_ms` | `INTEGER` | Sum of all page readiness wait times |
| `avg_step_latency_ms` | `INTEGER` | Average wall-clock time per step |
| `p50_step_latency_ms` | `INTEGER` | Median step latency |
| `p95_step_latency_ms` | `INTEGER` | 95th percentile step latency |
| `p99_step_latency_ms` | `INTEGER` | 99th percentile step latency |
| `slowest_step_number` | `INTEGER` | Step number with highest latency |
| `slowest_step_tool` | `VARCHAR(128)` | Tool called in the slowest step |
| `time_in_llm_pct` | `DECIMAL(5,2)` | Percentage of total time spent in LLM calls |
| `time_in_tools_pct` | `DECIMAL(5,2)` | Percentage of total time spent in tool execution |
| `time_in_waiting_pct` | `DECIMAL(5,2)` | Percentage of total time in page readiness waits |
| **Cost Aggregates** | | |
| `total_estimated_cost_usd` | `DECIMAL(10,4)` | Sum of all step costs |
| `cost_by_category` | `JSONB` | Breakdown: `{"llm": 0.062, "tool_compute": 0.008, "storage": 0.001}` |
| **Context Window** | | |
| `peak_context_tokens` | `INTEGER` | Highest input_tokens in any single step (shows context growth) |
| `final_context_tokens` | `INTEGER` | Input tokens on the last step |
| `context_growth_rate` | `DECIMAL(8,2)` | Average input token increase per step |

### 8.2 Indexes

```sql
-- Test cases
CREATE INDEX idx_test_cases_suite      ON test_cases (suite);
CREATE INDEX idx_test_cases_tags       ON test_cases USING GIN (tags);

-- Test runs
CREATE INDEX idx_test_runs_case_status ON test_runs (test_case_id, status);
CREATE INDEX idx_test_runs_started     ON test_runs (started_at DESC);
CREATE INDEX idx_test_runs_cost        ON test_runs (estimated_cost_usd DESC);

-- Test results
CREATE INDEX idx_test_results_run      ON test_results (run_id);

-- Agent traces (the hot table — optimized for trace replay and analysis)
CREATE INDEX idx_agent_traces_run_step ON agent_traces (run_id, step_number);
CREATE INDEX idx_agent_traces_tool     ON agent_traces (run_id, tool_name);
CREATE INDEX idx_agent_traces_cost     ON agent_traces (run_id, estimated_cost_usd DESC);
CREATE INDEX idx_agent_traces_latency  ON agent_traces (run_id, total_step_latency_ms DESC);

-- Run traces summary (for dashboard queries)
CREATE INDEX idx_run_traces_cost       ON run_traces_summary (total_estimated_cost_usd DESC);
CREATE INDEX idx_run_traces_tokens     ON run_traces_summary (total_tokens DESC);
```

---

## 9. API Specification

### 9.1 REST Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/test-cases` | Create a new test case (accepts YAML or JSON body) |
| `GET` | `/api/v1/test-cases` | List test cases (filterable by suite, tags, priority) |
| `GET` | `/api/v1/test-cases/:id` | Get a specific test case |
| `PUT` | `/api/v1/test-cases/:id` | Update a test case |
| `DELETE` | `/api/v1/test-cases/:id` | Delete a test case |
| `POST` | `/api/v1/runs` | Trigger a test run `{ test_case_id, browser?, model? }` |
| `POST` | `/api/v1/runs/batch` | Trigger a batch of runs `{ test_case_ids, browsers?, model? }` |
| `GET` | `/api/v1/runs` | List runs (filterable by status, test case, date range) |
| `GET` | `/api/v1/runs/:id` | Get run details including status, metrics summary, noVNC URL |
| `GET` | `/api/v1/runs/:id/results` | Get assertion results for a run |
| `GET` | `/api/v1/runs/:id/trace` | Get the full agent trace (all steps with timing, tokens, reasoning) |
| `GET` | `/api/v1/runs/:id/trace/summary` | Get aggregated trace metrics (the `run_traces_summary` row) |
| `GET` | `/api/v1/runs/:id/trace/steps/:step` | Get a single trace step with full detail |
| `GET` | `/api/v1/runs/:id/trace/timeline` | Get a timeline view: step number, tool, latency, tokens, cost per step |
| `GET` | `/api/v1/runs/:id/evidence/:type` | Download evidence artifact (screenshot, network log, etc.) |
| `POST` | `/api/v1/runs/:id/cancel` | Cancel a running test |
| `POST` | `/api/v1/baselines/:assertion_id` | Upload a new visual baseline |
| `GET` | `/api/v1/analytics/cost` | Aggregate cost analytics (filterable by date range, suite, model) |
| `GET` | `/api/v1/analytics/performance` | Aggregate latency/token analytics across runs |

### 9.2 WebSocket Events

**Client → Server:**
- `subscribe:run:{run_id}` — subscribe to live updates for a run

**Server → Client:**
- `run:status` — run status change (queued → running → passed/failed)
- `run:step` — real-time agent step with full trace data:
  ```json
  {
    "step_number": 5,
    "checkpoint_id": "S2",
    "tool_name": "browser_click",
    "tool_source": "mcp",
    "tool_success": true,
    "reasoning": "I can see an 'Add to Cart' button...",
    "input_tokens": 3420,
    "output_tokens": 85,
    "llm_latency_ms": 1230,
    "tool_execution_latency_ms": 340,
    "total_step_latency_ms": 1890,
    "estimated_cost_usd": 0.0034,
    "running_totals": {
      "total_tokens": 14200,
      "total_cost_usd": 0.018,
      "total_steps": 5,
      "elapsed_ms": 12400
    }
  }
  ```
- `run:novnc_url` — noVNC observer URL when container is ready
- `run:assertion` — individual assertion result as evaluated
- `run:complete` — final result with all evidence links and full trace summary

---

## 10. Agent Observability & Tracing

### 10.1 Tracing Architecture

Every agent run produces a complete, structured trace — a step-by-step record of everything the agent did, why it did it, how long it took, and how much it cost. Traces serve three purposes: debugging (why did the test fail?), optimization (where is the agent wasting tokens/time?), and cost management (which tests are expensive and why?).

```
Trace data flows through three layers:

Per-Step (real-time)          Per-Run (at FINALIZE)          Cross-Run (analytics)
─────────────────             ────────────────────           ─────────────────────
agent_traces table            run_traces_summary table       Analytics API queries
  ↓ streamed via WS             ↓ computed from traces         ↓ aggregated from summaries
  Dashboard live view           Run detail page                Cost/performance dashboards
```

### 10.2 What Gets Captured Per Step

Every iteration of the agent loop produces one `agent_traces` row. Here's what the orchestrator captures at each phase and where it comes from:

**OBSERVE phase:**
- `wait_for_stable_ms` — how long the page readiness check took (from the `wait_for_stable` custom tool timer)
- `page_url`, `page_title` — read from the browser snapshot
- `screenshot_ref` — screenshot stored to S3

**REASON phase (LLM API call):**
- `llm_request_id` — from Anthropic response header `x-request-id`
- `model` — from the API call config
- `input_tokens`, `output_tokens` — from `response.usage.input_tokens` and `response.usage.output_tokens`
- `cache_read_tokens` — from `response.usage.cache_read_input_tokens` (prompt caching hits)
- `cache_creation_tokens` — from `response.usage.cache_creation_input_tokens`
- `reasoning_tokens` — token count of extended thinking blocks (if enabled)
- `llm_time_to_first_token_ms` — measured from request start to first streaming chunk
- `llm_latency_ms` — measured from request start to final response chunk
- `reasoning` — extracted text from thinking blocks
- `agent_output_text` — extracted text from text content blocks
- `stop_reason` — from `response.stop_reason`

**ACT phase (tool execution):**
- `tool_name`, `tool_input`, `tool_output` — direct from the tool call/response
- `tool_source` — `"mcp"` if routed to Playwright MCP, `"custom"` if executed locally
- `tool_execution_latency_ms` — measured from tool call start to response
- `tool_success` — `true` if tool returned without error
- `tool_error` — error message if tool failed
- `tool_retries` — how many retries before success/ultimate failure

**Computed:**
- `total_step_latency_ms` — wall-clock from step start to step end (observe + reason + act)
- `total_tokens` — `input_tokens + output_tokens`
- `estimated_cost_usd` — computed from model pricing table × token counts

### 10.3 Cost Computation

Cost is estimated per-step using the model's published pricing. The orchestrator maintains a pricing table:

```typescript
const MODEL_PRICING: Record<string, { input_per_mtok: number; output_per_mtok: number; cache_read_per_mtok: number; cache_write_per_mtok: number }> = {
  "claude-sonnet-4-20250514":    { input_per_mtok: 3.00, output_per_mtok: 15.00, cache_read_per_mtok: 0.30, cache_write_per_mtok: 3.75 },
  "claude-opus-4-20250514":     { input_per_mtok: 15.00, output_per_mtok: 75.00, cache_read_per_mtok: 1.50, cache_write_per_mtok: 18.75 },
  "claude-haiku-4-5-20251001":  { input_per_mtok: 0.80, output_per_mtok: 4.00, cache_read_per_mtok: 0.08, cache_write_per_mtok: 1.00 },
};

function computeStepCost(model: string, usage: Usage): number {
  const p = MODEL_PRICING[model];
  return (
    (usage.input_tokens * p.input_per_mtok / 1_000_000) +
    (usage.output_tokens * p.output_per_mtok / 1_000_000) +
    (usage.cache_read_input_tokens * p.cache_read_per_mtok / 1_000_000) +
    (usage.cache_creation_input_tokens * p.cache_write_per_mtok / 1_000_000)
  );
}
```

**Note:** Pricing is approximate and should be updated when Anthropic publishes changes. The platform should log a warning if it encounters a model ID not in the pricing table and fall back to the most expensive known model's pricing as a conservative estimate.

### 10.4 Run-Level Summary Computation

At FINALIZE, the orchestrator queries all `agent_traces` rows for the run and computes the `run_traces_summary`:

```typescript
function computeRunSummary(traces: AgentTrace[]): RunTracesSummary {
  const sorted_latencies = traces
    .map(t => t.total_step_latency_ms)
    .sort((a, b) => a - b);

  const total_run_ms = traces[traces.length - 1].completed_at - traces[0].timestamp;

  const total_llm_ms = sum(traces, t => t.llm_latency_ms);
  const total_tool_ms = sum(traces, t => t.tool_execution_latency_ms);
  const total_wait_ms = sum(traces, t => t.wait_for_stable_ms);

  return {
    // Token aggregates
    total_input_tokens:  sum(traces, t => t.input_tokens),
    total_output_tokens: sum(traces, t => t.output_tokens),
    total_cache_read_tokens: sum(traces, t => t.cache_read_tokens),
    total_tokens: sum(traces, t => t.total_tokens),
    avg_tokens_per_step: Math.round(sum(traces, t => t.total_tokens) / traces.length),

    // API call aggregates
    total_llm_calls: traces.length,
    total_tool_calls: traces.filter(t => t.tool_name).length,
    total_mcp_tool_calls: traces.filter(t => t.tool_source === "mcp").length,
    total_custom_tool_calls: traces.filter(t => t.tool_source === "custom").length,
    tool_calls_by_name: countBy(traces.filter(t => t.tool_name), t => t.tool_name),
    failed_tool_calls: traces.filter(t => t.tool_success === false).length,
    total_retries: sum(traces, t => t.tool_retries),

    // Latency aggregates
    total_run_duration_ms: total_run_ms,
    avg_step_latency_ms: Math.round(mean(sorted_latencies)),
    p50_step_latency_ms: percentile(sorted_latencies, 50),
    p95_step_latency_ms: percentile(sorted_latencies, 95),
    p99_step_latency_ms: percentile(sorted_latencies, 99),
    slowest_step_number: traces.reduce((max, t) =>
      t.total_step_latency_ms > max.total_step_latency_ms ? t : max
    ).step_number,
    time_in_llm_pct:     round2((total_llm_ms / total_run_ms) * 100),
    time_in_tools_pct:   round2((total_tool_ms / total_run_ms) * 100),
    time_in_waiting_pct: round2((total_wait_ms / total_run_ms) * 100),

    // Cost
    total_estimated_cost_usd: sum(traces, t => t.estimated_cost_usd),

    // Context window growth
    peak_context_tokens: max(traces, t => t.input_tokens),
    final_context_tokens: traces[traces.length - 1].input_tokens,
    context_growth_rate: linearSlope(traces.map(t => t.input_tokens)),
  };
}
```

### 10.5 Context Window Growth Monitoring

A critical operational concern: the agent's conversation history grows with every step. By step 30, the input tokens might be 5-10x what they were at step 1, because the full history of snapshots, tool calls, and results accumulates. This drives up both latency and cost exponentially.

The trace captures `input_tokens` per step, and the summary computes `context_growth_rate` (tokens added per step on average), `peak_context_tokens`, and `final_context_tokens`. When context growth is steep, the platform can:

- **Alert** if `peak_context_tokens` exceeds 80% of the model's context window (200K for Sonnet/Opus)
- **Suggest optimization** — the test case may need a shorter goal, or the agent loop should summarize history after N steps instead of passing the full transcript
- **Auto-compact** — after every 10 steps, replace the full conversation history with a condensed summary of actions taken so far (reduces context by ~60% but may lose nuance)

### 10.6 Example Trace Output

What a single run's trace looks like when retrieved via `GET /api/v1/runs/:id/trace/summary`:

```json
{
  "run_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "test_case_id": "TC-0042",
  "status": "passed",
  "model": "claude-sonnet-4-20250514",
  "browser": "chromium",

  "timing": {
    "queued_at": "2026-05-07T14:30:00.000Z",
    "started_at": "2026-05-07T14:30:02.340Z",
    "finished_at": "2026-05-07T14:32:48.120Z",
    "container_boot_ms": 2340,
    "total_run_duration_ms": 165780,
    "avg_step_latency_ms": 7535,
    "p50_step_latency_ms": 6200,
    "p95_step_latency_ms": 14800,
    "p99_step_latency_ms": 18200,
    "time_in_llm_pct": 62.4,
    "time_in_tools_pct": 24.1,
    "time_in_waiting_pct": 13.5,
    "slowest_step": { "number": 14, "tool": "browser_type", "latency_ms": 18200 }
  },

  "tokens": {
    "total_input_tokens": 68420,
    "total_output_tokens": 4280,
    "total_cache_read_tokens": 31200,
    "total_cache_creation_tokens": 8400,
    "total_reasoning_tokens": 0,
    "total_tokens": 72700,
    "avg_tokens_per_step": 3305,
    "peak_context_tokens": 8240,
    "final_context_tokens": 7890,
    "context_growth_rate": 245.2
  },

  "api_calls": {
    "total_llm_calls": 22,
    "total_tool_calls": 21,
    "total_mcp_tool_calls": 16,
    "total_custom_tool_calls": 5,
    "failed_tool_calls": 1,
    "total_retries": 1,
    "tool_calls_by_name": {
      "browser_snapshot": 21,
      "browser_click": 7,
      "browser_type": 4,
      "browser_navigate": 2,
      "browser_scroll": 2,
      "browser_select_option": 1,
      "wait_for_stable": 21,
      "assert_visual_match": 1,
      "get_console_errors": 1,
      "get_network_log": 1,
      "check_accessibility": 1,
      "measure_performance": 1
    }
  },

  "cost": {
    "total_estimated_cost_usd": 0.0684,
    "cost_by_category": {
      "llm_input": 0.0205,
      "llm_output": 0.0642,
      "llm_cache_read": 0.0094,
      "llm_cache_write": 0.0315
    }
  },

  "steps_completed": {
    "total": 7,
    "completed": ["S1", "S2", "S3", "S4", "S5", "S6", "S7"],
    "incomplete": []
  },

  "assertions": {
    "total": 8,
    "passed": 8,
    "failed": 0,
    "results": ["A1:pass", "A2:pass", "A3:pass", "A4:pass", "A5:pass", "A6:pass", "A7:pass", "A8:pass"]
  }
}
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Single test case, single browser (Chromium), end-to-end working.

| Week | Deliverable |
|---|---|
| 1 | Sandbox container image: Xvfb + VNC + noVNC + Playwright MCP. Verify noVNC stream works. Run a manual Playwright MCP tool call from outside the container. |
| 2 | Agent loop engine: hardcoded test goal, observe → reason → act cycle with Claude Sonnet. Tool router dispatching to Playwright MCP. Per-step trace capture (tokens, latency, tool calls, reasoning) logged to stdout. |
| 3 | Custom tools: `wait_for_stable`, `assert_visual_match`, `assert_text_present`, `get_console_errors`. CDP session manager. Assertion engine evaluating results post-loop. |
| 4 | Test case YAML parser. API endpoints for triggering a run and retrieving results. PostgreSQL schema (including `agent_traces` and `run_traces_summary`). Trace persistence and run summary computation at FINALIZE. Cost estimation per step. |

**Exit criteria:** Can author a YAML test case, trigger a run via API, watch it execute via noVNC, and get a PASS/FAIL result with evidence.

### Phase 2: Production Hardening (Weeks 5-8)

| Week | Deliverable |
|---|---|
| 5 | Container pool with pre-warming. BullMQ job queue for run scheduling. Run cancellation. Timeout enforcement. |
| 6 | WebKit and Firefox support. Cross-browser run batching. Multi-browser result comparison. |
| 7 | Dashboard UI: run list, live agent trace view with real-time token/cost counters, embedded noVNC stream, step-by-step trace replay, result drilldown, visual diff viewer, latency timeline chart. |
| 8 | CI/CD integration: GitHub Actions plugin, CLI tool for triggering runs from pipelines. Webhook notifications. |

### Phase 3: Scale & Intelligence (Weeks 9-12)

| Week | Deliverable |
|---|---|
| 9 | Kubernetes deployment: ephemeral pod-per-run, auto-scaling based on queue depth. |
| 10 | Baseline management: auto-update baselines on approval, visual diff review workflow. |
| 11 | Agent improvement: trace analysis to identify common failure patterns, prompt tuning, model selection per test complexity. Context window auto-compaction for long-running tests. |
| 12 | Suite-level orchestration: parallel runs, dependency chains between tests, suite-level reporting and pass/fail gates. Cross-run cost/performance analytics dashboard with trend lines and anomaly detection. |

---

## 12. Cost Estimation

### Per-Test-Run Costs (estimated)

| Component | Sonnet 4 | Opus 4 | Haiku 4.5 |
|---|---|---|---|
| LLM tokens (avg 20 steps, ~2K tokens/step) | ~$0.06 | ~$0.30 | ~$0.01 |
| Container compute (3 min avg, 2 vCPU/2GB) | ~$0.008 | ~$0.008 | ~$0.008 |
| Storage (screenshots, traces, ~5MB/run) | ~$0.001 | ~$0.001 | ~$0.001 |
| **Total per run** | **~$0.07** | **~$0.31** | **~$0.02** |

### Monthly Costs at Scale

| Scale | Runs/day | Model mix | Est. monthly cost |
|---|---|---|---|
| Small team | 50 | 80% Sonnet, 20% Haiku | ~$85 |
| Medium team | 200 | 70% Sonnet, 20% Haiku, 10% Opus | ~$460 |
| Large team / CI | 1000 | 60% Haiku, 30% Sonnet, 10% Opus | ~$1,200 |

---

## 13. Security Considerations

- **Sandbox isolation:** Each container runs with `--security-opt=no-new-privileges`, dropped capabilities, read-only root filesystem (writable tmpfs for evidence only), and `--shm-size=2g` for browser stability.
- **Network isolation:** All containers run on an internal Docker bridge network (`agentqa-net`). No container ports are mapped to the host. The only externally exposed port is the orchestrator's API/proxy on `:8080`. Container-to-container communication is blocked by Docker network policy (containers cannot reach each other, only the orchestrator can reach containers).
- **Credential management:** Test credentials stored in a secrets vault (HashiCorp Vault, AWS Secrets Manager). Never inline in test cases. The `credentials_ref` field points to a vault path. Credentials injected at runtime via environment variables scoped to the container.
- **noVNC authentication:** Token-authenticated observer URLs with short-lived tokens (TTL matches run duration). Tokens generated per-run and invalidated on container teardown. Reverse proxy enforces token validation before proxying to the container's noVNC port.
- **Network egress:** Containers only reach the target application URL. All other egress blocked via Docker network policy. DNS resolution restricted to the target domain.
- **LLM data:** Agent traces may contain page content. Ensure LLM provider data retention policies are compatible with your application's sensitivity level. Sensitive test data (credit card numbers, credentials) should use test/sandbox values only.
- **CDP access:** CDP port (`:9222`) only accessible within the Docker bridge network. The orchestrator is the sole CDP client. No external access possible.
