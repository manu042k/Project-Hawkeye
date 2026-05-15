"""HTTP middleware that enforces authentication on all non-public routes."""
from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from api.auth_utils import get_current_user

# Routes that bypass authentication entirely
_PUBLIC = (
    "/api/auth/",           # login, register, oauth-token
    "/api/webhooks/",       # GitHub HMAC-verified push webhook
    "/api/billing/webhook", # Stripe signature-verified webhook
    "/api/ws/",             # WebSocket — auth is handled at the stream level
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)


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

        try:
            await get_current_user(request)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

        return await call_next(request)
