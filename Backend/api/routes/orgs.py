"""Organization + membership management (Phase 6F).

Falls back to in-memory store when HAWKEYE_DB_URL is absent.

IMPORTANT: static paths (/me, /invitations/{token}) are declared BEFORE
parameterised paths (/{org_id}) so FastAPI matches them correctly.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.db import db_enabled, fetch, fetchrow, execute

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

def _db(org_id: str) -> bool:
    """Only hit the DB when db is enabled AND org_id looks like a real UUID."""
    return db_enabled() and bool(_UUID_RE.match(org_id))

router = APIRouter(tags=["orgs"])

_orgs: dict[str, dict] = {
    "default": {
        "id": "default", "name": "My Organization", "slug": "my-org",
        "plan": "pro", "billing_email": None, "created_at": "2025-01-01T00:00:00+00:00",
    }
}
_members: dict[str, list[dict]] = {
    "default": [
        {"id": "u1", "org_id": "default", "email": "owner@example.com",
         "name": "Alice Owner", "role": "owner", "joined_at": "2025-01-01T00:00:00+00:00"},
    ]
}
_invitations: dict[str, dict] = {}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _org_row(row: dict) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "slug": row["slug"],
        "plan": row["plan"], "billing_email": row.get("billing_email"),
        "created_at": str(row["created_at"]),
    }


def _member_row(row: dict) -> dict:
    return {
        "id": str(row["id"]), "email": row["email"],
        "name": row.get("name") or row["email"].split("@")[0],
        "avatar_url": row.get("avatar_url"), "role": row["role"],
        "joined_at": str(row["joined_at"]),
    }


def _resolve_org(request: Request) -> str:
    return "default"  # production: look up via X-User-Email -> DB


# ── Pydantic models ───────────────────────────────────────────────────────────

class OrgUpdate(BaseModel):
    name: str | None = None
    billing_email: str | None = None


class RoleUpdate(BaseModel):
    role: str


class InviteCreate(BaseModel):
    email: str
    role: str = "developer"


# ── /me routes  (MUST come before /{org_id} to avoid param capture) ─────────

@router.get("/orgs/me")
async def get_my_org(request: Request) -> dict:
    return await get_org(_resolve_org(request))


@router.patch("/orgs/me")
async def update_my_org(request: Request, body: OrgUpdate) -> dict:
    return await update_org(_resolve_org(request), body)


@router.get("/orgs/me/members")
async def list_my_members(request: Request) -> dict:
    return await list_members(_resolve_org(request))


@router.post("/orgs/me/invitations", status_code=201)
async def invite_to_my_org(request: Request, body: InviteCreate) -> dict:
    return await create_invitation(_resolve_org(request), body)


@router.put("/orgs/me/members/{user_id}")
async def update_my_member_role(request: Request, user_id: str, body: RoleUpdate) -> dict:
    return await update_member_role(_resolve_org(request), user_id, body)


@router.delete("/orgs/me/members/{user_id}")
async def remove_my_member(request: Request, user_id: str) -> dict:
    return await remove_member(_resolve_org(request), user_id)


# ── Invitation accept (static token path before /{org_id}/invitations) ──────

@router.get("/orgs/invitations/{token}")
async def accept_invitation(token: str) -> dict:
    inv = _invitations.get(token)
    if not inv or inv["status"] != "pending":
        raise HTTPException(404, "Invitation not found or already used")
    inv["status"] = "accepted"
    return {"accepted": True, "org_id": inv["org_id"], "email": inv["email"], "role": inv["role"]}


# ── Org CRUD /{org_id} ──────────────────────────────────────────────────────

@router.get("/orgs/{org_id}")
async def get_org(org_id: str) -> dict:
    if _db(org_id):
        row = await fetchrow("SELECT * FROM organizations WHERE id=$1", org_id)
        if not row:
            raise HTTPException(404, "Organization not found")
        return _org_row(dict(row))
    org = _orgs.get(org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    return org


@router.patch("/orgs/{org_id}")
async def update_org(org_id: str, body: OrgUpdate) -> dict:
    if _db(org_id):
        parts: list[str] = []; args: list[Any] = []; idx = 1
        if body.name is not None:
            parts.append(f"name=${idx}"); args.append(body.name); idx += 1
        if body.billing_email is not None:
            parts.append(f"billing_email=${idx}"); args.append(body.billing_email); idx += 1
        if not parts:
            return await get_org(org_id)
        row = await fetchrow(f"UPDATE organizations SET {', '.join(parts)} WHERE id=${idx} RETURNING *", *args, org_id)
        if not row:
            raise HTTPException(404, "Organization not found")
        return _org_row(dict(row))
    org = _orgs.get(org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.name is not None: org["name"] = body.name
    if body.billing_email is not None: org["billing_email"] = body.billing_email
    return org


# ── Members ─────────────────────────────────────────────────────────────────

@router.get("/orgs/{org_id}/members")
async def list_members(org_id: str) -> dict:
    if _db(org_id):
        rows = await fetch(
            """SELECT u.id, u.email, u.name, u.avatar_url, m.role, m.joined_at
               FROM memberships m JOIN users u ON u.id = m.user_id
               WHERE m.org_id=$1 ORDER BY m.joined_at""",
            org_id,
        )
        members = [_member_row(dict(r)) for r in rows]
        return {"members": members, "total": len(members)}
    members = _members.get(org_id, [])
    return {"members": members, "total": len(members)}


@router.patch("/orgs/{org_id}/members/{user_id}")
async def update_member_role(org_id: str, user_id: str, body: RoleUpdate) -> dict:
    valid_roles = ("owner", "admin", "developer", "viewer")
    if body.role not in valid_roles:
        raise HTTPException(422, f"Invalid role. Must be one of: {valid_roles}")
    if _db(org_id):
        tag = await execute("UPDATE memberships SET role=$3 WHERE org_id=$1 AND user_id=$2", org_id, user_id, body.role)
        if tag == "UPDATE 0":
            raise HTTPException(404, "Member not found")
        return {"updated": True}
    for m in _members.get(org_id, []):
        if m["id"] == user_id:
            m["role"] = body.role
            return {"updated": True}
    raise HTTPException(404, "Member not found")


@router.delete("/orgs/{org_id}/members/{user_id}")
async def remove_member(org_id: str, user_id: str) -> dict:
    if _db(org_id):
        tag = await execute("DELETE FROM memberships WHERE org_id=$1 AND user_id=$2", org_id, user_id)
        if tag == "DELETE 0":
            raise HTTPException(404, "Member not found")
        return {"removed": True}
    before = len(_members.get(org_id, []))
    _members[org_id] = [m for m in _members.get(org_id, []) if m["id"] != user_id]
    if len(_members.get(org_id, [])) == before:
        raise HTTPException(404, "Member not found")
    return {"removed": True}


# ── Invitations /{org_id} ──────────────────────────────────────────────────

@router.post("/orgs/{org_id}/invitations", status_code=201)
async def create_invitation(org_id: str, body: InviteCreate) -> dict:
    inv_id = str(uuid.uuid4())
    invitation = {
        "id": inv_id, "org_id": org_id, "email": body.email, "role": body.role,
        "status": "pending", "created_at": _utcnow(),
    }
    _invitations[inv_id] = invitation
    return invitation


@router.get("/orgs/{org_id}/invitations")
async def list_invitations(org_id: str) -> dict:
    items = [v for v in _invitations.values() if v["org_id"] == org_id and v["status"] == "pending"]
    return {"invitations": items, "total": len(items)}


@router.delete("/orgs/{org_id}/invitations/{inv_id}")
async def revoke_invitation(org_id: str, inv_id: str) -> dict:
    inv = _invitations.get(inv_id)
    if not inv or inv["org_id"] != org_id:
        raise HTTPException(404, "Invitation not found")
    _invitations[inv_id]["status"] = "revoked"
    return {"revoked": True}
