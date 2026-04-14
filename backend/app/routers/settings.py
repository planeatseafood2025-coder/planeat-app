from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_DOC_ID = "system_settings"

from ..models.settings import SystemSettings, LineOASetting


@router.get("")
async def get_settings(_: dict = Depends(require_admin)):
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    if not doc:
        return {
            "success": True,
            "settings": {
                "mainLineOa": None,
                "lineOaConfigs": [],
                "moduleConnections": {
                    "expense": "", "expenseName": "",
                    "inventory": "", "inventoryName": "",
                    "crm": "", "crmName": "",
                    "access": "", "accessName": "",
                },
                "smtpEmail": "",
                "smtpPassword": "",
                "smtpServer": "smtp.gmail.com",
                "smtpPort": 587,
            },
        }
    doc.pop("_id", None)
    if "lineOaConfigs" not in doc:
        doc["lineOaConfigs"] = []
    # เติม Name fields ที่อาจหายไปในข้อมูลเก่า
    mc = doc.get("moduleConnections", {})
    doc["moduleConnections"] = {
        "expense":       mc.get("expense", ""),
        "expenseName":   mc.get("expenseName", ""),
        "inventory":     mc.get("inventory", ""),
        "inventoryName": mc.get("inventoryName", ""),
        "crm":           mc.get("crm", ""),
        "crmName":       mc.get("crmName", ""),
        "access":        mc.get("access", ""),
        "accessName":    mc.get("accessName", ""),
    }
    return {"success": True, "settings": doc}


@router.put("")
async def update_settings(body: SystemSettings, current: dict = Depends(require_admin)):
    db = get_db()
    data = body.dict(exclude_none=False)

    # ดึงค่าเดิมก่อนบันทึก เพื่อตรวจว่า Group ID เพิ่งถูกตั้งค่าใหม่
    old_doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID}) or {}
    old_mc = old_doc.get("moduleConnections", {})

    await db.system_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {**data, "updatedBy": current.get("sub")}},
        upsert=True,
    )

    # ส่งข้อความทักทายกลุ่มที่เพิ่ง set Group ID ใหม่
    new_mc = (data.get("moduleConnections") or {})
    if new_mc:
        try:
            await _send_module_welcome(old_mc, new_mc, db)
        except Exception as e:
            import logging
            logging.getLogger("planeat.settings").warning("send welcome failed: %s", e)

    return {"success": True, "message": "บันทึกการตั้งค่าสำเร็จ"}


MODULE_LABELS = {
    "expense":   "ระบบค่าใช้จ่าย",
    "inventory": "คลังสินค้า",
    "crm":       "CRM ลูกค้า",
    "access":    "Access Control",
}


async def _send_module_welcome(old_mc: dict, new_mc: dict, db) -> None:
    """ส่งข้อความทักทายกลุ่มที่เพิ่ง set Group ID ใหม่"""
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID}) or {}
    token = doc.get("mainLineOa", {}).get("token", "")
    if not token:
        return

    import httpx
    for key, label in MODULE_LABELS.items():
        new_gid = new_mc.get(key, "").strip()
        old_gid = old_mc.get(key, "").strip()
        name    = new_mc.get(f"{key}Name", "").strip() or label

        # ส่งเฉพาะกรณีที่ Group ID เพิ่งถูกตั้งค่าใหม่ (ไม่ใช่ค่าเดิม)
        if new_gid and new_gid != old_gid:
            msg = (
                f"🎉 สวัสดีทุกคนครับ!\n\n"
                f"กลุ่มนี้ได้รับการเชื่อมต่อกับ PlaNeat แล้ว\n"
                f"โมดูล: {label}\n"
                f"ชื่อกลุ่ม: {name}\n\n"
                f"ระบบจะส่งแจ้งเตือนที่เกี่ยวข้องกับ {label} มาที่กลุ่มนี้\n"
                f"PlaNeat 🤖"
            )
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(
                        "https://api.line.me/v2/bot/message/push",
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                        json={"to": new_gid, "messages": [{"type": "text", "text": msg}]},
                    )
            except Exception:
                pass
