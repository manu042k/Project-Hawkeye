"""Per-project integration config — GitHub, Slack, generic webhooks."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db import db_enabled, fetch, fetchrow, execute

router = APIRouter(tags=["integrations"])

_store: dict[str, dict[str, dict[str, Any]]] = {}  # project_id -> integration_id -> record


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row(r: dict) -> dict:
    import json
    cfg = r.get("config") or {}
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    return {
        "id": str(r["id"]),
        "project_id": str(r["project_id"]),
        "type": r["type"],
        "enabled": bool(r.get("enabled", True)),
        "config": cfg,
        "created_at": str(r["created_at"]),
    }


@router.get("/projects/{project_id}/integrations")
async def list_integrations(project_id: str) -> dict:
    if db_enabled():
        rows = await fetch("SELECT * FROM integrations WHERE project_id=$1 ORDER BY created_at", project_id)
        items = [_row(dict(r)) for r in rows]
        return {"integrations": items, "total": len(items)}
    items = list(_store.get(project_id, {}).values())
    return {"integrations": items, "total": len(items)}


class GitHubIntegration(BaseModel):
    repo: str              # "org/repo"
    installation_id: int
    suite_id: str | None = None
    branch: str = "main"


@router.post("/projects/{project_id}/integrations/github", status_code=201)
async def create_github_integration(project_id: str, body: GitHubIntegration) -> dict:
    import json
    cfg = body.model_dump()
    if db_enabled():
        row = await fetchrow(
            """INSERT INTO integrations (id,project_id,type,config,enabled,created_at)
               VALUES (gen_random_uuid(),$1,'github',$2::jsonb,true,now()) RETURNING *""",
            project_id, json.dumps(cfg),
        )
        return _row(dict(row))  # type: ignore[arg-type]
    int_id = str(uuid.uuid4())
    record = {"id": int_id, "project_id": project_id, "type": "github",
              "enabled": True, "config": cfg, "created_at": _utcnow()}
    _store.setdefault(project_id, {})[int_id] = record
    return record


class SlackIntegration(BaseModel):
    webhook_url: str
    notify_on: list[str] = ["failure"]


@router.post("/projects/{project_id}/integrations/slack", status_code=201)
async def create_slack_integration(project_id: str, body: SlackIntegration) -> dict:
    import json
    cfg = body.model_dump()
    if db_enabled():
        row = await fetchrow(
            """INSERT INTO integrations (id,project_id,type,config,enabled,created_at)
               VALUES (gen_random_uuid(),$1,'slack',$2::jsonb,true,now()) RETURNING *""",
            project_id, json.dumps(cfg),
        )
        return _row(dict(row))  # type: ignore[arg-type]
    int_id = str(uuid.uuid4())
    record = {"id": int_id, "project_id": project_id, "type": "slack",
              "enabled": True, "config": cfg, "created_at": _utcnow()}
    _store.setdefault(project_id, {})[int_id] = record
    return record


@router.delete("/projects/{project_id}/integrations/{integration_id}")
async def delete_integration(project_id: str, integration_id: str) -> dict:
    if db_enabled():
        tag = await execute("DELETE FROM integrations WHERE id=$1 AND project_id=$2", integration_id, project_id)
        if tag == "DELETE 0":
            raise HTTPException(404, "Integration not found")
        return {"deleted": True}
    store = _store.get(project_id, {})
    if integration_id not in store:
        raise HTTPException(404, "Integration not found")
    del store[integration_id]
    return {"deleted": True}
