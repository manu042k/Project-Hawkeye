from __future__ import annotations
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.job_queue import job_queue
from api.routes import (runs, test_cases, ws, artifacts, projects, test_cases_crud,
                        suites, vault, schedules, me, usage, billing, orgs,
                        environments, baselines, integrations, webhooks, auth)


async def _apply_schema() -> None:
    """Run schema.sql idempotently (all statements use IF NOT EXISTS)."""
    from api.db import db_enabled, execute, fetchval
    if not db_enabled():
        return
    schema_path = Path(__file__).parent.parent / "orchestrator" / "db" / "schema.sql"
    if not schema_path.exists():
        return
    sql = schema_path.read_text()
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if stmt:
            try:
                await execute(stmt)
            except Exception:
                pass  # e.g. extension already exists in a read-only schema
    # Seed a default org + project so string project_id "default" resolves
    try:
        exists = await fetchval("SELECT id FROM projects WHERE slug='default' LIMIT 1")
        if not exists:
            org_id = await fetchval(
                "INSERT INTO organizations (name, slug) VALUES ('Default Org','default') "
                "ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id"
            )
            await execute(
                "INSERT INTO projects (id, org_id, name, slug) "
                "VALUES ('00000000-0000-0000-0000-000000000001', $1, 'Default Project', 'default') "
                "ON CONFLICT DO NOTHING",
                org_id,
            )
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    from api.db import init_pool, close_pool
    await init_pool()
    await _apply_schema()
    pool_size = int(os.environ.get("HAWKEYE_POOL_SIZE", "0"))
    if pool_size > 0:
        from api.container_pool import container_pool
        await container_pool.start()
    job_queue.start()
    from api.routes.test_cases_crud import seed_from_yaml_dir
    seed_from_yaml_dir(project_id="default")
    from api.routes.auth import _seed_dev_user
    _seed_dev_user()
    yield
    await job_queue.stop()
    if pool_size > 0:
        from api.container_pool import container_pool
        await container_pool.stop()
    await close_pool()


app = FastAPI(title="Hawkeye API", version="0.1.0", lifespan=lifespan)

_origins = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if o.strip()
]

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
