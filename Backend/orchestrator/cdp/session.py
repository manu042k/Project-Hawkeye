"""Chrome DevTools Protocol WebSocket session."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)

_MAX_RECONNECT_ATTEMPTS = 3


@dataclass
class NetworkRequest:
    request_id: str
    method: str
    url: str
    status: int = 0
    request_headers: dict = field(default_factory=dict)
    response_headers: dict = field(default_factory=dict)
    started_at: float = 0.0
    finished_at: float = 0.0
    failed: bool = False
_RECONNECT_DELAY_S = 1.0


class CdpTimeoutError(Exception):
    """Raised when a CDP command or evaluate_js call times out."""


class CdpConnectionError(Exception):
    """Raised when CDP connection cannot be established after retries."""


@dataclass
class ConsoleMessage:
    level: str  # "log" | "warning" | "error" | "info" | "debug"
    text: str
    url: str = ""
    line: int = 0


class CdpSession:
    """Manages a persistent CDP WebSocket session for a single browser tab.

    Phase 1 implements the Network and Console domains:
    - Network: tracks pending XHR/fetch request counts for wait_for_stable.
    - Console: buffers console.error/warn messages for get_console_errors.

    Auto-reconnects up to 3 times with 1-second delays on connection drop.
    All buffers are preserved across reconnections.
    """

    def __init__(self, cdp_url: str) -> None:
        self._cdp_url = cdp_url
        self._ws: Any = None
        self._pending_commands: dict[int, asyncio.Future] = {}
        self._cmd_id = 0
        self._receiver_task: asyncio.Task | None = None
        self._connected = False

        # Network domain state
        self._pending_requests: set[str] = set()  # requestIds in flight
        self._network_log: list[NetworkRequest] = []
        self._network_log_max = 5000

        # Console domain state
        self._console_messages: list[ConsoleMessage] = []

        # Runtime domain: mutation observer injection tracking
        self._mutation_observer_injected = False
        self._mutation_count = 0

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Connect to the CDP endpoint. Retries up to 3 times on failure."""
        last_exc: Exception | None = None
        for attempt in range(_MAX_RECONNECT_ATTEMPTS):
            try:
                # Fetch the list of debuggable targets and pick the first page.
                ws_url = await self._resolve_ws_url()
                self._ws = await websockets.connect(ws_url, max_size=50 * 1024 * 1024)
                self._connected = True
                self._receiver_task = asyncio.create_task(
                    self._receive_loop(), name="cdp-receiver"
                )
                logger.debug("CDP connected: %s", ws_url)
                return
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "CDP connect attempt %d/%d failed: %s",
                    attempt + 1,
                    _MAX_RECONNECT_ATTEMPTS,
                    exc,
                )
                if attempt < _MAX_RECONNECT_ATTEMPTS - 1:
                    await asyncio.sleep(_RECONNECT_DELAY_S)
        raise CdpConnectionError(
            f"Failed to connect to CDP at {self._cdp_url} after "
            f"{_MAX_RECONNECT_ATTEMPTS} attempts: {last_exc}"
        )

    async def close(self) -> None:
        """Close the session. Idempotent."""
        self._connected = False
        if self._receiver_task and not self._receiver_task.done():
            self._receiver_task.cancel()
            try:
                await self._receiver_task
            except asyncio.CancelledError:
                pass
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

    # ------------------------------------------------------------------
    # Domain enablement
    # ------------------------------------------------------------------

    async def enable_network_capture(self) -> None:
        """Enable CDP Network domain and start buffering request counts."""
        await self._send("Network.enable", {})
        logger.debug("CDP Network domain enabled")

    async def enable_console_capture(self) -> None:
        """Enable CDP Log domain to capture console messages."""
        await self._send("Log.enable", {})
        await self._send("Runtime.enable", {})
        logger.debug("CDP Log/Runtime domains enabled")

    async def enable_page_capture(self) -> None:
        """Enable CDP Page domain."""
        await self._send("Page.enable", {})
        logger.debug("CDP Page domain enabled")

    # ------------------------------------------------------------------
    # Readable state
    # ------------------------------------------------------------------

    @property
    def pending_request_count(self) -> int:
        """Number of in-flight XHR/fetch requests."""
        return len(self._pending_requests)

    @property
    def console_messages(self) -> list[ConsoleMessage]:
        """All captured console messages since session start."""
        return list(self._console_messages)

    def get_network_requests(
        self,
        *,
        url_pattern: str | None = None,
        method: str | None = None,
        status_gte: int | None = None,
        status_lte: int | None = None,
    ) -> list[NetworkRequest]:
        """Return filtered network requests from the buffer."""
        import fnmatch
        results = list(self._network_log)
        if url_pattern:
            results = [
                r for r in results
                if fnmatch.fnmatch(r.url, url_pattern) or url_pattern in r.url
            ]
        if method:
            results = [r for r in results if r.method.upper() == method.upper()]
        if status_gte is not None:
            results = [r for r in results if r.status >= status_gte]
        if status_lte is not None:
            results = [r for r in results if r.status <= status_lte]
        return results

    async def take_screenshot(self) -> bytes:
        """Capture the current page as PNG bytes via CDP.

        Attempts one reconnect if the WebSocket dropped (e.g. after navigation).
        """
        import base64
        if not self._connected:
            try:
                await self.connect()
            except Exception as exc:
                logger.debug("take_screenshot: reconnect failed: %s", exc)
                return b""
        try:
            result = await self._send("Page.captureScreenshot", {"format": "png"})
            data = result.get("data", "")
            return base64.b64decode(data) if data else b""
        except Exception:
            # WebSocket may have just dropped — try one reconnect then retry
            try:
                await self.connect()
                result = await self._send("Page.captureScreenshot", {"format": "png"})
                data = result.get("data", "")
                return base64.b64decode(data) if data else b""
            except Exception as exc:
                logger.warning("take_screenshot failed: %s", exc)
                return b""

    # ------------------------------------------------------------------
    # JS evaluation
    # ------------------------------------------------------------------

    async def evaluate_js(self, expression: str, *, timeout_ms: int = 5000) -> Any:
        """Execute JavaScript in the page context.

        Returns the result value. Raises CdpTimeoutError on timeout or any
        CDP-level error — never propagates other exception types.
        """
        try:
            result = await asyncio.wait_for(
                self._send("Runtime.evaluate", {
                    "expression": expression,
                    "returnByValue": True,
                    "awaitPromise": False,
                }),
                timeout=timeout_ms / 1000,
            )
        except asyncio.TimeoutError as exc:
            raise CdpTimeoutError(
                f"evaluate_js timed out after {timeout_ms}ms: {expression[:80]!r}"
            ) from exc
        except Exception as exc:
            raise CdpTimeoutError(f"evaluate_js failed: {exc}") from exc

        if result.get("exceptionDetails"):
            detail = result["exceptionDetails"]
            raise CdpTimeoutError(
                f"JS exception: {detail.get('text', str(detail))[:200]}"
            )
        value_obj = result.get("result", {})
        return value_obj.get("value")

    # ------------------------------------------------------------------
    # Internal: send / receive
    # ------------------------------------------------------------------

    async def _send(self, method: str, params: dict) -> dict:
        """Send a CDP command and await its response."""
        if not self._connected or self._ws is None:
            raise CdpConnectionError("CDP session is not connected")
        self._cmd_id += 1
        cmd_id = self._cmd_id
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending_commands[cmd_id] = future
        payload = json.dumps({"id": cmd_id, "method": method, "params": params})
        try:
            await self._ws.send(payload)
        except Exception as exc:
            self._pending_commands.pop(cmd_id, None)
            raise CdpConnectionError(f"CDP send failed: {exc}") from exc
        return await future

    async def _receive_loop(self) -> None:
        """Background task: read CDP messages and dispatch them."""
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                # Command response
                if "id" in msg:
                    future = self._pending_commands.pop(msg["id"], None)
                    if future and not future.done():
                        if "error" in msg:
                            future.set_exception(
                                RuntimeError(f"CDP error: {msg['error']}")
                            )
                        else:
                            future.set_result(msg.get("result", {}))
                    continue

                # Event
                method = msg.get("method", "")
                params = msg.get("params", {})
                self._dispatch_event(method, params)

        except ConnectionClosed:
            pass
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("CDP receive loop error: %s", exc)
        finally:
            self._connected = False
            for future in self._pending_commands.values():
                if not future.done():
                    future.set_exception(CdpConnectionError("CDP connection closed"))
            self._pending_commands.clear()

    def _dispatch_event(self, method: str, params: dict) -> None:
        """Handle CDP events for tracked domains."""
        if method == "Network.requestWillBeSent":
            request_id = params.get("requestId", "")
            self._pending_requests.add(request_id)
            req_info = params.get("request", {})
            nr = NetworkRequest(
                request_id=request_id,
                method=req_info.get("method", "GET"),
                url=req_info.get("url", ""),
                request_headers=req_info.get("headers", {}),
                started_at=params.get("timestamp", 0.0),
            )
            self._network_log.append(nr)
            if len(self._network_log) > self._network_log_max:
                self._network_log = self._network_log[-self._network_log_max:]
        elif method == "Network.responseReceived":
            request_id = params.get("requestId", "")
            self._pending_requests.discard(request_id)
            response = params.get("response", {})
            for nr in reversed(self._network_log):
                if nr.request_id == request_id:
                    nr.status = response.get("status", 0)
                    nr.response_headers = response.get("headers", {})
                    break
        elif method == "Network.loadingFinished":
            import time as _time
            request_id = params.get("requestId", "")
            self._pending_requests.discard(request_id)
            for nr in reversed(self._network_log):
                if nr.request_id == request_id:
                    nr.finished_at = _time.time()
                    break
        elif method == "Network.loadingFailed":
            import time as _time
            request_id = params.get("requestId", "")
            self._pending_requests.discard(request_id)
            for nr in reversed(self._network_log):
                if nr.request_id == request_id:
                    nr.failed = True
                    nr.finished_at = _time.time()
                    break
        elif method == "Log.entryAdded":
            entry = params.get("entry", {})
            level = entry.get("level", "log")
            if level in ("warning", "error"):
                self._console_messages.append(
                    ConsoleMessage(
                        level=level,
                        text=entry.get("text", ""),
                        url=entry.get("url", ""),
                        line=entry.get("lineNumber", 0),
                    )
                )
        elif method == "Runtime.consoleAPICalled":
            level_map = {"warning": "warning", "error": "error", "warn": "warning"}
            call_type = params.get("type", "")
            level = level_map.get(call_type)
            if level:
                args = params.get("args", [])
                text = " ".join(
                    str(a.get("value", a.get("description", "")))
                    for a in args
                )
                self._console_messages.append(
                    ConsoleMessage(level=level, text=text)
                )

    async def close_blank_tabs(self) -> int:
        """Close all page targets at about:blank via the CDP HTTP API.

        Called after MCP navigates to the target URL. The sandbox always starts
        at about:blank; if MCP created its own page, the blank tab is orphaned
        and safe to close. If MCP reused the blank tab, it is now at the target
        URL and won't appear in this query. Returns number of tabs closed.
        """
        if self._cdp_url.startswith("ws"):
            return 0
        import httpx
        http_url = self._cdp_url.rstrip("/")
        closed = 0
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{http_url}/json/list")
                resp.raise_for_status()
                for target in resp.json():
                    if target.get("type") == "page" and target.get("url") == "about:blank":
                        target_id = target.get("id", "")
                        if target_id:
                            await client.get(f"{http_url}/json/close/{target_id}")
                            closed += 1
                            logger.debug("Closed blank tab %s", target_id)
        except Exception as exc:
            logger.debug("close_blank_tabs: %s (non-fatal)", exc)
        return closed

    async def _resolve_ws_url(self) -> str:
        """Fetch /json/list from the CDP HTTP endpoint and return the WS URL
        for the first page target. Falls back to treating cdp_url as a
        direct WS URL if it already starts with 'ws'.
        """
        if self._cdp_url.startswith("ws"):
            return self._cdp_url

        import httpx
        http_url = self._cdp_url.rstrip("/")
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{http_url}/json/list")
            resp.raise_for_status()
            targets = resp.json()

        for target in targets:
            if target.get("type") == "page":
                ws_url = target.get("webSocketDebuggerUrl", "")
                if ws_url:
                    return ws_url

        raise CdpConnectionError(
            f"No page target found at {self._cdp_url}. "
            f"Available targets: {[t.get('type') for t in targets]}"
        )
