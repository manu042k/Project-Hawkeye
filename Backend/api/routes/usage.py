"""Billing / usage metering — aggregates real data from runs + vault."""
from __future__ import annotations

from fastapi import APIRouter

from api.redis_store import list_runs
from api.artifact_store import get_store

router = APIRouter(tags=["billing"])


async def _count_vault_secrets() -> int:
    from api.database import AsyncSessionLocal
    from api.models import VaultSecret
    from sqlalchemy import func, select
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(func.count()).select_from(VaultSecret))
            return result.scalar_one() or 0
    except Exception:
        return 0


@router.get("/usage")
async def get_usage() -> dict:
    runs = await list_runs()
    total_runs = len(runs)
    passed = sum(1 for r in runs if r.get("status") == "passed")
    failed = sum(1 for r in runs if r.get("status") == "failed")
    total_cost = sum(r.get("estimated_cost_usd") or 0.0 for r in runs)

    vault_secret_count = await _count_vault_secrets()

    # Artifact storage: count files in artifact store
    store = get_store()
    try:
        artifact_bytes = sum(
            f.stat().st_size
            for run_dir in store._root.iterdir()
            if run_dir.is_dir()
            for f in run_dir.rglob("*")
            if f.is_file()
        )
    except Exception:
        artifact_bytes = 0

    artifact_gb = round(artifact_bytes / (1024 ** 3), 4)

    return {
        "period": "Current billing period",
        "meters": [
            {
                "id": "runs",
                "label": "Test runs",
                "description": "Executed runs across all projects.",
                "used": total_runs,
                "limit": 10000,
                "unit": "runs",
            },
            {
                "id": "passed",
                "label": "Passed runs",
                "description": "Runs that completed with PASSED status.",
                "used": passed,
                "limit": total_runs or 1,
                "unit": "runs",
            },
            {
                "id": "failed",
                "label": "Failed runs",
                "description": "Runs that completed with FAILED status.",
                "used": failed,
                "limit": total_runs or 1,
                "unit": "runs",
            },
            {
                "id": "vault",
                "label": "Vault secrets",
                "description": "Secrets stored across all projects.",
                "used": vault_secret_count,
                "limit": 500,
                "unit": "secrets",
            },
            {
                "id": "storage",
                "label": "Artifact storage",
                "description": "Screenshots, traces, and reports retained.",
                "used": artifact_gb,
                "limit": 100,
                "unit": "GB",
            },
        ],
        "cost_usd": round(total_cost, 4),
        "subscription": {
            "plan": "Pro",
            "price_monthly": 99,
            "next_billing_date": None,
        },
    }
