from orchestrator.models.run_state import AgentState


def route_after_guard_rails(state: AgentState) -> str:
    return "observe" if state.get("guard_blocked") else "act"
