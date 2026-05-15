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

## Checkpoints — execute ONE AT A TIME in strict order
{checkpoints}

### Checkpoint execution rules (MANDATORY)
1. Read the current checkpoint's Description to know WHAT to do.
2. Perform ONLY the actions needed for that checkpoint.
3. After acting, verify the Success Signal is true before declaring completion.
4. Write "[S<id> complete]" (e.g. "[S1 complete]") in your response the moment
   you confirm the success signal — then immediately move to the next checkpoint.
5. Do NOT repeat or redo a checkpoint you already marked complete.
6. Do NOT navigate back to earlier pages once a checkpoint is done.
7. If a checkpoint's condition is ALREADY MET when you arrive, mark it complete
   immediately and proceed — do not perform its action again."""

_CHECKPOINT_ITEM = """\
[{id}]
  Do: {description}
  ✓ Done when: {success_signal}"""

_EXTRA_DETAILS_SECTION = """\
## Extra context
{extra_details}"""

_TOOL_CONVENTIONS = """\
## Tool-use conventions
- Call `browser_snapshot` to read the current accessibility tree before clicking.
  Each interactive element has a `[ref=...]` label — use that exact ref value.
- Take ONE snapshot per step. If the snapshot is truncated, scroll down with
  browser_press_key (key: 'PageDown') to reveal more — do NOT snapshot again.
- After typing in a search box, use browser_type with submit=True OR follow
  with browser_press_key (key: 'Enter') to submit.
- Dismiss cookie banners, popups, or login prompts before proceeding.
- Use `report_step_result` only to log a checkpoint outcome.
- Do NOT call `browser_navigate` to go back to a page you already left.

## Completing the goal — CRITICAL
- Write "[S<id> complete]" in the SAME response as the final action for that
  checkpoint (e.g. "[S1 complete]"). Do not wait for the next observe step.
- If a checkpoint's success signal is already satisfied on arrival, write
  "[S<id> complete]" immediately without repeating any action.
- When ALL checkpoints are done and the overall goal is achieved, emit
  `<GOAL_COMPLETE>` as PLAIN TEXT with NO tool call.
- For scroll tasks: track "Scrolls on current page" shown in your context.
  When it reaches the required count, emit `<GOAL_COMPLETE>` immediately.
- If stuck after 2 different attempts, write `<GOAL_BLOCKED>` + explanation.
- If a login wall cannot be dismissed, write `<GOAL_BLOCKED>: Site requires login`."""

_CONSTRAINTS_SECTION = """\
## Constraints
- Max steps: {max_steps} (you will be stopped if you exceed this)."""

_APP_CONTEXT_SECTION = """\
## Application context
Page type: {page_type} (informs how wait_for_stable behaves).
{app_description}"""


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

    goal = test_case.goal
    steps = goal.steps

    # --- Goal / guided steps section ---
    if steps is None or not steps.checkpoints:
        parts.append(
            _UNGUIDED_GOAL_SECTION.format(goal=goal.objective.strip())
        )
    else:
        checkpoint_lines = "\n".join(
            _CHECKPOINT_ITEM.format(
                id=cp.id,
                description=cp.description,
                success_signal=cp.success_signal,
            )
            for cp in steps.checkpoints
        )
        parts.append(
            _GUIDED_GOAL_SECTION.format(
                goal=goal.objective.strip(),
                checkpoints=checkpoint_lines,
            )
        )

    # --- Extra details (optional) ---
    if goal.extra_details:
        parts.append(_EXTRA_DETAILS_SECTION.format(extra_details=goal.extra_details.strip()))

    # --- Tool conventions ---
    parts.append(_TOOL_CONVENTIONS)

    # --- Constraints ---
    constraints = goal.constraints
    parts.append(_CONSTRAINTS_SECTION.format(max_steps=constraints.max_steps))

    # --- App context ---
    target = test_case.target
    app_desc = target.app_description.strip() if target.app_description else ""
    parts.append(
        _APP_CONTEXT_SECTION.format(
            page_type=target.page_type,
            app_description=app_desc,
        ).strip()
    )

    return "\n\n".join(parts)
