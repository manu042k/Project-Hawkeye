"""Async token-bucket rate limiter for LLM API calls.

Used to stay within NVIDIA NIM's 40 RPM limit (and similar provider limits).
Enforces a minimum interval between successive LLM requests process-wide.

Usage:
    from orchestrator.llm.rate_limiter import configure, get_limiter

    # Once at startup (e.g. in CLI before running):
    configure(requests_per_minute=40)

    # In reason_node before each ainvoke():
    limiter = get_limiter()
    if limiter:
        await limiter.acquire()
"""
from __future__ import annotations

import asyncio
import logging
import time

logger = logging.getLogger(__name__)

# NVIDIA NIM default free-tier limit.
NVIDIA_RPM = 40


class RateLimiter:
    """Enforces a minimum interval between LLM calls using an async lock.

    Thread-safe for a single asyncio event loop (which is all we need —
    the agent graph runs in one loop).
    """

    def __init__(self, requests_per_minute: int) -> None:
        if requests_per_minute <= 0:
            raise ValueError(f"requests_per_minute must be > 0, got {requests_per_minute}")
        self._rpm = requests_per_minute
        self._min_interval_s: float = 60.0 / requests_per_minute
        self._last_call_at: float = 0.0
        self._lock: asyncio.Lock | None = None  # created lazily (event-loop-safe)

    @property
    def requests_per_minute(self) -> int:
        return self._rpm

    @property
    def min_interval_s(self) -> float:
        return self._min_interval_s

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def acquire(self) -> None:
        """Block until enough time has elapsed since the last call."""
        async with self._get_lock():
            now = time.monotonic()
            elapsed = now - self._last_call_at
            remaining = self._min_interval_s - elapsed
            if remaining > 0:
                logger.debug(
                    "Rate limiter: sleeping %.2fs to stay within %d RPM",
                    remaining,
                    self._rpm,
                )
                await asyncio.sleep(remaining)
            self._last_call_at = time.monotonic()


# ---------------------------------------------------------------------------
# Process-level singleton — shared across all RunManager / reason_node calls
# in the same process so the limit is respected across back-to-back test runs.
# ---------------------------------------------------------------------------
_limiter: RateLimiter | None = None


def configure(requests_per_minute: int) -> RateLimiter:
    """Set (or replace) the process-level rate limiter and return it."""
    global _limiter
    _limiter = RateLimiter(requests_per_minute)
    logger.info("Rate limiter configured: %d RPM (%.2fs min interval)", requests_per_minute, 60.0 / requests_per_minute)
    return _limiter


def get_limiter() -> RateLimiter | None:
    """Return the active rate limiter, or None if none was configured."""
    return _limiter


def auto_configure_for_model(model: str) -> RateLimiter | None:
    """Configure the appropriate rate limit based on model string.

    Currently auto-configures for NVIDIA NIM models (40 RPM).
    Returns the limiter if one was configured, None otherwise.
    """
    if model.startswith("nvidia:"):
        return configure(NVIDIA_RPM)
    return None
