"""RunManager — orchestrates the full lifecycle of a single test run."""
from __future__ import annotations

import asyncio
import logging
import sys
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

# Add Backend directory to path so hawkeye_sandbox is importable.
_BACKEND = Path(__file__).parent.parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from hawkeye_sandbox import SandboxConfig, SandboxManager  # noqa: E402

from orchestrator.assertions.engine import AssertionEngine
from orchestrator.loader.yaml_loader import load_test_case
from orchestrator.mcp.client import PlaywrightMcpClient
from orchestrator.mcp.tool_adapter import mcp_tools_to_langchain
from orchestrator.models.results import AssertionResult, RunResult
from orchestrator.models.run_state import AgentState
from orchestrator.models.test_case import TestCase
from orchestrator.tools.tool_registry import build_default_registry
from orchestrator.trace.collector import TraceCollector

_DEFAULT_IMAGE = "project-hawkeye-hawkeye-sandbox:latest"
_DEFAULT_OUTPUT_DIR = Path("artifacts")
_BROWSER_STARTUP_WAIT_S = 6.0


class RunManager:
    """Orchestrates a complete test run: sandbox → MCP → CDP → graph → teardown.

    Resource lifecycle is guaranteed via try/finally: the sandbox container
    and MCP subprocess are always cleaned up, even on unhandled exceptions.
    On any uncaught graph error, returns RunResult(status='errored') instead
    of propagating.
    """

    def __init__(
        self,
        *,
        llm: BaseChatModel,
        sandbox_manager: SandboxManager | None = None,
        sandbox_image: str = _DEFAULT_IMAGE,
        model_name: str = "ollama:qwen3.5:2b",
        verbose: bool = False,
        record: bool = False,
    ) -> None:
        self._llm = llm
        self._sandbox_manager = sandbox_manager or SandboxManager()
        self._sandbox_image = sandbox_image
        self._model_name = model_name
        self._verbose = verbose
        self._record = record

    async def run(
        self,
        test_case: TestCase,
        *,
        browser_override: str | None = None,
        max_steps_override: int | None = None,
        timeout_override: int | None = None,
        output_dir: Path | None = None,
        cdp_url_override: str | None = None,  # for --no-sandbox mode
    ) -> RunResult:
        """Execute one test case end-to-end.

        Returns RunResult regardless of outcome — never propagates exceptions.
        """
        run_id = f"run-{uuid.uuid4().hex[:8]}"
        output_dir = (output_dir or _DEFAULT_OUTPUT_DIR).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        # Apply CLI overrides to the test case constraints.
        if max_steps_override is not None:
            test_case = test_case.model_copy(
                update={"constraints": test_case.constraints.model_copy(
                    update={"max_steps": max_steps_override}
                )}
            )
        if timeout_override is not None:
            test_case = test_case.model_copy(
                update={"constraints": test_case.constraints.model_copy(
                    update={"timeout_seconds": timeout_override}
                )}
            )
        browser = browser_override or test_case.target.browser

        collector = TraceCollector(
            run_id=run_id,
            test_id=test_case.id,
            test_name=test_case.name,
            model=self._model_name,
            browser=browser,
            verbose=self._verbose,
        )
        collector.on_run_start()

        mcp_client: PlaywrightMcpClient | None = None
        cdp_session = None
        sandbox_handle = None
        start_time = time.time()

        try:
            # --- Sandbox setup ---
            if cdp_url_override:
                # --no-sandbox mode: connect to existing browser.
                cdp_url = cdp_url_override
                novnc_url = "(no sandbox)"
            else:
                cfg = SandboxConfig(
                    url=test_case.target.url,
                    browser=browser,
                    image=self._sandbox_image,
                )
                sandbox_handle = self._sandbox_manager.spawn(cfg)
                cdp_url = sandbox_handle.cdp_url or ""
                novnc_url = sandbox_handle.novnc_url
                # Start recording before browser loads if requested.
                if self._record:
                    container_path = f"/tmp/hawkeye-{run_id}.mp4"
                    sandbox_handle = self._sandbox_manager.start_recording(
                        sandbox_handle,
                        width=cfg.width,
                        height=cfg.height,
                        container_path=container_path,
                    )
                    logger.info("Recording started: %s", container_path)
                # Wait for browser to fully start.
                await asyncio.sleep(_BROWSER_STARTUP_WAIT_S)

            collector.on_sandbox_ready(novnc_url, cdp_url)

            # --- CDP session ---
            if cdp_url:
                from orchestrator.cdp.session import CdpSession
                cdp_session = CdpSession(cdp_url)
                try:
                    await cdp_session.connect()
                    await cdp_session.enable_network_capture()
                    await cdp_session.enable_console_capture()
                except Exception as exc:
                    logger.warning("CDP session failed (continuing without CDP): %s", exc)
                    cdp_session = None

            # --- Playwright MCP client ---
            if not cdp_url:
                raise RuntimeError(
                    "No CDP URL available. Use a chromium-family browser "
                    "or provide --cdp-url."
                )
            # Ensure exactly one tab is open before MCP connects.
            # The persistent browser profile can restore previous session tabs,
            # and launch_browser.py calls new_page() unconditionally — together
            # they can produce 2+ tabs. Close all but the target-URL tab here.
            await _ensure_single_tab(cdp_url, test_case.target.url)
            mcp_client = PlaywrightMcpClient(cdp_url)
            await mcp_client.initialize()
            mcp_schemas = await mcp_client.list_tools()
            mcp_tools = mcp_tools_to_langchain(mcp_client, mcp_schemas)

            # --- Custom tools ---
            tool_registry = build_default_registry(lambda: cdp_session)
            from orchestrator.tools.schemas import ALL_CUSTOM_SCHEMAS
            from langchain_core.tools import StructuredTool

            # Build custom StructuredTools that route through tool_registry.
            # These are passed to the LLM for schema awareness but dispatched
            # by the ACT node through tool_registry.dispatch().
            custom_tools = _build_custom_langchain_tools(
                tool_registry, ALL_CUSTOM_SCHEMAS, cdp_session=cdp_session
            )

            collector.on_tools_ready(len(mcp_tools), len(custom_tools))

            # Navigate the MCP-active tab to the target URL.
            # When connecting via --cdp-endpoint, Playwright MCP may create a
            # blank tab as the active page. This ensures the agent always starts
            # on the intended target, and the noVNC observer sees the right tab.
            logger.info("Navigating to target URL: %s", test_case.target.url)
            nav_result = await mcp_client.call_tool(
                "browser_navigate", {"url": test_case.target.url}
            )
            if nav_result.is_error:
                logger.warning("Initial navigation error (non-fatal): %s", nav_result.error_message)
            # Brief wait for the page to start loading before the first observe.
            await asyncio.sleep(2.0)

            # --- Compile graph ---
            assertion_engine = AssertionEngine()
            from orchestrator.agent.graph import build_graph
            graph = build_graph(
                llm=self._llm,
                mcp_client=mcp_client,
                cdp_session=cdp_session,
                tool_registry=tool_registry,
                assertion_engine=assertion_engine,
                collector=collector,
                mcp_tools=mcp_tools,
                custom_tools=custom_tools,
                model_name=self._model_name,
                output_dir=output_dir,
            )

            # --- Build initial state ---
            from langchain_core.messages import SystemMessage
            from orchestrator.agent.prompt_builder import build_system_prompt

            initial_state: AgentState = {
                "test_case": test_case,
                "run_id": run_id,
                "container_host": getattr(sandbox_handle, "container_name", "local"),
                "mcp_url": f"http://localhost:3100/mcp",
                "cdp_url": cdp_url or None,
                "messages": [SystemMessage(content=build_system_prompt(test_case))],
                "step_number": 0,
                "current_checkpoint": (
                    test_case.steps.checkpoints[0].id if test_case.steps else None
                ),
                "completed_checkpoints": [],
                "current_url": test_case.target.url,
                "page_title": "",
                "page_snapshot": "",
                "last_tool_name": None,
                "last_tool_result": None,
                "last_tool_success": True,
                "consecutive_errors": 0,
                "last_error": None,
                "error_history": [],
                "traces": [],
                "current_trace": None,
                "status": "running",
                "goal_complete": False,
                "termination_reason": None,
                "page_scroll_count": 0,
                "run_start_time": start_time,
            }

            # --- Run graph ---
            # Use ainvoke() because all graph nodes are async functions.
            final_state = await graph.ainvoke(initial_state)

            return _build_run_result(run_id, test_case, final_state, collector, output_dir)

        except Exception as exc:
            logger.exception("RunManager: unhandled exception for run %s: %s", run_id, exc)
            return RunResult(
                run_id=run_id,
                test_id=test_case.id,
                test_name=test_case.name,
                status="errored",
                steps_completed=[],
                assertion_results=[],
                total_steps=0,
                duration_s=round(time.time() - start_time, 2),
                total_input_tokens=0,
                total_output_tokens=0,
                estimated_cost_usd=0.0,
                termination_reason=f"Unhandled exception: {exc}",
            )
        finally:
            # Always clean up resources.
            if mcp_client:
                try:
                    await mcp_client.close()
                except Exception:
                    pass
            if cdp_session:
                try:
                    await cdp_session.close()
                except Exception:
                    pass
            if sandbox_handle:
                # Fetch recording before stopping the container.
                if self._record and getattr(sandbox_handle, "recording_container_path", None):
                    try:
                        self._sandbox_manager.stop_recording(sandbox_handle)
                        rec_host_path = str(output_dir / f"{run_id}.mp4")
                        self._sandbox_manager.fetch_recording(sandbox_handle, host_path=rec_host_path)
                        print(f"[recording] Saved to {rec_host_path}")
                    except Exception as exc:
                        logger.warning("Failed to fetch recording for %s: %s", run_id, exc)
                try:
                    self._sandbox_manager.stop(sandbox_handle)
                except Exception as exc:
                    logger.warning("Failed to stop sandbox %s: %s", run_id, exc)


def _build_run_result(
    run_id: str,
    test_case: TestCase,
    final_state: dict,
    collector: TraceCollector,
    output_dir: Path,
) -> RunResult:
    """Convert the final graph state into a RunResult."""
    summary = collector.get_summary(run_id=run_id, status=final_state.get("status", "errored"))
    try:
        trace_path = collector.write_json(output_dir, status=summary.status)
    except Exception:
        trace_path = None
    return RunResult(
        run_id=run_id,
        test_id=test_case.id,
        test_name=test_case.name,
        status=final_state.get("status", "errored"),
        steps_completed=list(final_state.get("completed_checkpoints", [])),
        assertion_results=summary.assertion_results,
        total_steps=summary.total_steps,
        duration_s=summary.duration_s,
        total_input_tokens=summary.total_input_tokens,
        total_output_tokens=summary.total_output_tokens,
        estimated_cost_usd=summary.total_cost_usd,
        termination_reason=final_state.get("termination_reason"),
        trace_path=trace_path,
        error_count=summary.error_count,
        tool_call_count=summary.mcp_tool_calls + summary.custom_tool_calls,
    )


async def _ensure_single_tab(cdp_http_url: str, target_url: str) -> None:
    """Close all browser tabs except one, preferring the tab at target_url.

    The persistent Chrome profile restores previous sessions, and
    launch_browser.py calls new_page() unconditionally, so 2+ tabs can
    exist before the agent starts. This trims them to exactly one.
    """
    try:
        import httpx
        base = cdp_http_url.rstrip("/")
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base}/json/list")
            all_targets = [t for t in resp.json() if t.get("type") == "page"]

        if len(all_targets) <= 1:
            return  # Nothing to do

        # Prefer to keep the tab already at the target URL.
        target_prefix = target_url.rstrip("/")
        at_target = [t for t in all_targets if t.get("url", "").startswith(target_prefix)]
        others = [t for t in all_targets if not t.get("url", "").startswith(target_prefix)]

        # Build close list: close all extras, always keep exactly 1 tab alive.
        keep = (at_target or others)[0]
        to_close = [t for t in all_targets if t["id"] != keep["id"]]

        async with httpx.AsyncClient(timeout=3.0) as client:
            for t in to_close:
                try:
                    await client.get(f"{base}/json/close/{t['id']}")
                    logger.debug("Closed extra tab: %s (%s)", t['id'], t.get('url', ''))
                except Exception:
                    pass
    except Exception as exc:
        logger.debug("_ensure_single_tab failed (non-fatal): %s", exc)


def _build_custom_langchain_tools(
    tool_registry,
    schemas: list[dict],
    *,
    cdp_session,
) -> list:
    """Wrap custom tool schemas as StructuredTools that route through the registry.

    The ACT node handles actual dispatch via tool_registry.dispatch().
    These StructuredTools exist only so the LLM sees the schemas.
    """
    from langchain_core.tools import StructuredTool
    from pydantic import create_model, Field
    from typing import Optional

    tools = []
    for schema in schemas:
        name = schema["name"]
        description = schema["description"]
        input_schema = schema.get("input_schema", {})
        props = input_schema.get("properties", {})

        fields = {
            k: (Optional[str], Field(default=None, description=v.get("description", "")))
            for k, v in props.items()
        }
        if not fields:
            fields["__dummy__"] = (Optional[str], Field(default=None, exclude=True))

        model_cls = create_model(
            "".join(w.capitalize() for w in name.split("_")) + "Args",
            **fields,
        )

        # The coroutine is intentionally a pass-through — ACT node handles dispatch.
        async def _noop(**kwargs) -> str:
            return "(dispatched by ACT node)"

        tools.append(StructuredTool(
            name=name,
            description=description,
            args_schema=model_cls,
            coroutine=_noop,
        ))
    return tools
