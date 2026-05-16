"""Shared BenchmarkTask dataclass and TestCase converter."""
from __future__ import annotations

from dataclasses import dataclass, field

from orchestrator.models.test_case import (
    Constraints,
    Goal,
    Target,
    TestCase,
    Viewport,
)


@dataclass
class BenchmarkTask:
    task_id: str
    source: str  # "webvoyager" | "mind2web" | "custom"
    goal: str
    url: str
    domain: str = ""
    category: str = ""
    reference_answer: str | None = None
    metadata: dict = field(default_factory=dict)


def to_test_case(
    task: BenchmarkTask,
    max_steps: int = 20,
    timeout: int = 180,
) -> TestCase:
    """Convert a BenchmarkTask to a Hawkeye TestCase with sensible defaults."""
    tag_slug = task.domain.lower().replace(" ", "-")
    return TestCase(
        id=task.task_id,
        name=f"[{task.source}] {task.domain} — {task.goal[:60]}",
        suite=f"benchmark-{task.source}",
        priority="P1",
        tags=[task.source, tag_slug, task.category.lower().replace(" ", "-")],
        target=Target(
            url=task.url,
            browser="chromium",
            viewport=Viewport(width=1280, height=720),
            page_type="spa",
            app_description=f"Benchmark task from {task.source}: {task.domain}",
        ),
        goal=Goal(
            objective=task.goal,
            constraints=Constraints(
                max_steps=max_steps,
                timeout_seconds=timeout,
            ),
            extra_details=(
                "Navigate the site to complete the stated goal. "
                "If a CAPTCHA or mandatory login wall appears that cannot be bypassed, "
                "emit <GOAL_BLOCKED> with explanation. "
                "Once you have completed the goal and can visually verify the result, "
                "emit <GOAL_COMPLETE>. "
                "Do not enter real payment details or place actual orders."
            ),
        ),
        assertions=[],
    )
