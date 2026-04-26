from __future__ import annotations

import dataclasses
import json
from typing import Any, Dict, Iterable, Optional

from .sandbox import SandboxHandle


@dataclasses.dataclass(frozen=True)
class McpServerEntry:
    name: str
    command: str
    args: list[str]


def _safe_name(prefix: str, container_name: str) -> str:
    # Cursor server names should be stable and simple.
    return f"{prefix}-{container_name}".replace("_", "-")


def mcp_entries_for_handle(handle: SandboxHandle) -> list[McpServerEntry]:
    """
    Create MCP server entries that attach to a running sandbox.

    Requires handle.cdp_url to be present (chromium-family sandboxes).
    """
    if not handle.cdp_url:
        return []

    chrome_devtools = McpServerEntry(
        name=_safe_name("chrome-devtools", handle.container_name),
        command="npx",
        args=[
            "-y",
            "chrome-devtools-mcp@latest",
            f"--browser-url={handle.cdp_url}",
            "--no-usage-statistics",
        ],
    )

    playwright = McpServerEntry(
        name=_safe_name("playwright", handle.container_name),
        command="npx",
        args=[
            "-y",
            "@playwright/mcp@latest",
            f"--cdp-endpoint={handle.cdp_url}",
        ],
    )

    return [chrome_devtools, playwright]


def mcp_json(handles: Iterable[SandboxHandle]) -> Dict[str, Any]:
    """
    Return a Cursor-style MCP config that can control multiple containers.

    There are no clashes because each server gets a unique name and connects
    to a different CDP endpoint (unique host port per container).
    """
    servers: Dict[str, Any] = {}
    for h in handles:
        for entry in mcp_entries_for_handle(h):
            servers[entry.name] = {"command": entry.command, "args": entry.args}
    return {"mcpServers": servers}


def write_mcp_json(path: str, handles: Iterable[SandboxHandle]) -> str:
    payload = mcp_json(handles)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    return path

