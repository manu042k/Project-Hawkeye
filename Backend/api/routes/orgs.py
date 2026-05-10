"""Organization + membership management (Phase 6F).

Falls back to in-memory store when HAWKEYE_DB_URL is absent.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db import db_enabled, fetch, fetchrow, execute

router = APIRouter(tags=["orgs"])

# In-memory fallback stores
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


# ── Org CRUD ────────────────────────────────────────────────────────────────

@router.get("/orgs/{org_id}")
async def get_org(org_id: str) -> dict:
    if db_enabled():
        row = await fetchrow("SELECT * FROM organizations WHERE id=$1", org_id)
        if not row:
            raise HTTPException(404, "Organization not found")
        return _org_row(dict(row))
    org = _orgs.get(org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    return org


class OrgUpdate(BaseModel):
    name: str | None = None
    billing_email: str | None = None


@router.patch("/orgs/{org_id}")
async def update_org(org_id: str, body: OrgUpdate) -> dict:
    if db_enabled():
        parts: list[str] = []
        args: list[Any] = []
        idx = 1
        if body.name is not None:
            parts.append(f"name=${idx}")
            args.append(body.name); idx += 1
        if body.billing_email is not None:
            parts.append(f"billing_email=${idx}")
            args.append(body.billing_email); idx += 1
        if not parts:
            return await get_org(org_id)
        sql = f"UPDATE organizations SET {', '.join(parts)} WHERE id=${idx} RETURNING *"
        args.append(org_id)
        row = await fetchrow(sql, *args)
        if not row:
            raise HTTPException(404, "Organization not found")
        return _org_row(dict(row))
    org = _orgs.get(org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.name is not None:
        org["name"] = body.name
    if body.billing_email is not None:
        org["billing_email"] = body.billing_email
    return org


def _org_row(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "slug": row["slug"],
        "plan": row["plan"],
        "billing_email": row.get("billing_email"),
        "created_at": str(row["created_at"]),
    }


# ── Members ─────────────────────────────────────────────────────────────────

@router.get("/orgs/{org_id}/members")
async def list_members(org_id: str) -> dict:
    if db_enabled():
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


def _member_row(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "name": row.get("name") or row["email"].split("@")[0],
        "avatar_url": row.get("avatar_url"),
        "role": row["role"],
        "joined_at": str(row["joined_at"]),
    }


class RoleUpdate(BaseModel):
    role: str


@router.patch("/orgs/{org_id}/members/{user_id}")
async def update_member_role(org_id: str, user_id: str, body: RoleUpdate) -> dict:
    valid_roles = ("owner", "admin", "developer", "viewer")
    if body.role not in valid_roles:
        raise HTTPException(422, f"Invalid role. Must be one of: {valid_roles}")
    if db_enabled():
        tag = await execute(
            "UPDATE memberships SET role=$3 WHERE org_id=$1 AND user_id=$2",
            org_id, user_id, body.role,
        )
        if tag == "UPDATE 0":
            raise HTTPException(404, "Member not found")
        return {"updated": True}
    members = _members.get(org_id, [])
    for m in members:
        if m["id"] == user_id:
            m["role"] = body.role
            return {"updated": True}
    raise HTTPException(404, "Member not found")


@router.delete("/orgs/{org_id}/members/{user_id}")
async def remove_member(org_id: str, user_id: str) -> dict:
    if db_enabled():
        tag = await execute(
            "DELETE FROM memberships WHERE org_id=$1 AND user_id=$2", org_id, user_id,
        )
        if tag == "DELETE 0":
            raise HTTPException(404, "Member not found")
        return {"removed": True}
    members = _members.get(org_id, [])
    before = len(members)
    _members[org_id] = [m for m in members if m["id"] != user_id]
    if len(_members[org_id]) == before:
        raise HTTPException(404, "Member not found")
    return {"removed": True}


# ── Invitations ──────────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    email: str
    role: str = "developer"


@router.post("/orgs/{org_id}/invitations", status_code=201)
async def create_invitation(org_id: str, body: InviteCreate) -> dict:
    inv_id = str(uuid.uuid4())
    invitation = {
        "id": inv_id, "org_id": org_id,
        "email": body.email, "role": body.role,
        "status": "pending", "created_at": _utcnow(),
    }
    _invitations[inv_id] = invitation
    # In production: send invitation email here
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
