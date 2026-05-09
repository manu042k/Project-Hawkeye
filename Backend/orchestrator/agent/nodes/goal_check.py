"""GOAL_CHECK node — pure function: parses agent output for completion signals."""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage

if TYPE_CHECKING:
    from orchestrator.models.run_state import AgentState

_GOAL_COMPLETE_RE = re.compile(r"<GOAL_COMPLETE>", re.IGNORECASE)
_GOAL_BLOCKED_RE = re.compile(r"<GOAL_BLOCKED>\s*(.{0,200})", re.IGNORECASE | re.DOTALL)
_CHECKPOINT_RE = re.compile(r"\[S(\w+)\s+complete\]", re.IGNORECASE)


def goal_check_node(state: AgentState) -> dict:
    """Scan the latest AIMessage for completion signals and checkpoint annotations.

    - ``<GOAL_COMPLETE>``  → status=passed, goal_complete=True
    - ``<GOAL_BLOCKED>``   → status=blocked, goal_complete=True
    - ``[S{n} complete]``  → append to completed_checkpoints, advance current_checkpoint

    Pure function — no I/O, never raises.
    """
    # Find the most recent AIMessage text.
    agent_text = ""
    for m in reversed(state["messages"]):
        if isinstance(m, AIMessage):
            if isinstance(m.content, str):
                agent_text = m.content
            elif isinstance(m.content, list):
                agent_text = " ".join(
                    b.get("text", "") if isinstance(b, dict) else str(b)
                    for b in m.content
                )
            break

    # Propagate terminal statuses immediately.
    current_status = state.get("status", "running")
    if current_status in ("timed_out", "errored"):
        return {"goal_complete": True}

    updates: dict = {}

    # --- Checkpoint completions ---
    completed = list(state.get("completed_checkpoints", []))
    test_case = state["test_case"]
    steps = test_case.steps

    new_completions = [f"S{m}" for m in _CHECKPOINT_RE.findall(agent_text)]
    for cp_id in new_completions:
        if cp_id not in completed:
            completed.append(cp_id)

    if new_completions:
        updates["completed_checkpoints"] = completed
        # Advance current_checkpoint to the next uncompleted one.
        if steps:
            all_ids = [cp.id for cp in steps.checkpoints]
            remaining = [cid for cid in all_ids if cid not in completed]
            updates["current_checkpoint"] = remaining[0] if remaining else None

        from orchestrator.trace.collector import TraceCollector  # avoid circular at module level
        # collector is not available here directly; checkpoint update is logged by on_goal_check

    # --- Auto-complete for unguided tests when all content assertions pass ---
    # Requires step >= 3 so we don't complete on the start page before any navigation.
    if test_case.steps is None and state.get("step_number", 0) >= 3 and state.get("page_snapshot"):
        snapshot = state.get("page_snapshot", "")
        text_present_assertions = [
            a for a in test_case.assertions
            if a.type == "content" and a.params.get("check") == "text_present"
        ]
        if text_present_assertions and all(
            a.params.get("text", "") in snapshot
            for a in text_present_assertions
        ):
            updates.update({"goal_complete": True, "status": "passed", "completed_checkpoints": completed})
            return updates

    # --- Goal complete / blocked ---
    if _GOAL_COMPLETE_RE.search(agent_text):
        updates.update({
            "goal_complete": True,
            "status": "passed",
            "completed_checkpoints": completed,
        })
        return updates

    blocked_match = _GOAL_BLOCKED_RE.search(agent_text)
    if blocked_match:
        reason = blocked_match.group(1).strip()[:200]
        updates.update({
            "goal_complete": True,
            "status": "blocked",
            "termination_reason": reason or "Agent signalled GOAL_BLOCKED",
            "completed_checkpoints": completed,
        })
        return updates

    # --- Strict mode: fail if a checkpoint is explicitly marked failed ---
    if steps and steps.mode == "strict":
        if re.search(r"\[S\w+\s+failed\]", agent_text, re.IGNORECASE):
            updates.update({
                "goal_complete": True,
                "status": "failed",
                "termination_reason": "A checkpoint failed in strict mode",
                "completed_checkpoints": completed,
            })
            return updates

    return updates
