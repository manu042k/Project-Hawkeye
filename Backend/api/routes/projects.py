from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/projects", tags=["projects"])

# In-memory store until HAWKEYE_DB_URL is set.
_projects: dict[str, dict] = {}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProjectCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    org_id: str | None = None
    settings: dict = {}


def _to_response(p: dict) -> dict:
    return {
        "id": p["id"],
        "name": p["name"],
        "slug": p["slug"],
        "description": p.get("description"),
        "org_id": p.get("org_id"),
        "settings": p.get("settings", {}),
        "created_at": p["created_at"],
        "archived_at": p.get("archived_at"),
    }


@router.post("", status_code=201)
async def create_project(body: ProjectCreate) -> dict:
    project_id = str(uuid.uuid4())
    record = {
        "id": project_id,
        "name": body.name,
        "slug": body.slug,
        "description": body.description,
        "org_id": body.org_id,
        "settings": body.settings,
        "created_at": _utcnow(),
        "archived_at": None,
    }
    _projects[project_id] = record
    return _to_response(record)


@router.get("")
async def list_projects() -> dict:
    projects = [_to_response(p) for p in _projects.values() if not p.get("archived_at")]
    return {"projects": projects, "total": len(projects)}


@router.get("/{project_id}")
async def get_project(project_id: str) -> dict:
    p = _projects.get(project_id)
    if not p:
        raise HTTPException(404, f"Project {project_id!r} not found")
    return _to_response(p)


@router.put("/{project_id}")
async def update_project(project_id: str, body: ProjectCreate) -> dict:
    p = _projects.get(project_id)
    if not p:
        raise HTTPException(404, f"Project {project_id!r} not found")
    p.update({"name": body.name, "slug": body.slug, "description": body.description,
              "settings": body.settings})
    return _to_response(p)


@router.get("/{project_id}/stats")
async def get_project_stats(project_id: str) -> dict:
    from api.job_queue import job_queue
    runs = await job_queue.list_runs()
    total = len(runs)
    passed = sum(1 for r in runs if r.get("status") == "passed")
    active = sum(1 for r in runs if r.get("status") == "running")
    pass_rate = round(passed / total, 4) if total else 0.0
    cost = sum(r.get("estimated_cost_usd") or 0 for r in runs)
    return {
        "pass_rate": pass_rate,
        "total_runs": total,
        "active_runs": active,
        "cost_this_month_usd": round(cost, 4),
    }
