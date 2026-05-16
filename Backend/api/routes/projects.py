from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select

from api.database import AsyncSessionLocal
from api.models import Project, ProjectMember, TestCase
from api.auth_utils import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])

TERMINAL = {"passed", "failed", "errored", "timed_out", "blocked", "cancelled"}
VALID_ROLES = {"admin", "developer", "viewer"}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_html(v: str) -> str:
    return re.sub(r"<[^>]+>", "", v).strip()


class ProjectCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    org_id: str | None = None
    settings: dict = {}

    @field_validator("name", "slug")
    @classmethod
    def sanitize(cls, v: str) -> str:
        return _strip_html(v)

    @field_validator("description")
    @classmethod
    def sanitize_desc(cls, v: str | None) -> str | None:
        return _strip_html(v) if v else v


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str | None) -> str | None:
        return _strip_html(v) if v else v

    @field_validator("description")
    @classmethod
    def sanitize_desc(cls, v: str | None) -> str | None:
        return _strip_html(v) if v else v


class MemberAdd(BaseModel):
    user_email: str
    user_name: str | None = None
    role: str = "viewer"


class MemberUpdate(BaseModel):
    role: str


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


def _member_to_dict(m: ProjectMember) -> dict:
    return {
        "id": m.id,
        "project_id": m.project_id,
        "user_email": m.user_email,
        "user_name": m.user_name,
        "role": m.role,
        "added_at": m.added_at.isoformat() if m.added_at else None,
    }


# ── Project CRUD ──────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_project(body: ProjectCreate, http_request: Request, user: dict = Depends(get_current_user)) -> dict:
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
        await session.flush()
        member = ProjectMember(
            id=str(uuid.uuid4()),
            project_id=project.id,
            user_email=user["email"],
            user_name=user.get("name"),
            role="admin",
        )
        session.add(member)
        await session.commit()
        await session.refresh(project)
        return _to_response(project)


@router.get("")
async def list_projects(user: dict = Depends(get_current_user)) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(
                Project.archived_at.is_(None),
                ProjectMember.user_email == user["email"],
            )
            .order_by(Project.created_at.desc())
        )
        projects = result.scalars().all()
        return {"projects": [_to_response(p) for p in projects], "total": len(projects)}


@router.get("/{project_id}")
async def get_project(project_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            result = await session.execute(select(Project).where(Project.slug == project_id))
            project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(404, f"Project {project_id!r} not found")
        return _to_response(project)


@router.patch("/{project_id}")
async def patch_project(project_id: str, body: ProjectUpdate) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(404, f"Project {project_id!r} not found")
        if body.name is not None:
            project.name = body.name
        if body.description is not None:
            project.description = body.description
        await session.commit()
        await session.refresh(project)
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


@router.delete("/{project_id}")
async def archive_project(project_id: str) -> dict:
    from api.job_queue import job_queue

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(404, f"Project {project_id!r} not found")
        tc_result = await session.execute(
            select(TestCase.id).where(TestCase.project_id == project_id)
        )
        tc_ids = {row[0] for row in tc_result.all()}

    if tc_ids:
        all_runs = await job_queue.list_runs()
        active = [r for r in all_runs if r.get("test_case_id") in tc_ids and r.get("status") in ("running", "queued")]
        if active:
            raise HTTPException(409, f"Project has {len(active)} active run(s). Cancel them before archiving.")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(404, f"Project {project_id!r} not found")
        project.archived_at = datetime.now(timezone.utc)
        await session.commit()
        return {"archived": True}


# ── Project stats ─────────────────────────────────────────────────────────────

@router.get("/{project_id}/stats")
async def get_project_stats(project_id: str) -> dict:
    from api.job_queue import job_queue
    from sqlalchemy import func

    # Get test case IDs belonging to this project
    async with AsyncSessionLocal() as session:
        tc_result = await session.execute(
            select(TestCase.id).where(TestCase.project_id == project_id, TestCase.status != "archived")
        )
        tc_ids = {row[0] for row in tc_result.all()}
        tc_count = len(tc_ids)

    all_runs = await job_queue.list_runs()
    runs = [r for r in all_runs if r.get("test_case_id") in tc_ids] if tc_ids else []

    total = len(runs)
    completed = sum(1 for r in runs if r.get("status") in TERMINAL)
    passed = sum(1 for r in runs if r.get("status") == "passed")
    active = sum(1 for r in runs if r.get("status") in ("running", "queued"))
    pass_rate = round(passed / completed, 4) if completed else 0.0
    cost = sum(r.get("estimated_cost_usd") or 0 for r in runs)

    return {
        "pass_rate": pass_rate,
        "total_runs": total,
        "active_runs": active,
        "test_case_count": tc_count,
        "cost_this_month_usd": round(cost, 4),
    }


# ── Project runs ──────────────────────────────────────────────────────────────

@router.get("/{project_id}/runs")
async def list_project_runs(project_id: str, user: dict = Depends(get_current_user)) -> dict:
    from api.job_queue import job_queue
    from api.auth_utils import require_project_member
    await require_project_member(project_id, user["email"])

    async with AsyncSessionLocal() as session:
        tc_result = await session.execute(
            select(TestCase.id).where(
                TestCase.project_id == project_id,
                TestCase.status != "archived",
            )
        )
        tc_ids = {row[0] for row in tc_result.all()}

    all_runs = await job_queue.list_runs()
    runs = [r for r in all_runs if r.get("test_case_id") in tc_ids]
    return {"runs": runs, "total": len(runs)}


# ── Project members ───────────────────────────────────────────────────────────

@router.get("/{project_id}/members")
async def list_project_members(project_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ProjectMember).where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.added_at)
        )
        members = result.scalars().all()
        return {"members": [_member_to_dict(m) for m in members], "total": len(members)}


@router.post("/{project_id}/members", status_code=201)
async def add_project_member(project_id: str, body: MemberAdd) -> dict:
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(VALID_ROLES)}")
    async with AsyncSessionLocal() as session:
        # Check project exists
        proj = await session.execute(select(Project).where(Project.id == project_id))
        if not proj.scalar_one_or_none():
            raise HTTPException(404, "Project not found")
        # Check not already a member
        existing = await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_email == body.user_email,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, "User is already a member of this project")
        member = ProjectMember(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_email=body.user_email,
            user_name=body.user_name,
            role=body.role,
        )
        session.add(member)
        await session.commit()
        await session.refresh(member)
        return _member_to_dict(member)


@router.patch("/{project_id}/members/{member_id}")
async def update_project_member(project_id: str, member_id: str, body: MemberUpdate) -> dict:
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(VALID_ROLES)}")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ProjectMember).where(
                ProjectMember.id == member_id,
                ProjectMember.project_id == project_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            raise HTTPException(404, "Member not found")
        if member.role == "admin" and body.role != "admin":
            admin_count_result = await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.role == "admin",
                )
            )
            if len(admin_count_result.scalars().all()) <= 1:
                raise HTTPException(400, "Cannot remove the last admin from a project")
        member.role = body.role
        await session.commit()
        await session.refresh(member)
        return _member_to_dict(member)


@router.delete("/{project_id}/members/{member_id}")
async def remove_project_member(project_id: str, member_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ProjectMember).where(
                ProjectMember.id == member_id,
                ProjectMember.project_id == project_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            raise HTTPException(404, "Member not found")
        if member.role == "admin":
            admin_count_result = await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.role == "admin",
                )
            )
            if len(admin_count_result.scalars().all()) <= 1:
                raise HTTPException(400, "Cannot remove the last admin from a project")
        await session.delete(member)
        await session.commit()
        return {"removed": True}
