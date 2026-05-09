"""Figma API client — exports frames as PNG."""
from __future__ import annotations
import re
from urllib.parse import urlparse, parse_qs

import httpx

FIGMA_API = "https://api.figma.com/v1"


async def export_frame_png(file_key: str, node_id: str, token: str, scale: float = 2.0) -> bytes:
    """Download a Figma frame as PNG. node_id is the frame's node ID."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{FIGMA_API}/images/{file_key}",
            params={"ids": node_id, "format": "png", "scale": scale},
            headers={"X-Figma-Token": token},
            timeout=30,
        )
        resp.raise_for_status()
        url = resp.json()["images"][node_id]
        img_resp = await client.get(url, timeout=60)
        img_resp.raise_for_status()
        return img_resp.content


def parse_figma_url(url: str) -> tuple[str, str]:
    """Extract (file_key, node_id) from a Figma URL.

    Supports URLs like:
      https://www.figma.com/file/KEY/Name?node-id=1-2
      https://www.figma.com/design/KEY/Name?node-id=1:2
    """
    parsed = urlparse(url)
    key_match = re.search(r'/(?:file|design)/([^/]+)', parsed.path)
    if not key_match:
        raise ValueError(f"Cannot extract file key from Figma URL: {url}")
    file_key = key_match.group(1)
    raw_node_id = parse_qs(parsed.query).get("node-id", [""])[0]
    node_id = raw_node_id.replace("-", ":")
    return file_key, node_id
