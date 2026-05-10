"""Visual baseline management — approve/reject screenshot comparisons."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["baselines"])

# in-memory store: project_id -> baseline_id -> baseline
_store: dict[str, dict[str, dict[str, Any]]] = {}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summary(b: dict) -> dict:
    return {
        "id": b["id"],
        "project_id": b["project_id"],
        "test_case_id": b.get("test_case_id"),
        "run_id": b.get("run_id"),
        "checkpoint_id": b.get("checkpoint_id"),
        "status": b["status"],
        "diff_pct": b.get("diff_pct"),
        "screenshot_url": b.get("screenshot_url"),
        "baseline_url": b.get("baseline_url"),
        "created_at": b["created_at"],
        "reviewed_at": b.get("reviewed_at"),
        "review_note": b.get("review_note"),
    }


@router.get("/projects/{project_id}/baselines")
async def list_baselines(
    project_id: str,
    status: str | None = None,
    test_case_id: str | None = None,
) -> dict:
    items = list(_store.get(project_id, {}).values())
    if status:
        items = [b for b in items if b["status"] == status]
    if test_case_id:
        items = [b for b in items if b.get("test_case_id") == test_case_id]
    items.sort(key=lambda b: b["created_at"], reverse=True)
    return {"baselines": [_summary(b) for b in items], "total": len(items)}


@router.get("/projects/{project_id}/baselines/{baseline_id}")
async def get_baseline(project_id: str, baseline_id: str) -> dict:
    b = _store.get(project_id, {}).get(baseline_id)
    if not b:
        raise HTTPException(404, "Baseline not found")
    return _summary(b)


@router.post("/projects/{project_id}/baselines", status_code=201)
async def create_baseline(project_id: str, body: dict) -> dict:
    """Internal: called by the agent after a visual diff run."""
    baseline_id = str(uuid.uuid4())
    b = {
        "id": baseline_id, "project_id": project_id,
        "test_case_id": body.get("test_case_id"),
        "run_id": body.get("run_id"),
        "checkpoint_id": body.get("checkpoint_id"),
        "status": "pending_review",
        "diff_pct": body.get("diff_pct"),
        "screenshot_url": body.get("screenshot_url"),
        "baseline_url": body.get("baseline_url"),
        "created_at": _utcnow(),
        "reviewed_at": None,
        "review_note": None,
    }
    _store.setdefault(project_id, {})[baseline_id] = b
    return _summary(b)


@router.post("/projects/{project_id}/baselines/{baseline_id}/approve")
async def approve_baseline(project_id: str, baseline_id: str) -> dict:
    b = _store.get(project_id, {}).get(baseline_id)
    if not b:
        raise HTTPException(404, "Baseline not found")
    b["status"] = "approved"
    b["reviewed_at"] = _utcnow()
    return {"approved": True}


class RejectBody(BaseModel):
    reason: str = ""


@router.post("/projects/{project_id}/baselines/{baseline_id}/reject")
async def reject_baseline(project_id: str, baseline_id: str, body: RejectBody) -> dict:
    b = _store.get(project_id, {}).get(baseline_id)
    if not b:
        raise HTTPException(404, "Baseline not found")
    b["status"] = "rejected"
    b["reviewed_at"] = _utcnow()
    b["review_note"] = body.reason
    return {"rejected": True}
