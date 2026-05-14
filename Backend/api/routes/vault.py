from __future__ import annotations

import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from api.database import AsyncSessionLocal
from api.models import VaultSecret
from api.crypto import encrypt, decrypt, encryption_enabled

router = APIRouter(tags=["vault"])


class SecretCreate(BaseModel):
    name: str
    value: str
    environment: str = "Development"
    type: str = "API Key"


class SecretUpdate(BaseModel):
    value: str | None = None
    environment: str | None = None
    type: str | None = None


def _dt(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    return v.isoformat()


def _encode_secret(value: str) -> tuple[str, str]:
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


def _to_response(s: VaultSecret, reveal: bool = False) -> dict:
    value = _decode_secret(s.encrypted_value, s.iv or "") if reveal else None
    return {
        "id": s.id,
        "name": s.key,
        "environment": s.environment or "Development",
        "type": s.secret_type or "API Key",
        "masked_value": "•" * 16,
        "value": value,
        "updated_at": _dt(s.updated_at),
        "created_at": _dt(s.created_at),
    }


@router.get("/projects/{project_id}/vault")
async def list_secrets(project_id: str, environment: str | None = None, type: str | None = None) -> dict:
    async with AsyncSessionLocal() as session:
        stmt = select(VaultSecret).where(VaultSecret.project_id == project_id).order_by(VaultSecret.created_at.desc())
        result = await session.execute(stmt)
        secrets = result.scalars().all()
        items = [_to_response(s) for s in secrets]
        if environment and environment != "All Environments":
            items = [i for i in items if i["environment"] == environment]
        if type and type != "All Types":
            items = [i for i in items if i["type"] == type]
        return {"secrets": items, "total": len(items)}


@router.post("/projects/{project_id}/vault", status_code=201)
async def create_secret(project_id: str, body: SecretCreate) -> dict:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(
            select(VaultSecret).where(VaultSecret.project_id == project_id, VaultSecret.key == body.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, f"Secret '{body.name}' already exists")
        stored, iv_b64 = _encode_secret(body.value)
        secret = VaultSecret(
            id=str(uuid.uuid4()),
            project_id=project_id,
            key=body.name,
            encrypted_value=stored,
            iv=iv_b64,
            environment=body.environment,
            secret_type=body.type,
        )
        session.add(secret)
        await session.commit()
        await session.refresh(secret)
        return _to_response(secret)


@router.get("/projects/{project_id}/vault/{secret_id}/reveal")
async def reveal_secret(project_id: str, secret_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VaultSecret).where(VaultSecret.id == secret_id, VaultSecret.project_id == project_id)
        )
        secret = result.scalar_one_or_none()
        if not secret:
            raise HTTPException(404, "Secret not found")
        return _to_response(secret, reveal=True)


@router.put("/projects/{project_id}/vault/{secret_id}")
async def update_secret(project_id: str, secret_id: str, body: SecretUpdate) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VaultSecret).where(VaultSecret.id == secret_id, VaultSecret.project_id == project_id)
        )
        secret = result.scalar_one_or_none()
        if not secret:
            raise HTTPException(404, "Secret not found")
        if body.value is not None:
            stored, iv_b64 = _encode_secret(body.value)
            secret.encrypted_value = stored
            secret.iv = iv_b64
        if body.environment is not None:
            secret.environment = body.environment
        if body.type is not None:
            secret.secret_type = body.type
        secret.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(secret)
        return _to_response(secret)


@router.delete("/projects/{project_id}/vault/{secret_id}")
async def delete_secret(project_id: str, secret_id: str) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VaultSecret).where(VaultSecret.id == secret_id, VaultSecret.project_id == project_id)
        )
        secret = result.scalar_one_or_none()
        if not secret:
            raise HTTPException(404, "Secret not found")
        await session.delete(secret)
        await session.commit()
        return {"deleted": True}
