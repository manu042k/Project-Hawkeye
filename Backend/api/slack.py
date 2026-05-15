"""Slack failure notifications.

Posts a message to a Slack channel when a Hawkeye run fails.

Required env vars (feature is a no-op when absent):
  SLACK_WEBHOOK_URL  — Incoming Webhook URL from Slack app config
  APP_URL            — public base URL for deep-link into report page
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")
_APP_URL = os.environ.get("APP_URL", "http://localhost:3000")


def _enabled() -> bool:
    return bool(_WEBHOOK_URL)


def notify_run_failed(
    *,
    run_id: str,
    test_name: str,
    status: str,
    duration_s: float | None,
    steps: int | None,
    error_message: str | None,
) -> None:
    """Post a Slack message for a failed run. No-op when webhook not configured."""
    if not _enabled():
        return
    report_url = f"{_APP_URL}/app/runs/report?id={run_id}"
    dur = f"{duration_s:.1f}s" if duration_s else "—"
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f":x: Test failed: {test_name}"},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Status:*\n{status}"},
                {"type": "mrkdwn", "text": f"*Duration:*\n{dur}"},
                {"type": "mrkdwn", "text": f"*Steps:*\n{steps or '—'}"},
                {"type": "mrkdwn", "text": f"*Run ID:*\n`{run_id}`"},
            ],
        },
    ]
    if error_message:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Error:*\n```{error_message[:500]}```"},
        })
    blocks.append({
        "type": "actions",
        "elements": [{
            "type": "button",
            "text": {"type": "plain_text", "text": "View Report"},
            "url": report_url,
            "style": "danger",
        }],
    })
    try:
        resp = httpx.post(_WEBHOOK_URL, json={"blocks": blocks}, timeout=8)
        resp.raise_for_status()
        logger.info("Slack notification sent for failed run %s", run_id)
    except Exception as exc:
        logger.warning("Slack notification failed: %s", exc)


def notify_run_passed(
    *,
    run_id: str,
    test_name: str,
    duration_s: float | None,
    steps: int | None,
) -> None:
    """Optionally post a Slack message for a passing run (only if SLACK_NOTIFY_PASS=1)."""
    import os
    if not _enabled() or os.environ.get("SLACK_NOTIFY_PASS", "0") != "1":
        return
    report_url = f"{_APP_URL}/app/runs/report?id={run_id}"
    dur = f"{duration_s:.1f}s" if duration_s else "—"
    payload = {
        "text": f":white_check_mark: *{test_name}* passed in {dur} ({steps or 0} steps) — <{report_url}|View Report>"
    }
    try:
        httpx.post(_WEBHOOK_URL, json=payload, timeout=8).raise_for_status()
    except Exception as exc:
        logger.warning("Slack notification failed: %s", exc)
