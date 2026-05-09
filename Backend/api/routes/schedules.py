"""Suite scheduling — cron-based suite run triggers."""
from __future__ import annotations

import hmac
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from api.routes.suites import _project_suites

router = APIRouter(tags=["schedules"])

# in-memory store: schedule_id -> schedule dict
_schedules: dict[str, dict[str, Any]] = {}

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")


class ScheduleCreate(BaseModel):
    cron: str  # standard 5-part cron expression
    branch: str = "main"
    enabled: bool = True


@router.get("/projects/{project_id}/suites/{suite_id}/schedules")
def list_schedules(project_id: str, suite_id: str) -> dict:
    items = [
        s for s in _schedules.values()
        if s["project_id"] == project_id and s["suite_id"] == suite_id
    ]
    items.sort(key=lambda s: s["created_at"])
    return {"schedules": items, "total": len(items)}


@router.post("/projects/{project_id}/suites/{suite_id}/schedules", status_code=201)
def create_schedule(project_id: str, suite_id: str, body: ScheduleCreate) -> dict:
    if suite_id not in _project_suites(project_id):
        raise HTTPException(status_code=404, detail="Suite not found")
    schedule_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    schedule = {
        "id": schedule_id,
        "project_id": project_id,
        "suite_id": suite_id,
        "cron": body.cron,
        "branch": body.branch,
        "enabled": body.enabled,
        "last_triggered_at": None,
        "created_at": now,
    }
    _schedules[schedule_id] = schedule
    return schedule


@router.put("/projects/{project_id}/suites/{suite_id}/schedules/{schedule_id}")
def update_schedule(project_id: str, suite_id: str, schedule_id: str, body: ScheduleCreate) -> dict:
    s = _schedules.get(schedule_id)
    if not s or s["project_id"] != project_id or s["suite_id"] != suite_id:
        raise HTTPException(status_code=404, detail="Schedule not found")
    s["cron"] = body.cron
    s["branch"] = body.branch
    s["enabled"] = body.enabled
    return s


@router.delete("/projects/{project_id}/suites/{suite_id}/schedules/{schedule_id}")
def delete_schedule(project_id: str, suite_id: str, schedule_id: str) -> dict:
    s = _schedules.get(schedule_id)
    if not s or s["project_id"] != project_id or s["suite_id"] != suite_id:
        raise HTTPException(status_code=404, detail="Schedule not found")
    del _schedules[schedule_id]
    return {"deleted": True}


# ---------------------------------------------------------------------------
# GitHub Actions webhook
# ---------------------------------------------------------------------------

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
        # Find schedules matching this branch and trigger their suites
        triggered = []
        for s in list(_schedules.values()):
            if s.get("enabled") and (s["branch"] == branch or s["branch"] == "*"):
                s["last_triggered_at"] = datetime.now(timezone.utc).isoformat()
                triggered.append(s["suite_id"])
        return {"event": "push", "repo": repo, "branch": branch, "triggered_suites": triggered}

    return {"event": event, "status": "ignored"}
