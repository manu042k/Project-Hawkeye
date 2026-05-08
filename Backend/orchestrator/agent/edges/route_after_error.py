from __future__ import annotations
from typing import Literal

from orchestrator.models.run_state import AgentState


def route_after_error(state: AgentState) -> Literal["observe", "finalize"]:
    """Route after ERROR_HANDLER: finalize if fatal, observe if recoverable."""
    if state.get("status") in ("errored", "timed_out", "blocked"):
        return "finalize"
    return "observe"
