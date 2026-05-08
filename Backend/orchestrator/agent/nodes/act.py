"""ACT node — dispatches the LLM's tool call to MCP or the custom registry."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage, ToolMessage

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession
    from orchestrator.mcp.client import PlaywrightMcpClient
    from orchestrator.models.run_state import AgentState, ErrorInfo
    from orchestrator.tools.tool_registry import ToolRegistry
    from orchestrator.trace.collector import TraceCollector

logger = logging.getLogger(__name__)

_REPETITION_WINDOW = 5


def _sanitize_tool_args(args: dict) -> dict:
    """Normalize tool arguments to be compatible with Playwright MCP.

    Different LLMs format optional parameters differently:
    - Some pass ``null`` / ``None`` for unset optional fields — MCP rejects these.
    - Some include the ``ref=`` prefix in target refs (e.g. ``'ref=e52'`` instead
      of ``'e52'``) — strip it so Playwright can find the element.
    """
    cleaned = {k: v for k, v in args.items() if v is not None}
    if "target" in cleaned and isinstance(cleaned["target"], str):
        t = cleaned["target"]
        if t.startswith("ref="):
            cleaned["target"] = t[len("ref="):]
    return cleaned    # number of recent steps to check for identical tool calls
_REPETITION_META_LIMIT = 3  # after this many injected meta-prompts → GOAL_BLOCKED


async def act_node(
    state: AgentState,
    *,
    mcp_client: PlaywrightMcpClient,
    cdp_session: CdpSession | None,
    tool_registry: ToolRegistry,
    collector: TraceCollector,
) -> dict:
    """ACT: execute the tool call returned by the LLM.

    Routes browser_* tools to the MCP client; all others to tool_registry.
    Detects repetitive tool calls and injects a meta-prompt to break loops.
    Never raises — errors are recorded in state for error_handler.
    """
    from orchestrator.models.run_state import ErrorInfo
    from langchain_core.messages import HumanMessage

    messages = state["messages"]
    last_ai: AIMessage | None = None
    for m in reversed(messages):
        if isinstance(m, AIMessage):
            last_ai = m
            break

    if last_ai is None or not last_ai.tool_calls:
        # No tool call — nothing to execute.
        return {}

    tool_call = last_ai.tool_calls[0]  # Process one tool call per step
    tool_name = tool_call["name"]
    tool_args = _sanitize_tool_args(tool_call.get("args", {}) or {})
    tool_call_id = tool_call.get("id", "call-0")

    # --- Repetition detection ---
    recent_tools = [
        t.tool_name for t in state.get("traces", [])[-_REPETITION_WINDOW:]
        if t.tool_name
    ]
    meta_prompts_injected = sum(
        1 for t in state.get("traces", [])
        if t.agent_output_text and "Try a different approach" in (t.agent_output_text or "")
    )
    repetition_detected = (
        len(recent_tools) >= _REPETITION_WINDOW
        and len(set(recent_tools)) == 1
        and recent_tools[0] == tool_name
    )

    if repetition_detected:
        if meta_prompts_injected >= _REPETITION_META_LIMIT:
            return {
                "status": "blocked",
                "goal_complete": True,
                "termination_reason": (
                    f"Agent stuck in repetition loop: called '{tool_name}' "
                    f"{_REPETITION_WINDOW} times without progress."
                ),
            }
        meta = HumanMessage(
            content=(
                f"You've attempted '{tool_name}' {_REPETITION_WINDOW} times "
                "without progress. Try a different approach."
            )
        )
        logger.info("ACT: repetition detected for '%s' — injecting meta-prompt", tool_name)
        return {"messages": [meta]}

    # --- Execute the tool ---
    start_ms = time.monotonic()
    success = False
    output: str = ""
    error_msg: str | None = None
    source = "mcp" if tool_name.startswith("browser_") else "custom"

    try:
        if source == "mcp":
            result = await mcp_client.call_tool(tool_name, tool_args)
            success = not result.is_error
            output = result.content or ""
            if result.is_error:
                error_msg = result.error_message or output or "MCP tool returned an error"
        else:
            output = str(
                await tool_registry.dispatch(
                    tool_name, tool_args,
                    cdp_session=cdp_session,
                    state=state,
                )
            )
            success = True
    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.warning("ACT: tool '%s' exception: %s", tool_name, error_msg)

    latency_ms = int((time.monotonic() - start_ms) * 1000)

    collector.on_act(
        tool_name=tool_name,
        tool_source=source,
        tool_input=tool_args,
        tool_output=output,
        latency_ms=latency_ms,
        success=success,
        error=error_msg,
        retries=0,
    )

    # Build the ToolMessage for the conversation history.
    tool_msg_content = output if success else f"[ERROR] {error_msg}"
    tool_message = ToolMessage(
        content=tool_msg_content,
        tool_call_id=tool_call_id,
        name=tool_name,
    )

    consecutive_errors = state.get("consecutive_errors", 0)
    last_error: ErrorInfo | None = None

    if success:
        consecutive_errors = 0
    else:
        consecutive_errors += 1
        last_error = ErrorInfo(
            error_type="tool_error",
            message=error_msg or "unknown",
            step_number=state["step_number"],
            tool_name=tool_name,
            recoverable=consecutive_errors < 3,
        )

    result_dict: dict = {
        "messages": [tool_message],
        "last_tool_name": tool_name,
        "last_tool_result": output,
        "last_tool_success": success,
        "consecutive_errors": consecutive_errors,
    }
    if last_error:
        result_dict["last_error"] = last_error
        result_dict["error_history"] = (
            state.get("error_history", []) + [last_error]
        )

    return result_dict
