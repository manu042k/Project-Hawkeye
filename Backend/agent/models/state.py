from __future__ import annotations

from typing import Any, TypedDict

from .schemas import AgentAction, RunStatus, StepEvent


class AgentState(TypedDict):
    objective: str
    start_url: str
    max_steps: int
    step: int
    status: RunStatus
    next_action: AgentAction | None
    last_observation: str
    steps: list[StepEvent]
    final_message: str
    runtime_error: str | None
    scratchpad: list[dict[str, Any]]
