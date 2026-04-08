"""
segment_service.py — Business logic สำหรับ Customer Segments
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db

logger = logging.getLogger("planeat.segment")


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    return doc


async def get_all_segments(workspace_id: str) -> list:
    db = get_db()
    docs = await db.customer_segments.find({"workspaceId": workspace_id}).sort("createdAt", 1).to_list(None)
    return [_serialize(d) for d in docs]


async def get_segment(segment_id: str, workspace_id: Optional[str] = None) -> Optional[dict]:
    db = get_db()
    query = {"_id": segment_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    doc = await db.customer_segments.find_one(query)
    return _serialize(doc) if doc else None


async def create_segment(payload: dict, creator_username: str, workspace_id: str) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id":         str(uuid.uuid4()),
        "workspaceId": workspace_id,
        "name":        payload.get("name", ""),
        "description": payload.get("description", ""),
        "color":       payload.get("color", "#7c3aed"),
        "icon":        payload.get("icon", "label"),
        "createdAt":   now,
        "updatedAt":   now,
        "createdBy":   creator_username,
    }
    await db.customer_segments.insert_one(doc)
    logger.info("Segment created: %s in workspace %s by %s", doc["_id"], workspace_id, creator_username)
    return {"success": True, "segment": _serialize(doc)}


async def update_segment(segment_id: str, payload: dict, workspace_id: Optional[str] = None) -> dict:
    db = get_db()
    updates = {k: v for k, v in payload.items() if v is not None}
    if not updates:
        return {"success": False, "message": "ไม่มีข้อมูลที่จะอัปเดต"}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    query = {"_id": segment_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    result = await db.customer_segments.update_one(query, {"$set": updates})
    if result.matched_count == 0:
        return {"success": False, "message": "ไม่พบกลุ่มลูกค้านี้"}
    doc = await db.customer_segments.find_one({"_id": segment_id})
    return {"success": True, "segment": _serialize(doc)}


async def delete_segment(segment_id: str, workspace_id: Optional[str] = None) -> dict:
    db = get_db()
    query = {"_id": segment_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    result = await db.customer_segments.delete_one(query)
    if result.deleted_count == 0:
        return {"success": False, "message": "ไม่พบกลุ่มลูกค้านี้"}
    # Remove segmentId from all customers in this workspace
    await db.customers.update_many(
        {"workspaceId": workspace_id, "segmentIds": segment_id},
        {"$pull": {"segmentIds": segment_id}},
    )
    return {"success": True, "message": "ลบกลุ่มลูกค้าสำเร็จ"}


async def get_segment_customer_count(segment_id: str, workspace_id: str) -> int:
    db = get_db()
    return await db.customers.count_documents({
        "workspaceId": workspace_id,
        "segmentIds": segment_id,
        "status": "active",
    })
