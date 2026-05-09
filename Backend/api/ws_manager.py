from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: dict[str, set] = defaultdict(set)

    def connect(self, run_id: str, ws: WebSocket) -> None:
        self._connections[run_id].add(ws)

    def disconnect(self, run_id: str, ws: WebSocket) -> None:
        self._connections[run_id].discard(ws)
        if not self._connections[run_id]:
            del self._connections[run_id]

    async def broadcast(self, run_id: str, event: dict) -> None:
        clients = list(self._connections.get(run_id, set()))
        if not clients:
            return
        await asyncio.gather(
            *[_safe_send(ws, event) for ws in clients],
            return_exceptions=True,
        )

    async def broadcast_all(self, event: dict) -> None:
        all_clients = [
            ws
            for clients in self._connections.values()
            for ws in clients
        ]
        if not all_clients:
            return
        await asyncio.gather(
            *[_safe_send(ws, event) for ws in all_clients],
            return_exceptions=True,
        )


async def _safe_send(ws: WebSocket, event: dict) -> None:
    try:
        await ws.send_json(event)
    except Exception:
        pass


ws_manager = WebSocketManager()
