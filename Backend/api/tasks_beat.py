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
    from api.database import AsyncSessionLocal
    from api.models import SuiteSchedule
    from sqlalchemy import select

    now = datetime.now(timezone.utc)
    fired: list[str] = []

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SuiteSchedule).where(SuiteSchedule.enabled == True))  # noqa: E712
        schedules = result.scalars().all()

    for sched in schedules:
        cron_expr = sched.cron or ""
        last_triggered = sched.last_triggered_at.isoformat() if sched.last_triggered_at else None
        if not _is_due(cron_expr, last_triggered, now):
            continue
        fired_runs = await _fire_suite(str(sched.suite_id), str(sched.project_id), sched.branch or "main")
        fired.extend(fired_runs)
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(SuiteSchedule).where(SuiteSchedule.id == sched.id))
            s = result.scalar_one_or_none()
            if s:
                s.last_triggered_at = now
                await session.commit()

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
    from api.database import AsyncSessionLocal
    from api.models import TestSuite
    from api.job_queue import job_queue
    from sqlalchemy import select

    run_ids: list[str] = []
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(TestSuite).where(TestSuite.id == suite_id))
        suite = result.scalar_one_or_none()
    if not suite:
        return run_ids

    for tc_id in (suite.test_case_ids or []):
        req = RunRequest(test_case_id=tc_id)
        run_id = job_queue.submit(req)
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
