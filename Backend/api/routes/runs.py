from __future__ import annotations
import asyncio
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from api.auth_utils import get_current_user
from fastapi.responses import StreamingResponse
from api.job_queue import job_queue
from api.redis_store import get_traces as _get_traces
from api.schemas import RunListResponse, RunRequest, RunResponse

router = APIRouter(prefix="/runs", tags=["runs"])
_TEST_CASES_DIR = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases"


def _enforce_plan_limit(request: RunRequest) -> None:
    """Reject runs when the org has exhausted its monthly quota.

    When no DB is present (dev mode) or plan enforcement is disabled via
    HAWKEYE_PLAN_ENFORCE=0, this is a no-op.
    """
    import os
    if os.environ.get("HAWKEYE_PLAN_ENFORCE", "0") != "1":
        return
    from api.redis_store import list_runs as _list_runs
    from api.routes.billing import PLAN_LIMITS
    # Default to free limits; a production impl would look up org+plan from DB
    plan = os.environ.get("HAWKEYE_DEFAULT_PLAN", "free")
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["runs"]
    current_count = len(_list_runs())
    if current_count >= limit:
        raise HTTPException(
            429,
            detail=f"Plan limit reached: {current_count}/{limit} runs used this period. Upgrade to continue.",
        )


def _record_to_response(record: dict) -> RunResponse:
    req = record.get("request") or {}
    return RunResponse(
        run_id=record["run_id"],
        status=record["status"],
        test_name=record.get("test_name"),
        triggered_by=record.get("triggered_by"),
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
        browser_used=req.get("browser") or "chromium",
        model_used=req.get("model"),
        recording=req.get("record", False),
        max_steps_override=req.get("max_steps"),
        timeout_override=req.get("timeout"),
        viewport=record.get("viewport"),
    )


@router.post("", response_model=RunResponse)
async def submit_run(request: RunRequest, http_request: Request, user: dict = Depends(get_current_user)) -> RunResponse:
    # Plan-limit check: count runs this month vs org plan limit
    _enforce_plan_limit(request)

    # Capture triggered_by from JWT user, header, or body — in that priority order
    if not request.triggered_by:
        email = http_request.headers.get("X-User-Email") or user.get("email")
        if email:
            request = request.model_copy(update={"triggered_by": email})

    # Phase 5A: resolve test_case_id from DB -> write tmp yaml path
    if request.test_case_id:
        from api.database import AsyncSessionLocal
        from api.models import TestCase
        from sqlalchemy import select
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(TestCase).where(TestCase.id == request.test_case_id))
            tc = result.scalar_one_or_none()
        if not tc:
            raise HTTPException(404, f"Test case {request.test_case_id!r} not found")
        import tempfile
        spec = tc.spec or {}
        # Inherit save_record from the test case spec if not explicitly set
        if not request.record and spec.get("save_record"):
            request = request.model_copy(update={"record": True})
        # Write spec as a temp YAML-compatible JSON file the loader can parse
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            import yaml as _yaml
            _yaml.dump(spec, f, allow_unicode=True)
            tmp_path = f.name
        request = request.model_copy(update={"test_case_path": tmp_path})
        _viewport = (spec.get("target") or {}).get("viewport")
        _test_name = spec.get("name")
    else:
        path = Path(request.test_case_path)
        if not path.is_absolute():
            path = _TEST_CASES_DIR / request.test_case_path
        if not path.exists():
            raise HTTPException(422, f"Test case not found: {path}")
        request = request.model_copy(update={"test_case_path": str(path)})
        _viewport = None
        _test_name = None
    run_id = job_queue.submit(request)
    await asyncio.sleep(0.05)
    record = await job_queue.get_run(run_id)
    if not record:
        return RunResponse(run_id=run_id, status="queued", created_at="")
    # Stash extra metadata not carried in RunRequest
    needs_save = False
    if _viewport and not record.get("viewport"):
        record["viewport"] = _viewport
        needs_save = True
    if _test_name and not record.get("test_name"):
        record["test_name"] = _test_name
        needs_save = True
    if needs_save:
        from api import redis_store as _rs
        await _rs.save_run(record)
    return _record_to_response(record)


@router.get("", response_model=RunListResponse)
async def list_runs() -> RunListResponse:
    records = await job_queue.list_runs()
    return RunListResponse(runs=[_record_to_response(r) for r in records], total=len(records))


@router.get("/stream")
async def stream_runs(request: Request) -> StreamingResponse:
    """SSE endpoint — sends the full run list on connect, then a run record on every change."""
    from api import redis_store as _rs

    async def event_generator():
        # Send current snapshot on connect
        records = await job_queue.list_runs()
        runs = [_record_to_response(r).model_dump(mode="json") for r in records]
        yield f"event: snapshot\ndata: {json.dumps(runs)}\n\n"

        # Stream individual run updates
        async for record in _rs.subscribe_runs_updates():
            if await request.is_disconnected():
                break
            run = _record_to_response(record).model_dump(mode="json")
            yield f"event: run_update\ndata: {json.dumps(run)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: str) -> RunResponse:
    record = await job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(404, f"Run {run_id!r} not found")
    return _record_to_response(record)


@router.delete("/{run_id}")
async def cancel_run(run_id: str) -> dict:
    from api.redis_store import delete_run as _delete_run, get_run as _get_run
    record = await _get_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    terminal = {"passed", "failed", "errored", "timed_out", "blocked", "cancelled"}
    if record.get("status") in terminal:
        # Hard-delete completed runs from Redis
        await _delete_run(run_id)
        return {"cancelled": True, "deleted": True}
    # Cancel in-flight run
    cancelled = await job_queue.cancel(run_id)
    return {"cancelled": cancelled, "deleted": False}


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
