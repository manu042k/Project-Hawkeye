"""Full CRUD for test cases (Phase 5A).

Stores in-memory until HAWKEYE_DB_URL is set. Each test case spec is the
full TestCase Pydantic model serialised as JSON.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


@router.get("/{project_id}/test-cases")
async def list_test_cases(project_id: str, status: str = "active", q: str = "") -> dict:
    cases = list(_store.get(project_id, {}).values())
    if status != "all":
        cases = [c for c in cases if c["status"] == status]
    if q:
        q_low = q.lower()
        cases = [c for c in cases if q_low in c["spec"]["name"].lower() or q_low in c["spec"].get("goal", "").lower()]
    return {"test_cases": [_to_summary(c) for c in cases], "total": len(cases)}


@router.get("/{project_id}/test-cases/{tc_id}")
async def get_test_case(project_id: str, tc_id: str) -> dict:
    record = _store.get(project_id, {}).get(tc_id)
    if not record:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    return {**_to_summary(record), "spec": record["spec"]}


@router.put("/{project_id}/test-cases/{tc_id}")
async def update_test_case(project_id: str, tc_id: str, body: TestCaseCreate) -> dict:
    record = _store.get(project_id, {}).get(tc_id)
    if not record:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    record["spec"] = _build_spec(tc_id, body)
    record["version"] += 1
    record["updated_at"] = _utcnow()
    return _to_summary(record)


@router.delete("/{project_id}/test-cases/{tc_id}")
async def archive_test_case(project_id: str, tc_id: str) -> dict:
    record = _store.get(project_id, {}).get(tc_id)
    if not record:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    record["status"] = "archived"
    record["updated_at"] = _utcnow()
    return {"archived": True}


@router.post("/{project_id}/test-cases/{tc_id}/clone", status_code=201)
async def clone_test_case(project_id: str, tc_id: str) -> dict:
    original = _store.get(project_id, {}).get(tc_id)
    if not original:
        raise HTTPException(404, f"Test case {tc_id!r} not found")
    new_id = str(uuid.uuid4())
    new_spec = {**original["spec"], "id": new_id, "name": f"{original['spec']['name']} (copy)"}
    record = {
        "id": new_id,
        "project_id": project_id,
        "status": "draft",
        "version": 1,
        "spec": new_spec,
        "last_run_status": None,
        "last_run_at": None,
        "created_at": _utcnow(),
        "updated_at": _utcnow(),
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
