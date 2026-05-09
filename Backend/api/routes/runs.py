from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from api.job_queue import job_queue
from api.schemas import RunListResponse, RunRequest, RunResponse

router = APIRouter(prefix="/runs", tags=["runs"])

_TEST_CASES_DIR = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases"


def _record_to_response(record) -> RunResponse:
    result = record.result
    return RunResponse(
        run_id=record.run_id,
        status=record.status,
        test_name=result.test_name if result else None,
        created_at=record.created_at,
        duration_s=result.duration_s if result else None,
        total_steps=result.total_steps if result else None,
        estimated_cost_usd=result.estimated_cost_usd if result else None,
        termination_reason=result.termination_reason if result else None,
        output_dir=str(result.trace_path.parent) if result and result.trace_path else None,
        novnc_url=record.novnc_url,
        assertion_results=[
            {
                "id": ar.assertion_id,
                "type": ar.type,
                "description": ar.description,
                "passed": ar.passed,
                "status": ar.status,
                "details": ar.details,
            }
            for ar in result.assertion_results
        ] if result else None,
    )


@router.post("", response_model=RunResponse)
async def submit_run(request: RunRequest) -> RunResponse:
    path = Path(request.test_case_path)
    if not path.is_absolute():
        path = _TEST_CASES_DIR / request.test_case_path
    if not path.exists():
        raise HTTPException(status_code=422, detail=f"Test case not found: {path}")
    request = request.model_copy(update={"test_case_path": str(path)})
    run_id = job_queue.submit(request)
    record = job_queue.get_run(run_id)
    return _record_to_response(record)


@router.get("", response_model=RunListResponse)
async def list_runs() -> RunListResponse:
    records = job_queue.list_runs()
    return RunListResponse(
        runs=[_record_to_response(r) for r in records],
        total=len(records),
    )


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: str) -> RunResponse:
    record = job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return _record_to_response(record)


@router.delete("/{run_id}")
async def cancel_run(run_id: str) -> dict:
    cancelled = job_queue.cancel(run_id)
    return {"cancelled": cancelled}


@router.get("/{run_id}/observe")
async def observe_run(run_id: str) -> dict:
    record = job_queue.get_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    if not record.novnc_url:
        raise HTTPException(
            status_code=404,
            detail="No noVNC URL available (run not yet started or not using pool)",
        )
    return {"run_id": run_id, "novnc_url": record.novnc_url}
