from __future__ import annotations
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from api.job_queue import job_queue
from api.redis_store import get_traces as _get_traces
from api.schemas import RunListResponse, RunRequest, RunResponse

router = APIRouter(prefix="/runs", tags=["runs"])
_TEST_CASES_DIR = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases"


def _record_to_response(record: dict) -> RunResponse:
    return RunResponse(
        run_id=record["run_id"],
        status=record["status"],
        test_name=record.get("test_name"),
        created_at=record["created_at"],
        duration_s=record.get("duration_s"),
        total_steps=record.get("total_steps"),
        estimated_cost_usd=record.get("estimated_cost_usd"),
        termination_reason=record.get("termination_reason"),
        output_dir=record.get("output_dir"),
        novnc_url=record.get("novnc_url"),
        assertion_results=record.get("assertion_results"),
        error_message=record.get("error_message"),
        steps_completed=record.get("steps_completed"),
        total_input_tokens=record.get("total_input_tokens"),
        total_output_tokens=record.get("total_output_tokens"),
        error_count=record.get("error_count"),
        tool_call_count=record.get("tool_call_count"),
        artifact_manifest=record.get("artifact_manifest"),
    )


@router.post("", response_model=RunResponse)
async def submit_run(request: RunRequest) -> RunResponse:
    # Phase 5A: resolve test_case_id from in-memory store -> write tmp yaml path
    if request.test_case_id:
        from api.routes.test_cases_crud import _store
        record = next(
            (tc for proj in _store.values() for tc in proj.values() if tc["id"] == request.test_case_id),
            None,
        )
        if not record:
            raise HTTPException(404, f"Test case {request.test_case_id!r} not found")
        import json, tempfile, os
        spec = record["spec"]
        # Write spec as a temp YAML-compatible JSON file the loader can parse
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            import yaml as _yaml
            _yaml.dump(spec, f, allow_unicode=True)
            tmp_path = f.name
        request = request.model_copy(update={"test_case_path": tmp_path})
    else:
        path = Path(request.test_case_path)
        if not path.is_absolute():
            path = _TEST_CASES_DIR / request.test_case_path
        if not path.exists():
            raise HTTPException(422, f"Test case not found: {path}")
        request = request.model_copy(update={"test_case_path": str(path)})
    run_id = job_queue.submit(request)
    await asyncio.sleep(0.05)
    record = await job_queue.get_run(run_id)
    if not record:
        return RunResponse(run_id=run_id, status="queued", created_at="")
    return _record_to_response(record)


@router.get("", response_model=RunListResponse)
async def list_runs() -> RunListResponse:
    records = await job_queue.list_runs()
    return RunListResponse(runs=[_record_to_response(r) for r in records], total=len(records))


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: str) -> RunResponse:
    record = await job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(404, f"Run {run_id!r} not found")
    return _record_to_response(record)


@router.delete("/{run_id}")
async def cancel_run(run_id: str) -> dict:
    cancelled = await job_queue.cancel(run_id)
    return {"cancelled": cancelled}


@router.get("/{run_id}/traces")
async def get_run_traces(run_id: str) -> dict:
    record = await job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(404, f"Run {run_id!r} not found")
    traces = await _get_traces(run_id)
    return {"run_id": run_id, "traces": traces}


@router.get("/{run_id}/observe")
async def observe_run(run_id: str) -> dict:
    record = await job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(404, f"Run {run_id!r} not found")
    novnc_url = record.get("novnc_url")
    if not novnc_url:
        raise HTTPException(404, "No noVNC URL available")
    return {"run_id": run_id, "novnc_url": novnc_url}
