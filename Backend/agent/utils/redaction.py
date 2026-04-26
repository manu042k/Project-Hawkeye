from __future__ import annotations

from typing import Any

SENSITIVE_MARKERS = ("password", "passwd", "secret", "token", "api_key", "apikey", "authorization", "auth")


def redact_value(key: str, value: Any) -> Any:
    lower_key = key.lower()
    if any(marker in lower_key for marker in SENSITIVE_MARKERS):
        return "***REDACTED***"
    if isinstance(value, dict):
        return {k: redact_value(k, v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(key, item) for item in value]
    return value


def redact_dict(data: dict[str, Any]) -> dict[str, Any]:
    return {k: redact_value(k, v) for k, v in data.items()}
