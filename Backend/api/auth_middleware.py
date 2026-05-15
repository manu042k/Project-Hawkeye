"""HTTP middleware that enforces authentication on all non-public routes."""
from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from api.auth_utils import get_current_user

# Prefix-based public routes — no auth required
_PUBLIC = (
    "/api/auth/",           # login, register, oauth-token
    "/api/webhooks/",       # GitHub HMAC-verified push webhook
    "/api/billing/webhook", # Stripe signature-verified webhook
    "/api/ws/",             # WebSocket — auth is handled at the stream level
    "/api/runs/stream",     # SSE endpoint — EventSource cannot set custom headers
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def _is_artifact_file(path: str) -> bool:
    # /api/runs/{run_id}/artifacts/{filename} — loaded directly by <video>/<img> tags
    # The manifest listing is /artifacts (no trailing slash segment), files have one more segment.
    parts = [p for p in path.split("/") if p]
    try:
        idx = parts.index("artifacts")
        return idx < len(parts) - 1  # there is a filename after "artifacts"
    except ValueError:
        return False


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        # Always pass OPTIONS through — CORS handles it
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        if any(path == p.rstrip("/") or path.startswith(p) for p in _PUBLIC):
            return await call_next(request)

        # Artifact files are fetched directly by browser media elements
        if _is_artifact_file(path):
            return await call_next(request)

        try:
            await get_current_user(request)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

        return await call_next(request)
