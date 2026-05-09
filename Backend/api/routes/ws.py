from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.job_queue import job_queue
from api.ws_manager import ws_manager

router = APIRouter(tags=["websocket"])

_PING_INTERVAL_S = 20


@router.websocket("/ws/runs/{run_id}/trace")
async def run_trace(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    ws_manager.connect(run_id, websocket)

    record = job_queue.get_run(run_id)
    if record is not None:
        await websocket.send_json({
            "event_type": "run_status",
            "run_id": run_id,
            "data": {"status": record.status},
            "timestamp": "",
        })

    try:
        while True:
            await asyncio.sleep(_PING_INTERVAL_S)
            try:
                await websocket.send_json({"event_type": "ping", "run_id": run_id, "data": {}, "timestamp": ""})
            except Exception:
                break
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        ws_manager.disconnect(run_id, websocket)
