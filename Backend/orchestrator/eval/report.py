"""Rich summary table and JSONL writer for benchmark results."""
from __future__ import annotations

import json
import time
from pathlib import Path

from rich import box
from rich.console import Console
from rich.table import Table

from orchestrator.eval.metrics import PUBLISHED_BASELINES, BenchmarkResult

_console = Console(highlight=False, legacy_windows=False)


def print_summary_table(result: BenchmarkResult) -> None:
    """Print a per-task Rich table followed by overall stats and baseline comparison."""
    task_table = Table(
        title=f"Benchmark: [bold]{result.benchmark.upper()}[/bold] | Model: {result.model}",
        box=box.ROUNDED,
        show_lines=False,
        pad_edge=True,
    )
    task_table.add_column("Task ID", style="cyan", no_wrap=True)
    task_table.add_column("Domain", style="magenta", max_width=16)
    task_table.add_column("Goal", max_width=48)
    task_table.add_column("Pass", justify="right")
    task_table.add_column("Steps", justify="right")
    task_table.add_column("Cost", justify="right")
    task_table.add_column("Time", justify="right")
    task_table.add_column("Statuses", max_width=20)

    for tr in result.task_results:
        if tr.pass_rate >= 1.0:
            pass_color = "green"
        elif tr.pass_rate > 0:
            pass_color = "yellow"
        else:
            pass_color = "red"

        status_str = " ".join(
            "[green]P[/green]" if s == "passed" else "[red]F[/red]"
            for s in tr.statuses
        )
        task_table.add_row(
            tr.task_id,
            tr.domain,
            (tr.goal[:47] + "…") if len(tr.goal) > 48 else tr.goal,
            f"[{pass_color}]{tr.pass_rate:.0%}[/{pass_color}]",
            f"{tr.avg_steps:.1f}",
            f"${tr.avg_cost_usd:.4f}",
            f"{tr.avg_duration_s:.0f}s",
            status_str,
        )

    _console.print(task_table)
    _console.print(
        f"\n[bold]Overall[/bold]  pass=[bold]{result.overall_pass_rate:.1%}[/bold] | "
        f"tasks={len(result.task_results)} | runs={result.total_runs} | "
        f"avg steps={result.avg_steps:.1f} | avg cost=${result.avg_cost_usd:.4f} | "
        f"total cost=${result.total_cost_usd:.4f}"
    )

    baselines = PUBLISHED_BASELINES.get(result.benchmark, {})
    if baselines:
        bl_table = Table(
            title="Published Baselines",
            box=box.SIMPLE_HEAD,
            show_lines=False,
        )
        bl_table.add_column("System", min_width=32)
        bl_table.add_column("Pass Rate", justify="right")
        bl_table.add_column("Δ vs Hawkeye", justify="right")

        for name, rate in baselines.items():
            delta = result.overall_pass_rate - rate
            delta_str = (
                f"[green]+{delta:.1%}[/green]" if delta >= 0 else f"[red]{delta:.1%}[/red]"
            )
            bl_table.add_row(name, f"{rate:.1%}", delta_str)

        bl_table.add_row(
            f"[bold cyan]Hawkeye ({result.model})[/bold cyan]",
            f"[bold cyan]{result.overall_pass_rate:.1%}[/bold cyan]",
            "—",
        )
        _console.print(bl_table)


def write_jsonl(result: BenchmarkResult, output_dir: Path) -> Path:
    """Append one JSON record per run to ``output_dir/eval.jsonl``.

    Writing is append-mode so partial results from a failed run are preserved.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = output_dir / "eval.jsonl"
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with jsonl_path.open("a", encoding="utf-8") as fh:
        for tr in result.task_results:
            for run in tr.runs:
                record = {
                    "benchmark": result.benchmark,
                    "task_id": tr.task_id,
                    "task_name": tr.task_name,
                    "source": tr.source,
                    "domain": tr.domain,
                    "goal": tr.goal,
                    "url": tr.url,
                    "run_id": run.run_id,
                    "model": result.model,
                    "status": run.status,
                    "steps": run.total_steps,
                    "cost_usd": run.estimated_cost_usd,
                    "duration_s": round(run.duration_s, 2),
                    "input_tokens": run.total_input_tokens,
                    "output_tokens": run.total_output_tokens,
                    "tool_call_count": run.tool_call_count,
                    "error_count": run.error_count,
                    "assertion_pass": all(a.passed for a in run.assertion_results),
                    "assertion_results": [
                        {
                            "id": a.assertion_id,
                            "type": a.type,
                            "passed": a.passed,
                            "status": a.status,
                        }
                        for a in run.assertion_results
                    ],
                    "timestamp": ts,
                }
                fh.write(json.dumps(record) + "\n")

    return jsonl_path
