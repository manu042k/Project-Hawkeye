"""Unit tests for the four edge routing functions."""
from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from orchestrator.agent.edges.route_after_reason import route_after_reason
from orchestrator.agent.edges.route_after_act import route_after_act
from orchestrator.agent.edges.route_after_goal_check import route_after_goal_check
from orchestrator.agent.edges.route_after_error import route_after_error
from orchestrator.models.run_state import ErrorInfo


def _state(**kwargs) -> dict:
    """Build a minimal AgentState-like dict for testing edge functions."""
    defaults = {
        "messages": [],
        "status": "running",
        "goal_complete": False,
        "consecutive_errors": 0,
        "last_error": None,
        "error_history": [],
        "traces": [],
    }
    defaults.update(kwargs)
    return defaults


class TestRouteAfterReason:
    def test_tool_use_routes_to_act(self):
        ai = AIMessage(content="", tool_calls=[{"name": "browser_click", "args": {}, "id": "c1"}])
        state = _state(messages=[ai])
        assert route_after_reason(state) == "act"

    def test_end_turn_routes_to_goal_check(self):
        ai = AIMessage(content="I am done", tool_calls=[])
        state = _state(messages=[ai])
        assert route_after_reason(state) == "goal_check"

    def test_error_set_routes_to_error(self):
        ai = AIMessage(content="", tool_calls=[])
        err = ErrorInfo(error_type="llm_rate_limit", message="429", step_number=1)
        state = _state(messages=[ai], last_error=err)
        assert route_after_reason(state) == "error"

    def test_timed_out_routes_to_goal_check(self):
        ai = AIMessage(content="", tool_calls=[])
        state = _state(messages=[ai], status="timed_out")
        assert route_after_reason(state) == "goal_check"

    def test_errored_routes_to_goal_check(self):
        ai = AIMessage(content="", tool_calls=[])
        state = _state(messages=[ai], status="errored")
        assert route_after_reason(state) == "goal_check"

    def test_blocked_routes_to_goal_check(self):
        ai = AIMessage(content="<GOAL_BLOCKED>", tool_calls=[])
        state = _state(messages=[ai], status="blocked")
        assert route_after_reason(state) == "goal_check"

    def test_no_messages_routes_to_goal_check(self):
        state = _state(messages=[])
        assert route_after_reason(state) == "goal_check"


class TestRouteAfterAct:
    def test_no_errors_routes_to_observe(self):
        state = _state(consecutive_errors=0)
        assert route_after_act(state) == "observe"

    def test_consecutive_errors_3_routes_to_error(self):
        state = _state(consecutive_errors=3)
        assert route_after_act(state) == "error"

    def test_consecutive_errors_above_3_routes_to_error(self):
        state = _state(consecutive_errors=5)
        assert route_after_act(state) == "error"

    def test_timed_out_routes_to_error(self):
        state = _state(status="timed_out", consecutive_errors=0)
        assert route_after_act(state) == "error"

    def test_errored_routes_to_error(self):
        state = _state(status="errored", consecutive_errors=0)
        assert route_after_act(state) == "error"

    def test_exactly_2_errors_still_routes_to_observe(self):
        state = _state(consecutive_errors=2)
        assert route_after_act(state) == "observe"


class TestRouteAfterGoalCheck:
    def test_goal_complete_routes_to_finalize(self):
        state = _state(goal_complete=True, status="passed")
        assert route_after_goal_check(state) == "finalize"

    def test_errored_routes_to_finalize(self):
        state = _state(goal_complete=False, status="errored")
        assert route_after_goal_check(state) == "finalize"

    def test_timed_out_routes_to_finalize(self):
        state = _state(goal_complete=False, status="timed_out")
        assert route_after_goal_check(state) == "finalize"

    def test_blocked_routes_to_finalize(self):
        state = _state(goal_complete=True, status="blocked")
        assert route_after_goal_check(state) == "finalize"

    def test_still_running_routes_to_observe(self):
        state = _state(goal_complete=False, status="running")
        assert route_after_goal_check(state) == "observe"


class TestRouteAfterError:
    def test_errored_routes_to_finalize(self):
        state = _state(status="errored")
        assert route_after_error(state) == "finalize"

    def test_timed_out_routes_to_finalize(self):
        state = _state(status="timed_out")
        assert route_after_error(state) == "finalize"

    def test_blocked_routes_to_finalize(self):
        state = _state(status="blocked")
        assert route_after_error(state) == "finalize"

    def test_running_recoverable_routes_to_observe(self):
        state = _state(status="running", consecutive_errors=1)
        assert route_after_error(state) == "observe"

    def test_running_zero_errors_routes_to_observe(self):
        state = _state(status="running", consecutive_errors=0)
        assert route_after_error(state) == "observe"
