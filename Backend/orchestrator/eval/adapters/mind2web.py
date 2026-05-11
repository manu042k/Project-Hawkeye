"""Mind2Web benchmark adapter.

Loads tasks from the osunlp/Mind2Web HuggingFace dataset (test split by default)
and converts each to a BenchmarkTask.

Paper: https://arxiv.org/abs/2306.06070
HuggingFace: https://huggingface.co/datasets/osunlp/Mind2Web

Requires the optional benchmark dependency:
    uv pip install 'project-hawkeye[benchmark]'
"""
from __future__ import annotations

import logging
from pathlib import Path

from orchestrator.eval.adapters.base import BenchmarkTask

logger = logging.getLogger(__name__)

_HF_DATASET_ID = "osunlp/Mind2Web"

# Best-effort mapping from Mind2Web website slug → starting URL.
# Only major sites included — unknown domains fall back to https://www.<website>.com.
_URL_MAP: dict[str, str] = {
    "booking": "https://www.booking.com",
    "yelp": "https://www.yelp.com",
    "github": "https://github.com",
    "wikipedia": "https://www.wikipedia.org",
    "reddit": "https://www.reddit.com",
    "tripadvisor": "https://www.tripadvisor.com",
    "imdb": "https://www.imdb.com",
    "allrecipes": "https://www.allrecipes.com",
    "bestbuy": "https://www.bestbuy.com",
    "target": "https://www.target.com",
    "expedia": "https://www.expedia.com",
    "coursera": "https://www.coursera.org",
    "indeed": "https://www.indeed.com",
    "espn": "https://www.espn.com",
    "bbc": "https://www.bbc.com",
    "ebay": "https://www.ebay.com",
    "walmart": "https://www.walmart.com",
    "etsy": "https://www.etsy.com",
    "airbnb": "https://www.airbnb.com",
    "zillow": "https://www.zillow.com",
    "glassdoor": "https://www.glassdoor.com",
    "stackoverflow": "https://stackoverflow.com",
    "quora": "https://www.quora.com",
    "apple": "https://www.apple.com",
}

# Domains with reliable bot-detection — skip by default.
_BLOCKED_DOMAINS: frozenset[str] = frozenset({"amazon", "linkedin", "twitter", "instagram"})


def fetch_tasks(
    *,
    split: str = "test",
    limit: int | None = None,
    domains: list[str] | None = None,
    skip_blocked: bool = True,
    cache_dir: Path | None = None,
) -> list[BenchmarkTask]:
    """Load Mind2Web tasks from HuggingFace.

    Args:
        split: Dataset split — "train", "test", or "test_domain" / "test_task" / "test_website".
        limit: Maximum number of tasks to return.
        domains: If given, only include tasks from these Mind2Web domain labels.
        skip_blocked: Exclude sites in ``_BLOCKED_DOMAINS``.
        cache_dir: HuggingFace cache directory (passed to ``load_dataset``).

    Returns:
        List of BenchmarkTask objects.

    Raises:
        ImportError: If ``datasets`` package is not installed.
    """
    try:
        from datasets import load_dataset  # type: ignore[import]
    except ImportError as exc:
        raise ImportError(
            "Mind2Web adapter requires the HuggingFace datasets library.\n"
            "Install it with:  uv pip install 'project-hawkeye[benchmark]'"
        ) from exc

    kwargs: dict = {"split": split}
    if cache_dir:
        kwargs["cache_dir"] = str(cache_dir)

    logger.info("Mind2Web: loading dataset split=%s …", split)
    ds = load_dataset(_HF_DATASET_ID, **kwargs)

    tasks: list[BenchmarkTask] = []
    for row in ds:
        website: str = (row.get("website") or "").lower().strip()
        domain: str = row.get("domain") or ""
        subdomain: str = row.get("subdomain") or ""
        goal: str = (row.get("confirmed_task") or "").strip()
        annotation_id: str = row.get("annotation_id") or str(len(tasks))

        if not goal:
            continue
        if skip_blocked and any(blocked in website for blocked in _BLOCKED_DOMAINS):
            continue
        if domains and domain not in domains:
            continue

        url = _resolve_url(website)
        task_id = f"M2W-{annotation_id[:12]}"

        tasks.append(
            BenchmarkTask(
                task_id=task_id,
                source="mind2web",
                goal=goal,
                url=url,
                domain=domain,
                category=subdomain or domain,
                metadata={
                    "annotation_id": annotation_id,
                    "website": website,
                    "action_count": len(row.get("actions") or []),
                },
            )
        )
        if limit and len(tasks) >= limit:
            break

    logger.info("Mind2Web: loaded %d tasks (split=%s, limit=%s)", len(tasks), split, limit)
    return tasks


def _resolve_url(website: str) -> str:
    for key, url in _URL_MAP.items():
        if key in website:
            return url
    # Best-effort fallback: strip common suffixes and build https://www.<name>.com
    slug = website.replace(".com", "").replace(".org", "").replace(".net", "").split(".")[0]
    return f"https://www.{slug}.com"
