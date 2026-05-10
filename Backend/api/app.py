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
                        environments, baselines, integrations, webhooks)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from api.db import init_pool, close_pool
    await init_pool()
    pool_size = int(os.environ.get("HAWKEYE_POOL_SIZE", "0"))
    if pool_size > 0:
        from api.container_pool import container_pool
        await container_pool.start()
    job_queue.start()
    from api.routes.test_cases_crud import seed_from_yaml_dir
    seed_from_yaml_dir(project_id="default")
    yield
    await job_queue.stop()
    if pool_size > 0:
        from api.container_pool import container_pool
        await container_pool.stop()
    await close_pool()


app = FastAPI(title="Hawkeye API", version="0.1.0", lifespan=lifespan)

_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

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
app.include_router(environments.router, prefix="/api")
app.include_router(baselines.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
