from __future__ import annotations

import asyncio
import logging
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from orchestrator.llm.provider import get_llm
from orchestrator.loader.yaml_loader import load_test_case
from orchestrator.runner.run_manager import RunManager
from orchestrator.models.results import RunResult

from api.schemas import RunRequest
from api.ws_manager import ws_manager

logger = logging.getLogger(__name__)

_MAX_HISTORY = 100
_OUTPUT_DIR = Path("artifacts")


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RunRecord:
    run_id: str
    status: str
    request: RunRequest
    result: RunResult | None = None
    novnc_url: str | None = None
    created_at: str = field(default_factory=_utcnow)
    started_at: str | None = None
    completed_at: str | None = None


class JobQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[RunRecord] = asyncio.Queue()
        self._runs: dict[str, RunRecord] = {}
        self._worker_task: asyncio.Task | None = None

    def start(self) -> None:
        self._worker_task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    async def _worker(self) -> None:
        while True:
            record = await self._queue.get()
            if record.status == "cancelled":
                self._queue.task_done()
                continue

            record.status = "running"
            record.started_at = _utcnow()
            run_id = record.run_id
            req = record.request

            await ws_manager.broadcast(run_id, {
                "event_type": "run_started",
                "run_id": run_id,
                "data": {"status": "running"},
                "timestamp": _utcnow(),
            })

            try:
                import os as _os
                from api.container_pool import container_pool as _pool

                test_case = load_test_case(req.test_case_path)
                llm = get_llm(req.model)

                async def _ws_emitter(event_type: str, data: dict) -> None:
                    await ws_manager.broadcast(run_id, {
                        "event_type": event_type,
                        "run_id": run_id,
                        "data": data,
                        "timestamp": _utcnow(),
                    })

                manager = RunManager(
                    llm=llm,
                    model_name=req.model,
                    record=req.record,
                    figma_url=req.figma_url,
                    figma_token=req.figma_token,
                    ws_emitter=_ws_emitter,
                )

                pool_size = int(_os.environ.get("HAWKEYE_POOL_SIZE", "0"))
                if pool_size > 0 and _pool.available_count > 0:
                    try:
                        sandbox_handle = await _pool.acquire(url=test_case.target.url)
                        manager._prewarmed_handle = sandbox_handle
                        record.novnc_url = sandbox_handle.novnc_url
                    except Exception as exc:
                        logger.warning("Pool acquire failed, will spawn fresh: %s", exc)

                result = await manager.run(
                    test_case,
                    browser_override=req.browser,
                    max_steps_override=req.max_steps,
                    timeout_override=req.timeout,
                    output_dir=_OUTPUT_DIR,
                )

                record.result = result
                record.status = result.status
            except Exception as exc:
                record.status = "errored"
                record.result = None
                await ws_manager.broadcast(run_id, {
                    "event_type": "error",
                    "run_id": run_id,
                    "data": {"message": str(exc)},
                    "timestamp": _utcnow(),
                })
            finally:
                record.completed_at = _utcnow()
                await ws_manager.broadcast(run_id, {
                    "event_type": "complete",
                    "run_id": run_id,
                    "data": {"status": record.status},
                    "timestamp": _utcnow(),
                })
                self._queue.task_done()
                self._evict_old_runs()

    def submit(self, request: RunRequest) -> str:
        run_id = f"run-{uuid.uuid4().hex[:8]}"
        record = RunRecord(run_id=run_id, status="queued", request=request)
        self._runs[run_id] = record
        self._queue.put_nowait(record)
        return run_id

    def get_run(self, run_id: str) -> RunRecord | None:
        return self._runs.get(run_id)

    def list_runs(self) -> list[RunRecord]:
        return list(self._runs.values())

    def cancel(self, run_id: str) -> bool:
        record = self._runs.get(run_id)
        if record is None:
            return False
        if record.status == "queued":
            record.status = "cancelled"
            return True
        return False

    def _evict_old_runs(self) -> None:
        if len(self._runs) <= _MAX_HISTORY:
            return
        completed = [
            r for r in self._runs.values()
            if r.status not in ("queued", "running")
        ]
        completed.sort(key=lambda r: r.completed_at or "")
        for record in completed[:len(self._runs) - _MAX_HISTORY]:
            del self._runs[record.run_id]


job_queue = JobQueue()
