from datetime import datetime, timezone
import uuid
from ..database import get_db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_contacts(current_username: str) -> dict:
    """ดึงรายชื่อ user ทั้งหมดที่ active (ยกเว้นตัวเอง)"""
    db = get_db()
    cursor = db.users.find(
        {"username": {"$ne": current_username}, "status": {"$ne": "suspended"}},
        {"password_hash": 0, "otp_secret": 0, "otp_backup_codes": 0}
    ).sort("name", 1)
    raw = await cursor.to_list(length=500)
    contacts = [{k: str(v) if k == "_id" else v for k, v in c.items()} for c in raw]
    return {"success": True, "contacts": contacts}


async def get_messages(room_id: str, limit: int = 50, before: str = "") -> dict:
    """ดึง messages ของ room"""
    db = get_db()
    query: dict = {"roomId": room_id}
    if before:
        query["createdAt"] = {"$lt": before}
    cursor = db.chat_messages.find(query, {"_id": 0}).sort("createdAt", -1).limit(limit)
    msgs = await cursor.to_list(length=limit)
    msgs.reverse()
    return {"success": True, "messages": msgs}


async def send_message(room_id: str, sender: str, content: str) -> dict:
    if not content.strip():
        return {"success": False, "message": "ข้อความว่าง"}
    db = get_db()
    msg = {
        "id":        str(uuid.uuid4()),
        "roomId":    room_id,
        "sender":    sender,
        "content":   content.strip(),
        "createdAt": _now(),
    }
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    return {"success": True, "message": msg}


def make_room_id(user_a: str, user_b: str) -> str:
    """Deterministic room ID for DM between two users"""
    return "dm_" + "_".join(sorted([user_a, user_b]))


async def get_conversations(username: str) -> dict:
    """ดึงรายการ DM ล่าสุดของ user"""
    db = get_db()
    pipeline = [
        {"$match": {"roomId": {"$regex": f"dm_.*{username}|dm_{username}"}}},
        {"$sort": {"createdAt": -1}},
        {"$group": {"_id": "$roomId", "lastMsg": {"$first": "$$ROOT"}}},
        {"$sort": {"lastMsg.createdAt": -1}},
        {"$limit": 30},
    ]
    results = await db.chat_messages.aggregate(pipeline).to_list(length=30)

    conversations = []
    for r in results:
        room_id = r["_id"]
        last = r["lastMsg"]
        last.pop("_id", None)
        # หา other user จาก room_id
        parts = room_id.replace("dm_", "").split("_")
        other = next((p for p in parts if p != username), None)
        other_user = None
        if other:
            other_user = await db.users.find_one(
                {"username": other}, {"_id": 0, "username": 1, "name": 1, "nickname": 1, "role": 1}
            )
        conversations.append({
            "roomId": room_id,
            "otherUser": other_user,
            "lastMessage": last,
        })
    return {"success": True, "conversations": conversations}


async def get_unread_count(username: str, room_id: str, last_seen: str) -> int:
    db = get_db()
    return await db.chat_messages.count_documents({
        "roomId": room_id,
        "sender": {"$ne": username},
        "createdAt": {"$gt": last_seen},
    })
