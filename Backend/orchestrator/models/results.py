from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from orchestrator.models.run_state import RunStatus


@dataclass
class AssertionResult:
    assertion_id: str
    type: str
    description: str
    passed: bool
    status: Literal["passed", "failed", "skipped", "error"]
    details: str | None = None


@dataclass
class RunResult:
    run_id: str
    test_id: str
    test_name: str
    status: RunStatus
    steps_completed: list[str]
    assertion_results: list[AssertionResult]
    total_steps: int
    duration_s: float
    total_input_tokens: int
    total_output_tokens: int
    estimated_cost_usd: float
    termination_reason: str | None = None
    trace_path: Path | None = None
    error_count: int = 0
    tool_call_count: int = 0
