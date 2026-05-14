"""Suite scheduling — cron-based suite run triggers."""
from __future__ import annotations

import hmac
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from api.database import AsyncSessionLocal
from api.models import SuiteSchedule, TestSuite

router = APIRouter(tags=["schedules"])

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")


class ScheduleCreate(BaseModel):
    cron: str
    branch: str = "main"
    enabled: bool = True


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_dict(s: SuiteSchedule) -> dict:
    return {
        "id": s.id,
        "project_id": s.project_id,
        "suite_id": s.suite_id,
        "cron": s.cron,
        "branch": s.branch or "main",
        "enabled": s.enabled,
        "last_triggered_at": s.last_triggered_at.isoformat() if s.last_triggered_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


@router.get("/projects/{project_id}/suites/{suite_id}/schedules")
async def list_schedules(project_id: str, suite_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SuiteSchedule)
            .where(SuiteSchedule.project_id == project_id, SuiteSchedule.suite_id == suite_id)
            .order_by(SuiteSchedule.created_at)
        )
        items = result.scalars().all()
        return {"schedules": [_to_dict(s) for s in items], "total": len(items)}


@router.post("/projects/{project_id}/suites/{suite_id}/schedules", status_code=201)
async def create_schedule(project_id: str, suite_id: str, body: ScheduleCreate) -> dict:
    async with AsyncSessionLocal() as session:
        # Verify suite exists
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == suite_id, TestSuite.project_id == project_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Suite not found")
        sched = SuiteSchedule(
            id=str(uuid.uuid4()),
            project_id=project_id,
            suite_id=suite_id,
            cron=body.cron,
            branch=body.branch,
            enabled=body.enabled,
        )
        session.add(sched)
        await session.commit()
        await session.refresh(sched)
        return _to_dict(sched)


@router.put("/projects/{project_id}/suites/{suite_id}/schedules/{schedule_id}")
async def update_schedule(project_id: str, suite_id: str, schedule_id: str, body: ScheduleCreate) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SuiteSchedule).where(
                SuiteSchedule.id == schedule_id,
                SuiteSchedule.project_id == project_id,
                SuiteSchedule.suite_id == suite_id,
            )
        )
        sched = result.scalar_one_or_none()
        if not sched:
            raise HTTPException(404, "Schedule not found")
        sched.cron = body.cron
        sched.branch = body.branch
        sched.enabled = body.enabled
        await session.commit()
        await session.refresh(sched)
        return _to_dict(sched)


@router.delete("/projects/{project_id}/suites/{suite_id}/schedules/{schedule_id}")
async def delete_schedule(project_id: str, suite_id: str, schedule_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SuiteSchedule).where(
                SuiteSchedule.id == schedule_id,
                SuiteSchedule.project_id == project_id,
                SuiteSchedule.suite_id == suite_id,
            )
        )
        sched = result.scalar_one_or_none()
        if not sched:
            raise HTTPException(404, "Schedule not found")
        await session.delete(sched)
        await session.commit()
        return {"deleted": True}


# ── GitHub push webhook ───────────────────────────────────────────────────────

@router.post("/webhook/github")
async def github_webhook(request: Request) -> dict:
    body = await request.body()

    if WEBHOOK_SECRET:
        sig_header = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()  # type: ignore[attr-defined]
        if not hmac.compare_digest(sig_header, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event = request.headers.get("X-GitHub-Event", "")
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if event == "push":
        branch = payload.get("ref", "").removeprefix("refs/heads/")
        repo = payload.get("repository", {}).get("full_name", "unknown")
        triggered: list[str] = []
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SuiteSchedule).where(SuiteSchedule.enabled == True)  # noqa: E712
            )
            schedules = result.scalars().all()
            for s in schedules:
                if s.branch == branch or s.branch == "*":
                    s.last_triggered_at = _utcnow()
                    triggered.append(s.suite_id)
            await session.commit()
        return {"event": "push", "repo": repo, "branch": branch, "triggered_suites": triggered}

    return {"event": event, "status": "ignored"}
