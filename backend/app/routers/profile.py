from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..deps import get_current_user
from ..database import get_db
from fastapi import Depends
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/api/profile", tags=["profile"])


class UpdateProfileRequest(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    nickname: Optional[str] = None
    phone: Optional[str] = None
    lineId: Optional[str] = None
    jobTitle: Optional[str] = None


class UpdatePhotoRequest(BaseModel):
    photo: str  # base64 data URL


class UpdateSignatureRequest(BaseModel):
    signature: str  # base64 data URL (transparent/white PNG)


class RequestPermissionRequest(BaseModel):
    permissions: dict  # e.g. {"labor": True, "raw": True, ...}
    reason: str = ""


@router.get("/me")
async def get_my_profile(current: dict = Depends(get_current_user)):
    db = get_db()
    user = await db.users.find_one({"username": current["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")
    return {"success": True, "user": user}


@router.put("/me")
async def update_my_profile(req: UpdateProfileRequest, current: dict = Depends(get_current_user)):
    db = get_db()
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="ไม่มีข้อมูลที่จะอัปเดต")

    # Rebuild name from firstName/lastName if provided
    user = await db.users.find_one({"username": current["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")

    first = updates.get("firstName", user.get("firstName", ""))
    last = updates.get("lastName", user.get("lastName", ""))
    if first or last:
        updates["name"] = f"{first} {last}".strip()

    await db.users.update_one({"username": current["sub"]}, {"$set": updates})
    return {"success": True, "message": "อัปเดตข้อมูลส่วนตัวสำเร็จ"}


@router.put("/photo")
async def update_profile_photo(req: UpdatePhotoRequest, current: dict = Depends(get_current_user)):
    db = get_db()
    # Validate it's a data URL image
    if not req.photo.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="รูปแบบรูปภาพไม่ถูกต้อง")
    # Limit ~500KB base64
    if len(req.photo) > 700_000:
        raise HTTPException(status_code=400, detail="ไฟล์รูปใหญ่เกินไป (ไม่เกิน 500KB)")

    await db.users.update_one({"username": current["sub"]}, {"$set": {"profilePhoto": req.photo}})
    return {"success": True, "message": "อัปเดตรูปโปรไฟล์สำเร็จ"}


@router.delete("/photo")
async def delete_profile_photo(current: dict = Depends(get_current_user)):
    db = get_db()
    await db.users.update_one({"username": current["sub"]}, {"$set": {"profilePhoto": ""}})
    return {"success": True, "message": "ลบรูปโปรไฟล์สำเร็จ"}


@router.put("/signature")
async def update_signature(req: UpdateSignatureRequest, current: dict = Depends(get_current_user)):
    db = get_db()
    if not req.signature.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="รูปแบบไฟล์ลายเซ็นไม่ถูกต้อง")
    if len(req.signature) > 700_000:
        raise HTTPException(status_code=400, detail="ไฟล์ลายเซ็นใหญ่เกินไป (ไม่เกิน 500KB)")

    await db.users.update_one({"username": current["sub"]}, {"$set": {"signature": req.signature}})
    return {"success": True, "message": "อัปเดตลายเซ็นสำเร็จ"}


@router.delete("/signature")
async def delete_signature(current: dict = Depends(get_current_user)):
    db = get_db()
    await db.users.update_one({"username": current["sub"]}, {"$set": {"signature": ""}})
    return {"success": True, "message": "ลบลายเซ็นสำเร็จ"}


@router.post("/request-permission")
async def request_permission(req: RequestPermissionRequest, current: dict = Depends(get_current_user)):
    db = get_db()
    username = current["sub"]
    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")

    display_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or username
    perm_names = {
        "labor": "ค่าแรงงาน", "raw": "ค่าวัตถุดิบ",
        "chem": "ค่าเคมี/หีบห่อ", "repair": "ค่าซ่อมแซม"
    }
    requested = [perm_names.get(k, k) for k, v in req.permissions.items() if v]
    if not requested:
        raise HTTPException(status_code=400, detail="ไม่ได้เลือกสิทธิ์ที่ต้องการ")

    body = f"{display_name} ({username}) ขอสิทธิ์เพิ่มเติม: {', '.join(requested)}"
    if req.reason:
        body += f" — เหตุผล: {req.reason}"

    # Find all IT admins to notify
    admin_roles = ["super_admin", "it_manager", "it_support", "admin"]
    admins = await db.users.find(
        {"role": {"$in": admin_roles}, "status": "active"},
        {"username": 1}
    ).to_list(50)

    now = datetime.now(timezone.utc)
    notifications = []
    for admin in admins:
        notifications.append({
            "id": str(uuid.uuid4()),
            "recipientUsername": admin["username"],
            "senderUsername": username,
            "type": "permission_request",
            "title": "คำขอสิทธิ์เพิ่มเติม",
            "body": body,
            "read": False,
            "createdAt": now,
            "data": {"permissions": req.permissions, "reason": req.reason},
        })

    if notifications:
        await db.notifications.insert_many(notifications)

    return {"success": True, "message": "ส่งคำขอสิทธิ์เรียบร้อยแล้ว"}
