"""Text and regex presence assertion — pure function, no I/O."""
from __future__ import annotations

import re

from orchestrator.models.results import AssertionResult


def assert_text_present(
    *,
    page_snapshot: str,
    text: str | None = None,
    pattern: str | None = None,
    case_sensitive: bool = True,
) -> AssertionResult:
    """Check the page accessibility tree snapshot for text or a regex pattern.

    Exactly one of ``text`` or ``pattern`` must be provided.
    Invalid regexes are caught and returned as ``status='error'`` (never raise).
    """
    if text is None and pattern is None:
        return AssertionResult(
            assertion_id="inline",
            type="content",
            description="assert_text_present",
            passed=False,
            status="error",
            details="Either 'text' or 'pattern' must be provided",
        )

    if not page_snapshot:
        return AssertionResult(
            assertion_id="inline",
            type="content",
            description="assert_text_present",
            passed=False,
            status="failed",
            details="Page snapshot is empty",
        )

    if text is not None:
        haystack = page_snapshot if case_sensitive else page_snapshot.lower()
        needle = text if case_sensitive else text.lower()
        found = needle in haystack
        return AssertionResult(
            assertion_id="inline",
            type="content",
            description=f"text_present: {text!r}",
            passed=found,
            status="passed" if found else "failed",
            details=None if found else f"Text {text!r} not found in page snapshot",
        )

    # pattern branch
    flags = 0 if case_sensitive else re.IGNORECASE
    try:
        match = re.search(pattern, page_snapshot, flags)  # type: ignore[arg-type]
    except re.error as exc:
        return AssertionResult(
            assertion_id="inline",
            type="content",
            description=f"text_matches: {pattern!r}",
            passed=False,
            status="error",
            details=f"Invalid regex {pattern!r}: {exc}",
        )

    found = match is not None
    return AssertionResult(
        assertion_id="inline",
        type="content",
        description=f"text_matches: {pattern!r}",
        passed=found,
        status="passed" if found else "failed",
        details=None if found else f"Pattern {pattern!r} not found in page snapshot",
    )
