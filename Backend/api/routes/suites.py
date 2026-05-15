from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, update

from api.database import AsyncSessionLocal
from api.models import TestSuite, SuiteSchedule
from api.auth_utils import get_current_user, require_project_member

router = APIRouter(tags=["suites"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dt(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    return v.isoformat()


class SuiteCreate(BaseModel):
    name: str
    description: str = ""
    test_case_ids: list[str] = []
    group: str | None = None


class SuiteUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    test_case_ids: list[str] | None = None
    group: str | None = None


def _to_summary(s: TestSuite) -> dict:
    ids = s.test_case_ids or []
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description or "",
        "test_case_ids": ids,
        "test_count": len(ids),
        "pass_rate": s.pass_rate or 0.0,
        "last_run_at": _dt(s.last_run_at),
        "created_at": _dt(s.created_at),
        "group": s.group,
    }


# Backward-compat shim — schedules.py previously imported this
def _project_suites(project_id: str) -> dict:
    return {}


@router.get("/projects/{project_id}/suites")
async def list_suites(project_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite)
            .where(TestSuite.project_id == project_id, TestSuite.archived_at.is_(None))
            .order_by(TestSuite.created_at.desc())
        )
        suites = result.scalars().all()
        return {"suites": [_to_summary(s) for s in suites], "total": len(suites)}


@router.post("/projects/{project_id}/suites", status_code=201)
async def create_suite(project_id: str, body: SuiteCreate) -> dict:
    async with AsyncSessionLocal() as session:
        suite = TestSuite(
            id=str(uuid.uuid4()),
            project_id=project_id,
            name=body.name,
            description=body.description,
            test_case_ids=body.test_case_ids or [],
            group=body.group,
        )
        session.add(suite)
        await session.commit()
        await session.refresh(suite)
        return _to_summary(suite)


@router.get("/projects/{project_id}/suites/{suite_id}")
async def get_suite(project_id: str, suite_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
        if not suite:
            raise HTTPException(status_code=404, detail="Suite not found")
        return _to_summary(suite)


@router.put("/projects/{project_id}/suites/{suite_id}")
async def update_suite(project_id: str, suite_id: str, body: SuiteUpdate) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
        if not suite:
            raise HTTPException(status_code=404, detail="Suite not found")
        if body.name is not None:
            suite.name = body.name
        if body.description is not None:
            suite.description = body.description
        if body.test_case_ids is not None:
            suite.test_case_ids = body.test_case_ids
        if body.group is not None:
            suite.group = body.group or None
        suite.updated_at = _utcnow()
        await session.commit()
        await session.refresh(suite)
        return _to_summary(suite)


@router.delete("/projects/{project_id}/suites/{suite_id}")
async def delete_suite(project_id: str, suite_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
        if not suite:
            raise HTTPException(status_code=404, detail="Suite not found")
        suite.archived_at = _utcnow()
        await session.commit()
        return {"deleted": True}


@router.get("/projects/{project_id}/suite-groups")
async def list_suite_groups(project_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.project_id == project_id, TestSuite.archived_at.is_(None))
        )
        suites = result.scalars().all()
        groups = sorted({s.group for s in suites if s.group})
        return {"groups": groups}


class SuiteRunRequest(BaseModel):
    model: str = "nvidia:moonshotai/kimi-k2.6"
    triggered_by: str | None = None


@router.post("/projects/{project_id}/suites/{suite_id}/run", status_code=202)
async def run_suite(project_id: str, suite_id: str, http_request: Request, body: SuiteRunRequest = SuiteRunRequest(), user: dict = Depends(get_current_user)) -> dict:
    await require_project_member(project_id, user["email"])
    from api.schemas import RunRequest
    from api.job_queue import job_queue
    from api.models import TestCase
    triggered_by = body.triggered_by or http_request.headers.get("X-User-Email") or user.get("email")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
        if not suite:
            raise HTTPException(status_code=404, detail="Suite not found")
        ids = suite.test_case_ids or []
        if not ids:
            raise HTTPException(status_code=422, detail="Suite has no test cases")
        # Validate all test case IDs exist before queuing anything
        existing = await session.execute(
            select(TestCase.id).where(TestCase.id.in_(ids), TestCase.status != "archived")
        )
        existing_ids = {row[0] for row in existing.all()}
        missing = [tc_id for tc_id in ids if tc_id not in existing_ids]
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Test case(s) not found or archived: {', '.join(missing)}",
            )
    run_ids: list[str] = []
    for tc_id in ids:
        req = RunRequest(test_case_id=tc_id, model=body.model, triggered_by=triggered_by)
        run_id = job_queue.submit(req)
        run_ids.append(run_id)
    return {"suite_id": suite_id, "dispatched_run_ids": run_ids, "total": len(run_ids)}


# ── Suite members ─────────────────────────────────────────────────────────────

class MemberAdd(BaseModel):
    test_case_id: str
    position: int = -1


@router.post("/projects/{project_id}/suites/{suite_id}/members", status_code=201)
async def add_suite_member(project_id: str, suite_id: str, body: MemberAdd) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
        if not suite:
            raise HTTPException(404, "Suite not found")
        ids: list[str] = list(suite.test_case_ids or [])
        if body.test_case_id in ids:
            raise HTTPException(409, "Test case already in suite")
        if body.position < 0 or body.position >= len(ids):
            ids.append(body.test_case_id)
        else:
            ids.insert(body.position, body.test_case_id)
        suite.test_case_ids = ids
        suite.updated_at = _utcnow()
        await session.commit()
        return {"suite_id": suite_id, "test_case_ids": ids}


@router.delete("/projects/{project_id}/suites/{suite_id}/members/{tc_id}")
async def remove_suite_member(project_id: str, suite_id: str, tc_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
        if not suite:
            raise HTTPException(404, "Suite not found")
        ids = [i for i in (suite.test_case_ids or []) if i != tc_id]
        suite.test_case_ids = ids
        suite.updated_at = _utcnow()
        await session.commit()
        return {"removed": True, "test_case_ids": ids}


class ReorderBody(BaseModel):
    order: list[str]


@router.put("/projects/{project_id}/suites/{suite_id}/members/reorder")
async def reorder_suite_members(project_id: str, suite_id: str, body: ReorderBody) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
        if not suite:
            raise HTTPException(404, "Suite not found")
        suite.test_case_ids = body.order
        suite.updated_at = _utcnow()
        await session.commit()
        return {"suite_id": suite_id, "test_case_ids": body.order}


# ── Suite schedule (simple single-schedule endpoints) ─────────────────────────

class ScheduleBody(BaseModel):
    cron_expr: str
    timezone: str = "UTC"
    enabled: bool = True
    environment_id: str | None = None


@router.get("/projects/{project_id}/suites/{suite_id}/schedule")
async def get_suite_schedule(project_id: str, suite_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SuiteSchedule).where(SuiteSchedule.suite_id == suite_id)
        )
        sched = result.scalar_one_or_none()
        if not sched:
            return {"cron_expr": None, "timezone": "UTC", "enabled": False, "next_run_at": None}
        next_run = _compute_next_run(sched.cron)
        return {
            "suite_id": suite_id,
            "cron_expr": sched.cron,
            "timezone": "UTC",
            "enabled": sched.enabled,
            "next_run_at": next_run,
        }


@router.put("/projects/{project_id}/suites/{suite_id}/schedule")
async def set_suite_schedule(project_id: str, suite_id: str, body: ScheduleBody) -> dict:
    next_run = _compute_next_run(body.cron_expr)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SuiteSchedule).where(SuiteSchedule.suite_id == suite_id)
        )
        sched = result.scalar_one_or_none()
        if sched:
            sched.cron = body.cron_expr
            sched.enabled = body.enabled
        else:
            sched = SuiteSchedule(
                id=str(uuid.uuid4()),
                project_id=project_id,
                suite_id=suite_id,
                cron=body.cron_expr,
                enabled=body.enabled,
            )
            session.add(sched)
        await session.commit()
    return {
        "suite_id": suite_id,
        "cron_expr": body.cron_expr,
        "timezone": body.timezone,
        "enabled": body.enabled,
        "next_run_at": next_run,
    }


def _compute_next_run(cron_expr: str) -> str | None:
    try:
        from croniter import croniter
        import datetime as _dt
        now = _dt.datetime.now(timezone.utc)
        it = croniter(cron_expr, now)
        return it.get_next(_dt.datetime).isoformat()
    except Exception:
        return None


# ── Suite run history (in-memory only — runs stored in Redis) ─────────────────

_suite_runs: dict[str, list[dict]] = {}


@router.get("/projects/{project_id}/suites/{suite_id}/runs")
async def list_suite_runs(project_id: str, suite_id: str) -> dict:
    runs = _suite_runs.get(suite_id, [])
    return {"runs": runs, "total": len(runs)}


@router.get("/projects/{project_id}/suites/{suite_id}/runs/{suite_run_id}")
async def get_suite_run(project_id: str, suite_id: str, suite_run_id: str) -> dict:
    for r in _suite_runs.get(suite_id, []):
        if r["id"] == suite_run_id:
            return r
    raise HTTPException(404, "Suite run not found")
