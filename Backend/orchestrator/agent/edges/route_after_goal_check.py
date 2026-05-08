from __future__ import annotations
from typing import Literal

from orchestrator.models.run_state import AgentState


def route_after_goal_check(state: AgentState) -> Literal["finalize", "observe"]:
    """Route after GOAL_CHECK: finalize if done, otherwise keep looping."""
    if state.get("goal_complete") or state.get("status") != "running":
        return "finalize"
    return "observe"
