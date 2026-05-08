from __future__ import annotations
from typing import Literal

from orchestrator.models.run_state import AgentState
from langchain_core.messages import AIMessage


def route_after_reason(state: AgentState) -> Literal["act", "goal_check", "error"]:
    """Route after REASON based on stop_reason and error state."""
    if state.get("status") in ("timed_out", "errored", "blocked"):
        return "goal_check"

    if state.get("last_error") is not None:
        return "error"

    for m in reversed(state["messages"]):
        if isinstance(m, AIMessage):
            if m.tool_calls:
                return "act"
            return "goal_check"

    return "goal_check"
