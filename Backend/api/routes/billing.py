"""Stripe billing — checkout session, customer portal, webhook handler.

Requires env vars:
  STRIPE_SECRET_KEY        — sk_live_... or sk_test_...
  STRIPE_WEBHOOK_SECRET    — whsec_... from Stripe dashboard
  STRIPE_PRO_PRICE_ID      — price_... for Pro plan
  STRIPE_TEAM_PRICE_ID     — price_... for Team plan
  APP_URL                  — public base URL for redirect_url (e.g. https://app.hawkeye.ai)

When STRIPE_SECRET_KEY is absent all endpoints return stub data so the
frontend remains functional during development.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from api.db import db_enabled, fetchrow, execute

router = APIRouter(tags=["billing"])

_STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
_APP_URL = os.environ.get("APP_URL", "http://localhost:3000")

PLAN_PRICES: dict[str, str] = {
    "pro": os.environ.get("STRIPE_PRO_PRICE_ID", ""),
    "team": os.environ.get("STRIPE_TEAM_PRICE_ID", ""),
}

PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free":       {"runs": 50,    "parallel": 1, "secrets": 50,   "storage_gb": 1},
    "pro":        {"runs": 500,   "parallel": 2, "secrets": 500,  "storage_gb": 20},
    "team":       {"runs": 5000,  "parallel": 5, "secrets": 2000, "storage_gb": 100},
    "enterprise": {"runs": 99999, "parallel": 20, "secrets": 9999, "storage_gb": 1000},
}

PLAN_PRICES_MONTHLY: dict[str, int] = {
    "free": 0, "pro": 99, "team": 299, "enterprise": 999,
}


def _stripe():
    if not _STRIPE_KEY:
        return None
    try:
        import stripe
        stripe.api_key = _STRIPE_KEY
        return stripe
    except ImportError:
        return None


# ---------------------------------------------------------------------------
# Plans catalogue
# ---------------------------------------------------------------------------

@router.get("/billing/plans")
async def list_plans() -> dict:
    plans = [
        {
            "id": plan_id,
            "name": plan_id.title(),
            "price_monthly": PLAN_PRICES_MONTHLY[plan_id],
            "limits": limits,
        }
        for plan_id, limits in PLAN_LIMITS.items()
    ]
    return {"plans": plans}


# ---------------------------------------------------------------------------
# Checkout session
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    plan: str
    org_id: str
    success_path: str = "/app/billing?checkout=success"
    cancel_path: str = "/app/billing?checkout=cancel"


@router.post("/billing/checkout")
async def create_checkout(body: CheckoutRequest) -> dict:
    price_id = PLAN_PRICES.get(body.plan)
    stripe = _stripe()
    if not stripe or not price_id:
        return {
            "checkout_url": f"{_APP_URL}{body.success_path}",
            "stub": True,
            "message": "Stripe not configured — returning stub redirect.",
        }
    customer_id: str | None = None
    if db_enabled():
        row = await fetchrow("SELECT stripe_customer_id FROM organizations WHERE id=$1", body.org_id)
        if row:
            customer_id = row.get("stripe_customer_id")  # type: ignore[assignment]
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        customer=customer_id or None,
        success_url=f"{_APP_URL}{body.success_path}",
        cancel_url=f"{_APP_URL}{body.cancel_path}",
        metadata={"org_id": body.org_id, "plan": body.plan},
    )
    return {"checkout_url": session.url}


# ---------------------------------------------------------------------------
# Customer portal
# ---------------------------------------------------------------------------

class PortalRequest(BaseModel):
    org_id: str
    return_path: str = "/app/billing"


@router.post("/billing/portal")
async def create_portal(body: PortalRequest) -> dict:
    stripe = _stripe()
    customer_id: str | None = None
    if db_enabled():
        row = await fetchrow("SELECT stripe_customer_id FROM organizations WHERE id=$1", body.org_id)
        if row:
            customer_id = row.get("stripe_customer_id")  # type: ignore[assignment]
    if not stripe or not customer_id:
        return {
            "portal_url": f"{_APP_URL}{body.return_path}",
            "stub": True,
            "message": "Stripe not configured or no customer ID — returning stub redirect.",
        }
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{_APP_URL}{body.return_path}",
    )
    return {"portal_url": session.url}


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

@router.post("/billing/webhook")
async def stripe_webhook(request: Request) -> dict:
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    stripe = _stripe()

    if stripe and _WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(body, sig, _WEBHOOK_SECRET)
        except Exception as exc:
            raise HTTPException(400, str(exc))
    elif _WEBHOOK_SECRET:
        # Manual HMAC verification when stripe SDK unavailable
        expected = "sha256=" + hmac.new(
            _WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()  # type: ignore[attr-defined]
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(401, "Invalid webhook signature")
        try:
            event = json.loads(body)
        except Exception:
            raise HTTPException(400, "Invalid JSON")
    else:
        try:
            event = json.loads(body)
        except Exception:
            raise HTTPException(400, "Invalid JSON")

    event_type = event.get("type", "") if isinstance(event, dict) else getattr(event, "type", "")
    data = event.get("data", {}) if isinstance(event, dict) else {}
    obj = data.get("object", {}) if isinstance(data, dict) else {}

    if event_type == "checkout.session.completed":
        org_id = (obj.get("metadata") or {}).get("org_id")
        plan = (obj.get("metadata") or {}).get("plan", "pro")
        customer_id = obj.get("customer")
        if org_id and db_enabled():
            await execute(
                "UPDATE organizations SET plan=$2, stripe_customer_id=$3 WHERE id=$1",
                org_id, plan, customer_id,
            )

    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        customer_id = obj.get("customer")
        new_plan = "free" if event_type.endswith("deleted") else _stripe_plan_from_items(obj)
        if customer_id and db_enabled():
            await execute(
                "UPDATE organizations SET plan=$2 WHERE stripe_customer_id=$1",
                customer_id, new_plan,
            )

    return {"received": True, "type": event_type}


def _stripe_plan_from_items(subscription_obj: dict) -> str:
    """Infer Hawkeye plan from Stripe subscription line items."""
    items = subscription_obj.get("items", {}).get("data", [])
    for item in items:
        price_id = item.get("price", {}).get("id", "")
        for plan_id, pid in PLAN_PRICES.items():
            if pid and pid == price_id:
                return plan_id
    return "pro"


# ---------------------------------------------------------------------------
# Plan limit helper — imported by runs router
# ---------------------------------------------------------------------------

def get_plan_limits(plan: str) -> dict[str, int]:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])


# ---------------------------------------------------------------------------
# Billing usage + subscription detail
# ---------------------------------------------------------------------------

@router.get("/billing/usage")
async def get_billing_usage(org_id: str = "default") -> dict:
    """Detailed billing usage for the org — run count, cost, limits."""
    from api.redis_store import list_runs
    from api.routes.vault import _store as vault_store

    plan = "free"
    if db_enabled():
        row = await fetchrow("SELECT plan FROM organizations WHERE id=$1", org_id)
        if row:
            plan = row["plan"]
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

    runs = await list_runs()
    runs_used = len(runs)
    cost_usd = sum(r.get("estimated_cost_usd") or 0.0 for r in runs)
    vault_count = sum(len(v) for v in vault_store.values())

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    return {
        "org_id": org_id,
        "plan": plan,
        "period_start": period_start.isoformat(),
        "period_end": None,
        "runs_used": runs_used,
        "runs_limit": limits["runs"],
        "parallel_used": 1,
        "parallel_limit": limits["parallel"],
        "secrets_used": vault_count,
        "secrets_limit": limits["secrets"],
        "cost_usd": round(cost_usd, 4),
    }


@router.get("/billing/subscription")
async def get_subscription(org_id: str = "default") -> dict:
    """Current subscription plan + renewal info for the org."""
    plan = "free"
    stripe_customer_id = None
    if db_enabled():
        row = await fetchrow("SELECT plan, stripe_customer_id FROM organizations WHERE id=$1", org_id)
        if row:
            plan = row["plan"]
            stripe_customer_id = row.get("stripe_customer_id")
    return {
        "org_id": org_id,
        "plan": plan,
        "price_monthly": PLAN_PRICES_MONTHLY.get(plan, 0),
        "stripe_customer_id": stripe_customer_id,
        "status": "active" if plan != "free" else "free",
        "next_billing_date": None,
        "cancel_at_period_end": False,
    }
