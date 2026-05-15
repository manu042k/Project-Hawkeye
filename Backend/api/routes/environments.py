"""Project environment CRUD."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db import db_enabled, fetch, fetchrow, execute

router = APIRouter(tags=["environments"])

_store: dict[str, dict[str, dict[str, Any]]] = {}  # project_id -> env_id -> env


class EnvCreate(BaseModel):
    name: str
    base_url: str
    is_default: bool = False
    headers: dict[str, str] = {}


class EnvUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    is_default: bool | None = None
    headers: dict[str, str] | None = None


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row(r: dict) -> dict:
    import json
    headers = r.get("headers") or {}
    if isinstance(headers, str):
        headers = json.loads(headers)
    return {
        "id": str(r["id"]),
        "project_id": str(r["project_id"]),
        "name": r["name"],
        "base_url": r["base_url"],
        "is_default": bool(r["is_default"]),
        "headers": headers,
        "created_at": str(r["created_at"]),
    }


@router.get("/projects/{project_id}/environments")
async def list_environments(project_id: str) -> dict:
    if db_enabled():
        rows = await fetch("SELECT * FROM environments WHERE project_id=$1 ORDER BY created_at", project_id)
        items = [_row(dict(r)) for r in rows]
        return {"environments": items, "total": len(items)}
    items = list(_store.get(project_id, {}).values())
    return {"environments": items, "total": len(items)}


@router.post("/projects/{project_id}/environments", status_code=201)
async def create_environment(project_id: str, body: EnvCreate) -> dict:
    import json
    if db_enabled():
        if body.is_default:
            await execute("UPDATE environments SET is_default=false WHERE project_id=$1", project_id)
        row = await fetchrow(
            """INSERT INTO environments (id,project_id,name,base_url,is_default,headers,created_at)
               VALUES (gen_random_uuid(),$1,$2,$3,$4,$5::jsonb,now()) RETURNING *""",
            project_id, body.name, body.base_url, body.is_default, json.dumps(body.headers),
        )
        return _row(dict(row))  # type: ignore[arg-type]
    if body.is_default:
        for e in _store.get(project_id, {}).values():
            e["is_default"] = False
    env_id = str(uuid.uuid4())
    env = {
        "id": env_id, "project_id": project_id, "name": body.name,
        "base_url": body.base_url, "is_default": body.is_default,
        "headers": body.headers, "created_at": _utcnow(),
    }
    _store.setdefault(project_id, {})[env_id] = env
    return env


@router.put("/projects/{project_id}/environments/{env_id}")
async def update_environment(project_id: str, env_id: str, body: EnvUpdate) -> dict:
    import json
    if db_enabled():
        row = await fetchrow("SELECT * FROM environments WHERE id=$1 AND project_id=$2", env_id, project_id)
        if not row:
            raise HTTPException(404, "Environment not found")
        r = dict(row)
        name = body.name if body.name is not None else r["name"]
        base_url = body.base_url if body.base_url is not None else r["base_url"]
        is_def = body.is_default if body.is_default is not None else r["is_default"]
        headers = json.dumps(body.headers) if body.headers is not None else json.dumps(r.get("headers") or {})
        if is_def:
            await execute("UPDATE environments SET is_default=false WHERE project_id=$1 AND id!=$2", project_id, env_id)
        row = await fetchrow(
            "UPDATE environments SET name=$2,base_url=$3,is_default=$4,headers=$5::jsonb WHERE id=$1 RETURNING *",
            env_id, name, base_url, is_def, headers,
        )
        return _row(dict(row))  # type: ignore[arg-type]
    env = _store.get(project_id, {}).get(env_id)
    if not env:
        raise HTTPException(404, "Environment not found")
    if body.name is not None: env["name"] = body.name
    if body.base_url is not None: env["base_url"] = body.base_url
    if body.is_default is not None:
        if body.is_default:
            for e in _store.get(project_id, {}).values():
                e["is_default"] = False
        env["is_default"] = body.is_default
    if body.headers is not None: env["headers"] = body.headers
    return env


@router.delete("/projects/{project_id}/environments/{env_id}")
async def delete_environment(project_id: str, env_id: str) -> dict:
    if db_enabled():
        tag = await execute("DELETE FROM environments WHERE id=$1 AND project_id=$2", env_id, project_id)
        if tag == "DELETE 0":
            raise HTTPException(404, "Environment not found")
        return {"deleted": True}
    envs = _store.get(project_id, {})
    if env_id not in envs:
        raise HTTPException(404, "Environment not found")
    del envs[env_id]
    return {"deleted": True}
