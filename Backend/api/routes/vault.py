from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db import db_enabled, fetch, fetchrow, execute
from api.crypto import encrypt, decrypt, encryption_enabled

router = APIRouter(tags=["vault"])

# in-memory fallback: project_id -> secret_id -> secret dict
_store: dict[str, dict[str, dict[str, Any]]] = {}


class SecretCreate(BaseModel):
    name: str
    value: str
    environment: str = "Development"
    type: str = "API Key"


class SecretUpdate(BaseModel):
    value: str | None = None
    environment: str | None = None
    type: str | None = None


def _project_secrets(project_id: str) -> dict[str, dict[str, Any]]:
    return _store.setdefault(project_id, {})


def _to_response(s: dict[str, Any], reveal: bool = False) -> dict[str, Any]:
    return {
        "id": s["id"],
        "name": s["name"],
        "environment": s["environment"],
        "type": s["type"],
        "masked_value": "•" * 16,
        "value": s["value"] if reveal else None,
        "updated_at": s["updated_at"],
        "created_at": s["created_at"],
    }


def _encode_secret(value: str) -> tuple[str, str]:
    """Return (stored_value, iv_b64). Encrypts when key available, else stores plaintext."""
    if encryption_enabled():
        ct, iv = encrypt(value)
        return base64.b64encode(ct).decode(), base64.b64encode(iv).decode()
    return value, ""


def _decode_secret(stored: str, iv_b64: str) -> str:
    if encryption_enabled() and iv_b64:
        ct = base64.b64decode(stored)
        iv = base64.b64decode(iv_b64)
        return decrypt(ct, iv)
    return stored


def _row_to_dict(row: dict, reveal: bool = False) -> dict:
    stored = row["encrypted_value"]
    iv_b64 = row.get("iv") or ""
    value = _decode_secret(stored, iv_b64) if reveal else None
    return {
        "id": str(row["id"]),
        "name": row["key"],
        "environment": row.get("environment") or "Development",
        "type": row.get("secret_type") or "API Key",
        "masked_value": "•" * 16,
        "value": value,
        "updated_at": str(row.get("updated_at") or row["created_at"]),
        "created_at": str(row["created_at"]),
    }


@router.get("/projects/{project_id}/vault")
async def list_secrets(project_id: str, environment: str | None = None, type: str | None = None) -> dict:
    if db_enabled():
        sql = "SELECT * FROM vault_secrets WHERE project_id=$1"
        args: list = [project_id]
        if environment and environment != "All Environments":
            sql += " AND environment=$2"
            args.append(environment)
        sql += " ORDER BY created_at DESC"
        rows = await fetch(sql, *args)
        items = [_row_to_dict(r) for r in rows]
        if type and type != "All Types":
            items = [i for i in items if i["type"] == type]
        return {"secrets": items, "total": len(items)}
    secrets = list(_project_secrets(project_id).values())
    if environment and environment != "All Environments":
        secrets = [s for s in secrets if s["environment"] == environment]
    if type and type != "All Types":
        secrets = [s for s in secrets if s["type"] == type]
    secrets.sort(key=lambda s: s["created_at"], reverse=True)
    return {"secrets": [_to_response(s) for s in secrets], "total": len(secrets)}


@router.post("/projects/{project_id}/vault", status_code=201)
async def create_secret(project_id: str, body: SecretCreate) -> dict:
    if db_enabled():
        existing = await fetchrow(
            "SELECT id FROM vault_secrets WHERE project_id=$1 AND key=$2", project_id, body.name
        )
        if existing:
            raise HTTPException(409, f"Secret '{body.name}' already exists")
        stored, iv_b64 = _encode_secret(body.value)
        row = await fetchrow(
            """INSERT INTO vault_secrets (id,project_id,key,encrypted_value,iv,environment,secret_type,created_at)
               VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,now()) RETURNING *""",
            project_id, body.name, stored, iv_b64, body.environment, body.type,
        )
        return _row_to_dict(dict(row))  # type: ignore[arg-type]
    existing = {s["name"] for s in _project_secrets(project_id).values()}
    if body.name in existing:
        raise HTTPException(409, f"Secret '{body.name}' already exists")
    secret_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    secret = {
        "id": secret_id, "project_id": project_id, "name": body.name,
        "value": body.value, "environment": body.environment,
        "type": body.type, "created_at": now, "updated_at": now,
    }
    _project_secrets(project_id)[secret_id] = secret
    return _to_response(secret)


@router.get("/projects/{project_id}/vault/{secret_id}/reveal")
async def reveal_secret(project_id: str, secret_id: str) -> dict:
    if db_enabled():
        row = await fetchrow(
            "SELECT * FROM vault_secrets WHERE id=$1 AND project_id=$2", secret_id, project_id
        )
        if not row:
            raise HTTPException(404, "Secret not found")
        return _row_to_dict(dict(row), reveal=True)  # type: ignore[arg-type]
    secret = _project_secrets(project_id).get(secret_id)
    if not secret:
        raise HTTPException(404, "Secret not found")
    return _to_response(secret, reveal=True)


@router.put("/projects/{project_id}/vault/{secret_id}")
async def update_secret(project_id: str, secret_id: str, body: SecretUpdate) -> dict:
    if db_enabled():
        updates: list[str] = []
        args: list = []
        idx = 1
        if body.value is not None:
            stored, iv_b64 = _encode_secret(body.value)
            updates += [f"encrypted_value=${idx}", f"iv=${idx+1}"]
            args += [stored, iv_b64]
            idx += 2
        if body.environment is not None:
            updates.append(f"environment=${idx}")
            args.append(body.environment)
            idx += 1
        if body.type is not None:
            updates.append(f"secret_type=${idx}")
            args.append(body.type)
            idx += 1
        if not updates:
            row = await fetchrow("SELECT * FROM vault_secrets WHERE id=$1 AND project_id=$2", secret_id, project_id)
        else:
            updates.append("updated_at=now()")
            sql = f"UPDATE vault_secrets SET {', '.join(updates)} WHERE id=${idx} AND project_id=${idx+1} RETURNING *"
            args += [secret_id, project_id]
            row = await fetchrow(sql, *args)
        if not row:
            raise HTTPException(404, "Secret not found")
        return _row_to_dict(dict(row))  # type: ignore[arg-type]
    secret = _project_secrets(project_id).get(secret_id)
    if not secret:
        raise HTTPException(404, "Secret not found")
    if body.value is not None:
        secret["value"] = body.value
    if body.environment is not None:
        secret["environment"] = body.environment
    if body.type is not None:
        secret["type"] = body.type
    secret["updated_at"] = datetime.now(timezone.utc).isoformat()
    return _to_response(secret)


@router.delete("/projects/{project_id}/vault/{secret_id}")
async def delete_secret(project_id: str, secret_id: str) -> dict:
    if db_enabled():
        tag = await execute(
            "DELETE FROM vault_secrets WHERE id=$1 AND project_id=$2", secret_id, project_id
        )
        if tag == "DELETE 0":
            raise HTTPException(404, "Secret not found")
        return {"deleted": True}
    secrets = _project_secrets(project_id)
    if secret_id not in secrets:
        raise HTTPException(404, "Secret not found")
    del secrets[secret_id]
    return {"deleted": True}
