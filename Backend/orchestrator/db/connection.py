"""Async PostgreSQL connection pool — singleton per process."""
from __future__ import annotations
import asyncpg
import os

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        dsn = os.environ["HAWKEYE_DB_URL"]
        _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def db_enabled() -> bool:
    return bool(os.environ.get("HAWKEYE_DB_URL"))
