from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["vault"])

# in-memory store: project_id -> secret_id -> secret dict
# Values are stored in plain text for now; a real impl would use KMS/envelope encryption
_store: dict[str, dict[str, dict[str, Any]]] = {}

VAULD_ENVIRONMENTS = ("Production", "Staging", "Development")
VAULT_TYPES = ("API Key", "Database", "Certificate", "Other")


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


@router.get("/projects/{project_id}/vault")
def list_secrets(project_id: str, environment: str | None = None, type: str | None = None) -> dict:
    secrets = list(_project_secrets(project_id).values())
    if environment and environment != "All Environments":
        secrets = [s for s in secrets if s["environment"] == environment]
    if type and type != "All Types":
        secrets = [s for s in secrets if s["type"] == type]
    secrets.sort(key=lambda s: s["created_at"], reverse=True)
    return {"secrets": [_to_response(s) for s in secrets], "total": len(secrets)}


@router.post("/projects/{project_id}/vault", status_code=201)
def create_secret(project_id: str, body: SecretCreate) -> dict:
    # check name uniqueness within project
    existing = {s["name"] for s in _project_secrets(project_id).values()}
    if body.name in existing:
        raise HTTPException(status_code=409, detail=f"Secret '{body.name}' already exists")
    secret_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    secret = {
        "id": secret_id,
        "project_id": project_id,
        "name": body.name,
        "value": body.value,
        "environment": body.environment,
        "type": body.type,
        "created_at": now,
        "updated_at": now,
    }
    _project_secrets(project_id)[secret_id] = secret
    return _to_response(secret)


@router.get("/projects/{project_id}/vault/{secret_id}/reveal")
def reveal_secret(project_id: str, secret_id: str) -> dict:
    secret = _project_secrets(project_id).get(secret_id)
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    return _to_response(secret, reveal=True)


@router.put("/projects/{project_id}/vault/{secret_id}")
def update_secret(project_id: str, secret_id: str, body: SecretUpdate) -> dict:
    secret = _project_secrets(project_id).get(secret_id)
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    if body.value is not None:
        secret["value"] = body.value
    if body.environment is not None:
        secret["environment"] = body.environment
    if body.type is not None:
        secret["type"] = body.type
    secret["updated_at"] = datetime.now(timezone.utc).isoformat()
    return _to_response(secret)


@router.delete("/projects/{project_id}/vault/{secret_id}")
def delete_secret(project_id: str, secret_id: str) -> dict:
    secrets = _project_secrets(project_id)
    if secret_id not in secrets:
        raise HTTPException(status_code=404, detail="Secret not found")
    del secrets[secret_id]
    return {"deleted": True}
