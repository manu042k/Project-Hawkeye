"""Builds the system prompt injected once at the start of each agent run."""
from __future__ import annotations

from orchestrator.models.test_case import TestCase

_UNGUIDED_GOAL_SECTION = """\
## Goal
{goal}

Plan your own action sequence to accomplish the goal. Adapt if the UI differs
from what you expect. You do NOT have predefined checkpoints."""

_GUIDED_GOAL_SECTION = """\
## Goal
{goal}

## Steps (guided checkpoints)
Mode: {mode}

Complete these checkpoints in order (or adapt if the UI requires it):
{checkpoints}

After completing each checkpoint, write "[S<id> complete]" in your response
(e.g. "[S1 complete]") so progress is tracked."""

_CHECKPOINT_ITEM = "- [{id}] {description}\n  Success signal: {success_signal}"

_TOOL_CONVENTIONS = """\
## Tool-use conventions
- Call `browser_snapshot` to read the current accessibility tree before clicking.
  Each interactive element has a `[ref=...]` label — use that exact ref value.
- Take ONE snapshot per step to decide your next action. Do NOT take multiple
  snapshots in a row — each snapshot uses budget. If you cannot see what you
  need, SCROLL DOWN using browser_press_key (key: 'PageDown') and then take
  a fresh snapshot to see what appeared.
- The snapshot may be truncated on large pages — this is normal. Scroll down
  to reveal more content rather than retrying the snapshot with different params.
- After typing in a search box, press Enter via `browser_press_key` (key: 'Enter').
- Dismiss any cookie banners, popups, or login prompts before proceeding.
- When a search results page loads: press PageDown once (browser_press_key, key: 'PageDown'),
  then take a snapshot and click the first product title or link you can see.
- Use `wait_for_stable` when the page may still be loading after navigation.
- Call `report_step_result` to log intermediate assertion outcomes.

## Completing the goal — CRITICAL
- Emit "[S<id> complete]" in the SAME response where you perform the final
  action for that checkpoint. Do not wait for the next step.
- When ALL checkpoints are complete and the overall goal is achieved, emit
  `<GOAL_COMPLETE>` as PLAIN TEXT with NO tool call. Stop browsing immediately.
- For scroll tasks: when "Scrolls on current page" reaches 3 or more, the scroll
  goal is met. Emit `<GOAL_COMPLETE>` as plain text WITHOUT making a tool call.
- If you are stuck and cannot make progress after trying 2 different approaches,
  write `<GOAL_BLOCKED>` followed by a brief explanation.
- If the site forces a login wall that you cannot dismiss or bypass, immediately
  write `<GOAL_BLOCKED>: Site requires login` — do NOT loop trying to close it."""

_CONSTRAINTS_SECTION = """\
## Constraints
- Max steps: {max_steps} (you will be stopped if you exceed this).
- Navigation policy: {navigation_policy}.
  {navigation_policy_detail}
- Forbidden actions: {forbidden_actions}
- Required behaviors: {required_behaviors}"""

_NAVIGATION_POLICY_DETAILS = {
    "interact_only": (
        "Navigate exclusively by clicking links, buttons, and UI elements. "
        "Do NOT use browser_navigate to type URLs directly — discover paths "
        "through the UI as a real user would."
    ),
    "explicit_urls_allowed": (
        "You may use browser_navigate to go directly to URLs mentioned in "
        "the goal or step data fields."
    ),
}

_APP_CONTEXT_SECTION = """\
## Application context
Page type: {page_type} (informs how wait_for_stable behaves).
{app_description}"""

_HINTS_SECTION = """\
## Hints
{hints}"""

_KNOWN_ISSUES_SECTION = """\
## Known issues to ignore
{known_issues}"""


def build_system_prompt(test_case: TestCase) -> str:
    """Build the agent system prompt from a TestCase.

    Deterministic: the same TestCase always produces the same string.
    Produces different sections depending on whether steps are present.
    """
    parts: list[str] = []

    parts.append(
        "You are an expert browser-automation QA agent. "
        "Interact with the browser ONLY through the provided tools."
    )

    # --- Goal / guided steps section ---
    if test_case.steps is None:
        parts.append(
            _UNGUIDED_GOAL_SECTION.format(goal=test_case.goal.strip())
        )
    else:
        checkpoint_lines = "\n".join(
            _CHECKPOINT_ITEM.format(
                id=cp.id,
                description=cp.description,
                success_signal=cp.success_signal,
            )
            for cp in test_case.steps.checkpoints
        )
        parts.append(
            _GUIDED_GOAL_SECTION.format(
                goal=test_case.goal.strip(),
                mode=test_case.steps.mode,
                checkpoints=checkpoint_lines,
            )
        )

    # --- Tool conventions ---
    parts.append(_TOOL_CONVENTIONS)

    # --- Constraints ---
    nav_policy = test_case.constraints.navigation_policy
    forbidden = test_case.constraints.forbidden_actions
    required = test_case.constraints.required_behaviors
    parts.append(
        _CONSTRAINTS_SECTION.format(
            max_steps=test_case.constraints.max_steps,
            navigation_policy=nav_policy,
            navigation_policy_detail=_NAVIGATION_POLICY_DETAILS.get(
                nav_policy, nav_policy
            ),
            forbidden_actions=(
                "\n  - ".join([""] + forbidden) if forbidden else "(none)"
            ),
            required_behaviors=(
                "\n  - ".join([""] + required) if required else "(none)"
            ),
        )
    )

    # --- App context ---
    ctx = test_case.context
    app_desc = ctx.app_description.strip() if ctx.app_description else ""
    parts.append(
        _APP_CONTEXT_SECTION.format(
            page_type=ctx.page_type,
            app_description=app_desc,
        ).strip()
    )

    # --- Hints (optional) ---
    if ctx.hints:
        hints_text = "\n".join(f"- {h}" for h in ctx.hints)
        parts.append(_HINTS_SECTION.format(hints=hints_text))

    # --- Known issues (optional) ---
    if ctx.known_issues:
        issues_text = "\n".join(f"- {i}" for i in ctx.known_issues)
        parts.append(_KNOWN_ISSUES_SECTION.format(known_issues=issues_text))

    return "\n\n".join(parts)
