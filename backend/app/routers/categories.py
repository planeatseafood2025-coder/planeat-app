from fastapi import APIRouter, Depends, HTTPException, Query
from ..models.expense_category import CreateCategoryRequest, UpdateCategoryRequest
from ..services.category_service import (
    get_all_categories, get_categories_for_user,
    get_category_by_id, create_category,
    update_category, get_category_summary, delete_category,
    MANAGER_ROLES,
)
from ..services.auth_service import get_all_users
from ..deps import get_current_user

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("/users/search")
async def search_users_for_permission(
    q: str = Query(""),
    current: dict = Depends(get_current_user),
):
    """ค้นหา user สำหรับตั้งสิทธิ์ — เฉพาะ manager"""
    if current.get("role") not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์")
    result = await get_all_users(search=q, page=1, per_page=20)
    # ส่งกลับเฉพาะ field ที่จำเป็น
    users = [
        {"username": u["username"], "name": u.get("name") or u.get("firstName", "") + " " + u.get("lastName", ""), "role": u.get("role", "")}
        for u in result.get("users", [])
    ]
    return {"success": True, "users": users}


@router.get("")
async def list_categories(current: dict = Depends(get_current_user)):
    cats = await get_all_categories()
    return {"success": True, "categories": cats}


@router.get("/mine")
async def my_categories(current: dict = Depends(get_current_user)):
    """ดึงเฉพาะหมวดที่ user มีสิทธิ์กรอกข้อมูล"""
    cats = await get_categories_for_user(
        current.get("sub", ""),
        current.get("role", ""),
    )
    return {"success": True, "categories": cats}


@router.get("/public")
async def public_categories(username: str = Query("")):
    """สำหรับหน้า standalone ค้นหาหมวดตามชื่อที่พิมพ์"""
    cats = await get_categories_for_user(username, "")
    return {"success": True, "categories": cats}


@router.get("/{cat_id}/summary")
async def category_summary(cat_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์")
    return await get_category_summary(cat_id)


@router.post("")
async def create_cat(req: CreateCategoryRequest, current: dict = Depends(get_current_user)):
    if current.get("role") not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="เฉพาะผู้จัดการฝ่ายบัญชีเท่านั้น")
    return await create_category(req.dict(), current.get("sub", "system"))


@router.put("/{cat_id}")
async def update_cat(cat_id: str, req: UpdateCategoryRequest, current: dict = Depends(get_current_user)):
    if current.get("role") not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="เฉพาะผู้จัดการฝ่ายบัญชีเท่านั้น")
    result = await update_category(cat_id, req.dict(exclude_none=True))
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.delete("/{cat_id}")
async def delete_cat(cat_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="เฉพาะผู้จัดการฝ่ายบัญชีเท่านั้น")
    result = await delete_category(cat_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result
