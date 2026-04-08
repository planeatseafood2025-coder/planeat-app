"""
crm_workspace_service.py — Business logic สำหรับ CRM Workspaces
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db

logger = logging.getLogger("planeat.crm_workspace")


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    return doc


async def get_workspaces_for_user(username: str, role: str) -> list:
    """ดึง workspace ที่ user มีสิทธิ์เข้าถึง (admin/super_admin เห็นทั้งหมด)"""
    db = get_db()
    ADMIN_ROLES = ["admin", "super_admin", "it_manager"]
    if role in ADMIN_ROLES:
        docs = await db.crm_workspaces.find({}).sort("createdAt", 1).to_list(None)
    else:
        docs = await db.crm_workspaces.find(
            {"$or": [
                {"memberUsernames": username},
                {"createdBy": username},
            ]}
        ).sort("createdAt", 1).to_list(None)
    return [_serialize(d) for d in docs]


async def get_workspace(workspace_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.crm_workspaces.find_one({"_id": workspace_id})
    return _serialize(doc) if doc else None


async def create_workspace(payload: dict, creator_username: str) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    members = payload.get("memberUsernames", [])
    if creator_username not in members:
        members = [creator_username] + members
    doc = {
        "_id":             str(uuid.uuid4()),
        "name":            payload.get("name", ""),
        "description":     payload.get("description", ""),
        "color":           payload.get("color", "#7c3aed"),
        "icon":            payload.get("icon", "business"),
        "lineOaConfigId":  payload.get("lineOaConfigId", ""),
        "memberUsernames": members,
        "createdAt":       now,
        "updatedAt":       now,
        "createdBy":       creator_username,
    }
    await db.crm_workspaces.insert_one(doc)
    logger.info("CRM Workspace created: %s by %s", doc["_id"], creator_username)
    return {"success": True, "workspace": _serialize(doc)}


async def update_workspace(workspace_id: str, payload: dict) -> dict:
    db = get_db()
    updates = {k: v for k, v in payload.items() if v is not None}
    if not updates:
        return {"success": False, "message": "ไม่มีข้อมูลที่จะอัปเดต"}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    result = await db.crm_workspaces.update_one({"_id": workspace_id}, {"$set": updates})
    if result.matched_count == 0:
        return {"success": False, "message": "ไม่พบ workspace นี้"}
    doc = await db.crm_workspaces.find_one({"_id": workspace_id})
    return {"success": True, "workspace": _serialize(doc)}


async def delete_workspace(workspace_id: str) -> dict:
    db = get_db()
    # ตรวจสอบว่ายังมีลูกค้าอยู่หรือไม่
    customer_count = await db.customers.count_documents({"workspaceId": workspace_id})
    if customer_count > 0:
        return {
            "success": False,
            "message": f"ไม่สามารถลบได้ มีลูกค้า {customer_count} รายในระบบ กรุณาย้ายหรือลบลูกค้าก่อน"
        }
    result = await db.crm_workspaces.delete_one({"_id": workspace_id})
    if result.deleted_count == 0:
        return {"success": False, "message": "ไม่พบ workspace นี้"}
    return {"success": True, "message": "ลบ workspace สำเร็จ"}


async def can_access_workspace(workspace_id: str, username: str, role: str) -> bool:
    """ตรวจสอบว่า user มีสิทธิ์เข้าถึง workspace นี้หรือไม่"""
    ADMIN_ROLES = ["admin", "super_admin", "it_manager"]
    if role in ADMIN_ROLES:
        return True
    db = get_db()
    doc = await db.crm_workspaces.find_one({
        "_id": workspace_id,
        "$or": [{"memberUsernames": username}, {"createdBy": username}],
    })
    return doc is not None
