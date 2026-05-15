"""Per-project CI/CD webhook trigger.

POST /api/webhooks/{project_token}/trigger — triggered by GitHub Actions,
GitLab CI, or any other CI system. Looks up the project by its token,
dispatches the requested suite run, and returns run IDs.

Project tokens are stored in the projects table (or in-memory store).
Generate a token: python -c "import secrets; print(secrets.token_urlsafe(32))"
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["webhooks"])

# In dev, map token -> project_id via env var: HAWKEYE_WEBHOOK_TOKEN=<token>:<project_id>
# In prod the token is stored in the projects table.
_TOKEN_MAP: dict[str, str] = {}
_raw = os.environ.get("HAWKEYE_WEBHOOK_TOKEN", "")
if ":" in _raw:
    _tok, _pid = _raw.split(":", 1)
    _TOKEN_MAP[_tok] = _pid


class TriggerRequest(BaseModel):
    suite_id: str
    environment: str = "staging"
    ref: str = "main"
    model: str | None = None
    target_url: str | None = None


@router.post("/webhooks/{project_token}/trigger", status_code=202)
async def trigger_webhook(project_token: str, body: TriggerRequest) -> dict:
    """Dispatch all test cases in the named suite as individual Celery tasks."""
    from api.db import db_enabled, fetchrow, fetch
    import json

    # Resolve project from token
    project_id: str | None = _TOKEN_MAP.get(project_token)
    if not project_id and db_enabled():
        row = await fetchrow("SELECT id FROM projects WHERE webhook_token=$1", project_token)
        if row:
            project_id = str(row["id"])
    if not project_id:
        raise HTTPException(401, "Invalid webhook token")

    # Resolve suite
    from api.database import AsyncSessionLocal
    from api.models import TestSuite
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(TestSuite).where(TestSuite.id == body.suite_id, TestSuite.project_id == project_id)
        )
        suite = result.scalar_one_or_none()
    if not suite:
        raise HTTPException(404, "Suite not found")
    tc_ids = suite.test_case_ids or []

    # Dispatch one Celery task per test case
    from api.tasks import run_test_case
    from api.schemas import RunRequest
    import uuid

    run_ids: list[str] = []
    for tc_id in tc_ids:
        run_id = str(uuid.uuid4())
        req = RunRequest(
            test_case_id=tc_id,
            model=body.model or "nvidia:moonshotai/kimi-k2.6",
        )
        run_test_case.delay(run_id, req.model_dump())
        run_ids.append(run_id)

    return {
        "triggered": True,
        "project_id": project_id,
        "suite_id": body.suite_id,
        "ref": body.ref,
        "environment": body.environment,
        "run_ids": run_ids,
        "total": len(run_ids),
    }
