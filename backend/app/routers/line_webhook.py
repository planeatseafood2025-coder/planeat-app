"""
line_webhook.py — LINE OA Webhook endpoint
รับ event จาก LINE Platform, verify signature, บันทึก groupId/userId อัตโนมัติ
Phase 1C: follow event → auto-create Customer, unfollow → inactive
"""
import hashlib
import hmac
import base64
import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Request, Response, Path
from ..database import get_db
from ..services.customer_service import (
    get_customer_by_line_uid, create_customer, update_customer,
)

router = APIRouter(prefix="/api/line", tags=["line-webhook"])
logger = logging.getLogger("planeat.line_webhook")

SETTINGS_DOC_ID = "system_settings"
LINE_PROFILE_URL = "https://api.line.me/v2/bot/profile/{user_id}"
LINE_REPLY_URL   = "https://api.line.me/v2/bot/message/reply"


def _verify_signature(body: bytes, channel_secret: str, x_line_signature: str) -> bool:
    if not channel_secret or not x_line_signature:
        return False
    hash_bytes = hmac.new(
        channel_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()
    expected = base64.b64encode(hash_bytes).decode("utf-8")
    return hmac.compare_digest(expected, x_line_signature)


async def _fetch_line_profile(user_id: str, access_token: str) -> dict:
    """ดึงโปรไฟล์ LINE ของ user"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(
                LINE_PROFILE_URL.format(user_id=user_id),
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if res.status_code == 200:
                return res.json()
    except Exception as e:
        logger.warning("fetch LINE profile failed: %s", e)
    return {}


async def _send_reply(reply_token: str, message: str, access_token: str) -> None:
    """ส่ง reply message กลับไปหา user"""
    if not reply_token or not access_token or not message:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                LINE_REPLY_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "replyToken": reply_token,
                    "messages": [{"type": "text", "text": message}],
                },
            )
    except Exception as e:
        logger.warning("send LINE reply failed: %s", e)


async def _get_or_create_default_workspace(config_id: str, config_name: str) -> str:
    """หา workspace ที่ผูกกับ LINE OA config นี้ หรือสร้าง default ถ้าไม่มี"""
    db = get_db()
    # หา workspace ที่ผูกกับ config นี้
    ws = await db.crm_workspaces.find_one({"lineOaConfigId": config_id})
    if ws:
        return str(ws["_id"])
    # ถ้าไม่มี ใช้ workspace แรกที่มีอยู่ หรือสร้างใหม่
    ws = await db.crm_workspaces.find_one({})
    if ws:
        return str(ws["_id"])
    # สร้าง default workspace
    from ..services.crm_workspace_service import create_workspace
    result = await create_workspace({
        "name":           f"LINE OA — {config_name or config_id[:8]}",
        "description":    "Workspace อัตโนมัติจาก LINE OA",
        "color":          "#06b6d4",
        "icon":           "groups",
        "lineOaConfigId": config_id,
        "memberUsernames": [],
    }, creator_username="system")
    return result["workspace"]["id"]


async def _handle_otp_message(text: str, user_id: str, reply_token: str, access_token: str) -> None:
    """ตรวจสอบว่าข้อความที่ส่งมาเป็น OTP สมัครสมาชิกหรือไม่"""
    import re
    if not re.fullmatch(r"\d{6}", text):
        return  # ไม่ใช่ OTP 6 หลัก

    db = get_db()
    session = await db.registration_sessions.find_one({"otp": text, "status": "pending"})
    if not session:
        return  # OTP ไม่ตรงหรือหมดอายุ

    # ตรวจอายุ
    expires = datetime.fromisoformat(session["expiresAt"])
    if datetime.now().replace(tzinfo=expires.tzinfo) > expires:
        if reply_token and access_token:
            await _send_reply(reply_token, "❌ รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่จากเว็บไซต์", access_token)
        return

    # Mark verified
    await db.registration_sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {"status": "verified", "lineUid": user_id, "verifiedAt": datetime.now().isoformat()}},
    )
    logger.info("LINE OTP verified: session=%s lineUid=%s", session["_id"], user_id)

    if reply_token and access_token:
        name = session.get("firstName", "คุณ")
        await _send_reply(
            reply_token,
            f"✅ ยืนยันตัวตนสำเร็จแล้ว คุณ{name}!\nกรุณากลับไปที่หน้าเว็บเพื่อดำเนินการสมัครสมาชิกต่อ",
            access_token,
        )


async def _handle_follow(event: dict, conf: dict) -> None:
    """follow event → สร้าง/อัปเดต Customer + ส่ง welcome message"""
    source = event.get("source", {})
    user_id = source.get("userId", "")
    reply_token = event.get("replyToken", "")
    access_token = conf.get("token", "")
    config_id    = conf.get("id", "")
    config_name  = conf.get("name", "")

    if not user_id:
        return

    # หา workspace ที่ผูกกับ LINE OA นี้
    workspace_id = await _get_or_create_default_workspace(config_id, config_name)

    # ดึงโปรไฟล์จาก LINE
    profile = await _fetch_line_profile(user_id, access_token)
    display_name  = profile.get("displayName", "")
    picture_url   = profile.get("pictureUrl", "")

    # ตรวจสอบว่ามีลูกค้านี้อยู่แล้วหรือไม่
    existing = await get_customer_by_line_uid(user_id, workspace_id)

    if existing:
        await update_customer(existing["id"], {
            "lineDisplayName": display_name,
            "linePictureUrl":  picture_url,
            "status":          "active",
        })
        logger.info("LINE follow: updated customer %s (lineUid=%s)", existing["id"], user_id)
    else:
        payload = {
            "name":            display_name or f"LINE User {user_id[:8]}",
            "type":            "B2C",
            "lineUid":         user_id,
            "lineDisplayName": display_name,
            "linePictureUrl":  picture_url,
            "source":          "line_oa",
            "tags":            ["line"],
        }
        result = await create_customer(payload, creator_username="line_webhook", workspace_id=workspace_id)
        logger.info("LINE follow: created customer %s in ws=%s (lineUid=%s)",
                    result.get("customer", {}).get("id"), workspace_id, user_id)

    # ส่ง welcome message (ถ้าตั้งค่าไว้)
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    # ใช้ welcome message ของ config นี้ก่อน fallback ไป global
    welcome_msg = conf.get("welcomeMessage") or (doc.get("lineWelcomeMessage", "") if doc else "")
    if welcome_msg and reply_token:
        await _send_reply(reply_token, welcome_msg, access_token)


async def _handle_unfollow(event: dict) -> None:
    """unfollow event → ตั้ง status = inactive"""
    source = event.get("source", {})
    user_id = source.get("userId", "")
    if not user_id:
        return

    existing = await get_customer_by_line_uid(user_id)
    if existing:
        await update_customer(existing["id"], {"status": "inactive"})
        logger.info("LINE unfollow: set inactive customer %s (lineUid=%s)", existing["id"], user_id)


@router.post("/webhook/{config_id}")
async def line_webhook(
    request: Request,
    config_id: str = Path(..., description="LINE OA config ID จากการตั้งค่า"),
):
    """
    LINE Platform จะ POST event ที่นี่
    - verify signature
    - join → บันทึก groupId
    - follow → สร้าง/อัปเดต Customer + welcome message
    - unfollow → ตั้ง Customer status = inactive
    """
    body = await request.body()
    x_sig = request.headers.get("x-line-signature", "")

    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    if not doc:
        return Response(status_code=200)

    # ── รองรับ config_id = "main" → ใช้ mainLineOa ──
    if config_id == "main":
        main_oa = doc.get("mainLineOa") or {}
        conf = {
            "id":            "main",
            "name":          "การเชื่อมต่อหลัก",
            "token":         main_oa.get("token", ""),
            "channelSecret": main_oa.get("channelSecret", ""),
            "targetId":      main_oa.get("targetId", ""),
        }
    else:
        configs: list = doc.get("lineOaConfigs", [])
        conf = next((c for c in configs if c.get("id") == config_id), None)
        if not conf:
            logger.warning("LINE webhook: config_id=%s not found in system_settings", config_id)
            return Response(status_code=200)

    if not _verify_signature(body, conf.get("channelSecret", ""), x_sig):
        logger.warning("LINE webhook: signature mismatch for config_id=%s (sig=%s)", config_id, x_sig[:20] if x_sig else "MISSING")
        return Response(status_code=200)

    import json
    try:
        payload = json.loads(body)
    except Exception:
        return Response(status_code=200)

    events = payload.get("events", [])
    updated_target_id = conf.get("targetId", "")
    logger.info("LINE webhook: config_id=%s received %d events", config_id, len(events))

    for event in events:
        event_type  = event.get("type", "")
        source      = event.get("source", {})
        source_type = source.get("type", "")

        if event_type == "join" and source_type == "group":
            updated_target_id = source.get("groupId", updated_target_id)
            logger.info("LINE join group: groupId=%s", updated_target_id)

        elif event_type == "message" and source_type == "group":
            group_id = source.get("groupId", "")
            user_id  = source.get("userId", "")
            msg_text = event.get("message", {}).get("text", "")
            logger.info("LINE group message: groupId=%s userId=%s text=%s", group_id, user_id, msg_text[:30])

        elif event_type == "follow" and source_type == "user":
            # อัปเดต targetId ถ้ายังไม่มี
            if not updated_target_id:
                updated_target_id = source.get("userId", updated_target_id)
            # สร้าง/อัปเดต Customer
            await _handle_follow(event, conf)

        elif event_type == "unfollow" and source_type == "user":
            await _handle_unfollow(event)

        elif event_type == "message":
            msg = event.get("message", {})
            if msg.get("type") == "text":
                text = msg.get("text", "").strip()
                await _handle_otp_message(
                    text=text,
                    user_id=source.get("userId", ""),
                    reply_token=event.get("replyToken", ""),
                    access_token=conf.get("token", ""),
                )

    # อัปเดต targetId ใน config
    if updated_target_id != conf.get("targetId", ""):
        new_configs = [
            {**c, "targetId": updated_target_id} if c.get("id") == config_id else c
            for c in configs
        ]
        await db.system_settings.update_one(
            {"_id": SETTINGS_DOC_ID},
            {"$set": {"lineOaConfigs": new_configs, "webhookUpdatedAt": datetime.now()}},
        )

    return Response(status_code=200)


@router.get("/webhook-info/{config_id}")
async def get_webhook_info(config_id: str, request: Request):
    """คืน Webhook URL + สถานะการเชื่อมต่อสำหรับ config นี้"""
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    configs: list = doc.get("lineOaConfigs", []) if doc else []
    conf = next((c for c in configs if c.get("id") == config_id), None)

    base = str(request.base_url).rstrip("/")
    webhook_url = f"{base}/api/line/webhook/{config_id}"

    return {
        "webhookUrl": webhook_url,
        "configId":   config_id,
        "targetId":   conf.get("targetId", "") if conf else "",
        "hasTarget":  bool(conf.get("targetId")) if conf else False,
    }


@router.put("/welcome-message")
async def set_welcome_message(request: Request):
    """ตั้งค่า Welcome Message สำหรับเมื่อมีคนแอด LINE OA"""
    body = await request.json()
    message = body.get("message", "")
    db = get_db()
    await db.system_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"lineWelcomeMessage": message}},
        upsert=True,
    )
    return {"success": True, "message": message}


@router.get("/welcome-message")
async def get_welcome_message():
    """ดึง Welcome Message ปัจจุบัน"""
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    return {"message": doc.get("lineWelcomeMessage", "") if doc else ""}
