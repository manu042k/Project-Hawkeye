"""Full CRUD for test cases (Phase 5A) — SQLAlchemy backed."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from api.database import AsyncSessionLocal
from api.models import TestCase
from api.auth_utils import get_current_user, require_project_member
from orchestrator.loader.yaml_loader import load_test_case

router = APIRouter(prefix="/projects", tags=["test-cases"])

_TEST_CASES_DIR = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CheckpointBody(BaseModel):
    id: str
    description: str
    success_signal: str
    data: dict | None = None


class StepsBody(BaseModel):
    checkpoints: list[CheckpointBody] = []


class AssertionBody(BaseModel):
    id: str
    type: str
    description: str
    params: dict = {}


class ViewportBody(BaseModel):
    width: int = 1280
    height: int = 720
    device_scale_factor: float = 1.0


class VaultEntryBody(BaseModel):
    key: str
    value: str


class TargetBody(BaseModel):
    url: str
    browser: str = "chromium"
    viewport: ViewportBody | None = None
    page_type: str = "spa"
    app_description: str | None = None
    vault: list[VaultEntryBody] = []
    locale: str | None = None
    timezone: str | None = None
    extra_headers: dict[str, str] | None = None
    block_urls: list[str] = []


class OnFailureCaptureBody(BaseModel):
    screenshot: bool = True
    dom_snapshot: bool = True
    network_log: bool = True
    console_log: bool = True
    agent_trace: bool = True
    video: bool = False


class OnFailureBody(BaseModel):
    capture: OnFailureCaptureBody = OnFailureCaptureBody()
    notify: dict = {}


class ConstraintsBody(BaseModel):
    max_steps: int = 30
    timeout_seconds: int = 180
    max_retries_per_action: int = 2


class GoalBody(BaseModel):
    objective: str
    constraints: ConstraintsBody = ConstraintsBody()
    extra_details: str | None = None
    steps: StepsBody | None = None


class TestCaseCreate(BaseModel):
    name: str
    goal: GoalBody
    target: TargetBody
    suite: str | None = None
    priority: str = "P1"
    tags: list[str] = []
    save_record: bool = False
    created_by: str | None = None
    project: str | None = None
    assertions: list[AssertionBody] = []
    on_failure: OnFailureBody | None = None


def _clean(val: str | None) -> str | None:
    if not val or (val.startswith("<") and val.endswith(">")):
        return None
    return val


def _dt(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    return v.isoformat()


def _to_summary(tc: TestCase) -> dict:
    spec = tc.spec or {}
    return {
        "id": tc.id,
        "name": tc.name,
        "status": tc.status,
        "version": tc.version,
        "priority": tc.priority or spec.get("priority", "P1"),
        "tags": tc.tags or [],
        "created_by": _clean(tc.created_by or spec.get("created_by")),
        "last_run_status": tc.last_run_status,
        "last_run_at": _dt(tc.last_run_at),
        "last_run_by": tc.last_run_by,
        "created_at": _dt(tc.created_at),
        "updated_at": _dt(tc.updated_at),
    }


def _build_spec(tc_id: str, body: TestCaseCreate) -> dict:
    return {
        "id": tc_id,
        "name": body.name,
        "goal": {
            "objective": body.goal.objective,
            "constraints": body.goal.constraints.model_dump(),
            "extra_details": body.goal.extra_details,
            "steps": body.goal.steps.model_dump() if body.goal.steps else None,
        },
        "suite": body.suite,
        "target": body.target.model_dump(),
        "priority": body.priority,
        "tags": body.tags,
        "save_record": body.save_record,
        "created_by": body.created_by,
        "project": body.project,
        "assertions": [a.model_dump() for a in body.assertions],
        "on_failure": body.on_failure.model_dump() if body.on_failure else None,
    }


async def _enrich_with_run_info(summaries: list[dict]) -> list[dict]:
    from api.redis_store import list_runs
    try:
        all_runs = await list_runs()
    except Exception:
        return summaries
    latest: dict[str, dict] = {}
    for r in all_runs:
        tc_id = r.get("test_case_id") or r.get("request", {}).get("test_case_id")
        if not tc_id:
            continue
        existing = latest.get(tc_id)
        if not existing or r.get("created_at", "") > existing.get("created_at", ""):
            latest[tc_id] = r
    for s in summaries:
        run = latest.get(s["id"])
        if run:
            s["last_run_status"] = run.get("status")
            s["last_run_at"] = run.get("completed_at") or run.get("created_at")
            s["last_run_by"] = run.get("triggered_by")
    return summaries


@router.post("/{project_id}/test-cases", status_code=201)
async def create_test_case(project_id: str, body: TestCaseCreate, http_request: Request, user: dict = Depends(get_current_user)) -> dict:
    await require_project_member(project_id, user["email"])
    if not body.created_by:
        user_email = http_request.headers.get("X-User-Email")
        if user_email:
            body = body.model_copy(update={"created_by": user_email})
    tc_id = str(uuid.uuid4())
    spec = _build_spec(tc_id, body)
    async with AsyncSessionLocal() as session:
        tc = TestCase(
            id=tc_id,
            project_id=project_id,
            name=body.name,
            status="active",
            version=1,
            priority=body.priority,
            tags=body.tags or [],
            spec=spec,
            created_by=body.created_by,
        )
        session.add(tc)
        await session.commit()
        await session.refresh(tc)
        return _to_summary(tc)


@router.get("/{project_id}/test-cases")
async def list_test_cases(project_id: str, status: str = "active", q: str = "", user: dict = Depends(get_current_user)) -> dict:
    await require_project_member(project_id, user["email"])
    async with AsyncSessionLocal() as session:
        stmt = select(TestCase).where(TestCase.project_id == project_id)
        if status != "all":
            stmt = stmt.where(TestCase.status == status)
        stmt = stmt.order_by(TestCase.created_at.desc())
        result = await session.execute(stmt)
        cases = result.scalars().all()
        summaries = [_to_summary(c) for c in cases]
        if q:
            q_low = q.lower()
            summaries = [s for s in summaries if q_low in s["name"].lower()]
        summaries = await _enrich_with_run_info(summaries)
        return {"test_cases": summaries, "total": len(summaries)}


@router.get("/{project_id}/test-cases/{tc_id}")
async def get_test_case(project_id: str, tc_id: str, user: dict = Depends(get_current_user)) -> dict:
    await require_project_member(project_id, user["email"])
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestCase).where(TestCase.id == tc_id, TestCase.project_id == project_id)
        )
        tc = result.scalar_one_or_none()
        if not tc:
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        summary = _to_summary(tc)
        enriched = await _enrich_with_run_info([summary])
        s = enriched[0]
        spec = tc.spec or {}
        return {**s, "save_record": spec.get("save_record", False), "spec": spec}


@router.put("/{project_id}/test-cases/{tc_id}")
async def update_test_case(project_id: str, tc_id: str, body: TestCaseCreate, user: dict = Depends(get_current_user)) -> dict:
    await require_project_member(project_id, user["email"])
    spec = _build_spec(tc_id, body)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestCase).where(TestCase.id == tc_id, TestCase.project_id == project_id)
        )
        tc = result.scalar_one_or_none()
        if not tc:
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        tc.name = body.name
        tc.priority = body.priority
        tc.tags = body.tags or []
        tc.spec = spec
        tc.version = (tc.version or 1) + 1
        tc.updated_at = _utcnow()
        await session.commit()
        await session.refresh(tc)
        return _to_summary(tc)


@router.delete("/{project_id}/test-cases/{tc_id}")
async def archive_test_case(project_id: str, tc_id: str, user: dict = Depends(get_current_user)) -> dict:
    await require_project_member(project_id, user["email"])
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestCase).where(TestCase.id == tc_id, TestCase.project_id == project_id)
        )
        tc = result.scalar_one_or_none()
        if not tc:
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        tc.status = "archived"
        tc.updated_at = _utcnow()
        await session.commit()
        return {"archived": True}


@router.post("/{project_id}/test-cases/{tc_id}/clone", status_code=201)
async def clone_test_case(project_id: str, tc_id: str, user: dict = Depends(get_current_user)) -> dict:
    await require_project_member(project_id, user["email"])
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestCase).where(TestCase.id == tc_id, TestCase.project_id == project_id)
        )
        original = result.scalar_one_or_none()
        if not original:
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        new_id = str(uuid.uuid4())
        new_spec = {**(original.spec or {}), "id": new_id, "name": f"{original.name} (copy)"}
        clone = TestCase(
            id=new_id,
            project_id=project_id,
            name=f"{original.name} (copy)",
            status=original.status,
            version=1,
            priority=original.priority or "P1",
            tags=list(original.tags or []),
            spec=new_spec,
            created_by=original.created_by,
        )
        session.add(clone)
        await session.commit()
        await session.refresh(clone)
        return _to_summary(clone)


@router.post("/{project_id}/test-cases/import-yaml", status_code=201)
async def import_yaml(project_id: str, body: dict) -> dict:
    yaml_content: str = body.get("yaml_content", "")
    if not yaml_content:
        raise HTTPException(422, "yaml_content is required")
    import tempfile, os
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write(yaml_content)
        tmp_path = f.name
    try:
        tc = load_test_case(tmp_path)
    except Exception as exc:
        raise HTTPException(422, str(exc))
    finally:
        os.unlink(tmp_path)
    spec = tc.model_dump()
    tc_id = spec.get("id") or str(uuid.uuid4())
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(TestCase).where(TestCase.id == tc_id))
        if existing.scalar_one_or_none():
            tc_id = str(uuid.uuid4())
            spec["id"] = tc_id
        record = TestCase(
            id=tc_id,
            project_id=project_id,
            name=spec.get("name", "Imported Test"),
            status="active",
            version=1,
            priority=spec.get("priority", "P1"),
            tags=spec.get("tags", []),
            spec=spec,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return _to_summary(record)


@router.get("/{project_id}/test-cases/{tc_id}/runs")
async def get_test_case_runs(project_id: str, tc_id: str, limit: int = 20, page: int = 1) -> dict:
    from api.redis_store import list_runs
    from api.routes.runs import _record_to_response
    all_runs = await list_runs()
    matched = [
        r for r in all_runs
        if r.get("test_case_id") == tc_id
        or r.get("request", {}).get("test_case_id") == tc_id
    ]
    matched.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    start = (page - 1) * limit
    page_items = [_record_to_response(r).model_dump() for r in matched[start: start + limit]]
    return {"runs": page_items, "total": len(matched), "page": page, "limit": limit}


async def seed_from_yaml_dir(project_id: str = "default") -> None:
    """Import YAML test cases from orchestrator/test_cases/ — skips existing IDs."""
    records: list[dict] = []
    for yaml_path in sorted(_TEST_CASES_DIR.glob("*.yaml")):
        try:
            tc = load_test_case(yaml_path)
            spec = tc.model_dump()
            tc_id = spec.get("id") or str(uuid.uuid4())
            records.append({
                "id": tc_id,
                "name": spec.get("name", yaml_path.stem),
                "priority": spec.get("priority", "P1"),
                "tags": spec.get("tags", []),
                "spec": spec,
            })
        except Exception:
            continue

    if not records:
        return

    async with AsyncSessionLocal() as session:
        for r in records:
            existing = await session.execute(select(TestCase).where(TestCase.id == r["id"]))
            if existing.scalar_one_or_none():
                continue
            session.add(TestCase(
                id=r["id"],
                project_id=project_id,
                name=r["name"],
                status="active",
                version=1,
                priority=r["priority"],
                tags=r["tags"],
                spec=r["spec"],
            ))
        await session.commit()
