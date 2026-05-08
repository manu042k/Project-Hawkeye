from __future__ import annotations
from typing import Literal

from orchestrator.models.run_state import AgentState


def route_after_act(state: AgentState) -> Literal["observe", "error"]:
    """Route after ACT based on error count and status."""
    if state.get("status") in ("timed_out", "errored", "blocked"):
        return "error"
    if state.get("consecutive_errors", 0) >= 3:
        return "error"
    return "observe"
