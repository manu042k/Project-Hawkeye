"""Tool: get_network_log — returns buffered network requests from CDP."""
from __future__ import annotations
import fnmatch
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession


@dataclass
class NetworkLogResult:
    count: int
    requests: list[dict]
    filtered: bool


async def get_network_log(
    *,
    cdp_session: "CdpSession | None",
    url_pattern: str | None = None,
    method: str | None = None,
    status_gte: int | None = None,
    status_lte: int | None = None,
    limit: int = 50,
) -> NetworkLogResult:
    if cdp_session is None:
        return NetworkLogResult(count=0, requests=[], filtered=False)

    all_reqs = cdp_session.get_network_requests(
        url_pattern=url_pattern,
        method=method,
        status_gte=status_gte,
        status_lte=status_lte,
    )
    filtered = any(x is not None for x in [url_pattern, method, status_gte, status_lte])
    limited = all_reqs[:limit]
    return NetworkLogResult(
        count=len(all_reqs),
        requests=[
            {"url": r.url, "method": r.method, "status": r.status, "failed": r.failed}
            for r in limited
        ],
        filtered=filtered,
    )
