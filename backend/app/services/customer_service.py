"""
customer_service.py — Business logic สำหรับระบบลูกค้า CRM
ทุก operation ต้องระบุ workspaceId เพื่อแยกข้อมูลระหว่างธุรกิจ
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db

logger = logging.getLogger("planeat.customer")


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    return doc


async def get_all_customers(
    workspace_id: str,
    q: str = "",
    type_filter: str = "",
    tag: str = "",
    status: str = "active",
    page: int = 1,
    per_page: int = 20,
    segment_id: str = "",
) -> dict:
    db = get_db()
    query: dict = {"workspaceId": workspace_id}

    if status:
        query["status"] = status
    if type_filter:
        query["type"] = type_filter
    if tag:
        query["tags"] = tag
    if segment_id:
        query["segmentIds"] = segment_id
    if q:
        query["$or"] = [
            {"name":            {"$regex": q, "$options": "i"}},
            {"email":           {"$regex": q, "$options": "i"}},
            {"phone":           {"$regex": q, "$options": "i"}},
            {"company":         {"$regex": q, "$options": "i"}},
            {"lineDisplayName": {"$regex": q, "$options": "i"}},
        ]

    total = await db.customers.count_documents(query)
    skip  = (page - 1) * per_page
    docs  = await db.customers.find(query).sort("createdAt", -1).skip(skip).limit(per_page).to_list(None)

    return {
        "customers":  [_serialize(d) for d in docs],
        "total":      total,
        "page":       page,
        "totalPages": max(1, -(-total // per_page)),
    }


async def get_customer(customer_id: str, workspace_id: Optional[str] = None) -> Optional[dict]:
    db = get_db()
    query = {"_id": customer_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    doc = await db.customers.find_one(query)
    return _serialize(doc) if doc else None


async def get_customer_by_line_uid(line_uid: str, workspace_id: Optional[str] = None) -> Optional[dict]:
    db = get_db()
    query = {"lineUid": line_uid}
    if workspace_id:
        query["workspaceId"] = workspace_id
    doc = await db.customers.find_one(query)
    return _serialize(doc) if doc else None


async def create_customer(
    payload: dict,
    creator_username: str = "system",
    workspace_id: Optional[str] = None,
) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id":             str(uuid.uuid4()),
        "workspaceId":     workspace_id or payload.get("workspaceId", ""),
        "name":            payload.get("name", ""),
        "type":            payload.get("type", "B2C"),
        "email":           payload.get("email", ""),
        "phone":           payload.get("phone", ""),
        "lineUid":         payload.get("lineUid", ""),
        "lineDisplayName": payload.get("lineDisplayName", ""),
        "linePictureUrl":  payload.get("linePictureUrl", ""),
        "source":          payload.get("source", "manual"),
        "sourceRef":       payload.get("sourceRef", ""),
        "tags":            payload.get("tags", []),
        "segmentIds":      payload.get("segmentIds", []),
        "company":         payload.get("company", ""),
        "address":         payload.get("address", ""),
        "note":            payload.get("note", ""),
        "contacts":        payload.get("contacts", []),
        "status":          "active",
        "createdAt":       now,
        "updatedAt":       now,
        "createdBy":       creator_username,
    }
    await db.customers.insert_one(doc)
    logger.info("Customer created: %s in workspace %s by %s", doc["_id"], doc["workspaceId"], creator_username)
    return {"success": True, "customer": _serialize(doc)}


async def update_customer(customer_id: str, payload: dict, workspace_id: Optional[str] = None) -> dict:
    db = get_db()
    updates = {k: v for k, v in payload.items() if v is not None}
    if not updates:
        return {"success": False, "message": "ไม่มีข้อมูลที่จะอัปเดต"}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    query = {"_id": customer_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    result = await db.customers.update_one(query, {"$set": updates})
    if result.matched_count == 0:
        return {"success": False, "message": "ไม่พบลูกค้านี้"}
    doc = await db.customers.find_one({"_id": customer_id})
    return {"success": True, "customer": _serialize(doc)}


async def delete_customer(customer_id: str, workspace_id: Optional[str] = None) -> dict:
    db = get_db()
    query = {"_id": customer_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    result = await db.customers.delete_one(query)
    if result.deleted_count == 0:
        return {"success": False, "message": "ไม่พบลูกค้านี้"}
    return {"success": True, "message": "ลบลูกค้าสำเร็จ"}


async def add_tag(customer_id: str, tag: str, workspace_id: Optional[str] = None) -> dict:
    db = get_db()
    query = {"_id": customer_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    await db.customers.update_one(
        query,
        {"$addToSet": {"tags": tag}, "$set": {"updatedAt": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True}


async def remove_tag(customer_id: str, tag: str, workspace_id: Optional[str] = None) -> dict:
    db = get_db()
    query = {"_id": customer_id}
    if workspace_id:
        query["workspaceId"] = workspace_id
    await db.customers.update_one(
        query,
        {"$pull": {"tags": tag}, "$set": {"updatedAt": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True}


async def get_all_tags(workspace_id: str) -> list:
    db = get_db()
    tags = await db.customers.distinct("tags", {"workspaceId": workspace_id, "status": "active"})
    return sorted(t for t in tags if t)


async def export_customers_csv(
    workspace_id: str,
    type_filter: str = "",
    tag: str = "",
    status: str = "active",
) -> str:
    db = get_db()
    query: dict = {"workspaceId": workspace_id}
    if status:
        query["status"] = status
    if type_filter:
        query["type"] = type_filter
    if tag:
        query["tags"] = tag

    docs = await db.customers.find(query).sort("createdAt", -1).to_list(None)

    lines = ["ชื่อ,ประเภท,อีเมล,เบอร์โทร,บริษัท,Tags,LINE,ช่องทาง,วันที่สร้าง"]
    for d in docs:
        tags_str = "|".join(d.get("tags", []))
        line = ",".join([
            f'"{d.get("name", "")}"',
            d.get("type", ""),
            d.get("email", ""),
            d.get("phone", ""),
            f'"{d.get("company", "")}"',
            f'"{tags_str}"',
            d.get("lineDisplayName", ""),
            d.get("source", "manual"),
            str(d.get("createdAt", ""))[:10],
        ])
        lines.append(line)
    return "\n".join(lines)
