"""OBSERVE node — checks timeouts, calls wait_for_stable, snapshots the page."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession
    from orchestrator.mcp.client import PlaywrightMcpClient
    from orchestrator.models.run_state import AgentState
    from orchestrator.trace.collector import TraceCollector

logger = logging.getLogger(__name__)

_MCP_SNAPSHOT_RETRIES = 5
_MCP_SNAPSHOT_RETRY_DELAY_S = 1.0
_WAIT_FOR_STABLE_TIMEOUT_MS = 8000


async def observe_node(
    state: AgentState,
    *,
    mcp_client: PlaywrightMcpClient,
    cdp_session: CdpSession | None,
    collector: TraceCollector,
) -> dict:
    """OBSERVE: check constraints, stabilise the page, capture accessibility tree.

    Returns a partial state dict. On hard failures (timeout, max steps, MCP
    unavailable after retries) sets ``status`` to terminate the graph.
    Never raises.
    """
    test_case = state["test_case"]
    step_number = state["step_number"] + 1

    # --- Timeout checks ---
    elapsed = time.time() - state["run_start_time"]
    if elapsed >= test_case.constraints.timeout_seconds:
        return {
            "step_number": step_number,
            "status": "timed_out",
            "goal_complete": True,
            "termination_reason": (
                f"Wall-clock timeout after {elapsed:.1f}s "
                f"(limit {test_case.constraints.timeout_seconds}s)"
            ),
        }

    if step_number > test_case.constraints.max_steps:
        return {
            "step_number": step_number,
            "status": "timed_out",
            "goal_complete": True,
            "termination_reason": (
                f"Exceeded max_steps={test_case.constraints.max_steps}"
            ),
        }

    current_checkpoint = state.get("current_checkpoint")
    collector.on_step_start(step_number, current_checkpoint)

    # --- wait_for_stable ---
    wait_ms = 0
    if cdp_session is not None:
        try:
            from orchestrator.tools.wait_for_stable import wait_for_stable
            result = await wait_for_stable(
                cdp_session=cdp_session,
                page_type=test_case.context.page_type,
                timeout_ms=_WAIT_FOR_STABLE_TIMEOUT_MS,
            )
            wait_ms = result.wait_duration_ms
        except Exception as exc:
            logger.debug("wait_for_stable error (non-fatal): %s", exc)
    else:
        # No CDP: fixed 300ms settle.
        await asyncio.sleep(0.3)
        wait_ms = 300

    # --- browser_snapshot via MCP ---
    snapshot_text = ""
    current_url = state.get("current_url", "")
    page_title = state.get("page_title", "")

    for attempt in range(_MCP_SNAPSHOT_RETRIES):
        result = await mcp_client.call_tool("browser_snapshot", {})
        if not result.is_error and result.content:
            snapshot_text = result.content
            # Parse URL and title from the snapshot text if present.
            current_url, page_title = _parse_url_title(snapshot_text, current_url, page_title)
            break
        logger.debug(
            "browser_snapshot attempt %d/%d failed: %s",
            attempt + 1, _MCP_SNAPSHOT_RETRIES,
            result.error_message or result.content[:80],
        )
        if attempt < _MCP_SNAPSHOT_RETRIES - 1:
            await asyncio.sleep(_MCP_SNAPSHOT_RETRY_DELAY_S)
    else:
        logger.error("browser_snapshot failed after %d attempts", _MCP_SNAPSHOT_RETRIES)
        return {
            "step_number": step_number,
            "status": "errored",
            "goal_complete": True,
            "termination_reason": "browser_snapshot unavailable after 5 retries",
        }

    collector.on_observe(
        url=current_url,
        title=page_title,
        wait_ms=wait_ms,
        snapshot_chars=len(snapshot_text),
    )

    # Reset scroll counter when the page URL changes.
    prev_url = state.get("current_url", "")
    scroll_count = 0 if current_url != prev_url else state.get("page_scroll_count", 0)

    return {
        "step_number": step_number,
        "current_url": current_url,
        "page_title": page_title,
        "page_snapshot": snapshot_text,
        "page_scroll_count": scroll_count,
    }


def _parse_url_title(snapshot: str, fallback_url: str, fallback_title: str) -> tuple[str, str]:
    """Extract URL and title from a Playwright MCP accessibility tree snapshot.

    @playwright/mcp emits unquoted headers like:
      - Page URL: https://en.wikipedia.org/wiki/Main_Page
      - Page Title: Wikipedia, the free encyclopedia

    Older / alternative formats use quoted values or 'navigated to' phrasing.
    Falls back to provided values when nothing matches.
    """
    import re

    url = fallback_url
    title = fallback_title
    for line in snapshot.splitlines()[:15]:
        line_lower = line.lower()
        if "url:" in line_lower or "navigated to" in line_lower:
            # Try quoted first: '...' or "..."
            matched = False
            for q in ('"', "'"):
                s = line.find(q)
                e = line.rfind(q)
                if 0 <= s < e:
                    candidate = line[s + 1:e]
                    if candidate.startswith("http"):
                        url = candidate
                        matched = True
                        break
            if not matched:
                # Unquoted: grab first http(s) token on the line.
                m = re.search(r'https?://\S+', line)
                if m:
                    url = m.group(0).rstrip(')>,')
        elif "title:" in line_lower or "page title" in line_lower:
            matched = False
            for q in ('"', "'"):
                s = line.find(q)
                e = line.rfind(q)
                if 0 <= s < e:
                    title = line[s + 1:e]
                    matched = True
                    break
            if not matched:
                # Unquoted: take everything after the last colon on the line.
                idx = line.rfind(":")
                if idx >= 0:
                    candidate = line[idx + 1:].strip()
                    if candidate:
                        title = candidate
    return url, title
