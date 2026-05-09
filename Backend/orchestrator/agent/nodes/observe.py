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

    # --- Get authoritative URL/title from CDP (more reliable than snapshot parsing) ---
    if cdp_session is not None:
        try:
            cdp_url = await cdp_session.evaluate_js("window.location.href")
            if cdp_url and isinstance(cdp_url, str) and cdp_url.startswith("http"):
                current_url = cdp_url
            cdp_title = await cdp_session.evaluate_js("document.title")
            if cdp_title and isinstance(cdp_title, str):
                page_title = cdp_title
        except Exception as exc:
            logger.debug("CDP URL/title fetch failed (non-fatal): %s", exc)

    # --- Screenshot capture via CDP (non-fatal) ---
    import base64
    current_screenshot: bytes | None = None
    screenshot_b64: str | None = None
    step_screenshots: list[bytes] = list(state.get("step_screenshots", []))

    if cdp_session is not None:
        try:
            raw = await cdp_session.take_screenshot()
            if raw:
                current_screenshot = raw
                screenshot_b64 = base64.b64encode(raw).decode("ascii")
                step_screenshots = step_screenshots + [raw]
        except Exception as exc:
            logger.warning("Screenshot capture failed (non-fatal): %s", exc)

    collector.on_observe(
        url=current_url,
        title=page_title,
        wait_ms=wait_ms,
        snapshot_chars=len(snapshot_text),
        screenshot_b64=screenshot_b64,
    )

    base_update: dict = {
        "step_number": step_number,
        "current_url": current_url,
        "page_title": page_title,
        "page_snapshot": snapshot_text,
        "current_screenshot": current_screenshot,
        "screenshot_b64": screenshot_b64,
        "step_screenshots": step_screenshots,
    }

    # Auto-complete for unguided tests: if all text_present assertions are already
    # satisfied by the current snapshot, mark the goal as passed without requiring
    # the LLM to emit <GOAL_COMPLETE>. Only check after step 3 to skip the start page.
    if test_case.steps is None and step_number >= 3 and snapshot_text:
        text_assertions = [
            a for a in test_case.assertions
            if a.type == "content" and a.params.get("check") == "text_present"
        ]
        if text_assertions and all(a.params.get("text", "") in snapshot_text for a in text_assertions):
            logger.info("OBSERVE: all content assertions pass — auto-completing goal")
            base_update.update({"goal_complete": True, "status": "passed"})

    return base_update


def _parse_url_title(snapshot: str, fallback_url: str, fallback_title: str) -> tuple[str, str]:
    """Extract URL and title from a Playwright accessibility tree snapshot.

    The snapshot typically starts with lines like:
      - page title 'My Page'
      - navigated to 'https://...'
    This is a best-effort extraction; falls back to provided values.
    """
    url = fallback_url
    title = fallback_title
    for line in snapshot.splitlines()[:20]:
        line_stripped = line.strip()
        line_lower = line_stripped.lower()
        if "navigated to" in line_lower or "page url:" in line_lower or ("url:" in line_lower and "page" in line_lower):
            # Try quoted first
            found = False
            for q in ('"', "'"):
                start = line.find(q)
                end = line.rfind(q)
                if 0 <= start < end:
                    candidate = line[start + 1:end]
                    if candidate.startswith("http"):
                        url = candidate
                        found = True
                        break
            if not found:
                # Unquoted: find first http token in the line
                idx = line_stripped.lower().find("http")
                if idx >= 0:
                    candidate = line_stripped[idx:].split()[0].rstrip(".,)>")
                    if candidate.startswith("http"):
                        url = candidate
        elif "page title:" in line_lower or "page title" in line_lower:
            found = False
            for q in ('"', "'"):
                start = line.find(q)
                end = line.rfind(q)
                if 0 <= start < end:
                    title = line[start + 1:end]
                    found = True
                    break
            if not found:
                colon_idx = line_stripped.find(":")
                if colon_idx >= 0:
                    title = line_stripped[colon_idx + 1:].strip()
    return url, title
