from __future__ import annotations
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import api.redis_store as redis_store
from api.job_queue import job_queue

router = APIRouter(tags=["websocket"])

_TERMINAL = {"passed", "failed", "errored", "timed_out", "blocked", "cancelled"}
_PING_INTERVAL_S = 20.0


@router.websocket("/ws/runs/{run_id}/trace")
async def trace_ws(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    try:
        record = await job_queue.get_run(run_id)
        if record:
            await websocket.send_json({"event_type": "current_state", "run_id": run_id, "data": record})

        if record and record["status"] in _TERMINAL:
            await websocket.close()
            return

        ping_task = asyncio.create_task(_ping_loop(websocket))
        try:
            async for event in redis_store.subscribe_run(run_id):
                await websocket.send_json(event)
                if event.get("event_type") in ("complete", "error") or \
                   event.get("data", {}).get("status") in _TERMINAL:
                    break
        finally:
            ping_task.cancel()

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


async def _ping_loop(ws: WebSocket) -> None:
    try:
        while True:
            await asyncio.sleep(_PING_INTERVAL_S)
            await ws.send_json({"event_type": "ping"})
    except (asyncio.CancelledError, Exception):
        pass
