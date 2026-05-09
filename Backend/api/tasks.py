from __future__ import annotations
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv
load_dotenv(_BACKEND / ".env")

from api.celery_app import celery_app, REDIS_URL

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@celery_app.task(bind=True, name="hawkeye.run_test_case")
def run_test_case(self, run_id: str, request_dict: dict) -> dict:
    """Execute one test run. Called by Celery worker (sync entry point)."""
    return asyncio.run(_execute(self.request.id, run_id, request_dict))


async def _execute(celery_task_id: str, run_id: str, request_dict: dict) -> dict:
    import redis.asyncio as aioredis
    from orchestrator.llm.provider import get_llm
    from orchestrator.loader.yaml_loader import load_test_case
    from orchestrator.runner.run_manager import RunManager

    r = aioredis.from_url(REDIS_URL, decode_responses=True)

    async def _update_record(updates: dict) -> None:
        from api.redis_store import _RUN_KEY, _RUN_TTL_S
        key = _RUN_KEY.format(run_id)
        data = await r.get(key)
        if data:
            record = json.loads(data)
            record.update(updates)
            await r.set(key, json.dumps(record), ex=_RUN_TTL_S)

    async def _publish(event_type: str, data: dict) -> None:
        from api.redis_store import _EVENTS_CHANNEL
        event = {
            "event_type": event_type,
            "run_id": run_id,
            "data": data,
            "timestamp": _utcnow(),
        }
        await r.publish(_EVENTS_CHANNEL.format(run_id), json.dumps(event))

    async def _ws_emitter(event_type: str, data: dict) -> None:
        if event_type == "sandbox_ready" and "novnc_url" in data:
            await _update_record({"novnc_url": data["novnc_url"]})
        await _publish(event_type, data)

    try:
        await _update_record({"status": "running", "started_at": _utcnow()})
        await _publish("run_started", {"status": "running"})

        test_case = load_test_case(request_dict["test_case_path"])
        llm = get_llm(request_dict["model"])

        manager = RunManager(
            llm=llm,
            model_name=request_dict["model"],
            record=request_dict.get("record", False),
            figma_url=request_dict.get("figma_url"),
            figma_token=request_dict.get("figma_token"),
            ws_emitter=_ws_emitter,
        )

        pool_size = int(os.environ.get("HAWKEYE_POOL_SIZE", "0"))
        if pool_size > 0:
            try:
                from api.container_pool import container_pool
                handle = await container_pool.acquire(url=test_case.target.url)
                manager._prewarmed_handle = handle
                await _update_record({"novnc_url": handle.novnc_url})
            except Exception as exc:
                logger.warning("Pool acquire failed: %s", exc)

        result = await manager.run(
            test_case,
            browser_override=request_dict.get("browser"),
            max_steps_override=request_dict.get("max_steps"),
            timeout_override=request_dict.get("timeout"),
            output_dir=Path("artifacts"),
        )

        result_dict = {
            "status": result.status,
            "test_name": result.test_name,
            "duration_s": result.duration_s,
            "total_steps": result.total_steps,
            "estimated_cost_usd": result.estimated_cost_usd,
            "termination_reason": result.termination_reason,
            "output_dir": str(result.trace_path.parent) if result.trace_path else None,
            "steps_completed": result.steps_completed,
            "total_input_tokens": result.total_input_tokens,
            "total_output_tokens": result.total_output_tokens,
            "error_count": result.error_count,
            "tool_call_count": result.tool_call_count,
            "assertion_results": [
                {
                    "id": ar.assertion_id,
                    "type": ar.type,
                    "description": ar.description,
                    "passed": ar.passed,
                    "status": ar.status,
                    "details": ar.details,
                }
                for ar in result.assertion_results
            ],
        }

        # Persist step traces so the report page can fetch them.
        if manager._collector and manager._collector.traces:
            from dataclasses import asdict
            from api.redis_store import save_traces as _save_traces
            await _save_traces(run_id, [asdict(t) for t in manager._collector.traces])

        await _update_record({**result_dict, "completed_at": _utcnow()})
        await _publish("complete", {"status": result.status})
        return result_dict

    except Exception as exc:
        logger.exception("Task %s failed: %s", run_id, exc)
        await _update_record({
            "status": "errored",
            "error_message": str(exc),
            "completed_at": _utcnow(),
        })
        await _publish("error", {"message": str(exc)})
        return {"status": "errored", "error_message": str(exc)}
    finally:
        await r.aclose()
