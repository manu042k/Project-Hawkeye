"""Playwright MCP stdio client — async rewrite of the McpStdioClient pattern."""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

_INIT_TIMEOUT_S = 90.0
_TOOL_TIMEOUT_S = 60.0
_RETRY_DELAY_S = 0.5
_MAX_TOOL_RETRIES = 2


@dataclass
class McpToolSchema:
    name: str
    description: str
    input_schema: dict


@dataclass
class McpToolResult:
    content: str
    is_error: bool = False
    error_message: str | None = None


class PlaywrightMcpClient:
    """Async MCP client using stdio transport.

    Spawns ``npx @playwright/mcp --cdp-endpoint <url>`` as a subprocess
    and communicates via newline-delimited JSON-RPC 2.0.

    Never raises from ``call_tool`` — errors are returned as
    ``McpToolResult(is_error=True)``. ``close()`` is idempotent.
    """

    def __init__(self, cdp_url: str | None = None, *, browser: str = "chromium", timeout_s: float = _TOOL_TIMEOUT_S) -> None:
        self._cdp_url = cdp_url
        self._browser = browser
        self._timeout_s = timeout_s
        self._proc: asyncio.subprocess.Process | None = None
        self._cmd_id = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._reader_task: asyncio.Task | None = None
        self._stderr_task: asyncio.Task | None = None
        self._tools: list[McpToolSchema] = []
        self._initialized = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Spawn the MCP subprocess and perform the JSON-RPC handshake."""
        # On Windows, npx is a .cmd script and cannot be invoked directly
        # by CreateProcess without going through cmd.exe.
        if self._cdp_url:
            base_args = ["--cdp-endpoint", self._cdp_url]
        else:
            base_args = ["--browser", self._browser]

        if sys.platform == "win32":
            cmd = ["cmd", "/c", "npx", "@playwright/mcp@latest"] + base_args
        else:
            cmd = ["npx", "@playwright/mcp@latest"] + base_args

        # 10MB limit: Playwright accessibility tree snapshots for complex pages
        # easily exceed asyncio's default 64KB StreamReader limit.
        _STREAM_LIMIT = 10 * 1024 * 1024
        self._proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=_STREAM_LIMIT,
        )
        self._reader_task = asyncio.create_task(
            self._read_loop(), name="mcp-reader"
        )
        # Drain stderr continuously so the subprocess never blocks on stderr writes.
        # On Windows, npx prints npm/package logs to stderr before any JSON output.
        self._stderr_task = asyncio.create_task(
            self._drain_stderr(), name="mcp-stderr"
        )

        # JSON-RPC initialize
        await self._rpc(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "hawkeye", "version": "1.0"},
            },
            timeout_s=_INIT_TIMEOUT_S,
        )
        # Notify initialized (no response expected)
        await self._notify("notifications/initialized", {})
        self._initialized = True
        logger.debug("Playwright MCP initialized (cdp=%s, browser=%s)", self._cdp_url or "none", self._browser)

    async def list_tools(self) -> list[McpToolSchema]:
        """Fetch and cache the list of available tools."""
        result = await self._rpc("tools/list", {}, timeout_s=_INIT_TIMEOUT_S)
        self._tools = [
            McpToolSchema(
                name=t["name"],
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", {}),
            )
            for t in result.get("tools", [])
        ]
        return self._tools

    async def call_tool(self, name: str, arguments: dict) -> McpToolResult:
        """Call an MCP tool. Never raises — errors become McpToolResult(is_error=True).

        Retries up to 2 times on transient connection errors.
        """
        last_error: str = ""
        for attempt in range(_MAX_TOOL_RETRIES + 1):
            try:
                result = await self._rpc(
                    "tools/call",
                    {"name": name, "arguments": arguments},
                    timeout_s=self._timeout_s,
                )
                # MCP result shape: {content: [{type: text, text: ...}], isError?: bool}
                content_blocks = result.get("content", [])
                text = "\n".join(
                    block.get("text", "") or str(block.get("data", ""))
                    for block in content_blocks
                    if isinstance(block, dict)
                )
                is_error = bool(result.get("isError", False))
                return McpToolResult(content=text, is_error=is_error)

            except asyncio.TimeoutError:
                last_error = f"tool '{name}' timed out after {self._timeout_s}s"
            except Exception as exc:
                last_error = f"tool '{name}' failed: {exc}"

            if attempt < _MAX_TOOL_RETRIES:
                logger.debug("MCP call_tool retry %d: %s", attempt + 1, last_error)
                await asyncio.sleep(_RETRY_DELAY_S)

        logger.warning("MCP call_tool exhausted retries: %s", last_error)
        return McpToolResult(content="", is_error=True, error_message=last_error)

    async def close(self) -> None:
        """Shut down the subprocess. Idempotent."""
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._stderr_task and not self._stderr_task.done():
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass

        if self._proc:
            try:
                self._proc.stdin.close()  # type: ignore[union-attr]
                await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None

        self._initialized = False

    # ------------------------------------------------------------------
    # Internal JSON-RPC plumbing
    # ------------------------------------------------------------------

    async def _rpc(self, method: str, params: dict, *, timeout_s: float) -> dict:
        """Send a JSON-RPC request and wait for the matching response."""
        if self._proc is None or self._proc.stdin is None:
            raise RuntimeError("MCP subprocess is not running")

        self._cmd_id += 1
        cmd_id = self._cmd_id
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[cmd_id] = future

        payload = json.dumps(
            {"jsonrpc": "2.0", "id": cmd_id, "method": method, "params": params}
        ) + "\n"
        try:
            self._proc.stdin.write(payload.encode())
            await self._proc.stdin.drain()
        except Exception as exc:
            self._pending.pop(cmd_id, None)
            raise RuntimeError(f"MCP write failed: {exc}") from exc

        return await asyncio.wait_for(future, timeout=timeout_s)

    async def _notify(self, method: str, params: dict) -> None:
        """Send a JSON-RPC notification (no id, no response expected)."""
        if self._proc is None or self._proc.stdin is None:
            return
        payload = json.dumps(
            {"jsonrpc": "2.0", "method": method, "params": params}
        ) + "\n"
        try:
            self._proc.stdin.write(payload.encode())
            await self._proc.stdin.drain()
        except Exception:
            pass

    async def _drain_stderr(self) -> None:
        """Drain subprocess stderr to prevent pipe-buffer deadlock.

        npx on Windows writes package download / startup messages to stderr.
        Without a reader, the pipe buffer fills (~65 KB on Windows) and the
        subprocess blocks on its next write, preventing stdout from arriving.
        """
        if self._proc is None or self._proc.stderr is None:
            return
        try:
            async for line in self._proc.stderr:
                line_s = line.decode(errors="replace").strip()
                if line_s:
                    logger.debug("MCP stderr: %s", line_s)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("MCP stderr drain ended: %s", exc)

    async def _read_loop(self) -> None:
        """Background task: read stdout lines and resolve pending futures."""
        if self._proc is None or self._proc.stdout is None:
            return
        try:
            async for line in self._proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    logger.debug("MCP non-JSON stdout: %s", line[:120])
                    continue

                msg_id = msg.get("id")
                if msg_id is None:
                    # Notification from server (e.g. tools/list_changed) — ignore.
                    continue

                future = self._pending.pop(msg_id, None)
                if future and not future.done():
                    if "error" in msg:
                        err = msg["error"]
                        future.set_exception(
                            RuntimeError(f"MCP RPC error: {err.get('message', err)}")
                        )
                    else:
                        future.set_result(msg.get("result", {}))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("MCP read loop error: %s", exc)
        finally:
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(RuntimeError("MCP connection closed"))
            self._pending.clear()
