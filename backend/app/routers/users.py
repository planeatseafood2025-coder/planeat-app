from fastapi import APIRouter, Query, Depends
from ..services.auth_service import get_all_users, update_user, delete_user
from ..models.user import UpdateUserRequest
from ..deps import require_admin

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users")
async def list_users(
    search: str = Query(""),
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    _: dict = Depends(require_admin),
):
    return await get_all_users(search=search, page=page, per_page=perPage)


@router.put("/users/{username}")
async def update_user_endpoint(
    username: str,
    req: UpdateUserRequest,
    _: dict = Depends(require_admin),
):
    result = await update_user(username, req.dict(exclude_none=True))
    return result


@router.delete("/users/{username}")
async def delete_user_endpoint(
    username: str,
    _: dict = Depends(require_admin),
):
    result = await delete_user(username)
    return result
