"""Log intermediate step results — pure function, no I/O."""
from __future__ import annotations

import json
from typing import Any, Literal


def report_step_result(
    *,
    step_id: str,
    status: Literal["passed", "failed", "blocked"],
    summary: str,
    evidence: dict[str, Any] | None = None,
) -> str:
    """Format and return a structured step result string.

    The agent calls this to log intermediate assertion outcomes. Returns a
    human-readable confirmation string that becomes the tool result message.
    """
    lines = [
        f"[STEP RESULT] id={step_id!r} status={status.upper()}",
        f"  Summary: {summary}",
    ]
    if evidence:
        try:
            evidence_str = json.dumps(evidence, indent=2)
        except (TypeError, ValueError):
            evidence_str = str(evidence)
        lines.append(f"  Evidence: {evidence_str}")
    return "\n".join(lines)
