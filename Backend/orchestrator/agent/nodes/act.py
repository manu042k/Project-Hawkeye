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

_REPETITION_WINDOW = 4       # consecutive identical tool calls before injecting meta-prompt
_REPETITION_HARD_LIMIT = 10  # total consecutive identical calls before blocking


async def act_node(
    state: AgentState,
    *,
    mcp_client: PlaywrightMcpClient,
    cdp_session: CdpSession | None,
    tool_registry: ToolRegistry,
    collector: TraceCollector,  # noqa: F841
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
    tool_args = tool_call.get("args", {}) or {}
    tool_call_id = tool_call.get("id", "call-0")

    # Normalize model-specific selector quirks before passing to Playwright MCP.
    import re as _re
    if "target" in tool_args and isinstance(tool_args["target"], str):
        tool_args = dict(tool_args)
        t = tool_args["target"]
        t = _re.sub(r'\[ref=(e\d+)\]', r'\1', t)   # [ref=e11] → e11
        t = _re.sub(r'(e\d+)<\|.*', r'\1', t)        # e15<|"|> → e15 (garbage tokens)
        t = t.strip()
        tool_args["target"] = t

    # --- Repetition detection ---
    # Count how many consecutive steps at the END of trace history used this same tool.
    # Use collector.traces (source of truth) — state["traces"] is not populated.
    # Exclude the current (in-progress) step: traces[-1] is being built right now.
    past_traces = collector.traces[:-1] if len(collector.traces) > 1 else []
    all_tool_names = [t.tool_name for t in past_traces if t.tool_name]
    consecutive_same = 0
    for past_tool in reversed(all_tool_names):
        if past_tool == tool_name:
            consecutive_same += 1
        else:
            break

    if consecutive_same >= _REPETITION_HARD_LIMIT:
        return {
            "status": "blocked",
            "goal_complete": True,
            "termination_reason": (
                f"Agent stuck in repetition loop: called '{tool_name}' "
                f"{consecutive_same} times consecutively without progress."
            ),
        }

    if consecutive_same > 0 and consecutive_same % _REPETITION_WINDOW == 0:
        meta_text = (
            f"You have called '{tool_name}' {consecutive_same} times consecutively. "
            "This is likely an infinite loop. Try a DIFFERENT approach or emit "
            "<GOAL_COMPLETE> if the goal is already achieved."
        )
        meta = HumanMessage(content=meta_text)
        # Must also close the pending tool_call so the message sequence stays valid.
        skipped_tool_msg = ToolMessage(
            content=f"[skipped — repetition detected after {consecutive_same} identical calls]",
            tool_call_id=tool_call_id,
            name=tool_name,
        )
        # Close out any extra pending tool_calls too.
        extra_skipped = [
            ToolMessage(
                content="[skipped]",
                tool_call_id=tc.get("id", "call-extra") if isinstance(tc, dict) else getattr(tc, "id", "call-extra"),
                name=tc.get("name", "unknown") if isinstance(tc, dict) else getattr(tc, "name", "unknown"),
            )
            for tc in last_ai.tool_calls[1:]
        ]
        logger.info("ACT: repetition detected for '%s' (%d consecutive) — injecting meta-prompt", tool_name, consecutive_same)
        return {"messages": [skipped_tool_msg] + extra_skipped + [meta]}

    # --- Execute the tool ---
    start_ms = time.monotonic()
    act_start_ns = time.time_ns()
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

    act_end_ns = time.time_ns()
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
        act_start_ns=act_start_ns,
        act_end_ns=act_end_ns,
    )

    # Build the ToolMessage for the conversation history.
    tool_msg_content = output if success else f"[ERROR] {error_msg}"
    tool_message = ToolMessage(
        content=tool_msg_content,
        tool_call_id=tool_call_id,
        name=tool_name,
    )
    # If the AIMessage contained multiple tool_calls, we only execute the first.
    # Add dummy ToolMessages for the remaining ones so the message sequence stays
    # valid — OpenAI rejects any AIMessage whose tool_calls lack matching results.
    extra_tool_messages: list[ToolMessage] = []
    for extra_tc in last_ai.tool_calls[1:]:
        extra_tool_messages.append(ToolMessage(
            content="[skipped — only one tool call executed per step]",
            tool_call_id=extra_tc.get("id", "call-extra") if isinstance(extra_tc, dict) else getattr(extra_tc, "id", "call-extra"),
            name=extra_tc.get("name", "unknown") if isinstance(extra_tc, dict) else getattr(extra_tc, "name", "unknown"),
        ))

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
        "messages": [tool_message] + extra_tool_messages,
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
