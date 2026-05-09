from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from api.artifact_store import get_store
from api.job_queue import job_queue

router = APIRouter(prefix="/runs", tags=["artifacts"])


@router.get("/{run_id}/artifacts")
async def list_artifacts(run_id: str) -> dict:
    record = await job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(404, f"Run {run_id!r} not found")
    store = get_store()
    manifest = store.list(run_id)
    return {
        "run_id": run_id,
        "artifacts": [
            {
                "name": m.name,
                "type": m.type,
                "url": m.url,
                "size_bytes": m.size_bytes,
                **(({"step": m.step}) if m.step is not None else {}),
                **(({"assertion_id": m.assertion_id}) if m.assertion_id else {}),
            }
            for m in manifest
        ],
    }


@router.get("/{run_id}/artifacts/{filename:path}")
async def get_artifact(run_id: str, filename: str) -> FileResponse:
    record = await job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(404, f"Run {run_id!r} not found")
    store = get_store()
    path: Path = store.get_path(run_id, filename)
    if not path.exists():
        raise HTTPException(404, f"Artifact {filename!r} not found for run {run_id!r}")
    return FileResponse(path)
