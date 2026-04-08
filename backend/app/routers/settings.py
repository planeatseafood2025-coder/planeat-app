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
    await db.system_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {**data, "updatedBy": current.get("sub"), }},
        upsert=True,
    )
    return {"success": True, "message": "บันทึกการตั้งค่าสำเร็จ"}
