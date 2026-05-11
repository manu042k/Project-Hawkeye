"""WebVoyager benchmark adapter.

Fetches the 643-task WebVoyager dataset from GitHub and converts each task to a
BenchmarkTask.  Tasks from sites that reliably block headless Chromium are excluded
by default (Amazon, Apple).

Paper: https://arxiv.org/abs/2401.13919
GitHub: https://github.com/MinorJerry/WebVoyager
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import httpx

from orchestrator.eval.adapters.base import BenchmarkTask

logger = logging.getLogger(__name__)

_TASKS_URL = (
    "https://raw.githubusercontent.com/MinorJerry/WebVoyager"
    "/main/data/WebVoyager_data.jsonl"
)

# Sites that fingerprint and block headless Chromium — skip by default.
_BLOCKED_SITES: frozenset[str] = frozenset({"Amazon", "Apple"})

# Map WebVoyager web_name → coarse category for filtering / tagging.
_CATEGORY_MAP: dict[str, str] = {
    "BBC News": "news",
    "ESPN": "sports-news",
    "GitHub": "developer-tools",
    "ArXiv": "academic",
    "Cambridge Dictionary": "reference",
    "Booking.com": "travel",
    "Allrecipes": "recipes",
    "Wolfram Alpha": "reference",
    "Google Flights": "travel",
    "Google Map": "maps",
    "Google Search": "search",
    "Huggingface": "developer-tools",
    "Apple": "e-commerce",
    "Amazon": "e-commerce",
    "Coursera": "education",
}


def fetch_tasks(
    *,
    cache_path: Path | None = None,
    limit: int | None = None,
    sites: list[str] | None = None,
    categories: list[str] | None = None,
    skip_blocked: bool = True,
) -> list[BenchmarkTask]:
    """Download (or load from cache) WebVoyager tasks.

    Args:
        cache_path: If given, store/load raw JSON here to avoid repeated downloads.
        limit: Maximum number of tasks to return.
        sites: If given, only include tasks whose ``web_name`` is in this list.
        categories: If given, only include tasks whose category is in this list.
        skip_blocked: Exclude sites in ``_BLOCKED_SITES``.

    Returns:
        List of BenchmarkTask objects.
    """
    raw = _load_raw(cache_path)
    tasks: list[BenchmarkTask] = []

    for entry in raw:
        web_name: str = entry.get("web_name", "Unknown")
        raw_id: str = entry.get("id", str(len(tasks)))
        goal: str = entry.get("ques", "")
        url: str = entry.get("web", "")

        if not goal or not url:
            continue
        if skip_blocked and web_name in _BLOCKED_SITES:
            continue
        if sites and web_name not in sites:
            continue

        category = _CATEGORY_MAP.get(web_name, "general")
        if categories and category not in categories:
            continue

        tasks.append(
            BenchmarkTask(
                task_id=f"WV-{raw_id}",
                source="webvoyager",
                goal=goal,
                url=url,
                domain=web_name,
                category=category,
                metadata={"original_id": raw_id},
            )
        )
        if limit and len(tasks) >= limit:
            break

    logger.info("WebVoyager: loaded %d tasks (limit=%s)", len(tasks), limit)
    return tasks


def _load_raw(cache_path: Path | None) -> list[dict]:
    if cache_path and cache_path.exists():
        logger.info("WebVoyager: using cached tasks from %s", cache_path)
        return json.loads(cache_path.read_text(encoding="utf-8"))

    logger.info("WebVoyager: downloading tasks from GitHub…")
    response = httpx.get(_TASKS_URL, timeout=30, follow_redirects=True)
    response.raise_for_status()

    # Dataset is JSONL — one JSON object per line.
    data = [json.loads(line) for line in response.text.splitlines() if line.strip()]

    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        logger.info("WebVoyager: cached %d tasks to %s", len(data), cache_path)

    return data
