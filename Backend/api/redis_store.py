from __future__ import annotations
import json
import os
from typing import Any

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
_RUN_KEY = "hawkeye:run:{}"
_RUN_IDS_KEY = "hawkeye:run_ids"
_EVENTS_CHANNEL = "hawkeye:events:{}"
_MAX_RUN_IDS = 100
_RUN_TTL_S = 60 * 60 * 24 * 7  # 7 days

_redis = None


async def get_redis():
    global _redis
    if _redis is None:
        from redis.asyncio import from_url
        _redis = from_url(REDIS_URL, decode_responses=True)
    return _redis


async def save_run(record: dict) -> None:
    r = await get_redis()
    key = _RUN_KEY.format(record["run_id"])
    await r.set(key, json.dumps(record), ex=_RUN_TTL_S)
    if record.get("status") == "queued":
        await r.lpush(_RUN_IDS_KEY, record["run_id"])
        await r.ltrim(_RUN_IDS_KEY, 0, _MAX_RUN_IDS - 1)


async def get_run(run_id: str) -> dict | None:
    r = await get_redis()
    data = await r.get(_RUN_KEY.format(run_id))
    return json.loads(data) if data else None


async def list_runs() -> list[dict]:
    r = await get_redis()
    run_ids = await r.lrange(_RUN_IDS_KEY, 0, _MAX_RUN_IDS - 1)
    if not run_ids:
        return []
    keys = [_RUN_KEY.format(rid) for rid in run_ids]
    values = await r.mget(*keys)
    return [json.loads(v) for v in values if v]


async def publish_event(run_id: str, event: dict) -> None:
    r = await get_redis()
    await r.publish(_EVENTS_CHANNEL.format(run_id), json.dumps(event))


async def subscribe_run(run_id: str):
    """Async generator yielding event dicts from the run's pub/sub channel."""
    from redis.asyncio import from_url
    r = from_url(REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(_EVENTS_CHANNEL.format(run_id))
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield json.loads(message["data"])
    finally:
        await pubsub.unsubscribe()
        await r.aclose()
