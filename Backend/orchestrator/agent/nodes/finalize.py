"""FINALIZE node — runs assertions, prints summary, writes trace JSON."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.assertions.engine import AssertionEngine
    from orchestrator.cdp.session import CdpSession
    from orchestrator.models.run_state import AgentState
    from orchestrator.trace.collector import TraceCollector

logger = logging.getLogger(__name__)


async def finalize_node(
    state: AgentState,
    *,
    assertion_engine: AssertionEngine,
    cdp_session: CdpSession | None,
    collector: TraceCollector,
    output_dir: Path,
    figma_token: str | None = None,
) -> dict:
    """FINALIZE: evaluate assertions, print summary, persist trace.

    Runs even when status is already 'errored' or 'timed_out' to ensure
    evidence is always collected. Never raises.
    """
    current_status = state.get("status", "errored")

    # --- Run assertion engine ---
    assertion_results = []
    if state["test_case"].assertions:
        try:
            step_screenshots: list[bytes] = state.get("step_screenshots", [])
            final_screenshot = step_screenshots[-1] if step_screenshots else None
            assertion_results = await assertion_engine.evaluate(
                state["test_case"].assertions,
                page_snapshot=state.get("page_snapshot", ""),
                cdp_session=cdp_session,
                figma_token=figma_token,
                final_screenshot=final_screenshot,
                output_dir=output_dir,
            )
        except Exception as exc:
            logger.error("finalize: assertion engine raised unexpectedly: %s", exc)

    # Upgrade status if any assertion failed.
    if current_status == "passed":
        if any(r.status == "failed" for r in assertion_results):
            current_status = "failed"

    collector.on_finalize(assertion_results)
    collector.print_summary(status=current_status)

    # --- Write trace JSON ---
    try:
        trace_path = collector.write_json(output_dir, status=current_status)
        logger.info("Trace written to %s", trace_path)
    except Exception as exc:
        logger.error("finalize: failed to write trace: %s", exc)
        trace_path = None

    return {
        "status": current_status,
        "goal_complete": True,
    }
