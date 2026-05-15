"""SQLAlchemy async engine + session factory.

Defaults to SQLite (file-based, no external service needed).
Set HAWKEYE_DB_URL to a PostgreSQL URL to use Postgres instead.
"""
from __future__ import annotations

import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_RAW_URL = os.environ.get("HAWKEYE_DB_URL", "")


def _build_url() -> str:
    if _RAW_URL:
        if _RAW_URL.startswith("postgresql://"):
            return _RAW_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        if _RAW_URL.startswith("postgres://"):
            return _RAW_URL.replace("postgres://", "postgresql+asyncpg://", 1)
        return _RAW_URL
    return "sqlite+aiosqlite:///./hawkeye.db"


_url = _build_url()
engine = create_async_engine(_url, echo=False)
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def init_db() -> None:
    from api.models import Base
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Additive migrations — safe to run on every startup (idempotent)
        _dialect = conn.engine.dialect.name
        if _dialect == "postgresql":
            migrations = [
                "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS suite VARCHAR(128)",
                "ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS suite_id VARCHAR(36)",
            ]
        else:
            # SQLite does not support IF NOT EXISTS on ADD COLUMN — check first
            migrations = []
            result = await conn.execute(text("PRAGMA table_info(test_cases)"))
            existing = {row[1] for row in result.fetchall()}
            if "suite" not in existing:
                migrations.append("ALTER TABLE test_cases ADD COLUMN suite VARCHAR(128)")
            if "suite_id" not in existing:
                migrations.append("ALTER TABLE test_cases ADD COLUMN suite_id VARCHAR(36)")
        for stmt in migrations:
            await conn.execute(text(stmt))
