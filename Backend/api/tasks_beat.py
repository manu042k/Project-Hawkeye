"""Celery Beat periodic tasks — fire suite runs on schedule.

Celery Beat reads `beat_schedule` from celery_app config. This module
registers a single periodic task that scans enabled suite schedules every
minute and triggers runs for schedules whose cron expression is due.

Requires:
  pip install croniter
  celery beat --app api.celery_app --scheduler celery.beat:PersistentScheduler
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from api.celery_app import celery_app
from api.schemas import RunRequest

logger = logging.getLogger(__name__)


@celery_app.task(name="hawkeye.tick_schedules")
def tick_schedules() -> dict:
    """Called every minute by Celery Beat. Fires any due suite schedules."""
    import asyncio
    return asyncio.run(_check_and_fire())


async def _check_and_fire() -> dict:
    from api.routes.schedules import _schedules as mem_schedules
    from api.db import db_enabled, fetch, execute
    from api.tasks import run_test_case  # noqa: F401 (ensure task is registered)

    now = datetime.now(timezone.utc)
    fired: list[str] = []

    if db_enabled():
        schedules = await fetch("SELECT * FROM suite_schedules WHERE enabled=true")
    else:
        schedules = list(mem_schedules.values())

    for sched in schedules:
        if not sched.get("enabled", True):
            continue
        cron_expr = sched.get("cron", "")
        if not _is_due(cron_expr, sched.get("last_triggered_at"), now):
            continue
        suite_id = str(sched.get("suite_id", sched.get("id", "")))
        project_id = str(sched.get("project_id", ""))
        fired_runs = await _fire_suite(suite_id, project_id, str(sched.get("branch", "main")))
        fired.extend(fired_runs)
        # Update last_triggered_at
        if db_enabled():
            await execute(
                "UPDATE suite_schedules SET last_triggered_at=$2 WHERE id=$1",
                str(sched["id"]), now.isoformat(),
            )
        else:
            sched_id = str(sched["id"])
            if sched_id in mem_schedules:
                mem_schedules[sched_id]["last_triggered_at"] = now.isoformat()

    logger.info("tick_schedules: %d run(s) fired", len(fired))
    return {"fired_run_ids": fired, "checked_at": now.isoformat()}


def _is_due(cron_expr: str, last_triggered_at: str | None, now: datetime) -> bool:
    """Return True if cron_expr is due at `now` given the last trigger time."""
    try:
        from croniter import croniter
    except ImportError:
        logger.warning("croniter not installed — schedule check skipped")
        return False
    if not cron_expr:
        return False
    try:
        it = croniter(cron_expr, now)
        prev = it.get_prev(datetime)
        if last_triggered_at is None:
            return True
        from dateutil.parser import parse as _parse
        last_dt = _parse(last_triggered_at).replace(tzinfo=timezone.utc)
        return prev > last_dt
    except Exception as exc:
        logger.warning("cron parse error for %r: %s", cron_expr, exc)
        return False


async def _fire_suite(suite_id: str, project_id: str, branch: str) -> list[str]:
    """Dispatch Celery run_test_case tasks for every test case in the suite."""
    from api.routes.suites import _suites as mem_suites
    from api.db import db_enabled, fetchrow
    import json
    from api.job_queue import job_queue

    run_ids: list[str] = []
    if db_enabled():
        row = await fetchrow("SELECT * FROM test_suites WHERE id=$1", suite_id)
        if not row:
            return run_ids
        tc_ids = row["test_case_ids"]
        if isinstance(tc_ids, str):
            tc_ids = json.loads(tc_ids)
    else:
        suite = mem_suites.get(suite_id)
        if not suite:
            return run_ids
        tc_ids = suite.get("test_case_ids", [])

    for tc_id in tc_ids:
        from api.tasks import run_test_case
        import uuid as _uuid
        run_id = str(_uuid.uuid4())
        req = RunRequest(test_case_id=tc_id)
        run_test_case.delay(run_id, req.model_dump())
        run_ids.append(run_id)
        logger.info("Beat: dispatched run %s for tc %s (suite %s)", run_id, tc_id, suite_id)

    return run_ids


# ---------------------------------------------------------------------------
# Register beat schedule in celery_app config
# ---------------------------------------------------------------------------

celery_app.conf.beat_schedule = {
    "tick-schedules-every-minute": {
        "task": "hawkeye.tick_schedules",
        "schedule": 60.0,
    },
}
