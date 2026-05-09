from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from hawkeye_sandbox import SandboxConfig, SandboxManager
from hawkeye_sandbox.sandbox import SandboxHandle

logger = logging.getLogger(__name__)

_DEFAULT_POOL_SIZE = int(os.environ.get("HAWKEYE_POOL_SIZE", "2"))
_DEFAULT_IMAGE = os.environ.get("HAWKEYE_SANDBOX_IMAGE", "project-hawkeye-hawkeye-sandbox:latest")
_DEFAULT_BROWSER = "chromium"


class ContainerPool:
    """Pre-warmed sandbox container pool.

    Maintains a fixed number of idle containers. Callers acquire() a handle
    before a run and release() it after — release stops the used container
    and spawns a fresh replacement asynchronously so the pool stays full.

    All Docker operations are run in a thread pool (asyncio.to_thread) to
    avoid blocking the event loop.
    """

    def __init__(
        self,
        *,
        pool_size: int = _DEFAULT_POOL_SIZE,
        browser: str = _DEFAULT_BROWSER,
        image: str = _DEFAULT_IMAGE,
        target_url: str = "about:blank",
    ) -> None:
        self._pool_size = pool_size
        self._browser = browser
        self._image = image
        self._target_url = target_url
        self._manager = SandboxManager()
        self._available: asyncio.Queue[SandboxHandle] = asyncio.Queue()
        self._refill_task: asyncio.Task | None = None
        self._started = False

    async def start(self) -> None:
        """Pre-warm pool_size containers. Called once on API startup."""
        if self._started:
            return
        self._started = True
        logger.info("ContainerPool: pre-warming %d %s containers", self._pool_size, self._browser)
        results = await asyncio.gather(
            *[self._spawn_one() for _ in range(self._pool_size)],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                logger.warning("ContainerPool: spawn failed during warm-up: %s", r)
            else:
                await self._available.put(r)
        logger.info("ContainerPool: ready with %d containers", self._available.qsize())

    async def stop(self) -> None:
        """Drain the pool and stop all containers. Called on API shutdown."""
        if self._refill_task:
            self._refill_task.cancel()
        while not self._available.empty():
            try:
                handle = self._available.get_nowait()
                await asyncio.to_thread(self._manager.stop, handle)
            except asyncio.QueueEmpty:
                break

    async def acquire(self, *, url: str = "about:blank", timeout_s: float = 60.0) -> SandboxHandle:
        """Get a container from the pool, waiting up to timeout_s. Navigates to url."""
        try:
            handle = await asyncio.wait_for(self._available.get(), timeout=timeout_s)
        except asyncio.TimeoutError:
            logger.warning("ContainerPool: pool empty, spawning on-demand")
            handle = await self._spawn_one()
        return handle

    async def release(self, handle: SandboxHandle) -> None:
        """Return a used container: stop it and spawn a fresh replacement."""
        asyncio.create_task(self._stop_and_refill(handle))

    async def _stop_and_refill(self, handle: SandboxHandle) -> None:
        try:
            await asyncio.to_thread(self._manager.stop, handle)
        except Exception as exc:
            logger.warning("ContainerPool: stop failed: %s", exc)
        try:
            new_handle = await self._spawn_one()
            await self._available.put(new_handle)
            logger.debug("ContainerPool: refilled, pool size=%d", self._available.qsize())
        except Exception as exc:
            logger.warning("ContainerPool: refill spawn failed: %s", exc)

    async def _spawn_one(self) -> SandboxHandle:
        cfg = SandboxConfig(
            url=self._target_url,
            browser=self._browser,
            image=self._image,
        )
        return await asyncio.to_thread(self._manager.spawn, cfg)

    @property
    def available_count(self) -> int:
        return self._available.qsize()


container_pool = ContainerPool()
