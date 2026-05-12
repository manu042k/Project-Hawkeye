"""Auth utilities: password hashing, JWT issuance, FastAPI dependency."""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Optional

import bcrypt
import jwt as pyjwt
from fastapi import HTTPException, Request

_AUTH_SECRET: str = os.getenv("HAWKEYE_AUTH_SECRET", "")
_INTERNAL_SECRET: str = os.getenv("HAWKEYE_INTERNAL_SECRET", "")
_TOKEN_TTL = 60 * 60 * 24 * 30  # 30 days


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(email: str, name: str = "") -> str:
    payload = {
        "sub": email,
        "email": email,
        "name": name,
        "iat": int(time.time()),
        "exp": int(time.time()) + _TOKEN_TTL,
    }
    secret = _AUTH_SECRET or "dev-secret-change-me"
    return pyjwt.encode(payload, secret, algorithm="HS256")


def verify_access_token(token: str) -> dict:
    secret = _AUTH_SECRET or "dev-secret-change-me"
    return pyjwt.decode(token, secret, algorithms=["HS256"])


def verify_internal_hmac(email: str, name: str, signature: str) -> bool:
    """Verify that the signature was produced by the Next.js server using HAWKEYE_INTERNAL_SECRET."""
    if not _INTERNAL_SECRET:
        return True  # dev mode: no secret configured, trust all
    expected = hmac.new(
        _INTERNAL_SECRET.encode(), f"{email}:{name}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def get_current_user(request: Request) -> dict:
    """FastAPI dependency: returns {email, name} or raises 401."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = verify_access_token(token)
            return {"email": payload["email"], "name": payload.get("name", "")}
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(401, "Token expired")
        except pyjwt.PyJWTError as exc:
            raise HTTPException(401, f"Invalid token: {exc}")

    # Dev fallback: trust X-User-Email when no auth secret is configured
    if not _AUTH_SECRET:
        email = request.headers.get("X-User-Email")
        if email:
            return {"email": email, "name": ""}

    raise HTTPException(401, "Authentication required")
