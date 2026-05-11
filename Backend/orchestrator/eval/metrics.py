"""Benchmark result aggregation and published baseline constants."""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field

from orchestrator.models.results import RunResult


@dataclass
class TaskResult:
    """Aggregated results for one task across N repetitions."""
    task_id: str
    task_name: str
    source: str
    domain: str
    goal: str
    url: str
    runs: list[RunResult] = field(default_factory=list)

    @property
    def pass_rate(self) -> float:
        if not self.runs:
            return 0.0
        return sum(1 for r in self.runs if r.status == "passed") / len(self.runs)

    @property
    def avg_steps(self) -> float:
        if not self.runs:
            return 0.0
        return statistics.mean(r.total_steps for r in self.runs)

    @property
    def avg_cost_usd(self) -> float:
        if not self.runs:
            return 0.0
        return statistics.mean(r.estimated_cost_usd for r in self.runs)

    @property
    def avg_duration_s(self) -> float:
        if not self.runs:
            return 0.0
        return statistics.mean(r.duration_s for r in self.runs)

    @property
    def statuses(self) -> list[str]:
        return [r.status for r in self.runs]


@dataclass
class BenchmarkResult:
    """Aggregated results for one full benchmark run."""
    benchmark: str
    model: str
    task_results: list[TaskResult] = field(default_factory=list)

    @property
    def overall_pass_rate(self) -> float:
        if not self.task_results:
            return 0.0
        return statistics.mean(t.pass_rate for t in self.task_results)

    @property
    def total_runs(self) -> int:
        return sum(len(t.runs) for t in self.task_results)

    @property
    def avg_cost_usd(self) -> float:
        costs = [r.estimated_cost_usd for t in self.task_results for r in t.runs]
        return statistics.mean(costs) if costs else 0.0

    @property
    def avg_steps(self) -> float:
        steps = [r.total_steps for t in self.task_results for r in t.runs]
        return statistics.mean(steps) if steps else 0.0

    @property
    def avg_duration_s(self) -> float:
        durations = [r.duration_s for t in self.task_results for r in t.runs]
        return statistics.mean(durations) if durations else 0.0

    @property
    def total_cost_usd(self) -> float:
        return sum(r.estimated_cost_usd for t in self.task_results for r in t.runs)


# Published baseline task-success rates for comparison in the summary table.
# Sources:
#   WebVoyager — arxiv.org/abs/2401.13919 (TSR on 643 tasks)
#   Mind2Web   — arxiv.org/abs/2306.06070 (element accuracy / task SR on test split)
PUBLISHED_BASELINES: dict[str, dict[str, float]] = {
    "webvoyager": {
        "WebVoyager GPT-4V (2024)": 0.591,
        "GPT-4 + all tools": 0.308,
        "GPT-4 text-only": 0.401,
        "GPT-4o (BrowserGym, 2024)": 0.652,
    },
    "mind2web": {
        "GPT-4 + SeeAct (2024)": 0.234,
        "MindAct fine-tuned T5 (2023)": 0.235,
        "GPT-3.5 zero-shot": 0.098,
        "GPT-4o (BrowserGym, 2024)": 0.391,
    },
    "custom": {},
}
