"""Guard-rails node — enforces navigation policy between REASON and ACT."""
from __future__ import annotations

import logging
from urllib.parse import urlparse

from langchain_core.messages import AIMessage, ToolMessage

from orchestrator.models.run_state import AgentState

logger = logging.getLogger(__name__)


def _registrable_domain(netloc: str) -> str:
    """Return the last two dot-separated parts of a hostname (e.g. 'example.com')."""
    parts = netloc.lower().split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else netloc.lower()


async def guard_rails_node(state: AgentState) -> dict:
    """Inspect the LLM's pending tool call and block policy violations.

    Currently enforced:
    - Navigation policy: block browser_navigate calls that target a domain
      outside the test case's target domain. Injects a ToolMessage rejection
      so the conversation remains valid, then routes back to observe.
    """
    messages = state.get("messages", [])
    last_ai: AIMessage | None = None
    for m in reversed(messages):
        if isinstance(m, AIMessage):
            last_ai = m
            break

    if last_ai is None or not last_ai.tool_calls:
        return {"guard_blocked": False}

    tool_call = last_ai.tool_calls[0]
    tool_name = tool_call["name"] if isinstance(tool_call, dict) else getattr(tool_call, "name", "")
    tool_args = (tool_call.get("args", {}) if isinstance(tool_call, dict) else getattr(tool_call, "args", {})) or {}
    tool_call_id = (tool_call.get("id", "call-0") if isinstance(tool_call, dict) else getattr(tool_call, "id", "call-0"))

    if tool_name == "browser_navigate":
        url = tool_args.get("url", "")
        if url and not url.startswith("javascript:"):
            target_netloc = urlparse(state["test_case"].target.url).netloc
            nav_netloc = urlparse(url).netloc
            if (
                nav_netloc
                and target_netloc
                and _registrable_domain(nav_netloc) != _registrable_domain(target_netloc)
            ):
                logger.warning(
                    "Guard-rails blocked navigation to %s (target domain: %s)",
                    url, target_netloc,
                )
                rejection = ToolMessage(
                    content=(
                        f"Navigation blocked by guard-rails policy. "
                        f"You may only navigate within {target_netloc}. "
                        f"The requested URL {url!r} is outside the allowed domain. "
                        "Use the current page or navigate to a sub-path of the target site."
                    ),
                    tool_call_id=tool_call_id,
                )
                return {
                    "messages": [rejection],
                    "guard_blocked": True,
                }

    return {"guard_blocked": False}
