"""Guard-rails node: enforces navigation_policy and forbidden_actions before each tool call."""
from __future__ import annotations
import logging
from langchain_core.messages import ToolMessage
from orchestrator.models.run_state import AgentState

logger = logging.getLogger(__name__)


async def guard_rails_node(state: AgentState) -> dict:
    messages = state.get("messages", [])
    test_case = state.get("test_case")
    if not messages or not test_case:
        return {"guard_blocked": False}

    last = messages[-1]
    tool_calls = getattr(last, "tool_calls", None)
    if not tool_calls:
        return {"guard_blocked": False}

    constraints = test_case.constraints
    policy = constraints.navigation_policy
    forbidden = [f.lower() for f in (constraints.forbidden_actions or [])]

    for tc in tool_calls:
        name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
        args = tc.get("args", {}) if isinstance(tc, dict) else getattr(tc, "args", {})
        tc_id = tc.get("id", "guard") if isinstance(tc, dict) else getattr(tc, "id", "guard")

        # Navigation policy check
        if name == "browser_navigate" and policy == "interact_only":
            url = args.get("url", "")
            if url and url != test_case.target.url:
                logger.info("Guard-rails blocked browser_navigate to %s (policy=interact_only)", url)
                correction = ToolMessage(
                    content="Navigation blocked: navigation_policy is 'interact_only'. "
                            "You must navigate using UI elements (clicks, links), not direct URLs.",
                    tool_call_id=tc_id,
                )
                return {
                    "guard_blocked": True,
                    "messages": messages + [correction],
                }

        # Forbidden actions check
        call_text = f"{name} {str(args)}".lower()
        for forbidden_action in forbidden:
            if forbidden_action in call_text:
                logger.info("Guard-rails blocked forbidden action '%s' in call '%s'", forbidden_action, name)
                correction = ToolMessage(
                    content=f"Action blocked: '{forbidden_action}' is a forbidden action for this test.",
                    tool_call_id=tc_id,
                )
                return {
                    "guard_blocked": True,
                    "messages": messages + [correction],
                }

    return {"guard_blocked": False}
