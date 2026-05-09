"""asyncpg connection pool — used when HAWKEYE_DB_URL is set.

All routes import `get_conn` as a FastAPI dependency. When no DB URL is
configured the dependency raises a clear error so callers can fall back to
their in-memory store.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

try:
    import asyncpg
    from asyncpg import Pool, Connection
except ImportError:
    asyncpg = None  # type: ignore[assignment]
    Pool = None  # type: ignore[assignment]
    Connection = None  # type: ignore[assignment]

_pool: "Pool | None" = None
_DB_URL: str = os.environ.get("HAWKEYE_DB_URL", "")


def db_enabled() -> bool:
    return bool(_DB_URL)


async def init_pool() -> None:
    global _pool
    if not _DB_URL or asyncpg is None:
        return
    _pool = await asyncpg.create_pool(_DB_URL, min_size=2, max_size=10)


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_conn() -> AsyncIterator["Connection"]:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — set HAWKEYE_DB_URL")
    async with _pool.acquire() as conn:
        yield conn


async def execute(sql: str, *args: object) -> str:
    async with get_conn() as conn:
        return await conn.execute(sql, *args)


async def fetch(sql: str, *args: object) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(sql, *args)
        return [dict(r) for r in rows]


async def fetchrow(sql: str, *args: object) -> dict | None:
    async with get_conn() as conn:
        row = await conn.fetchrow(sql, *args)
        return dict(row) if row else None


async def fetchval(sql: str, *args: object) -> object:
    async with get_conn() as conn:
        return await conn.fetchval(sql, *args)
