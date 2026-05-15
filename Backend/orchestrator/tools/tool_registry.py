"""Registry that dispatches custom tool calls at runtime."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession
    from orchestrator.models.run_state import AgentState

logger = logging.getLogger(__name__)


class ToolNotFoundError(KeyError):
    """Raised when a tool name is not registered."""


class ToolExecutionError(RuntimeError):
    """Wraps any exception raised by a custom tool function."""


class ToolRegistry:
    """Maps custom tool names to async callables and dispatches calls.

    Each registered function receives ``(tool_input, cdp_session, state)``
    keyword arguments. Callers always get a plain value back — never a
    raw exception (wrapped in ToolExecutionError or ToolNotFoundError).
    """

    def __init__(self) -> None:
        self._handlers: dict[str, Callable] = {}

    def register(self, name: str, fn: Callable) -> None:
        self._handlers[name] = fn

    async def dispatch(
        self,
        name: str,
        tool_input: dict,
        *,
        cdp_session: CdpSession,
        state: AgentState,
    ) -> Any:
        """Execute a custom tool by name.

        Raises:
            ToolNotFoundError: if ``name`` is not registered.
            ToolExecutionError: if the handler raises any exception.
        """
        handler = self._handlers.get(name)
        if handler is None:
            raise ToolNotFoundError(
                f"Custom tool {name!r} is not registered. "
                f"Available: {sorted(self._handlers)}"
            )
        try:
            return await handler(
                tool_input=tool_input,
                cdp_session=cdp_session,
                state=state,
            )
        except (ToolNotFoundError, ToolExecutionError):
            raise
        except Exception as exc:
            raise ToolExecutionError(
                f"Custom tool {name!r} raised {type(exc).__name__}: {exc}"
            ) from exc

    @property
    def registered_names(self) -> list[str]:
        return sorted(self._handlers)


def build_default_registry(
    cdp_session_provider: Callable[[], CdpSession | None],
) -> ToolRegistry:
    """Build and return a ToolRegistry pre-populated with all Phase 1 custom tools."""
    from orchestrator.tools.wait_for_stable import wait_for_stable
    from orchestrator.tools.assert_text_present import assert_text_present
    from orchestrator.tools.get_console_errors import get_console_errors
    from orchestrator.tools.report_step_result import report_step_result

    registry = ToolRegistry()

    async def _wait_for_stable(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        page_type = state["test_case"].target.page_type if state.get("test_case") else "spa"
        timeout_ms = tool_input.get("timeout_ms", 8000)
        result = await wait_for_stable(
            cdp_session=cdp_session,
            page_type=page_type,
            timeout_ms=timeout_ms,
        )
        return (
            f"Page stable: {result.stable} "
            f"(waited {result.wait_duration_ms}ms, signals={result.signals})"
        )

    async def _assert_text(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        result = assert_text_present(
            page_snapshot=state.get("page_snapshot", ""),
            text=tool_input.get("text"),
            pattern=tool_input.get("pattern"),
            case_sensitive=tool_input.get("case_sensitive", True),
        )
        return f"Assertion {result.status.upper()}: {result.description}" + (
            f" | {result.details}" if result.details else ""
        )

    async def _get_console_errors(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        result = await get_console_errors(
            cdp_session=cdp_session,
            level=tool_input.get("level", "error"),
            ignore_patterns=tool_input.get("ignore_patterns"),
        )
        if result.count == 0:
            return "No console errors found."
        msgs = "\n".join(f"  - {m}" for m in result.messages[:10])
        return f"{result.count} console error(s):\n{msgs}"

    async def _report_step(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        return report_step_result(
            step_id=tool_input.get("step_id", "?"),
            status=tool_input.get("status", "passed"),
            summary=tool_input.get("summary", ""),
            evidence=tool_input.get("evidence"),
        )

    from orchestrator.tools.get_network_log import get_network_log
    from orchestrator.tools.assert_network_request import assert_network_request
    from orchestrator.tools.assert_element_state import assert_element_state

    async def _get_network_log(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        result = await get_network_log(
            cdp_session=cdp_session,
            url_pattern=tool_input.get("url_pattern"),
            method=tool_input.get("method"),
            status_gte=tool_input.get("status_gte"),
            status_lte=tool_input.get("status_lte"),
            limit=tool_input.get("limit", 50),
        )
        if result.count == 0:
            return "No network requests captured."
        header = f"{result.count} request(s)" + (" (filtered)" if result.filtered else "") + ":"
        rows = "\n".join(
            f"  {r['method']} {r['status']} {r['url'][:120]}" + (" [FAILED]" if r["failed"] else "")
            for r in result.requests
        )
        return f"{header}\n{rows}"

    async def _assert_network_request(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        result = await assert_network_request(
            cdp_session=cdp_session,
            url_pattern=tool_input.get("url_pattern", ""),
            method=tool_input.get("method"),
            expected_status=tool_input.get("expected_status"),
            min_count=tool_input.get("min_count", 1),
        )
        status = "PASSED" if result.passed else "FAILED"
        return f"Assertion {status}: {result.details}"

    async def _assert_element_state(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        result = await assert_element_state(
            cdp_session=cdp_session,
            selector=tool_input.get("selector", ""),
            check=tool_input.get("check", ""),
            expected=tool_input.get("expected"),
        )
        status = "PASSED" if result.passed else "FAILED"
        return f"Assertion {status}: {result.details}"

    from orchestrator.tools.scroll_page import scroll_page

    async def _scroll_page(tool_input: dict, cdp_session: CdpSession, state: AgentState) -> str:
        if cdp_session is None:
            return "scroll_page requires CDP — not available in this run."
        result = await scroll_page(
            cdp_session=cdp_session,
            direction=tool_input.get("direction", "down"),
            times=min(int(tool_input.get("times", 1)), 10),
        )
        status = "Reached bottom of page." if result.at_bottom else f"{result.scroll_height - result.scroll_top - result.viewport_height}px remaining."
        return (
            f"Scrolled {result.direction} {result.times}× "
            f"(~{result.pixels_scrolled}px). "
            f"Position: {result.scroll_top}px from top. "
            f"{status}"
        )

    registry.register("wait_for_stable", _wait_for_stable)
    registry.register("assert_text_present", _assert_text)
    registry.register("get_console_errors", _get_console_errors)
    registry.register("report_step_result", _report_step)
    registry.register("get_network_log", _get_network_log)
    registry.register("assert_network_request", _assert_network_request)
    registry.register("assert_element_state", _assert_element_state)
    registry.register("scroll_page", _scroll_page)
    return registry
