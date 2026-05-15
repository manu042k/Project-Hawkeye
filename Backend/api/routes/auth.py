"""Auth endpoints: register, login, oauth-token exchange."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.auth_utils import (
    create_access_token,
    hash_password,
    verify_internal_hmac,
    verify_password,
)
from api.db import db_enabled, execute, fetchrow

router = APIRouter(tags=["auth"])

_users: dict[str, dict] = {}  # email -> {id, email, name, pw_hash, created_at}

_DEV_EMAIL = os.environ.get("HAWKEYE_DEV_EMAIL", "admin@hawkeye.dev")
_DEV_PASSWORD = os.environ.get("HAWKEYE_DEV_PASSWORD", "admin123")


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seed_dev_user() -> None:
    """Seed a default dev user when running without DB and no users exist."""
    from api.db import db_enabled
    if db_enabled():
        return
    email = _DEV_EMAIL.lower().strip()
    if email not in _users:
        _users[email] = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": "Dev Admin",
            "pw_hash": hash_password(_DEV_PASSWORD),
            "created_at": _utcnow(),
        }
        import logging
        logging.getLogger("hawkeye.auth").info(
            "Dev user seeded — email: %s  password: %s", email, _DEV_PASSWORD
        )


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class OAuthTokenRequest(BaseModel):
    email: str
    name: str = ""


@router.post("/auth/register", status_code=201)
async def register(body: RegisterRequest):
    email = body.email.lower().strip()
    if db_enabled():
        existing = await fetchrow("SELECT id FROM users WHERE email=$1", email)
        if existing:
            raise HTTPException(409, "Email already registered")
        pw_hash = hash_password(body.password)
        user_id = str(uuid.uuid4())
        await execute(
            "INSERT INTO users (id, email, name, pw_hash, auth_provider, created_at) "
            "VALUES ($1,$2,$3,$4,'credentials',now())",
            user_id, email, body.name or None, pw_hash,
        )
    else:
        if email in _users:
            raise HTTPException(409, "Email already registered")
        pw_hash = hash_password(body.password)
        user_id = str(uuid.uuid4())
        _users[email] = {
            "id": user_id, "email": email, "name": body.name,
            "pw_hash": pw_hash, "created_at": _utcnow(),
        }

    token = create_access_token(email, body.name)
    return {"id": user_id, "email": email, "name": body.name, "access_token": token}


@router.post("/auth/login")
async def login(body: LoginRequest):
    email = body.email.lower().strip()
    if db_enabled():
        row = await fetchrow("SELECT id, name, pw_hash FROM users WHERE email=$1", email)
        if not row or not verify_password(body.password, row["pw_hash"] or ""):
            raise HTTPException(401, "Invalid email or password")
        user_id, name = str(row["id"]), row["name"] or ""
    else:
        user = _users.get(email)
        if not user or not verify_password(body.password, user["pw_hash"]):
            raise HTTPException(401, "Invalid email or password")
        user_id, name = user["id"], user.get("name", "")

    token = create_access_token(email, name)
    return {"id": user_id, "email": email, "name": name, "access_token": token}


@router.post("/auth/oauth-token")
async def oauth_token(body: OAuthTokenRequest, request: Request):
    """Exchange a verified OAuth identity (proven by HMAC from Next.js server) for a backend token."""
    sig = request.headers.get("X-Internal-Secret", "")
    if not verify_internal_hmac(body.email, body.name, sig):
        raise HTTPException(403, "Invalid internal secret")

    email = body.email.lower().strip()

    if db_enabled():
        existing = await fetchrow("SELECT id FROM users WHERE email=$1", email)
        if not existing:
            await execute(
                "INSERT INTO users (id, email, name, auth_provider, created_at) "
                "VALUES ($1,$2,$3,'oauth',now()) ON CONFLICT (email) DO NOTHING",
                str(uuid.uuid4()), email, body.name or None,
            )
    else:
        if email not in _users:
            _users[email] = {
                "id": str(uuid.uuid4()), "email": email, "name": body.name,
                "pw_hash": "", "created_at": _utcnow(),
            }

    token = create_access_token(email, body.name)
    return {"email": email, "name": body.name, "access_token": token}
