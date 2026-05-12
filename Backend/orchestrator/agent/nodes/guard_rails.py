"""Guard-rails node — no configurable policies in current schema; passes through."""
from __future__ import annotations

from orchestrator.models.run_state import AgentState


async def guard_rails_node(state: AgentState) -> dict:
    return {"guard_blocked": False}
