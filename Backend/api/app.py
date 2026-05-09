from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os

from api.container_pool import container_pool
from api.job_queue import job_queue
from api.routes import runs, test_cases, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool_size = int(os.environ.get("HAWKEYE_POOL_SIZE", "0"))
    if pool_size > 0:
        await container_pool.start()
    job_queue.start()
    yield
    await job_queue.stop()
    if pool_size > 0:
        await container_pool.stop()


app = FastAPI(
    title="Hawkeye API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs.router, prefix="/api")
app.include_router(test_cases.router, prefix="/api")
app.include_router(ws.router, prefix="/api")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
