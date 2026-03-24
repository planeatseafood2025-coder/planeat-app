from fastapi import APIRouter
from ..services.auth_service import get_all_users

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users")
async def list_users():
    users = await get_all_users()
    return {"success": True, "users": users}
