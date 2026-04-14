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
    current: dict = Depends(require_admin),
):
    from ..database import get_db
    db = get_db()

    # ดึง user เดิมเพื่อตรวจสอบ status ก่อนอัพเดท
    old_user = await db.users.find_one({"username": username}) or {}
    old_status = old_user.get("status", "")

    result = await update_user(username, req.dict(exclude_none=True))

    new_status = req.dict(exclude_none=True).get("status", "")
    # ถ้า status เปลี่ยนจาก pending → active หรือ rejected → แจ้ง LINE admins อื่น
    if old_status == "pending" and new_status in ("active", "rejected"):
        try:
            from ..routers.line_webhook import _notify_other_admins_member_handled
            name = old_user.get("name", username)
            admin_username = current.get("sub", "admin")
            action = "อนุมัติ" if new_status == "active" else "ปฏิเสธ"
            await _notify_other_admins_member_handled(username, name, admin_username, action)

            # แจ้งผู้สมัครทาง LINE ด้วย
            target_line_uid = old_user.get("lineUid", "")
            if target_line_uid:
                from ..services.line_notify_service import _push_to_uid
                if new_status == "active":
                    await _push_to_uid(target_line_uid, [{"type": "text", "text": (
                        f"🎉 บัญชีของคุณได้รับการอนุมัติแล้ว!\n"
                        f"Username: {username}\n\n"
                        f"กรุณาเข้าสู่ระบบได้เลยครับ/ค่ะ"
                    )}])
                else:
                    await _push_to_uid(target_line_uid, [{"type": "text", "text": (
                        f"❌ บัญชีของคุณไม่ผ่านการอนุมัติ\n"
                        f"Username: {username}\n\n"
                        f"กรุณาติดต่อทีม IT เพื่อสอบถามข้อมูลเพิ่มเติม"
                    )}])
        except Exception as e:
            import logging
            logging.getLogger("planeat.users").warning("LINE notify failed: %s", e)

    return result


@router.delete("/users/{username}")
async def delete_user_endpoint(
    username: str,
    _: dict = Depends(require_admin),
):
    result = await delete_user(username)
    return result
