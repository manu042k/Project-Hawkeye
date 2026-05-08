from __future__ import annotations
from typing import Literal

from orchestrator.models.run_state import AgentState


def route_after_act(state: AgentState) -> Literal["goal_check", "error"]:
    """Route after ACT through goal_check so completion markers are checked every step."""
    if state.get("status") in ("timed_out", "errored", "blocked"):
        return "error"
    if state.get("consecutive_errors", 0) >= 3:
        return "error"
    return "goal_check"
