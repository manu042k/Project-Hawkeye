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


@router.post("/projects/{project_id}/suites/{suite_id}/run", status_code=202)
async def run_suite(project_id: str, suite_id: str) -> dict:
    if db_enabled():
        row = await fetchrow("SELECT test_case_ids FROM test_suites WHERE id=$1 AND project_id=$2", suite_id, project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Suite not found")
        ids = json.loads(row["test_case_ids"]) if isinstance(row["test_case_ids"], str) else (row["test_case_ids"] or [])
        return {"suite_id": suite_id, "test_case_ids": ids, "message": "Dispatch individual runs for each test case."}
    suite = _project_suites(project_id).get(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return {"suite_id": suite_id, "test_case_ids": suite["test_case_ids"], "message": "Dispatch individual runs for each test case."}
