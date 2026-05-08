"""ERROR_HANDLER node — classifies errors and decides recover vs terminate."""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from langchain_core.messages import HumanMessage

if TYPE_CHECKING:
    from orchestrator.mcp.client import PlaywrightMcpClient
    from orchestrator.models.run_state import AgentState, ErrorInfo

logger = logging.getLogger(__name__)

_MCP_RECONNECT_ATTEMPTS = 3
_MCP_RECONNECT_DELAY_S = 1.0


async def error_handler_node(
    state: AgentState,
    *,
    mcp_client: PlaywrightMcpClient,
) -> dict:
    """ERROR_HANDLER: classify the last error and decide recovery strategy.

    Recovery rules (per spec §7.5):
    - tool_error with consecutive_errors < 3: inject context, route to observe.
    - tool_error with consecutive_errors >= 3: terminate with status=errored.
    - mcp_disconnect: attempt reconnection; resume if success, terminate if not.
    - llm_auth_error or recoverable=False: terminate.
    - llm_rate_limit: already retried in reason node; route back to observe.

    Never raises.
    """
    error: ErrorInfo | None = state.get("last_error")
    error_history = list(state.get("error_history", []))

    if error is None:
        # No error recorded — this shouldn't happen, but recover gracefully.
        return {}

    error_history.append(error)

    # Fatal errors — terminate immediately.
    if not error.recoverable or error.error_type in ("llm_auth_error",):
        return {
            "status": "errored",
            "goal_complete": True,
            "termination_reason": f"{error.error_type}: {error.message[:200]}",
            "error_history": error_history,
            "last_error": None,
        }

    # Too many consecutive tool errors.
    if error.error_type == "tool_error" and state.get("consecutive_errors", 0) >= 3:
        return {
            "status": "errored",
            "goal_complete": True,
            "termination_reason": (
                f"3 consecutive tool errors (last: {error.message[:120]})"
            ),
            "error_history": error_history,
            "last_error": None,
        }

    # MCP disconnect — attempt reconnection.
    if error.error_type == "mcp_disconnect":
        reconnected = False
        for attempt in range(_MCP_RECONNECT_ATTEMPTS):
            try:
                await asyncio.sleep(_MCP_RECONNECT_DELAY_S)
                await mcp_client.close()
                await mcp_client.initialize()
                reconnected = True
                logger.info("MCP reconnected on attempt %d", attempt + 1)
                break
            except Exception as exc:
                logger.warning("MCP reconnect attempt %d failed: %s", attempt + 1, exc)

        if not reconnected:
            return {
                "status": "errored",
                "goal_complete": True,
                "termination_reason": "MCP disconnected and could not reconnect",
                "error_history": error_history,
                "last_error": None,
            }
        recovery_msg = HumanMessage(
            content="MCP connection was lost but has been restored. Continue from where you left off."
        )
        return {
            "messages": [recovery_msg],
            "error_history": error_history,
            "last_error": None,
            "consecutive_errors": 0,
        }

    # Recoverable tool error (consecutive < 3) or rate-limit already retried.
    recovery_msg = HumanMessage(
        content=(
            f"The last action encountered an error: {error.message[:200]}\n"
            "Please adapt your approach and try a different method to "
            "accomplish the current step."
        )
    )
    return {
        "messages": [recovery_msg],
        "error_history": error_history,
        "last_error": None,
    }
