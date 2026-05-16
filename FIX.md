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
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
| **Severity** | Critical |
| **Where** | `Frontend/hawkeye-web/src/app/app/(workspace)/runs/new/page.tsx` |
| **Pages** | `/app/runs/new` |

**What:** Shows "No test cases in this project — create a test case first" even though test cases exist, because the test-cases fetch 403s silently and the combobox collapses to an empty state. Run creation is completely blocked.

**Fix:** Distinguish between "empty project" and "fetch error" in the UI. Show "You don't have access to test cases in this project" when the fetch fails with 403, not the empty-state prompt.

---

### BUG-04 — Password reset UI exists but backend endpoint does not

| | |
|---|---|
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
| **Severity** | High |
| **Where** | `Frontend/hawkeye-web/src/app/auth/login/page.tsx` — `onSubmit` |

**What:** After successful credentials login, the user always lands on `/app` regardless of the `callbackUrl` query param. `safePostLoginRedirect()` correctly validates the path but the workspace layout drops to project selector before Zustand state is populated.

**Fix:** After login redirect, pre-populate the Zustand project store from the URL (tied to BUG-08 fix), or store the intended destination in session and resume it after project selection.

---

### BUG-10 — Runs endpoint does not enforce project membership

| | |
|---|---|
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
| **Severity** | High |
| **Where** | `Frontend/hawkeye-web/src/lib/api/hooks.ts` — `useProjectRuns` |

**What:** `GET /api/projects/{id}/runs` fires 5+ times within seconds on a single page load. Confirmed on `/app/dashboard` and `/app/runs/new`. Multiple hook instances mount independently with no deduplication.

**Fix:** Use a shared SWR deduplication key or move polling into a single Zustand action with a `setInterval`. Alternatively, use React Query's `staleTime` to prevent refetches within a window.

---

### BUG-13 — Amazon test case missing from the listing (10 uploaded, 9 shown)

| | |
|---|---|
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
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
| **Status** | Open |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(global-hub)/page.tsx` — project card component |
| **Pages** | `/app` |

**What:** The "Project settings" button (`ref_53`) is nested inside the outer clickable project card (`ref_52`). This is invalid HTML — browsers may suppress inner button clicks, keyboard navigation is broken, and screen readers report ambiguous roles.

**Fix:** Convert the outer card to `<div role="button" tabIndex={0}>` and absolutely-position the "Project settings" action button outside the card's interactive region.

---

### BUG-18 — Invalid project ID returns 200 empty instead of 404

| | |
|---|---|
| **Status** | Open |
| **Severity** | Medium |
| **Where** | `Backend/api/routes/test_cases_crud.py` — `GET /api/projects/{id}/test-cases` |

**What:** `GET /api/projects/not-a-real-id/test-cases` returns `{"test_cases": [], "total": 0}` with status `200` instead of `404 Not Found`.

**Fix:** Validate project existence at the start of the handler and raise `HTTPException(404)` if not found.

---

### BUG-19 — Developer disclaimer visible in production billing UI

| | |
|---|---|
| **Status** | Open |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(global-hub)/billing/page.tsx` |
| **Pages** | `/app/billing` |

**What:** The text "Figures are illustrative until usage metering is connected to your backend." is rendered in production UI as a visible paragraph — a developer note that should never ship to users.

**Fix:** Remove or gate it: `{process.env.NODE_ENV === 'development' && <DevNote>...</DevNote>}`.

---

### BUG-20 — Default run model is an obscure NVIDIA NIM model

| | |
|---|---|
| **Status** | Open |
| **Severity** | Medium |
| **Where** | `Frontend/hawkeye-web/src/app/app/(workspace)/runs/new/page.tsx` |
| **Pages** | `/app/runs/new` |

**What:** The model combobox defaults to `nvidia:moonshotai/kimi-k2.6`. Most users will not have an NVIDIA API key configured, making the default selection non-functional on first use.

**Fix:** Default to `openrouter:openai/gpt-4o-mini` or whatever model is most likely to be configured based on available env keys.

---

## Summary

| Severity | Count | Fixed | Open |
|---|---|---|---|
| 🔴 Critical | 7 | 0 | 7 |
| 🟠 High | 6 | 0 | 6 |
| 🟡 Medium | 7 | 0 | 7 |
| **Total** | **20** | **0** | **20** |

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
