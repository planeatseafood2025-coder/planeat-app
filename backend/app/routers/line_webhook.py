async def _handle_postback(postback_data: str, user_id: str, reply_token: str, access_token: str) -> None:
    params = {}
    for item in postback_data.split("&"):
        if "=" in item:
            k, v = item.split("=", 1)
            params[k] = v
    action   = params.get("action", "")
    draft_id = params.get("draft_id", "")
    if action not in ("approve", "reject", "detail") or not draft_id:
        return
    db = get_db()
    from datetime import datetime as _dt
    draft = await db.expense_drafts.find_one({"_id": draft_id})
    if not draft:
        await _send_reply(reply_token, "ไม่พบรายการนี้", access_token)
        return

    # ── action=detail: ส่งการ์ดรายละเอียดเต็มกลับให้ผู้จัดการ ────────────────
    if action == "detail":
        from ..services.line_notify_service import _build_approval_flex, _fmt, _push_to_uid
        cat   = draft.get("category", "")
        total = float(draft.get("total", 0))
        date_str = draft.get("date", "")
        recorder_name = draft.get("recorderName", draft.get("recorder", ""))
        now = _dt.now()
        month_str = now.strftime("%Y-%m")
        cat_key = draft.get("catKey", "")
        monthly_budget = 0.0
        spent_month = 0.0
        if cat_key:
            try:
                agg = await db.expenses.aggregate([
                    {"$match": {"date_iso": {"$regex": f"^{month_str}"}, "catKey": cat_key}},
                    {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
                ]).to_list(None)
                spent_month = agg[0]["total"] if agg else 0.0
                my = f"{now.month:02d}/{now.year}"
                budget_doc = await db.budgets.find_one({"monthYear": my}) or {}
                monthly_budget = float(budget_doc.get("budgets", {}).get(cat_key, {}).get("monthly", 0))
            except Exception:
                pass
        flex = _build_approval_flex(
            recorder_name, cat, date_str, _fmt(total), draft.get("detail", ""),
            monthly_budget=monthly_budget, spent_month=spent_month,
            draft_id=str(draft_id),
            row_items=draft.get("lineItems") or [],
        )
        await _push_to_uid(user_id, [flex])
        await _send_reply(reply_token, "ส่งรายละเอียดให้แล้ว 👆", access_token)
        return

    if draft.get("status") != "pending":
        await _send_reply(reply_token, "รายการนี้ดำเนินการไปแล้ว", access_token)
        return
    pending = await db.line_approval_pending.find_one({"managerLineUid": user_id})
    manager_username = pending.get("managerUsername", "") if pending else ""
    # resolve real name จาก DB เสมอ
    _mgr = await db.users.find_one({"lineUid": user_id}, {"username": 1, "name": 1, "firstName": 1, "lastName": 1, "_id": 0})
    if _mgr:
        if not manager_username:
            manager_username = _mgr.get("username", "")
        _fn = _mgr.get("firstName", "").strip()
        _ln = _mgr.get("lastName", "").strip()
        manager_name = f"{_fn} {_ln}".strip() or _mgr.get("name", "").strip() or manager_username
    else:
        manager_name = manager_username
    cat   = draft.get("category", "")
    total = draft.get("total", 0)
    recorder_uid = draft.get("recorderLineId", "")
    # fallback lineUid จาก DB ถ้า draft เก่าไม่มี recorderLineId
    if not recorder_uid:
        _rec_user = await db.users.find_one({"username": draft.get("recorder", "")}, {"lineUid": 1, "_id": 0})
        recorder_uid = (_rec_user or {}).get("lineUid", "")

    from ..services.line_notify_service import _push_to_uid, _build_recorder_flex, FRONTEND_URL
    history_url = f"{FRONTEND_URL}/expense-control?tab=history"
    if action == "approve":
        from ..services.expense_service import approve_draft
        await approve_draft(draft_id, {"sub": manager_username})
        await db.line_approval_pending.delete_many({"draftId": draft_id})
        if recorder_uid:
            await _push_to_uid(recorder_uid, [_build_recorder_flex(draft, mode="approved", approver_name=manager_name)])
        manager_confirm = {
            "type": "flex", "altText": f"✅ อนุมัติแล้ว — {cat} ฿{total:,.0f}",
            "contents": {
                "type": "bubble", "size": "kilo",
                "header": {"type": "box", "layout": "vertical", "backgroundColor": "#15803d", "paddingAll": "12px",
                           "contents": [{"type": "text", "text": "✅ อนุมัติสำเร็จ", "color": "#bbf7d0", "size": "sm", "weight": "bold"}]},
                "body": {"type": "box", "layout": "vertical", "paddingAll": "12px", "spacing": "sm",
                         "contents": [
                             {"type": "text", "text": f"หมวด: {cat}", "size": "sm", "color": "#1e293b"},
                             {"type": "text", "text": f"ยอด: ฿{total:,.2f}", "size": "sm", "color": "#15803d", "weight": "bold"},
                             {"type": "text", "text": "แจ้งผู้กรอกทาง LINE แล้ว", "size": "xs", "color": "#94a3b8"},
                         ]},
                "footer": {"type": "box", "layout": "vertical", "paddingAll": "10px",
                           "contents": [{"type": "button", "style": "secondary", "height": "sm",
                                         "action": {"type": "uri", "label": "📄 ดูประวัติ / ดาวน์โหลดเอกสาร", "uri": history_url}}]},
            },
        }
        await _push_to_uid(user_id, [manager_confirm])
    else:
        await db.expense_drafts.update_one(
            {"_id": draft_id},
            {"$set": {"status": "rejected", "rejectedBy": manager_username, "rejectedAt": _dt.now().isoformat()}}
        )
        await db.line_approval_pending.delete_many({"draftId": draft_id})
        if recorder_uid:
            await _push_to_uid(recorder_uid, [_build_recorder_flex(draft, mode="rejected")])
        await _send_reply(reply_token, f"❌ ปฏิเสธแล้ว หมวด: {cat} ยอด: ฿{total:,.0f}", access_token)


"""
line_webhook.py — LINE OA Webhook endpoint
รับ event จาก LINE Platform, verify signature, บันทึก groupId/userId อัตโนมัติ
Phase 1C: follow event -> auto-create Customer, unfollow -> inactive
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


async def _handle_user_approval_reply(text: str, user_id: str, reply_token: str, access_token: str) -> bool:
    """
    IT/Admin ตอบ Y/N เพื่ออนุมัติ/ปฏิเสธสมาชิกใหม่
    คืน True ถ้าจัดการแล้ว
    """
    normalized = text.strip().upper()
    if normalized not in ("Y", "YES", "N", "NO", "ใช่", "ไม่"):
        return False

    db = get_db()
    pending = await db.line_user_approval_pending.find_one(
        {"adminLineUid": user_id},
        sort=[("createdAt", -1)]
    )
    if not pending:
        return False

    target_username = pending["targetUsername"]
    target_line_uid = pending.get("targetLineUid", "")
    admin_username  = pending.get("adminUsername", "")

    await db.line_user_approval_pending.delete_one({"_id": pending["_id"]})

    user = await db.users.find_one({"username": target_username})
    if not user:
        await _send_reply(reply_token, "❌ ไม่พบผู้ใช้รายนี้ในระบบ", access_token)
        return True

    name  = user.get("name", target_username)
    phone = user.get("phone", "")

    from datetime import datetime as _dt
    now_str = _dt.now().isoformat()

    if normalized in ("Y", "YES", "ใช่"):
        await db.users.update_one(
            {"username": target_username},
            {"$set": {"status": "active", "approvedBy": admin_username, "approvedAt": now_str}}
        )
        # แจ้งผู้สมัครทาง LINE
        if target_line_uid:
            from ..services.line_notify_service import _push_to_uid
            await _push_to_uid(target_line_uid, [{"type": "text", "text": (
                f"🎉 บัญชีของคุณได้รับการอนุมัติแล้ว!\n"
                f"Username: {target_username}\n\n"
                f"กรุณาเข้าสู่ระบบได้เลยครับ/ค่ะ"
            )}])
        await _send_reply(
            reply_token,
            f"✅ อนุมัติสมาชิกแล้ว\nชื่อ: {name}\nUsername: {target_username}\nเบอร์: {phone}",
            access_token
        )
    else:
        await db.users.update_one(
            {"username": target_username},
            {"$set": {"status": "rejected", "rejectedBy": admin_username, "rejectedAt": now_str}}
        )
        if target_line_uid:
            from ..services.line_notify_service import _push_to_uid
            await _push_to_uid(target_line_uid, [{"type": "text", "text": (
                f"❌ บัญชีของคุณไม่ผ่านการอนุมัติ\n"
                f"Username: {target_username}\n\n"
                f"กรุณาติดต่อทีม IT เพื่อสอบถามข้อมูลเพิ่มเติม"
            )}])
        await _send_reply(
            reply_token,
            f"❌ ปฏิเสธสมาชิกแล้ว\nชื่อ: {name}\nUsername: {target_username}",
            access_token
        )

    return True


async def _handle_approval_reply(text: str, user_id: str, reply_token: str, access_token: str) -> bool:
    """
    ตรวจสอบว่า manager ตอบ Y/Yes/N/No เพื่ออนุมัติ/ปฏิเสธรายการค่าใช้จ่าย
    คืน True ถ้าจัดการแล้ว, False ถ้าไม่ใช่คำตอบ approval
    """
    normalized = text.strip().upper()
    if normalized not in ("Y", "YES", "N", "NO", "ใช่", "ไม่"):
        return False

    db = get_db()
    # หา pending approval ของ manager คนนี้ (เรียงตามใหม่สุด)
    pending = await db.line_approval_pending.find_one(
        {"managerLineUid": user_id},
        sort=[("createdAt", -1)]
    )
    if not pending:
        return False

    draft_id = pending["draftId"]
    manager_username = pending.get("managerUsername", "")

    # resolve real name จาก DB เสมอ
    _mgr = await db.users.find_one({"lineUid": user_id}, {"username": 1, "name": 1, "firstName": 1, "lastName": 1, "_id": 0})
    if _mgr:
        if not manager_username:
            manager_username = _mgr.get("username", "")
        _fn = _mgr.get("firstName", "").strip()
        _ln = _mgr.get("lastName", "").strip()
        manager_name = f"{_fn} {_ln}".strip() or _mgr.get("name", "").strip() or manager_username
    else:
        manager_name = manager_username

    # ลบ pending state ออกก่อน (ป้องกัน double-process)
    await db.line_approval_pending.delete_one({"_id": pending["_id"]})

    # ดึง draft
    draft = await db.expense_drafts.find_one({"_id": draft_id})
    if not draft or draft.get("status") != "pending":
        await _send_reply(reply_token, "❌ ไม่พบรายการ หรือรายการนี้ดำเนินการไปแล้ว", access_token)
        return True

    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    now = _dt.now(_tz.utc)
    recorder_name = draft.get("recorderName", draft.get("recorder", ""))
    category = draft.get("category", "")
    date_str = draft.get("date", "")
    total = float(draft.get("total", 0))

    if normalized in ("Y", "YES", "ใช่"):
        # ── อนุมัติ ──────────────────────────────────────────────────────────
        from ..services.expense_service import calc_expense_total
        expense_ids = []
        for row in draft.get("rows", []):
            row_total, detail, note = calc_expense_total(category, row)
            if row_total <= 0 and not detail:
                continue
            doc = {
                "_id": str(_uuid.uuid4()),
                "date": draft["date"],
                "date_iso": draft.get("date_iso", ""),
                "category": category,
                "catKey": draft.get("catKey", ""),
                "amount": row_total,
                "recorder": draft["recorder"],
                "recorderName": recorder_name,
                "recorderLineId": draft.get("recorderLineId", ""),
                "detail": detail,
                "note": note,
                "rows": [row],
                "approvedBy": manager_username,
                "approverName": manager_name,
                "approvedAt": now.isoformat(),
                "draftId": draft_id,
                "createdAt": now.isoformat(),
            }
            await db.expenses.insert_one(doc)
            expense_ids.append(doc["_id"])

        await db.expense_drafts.update_one(
            {"_id": draft_id},
            {"$set": {"status": "approved", "reviewedBy": manager_username,
                      "reviewedAt": now.isoformat(), "approvedExpenseIds": expense_ids}}
        )

        # แจ้ง recorder ใน app
        await db.notifications.insert_one({
            "id": str(_uuid.uuid4()),
            "recipientUsername": draft["recorder"],
            "senderUsername": manager_username,
            "type": "expense_approved",
            "title": "✅ รายการได้รับการอนุมัติ",
            "body": f"อนุมัติรายการ{category} วันที่ {date_str} ยอด ฿{total:,.0f} แล้ว",
            "read": False,
            "createdAt": now,
            "data": {"draftId": draft_id},
        })

        # แจ้ง recorder ผ่าน LINE OA
        recorder_user = await db.users.find_one(
            {"username": draft["recorder"]}, {"lineUid": 1, "lineNotifyToken": 1, "_id": 0}
        )
        if recorder_user:
            from ..services.line_notify_service import _push_to_uid, _notify_personal, _build_recorder_flex, _fmt_draft_items
            if recorder_user.get("lineUid"):
                flex = _build_recorder_flex(draft, mode="approved", approver_name=manager_name)
                await _push_to_uid(recorder_user["lineUid"], [flex])
            elif recorder_user.get("lineNotifyToken"):
                items_text = _fmt_draft_items(draft)
                msg = f"✅ อนุมัติแล้ว\nหมวด: {category} | {date_str}\nยอด: ฿{total:,.0f}\n{items_text}"
                await _notify_personal(recorder_user["lineNotifyToken"], f"\n{msg}")

        await _send_reply(
            reply_token,
            f"✅ อนุมัติแล้ว\nผู้กรอก: {recorder_name}\nหมวด: {category}\nวันที่: {date_str}\nยอด: ฿{total:,.0f}",
            access_token
        )

    else:
        # ── ปฏิเสธ ───────────────────────────────────────────────────────────
        await db.expense_drafts.update_one(
            {"_id": draft_id},
            {"$set": {"status": "rejected", "reviewedBy": manager_username,
                      "reviewedAt": now.isoformat(), "rejectReason": "ปฏิเสธผ่าน LINE"}}
        )

        await db.notifications.insert_one({
            "id": str(_uuid.uuid4()),
            "recipientUsername": draft["recorder"],
            "senderUsername": manager_username,
            "type": "expense_rejected",
            "title": "❌ รายการไม่ผ่านการอนุมัติ",
            "body": f"ไม่อนุมัติรายการ{category} วันที่ {date_str} ยอด ฿{total:,.0f}",
            "read": False,
            "createdAt": now,
            "data": {"draftId": draft_id},
        })

        recorder_user = await db.users.find_one(
            {"username": draft["recorder"]}, {"lineUid": 1, "lineNotifyToken": 1, "_id": 0}
        )
        if recorder_user:
            from ..services.line_notify_service import _push_to_uid, _notify_personal, _build_recorder_flex, _fmt_draft_items
            if recorder_user.get("lineUid"):
                flex = _build_recorder_flex(draft, mode="rejected")
                await _push_to_uid(recorder_user["lineUid"], [flex])
            elif recorder_user.get("lineNotifyToken"):
                items_text = _fmt_draft_items(draft)
                msg = f"❌ ไม่ผ่านอนุมัติ\nหมวด: {category} | {date_str}\nยอด: ฿{total:,.0f}\n{items_text}"
                await _notify_personal(recorder_user["lineNotifyToken"], f"\n{msg}")

        await _send_reply(
            reply_token,
            f"❌ ปฏิเสธแล้ว\nผู้กรอก: {recorder_name}\nหมวด: {category}\nวันที่: {date_str}\nยอด: ฿{total:,.0f}",
            access_token
        )

    return True



def _flex_feature(icon: str, title: str, desc: str) -> dict:
    return {
        "type": "box", "layout": "horizontal", "spacing": "md", "alignItems": "flex-start",
        "contents": [
            {"type": "text", "text": icon, "size": "sm", "flex": 0},
            {"type": "box", "layout": "vertical", "flex": 1, "contents": [
                {"type": "text", "text": title, "size": "sm", "weight": "bold", "color": "#1e293b"},
                {"type": "text", "text": desc, "size": "xs", "color": "#94a3b8", "wrap": True},
            ]},
        ],
    }


async def _handle_follow(event: dict, conf: dict) -> None:
    """follow event -> สร้าง/อัปเดต Customer + ส่ง welcome message"""
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

    # ส่ง welcome message
    import os as _os
    _pub = _os.environ.get("PUBLIC_URL", "").rstrip("/")
    _login_url = _pub + "/login" if _pub else ""

    if config_id == "main":
        if user_id and _login_url:
            from ..services.line_notify_service import _push_to_uid
            _name = display_name or "คุณ"
            _flex = {
                "type": "flex",
                "altText": f"ยินดีต้อนรับสู่ PlaNeat — {_name}",
                "contents": {
                    "type": "bubble",
                    "size": "kilo",
                    "header": {
                        "type": "box",
                        "layout": "vertical",
                        "backgroundColor": "#1e3a8a",
                        "paddingAll": "18px",
                        "contents": [
                            {"type": "text", "text": "PlaNeat", "color": "#ffffff", "size": "xl", "weight": "bold"},
                            {"type": "text", "text": "ระบบสนับสนุนงานขององค์กร", "color": "#93c5fd", "size": "sm", "margin": "xs"},
                        ],
                    },
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "paddingAll": "16px",
                        "spacing": "md",
                        "contents": [
                            {
                                "type": "text",
                                "text": f"\U0001F44B ยินดีต้อนรับ คุณ{_name}!",
                                "weight": "bold",
                                "size": "md",
                                "color": "#1e293b",
                                "wrap": True,
                            },
                            {
                                "type": "text",
                                "text": "PlaNeat ช่วยให้ทุกคนในทีมทำงานได้ง่าย รวดเร็ว และเป็นระบบมากขึ้น",
                                "size": "sm",
                                "color": "#475569",
                                "wrap": True,
                            },
                            {"type": "separator", "margin": "md"},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "spacing": "sm",
                                "margin": "md",
                                "contents": [
                                    _flex_feature("\U0001F4CB", "บันทึกข้อมูลประจำวัน", "ส่งรายการผ่าน LINE ได้เลย"),
                                    _flex_feature("\u2705", "อนุมัติงานผ่าน LINE", "กดอนุมัติ/ปฏิเสธได้ทันที"),
                                    _flex_feature("\U0001F4CA", "รายงานและสรุปข้อมูล", "ภาพรวมงบและสถานะงาน"),
                                    _flex_feature("\U0001F514", "แจ้งเตือนอัตโนมัติ", "ไม่พลาดทุกงานสำคัญ"),
                                ],
                            },
                        ],
                    },
                    "footer": {
                        "type": "box",
                        "layout": "vertical",
                        "paddingAll": "12px",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "button",
                                "style": "primary",
                                "color": "#1e3a8a",
                                "height": "sm",
                                "action": {
                                    "type": "uri",
                                    "label": "\U0001F511 เข้าสู่ระบบ / สมัครสมาชิก",
                                    "uri": _login_url,
                                },
                            },
                            {
                                "type": "text",
                                "text": "สมัครผ่าน LINE Login · รอ IT อนุมัติ 1 ครั้ง",
                                "size": "xs",
                                "color": "#94a3b8",
                                "align": "center",
                                "margin": "sm",
                            },
                        ],
                    },
                },
            }
            await _push_to_uid(user_id, [_flex])
    else:
        _db = get_db()
        _doc = await _db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
        _wmsg = conf.get("welcomeMessage") or (_doc.get("lineWelcomeMessage", "") if _doc else "")
        if _wmsg and reply_token:
            await _send_reply(reply_token, _wmsg, access_token)


async def _handle_unfollow(event: dict) -> None:
    """unfollow event -> ตั้ง status = inactive"""
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
    - join -> บันทึก groupId
    - follow -> สร้าง/อัปเดต Customer + welcome message
    - unfollow -> ตั้ง Customer status = inactive
    """
    body = await request.body()
    x_sig = request.headers.get("x-line-signature", "")

    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    if not doc:
        return Response(status_code=200)

    # ── รองรับ config_id = "main" -> ใช้ mainLineOa ──
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

        elif event_type == "postback":
            pb_data = event.get("postback", {}).get("data", "")
            uid = source.get("userId", "")
            rt  = event.get("replyToken", "")
            tok = conf.get("token", "")
            await _handle_postback(postback_data=pb_data, user_id=uid, reply_token=rt, access_token=tok)

        elif event_type == "message":
            msg = event.get("message", {})
            if msg.get("type") == "text":
                text = msg.get("text", "").strip()
                uid = source.get("userId", "")
                rt  = event.get("replyToken", "")
                tok = conf.get("token", "")
                # คำสั่งพิเศษ: รายการ / อนุมัติทั้งหมด
                handled = await _handle_pending_list(text=text, user_id=uid, reply_token=rt, access_token=tok)
                if handled:
                    continue
                handled = await _handle_approve_all(text=text, user_id=uid, reply_token=rt, access_token=tok)
                if handled:
                    continue
                # Y/N อนุมัติสมาชิกใหม่
                handled = await _handle_user_approval_reply(text=text, user_id=uid, reply_token=rt, access_token=tok)
                if handled:
                    continue
                # Y/N อนุมัติค่าใช้จ่าย
                await _handle_approval_reply(text=text, user_id=uid, reply_token=rt, access_token=tok)

    # อัปเดต targetId ใน config
    if updated_target_id != conf.get("targetId", ""):
        if config_id == "main":
            await db.system_settings.update_one(
                {"_id": SETTINGS_DOC_ID},
                {"$set": {"mainLineOa.targetId": updated_target_id, "webhookUpdatedAt": datetime.now()}},
            )
        else:
            configs: list = doc.get("lineOaConfigs", [])
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

    import os
    public_url = os.environ.get("PUBLIC_URL", "").rstrip("/")
    if not public_url:
        # fallback: ใช้ request.base_url แต่บังคับ https
        base = str(request.base_url).rstrip("/").replace("http://", "https://")
    else:
        base = public_url
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




async def _handle_pending_list(text: str, user_id: str, reply_token: str, access_token: str) -> bool:
    if text.strip() not in ("รายการ", "list", "pending"):
        return False
    db = get_db()
    pendings = await db.line_approval_pending.find({"managerLineUid": user_id}).to_list(11)
    count = len(pendings)
    if count == 0:
        await _send_reply(reply_token, "ไม่มีรายการรออนุมัติขณะนี้", access_token)
        return True
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    tok = (doc or {}).get("mainLineOa", {}).get("token", access_token)
    # สร้าง bubble แต่ละรายการ
    bubbles = []
    for p in pendings:
        draft = await db.expense_drafts.find_one({"_id": p.get("draftId", "")})
        if not draft:
            continue
        recorder = draft.get("recorderName") or draft.get("recorder", "")
        category = draft.get("category", "")
        date_str = draft.get("date", "")
        total = draft.get("total", 0)
        draft_id = p.get("draftId", "")
        item_count = len(draft.get("lineItems") or draft.get("rows") or [])
        item_label = f"{item_count} รายการ" if item_count > 1 else ""
        bubble = {
            "type": "bubble",
            "header": {
                "type": "box", "layout": "vertical", "backgroundColor": "#1a3a6b",
                "contents": [{"type": "text", "text": "รอการอนุมัติ", "color": "#fbbf24", "weight": "bold", "size": "sm"}]
            },
            "body": {
                "type": "box", "layout": "vertical", "spacing": "sm",
                "contents": [
                    {"type": "box", "layout": "baseline", "spacing": "sm", "contents": [
                        {"type": "text", "text": "ผู้กรอก", "color": "#aaaaaa", "size": "sm", "flex": 2},
                        {"type": "text", "text": recorder, "wrap": True, "size": "sm", "flex": 4, "weight": "bold"}
                    ]},
                    {"type": "box", "layout": "baseline", "spacing": "sm", "contents": [
                        {"type": "text", "text": "หมวด", "color": "#aaaaaa", "size": "sm", "flex": 2},
                        {"type": "text", "text": category, "wrap": True, "size": "sm", "flex": 4}
                    ]},
                    {"type": "box", "layout": "baseline", "spacing": "sm", "contents": [
                        {"type": "text", "text": "วันที่", "color": "#aaaaaa", "size": "sm", "flex": 2},
                        {"type": "text", "text": date_str, "wrap": True, "size": "sm", "flex": 4}
                    ]},
                    {"type": "box", "layout": "baseline", "spacing": "sm", "contents": [
                        {"type": "text", "text": "ยอด", "color": "#aaaaaa", "size": "sm", "flex": 2},
                        {"type": "text", "text": "฿" + "{:,.0f}".format(total), "wrap": True, "size": "sm", "flex": 4, "color": "#e53e3e", "weight": "bold"}
                    ]},
                    *(
                        [{"type": "text", "text": f"({item_label})", "size": "xs", "color": "#94a3b8"}]
                        if item_label else []
                    ),
                ]
            },
            "footer": {
                "type": "box", "layout": "vertical", "spacing": "sm", "paddingAll": "10px",
                "contents": [
                    {"type": "box", "layout": "horizontal", "spacing": "sm",
                     "contents": [
                         {"type": "button", "style": "primary", "color": "#22c55e", "height": "sm",
                          "action": {"type": "postback", "label": "✅ อนุมัติ", "data": "action=approve&draft_id=" + draft_id}},
                         {"type": "button", "style": "primary", "color": "#ef4444", "height": "sm",
                          "action": {"type": "postback", "label": "❌ ปฏิเสธ", "data": "action=reject&draft_id=" + draft_id}},
                     ]},
                    {"type": "button", "style": "secondary", "height": "sm",
                     "action": {"type": "postback", "label": "🔍 ดูรายละเอียด", "data": "action=detail&draft_id=" + draft_id}},
                ]
            }
        }
        bubbles.append(bubble)
    if not bubbles:
        await _send_reply(reply_token, "ไม่พบรายการ", access_token)
        return True
    # card สรุปอยู่ตำแหน่งแรก
    summary_bubble = {
        "type": "bubble",
        "body": {
            "type": "box", "layout": "vertical", "spacing": "md",
            "justifyContent": "center", "alignItems": "center",
            "contents": [
                {"type": "text", "text": chr(128221) + " " + "รายการรออนุมัติ", "weight": "bold", "color": "#1e3a8a", "size": "sm"},
                {"type": "text", "text": str(len(bubbles)) + " รายการ", "weight": "bold", "size": "xxl", "color": "#1e3a8a"},
            ]
        },
        "footer": {
            "type": "box", "layout": "vertical",
            "contents": [{
                "type": "button", "style": "primary", "color": "#1e3a8a",
                "action": {"type": "message", "label": chr(9989) + " " + "อนุมัติทั้งหมด", "text": "อนุมัติทั้งหมด"}
            }]
        }
    }
    carousel = {"type": "carousel", "contents": [summary_bubble] + bubbles}
    try:
        import httpx as _hx
        async with _hx.AsyncClient(timeout=5) as c:
            await c.post(LINE_REPLY_URL,
                headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
                json={"replyToken": reply_token, "messages": [{"type": "flex", "altText": str(count) + " รายการรออนุมัติ", "contents": carousel}]})
    except Exception as e:
        logger.warning("send flex failed: %s", e)
    return True


async def _handle_approve_all(text: str, user_id: str, reply_token: str, access_token: str) -> bool:
    if text.strip() != "อนุมัติทั้งหมด":
        return False
    db = get_db()
    pending = await db.line_approval_pending.find_one({"managerLineUid": user_id})
    manager_username = pending.get("managerUsername", "") if pending else ""
    if not manager_username:
        manager = await db.users.find_one({"lineUid": user_id})
        manager_username = manager.get("username", "") if manager else ""
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    tok = (doc or {}).get("mainLineOa", {}).get("token", access_token)
    # query pending drafts โดยตรง ไม่ผ่าน line_approval_pending
    pending_drafts = await db.expense_drafts.find({"status": "pending"}).to_list(50)
    if not pending_drafts:
        await _send_reply(reply_token, "ไม่มีรายการรออนุมัติแล้ว", access_token)
        return True
    from ..services.expense_service import approve_draft
    approved = 0
    manager = await db.users.find_one({"lineUid": user_id})
    if not manager_username:
        manager_username = manager.get("username", "") if manager else ""
    for draft in pending_drafts:
        draft_id = draft["_id"]
        try:
            await approve_draft(draft_id, {"sub": manager_username})
            approved += 1
            recorder_uid = draft.get("recorderLineId", "")
            if recorder_uid:
                from ..services.line_notify_service import _fmt_draft_items
                cat = draft.get("category", "")
                total = draft.get("total", 0)
                items_text = _fmt_draft_items(draft)
                msg = f"✅ รายการของคุณได้รับการอนุมัติแล้ว\nหมวด: {cat}\n{items_text}\nยอด: ฿{total:,.0f}"
                try:
                    import httpx as _hx2
                    async with _hx2.AsyncClient(timeout=5) as c2:
                        await c2.post("https://api.line.me/v2/bot/message/push",
                            headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
                            json={"to": recorder_uid, "messages": [{"type": "text", "text": msg}]})
                except Exception:
                    pass
        except Exception as e:
            logger.warning("approve all: draft %s failed: %s", draft_id, e)
    await db.line_approval_pending.delete_many({"managerLineUid": user_id})
    total_approved = sum(d.get("total", 0) for d in pending_drafts[:approved])
    msg = (
        chr(9989) + " อนุมัติเรียบร้อยแล้ว" + chr(10)
        + "────────────" + chr(10)
        + chr(128196) + " จำนวน: " + str(approved) + " รายการ" + chr(10)
        + chr(128176) + " รวมยอด: " + chr(3647) + "{:,.0f}".format(total_approved) + chr(10)
        + "────────────" + chr(10)
        + chr(128226) + " แจ้งผู้กรอกทาง LINE แล้ว"
    )
    await _send_reply(reply_token, msg, access_token)
    return True
    from ..services.expense_service import approve_draft
    approved = 0
    for draft in pending_drafts:
        draft_id = draft["_id"]
        try:
            await approve_draft(draft_id, {"sub": manager_username})
            approved += 1
            recorder_uid = draft.get("recorderLineId", "")
            if recorder_uid:
                cat = draft.get("category", "")
                total = draft.get("total", 0)
                msg = "รายการของคุณได้รับการอนุมัติแล้ว" + chr(10) + "หมวด: " + cat + " ยอด: " + chr(3647) + "{:,.0f}".format(total)
                try:
                    import httpx as _hx2
                    async with _hx2.AsyncClient(timeout=5) as c2:
                        await c2.post("https://api.line.me/v2/bot/message/push",
                            headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
                            json={"to": recorder_uid, "messages": [{"type": "text", "text": msg}]})
                except Exception:
                    pass
        except Exception as e:
            logger.warning("approve all: draft %s failed: %s", draft_id, e)
    # ล้าง line_approval_pending ที่ค้างทั้งหมดของ manager นี้
    await db.line_approval_pending.delete_many({"managerLineUid": user_id})
    total_approved = sum(d.get("total", 0) for d in pending_drafts[:approved])
    msg = (
        chr(9989) + " อนุมัติเรียบร้อยแล้ว" + chr(10)
        + "────────────" + chr(10)
        + chr(128196) + " จำนวน: " + str(approved) + " รายการ" + chr(10)
        + chr(128176) + " รวมยอด: " + chr(3647) + "{:,.0f}".format(total_approved) + chr(10)
        + "────────────" + chr(10)
        + chr(128226) + " แจ้งผู้กรอกทาง LINE แล้ว"
    )
    await _send_reply(reply_token, msg, access_token)
    return True
