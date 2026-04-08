"""
sse.py — Server-Sent Events
แทนที่ระบบ polling จาก frontend (30s notifications, 3s chat)
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request
from sse_starlette.sse import EventSourceResponse

from ..database import get_db
from ..services.auth_service import decode_token

router = APIRouter(prefix="/api/sse", tags=["sse"])
logger = logging.getLogger("planeat.sse")


def _json(obj) -> str:
    return json.dumps(obj, default=str, ensure_ascii=False)


# ─── Notifications stream ─────────────────────────────────────────────────────

@router.get("/notifications")
async def notifications_stream(request: Request, token: str = Query("")):
    """
    Stream การแจ้งเตือนแบบ real-time
    Client เชื่อมครั้งเดียว รับ event ทุก 8 วินาที (แทน HTTP poll ทุก 30 วินาที)
    Auth ผ่าน query param ?token=<jwt>
    """
    payload = decode_token(token)
    if not payload:
        async def _deny():
            yield {"event": "error", "data": "unauthorized"}
        return EventSourceResponse(_deny())

    username = payload["sub"]
    db = get_db()

    async def event_generator():
        last_ids: set[str] = set()
        while True:
            if await request.is_disconnected():
                logger.debug("SSE notifications disconnected: %s", username)
                break
            try:
                cursor = db.notifications.find(
                    {"recipientUsername": username}
                ).sort("createdAt", -1).limit(30)
                docs = await cursor.to_list(None)

                notifs = []
                for n in docs:
                    n["_id"] = str(n["_id"])
                    if isinstance(n.get("createdAt"), datetime):
                        n["createdAt"] = n["createdAt"].isoformat()
                    notifs.append(n)

                unread = sum(1 for n in notifs if not n.get("read"))
                current_ids = {n["_id"] for n in notifs}

                # ส่ง event เสมอในครั้งแรก หรือเมื่อมีการเปลี่ยนแปลง
                if not last_ids or current_ids != last_ids:
                    last_ids = current_ids
                    yield {
                        "event": "notification",
                        "data": _json({"notifications": notifs, "unread": unread}),
                    }
            except Exception as e:
                logger.warning("SSE notifications error: %s", e)

            await asyncio.sleep(8)

    return EventSourceResponse(event_generator())


# ─── Chat stream ──────────────────────────────────────────────────────────────

@router.get("/chat/{other_username}")
async def chat_stream(
    request: Request,
    other_username: str,
    token: str = Query(""),
):
    """
    Stream ข้อความสนทนากับ other_username
    Client เชื่อมครั้งเดียว รับ event ทุก 2 วินาที (แทน HTTP poll ทุก 3 วินาที)
    """
    payload = decode_token(token)
    if not payload:
        async def _deny():
            yield {"event": "error", "data": "unauthorized"}
        return EventSourceResponse(_deny())

    me = payload["sub"]
    db = get_db()
    room_id = "_".join(sorted([me, other_username]))

    async def event_generator():
        last_count = -1
        while True:
            if await request.is_disconnected():
                logger.debug("SSE chat disconnected: %s<>%s", me, other_username)
                break
            try:
                docs = await db.chat_messages.find(
                    {"roomId": room_id}
                ).sort("createdAt", 1).to_list(None)

                if len(docs) != last_count:
                    last_count = len(docs)
                    msgs = []
                    for m in docs:
                        m["_id"] = str(m["_id"])
                        if isinstance(m.get("createdAt"), datetime):
                            m["createdAt"] = m["createdAt"].isoformat()
                        msgs.append(m)
                    yield {
                        "event": "message",
                        "data": _json({"messages": msgs}),
                    }
            except Exception as e:
                logger.warning("SSE chat error: %s", e)

            await asyncio.sleep(2)

    return EventSourceResponse(event_generator())


# ─── Registration (LINE OTP) stream ──────────────────────────────────────────

@router.get("/register/{session_id}")
async def register_stream(request: Request, session_id: str):
    """
    Stream สถานะการยืนยัน LINE OTP สำหรับหน้าสมัครสมาชิก
    ไม่ต้องการ auth — ใช้ sessionId เป็นตัวระบุ
    """
    db = get_db()

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            try:
                session = await db.registration_sessions.find_one(
                    {"_id": session_id}, {"otp": 0}
                )
                if not session:
                    yield {"event": "status", "data": _json({"status": "not_found"})}
                    break
                status = session.get("status", "pending")
                yield {
                    "event": "status",
                    "data": _json({"status": status, "lineUid": session.get("lineUid", "")}),
                }
                if status == "verified":
                    break
                expires = datetime.fromisoformat(session["expiresAt"])
                now_utc = datetime.now(timezone.utc)
                if now_utc > expires:
                    yield {"event": "status", "data": _json({"status": "expired"})}
                    break
            except Exception as e:
                logger.warning("SSE register error: %s", e)

            await asyncio.sleep(3)

    return EventSourceResponse(event_generator())
