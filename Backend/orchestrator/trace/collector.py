"""Per-step trace accumulator, run summary computation, and stdout renderer."""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.markup import escape as _esc
from rich.rule import Rule

from orchestrator.models.results import AssertionResult
from orchestrator.models.run_state import StepTrace, compute_step_cost
from orchestrator.trace.phoenix import PhoenixTracer

# legacy_windows=False: use ANSI codes instead of the CP1252-limited legacy
# Windows console renderer — required for box-drawing characters on Windows.
_console = Console(highlight=False, legacy_windows=False)


def _tag(name: str) -> str:
    """Return a Rich-escaped prefix like [observe] that renders literally."""
    return _esc(f"[{name}]")


@dataclass
class RunTracesSummary:
    run_id: str
    test_id: str
    test_name: str
    status: str
    total_steps: int
    duration_s: float
    total_input_tokens: int
    total_output_tokens: int
    total_cost_usd: float
    mcp_tool_calls: int
    custom_tool_calls: int
    steps_completed: list[str]
    error_count: int
    assertion_results: list[AssertionResult] = field(default_factory=list)
    # Latency percentiles (ms)
    p50_step_latency_ms: int = 0
    p95_step_latency_ms: int = 0
    p99_step_latency_ms: int = 0


class TraceCollector:
    """Collects StepTrace entries and produces run summaries and console output."""

    def __init__(
        self,
        *,
        run_id: str,
        test_id: str,
        test_name: str,
        model: str,
        browser: str,
        verbose: bool = False,
        db_run_id: str | None = None,
        ws_emitter=None,  # Callable[[str, dict], Awaitable[None]] | None
        phoenix_tracer: PhoenixTracer | None = None,
    ) -> None:
        self._run_id = run_id
        self._test_id = test_id
        self._test_name = test_name
        self._model = model
        self._browser = browser
        self._verbose = verbose
        self._db_run_id = db_run_id
        self._ws_emitter = ws_emitter
        self._phoenix = phoenix_tracer
        self._traces: list[StepTrace] = []
        self._start_time = time.time()
        self._assertion_results: list[AssertionResult] = []

    @property
    def traces(self) -> list[StepTrace]:
        """All accumulated step traces."""
        return self._traces

    def _emit(self, event_type: str, data: dict) -> None:
        if self._ws_emitter is None:
            return
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self._ws_emitter(event_type, data))
        except RuntimeError:
            pass

    # ------------------------------------------------------------------
    # Callback API (called by graph nodes)
    # ------------------------------------------------------------------

    def on_run_start(self) -> None:
        _console.print(Rule(style="blue"))
        _console.print(
            f"  [bold]HAWKEYE TEST RUN[/bold]\n"
            f"  Test:    {self._test_id} — {self._test_name}\n"
            f"  Model:   {self._model}\n"
            f"  Browser: {self._browser}   Run ID: {self._run_id}"
        )
        _console.print(Rule(style="blue"))
        if self._phoenix:
            self._phoenix.start_run(
                self._run_id, self._test_id, self._test_name,
                self._model, self._browser,
            )

    def on_sandbox_ready(self, novnc_url: str, cdp_url: str | None) -> None:
        _console.print(f"{_tag('sandbox')} Spawning container...  noVNC: [cyan]{novnc_url}[/cyan]")
        if cdp_url:
            _console.print(f"{_tag('sandbox')} CDP: [cyan]{cdp_url}[/cyan]")
        self._emit("sandbox_ready", {"novnc_url": novnc_url})

    def on_tools_ready(self, mcp_count: int, custom_count: int) -> None:
        _console.print(
            f"{_tag('mcp')}     [green]{mcp_count}[/green] Playwright tools + "
            f"[green]{custom_count}[/green] custom tools loaded"
        )

    def on_step_start(self, step_number: int, checkpoint_id: str | None) -> None:
        _console.print(f"\n[dim]--- Step {step_number} ---[/dim]")
        self._traces.append(StepTrace(step_number=step_number, timestamp=time.time()))
        if checkpoint_id and self._verbose:
            _console.print(f"{_tag('observe')} checkpoint={checkpoint_id}")
        self._emit("step_start", {"step_number": step_number, "checkpoint_id": checkpoint_id})
        if self._phoenix:
            self._phoenix.start_step(step_number)

    def on_observe(
        self,
        url: str,
        title: str,
        wait_ms: int,
        snapshot_chars: int,
        screenshot_b64: str | None = None,
    ) -> None:
        if self._traces:
            self._traces[-1].page_url = url
            if screenshot_b64:
                self._traces[-1].screenshot_b64 = screenshot_b64
            self._traces[-1].page_title = title
            self._traces[-1].wait_for_stable_ms = wait_ms
        _console.print(
            f"{_tag('observe')} wait_for_stable: [cyan]{wait_ms}ms[/cyan]  "
            f"URL: {_esc(url)}  snapshot: {snapshot_chars} chars"
        )
        self._emit("observe", {"url": url, "title": title, "wait_ms": wait_ms, "snapshot_chars": snapshot_chars})
        if self._phoenix:
            self._phoenix.start_observe(url, title)
            self._phoenix.end_observe(wait_ms, snapshot_chars)

    def on_reason(
        self,
        *,
        model: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        stop_reason: str,
        agent_text: str | None,
        cost_usd: float,
        input_messages: list | None = None,
        tool_calls: list[dict] | None = None,
        llm_start_ns: int = 0,
        llm_end_ns: int = 0,
    ) -> None:
        if self._traces:
            t = self._traces[-1]
            t.model = model
            t.input_tokens = input_tokens
            t.output_tokens = output_tokens
            t.llm_latency_ms = latency_ms
            t.stop_reason = stop_reason
            t.agent_output_text = agent_text
            t.estimated_cost_usd = cost_usd

        _console.print(
            f"{_tag('reason')}  [dim]{input_tokens:,} in / {output_tokens:,} out tokens  "
            f"{latency_ms}ms  ${cost_usd:.4f}[/dim]"
        )
        if agent_text and self._verbose:
            preview = agent_text[:120].replace("\n", " ")
            _console.print(f"{_tag('reason')}  [italic]{_esc(preview)}[/italic]")
        self._emit("reason", {
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": latency_ms,
            "cost_usd": cost_usd,
            "stop_reason": stop_reason,
        })
        if self._phoenix:
            end_ns = llm_end_ns or time.time_ns()
            start_ns = llm_start_ns or (end_ns - latency_ms * 1_000_000)
            self._phoenix.start_reason(model, start_time_ns=start_ns)
            self._phoenix.end_reason(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                cost_usd=cost_usd,
                agent_text=agent_text,
                input_messages=input_messages,
                tool_calls=tool_calls,
                end_time_ns=end_ns,
            )

    def on_act(
        self,
        *,
        tool_name: str,
        tool_source: str,
        tool_input: dict,
        tool_output: Any,
        latency_ms: int,
        success: bool,
        error: str | None,
        retries: int,
        act_start_ns: int = 0,
        act_end_ns: int = 0,
    ) -> None:
        if self._traces:
            t = self._traces[-1]
            t.tool_name = tool_name
            t.tool_source = tool_source
            t.tool_input = tool_input
            t.tool_output = str(tool_output)[:500] if tool_output else None
            t.tool_execution_latency_ms = latency_ms
            t.tool_success = success
            t.tool_error = error
            t.tool_retries = retries
            # Fire-and-forget DB persistence per step
            if self._db_run_id:
                import asyncio
                from orchestrator.db import store as _db_store
                try:
                    asyncio.create_task(_db_store.insert_step_trace(self._db_run_id, t))
                except RuntimeError:
                    pass  # No event loop in sync context — skip

        status_str = "[green]OK[/green]" if success else "[red]ERR[/red]"
        input_preview = _compact(tool_input)
        _console.print(
            f"{_tag('act')}     [bold]{_esc(tool_name)}[/bold]({_esc(input_preview)}) "
            f"→ {status_str} {latency_ms}ms"
        )
        if error and not success:
            _console.print(f"{_tag('act')}     [red]{_esc(error[:120])}[/red]")
        self._emit("act", {
            "tool_name": tool_name,
            "tool_source": tool_source,
            "latency_ms": latency_ms,
            "success": success,
            "error": error,
        })
        if self._phoenix:
            end_ns = act_end_ns or time.time_ns()
            start_ns = act_start_ns or (end_ns - latency_ms * 1_000_000)
            self._phoenix.start_act(tool_name, tool_source, tool_input, start_time_ns=start_ns)
            self._phoenix.end_act(
                success=success,
                latency_ms=latency_ms,
                error=error,
                tool_output=str(tool_output)[:2000] if tool_output else None,
                end_time_ns=end_ns,
            )

    def on_goal_check(
        self, *, completed_checkpoints: list[str], goal_complete: bool
    ) -> None:
        if self._traces:
            self._traces[-1].checkpoint_completed = bool(completed_checkpoints)
            self._traces[-1].checkpoint_id = (
                completed_checkpoints[-1] if completed_checkpoints else None
            )
        if completed_checkpoints:
            chk = ", ".join(completed_checkpoints)
            _console.print(f"{_tag('check')}   [green]Completed: {_esc(str(completed_checkpoints))}[/green]")
        if self._phoenix:
            self._phoenix.end_step()

    def on_error(self, *, error_type: str, message: str, recoverable: bool) -> None:
        color = "yellow" if recoverable else "red"
        _console.print(f"{_tag('error')}   [{color}]{_esc(error_type)}: {_esc(message[:200])}[/{color}]")
        self._emit("error", {"error_type": error_type, "message": message, "recoverable": recoverable})

    def on_finalize(self, assertion_results: list[AssertionResult]) -> None:
        self._assertion_results = assertion_results
        if self._traces:
            self._traces[-1].completed_at = time.time()
        self._emit("complete", {
            "total_steps": len(self._traces),
            "assertion_count": len(assertion_results),
        })
        if self._phoenix:
            self._phoenix.end_run("running", total_steps=len(self._traces))

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def get_summary(
        self,
        *,
        run_id: str | None = None,
        status: str = "unknown",
    ) -> RunTracesSummary:
        duration = time.time() - self._start_time
        total_in = sum(t.input_tokens for t in self._traces)
        total_out = sum(t.output_tokens for t in self._traces)
        total_cost = sum(t.estimated_cost_usd for t in self._traces)
        mcp_calls = sum(1 for t in self._traces if t.tool_source == "mcp")
        custom_calls = sum(1 for t in self._traces if t.tool_source == "custom")
        completed = [
            t.checkpoint_id
            for t in self._traces
            if t.checkpoint_completed and t.checkpoint_id
        ]
        errors = sum(1 for t in self._traces if not t.tool_success)

        latencies = sorted(
            t.total_step_latency_ms or (t.llm_latency_ms + t.tool_execution_latency_ms)
            for t in self._traces
        )
        p50, p95, p99 = _percentiles(latencies)

        return RunTracesSummary(
            run_id=run_id or self._run_id,
            test_id=self._test_id,
            test_name=self._test_name,
            status=status,
            total_steps=len(self._traces),
            duration_s=round(duration, 2),
            total_input_tokens=total_in,
            total_output_tokens=total_out,
            total_cost_usd=round(total_cost, 6),
            mcp_tool_calls=mcp_calls,
            custom_tool_calls=custom_calls,
            steps_completed=list(dict.fromkeys(completed)),  # dedupe, preserve order
            error_count=errors,
            assertion_results=self._assertion_results,
            p50_step_latency_ms=p50,
            p95_step_latency_ms=p95,
            p99_step_latency_ms=p99,
        )

    def print_summary(self, *, status: str = "unknown") -> None:
        summary = self.get_summary(status=status)
        _console.print(Rule(style="blue"))
        _console.print("  [bold]ASSERTIONS[/bold]")
        for ar in summary.assertion_results:
            icon = "[green]→ PASSED[/green]" if ar.passed else "[red]→ FAILED[/red]"
            if ar.status == "skipped":
                icon = "[dim]→ SKIPPED[/dim]"
            _console.print(f"  {ar.assertion_id} [{ar.type}] {ar.description}  {icon}")
            if ar.details and not ar.passed:
                _console.print(f"    [red]{ar.details}[/red]")

        _console.print(Rule(style="blue"))
        color = "green" if status == "passed" else "red" if status == "failed" else "yellow"
        _console.print(
            f"  SUMMARY  "
            f"Status: [{color}]{status.upper()}[/{color}]  "
            f"Steps: {summary.total_steps}  "
            f"Duration: {summary.duration_s}s  "
            f"Cost: [dim]${summary.total_cost_usd:.4f}[/dim]"
        )
        _console.print(Rule(style="blue"))
        if self._phoenix:
            self._phoenix.end_run(
                status, total_steps=summary.total_steps, total_cost_usd=summary.total_cost_usd
            )

    def write_json(self, output_dir: Path, *, status: str = "unknown") -> Path:
        """Write full trace JSON to ``output_dir/trace.json``."""
        output_dir.mkdir(parents=True, exist_ok=True)
        trace_path = output_dir / "trace.json"

        payload = {
            "run_id": self._run_id,
            "test_id": self._test_id,
            "test_name": self._test_name,
            "status": status,
            "steps": [asdict(t) for t in self._traces],
            "assertions": [
                {
                    "id": ar.assertion_id,
                    "type": ar.type,
                    "description": ar.description,
                    "passed": ar.passed,
                    "status": ar.status,
                    "details": ar.details,
                }
                for ar in self._assertion_results
            ],
        }
        trace_path.write_text(
            json.dumps(payload, indent=2, default=str), encoding="utf-8"
        )
        return trace_path


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _percentiles(sorted_values: list[int]) -> tuple[int, int, int]:
    """Return (p50, p95, p99) for a sorted list. Returns (0, 0, 0) if empty."""
    n = len(sorted_values)
    if n == 0:
        return 0, 0, 0
    p50 = sorted_values[int(n * 0.50)]
    p95 = sorted_values[min(int(n * 0.95), n - 1)]
    p99 = sorted_values[min(int(n * 0.99), n - 1)]
    return p50, p95, p99


def _compact(d: dict, max_len: int = 60) -> str:
    """Format a tool input dict as a compact string for display."""
    if not d:
        return ""
    parts = []
    for k, v in d.items():
        v_str = repr(v) if isinstance(v, str) else str(v)
        if len(v_str) > 30:
            v_str = v_str[:27] + "..."
        parts.append(f"{k}={v_str}")
    result = ", ".join(parts)
    if len(result) > max_len:
        result = result[:max_len - 3] + "..."
    return result
