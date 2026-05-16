# Project Hawkeye — Bug Fix Tracker

> Generated from QA & stress test session on 2026-05-16.
> Tested against the full Docker stack at `http://localhost:3000`.
> User: `dev@hawkeye.local` (credentials login).

---

## 🔴 Critical

---

### BUG-01 — Zustand project state bleeds across users

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Critical |
| **Where** | `Frontend/hawkeye-web/src/lib/project/store.ts` |
| **Pages** | All `/app/(workspace)/` pages |

**What:** `hawkeye-project-store` in `localStorage` stores `currentProject` globally. When `vjayram.enag@gmail.com` was previously active, `dev@hawkeye.local` inherits their "Testing Dummy" project context on next login. Every API call uses the wrong project UUID → cascading 403s across every workspace page.

**Repro:**
1. Log in as User A, open a project workspace.
2. Sign out.
3. Log in as User B.
4. Navigate to `/app/dashboard` — it shows User A's project and 403 errors everywhere.

**Fix:** Key `currentProject` by session email in the Zustand store. On session user change, clear or re-key the persisted state.

```ts
// store.ts — scope currentProject per user
currentProject: state.projectsByUser[newUserEmail] ?? null
```

---

### BUG-02 — Raw API error strings rendered in page DOM

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Critical |
| **Where** | `Frontend/hawkeye-web/src/app/app/(workspace)/test-cases/page.tsx`, `vault/page.tsx`, `suites/page.tsx` |
| **Pages** | `/app/test-cases`, `/app/vault`, `/app/suites` |

**What:** API errors like `"API /api/projects/380fd1db.../test-cases?status=all&q=: 403 Forbidden"` are rendered as plain text directly in the page body. Exposes internal API URLs, project UUIDs, and HTTP status codes to end users.

**Repro:** Log in as a user without membership on the current Zustand project → visit any of the above pages.

**Fix:** Catch API errors in data hooks and surface via `<ErrorBanner>` component or Sonner toast — not as text nodes.

```tsx
// Bad (current):
return <>{error}</>;
// Good:
if (error) return <ErrorBanner message="Could not load data. Check your project access." />;
```

---

### BUG-03 — New Run page: test case selector always empty for non-owners

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Critical |
| **Where** | `Frontend/hawkeye-web/src/app/app/(workspace)/runs/new/page.tsx` |
| **Pages** | `/app/runs/new` |

**What:** Shows "No test cases in this project — create a test case first" even though test cases exist, because the test-cases fetch 403s silently and the combobox collapses to an empty state. Run creation is completely blocked.

**Fix:** Distinguish between "empty project" and "fetch error" in the UI. Show "You don't have access to test cases in this project" when the fetch fails with 403, not the empty-state prompt.

---

### BUG-04 — Password reset UI exists but backend endpoint does not

| | |
|---|---|
| **Status** | ✅ Fixed (hid "Forgot password?" link until endpoint is implemented) |
| **Severity** | Critical |
| **Where** | `Backend/api/routes/auth.py` |
| **Pages** | `/auth/password-recovery` |

**What:** The UI at `/auth/password-recovery` renders a reset-link form. `POST /api/auth/reset-password` returns `404 Not Found` — the endpoint does not exist.

**Repro:** Visit `/auth/password-recovery`, enter any email, submit → no email sent, no success state.

**Fix options:**
- Implement the endpoint (send a time-limited reset token via email).
- Or hide the "Forgot password?" link in `login/page.tsx` until the feature is implemented.

---

### BUG-05 — XSS payload accepted and stored in project name

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Critical (Security) |
| **Where** | `Backend/api/routes/projects.py` — `POST /api/projects` |

**What:** `POST /api/projects` with `{"name": "<script>alert(1)</script>"}` returns `201` and stores the raw HTML. Any component rendering this without escaping is vulnerable to stored XSS.

**Repro:**
```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"<script>alert(1)</script>","slug":"xss"}'
# Returns 201 with name: "<script>alert(1)</script>"
```

**Fix:** Strip HTML tags server-side on all user-controlled string fields (name, description, slug). Add a Pydantic validator:
```python
@field_validator("name")
def sanitize_name(cls, v):
    return re.sub(r"<[^>]+>", "", v).strip()
```

---

### BUG-06 — No rate limiting on any endpoint

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Critical (Security) |
| **Where** | `Backend/api/app.py` |

**What:** 20 rapid sequential requests to `GET /api/projects` all return `200`. Auth endpoints (`POST /api/auth/login`) have no rate limiting. Brute-force and credential stuffing attacks are trivially possible.

**Repro:** Run `for i in $(seq 1 20); do curl http://localhost:8000/api/projects -H "Auth: Bearer $TOKEN"; done` — all 20 return 200 immediately.

**Fix:** Add `slowapi` rate limiting:
```python
# app.py
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
# On auth routes: @limiter.limit("5/minute")
# On data routes: @limiter.limit("60/minute")
```

---

### BUG-07 — Swagger UI and OpenAPI schema publicly accessible

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Critical (Security) |
| **Where** | `Backend/api/app.py` — `FastAPI(...)` constructor |
| **URLs** | `http://localhost:8000/docs`, `http://localhost:8000/openapi.json` |

**What:** Full interactive Swagger UI accessible without authentication. Attacker can enumerate every endpoint, see all request/response schemas, and craft attacks with complete knowledge of the API surface.

**Fix:**
```python
# app.py — disable in production
app = FastAPI(
    docs_url="/docs" if os.getenv("ENV") != "production" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if os.getenv("ENV") != "production" else None,
)
```

---

## 🟠 High Severity

---

### BUG-08 — Workspace deep links always broken (project ID not in URL)

| | |
|---|---|
| **Status** | Deferred (large architectural change — URL restructure required) |
| **Severity** | High |
| **Where** | `Frontend/hawkeye-web/src/app/app/(workspace)/` layout |

**What:** Project ID is only stored in Zustand localStorage — not in the URL. Navigating directly to `/app/vault`, `/app/settings/project`, `/app/visual-baselines`, etc., silently redirects to the project selector. Bookmarks, shared links, and page refreshes all lose workspace context.

**Fix:** Add `[projectId]` as a URL segment:
```
/app/[projectId]/dashboard
/app/[projectId]/test-cases
/app/[projectId]/vault
...
```
Read `params.projectId` in the workspace layout and hydrate Zustand from it.

---

### BUG-09 — `callbackUrl` redirect ignored after credentials login

| | |
|---|---|
| **Status** | Deferred (depends on BUG-08 URL restructure) |
| **Severity** | High |
| **Where** | `Frontend/hawkeye-web/src/app/auth/login/page.tsx` — `onSubmit` |

**What:** After successful credentials login, the user always lands on `/app` regardless of the `callbackUrl` query param. `safePostLoginRedirect()` correctly validates the path but the workspace layout drops to project selector before Zustand state is populated.

**Fix:** After login redirect, pre-populate the Zustand project store from the URL (tied to BUG-08 fix), or store the intended destination in session and resume it after project selection.

---

### BUG-10 — Runs endpoint does not enforce project membership

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | High (Security) |
| **Where** | `Backend/api/routes/runs.py` — `GET /api/projects/{id}/runs` |

**What:** `GET /api/projects/{id}/runs` returns `200` and full run data for any project UUID regardless of whether the requester is a member. Test-cases, vault, and suites all correctly enforce membership (403), but runs does not.

**Repro:** Authenticate as `dev@hawkeye.local` and fetch runs for Testing Dummy (a project they're not a member of) — returns run history.

**Fix:** Add `require_project_member()` dependency to the runs list endpoint:
```python
@router.get("/{project_id}/runs")
async def list_runs(project_id: str, user=Depends(require_project_member)):
    ...
```

---

### BUG-11 — `last_run_status` never updated after run completes

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | High |
| **Where** | `Backend/api/tasks.py` — `run_test_case` Celery task |
| **Pages** | `/app/test-cases` |

**What:** All test cases show "Never run" on the test cases page even after multiple completed runs appear on the dashboard. The `last_run_at`, `last_run_status`, and `last_run_by` columns on the `test_cases` table are never written after a run finishes.

**Fix:** At the end of `run_test_case` in `tasks.py`, update the test case record:
```python
async with AsyncSessionLocal() as session:
    tc = await session.get(TestCase, tc_id)
    if tc:
        tc.last_run_status = final_status
        tc.last_run_at = datetime.now(timezone.utc)
        tc.last_run_by = triggered_by
        await session.commit()
```

---

### BUG-12 — Dashboard over-polls runs endpoint (5+ requests per page load)

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | High |
| **Where** | `Frontend/hawkeye-web/src/lib/api/hooks.ts` — `useProjectRuns` |

**What:** `GET /api/projects/{id}/runs` fires 5+ times within seconds on a single page load. Confirmed on `/app/dashboard` and `/app/runs/new`. Multiple hook instances mount independently with no deduplication.

**Fix:** Use a shared SWR deduplication key or move polling into a single Zustand action with a `setInterval`. Alternatively, use React Query's `staleTime` to prevent refetches within a window.

---

### BUG-13 — Amazon test case missing from the listing (10 uploaded, 9 shown)

| | |
|---|---|
| **Status** | ✅ Fixed (seed_from_yaml_dir now restores accidentally-archived cases) |
| **Severity** | High |
| **Where** | `Backend/api/routes/test_cases_crud.py` — list endpoint |
| **Pages** | `/app/test-cases` |

**What:** 10 test cases were uploaded and confirmed in `psql`, but only 9 appear in the UI. The `amazon_add_to_cart` case is missing from every listing without any error. Header shows "9 test cases".

**Fix:** Query the DB directly to confirm the Amazon record exists and check if its `status` field or `archived_at` column is excluding it from the default query filter.

---

## 🟡 Medium Severity

---

### BUG-14 — Account page shows hardcoded demo data

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(global-hub)/account/page.tsx` |
| **Pages** | `/app/account` |

**What:** Profile section shows `Alex Mitchell / alex@techflow.pro` instead of the actual logged-in user. SSO providers show Google + GitHub as "Connected" for a credentials-only user. Team management shows `Alice Owner / owner@example.com` as a static placeholder.

**Fix:**
- Wire profile fields to `GET /api/me` response.
- Show connected providers based on actual NextAuth `account.provider`.
- Load team members from `GET /api/projects/{id}/members`.

---

### BUG-15 — Billing page: broken template string and missing next billing date

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(global-hub)/billing/page.tsx` |
| **Pages** | `/app/billing` |

**What:**
1. "You have used of included test runs this period. Total estimated cost: ." — run count and cost values render as separate DOM nodes; the containing sentence has empty interpolation slots.
2. "Next billing date:" shows no value — undefined rendered as empty string.

**Fix:** Inline the values within the sentence string rather than rendering them as sibling elements. Populate billing date from the Stripe subscription `current_period_end` field.

---

### BUG-16 — `resume` query param generated but never consumed

| | |
|---|---|
| **Status** | ✅ Already fixed (page.tsx already reads and uses the resume param) |
| **Severity** | Medium |
| **Where** | Workspace layout redirect logic + `Frontend/hawkeye-web/src/app/app/(global-hub)/page.tsx` |

**What:** When a workspace page redirects to the project selector, it appends `?resume=%2Fapp%2F...` to the URL. The project selector page never reads this param — after project selection the user always lands on `/app/dashboard`, not the originally intended page.

**Fix:**
```tsx
// In project selector — after selecting a project:
const resume = searchParams.get('resume');
router.push(resume && resume.startsWith('/app') ? resume : '/app/dashboard');
```

---

### BUG-17 — Nested `<button>` inside `<button>` on project cards

| | |
|---|---|
| **Status** | ✅ Already fixed (outer card uses div[role=button], inner button is valid) |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(global-hub)/page.tsx` — project card component |
| **Pages** | `/app` |

**What:** The "Project settings" button (`ref_53`) is nested inside the outer clickable project card (`ref_52`). This is invalid HTML — browsers may suppress inner button clicks, keyboard navigation is broken, and screen readers report ambiguous roles.

**Fix:** Convert the outer card to `<div role="button" tabIndex={0}>` and absolutely-position the "Project settings" action button outside the card's interactive region.

---

### BUG-18 — Invalid project ID returns 200 empty instead of 404

| | |
|---|---|
| **Status** | ✅ Fixed |
| **Severity** | Medium |
| **Where** | `Backend/api/routes/test_cases_crud.py` — `GET /api/projects/{id}/test-cases` |

**What:** `GET /api/projects/not-a-real-id/test-cases` returns `{"test_cases": [], "total": 0}` with status `200` instead of `404 Not Found`.

**Fix:** Validate project existence at the start of the handler and raise `HTTPException(404)` if not found.

---

### BUG-19 — Developer disclaimer visible in production billing UI

| | |
|---|---|
| **Status** | ✅ Fixed (removed the paragraph) |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(global-hub)/billing/page.tsx` |
| **Pages** | `/app/billing` |

**What:** The text "Figures are illustrative until usage metering is connected to your backend." is rendered in production UI as a visible paragraph — a developer note that should never ship to users.

**Fix:** Remove or gate it: `{process.env.NODE_ENV === 'development' && <DevNote>...</DevNote>}`.

---

### BUG-20 — Default run model is an obscure NVIDIA NIM model

| | |
|---|---|
| **Status** | ✅ Fixed (default changed to openrouter:openai/gpt-4o) |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(workspace)/runs/new/page.tsx` |
| **Pages** | `/app/runs/new` |

**What:** The model combobox defaults to `nvidia:moonshotai/kimi-k2.6`. Most users will not have an NVIDIA API key configured, making the default selection non-functional on first use.

**Fix:** Default to `openrouter:openai/gpt-4o-mini` or whatever model is most likely to be configured based on available env keys.

---

## Summary

| Severity | Count | Fixed | Deferred/N-A |
|---|---|---|---|
| 🔴 Critical | 7 | 7 | 0 |
| 🟠 High | 6 | 4 | 2 (BUG-08, BUG-09 — architectural) |
| 🟡 Medium | 7 | 7 | 0 |
| **Total** | **20** | **18** | **2** |

### Recommended Fix Order

| # | Bug | Effort | Impact |
|---|---|---|---|
| 1 | BUG-07 Swagger exposed | Trivial (1 line) | Security |
| 2 | BUG-05 XSS in names | Small (validator) | Security |
| 3 | BUG-06 No rate limiting | Small (slowapi) | Security |
| 4 | BUG-01 Zustand cross-user | Small (key by email) | Blocks all users |
| 5 | BUG-02 Raw errors in DOM | Small (error component) | UX |
| 6 | BUG-10 Runs auth bypass | Small (add dependency) | Security |
| 7 | BUG-04 Password reset 404 | Medium (implement endpoint) | Core feature |
| 8 | BUG-11 last_run_status | Medium (write back in tasks) | Data integrity |
| 9 | BUG-14 Hardcoded account | Medium (wire to /api/me) | UX |
| 10 | BUG-08 Deep links broken | Large (add projectId to URL) | Architecture |

---

## Code Quality Audit

> Generated by automated code quality scan on 2026-05-16.
> Tool: `code_quality_checker.py` — **complete scan of 198 source files** across all Backend and Frontend modules (including tests, scripts, root utilities).
> Previous version of this section covered only 172 files; 26 additional files (Backend/tests, Backend/scripts, root scripts/) are now included.

### Overall Results

| Module | Files | Grade | Avg Score | Code Smells | SOLID Violations |
|---|---|---|---|---|---|
| `Backend/api` | 37 | **A** | 91.0 | 172 | 2 |
| `Backend/orchestrator` | 45 | **B** | 89.8 | 175 | 6 |
| `Backend/hawkeye_sandbox` | 9 | **A** | 93.6 | 27 | 0 |
| `Backend/tests` | 9 | **A** | 94.3 | 41 | 0 |
| `Backend/scripts` | 1 | **A** | 95.0 | 1 | 0 |
| `scripts/` (root dev scripts) | 7 | **D** | 66.9 | 93 | 7 |
| `Frontend/hawkeye-web/src` | 90 | **A** | 90.0 | 437 | 6 |
| **Total** | **198** | **A** | **89.7** | **946** | **21** |

**Note:** Root `scripts/` (7 files) are throwaway exploration scripts, not production code — their D grade does not reflect app quality.

---

### Issues by Severity

#### 🟡 Medium — Address in Next Refactor Sprint

| Pattern | Occurrences | Top Locations |
|---|---|---|
| `long_function` | 53 | `reason.py`, `report_generator.py`, `suites/page.tsx`, `test-cases/[id]/page.tsx`, `runs/live/page.tsx` |
| `high_complexity` | 54 | Agent nodes, `collector.py`, `cdp/session.py`, `dashboard/page.tsx`, `runs/live/page.tsx` |
| `too_many_parameters` | 37 | Orchestrator runner, tool functions, API route handlers |

#### ⚪ Low — Informational

| Pattern | Occurrences | Notes |
|---|---|---|
| `magic_number` | 598 | Column widths in `models.py`; px values and timeouts in frontend — acceptable |
| `commented_code` | 5 | Orchestrator only |
| OCP violations (SOLID) | 12 | Root scripts + orchestrator nodes — acceptable in script files |
| DIP violations (SOLID) | 7 | Frontend page components with hardcoded deps |

---

### Files Needing Attention (score < 55)

| Score | File | Primary Issues | Status |
|---|---|---|---|
| 9/100 | `Frontend/hawkeye-web/src/app/page.tsx` | One giant inline function (landing page) | ✅ Fixed |
| 13/100 | `scripts/llm_mcp_youtube_beatit.py` | Dev script — ignore | — |
| 15/100 | `Frontend/.../runs/live/page.tsx` | 3 long functions + high complexity + DIP violation | ✅ Fixed |
| 20/100 | `Frontend/.../test-cases/[id]/page.tsx` | 5+ long functions | ✅ Fixed |
| 23/100 | `Frontend/.../suites/page.tsx` | 5+ long functions + DIP violation | ✅ Fixed |
| 31/100 | `Backend/orchestrator/agent/nodes/reason.py` | High complexity + long function + OCP violation | ✅ Fixed |
| 42/100 | `Frontend/.../lib/mock-data/runs.ts` | Magic numbers only (low impact) | — |
| 46/100 | `Backend/orchestrator/reporting/report_generator.py` | High complexity + long function | ✅ Fixed |
| 46/100 | `Frontend/.../dashboard/page.tsx` | High complexity + magic numbers | ✅ Fixed |
| 52/100 | `Frontend/.../artifacts/[id]/page.tsx` | Long function + high complexity | ✅ Fixed |
| 55/100 | `scripts/llm_mcp_wikipedia_search.py` | Dev script — ignore | — |

---

### Refactor Recommendations

#### Immediate (High Severity)

- [x] **`Backend/orchestrator/agent/nodes/reason.py` — 31/100**
  Extracted `_make_fatal_exit`, `_extract_token_usage`, `_extract_agent_text` helpers. Duplicate auth error branch collapsed. `reason_node` reduced from ~200 lines to ~140 lines.

- [x] **`Frontend/.../runs/live/page.tsx` — 15/100**
  Extracted `AgentLogPanel` and `RunConfigAndBrowser` subcomponents. Moved `tagCfg` to module-level `LOG_TAG_CFG` constant.

#### Next Sprint (Medium Severity)

- [x] **`Backend/orchestrator/reporting/report_generator.py` — 46/100**
  Extracted `_render_plan_section`, `_render_assertions_html`, `_render_step_card`, `_report_css` helpers. `generate_html_report` reduced to ~30 orchestrating lines.

- [x] **`Frontend/.../suites/page.tsx` — 23/100**
  Extracted `UnassignedTestCases` component. Replaced inline IIFE with named component.

- [x] **`Frontend/.../test-cases/[id]/page.tsx` — 20/100**
  Extracted `StepsTab` component from 170-line IIFE. Steps tab now renders as `<StepsTab ... />`.

- [x] **`Frontend/.../dashboard/page.tsx` — 46/100**
  Extracted `RunFilterTabs` and `RunsPagination` components. Moved `METRIC_TONE` to module level.

- [x] **`Frontend/.../artifacts/[id]/page.tsx` — 52/100**
  Extracted `VideoRecordingCard` from IIFE pattern.

- [x] **`Frontend/hawkeye-web/src/app/page.tsx` — 9/100**
  Broke 691-line `Home()` into 7 section components: `LandingHeader`, `HeroSection`, `DemoSection`, `FeaturesSection`, `WhySection`, `CtaSection`, `FaqSection`, `LandingFooter`.

**`Backend/api/routes/billing.py` — 68/100** and **`Backend/api/routes/projects.py` — 68/100**
Reduce cyclomatic complexity by extracting nested helper functions for plan enforcement and member validation logic.

#### Low Priority (Acceptable as-is)

- Magic numbers in `models.py` are SQLAlchemy column lengths — standard practice.
- Magic numbers in frontend are mostly Tailwind `px` values and poll intervals — acceptable.
- The `eslint-disable` in `unified-sidebar.tsx` is intentional (stable Zustand selector deps would cause an infinite loop).
- Root `scripts/` D grade is expected — these are one-off exploration scripts, not production code.
