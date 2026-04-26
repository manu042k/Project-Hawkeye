from __future__ import annotations

from collections.abc import Callable
from typing import Any

from langgraph.graph import END, StateGraph

from ..models.schemas import AgentAction, StepEvent
from ..models.state import AgentState


ToolExecutor = Callable[[AgentAction], tuple[bool, str, dict[str, Any]]]
ActionPlanner = Callable[[str, str, str, int, int, list[dict[str, Any]]], AgentAction]


class AgentWorkflow:
    def __init__(self, planner: ActionPlanner, tool_executor: ToolExecutor) -> None:
        self._planner = planner
        self._tool_executor = tool_executor
        graph = StateGraph(AgentState)
        graph.add_node("think", self._think)
        graph.add_node("act", self._act)
        graph.add_node("decide", self._decide)
        graph.set_entry_point("think")
        graph.add_edge("think", "act")
        graph.add_edge("act", "decide")
        graph.add_conditional_edges("decide", self._route, {"continue": "think", "end": END})
        self._compiled = graph.compile()

    def run(self, state: AgentState) -> AgentState:
        return self._compiled.invoke(state)

    def _think(self, state: AgentState) -> dict[str, Any]:
        action = self._planner(
            state["objective"],
            state["start_url"],
            state["last_observation"],
            state["step"] + 1,
            state["max_steps"],
            state["scratchpad"],
        )
        return {"next_action": action}

    def _act(self, state: AgentState) -> dict[str, Any]:
        action = state["next_action"]
        if action is None:
            return {"status": "runtime_error", "runtime_error": "Planner returned no action."}

        if action.type == "complete":
            return {"status": "success", "final_message": action.result or "Objective completed."}
        if action.type == "fail":
            return {"status": "failed", "final_message": action.result or "Planner marked run as failed."}

        ok, observation, data = self._tool_executor(action)
        context_observation = f"url={data.get('url', '')} | {observation}".strip()
        event = StepEvent(
            step=state["step"] + 1,
            action=action,
            ok=ok,
            observation=observation,
            data=data,
        )
        scratch_entry = {
            "step": event.step,
            "action": action.model_dump(),
            "ok": ok,
            "observation": observation,
        }
        return {
            "step": state["step"] + 1,
            "steps": [*state["steps"], event],
            "last_observation": context_observation,
            "scratchpad": [*state["scratchpad"], scratch_entry],
        }

    def _decide(self, state: AgentState) -> dict[str, Any]:
        if state["status"] not in ("running",):
            return {}
        if state["step"] >= state["max_steps"]:
            return {"status": "max_steps", "final_message": f"Stopped at max_steps={state['max_steps']}."}
        return {}

    @staticmethod
    def _route(state: AgentState) -> str:
        if state["status"] == "running":
            return "continue"
        return "end"
