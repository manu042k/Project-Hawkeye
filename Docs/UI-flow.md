# Project Hawkeye: UI/UX Architecture & Page Flow

This document outlines the page flow, content strategy, and field-level mapping for Project Hawkeye, including a strict **multi-project hierarchy**.

---

## 1. Architectural hierarchy

Hawkeye uses a **two-tier navigation model** so multiple applications can coexist securely and settings stay isolated.

| Tier | Responsibility |
|------|----------------|
| **Global** | Authentication, user profile, organization-level billing, and cross-project navigation (including the **Project Selector**). |
| **Project** | Sandboxed workspace. Test runs, **Vault** secrets, visual baselines, and AI/MCP integrations are scoped to the selected project to prevent cross-project data leakage. |

---

## 2. Page flow (logical paths)

### Authentication flow

`Login / Sign Up` → JWT validation → session/context established.

### Global hub

`Project Selector (Global Dashboard)` → user selects **Project A**.

### Project context

Once Project **A** is selected, the app enters **Project A** scope: the **sidebar** shows project-specific navigation.

### Execution loop

`Project Dashboard` → **Test Configuration** → **Live Execution** → **Run Report**.

### Management loop

`Project Dashboard` → **Test Suites** / **Visual Baselines** / **The Vault** / **Project Settings**.

---

## 3. Page content & field mapping

### Phase 1: Global tier (outside project context)

| Screen name | Core content & purpose | Required fields / data mapping |
|-------------|-------------------------|--------------------------------|
| **Auth screens** | Login, signup, password recovery. | Email (string, required)<br>Password (string, masked)<br>OAuth providers (GitHub / Google tokens) |
| **Global dashboard (Project Selector)** | Grid of projects plus global health; action to **create project**. | Project name (string)<br>Project environment / type (dropdown)<br>Last run status (boolean or enum) |
| **User profile & billing** | Personal details; invite org members; SaaS subscriptions. | User avatar, name, email<br>Team member emails & roles (Admin / Tester)<br>Billing plan id (e.g. Stripe) |

---

### Phase 2: Project tier (sandboxed execution)

| Screen name | Core content & purpose | Required fields / data mapping |
|-------------|-------------------------|--------------------------------|
| **Project Dashboard** | Project metrics; active MCP sessions; recent test history; persistent **sidebar** nav. | Project id (hidden context)<br>Total runs (integer)<br>Pass rate (percentage)<br>Recent runs: `[status, name, target URL, date]` |
| **Test Configuration** | Form to define a new test (NL + env). | Target URL (string, URI)<br>Test objective (textarea, NL)<br>Context files (PDF/CSV array)<br>Environment (dropdown: Prod / Staging / Local)<br>Device viewport (dropdown)<br>Bypass login (boolean)<br>Visual strictness (slider 1–100) |
| **Live Execution** | Split view: AI logs + browser screenshots. | Step progress (`Plan`, `Navigate`, `Act`, `Verify`)<br>Live log stream (strings / JSON)<br>Screenshot URI stream (base64 or blob URL)<br>Run status (`Running`, `Failed`, `Passed`) |
| **Run Report** | Timeline, visual diffs, JSON outputs. | Step array `[status, action, expected, actual]`<br>Baseline image URL<br>Actual image URL<br>Raw MCP output (JSON) |

---

### Phase 3: Project management & settings

| Screen name | Core content & purpose | Required fields / data mapping |
|-------------|-------------------------|--------------------------------|
| **Test Suites** | Group tests to run in sequence. | Suite name (string)<br>Description (textarea)<br>Array of test configuration IDs<br>Cron schedule (string, for automation) |
| **Visual Baselines** | Gallery to approve/reject intentional UI changes. | Baseline id<br>Target URL & step name<br>Golden image URL<br>Review status (`Approved`, `Needs Review`) |
| **The Vault (Secrets)** | Key/value secrets for injected env vars per project tests. | Secret key name (string, uppercase)<br>Secret value (string, encrypted/masked)<br>Target environment (`Prod` / `Staging` / `Local` / `All`) |
| **Project Settings** | AI backends and third-party hooks **for this project only**. | Default AI model (dropdown: Claude / Gemini / GPT)<br>Anthropic API key (masked)<br>Gemini API key (masked)<br>MCP server URI (string)<br>Slack webhook URL (string)<br>Jira token (masked) |
