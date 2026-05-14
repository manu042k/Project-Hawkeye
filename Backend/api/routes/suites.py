from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db import db_enabled, fetch, fetchrow, execute

router = APIRouter(tags=["suites"])

_store: dict[str, dict[str, dict[str, Any]]] = {}


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


def _project_suites(project_id: str) -> dict[str, dict[str, Any]]:
    return _store.setdefault(project_id, {})


def _to_summary(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": s["id"],
        "name": s["name"],
        "description": s["description"],
        "test_case_ids": s["test_case_ids"],
        "test_count": len(s["test_case_ids"]),
        "pass_rate": s.get("pass_rate", 0.0),
        "last_run_at": s.get("last_run_at"),
        "created_at": s["created_at"],
        "group": s.get("group"),
    }


@router.get("/projects/{project_id}/suites")
async def list_suites(project_id: str) -> dict:
    if db_enabled():
        rows = await fetch(
            "SELECT * FROM test_suites WHERE project_id=$1 AND archived_at IS NULL ORDER BY created_at DESC",
            project_id,
        )
        return {"suites": [_to_summary(dict(r)) for r in rows], "total": len(rows)}
    suites = list(_project_suites(project_id).values())
    suites.sort(key=lambda s: s["created_at"], reverse=True)
    return {"suites": [_to_summary(s) for s in suites], "total": len(suites)}


@router.post("/projects/{project_id}/suites", status_code=201)
async def create_suite(project_id: str, body: SuiteCreate) -> dict:
    if db_enabled():
        row = await fetchrow(
            """INSERT INTO test_suites (id, project_id, name, description, test_case_ids)
               VALUES (gen_random_uuid(),$1,$2,$3,$4) RETURNING *""",
            project_id, body.name, body.description, json.dumps(body.test_case_ids),
        )
        return _to_summary(dict(row))
    suite_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    suite = {
        "id": suite_id, "project_id": project_id, "name": body.name,
        "description": body.description, "test_case_ids": body.test_case_ids,
        "group": body.group,
        "pass_rate": 0.0, "last_run_at": None, "created_at": now, "updated_at": now,
    }
    _project_suites(project_id)[suite_id] = suite
    return _to_summary(suite)


@router.get("/projects/{project_id}/suites/{suite_id}")
async def get_suite(project_id: str, suite_id: str) -> dict:
    if db_enabled():
        row = await fetchrow("SELECT * FROM test_suites WHERE id=$1 AND project_id=$2", suite_id, project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Suite not found")
        return _to_summary(dict(row))
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return _to_summary(suite)


@router.put("/projects/{project_id}/suites/{suite_id}")
async def update_suite(project_id: str, suite_id: str, body: SuiteUpdate) -> dict:
    if db_enabled():
        row = await fetchrow("SELECT * FROM test_suites WHERE id=$1 AND project_id=$2", suite_id, project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Suite not found")
        name = body.name if body.name is not None else row["name"]
        desc = body.description if body.description is not None else row["description"]
        ids = json.dumps(body.test_case_ids) if body.test_case_ids is not None else row["test_case_ids"]
        row = await fetchrow(
            "UPDATE test_suites SET name=$2,description=$3,test_case_ids=$4,updated_at=now() WHERE id=$1 RETURNING *",
            suite_id, name, desc, ids,
        )
        return _to_summary(dict(row))
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    if body.name is not None: suite["name"] = body.name
    if body.description is not None: suite["description"] = body.description
    if body.test_case_ids is not None: suite["test_case_ids"] = body.test_case_ids
    if body.group is not None: suite["group"] = body.group if body.group else None
    suite["updated_at"] = datetime.now(timezone.utc).isoformat()
    return _to_summary(suite)


@router.delete("/projects/{project_id}/suites/{suite_id}")
async def delete_suite(project_id: str, suite_id: str) -> dict:
    if db_enabled():
        val = await fetchrow("UPDATE test_suites SET archived_at=now() WHERE id=$1 AND project_id=$2 RETURNING id", suite_id, project_id)
        if not val:
            raise HTTPException(status_code=404, detail="Suite not found")
        return {"deleted": True}
    suites = _project_suites(project_id)
    if suite_id not in suites:
        raise HTTPException(status_code=404, detail="Suite not found")
    del suites[suite_id]
    return {"deleted": True}


@router.get("/projects/{project_id}/suite-groups")
async def list_suite_groups(project_id: str) -> dict:
    suites = list(_project_suites(project_id).values())
    groups = sorted({s.get("group") for s in suites if s.get("group")})
    return {"groups": groups}


class SuiteRunRequest(BaseModel):
    model: str = "nvidia:moonshotai/kimi-k2.6"
    triggered_by: str | None = None


@router.post("/projects/{project_id}/suites/{suite_id}/run", status_code=202)
async def run_suite(project_id: str, suite_id: str, body: SuiteRunRequest = SuiteRunRequest()) -> dict:
    from api.schemas import RunRequest
    from api.job_queue import job_queue
    if db_enabled():
        row = await fetchrow("SELECT test_case_ids FROM test_suites WHERE id=$1 AND project_id=$2", suite_id, project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Suite not found")
        ids = json.loads(row["test_case_ids"]) if isinstance(row["test_case_ids"], str) else (row["test_case_ids"] or [])
    else:
        suite = _project_suites(project_id).get(suite_id)
        if not suite:
            raise HTTPException(status_code=404, detail="Suite not found")
        ids = suite["test_case_ids"]
    run_ids: list[str] = []
    for tc_id in ids:
        req = RunRequest(test_case_id=tc_id, model=body.model, triggered_by=body.triggered_by)
        run_id = job_queue.submit(req)
        run_ids.append(run_id)
    return {"suite_id": suite_id, "dispatched_run_ids": run_ids, "total": len(run_ids)}


# ── Suite members (test cases inside a suite) ────────────────────────────────

class MemberAdd(BaseModel):
    test_case_id: str
    position: int = -1  # -1 = append


@router.post("/projects/{project_id}/suites/{suite_id}/members", status_code=201)
async def add_suite_member(project_id: str, suite_id: str, body: MemberAdd) -> dict:
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(404, "Suite not found")
    ids: list[str] = list(suite["test_case_ids"])
    if body.test_case_id in ids:
        raise HTTPException(409, "Test case already in suite")
    if body.position < 0 or body.position >= len(ids):
        ids.append(body.test_case_id)
    else:
        ids.insert(body.position, body.test_case_id)
    suite["test_case_ids"] = ids
    if db_enabled():
        await execute(
            "UPDATE test_suites SET test_case_ids=$2::jsonb,updated_at=now() WHERE id=$1",
            suite_id, json.dumps(ids),
        )
    return {"suite_id": suite_id, "test_case_ids": ids}


@router.delete("/projects/{project_id}/suites/{suite_id}/members/{tc_id}")
async def remove_suite_member(project_id: str, suite_id: str, tc_id: str) -> dict:
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(404, "Suite not found")
    ids: list[str] = [i for i in suite["test_case_ids"] if i != tc_id]
    suite["test_case_ids"] = ids
    if db_enabled():
        await execute(
            "UPDATE test_suites SET test_case_ids=$2::jsonb,updated_at=now() WHERE id=$1",
            suite_id, json.dumps(ids),
        )
    return {"removed": True, "test_case_ids": ids}


class ReorderBody(BaseModel):
    order: list[str]


@router.put("/projects/{project_id}/suites/{suite_id}/members/reorder")
async def reorder_suite_members(project_id: str, suite_id: str, body: ReorderBody) -> dict:
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(404, "Suite not found")
    suite["test_case_ids"] = body.order
    if db_enabled():
        await execute(
            "UPDATE test_suites SET test_case_ids=$2::jsonb,updated_at=now() WHERE id=$1",
            suite_id, json.dumps(body.order),
        )
    return {"suite_id": suite_id, "test_case_ids": body.order}


# ── Suite schedule (single schedule per suite, simpler than list) ─────────────

_suite_schedules: dict[str, dict] = {}  # suite_id -> schedule


class ScheduleBody(BaseModel):
    cron_expr: str
    timezone: str = "UTC"
    enabled: bool = True
    environment_id: str | None = None


@router.get("/projects/{project_id}/suites/{suite_id}/schedule")
async def get_suite_schedule(project_id: str, suite_id: str) -> dict:
    sched = _suite_schedules.get(suite_id)
    if not sched:
        return {"cron_expr": None, "timezone": "UTC", "enabled": False, "next_run_at": None}
    return sched


@router.put("/projects/{project_id}/suites/{suite_id}/schedule")
async def set_suite_schedule(project_id: str, suite_id: str, body: ScheduleBody) -> dict:
    from datetime import timezone as _tz
    try:
        from croniter import croniter
        import datetime as _dt
        now = _dt.datetime.now(_tz.utc)
        it = croniter(body.cron_expr, now)
        next_run = it.get_next(_dt.datetime).isoformat()
    except Exception:
        next_run = None
    sched = {
        "suite_id": suite_id, "cron_expr": body.cron_expr,
        "timezone": body.timezone, "enabled": body.enabled,
        "environment_id": body.environment_id, "next_run_at": next_run,
    }
    _suite_schedules[suite_id] = sched
    return sched


# ── Suite run history ─────────────────────────────────────────────────────────

_suite_runs: dict[str, list[dict]] = {}  # suite_id -> [suite_run]


@router.get("/projects/{project_id}/suites/{suite_id}/runs")
async def list_suite_runs(project_id: str, suite_id: str) -> dict:
    from api.redis_store import get_run
    runs = _suite_runs.get(suite_id, [])
    return {"runs": runs, "total": len(runs)}


@router.get("/projects/{project_id}/suites/{suite_id}/runs/{suite_run_id}")
async def get_suite_run(project_id: str, suite_id: str, suite_run_id: str) -> dict:
    for r in _suite_runs.get(suite_id, []):
        if r["id"] == suite_run_id:
            return r
    raise HTTPException(404, "Suite run not found")
