from fastapi import APIRouter, Depends, Request

from api.auth_utils import get_current_user

router = APIRouter(tags=["auth"])


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)) -> dict:
    return {
        "email": user["email"],
        "name": user.get("name", ""),
        "authenticated": True,
        "role": "admin",
    }
