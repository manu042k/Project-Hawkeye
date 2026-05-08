"""Retrieve buffered console error/warning messages from a CDP session."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession

logger = logging.getLogger(__name__)


@dataclass
class ConsoleErrorResult:
    count: int
    messages: list[str]


async def get_console_errors(
    *,
    cdp_session: CdpSession,
    level: Literal["error", "warning", "all"] = "error",
    ignore_patterns: list[str] | None = None,
) -> ConsoleErrorResult:
    """Return buffered console messages from the CDP session.

    Filters by ``level`` and removes messages that contain any of the
    ``ignore_patterns`` as substrings (case-insensitive).

    Always returns — never raises.
    """
    try:
        all_messages = cdp_session.console_messages
    except Exception as exc:
        logger.warning("get_console_errors: failed to read console messages: %s", exc)
        return ConsoleErrorResult(count=0, messages=[])

    # Level filter
    if level == "error":
        filtered = [m for m in all_messages if m.level == "error"]
    elif level == "warning":
        filtered = [m for m in all_messages if m.level in ("warning", "error")]
    else:  # "all"
        filtered = list(all_messages)

    # Ignore patterns (substring, case-insensitive)
    patterns = [p.lower() for p in (ignore_patterns or [])]
    if patterns:
        filtered = [
            m for m in filtered
            if not any(pat in m.text.lower() for pat in patterns)
        ]

    texts = [m.text for m in filtered]
    return ConsoleErrorResult(count=len(texts), messages=texts)
