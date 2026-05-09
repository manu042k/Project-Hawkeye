from fastapi import APIRouter, Request

router = APIRouter(tags=["auth"])


@router.get("/me")
def get_me(request: Request) -> dict:
    email = request.headers.get("X-User-Email", "anonymous")
    return {
        "email": email,
        "authenticated": email != "anonymous",
        "role": "admin" if email != "anonymous" else "guest",
    }
