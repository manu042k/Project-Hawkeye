from typing import Literal
from orchestrator.models.run_state import AgentState


def route_after_observe(state: AgentState) -> Literal["reason", "finalize"]:
    """Short-circuit to finalize if observe already resolved goal_complete."""
    if state.get("goal_complete") or state.get("status") not in (None, "running"):
        return "finalize"
    return "reason"
