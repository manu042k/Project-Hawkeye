from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["suites"])

# in-memory store: project_id -> suite_id -> suite dict
_store: dict[str, dict[str, dict[str, Any]]] = {}


class SuiteCreate(BaseModel):
    name: str
    description: str = ""
    test_case_ids: list[str] = []


class SuiteUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    test_case_ids: list[str] | None = None


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
    }


@router.get("/projects/{project_id}/suites")
def list_suites(project_id: str) -> dict:
    suites = list(_project_suites(project_id).values())
    suites.sort(key=lambda s: s["created_at"], reverse=True)
    return {"suites": [_to_summary(s) for s in suites], "total": len(suites)}


@router.post("/projects/{project_id}/suites", status_code=201)
def create_suite(project_id: str, body: SuiteCreate) -> dict:
    suite_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    suite = {
        "id": suite_id,
        "project_id": project_id,
        "name": body.name,
        "description": body.description,
        "test_case_ids": body.test_case_ids,
        "pass_rate": 0.0,
        "last_run_at": None,
        "created_at": now,
        "updated_at": now,
    }
    _project_suites(project_id)[suite_id] = suite
    return _to_summary(suite)


@router.get("/projects/{project_id}/suites/{suite_id}")
def get_suite(project_id: str, suite_id: str) -> dict:
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return _to_summary(suite)


@router.put("/projects/{project_id}/suites/{suite_id}")
def update_suite(project_id: str, suite_id: str, body: SuiteUpdate) -> dict:
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    if body.name is not None:
        suite["name"] = body.name
    if body.description is not None:
        suite["description"] = body.description
    if body.test_case_ids is not None:
        suite["test_case_ids"] = body.test_case_ids
    suite["updated_at"] = datetime.now(timezone.utc).isoformat()
    return _to_summary(suite)


@router.delete("/projects/{project_id}/suites/{suite_id}")
def delete_suite(project_id: str, suite_id: str) -> dict:
    suites = _project_suites(project_id)
    if suite_id not in suites:
        raise HTTPException(status_code=404, detail="Suite not found")
    del suites[suite_id]
    return {"deleted": True}


@router.post("/projects/{project_id}/suites/{suite_id}/run", status_code=202)
def run_suite(project_id: str, suite_id: str) -> dict:
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    # Returns list of test_case_ids; caller submits individual runs
    return {
        "suite_id": suite_id,
        "test_case_ids": suite["test_case_ids"],
        "message": "Dispatch individual runs for each test case.",
    }
