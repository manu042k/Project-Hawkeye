"""Full CRUD for test cases (Phase 5A).

Falls back to in-memory store when HAWKEYE_DB_URL is not set.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db import db_enabled, fetch, fetchrow, execute
from orchestrator.loader.yaml_loader import load_test_case
from orchestrator.models.test_case import TestCase

router = APIRouter(prefix="/projects", tags=["test-cases"])

_TEST_CASES_DIR = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases"

# project_id -> { tc_id -> record }
_store: dict[str, dict[str, dict]] = {}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class CheckpointBody(BaseModel):
    id: str
    description: str
    success_signal: str
    data: dict | None = None


class StepsBody(BaseModel):
    mode: str = "guided"
    checkpoints: list[CheckpointBody] = []


class AssertionBody(BaseModel):
    id: str
    type: str
    description: str
    params: dict = {}


class TargetBody(BaseModel):
    url: str
    browser: str = "chromium"
    auth: dict | None = None


class ConstraintsBody(BaseModel):
    max_steps: int = 30
    timeout_seconds: int = 180
    navigation_policy: str = "interact_only"
    forbidden_actions: list[str] = []
    required_behaviors: list[str] = []


class ContextBody(BaseModel):
    app_description: str | None = None
    hints: list[str] = []
    known_issues: list[str] = []
    page_type: str = "spa"


class TestCaseCreate(BaseModel):
    name: str
    goal: str
    target: TargetBody
    priority: str = "P1"
    tags: list[str] = []
    steps: StepsBody | None = None
    assertions: list[AssertionBody] = []
    constraints: ConstraintsBody = ConstraintsBody()
    context: ContextBody = ContextBody()


def _to_summary(tc: dict) -> dict:
    return {
        "id": tc["id"],
        "name": tc["spec"]["name"],
        "status": tc["status"],
        "version": tc["version"],
        "priority": tc["spec"].get("priority", "P1"),
        "tags": tc["spec"].get("tags", []),
        "last_run_status": tc.get("last_run_status"),
        "last_run_at": tc.get("last_run_at"),
        "created_at": tc["created_at"],
        "updated_at": tc["updated_at"],
    }


def _row_to_summary(row: dict) -> dict:
    """Convert a DB row (from test_cases table) to summary shape."""
    spec = row.get("spec") or {}
    if isinstance(spec, str):
        spec = json.loads(spec)
    tags = row.get("tags") or []
    if isinstance(tags, str):
        tags = json.loads(tags)
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "status": row["status"],
        "version": row["version"],
        "priority": row.get("priority") or spec.get("priority", "P1"),
        "tags": tags,
        "last_run_status": row.get("last_run_status"),
        "last_run_at": str(row["last_run_at"]) if row.get("last_run_at") else None,
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }


def _build_spec(tc_id: str, body: TestCaseCreate) -> dict:
    return {
        "id": tc_id,
        "name": body.name,
        "goal": body.goal,
        "target": body.target.model_dump(),
        "priority": body.priority,
        "tags": body.tags,
        "steps": body.steps.model_dump() if body.steps else None,
        "assertions": [a.model_dump() for a in body.assertions],
        "constraints": body.constraints.model_dump(),
        "context": body.context.model_dump(),
    }


@router.post("/{project_id}/test-cases", status_code=201)
async def create_test_case(project_id: str, body: TestCaseCreate) -> dict:
    tc_id = str(uuid.uuid4())
    spec = _build_spec(tc_id, body)
    if db_enabled():
        row = await fetchrow(
            """INSERT INTO test_cases
               (id, project_id, status, version, name, priority, tags, spec, created_at, updated_at)
               VALUES ($1,$2,'active',1,$3,$4,$5::jsonb,$6::jsonb,now(),now())
               RETURNING *""",
            tc_id, project_id, body.name, body.priority,
            json.dumps(body.tags), json.dumps(spec),
        )
        return _row_to_summary(dict(row))  # type: ignore[arg-type]
    record = {
        "id": tc_id, "project_id": project_id, "status": "active", "version": 1,
        "spec": spec, "last_run_status": None, "last_run_at": None,
        "created_at": _utcnow(), "updated_at": _utcnow(),
    }
    _store.setdefault(project_id, {})[tc_id] = record
    return _to_summary(record)


@router.get("/{project_id}/test-cases")
async def list_test_cases(project_id: str, status: str = "active", q: str = "") -> dict:
    if db_enabled():
        sql = "SELECT * FROM test_cases WHERE project_id=$1"
        args: list = [project_id]
        if status != "all":
            sql += " AND status=$2"
            args.append(status)
        sql += " ORDER BY created_at DESC"
        rows = await fetch(sql, *args)
        if q:
            q_low = q.lower()
            rows = [r for r in rows if q_low in r["name"].lower()]
        summaries = [_row_to_summary(r) for r in rows]
        return {"test_cases": summaries, "total": len(summaries)}
    cases = list(_store.get(project_id, {}).values())
    if status != "all":
        cases = [c for c in cases if c["status"] == status]
    if q:
        q_low = q.lower()
        cases = [c for c in cases if q_low in c["spec"]["name"].lower() or q_low in c["spec"].get("goal", "").lower()]
    return {"test_cases": [_to_summary(c) for c in cases], "total": len(cases)}


@router.get("/{project_id}/test-cases/{tc_id}")
async def get_test_case(project_id: str, tc_id: str) -> dict:
    if db_enabled():
        row = await fetchrow("SELECT * FROM test_cases WHERE id=$1 AND project_id=$2", tc_id, project_id)
        if not row:
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        r = dict(row)
        return {**_row_to_summary(r), "spec": r["spec"]}
    record = _store.get(project_id, {}).get(tc_id)
    if not record:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    return {**_to_summary(record), "spec": record["spec"]}


@router.put("/{project_id}/test-cases/{tc_id}")
async def update_test_case(project_id: str, tc_id: str, body: TestCaseCreate) -> dict:
    spec = _build_spec(tc_id, body)
    if db_enabled():
        row = await fetchrow(
            """UPDATE test_cases SET name=$3, priority=$4, tags=$5::jsonb, spec=$6::jsonb,
               version=version+1, updated_at=now()
               WHERE id=$1 AND project_id=$2 RETURNING *""",
            tc_id, project_id, body.name, body.priority,
            json.dumps(body.tags), json.dumps(spec),
        )
        if not row:
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        return _row_to_summary(dict(row))  # type: ignore[arg-type]
    record = _store.get(project_id, {}).get(tc_id)
    if not record:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    record["spec"] = spec
    record["version"] += 1
    record["updated_at"] = _utcnow()
    return _to_summary(record)


@router.delete("/{project_id}/test-cases/{tc_id}")
async def archive_test_case(project_id: str, tc_id: str) -> dict:
    if db_enabled():
        tag = await execute(
            "UPDATE test_cases SET status='archived', updated_at=now() WHERE id=$1 AND project_id=$2",
            tc_id, project_id,
        )
        if tag == "UPDATE 0":
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        return {"archived": True}
    record = _store.get(project_id, {}).get(tc_id)
    if not record:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    record["status"] = "archived"
    record["updated_at"] = _utcnow()
    return {"archived": True}


@router.post("/{project_id}/test-cases/{tc_id}/clone", status_code=201)
async def clone_test_case(project_id: str, tc_id: str) -> dict:
    if db_enabled():
        original = await fetchrow("SELECT * FROM test_cases WHERE id=$1 AND project_id=$2", tc_id, project_id)
        if not original:
            raise HTTPException(404, f"Test case {tc_id!r} not found")
        orig = dict(original)
        new_id = str(uuid.uuid4())
        spec = orig["spec"]
        if isinstance(spec, str):
            spec = json.loads(spec)
        spec["id"] = new_id
        spec["name"] = f"{orig['name']} (copy)"
        row = await fetchrow(
            """INSERT INTO test_cases (id,project_id,status,version,name,priority,tags,spec,created_at,updated_at)
               VALUES ($1,$2,'draft',1,$3,$4,$5::jsonb,$6::jsonb,now(),now()) RETURNING *""",
            new_id, project_id, spec["name"], orig.get("priority", "P1"),
            json.dumps(orig.get("tags") or []), json.dumps(spec),
        )
        return _row_to_summary(dict(row))  # type: ignore[arg-type]
    original = _store.get(project_id, {}).get(tc_id)
    if not original:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    new_id = str(uuid.uuid4())
    new_spec = {**original["spec"], "id": new_id, "name": f"{original['spec']['name']} (copy)"}
    record = {
        "id": new_id, "project_id": project_id, "status": "draft", "version": 1,
        "spec": new_spec, "last_run_status": None, "last_run_at": None,
        "created_at": _utcnow(), "updated_at": _utcnow(),
    }
    _store.setdefault(project_id, {})[new_id] = record
    return _to_summary(record)


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
    tc_id = spec["id"] or str(uuid.uuid4())
    record = {
        "id": tc_id,
        "project_id": project_id,
        "status": "active",
        "version": 1,
        "spec": spec,
        "last_run_status": None,
        "last_run_at": None,
        "created_at": _utcnow(),
        "updated_at": _utcnow(),
    }
    _store.setdefault(project_id, {})[tc_id] = record
    return _to_summary(record)


def seed_from_yaml_dir(project_id: str = "default") -> None:
    """Import all YAML test cases from orchestrator/test_cases/ into the default project."""
    for yaml_path in sorted(_TEST_CASES_DIR.glob("*.yaml")):
        try:
            tc = load_test_case(yaml_path)
            spec = tc.model_dump()
            tc_id = spec["id"] or str(uuid.uuid4())
            if tc_id not in _store.get(project_id, {}):
                record = {
                    "id": tc_id,
                    "project_id": project_id,
                    "status": "active",
                    "version": 1,
                    "spec": spec,
                    "last_run_status": None,
                    "last_run_at": None,
                    "created_at": _utcnow(),
                    "updated_at": _utcnow(),
                }
                _store.setdefault(project_id, {})[tc_id] = record
        except Exception:
            continue
