"""GitHub Check Run integration.

Posts a Check Run to GitHub whenever a Hawkeye test run completes.

Required env vars (all optional — feature is a no-op when absent):
  GITHUB_APP_ID          — GitHub App numeric ID
  GITHUB_APP_PRIVATE_KEY — PEM private key (base64-encoded or raw)
  GITHUB_INSTALLATION_ID — Installation ID for the target org/repo

Or use a personal access token:
  GITHUB_TOKEN           — ghp_... with repo:status scope
"""
from __future__ import annotations

import base64
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
_APP_ID = os.environ.get("GITHUB_APP_ID", "")
_PRIVATE_KEY_B64 = os.environ.get("GITHUB_APP_PRIVATE_KEY", "")
_INSTALLATION_ID = os.environ.get("GITHUB_INSTALLATION_ID", "")
_API = "https://api.github.com"


def _enabled() -> bool:
    return bool(_GITHUB_TOKEN or (_APP_ID and _PRIVATE_KEY_B64 and _INSTALLATION_ID))


def _auth_header() -> dict[str, str]:
    """Return Authorization header. PAT takes precedence over App JWT."""
    if _GITHUB_TOKEN:
        return {"Authorization": f"token {_GITHUB_TOKEN}"}
    return {"Authorization": f"Bearer {_app_installation_token()}"}


def _app_installation_token() -> str:
    """Exchange GitHub App JWT for an installation access token."""
    try:
        import jwt as pyjwt
    except ImportError:
        raise RuntimeError("PyJWT required for GitHub App auth: pip install PyJWT cryptography")
    pem = _PRIVATE_KEY_B64
    # Decode if base64-encoded
    try:
        pem = base64.b64decode(pem).decode()
    except Exception:
        pass
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 600, "iss": _APP_ID}
    jwt_token = pyjwt.encode(payload, pem, algorithm="RS256")
    resp = httpx.post(
        f"{_API}/app/installations/{_INSTALLATION_ID}/access_tokens",
        headers={"Authorization": f"Bearer {jwt_token}", "Accept": "application/vnd.github+json"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["token"]


def post_check_run(
    *,
    owner: str,
    repo: str,
    head_sha: str,
    run_id: str,
    test_name: str,
    status: str,
    conclusion: str | None,
    details_url: str,
    summary: str,
    started_at: str | None = None,
    completed_at: str | None = None,
) -> dict[str, Any] | None:
    """Create or update a GitHub Check Run. Returns None when disabled."""
    if not _enabled():
        return None
    gh_conclusion = None
    if conclusion:
        gh_conclusion = "success" if conclusion in ("passed", "success") else "failure"
    payload: dict[str, Any] = {
        "name": f"Hawkeye / {test_name}",
        "head_sha": head_sha,
        "status": "completed" if gh_conclusion else "in_progress",
        "details_url": details_url,
        "output": {
            "title": f"{test_name} — {conclusion or status}",
            "summary": summary,
        },
    }
    if gh_conclusion:
        payload["conclusion"] = gh_conclusion
    if started_at:
        payload["started_at"] = started_at
    if completed_at:
        payload["completed_at"] = completed_at
    headers = {
        **_auth_header(),
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        resp = httpx.post(f"{_API}/repos/{owner}/{repo}/check-runs", json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        logger.info("GitHub Check Run created: %s", resp.json().get("html_url"))
        return resp.json()
    except Exception as exc:
        logger.warning("GitHub Check Run failed: %s", exc)
        return None
