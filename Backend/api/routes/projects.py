from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update

from api.database import AsyncSessionLocal
from api.models import Project

router = APIRouter(prefix="/projects", tags=["projects"])


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProjectCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    org_id: str | None = None
    settings: dict = {}


def _to_response(p: Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "description": p.description,
        "org_id": p.org_id,
        "settings": p.settings or {},
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "archived_at": p.archived_at.isoformat() if p.archived_at else None,
    }


@router.post("", status_code=201)
async def create_project(body: ProjectCreate) -> dict:
    async with AsyncSessionLocal() as session:
        project = Project(
            id=str(uuid.uuid4()),
            name=body.name,
            slug=body.slug,
            description=body.description,
            org_id=body.org_id,
            settings=body.settings or {},
        )
        session.add(project)
        await session.commit()
        await session.refresh(project)
        return _to_response(project)


@router.get("")
async def list_projects() -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Project).where(Project.archived_at.is_(None)).order_by(Project.created_at.desc())
        )
        projects = result.scalars().all()
        return {"projects": [_to_response(p) for p in projects], "total": len(projects)}


@router.get("/{project_id}")
async def get_project(project_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            # Also try slug lookup
            result = await session.execute(select(Project).where(Project.slug == project_id))
            project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(404, f"Project {project_id!r} not found")
        return _to_response(project)


@router.put("/{project_id}")
async def update_project(project_id: str, body: ProjectCreate) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(404, f"Project {project_id!r} not found")
        project.name = body.name
        project.slug = body.slug
        project.description = body.description
        project.settings = body.settings or {}
        await session.commit()
        await session.refresh(project)
        return _to_response(project)


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
