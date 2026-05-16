from __future__ import annotations
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import os
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from api.auth_middleware import AuthMiddleware
from api.job_queue import job_queue
from api.routes import (runs, test_cases, ws, artifacts, projects, test_cases_crud,
                        suites, vault, schedules, me, usage, billing, orgs,
                        environments, baselines, integrations, webhooks, auth)

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])


# Tables owned by SQLAlchemy ORM — must not be created with UUID PKs by schema.sql
_SQLA_TABLES = ["project_members", "suite_schedules", "test_suites", "vault_secrets", "test_cases", "projects"]


async def _fix_schema_conflicts() -> None:
    """Drop tables that schema.sql created with UUID PKs before SQLAlchemy could own them.

    schema.sql uses `UUID PRIMARY KEY` for projects/test_cases/etc., but the SQLAlchemy
    models use String(36). Postgres refuses `uuid = character varying` comparisons, crashing
    startup. If the conflict is detected, drop the empty tables so create_all rebuilds them.
    """
    from api.db import db_enabled, fetchval, execute
    if not db_enabled():
        return
    try:
        id_type = await fetchval(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name='projects' AND column_name='id' AND table_schema='public'"
        )
        if id_type != "uuid":
            return  # already correct — nothing to do
        # Tables are empty (API never started successfully), safe to drop
        for table in _SQLA_TABLES:
            await execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    except Exception:
        pass


async def _apply_schema() -> None:
    """Run orchestrator-only tables from schema.sql (SQLAlchemy-managed tables are skipped)."""
    from api.db import db_enabled, execute
    if not db_enabled():
        return
    schema_path = Path(__file__).parent.parent / "orchestrator" / "db" / "schema.sql"
    if not schema_path.exists():
        return
    sql = schema_path.read_text()
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if not stmt:
            continue
        # Skip CREATE TABLE / CREATE INDEX statements for SQLAlchemy-managed tables
        stmt_lower = stmt.lower()
        if any(f"table {t}" in stmt_lower or f"index" in stmt_lower and f" on {t}" in stmt_lower
               for t in _SQLA_TABLES):
            continue
        try:
            await execute(stmt)
        except Exception:
            pass


async def _seed_default_project() -> None:
    """Ensure the 'default' project exists and the dev user is a member of it."""
    from api.database import AsyncSessionLocal
    from api.models import Project, ProjectMember
    from sqlalchemy import select
    dev_email = os.environ.get("HAWKEYE_DEV_EMAIL", "dev@hawkeye.local")
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).where(Project.slug == "default"))
        project = result.scalar_one_or_none()
        if not project:
            project = Project(id="default", name="Default Project", slug="default")
            session.add(project)
            await session.flush()
        mem = await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_email == dev_email,
            )
        )
        if not mem.scalar_one_or_none():
            session.add(ProjectMember(
                id=str(uuid.uuid4()),
                project_id=project.id,
                user_email=dev_email,
                role="admin",
            ))
        await session.commit()


async def _seed_db_dev_user() -> None:
    """Insert the dev user into the Postgres users table when running with a DB."""
    from api.db import db_enabled, execute, fetchrow
    if not db_enabled():
        return
    from api.auth_utils import hash_password
    dev_email = os.environ.get("HAWKEYE_DEV_EMAIL", "dev@hawkeye.local")
    dev_password = os.environ.get("HAWKEYE_DEV_PASSWORD", "devpassword")
    try:
        existing = await fetchrow("SELECT id FROM users WHERE email=$1", dev_email)
        if not existing:
            await execute(
                "INSERT INTO users (id, email, name, auth_provider, pw_hash) "
                "VALUES ($1,$2,'Dev Admin','local',$3) ON CONFLICT (email) DO NOTHING",
                str(uuid.uuid4()), dev_email, hash_password(dev_password),
            )
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    from api.db import init_pool, close_pool
    from api.database import init_db
    await init_pool()           # asyncpg pool for legacy routes (auth, orgs, etc.)
    await _fix_schema_conflicts()  # drop UUID-typed tables if schema.sql ran first
    await init_db()             # SQLAlchemy creates tables with String(36) PKs
    await _apply_schema()       # orchestrator-only tables (test_runs, agent_traces, etc.)
    await _seed_default_project()
    await _seed_db_dev_user()
    pool_size = int(os.environ.get("HAWKEYE_POOL_SIZE", "0"))
    if pool_size > 0:
        from api.container_pool import container_pool
        await container_pool.start()
    job_queue.start()
    from api.routes.test_cases_crud import seed_from_yaml_dir
    await seed_from_yaml_dir(project_id="default")
    from api.routes.auth import _seed_dev_user
    _seed_dev_user()  # seeds in-memory fallback (no-op when DB enabled)
    yield
    await job_queue.stop()
    if pool_size > 0:
        from api.container_pool import container_pool
        await container_pool.stop()
    await close_pool()


_is_production = os.getenv("ENV", "").lower() == "production"
app = FastAPI(
    title="Hawkeye API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if _is_production else "/docs",
    redoc_url=None,
    openapi_url=None if _is_production else "/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_origins = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if o.strip()
]

# Auth is inner (added first); CORS is outer (added second, runs first so
# OPTIONS preflights and CORS headers are handled before auth runs).
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs.router, prefix="/api")
app.include_router(test_cases.router, prefix="/api")
app.include_router(ws.router, prefix="/api")
app.include_router(artifacts.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(test_cases_crud.router, prefix="/api")
app.include_router(suites.router, prefix="/api")
app.include_router(vault.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(me.router, prefix="/api")
app.include_router(usage.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(orgs.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(environments.router, prefix="/api")
app.include_router(baselines.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
