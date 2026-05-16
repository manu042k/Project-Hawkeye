"""EvalRunner — multi-task, multi-repetition benchmark execution loop."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

from rich.console import Console

from orchestrator.eval.adapters.base import BenchmarkTask, to_test_case
from orchestrator.eval.metrics import BenchmarkResult, TaskResult
from orchestrator.models.test_case import TestCase

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)
_console = Console(highlight=False, legacy_windows=False)


class EvalRunner:
    """Runs a list of test cases sequentially (N repetitions each) and collects results.

    Both Hawkeye YAML test cases and public-benchmark BenchmarkTask objects are
    accepted — the latter are converted to TestCase via ``to_test_case()`` before
    execution.

    Each run uses a fresh RunManager (and therefore a fresh Docker sandbox) to
    guarantee isolation between repetitions.
    """

    def __init__(
        self,
        *,
        llm: BaseChatModel,
        model_name: str,
        sandbox_image: str = "project-hawkeye-hawkeye-sandbox:latest",
        output_dir: Path = Path("eval_results"),
        verbose: bool = False,
        max_steps_override: int | None = None,
        timeout_override: int | None = None,
    ) -> None:
        self._llm = llm
        self._model_name = model_name
        self._sandbox_image = sandbox_image
        self._output_dir = output_dir.resolve()
        self._verbose = verbose
        self._max_steps_override = max_steps_override
        self._timeout_override = timeout_override

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run_benchmark(
        self,
        benchmark: str,
        test_cases: list[TestCase],
        repetitions: int = 1,
    ) -> BenchmarkResult:
        """Execute all test_cases x repetitions and return aggregated results.

        Results are written incrementally to ``output_dir/eval.jsonl`` so that
        partial data survives an interrupted run.
        """
        self._output_dir.mkdir(parents=True, exist_ok=True)
        jsonl_path = self._output_dir / "eval.jsonl"
        result = BenchmarkResult(benchmark=benchmark, model=self._model_name)

        total = len(test_cases) * repetitions
        _console.print(
            f"\n[bold cyan]Hawkeye Eval[/bold cyan]  benchmark=[bold]{benchmark}[/bold] | "
            f"tasks={len(test_cases)} x runs={repetitions} = {total} total\n"
        )

        for tc in test_cases:
            goal_text = tc.goal.objective.strip()
            tr = TaskResult(
                task_id=tc.id,
                task_name=tc.name,
                source=benchmark,
                domain=(tc.tags[1] if len(tc.tags) > 1 else ""),
                goal=goal_text,
                url=tc.target.url,
            )

            for rep in range(repetitions):
                rep_label = f"run {rep + 1}/{repetitions}" if repetitions > 1 else ""
                _console.print(
                    f"  [cyan]{tc.id}[/cyan] {rep_label}  "
                    f"{goal_text[:64]}{'...' if len(goal_text) > 64 else ''}"
                )

                try:
                    run_result = await self._run_single(tc, rep)
                except Exception as exc:
                    logger.error("Task %s run %d raised: %s", tc.id, rep, exc)
                    continue

                tr.runs.append(run_result)
                self._append_jsonl(jsonl_path, benchmark, self._model_name, tr, run_result)

                status_color = "green" if run_result.status == "passed" else "red"
                _console.print(
                    f"    [{status_color}]{run_result.status}[/{status_color}]  "
                    f"{run_result.total_steps} steps | "
                    f"${run_result.estimated_cost_usd:.4f} | "
                    f"{run_result.duration_s:.0f}s"
                )

            result.task_results.append(tr)

        return result

    async def run_tasks(
        self,
        benchmark: str,
        tasks: list[BenchmarkTask],
        repetitions: int = 1,
        max_steps: int = 20,
        timeout: int = 180,
    ) -> BenchmarkResult:
        """Convert BenchmarkTask objects to TestCases then run them."""
        test_cases = [to_test_case(t, max_steps=max_steps, timeout=timeout) for t in tasks]
        return await self.run_benchmark(benchmark, test_cases, repetitions=repetitions)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _run_single(self, test_case: TestCase, run_index: int):
        from hawkeye_sandbox import SandboxManager
        from orchestrator.runner.run_manager import RunManager

        run_output = self._output_dir / test_case.id / f"run_{run_index}"
        manager = RunManager(
            llm=self._llm,
            sandbox_manager=SandboxManager(),
            sandbox_image=self._sandbox_image,
            model_name=self._model_name,
            verbose=self._verbose,
        )
        return await manager.run(
            test_case,
            max_steps_override=self._max_steps_override,
            timeout_override=self._timeout_override,
            output_dir=run_output,
        )

    @staticmethod
    def _append_jsonl(path: Path, benchmark: str, model_name: str, tr: TaskResult, run) -> None:
        record = {
            "benchmark": benchmark,
            "task_id": tr.task_id,
            "task_name": tr.task_name,
            "source": tr.source,
            "domain": tr.domain,
            "goal": tr.goal,
            "url": tr.url,
            "run_id": run.run_id,
            "model": model_name,
            "status": run.status,
            "steps": run.total_steps,
            "cost_usd": run.estimated_cost_usd,
            "duration_s": round(run.duration_s, 2),
            "input_tokens": run.total_input_tokens,
            "output_tokens": run.total_output_tokens,
            "tool_call_count": run.tool_call_count,
            "error_count": run.error_count,
            "assertion_pass": all(a.passed for a in run.assertion_results),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
