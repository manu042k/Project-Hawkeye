from __future__ import annotations
import asyncio
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from api.schemas import RunRequest
import api.redis_store as redis_store
from api.celery_app import celery_app


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobQueue:
    def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    def submit(self, request: RunRequest) -> str:
        run_id = f"run-{uuid.uuid4().hex[:8]}"
        record = {
            "run_id": run_id,
            "status": "queued",
            "request": request.model_dump(),
            "result": None,
            "novnc_url": None,
            "error_message": None,
            "celery_task_id": None,
            "created_at": _utcnow(),
            "started_at": None,
            "completed_at": None,
        }
        asyncio.get_event_loop().create_task(redis_store.save_run(record))

        from api.tasks import run_test_case
        task = run_test_case.delay(run_id, request.model_dump())

        async def _set_task_id() -> None:
            await redis_store.save_run({**record, "celery_task_id": task.id})

        asyncio.get_event_loop().create_task(_set_task_id())
        return run_id

    async def get_run(self, run_id: str) -> dict | None:
        return await redis_store.get_run(run_id)

    async def list_runs(self) -> list[dict]:
        return await redis_store.list_runs()

    async def cancel(self, run_id: str) -> bool:
        record = await redis_store.get_run(run_id)
        if not record:
            return False
        if record["status"] not in ("queued", "running"):
            return False
        task_id = record.get("celery_task_id")
        if task_id:
            celery_app.control.revoke(task_id, terminate=True)
        record["status"] = "cancelled"
        record["completed_at"] = _utcnow()
        await redis_store.save_run(record)
        return True


job_queue = JobQueue()
