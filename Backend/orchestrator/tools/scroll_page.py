"""scroll_page — smooth multi-scroll tool executed via CDP Runtime.evaluate."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession

logger = logging.getLogger(__name__)


@dataclass
class ScrollResult:
    direction: str
    times: int
    pixels_scrolled: int
    scroll_top: int
    scroll_height: int
    viewport_height: int
    at_bottom: bool


async def scroll_page(
    *,
    cdp_session: CdpSession,
    direction: str = "down",
    times: int = 1,
) -> ScrollResult:
    """Scroll the page by `times` viewport heights in the given direction.

    Uses window.scrollBy via CDP so all scrolls happen in a single tool call.
    Waits for the smooth-scroll animation to settle before returning.

    Args:
        cdp_session: Active CDP session for the page.
        direction: "down" | "up" | "top" | "bottom"
        times: Number of viewport heights to scroll (ignored for top/bottom).
    """
    direction = direction.lower().strip()

    if direction == "top":
        js = "window.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollY"
    elif direction == "bottom":
        js = "window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); window.scrollY"
    elif direction == "up":
        js = f"window.scrollBy({{ top: -(window.innerHeight * {times}), behavior: 'smooth' }}); window.scrollY"
    else:  # down (default)
        js = f"window.scrollBy({{ top: window.innerHeight * {times}, behavior: 'smooth' }}); window.scrollY"

    # Kick off the scroll
    await cdp_session.evaluate_js(js)

    # Wait for smooth-scroll animation (200ms per viewport height, min 400ms)
    settle_ms = max(400, 200 * times)
    await asyncio.sleep(settle_ms / 1000)

    # Read final scroll state
    scroll_top = int(await cdp_session.evaluate_js("Math.round(window.scrollY)") or 0)
    scroll_height = int(await cdp_session.evaluate_js("document.body.scrollHeight") or 0)
    viewport_height = int(await cdp_session.evaluate_js("window.innerHeight") or 0)
    at_bottom = scroll_top + viewport_height >= scroll_height - 5

    pixels = viewport_height * times if direction in ("down", "up") else scroll_top

    return ScrollResult(
        direction=direction,
        times=times,
        pixels_scrolled=pixels,
        scroll_top=scroll_top,
        scroll_height=scroll_height,
        viewport_height=viewport_height,
        at_bottom=at_bottom,
    )
