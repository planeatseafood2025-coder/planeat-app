from fastapi import APIRouter, Depends, HTTPException
import httpx
from pydantic import BaseModel
from ..deps import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_notifications(current: dict = Depends(get_current_user)):
    db = get_db()
    username = current["sub"]
    docs = await db.notifications.find(
        {"recipientUsername": username},
        {"_id": 0}
    ).sort("createdAt", -1).limit(50).to_list(50)

    # Convert datetime to ISO string
    for d in docs:
        if "createdAt" in d and hasattr(d["createdAt"], "isoformat"):
            d["createdAt"] = d["createdAt"].isoformat()

    unread = sum(1 for d in docs if not d.get("read", False))
    return {"success": True, "notifications": docs, "unread": unread}


@router.put("/{notif_id}/read")
async def mark_read(notif_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_one(
        {"id": notif_id, "recipientUsername": current["sub"]},
        {"$set": {"read": True}}
    )
    return {"success": True}


@router.put("/read-all")
async def mark_all_read(current: dict = Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many(
        {"recipientUsername": current["sub"], "read": False},
        {"$set": {"read": True}}
    )
    return {"success": True}


@router.delete("/{notif_id}")
async def delete_notification(notif_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    await db.notifications.delete_one(
        {"id": notif_id, "recipientUsername": current["sub"]}
    )
    return {"success": True}


class LineNotifyRequest(BaseModel):
    message: str
    token: str = ""


@router.post("/line-notify")
async def send_line_notify(req: LineNotifyRequest, _current: dict = Depends(get_current_user)):
    if not req.token.strip():
        raise HTTPException(status_code=400, detail="กรุณาระบุ LINE Notify Token")
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="กรุณาระบุข้อความ")
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://notify-api.line.me/api/notify",
            headers={"Authorization": f"Bearer {req.token.strip()}"},
            data={"message": req.message},
            timeout=10,
        )
    if res.status_code == 200:
        return {"success": True, "message": "ส่งข้อความ LINE สำเร็จ"}
    raise HTTPException(status_code=res.status_code, detail=f"LINE Notify error: {res.text}")
