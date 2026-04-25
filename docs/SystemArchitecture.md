# Architecture Plan: Autonomous App Testing Agent System (Local Prototype)

## 1. Executive Summary

This document outlines the architecture for an autonomous, LLM-driven app testing agent. The system deploys a sandboxed container, launches the target application, and uses an AI agent to execute predefined test cases via a web browser. It features real-time, view-only monitoring for humans, deep backend network inspection, comprehensive reporting, and a Vercel-like dashboard for CI/CD integration.

Primary Constraint: Local-first prototype utilizing exclusively free and open-source tools.

## 2. High-Level Architecture Components

The system is broken down into three main decoupled layers: The Control Plane (Dashboard), the Orchestrator, and the Execution Sandbox.

### 2.1. The Control Plane (Dashboard & API)

- **Role**: The "Vercel-like" UI for managing tests, viewing live execution, and reviewing reports.

- **Tech Stack**: Next.js (React), Tailwind CSS, SQLite (via Prisma or Drizzle ORM).

- **Functions**: 
    - Store test cases (JSON/YAML format) and app instructions.
    - Provide a webhook endpoint for CI/CD triggers (e.g., GitHub Actions).
    - Embed a web-based viewer (noVNC) to watch the live agent.
    - Display structured markdown reports post-execution.

### 2.2. The Agent Orchestrator (The "Brain" Connector)

- **Role**: Manages the lifecycle of the sandbox container and coordinates the LLM's thought process.

- **Tech Stack**: Python, FastAPI, Docker SDK for Python, LangGraph or AutoGen (lightweight agent frameworks).

- **Functions**:

    - Receives test payloads from the Dashboard.
    - Spins up the isolated Docker Sandbox.
    - Translates LLM reasoning into Playwright/MCP commands.
    - Streams logs and telemetry back to the Dashboard.

### 2.3. The Execution Sandbox

- **Role**: A secure, ephemeral Docker container where the app runs and is tested.

- **Tech Stack**: Docker (Base: mcr.microsoft.com/playwright:v1.x-focal), Playwright (Python/Node), Xvfb (Virtual Display), x11vnc, noVNC, Chrome DevTools Protocol (CDP) / MCP.

- **Functions**:
    - Executes the target app via provided terminal commands.
    - Runs a headless browser visually mapped to a virtual frame buffer.
    - Intersects backend network activity (XHR/Fetch requests, console errors).

## 3. Core Workflows

### 3.1 The Execution Loop

- **Trigger**: CI/CD or human clicks "Run Test" on the Dashboard.

- **Provision**: Orchestrator pulls the app code, starts the Docker Sandbox, and executes the setup instructions.

- **Observation Setup**: noVNC server starts. Orchestrator connects the LLM to the Playwright instance / MCP server.

- **Agent Action Loop** (Think -> Act -> Observe):

    - **Read**: Agent reads the test case goal.

    - **Act**: Agent issues Playwright commands (click, type, navigate) or MCP DevTools commands.

    - **Observe**: Agent reads the DOM state, visual screenshots, and CDP network logs to verify backend changes (e.g., "Did the POST request return 200 OK?").

- **Reporting**: Once the test finishes (Pass/Fail), the agent generates a markdown/JSON report explaining the steps taken, network anomalies, and root causes for failures.

- **Teardown**: Sandbox is destroyed; report is saved to SQLite.

### 3.2 Real-Time "View Only" Feature

To satisfy the strict "view-only, no human interaction" requirement:

- Inside the Sandbox, run an Xvfb (X Virtual Framebuffer) to give the browser a "screen".

- Attach a VNC server (x11vnc) to that frame buffer, configured as read-only (-viewonly flag).

- Use websockify and noVNC to stream this read-only screen to an <iframe> in your Next.js dashboard.

## 4. LLM "Agent Brain" Strategy & Recommendations

You need an LLM capable of robust function calling, reasoning, and ideally, vision (to understand UI elements).

### 4.1 Option 1: Local Agent (Self-Hosted inside/alongside Sandbox)

- **Infrastructure**: Run Ollama locally. It is the easiest, most resource-efficient way for a student to run models on a laptop (uses quantized models).

- **Recommended Models**:

    - **qwen2.5-coder:7b or 14b**: Exceptional at coding, function calling, and understanding browser DOM structures.

    - **llama-3.1-8b-instruct**: Great general reasoning.

    - **llava**: (if vision is strictly required, though DOM-parsing is often more reliable than vision for pure functional testing).

- **Pros**: 100% free, complete privacy, works offline.

- **Cons**: Slow on laptops without a dedicated GPU; context window limits might struggle with massive DOM trees.

### 4.2 Option 2: Cloud Model APIs (Free Tiers)

- **Infrastructure**: API calls orchestrated by LangChain/LiteLLM.

- **Recommended Models**:

    - **Google Gemini 2.5 Flash**: Massive context window (great for dumping whole HTML DOMs and network logs), extremely fast, and has a generous Free Tier. Highly recommended for this prototype.

    - **Groq API (Llama 3 70B)**: Blisteringly fast, offers a free tier. Great for rapid reasoning loops.

- **Pros**: Much faster execution, handles larger context (network logs + DOM), better reasoning out-of-the-box.

- **Cons**: Requires internet access; rate limits on free tiers.

- **Architect's Recommendation for Prototype**: Build the system to use the OpenAI compatible API standard (via LiteLLM). Start testing with Ollama (qwen2.5-coder) to get it working fully locally. If you hit reasoning limits, swap the base URL to use the Gemini Free Tier or Groq.

### 5. Integrating Playwright & Chrome DevTools MCP

- **Role**: The agent needs to interact with the frontend and monitor the backend.

- **Frontend Interaction**: Expose Playwright functions to the LLM via standard Tool Calling (e.g., click_element(selector), type_text(selector, text)).

- **Backend Monitoring (The MCP approach)**:

    - Use the Model Context Protocol (MCP). You can run an MCP server inside the sandbox that attaches to Chrome via the Chrome DevTools Protocol (CDP).

    - Provide the agent with MCP Tools like get_failed_network_requests(), get_console_errors(), or inspect_websocket_frames().

- **Alternative**: Simply use Playwright's built-in page.on('response') to log all network activity to a JSON file during the test, and pass that JSON to the LLM during the "Reporting" phase to diagnose backend issues.

### 6. CI/CD Pipeline Integration

- **To make it plug-and-play with pipelines (GitHub Actions, GitLab CI)**:

- **Webhook API**: The Orchestrator exposes POST /api/deploy-and-test.

    - **Payload**: The CI pipeline sends a payload containing the Git commit hash, app startup commands, and the test suite JSON.

    - **Action**: The Orchestrator clones the repo inside the Sandbox, builds it, runs the tests, and returns a pending status.

    - **Callback/Polling**: The CI pipeline polls GET /api/test-status/{id}. Once done, if the agent reports a failure, the pipeline fails the build and outputs the Agent's "Probable Cause" report to the CI console.

### 7. Step-by-Step Implementation Plan (Detailed Breakdown)

### 7.1 Phase 1: The Core Sandbox (Week 1)

- **Goal**: Establish an isolated, viewable container environment where web automation can run headless but be monitored visually.

- **Task 1.1**: Base Docker Environment Setup

    - **Development**: Create a Dockerfile using an official Playwright base image (e.g., mcr.microsoft.com/playwright/python:v1.40.0-jammy). Install system dependencies: xvfb, x11vnc, novnc, websockify, and supervisor.

    - **Testing**: Build the container and verify bash access.

    - **Starting Point**: Research Playwright Docker images. Look up basic apt-get install commands for VNC tools.

    - **Key Considerations**: Keep the image as lightweight as possible. Pin versions to avoid breaking changes.

- **Task 1.2**: Virtual Display & VNC Configuration

    - **Development**: Write a supervisord.conf file or a bash entrypoint.sh script that starts Xvfb on a specific display port (e.g., :99), then starts x11vnc bound to that display with the -viewonly and -nopw flags.

    - **Testing**: Run the container, expose the VNC port (5900), and try connecting with a local VNC viewer (like RealVNC). You should see a blank screen and shouldn't be able to click anything.

    - **Starting Point**: Look up "Running Xvfb in Docker" and "x11vnc view only mode".

    - **Key Considerations**: Security – ensure -viewonly is strictly enforced so users cannot interfere with the agent.

- **Task 1.3**: noVNC Web Bridge

    - **Development**: Start websockify to bridge the VNC port (5900) to web sockets (e.g., port 6080) and serve the noVNC HTML page.

    - **Testing**: Map port 6080 to your local machine (-p 6080:6080). Open http://localhost:6080/vnc.html in your host browser.

    - **Starting Point**: noVNC GitHub repository documentation on websockify.

    - **Key Considerations**: Ensure CORS or frame-ancestors headers allow the stream to be embedded in your future Next.js iframe.

- **Task 1.4**: Validation Script

    - **Development**: Write a simple test.py using Playwright that opens a browser on display :99, navigates to Wikipedia, and scrolls slowly.

    - **Testing**: Run the script inside the running container and watch it happen live via your noVNC browser tab.

    - **Key Considerations**: Ensure the Playwright script explicitly points to the DISPLAY environment variable.

### 7.2 Phase 2: The Dumb Agent (Week 2)

- **Goal**: Connect a local LLM to execute basic, hardcoded functional tests via Playwright.

- **Task 2.1**: Local LLM Infrastructure Setup

    - **Development**: Install Ollama on the host machine. Pull qwen2.5-coder:7b (or llama3).

    - **Testing**: Run basic CLI prompts against the local model. Ensure the REST API (localhost:11434) is reachable from your Python environment.

    - **Starting Point**: Ollama official quickstart guide.

    - **Key Considerations**: Resource limits. Ensure your machine has enough RAM/VRAM to run a 7B or 8B model without crashing the host.

- **Task 2.2**: LLM Tool Creation (Action Primitives)

    - **Development**: Create Python functions for Playwright interactions: click(selector), type(selector, text), Maps(url), get_dom().

    - **Testing**: Write unit tests for these wrapper functions against a dummy HTML page.

    - **Starting Point**: Playwright Python documentation on Locators and Actions.

    - **Key Considerations**: Robust error handling. If a selector isn't found, the function must return a descriptive string (e.g., "Error: Element #btn not found") to the LLM so it can recover, rather than throwing a fatal Python exception.

- **Task 2.3**: Orchestration Loop (Think-Act-Observe)

    - **Development**: Use LiteLLM or plain requests to send a prompt and system instruction to the LLM. Implement a loop that parses the LLM's requested tool call, executes the Playwright primitive, and returns the result to the LLM's context.

    - **Testing**: Provide a prompt like "Go to google.com and search for 'cats'". Verify the agent successfully chains Maps, type, and click.

    - **Starting Point**: LangChain Tool Calling documentation or OpenAI's API spec for function calling.

    - **Key Considerations**: Implement a strict "max steps" counter (e.g., 10 steps) to prevent the agent from getting stuck in an infinite loop.

### 7.3 Phase 3: Deep Observability (Week 3)

- **Goal**: Give the agent "backend sight" to diagnose API or console errors during tests.

- **Task 3.1**: Network Interception

    - **Development**: Attach event listeners to the Playwright page object (page.on('response'), page.on('requestfailed'), page.on('console')). Log everything to an in-memory array or temporary JSON file.

    - **Testing**: Run a test against a site that deliberately throws a 404 or a console error. Verify the logs capture the exact request URL, status code, and error message.

    - **Starting Point**: Playwright Network documentation (page.on('response')).

    - **Key Considerations**: Log bloat. Filter out noise like image/font requests. Focus only on XHR/Fetch and critical console errors.

- **Task 3.2**: Context Assembly & Reporting Prompt

    - **Development**: Create a script that runs after the action loop. It gathers the test intent, the sequence of actions taken, the final DOM state, and the filtered network logs. Send this giant context payload to the LLM with a prompt: "Analyze this test execution and determine if it passed or failed. Provide probable causes for any failures."

    - **Testing**: Feed it logs from a failed test (e.g., a login test where the API returned 500). Verify the LLM correctly points out the 500 API error rather than just saying "Button didn't work."

    - **Starting Point**: Prompt engineering frameworks (e.g., "You are an expert QA Engineer...").

    - **Key Considerations**: Context limits. If using Ollama locally, you might exceed the context window. Summarize DOMs or switch to Gemini Free Tier (LiteLLM) for the reporting phase to leverage the massive context window.

### 7.4 Phase 4: The Vercel-like Dashboard (Week 4)

- **Goal**: Build a web interface to manage tests, trigger runs, and view live video + reports.

- **Task 4.1**: Dashboard UI & Database Init

    - **Development**: Boot a Next.js (App Router) project with Tailwind CSS. Set up SQLite via Drizzle or Prisma. Create tables: TestCases, Runs, Logs.

    - **Testing**: Run the local dev server. Seed the database with a dummy test case and verify it renders on the UI.

    - **Starting Point**: npx create-next-app@latest. Next.js documentation for basic routing.

    - **Key Considerations**: Keep it simple. You just need a list of tests, a detail page, and a "Run" button.

- **Task 4.2**: Webhook/API Orchestration Layer

    - **Development**: Create a Next.js API route (POST /api/run) that executes a shell command or HTTP request to your Python Orchestrator (from Phase 2) passing the test ID.

    - **Testing**: Click "Run" on the UI, verify the Docker container starts, the test runs, and the database updates to "Completed".

    - **Starting Point**: Python subprocess or FastAPI (if you run the orchestrator as a separate microservice).

    - **Key Considerations**: Asynchronous execution. Do not block the Next.js API request while the test runs. Return a Job ID immediately and let the UI poll or use Server-Sent Events (SSE) for status updates.

- **Task 4.3**: Live Viewer Integration

    - **Development**: On the "Live Run" page, add an <iframe> whose src points to the noVNC bridge (http://localhost:6080/vnc.html).

    - **Testing**: Start a test via the UI and immediately navigate to the Live Run page. You should see the browser automating the site in real-time.

    - **Key Considerations**: Managing host/port mappings if you run multiple concurrent tests. (For a prototype, hardcoding single-test limits is fine).

- **Task 4.4**: Markdown Reporting UI

    - **Development**: Once a run finishes, pull the LLM-generated markdown report from SQLite and render it using a library like react-markdown.

    - **Testing**: Review a past run to ensure the root-cause analysis is readable, beautifully formatted, and actionable.

    - **Starting Point**: react-markdown library installation.

    - **Key Considerations**: Sanitize the markdown if necessary to prevent XSS, though it's internal. Ensure code blocks (e.g., API payloads) render nicely.