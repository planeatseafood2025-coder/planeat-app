"""
google_sheets.py — Google Sheets Auto-Import via Apps Script Webhook
1.15 รับข้อมูลจาก Apps Script
1.16 Data mapping config (column → Customer field)
"""
import logging
import hmac
import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..deps import get_current_user, require_admin
from ..database import get_db
from ..services.customer_service import get_customer_by_line_uid, create_customer, update_customer

router = APIRouter(prefix="/api/google-sheets", tags=["google-sheets"])
logger = logging.getLogger("planeat.google_sheets")

SETTINGS_DOC_ID = "system_settings"

# ─── Models ──────────────────────────────────────────────────────────────────

class SheetsMappingConfig(BaseModel):
    """การ map คอลัมน์ Google Sheets → Customer field"""
    name:        Optional[str] = "A"   # คอลัมน์ที่เป็นชื่อลูกค้า
    email:       Optional[str] = ""
    phone:       Optional[str] = ""
    company:     Optional[str] = ""
    type:        Optional[str] = ""    # B2B / B2C
    note:        Optional[str] = ""
    tags:        Optional[str] = ""    # คั่นด้วยคอมม่า
    lineUid:     Optional[str] = ""


class SheetsConnectionConfig(BaseModel):
    workspaceId: str
    spreadsheetId: str
    sheetName:   Optional[str] = "Sheet1"
    webhookSecret: Optional[str] = ""   # สำหรับ verify signature จาก Apps Script
    mapping:     SheetsMappingConfig = SheetsMappingConfig()
    enabled:     bool = True


# ─── Settings CRUD ───────────────────────────────────────────────────────────

@router.get("/config")
async def get_config(current: dict = Depends(get_current_user)):
    """ดึง Google Sheets connection config"""
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID}) or {}
    return {"config": doc.get("googleSheetsConfig", {})}


@router.put("/config")
async def save_config(req: SheetsConnectionConfig, current: dict = Depends(require_admin)):
    """บันทึก Google Sheets connection config"""
    db = get_db()
    await db.system_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"googleSheetsConfig": req.model_dump()}},
        upsert=True,
    )
    logger.info("Google Sheets config saved by %s", current["sub"])
    return {"success": True}


# ─── Webhook รับข้อมูลจาก Apps Script ───────────────────────────────────────

@router.post("/webhook")
async def sheets_webhook(request: Request):
    """
    Apps Script ส่งข้อมูลมาที่นี่เมื่อ Google Sheets เปลี่ยนแปลง

    รูปแบบ payload จาก Apps Script:
    {
        "secret": "...",            ← สำหรับ verify (optional)
        "rows": [
            {"A": "สมชาย", "B": "somchai@email.com", "C": "081-111-2222", ...},
            ...
        ]
    }
    """
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID}) or {}
    gs_config = doc.get("googleSheetsConfig", {})

    if not gs_config or not gs_config.get("enabled", True):
        return Response(status_code=200, content="disabled")

    # Verify secret (ถ้าตั้งค่าไว้)
    webhook_secret = gs_config.get("webhookSecret", "")
    if webhook_secret:
        try:
            body = await request.json()
        except Exception:
            return Response(status_code=400)
        incoming_secret = body.get("secret", "")
        if incoming_secret != webhook_secret:
            logger.warning("Google Sheets webhook: invalid secret")
            return Response(status_code=403)
    else:
        try:
            body = await request.json()
        except Exception:
            return Response(status_code=400)

    rows = body.get("rows", [])
    if not rows:
        return {"success": True, "imported": 0}

    mapping: dict = gs_config.get("mapping", {})
    workspace_id: str = gs_config.get("workspaceId", "")

    if not workspace_id:
        logger.warning("Google Sheets webhook: no workspaceId configured")
        return {"success": False, "error": "workspaceId ไม่ได้ตั้งค่า"}

    imported = 0
    updated  = 0
    errors   = 0

    for row in rows:
        try:
            def _col(field: str) -> str:
                col = mapping.get(field, "")
                return str(row.get(col, "")).strip() if col else ""

            name  = _col("name")
            if not name:
                continue

            email    = _col("email")
            phone    = _col("phone")
            company  = _col("company")
            note     = _col("note")
            type_val = _col("type") or "B2C"
            line_uid = _col("lineUid")
            tags_raw = _col("tags")
            tags     = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
            tags.append("google_sheets")

            payload = {
                "name":        name,
                "type":        type_val if type_val in ("B2B", "B2C") else "B2C",
                "email":       email,
                "phone":       phone,
                "company":     company,
                "note":        note,
                "lineUid":     line_uid,
                "tags":        tags,
                "source":      "google_sheets",
            }

            # ตรวจสอบว่ามีอยู่แล้วหรือไม่ (email หรือ phone เป็น unique key)
            existing = None
            if line_uid:
                existing = await get_customer_by_line_uid(line_uid, workspace_id)
            if not existing and email:
                db2 = get_db()
                doc2 = await db2.customers.find_one({"workspaceId": workspace_id, "email": email})
                if doc2:
                    existing = {"id": str(doc2["_id"])}
            if not existing and phone:
                db2 = get_db()
                doc2 = await db2.customers.find_one({"workspaceId": workspace_id, "phone": phone})
                if doc2:
                    existing = {"id": str(doc2["_id"])}

            if existing:
                await update_customer(existing["id"], {k: v for k, v in payload.items() if v})
                updated += 1
            else:
                await create_customer(payload, creator_username="google_sheets", workspace_id=workspace_id)
                imported += 1

        except Exception as e:
            logger.warning("Google Sheets row import error: %s", e)
            errors += 1

    logger.info("Google Sheets import: +%d new, %d updated, %d errors", imported, updated, errors)
    return {"success": True, "imported": imported, "updated": updated, "errors": errors}


@router.get("/webhook-url")
async def get_webhook_url(request: Request, current: dict = Depends(get_current_user)):
    """คืน Webhook URL สำหรับนำไปใส่ใน Apps Script"""
    base = str(request.base_url).rstrip("/")
    return {"webhookUrl": f"{base}/api/google-sheets/webhook"}
