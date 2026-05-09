"""Tool: assert_network_request — checks the CDP network log for a matching request."""
from __future__ import annotations
import fnmatch
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession


@dataclass
class AssertNetworkResult:
    passed: bool
    matched_count: int
    details: str


async def assert_network_request(
    *,
    cdp_session: "CdpSession | None",
    url_pattern: str,
    method: str | None = None,
    expected_status: int | None = None,
    min_count: int = 1,
) -> AssertNetworkResult:
    if cdp_session is None:
        return AssertNetworkResult(passed=False, matched_count=0,
                                    details="CDP session not available")

    reqs = cdp_session.get_network_requests()
    matches = [
        r for r in reqs
        if fnmatch.fnmatch(r.url, url_pattern) or url_pattern in r.url
    ]
    if method:
        matches = [r for r in matches if r.method.upper() == method.upper()]
    if expected_status:
        matches = [r for r in matches if r.status == expected_status]

    passed = len(matches) >= min_count
    detail = (
        f"Found {len(matches)} matching request(s) for pattern '{url_pattern}'"
        f"{f' method={method}' if method else ''}"
        f"{f' status={expected_status}' if expected_status else ''}."
        f" Required min_count={min_count}."
    )
    return AssertNetworkResult(passed=passed, matched_count=len(matches), details=detail)
