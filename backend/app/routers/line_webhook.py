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


def _build_status_card(action: str, recorder_name: str, category: str,
                        date_str: str, amount: str, done_by: str) -> dict:
    """
    Flex Message แสดงสถานะหลังดำเนินการ
    action: 'approve' (สีเขียว) | 'reject' (สีแดง) | 'done_by_other' (สีเทา)
    """
    if action == "approve":
        header_color, icon, status_text = "#15803d", "✅", f"อนุมัติแล้วโดย {done_by}"
    elif action == "reject":
        header_color, icon, status_text = "#b91c1c", "❌", f"ปฏิเสธแล้วโดย {done_by}"
    else:
        header_color, icon, status_text = "#64748b", "🔒", f"ดำเนินการแล้วโดย {done_by}"

    from ..services.line_notify_service import _flex_row
    return {
        "type": "flex",
        "altText": f"{icon} {status_text} — {category} ฿{amount}",
        "contents": {
            "type": "bubble",
            "size": "kilo",
            "header": {
                "type": "box", "layout": "vertical",
                "backgroundColor": header_color, "paddingAll": "12px",
                "contents": [{"type": "text", "text": f"{icon} {status_text}",
                               "color": "#ffffff", "size": "sm", "weight": "bold"}],
            },
            "body": {
                "type": "box", "layout": "vertical",
                "paddingAll": "14px", "spacing": "sm",
                "contents": [
                    _flex_row("ผู้กรอก",     recorder_name, "#94a3b8"),
                    _flex_row("หมวด",        category,      "#94a3b8"),
                    _flex_row("วันที่",       date_str,      "#94a3b8"),
                    _flex_row("ยอด",         f"฿{amount}",  "#94a3b8"),
                ],
            },
        },
    }

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

    # ตรวจว่า user ถูกดำเนินการไปแล้วหรือยัง (admin คนอื่นอาจกดไปก่อนแล้ว)
    user = await db.users.find_one({"username": target_username})
    if not user:
        await db.line_user_approval_pending.delete_one({"_id": pending["_id"]})
        await _send_reply(reply_token, "❌ ไม่พบผู้ใช้รายนี้ในระบบ", access_token)
        return True

    if user.get("status") != "pending":
        # มีคนดำเนินการไปแล้ว
        await db.line_user_approval_pending.delete_one({"_id": pending["_id"]})
        action_by = user.get("approvedBy") or user.get("rejectedBy") or "admin อื่น"
        status_th = "อนุมัติ" if user.get("status") == "active" else "ปฏิเสธ"
        await _send_reply(
            reply_token,
            f"ℹ️ รายการนี้ถูก{status_th}ไปแล้ว\nดำเนินการโดย: {action_by}",
            access_token
        )
        return True

    name  = user.get("name", target_username)
    phone = user.get("phone", "")

    from datetime import datetime as _dt
    now_str = _dt.now().isoformat()

    # ลบ pending ของ admin นี้ก่อน
    await db.line_user_approval_pending.delete_one({"_id": pending["_id"]})

    if normalized in ("Y", "YES", "ใช่"):
        # ใช้ update_user() เพื่อ generate EMP username อัตโนมัติและส่งแจ้งเตือนในที่เดียว
        from ..services.auth_service import update_user
        result = await update_user(target_username, {
            "status": "active",
            "approvedBy": admin_username,
            "approvedAt": now_str,
        })
        # หา EMP username ที่สร้างใหม่
        new_username = result.get("newUsername", target_username)
        await _send_reply(
            reply_token,
            f"✅ อนุมัติสมาชิกแล้ว\nชื่อ: {name}\nUsername: {new_username}\nเบอร์: {phone}",
            access_token
        )
        # แจ้ง admin คนอื่นที่ยังรออยู่
        await _notify_other_admins_member_handled(
            target_username, name, admin_username, "อนุมัติ"
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
        # แจ้ง admin คนอื่นที่ยังรออยู่
        await _notify_other_admins_member_handled(
            target_username, name, admin_username, "ปฏิเสธ"
        )

    return True


async def _notify_other_admins_member_handled(
    target_username: str, name: str, handled_by: str, action: str
) -> None:
    """แจ้ง admin คนอื่นที่ยังมี pending record อยู่ว่ามีคนดำเนินการไปแล้ว"""
    db = get_db()
    remaining = await db.line_user_approval_pending.find(
        {"targetUsername": target_username}
    ).to_list(20)

    if not remaining:
        return

    from ..services.line_notify_service import _push_to_uid
    icon = "✅" if action == "อนุมัติ" else "❌"
    msg = (
        f"{icon} {action}สมาชิกแล้ว\n"
        f"ชื่อ: {name}\n"
        f"Username: {target_username}\n"
        f"ดำเนินการโดย: {handled_by}"
    )
    for rec in remaining:
        uid = rec.get("adminLineUid", "")
        if uid:
            await _push_to_uid(uid, [{"type": "text", "text": msg}])

    # ลบ pending ทั้งหมดของ user นี้
    await db.line_user_approval_pending.delete_many({"targetUsername": target_username})


async def _handle_approval_reply(text: str, user_id: str, reply_token: str, access_token: str,
                                  draft_id_override: str = "") -> bool:
    """
    ตรวจสอบว่า manager ตอบ Y/Yes/N/No เพื่ออนุมัติ/ปฏิเสธรายการค่าใช้จ่าย
    - draft_id_override: ถ้ามาจาก postback จะส่ง draft_id มาตรงๆ (ถูกต้อง 100%)
    - ถ้าไม่มี draft_id_override จะ fallback หา pending ล่าสุด (เข้ากันได้กับ Y/N แบบเดิม)
    คืน True ถ้าจัดการแล้ว, False ถ้าไม่ใช่คำตอบ approval
    """
    normalized = text.strip().upper()
    if normalized not in ("Y", "YES", "N", "NO", "ใช่", "ไม่"):
        return False

    db = get_db()

    if draft_id_override:
        # มาจาก postback — รู้ draft_id ชัดเจน
        pending = await db.line_approval_pending.find_one(
            {"managerLineUid": user_id, "draftId": draft_id_override}
        )
        if not pending:
            # อาจถูกดำเนินการไปแล้ว
            await _send_reply(reply_token, "❌ รายการนี้ดำเนินการไปแล้ว หรือหมดอายุ", access_token)
            return True
    else:
        # fallback: Y/N แบบพิมพ์ — หา pending ล่าสุด
        pending = await db.line_approval_pending.find_one(
            {"managerLineUid": user_id},
            sort=[("createdAt", -1)]
        )
        if not pending:
            return False

    draft_id = pending["draftId"]
    manager_username = pending.get("managerUsername", "")

    # ดึงชื่อจริงของ manager
    _mgr_user = await db.users.find_one({"username": manager_username}, {"name": 1, "firstName": 1, "_id": 0})
    manager_display = (
        (_mgr_user.get("name") or _mgr_user.get("firstName") or manager_username)
        if _mgr_user else manager_username
    )

    # ลบ pending state ของ manager คนนี้ออก
    await db.line_approval_pending.delete_one({"_id": pending["_id"]})

    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    now = _dt.now(_tz.utc)

    if normalized in ("Y", "YES", "ใช่"):
        # ── อนุมัติ — Atomic claim ป้องกัน manager หลายคนกดพร้อมกัน ──────────
        draft = await db.expense_drafts.find_one_and_update(
            {"_id": draft_id, "status": "pending"},
            {"$set": {"status": "approved", "reviewedBy": manager_display,
                      "reviewedAt": now.isoformat()}},
        )
        if not draft:
            await _send_reply(reply_token, "❌ ไม่พบรายการ หรือรายการนี้ดำเนินการไปแล้ว", access_token)
            return True

        recorder_name = draft.get("recorderName", draft.get("recorder", ""))
        category = draft.get("category", "")
        date_str = draft.get("date", "")
        total = float(draft.get("total", 0))

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
                "approverName": manager_display,
                "approvedAt": now.isoformat(),
                "draftId": draft_id,
                "createdAt": now.isoformat(),
            }
            await db.expenses.insert_one(doc)
            expense_ids.append(doc["_id"])

        await db.expense_drafts.update_one(
            {"_id": draft_id},
            {"$set": {"approvedExpenseIds": expense_ids}}
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
            msg = f"✅ รายการของคุณได้รับการอนุมัติแล้ว\nหมวด: {category}\nวันที่: {date_str}\nยอด: ฿{total:,.0f}"
            if recorder_user.get("lineUid"):
                from ..services.line_notify_service import _push_to_uid
                await _push_to_uid(recorder_user["lineUid"], [{"type": "text", "text": msg}])
            elif recorder_user.get("lineNotifyToken"):
                from ..services.line_notify_service import _notify_personal
                await _notify_personal(recorder_user["lineNotifyToken"], f"\n{msg}")

        # แจ้งกลุ่ม LINE OA + ผู้มีสิทธิ์ในหมวดนั้น
        try:
            from ..services.line_notify_service import notify_expense_approved
            # ใช้ expense doc แรกที่ insert (หรือ draft เป็น proxy)
            expense_proxy = {
                "catKey":      draft.get("catKey", ""),
                "category":    category,
                "amount":      total,
                "detail":      draft.get("detail", ""),
                "date":        date_str,
                "date_iso":    draft.get("date_iso", ""),
                "recorderName": recorder_name,
                "recorder":    draft["recorder"],
            }
            await notify_expense_approved(expense_proxy, approver_username=manager_display)
        except Exception as _e:
            logger.warning("notify_expense_approved failed: %s", _e)

        # ── ส่ง status card ให้ตัวเองและ manager คนอื่น ──────────────────────
        from ..services.line_notify_service import _push_to_uid, _fmt as _lfmt
        amount_str = _lfmt(total)
        my_card    = _build_status_card("approve", recorder_name, category, date_str, amount_str, "คุณ")
        other_card = _build_status_card("done_by_other", recorder_name, category, date_str, amount_str, manager_display)

        await _push_to_uid(user_id, [my_card])

        # แจ้ง manager คนอื่นที่ยังมี pending อยู่ แล้วลบ pending ทิ้ง
        other_pendings = await db.line_approval_pending.find(
            {"draftId": draft_id, "managerLineUid": {"$ne": user_id}}
        ).to_list(20)
        for op in other_pendings:
            await _push_to_uid(op["managerLineUid"], [other_card])
        await db.line_approval_pending.delete_many({"draftId": draft_id})

    else:
        # ── ปฏิเสธ — Atomic claim ─────────────────────────────────────────────
        draft = await db.expense_drafts.find_one_and_update(
            {"_id": draft_id, "status": "pending"},
            {"$set": {"status": "rejected", "reviewedBy": manager_display,
                      "reviewedAt": now.isoformat(), "rejectReason": "ปฏิเสธผ่าน LINE"}},
        )
        if not draft:
            await _send_reply(reply_token, "❌ ไม่พบรายการ หรือรายการนี้ดำเนินการไปแล้ว", access_token)
            return True

        recorder_name = draft.get("recorderName", draft.get("recorder", ""))
        category = draft.get("category", "")
        date_str = draft.get("date", "")
        total = float(draft.get("total", 0))

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
            msg = f"❌ รายการของคุณไม่ผ่านการอนุมัติ\nหมวด: {category}\nวันที่: {date_str}\nยอด: ฿{total:,.0f}"
            if recorder_user.get("lineUid"):
                from ..services.line_notify_service import _push_to_uid
                await _push_to_uid(recorder_user["lineUid"], [{"type": "text", "text": msg}])
            elif recorder_user.get("lineNotifyToken"):
                from ..services.line_notify_service import _notify_personal
                await _notify_personal(recorder_user["lineNotifyToken"], f"\n{msg}")

        # ── ส่ง status card ให้ตัวเองและ manager คนอื่น ──────────────────────
        from ..services.line_notify_service import _push_to_uid, _fmt as _lfmt
        amount_str = _lfmt(total)
        my_card    = _build_status_card("reject", recorder_name, category, date_str, amount_str, "คุณ")
        other_card = _build_status_card("done_by_other", recorder_name, category, date_str, amount_str, manager_display)

        await _push_to_uid(user_id, [my_card])

        other_pendings = await db.line_approval_pending.find(
            {"draftId": draft_id, "managerLineUid": {"$ne": user_id}}
        ).to_list(20)
        for op in other_pendings:
            await _push_to_uid(op["managerLineUid"], [other_card])
        await db.line_approval_pending.delete_many({"draftId": draft_id})

    return True



async def _handle_view_pending(user_id: str, reply_token: str, access_token: str) -> None:
    """
    แสดง carousel รายการรออนุมัติทั้งหมดที่ manager คนนี้มีสิทธิ์เห็น
    (คือ draft ที่มี line_approval_pending ของ user_id นี้อยู่)
    """
    db = get_db()

    # หา draft_id ทั้งหมดที่ manager คนนี้ยังมี pending อยู่
    pendings = await db.line_approval_pending.find(
        {"managerLineUid": user_id}
    ).to_list(20)

    if not pendings:
        from ..services.line_notify_service import _push_to_uid
        await _push_to_uid(user_id, [{"type": "text", "text": "✅ ไม่มีรายการรออนุมัติในขณะนี้"}])
        return

    draft_ids = list({p["draftId"] for p in pendings})

    drafts = await db.expense_drafts.find(
        {"_id": {"$in": draft_ids}, "status": "pending"}
    ).sort("createdAt", 1).to_list(10)

    if not drafts:
        from ..services.line_notify_service import _push_to_uid
        await _push_to_uid(user_id, [{"type": "text", "text": "✅ ไม่มีรายการรออนุมัติในขณะนี้"}])
        return

    from ..services.line_notify_service import _push_to_uid, _build_pending_carousel
    carousel = _build_pending_carousel(drafts)
    await _push_to_uid(user_id, [carousel])


async def _handle_approve_all(user_id: str, reply_token: str, access_token: str) -> None:
    """
    อนุมัติรายการรออนุมัติทั้งหมดที่ manager คนนี้มีสิทธิ์ (atomic ทีละรายการ)
    """
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    db = get_db()

    # หา manager username + ชื่อจริงจาก user_id
    manager_user = await db.users.find_one({"lineUid": user_id}, {"username": 1, "name": 1, "firstName": 1, "_id": 0})
    manager_username = manager_user["username"] if manager_user else user_id
    manager_display  = (
        (manager_user.get("name") or manager_user.get("firstName") or manager_username)
        if manager_user else manager_username
    )

    # หา draft_id ทั้งหมดที่ manager คนนี้มี pending
    pendings = await db.line_approval_pending.find(
        {"managerLineUid": user_id}
    ).to_list(50)

    if not pendings:
        from ..services.line_notify_service import _push_to_uid
        await _push_to_uid(user_id, [{"type": "text", "text": "✅ ไม่มีรายการรออนุมัติในขณะนี้"}])
        return

    draft_ids = list({p["draftId"] for p in pendings})

    approved_count = 0
    skipped_count  = 0
    now = _dt.now(_tz.utc)

    from ..services.line_notify_service import _push_to_uid, _fmt as _lfmt
    from ..services.expense_service import calc_expense_total

    for draft_id in draft_ids:
        # Atomic claim — ป้องกัน double-approve
        draft = await db.expense_drafts.find_one_and_update(
            {"_id": draft_id, "status": "pending"},
            {"$set": {"status": "approved", "reviewedBy": manager_display,
                      "reviewedAt": now.isoformat()}},
        )
        if not draft:
            skipped_count += 1
            continue

        category     = draft.get("category", "")
        date_str     = draft.get("date", "")
        recorder_name = draft.get("recorderName", draft.get("recorder", ""))
        total        = float(draft.get("total", 0))

        # บันทึก expense rows
        expense_ids = []
        for row in draft.get("rows", []):
            row_total, detail, note = calc_expense_total(category, row)
            if row_total <= 0 and not detail:
                continue
            doc = {
                "_id":           str(_uuid.uuid4()),
                "date":          draft["date"],
                "date_iso":      draft.get("date_iso", ""),
                "category":      category,
                "catKey":        draft.get("catKey", ""),
                "amount":        row_total,
                "recorder":      draft["recorder"],
                "recorderName":  recorder_name,
                "recorderLineId": draft.get("recorderLineId", ""),
                "detail":        detail,
                "note":          note,
                "rows":          [row],
                "approvedBy":    manager_username,
                "approverName":  manager_display,
                "approvedAt":    now.isoformat(),
                "draftId":       draft_id,
                "createdAt":     now.isoformat(),
            }
            await db.expenses.insert_one(doc)
            expense_ids.append(doc["_id"])

        await db.expense_drafts.update_one(
            {"_id": draft_id},
            {"$set": {"approvedExpenseIds": expense_ids}}
        )

        # แจ้ง recorder ใน app
        await db.notifications.insert_one({
            "id":               str(_uuid.uuid4()),
            "recipientUsername": draft["recorder"],
            "senderUsername":   manager_username,
            "type":             "expense_approved",
            "title":            "✅ รายการได้รับการอนุมัติ",
            "body":             f"อนุมัติรายการ{category} วันที่ {date_str} ยอด ฿{total:,.0f} แล้ว",
            "read":             False,
            "createdAt":        now,
            "data":             {"draftId": draft_id},
        })

        # แจ้ง recorder ผ่าน LINE
        recorder_user = await db.users.find_one(
            {"username": draft["recorder"]}, {"lineUid": 1, "lineNotifyToken": 1, "_id": 0}
        )
        if recorder_user:
            msg = (f"✅ รายการของคุณได้รับการอนุมัติแล้ว\n"
                   f"หมวด: {category}\nวันที่: {date_str}\nยอด: ฿{total:,.0f}")
            if recorder_user.get("lineUid"):
                await _push_to_uid(recorder_user["lineUid"], [{"type": "text", "text": msg}])
            elif recorder_user.get("lineNotifyToken"):
                from ..services.line_notify_service import _notify_personal
                await _notify_personal(recorder_user["lineNotifyToken"], f"\n{msg}")

        # แจ้งกลุ่ม LINE OA
        try:
            from ..services.line_notify_service import notify_expense_approved
            expense_proxy = {
                "catKey":       draft.get("catKey", ""),
                "category":     category,
                "amount":       total,
                "detail":       draft.get("detail", ""),
                "date":         date_str,
                "date_iso":     draft.get("date_iso", ""),
                "recorderName": recorder_name,
                "recorder":     draft["recorder"],
            }
            await notify_expense_approved(expense_proxy, approver_username=manager_display)
        except Exception as _e:
            logger.warning("notify_expense_approved failed (approve_all): %s", _e)

        # ส่ง status card ให้ manager คนอื่น
        amount_str  = _lfmt(total)
        other_card  = _build_status_card("done_by_other", recorder_name, category, date_str, amount_str, manager_display)
        other_pendings = await db.line_approval_pending.find(
            {"draftId": draft_id, "managerLineUid": {"$ne": user_id}}
        ).to_list(20)
        for op in other_pendings:
            await _push_to_uid(op["managerLineUid"], [other_card])

        # ลบ pending ทั้งหมดของ draft นี้
        await db.line_approval_pending.delete_many({"draftId": draft_id})
        approved_count += 1

    # สรุปผลให้ manager ที่กด
    summary = (
        f"✅ อนุมัติทั้งหมดเรียบร้อย\n"
        f"อนุมัติแล้ว: {approved_count} รายการ"
    )
    if skipped_count:
        summary += f"\nข้ามไป (ดำเนินการแล้ว): {skipped_count} รายการ"

    await _push_to_uid(user_id, [{"type": "text", "text": summary}])


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
            # ส่งข้อความแจ้ง Group ID ในกลุ่มทันที
            rt  = event.get("replyToken", "")
            tok = conf.get("token", "")
            if rt and tok:
                await _send_reply(rt, (
                    f"👋 สวัสดีครับ! PlaNeat OA ได้เข้ากลุ่มนี้แล้ว\n\n"
                    f"📋 Group ID ของกลุ่มนี้คือ:\n"
                    f"{updated_target_id}\n\n"
                    f"กรุณาแจ้ง IT นำ Group ID นี้ไปตั้งค่าในระบบ PlaNeat\n"
                    f"(หน้า Integration → ตั้งค่าระบบควบคุมโมดูล)"
                ), tok)

        elif event_type == "message" and source_type == "group":
            group_id = source.get("groupId", "")
            user_id  = source.get("userId", "")
            msg_text = event.get("message", {}).get("text", "")
            rt       = event.get("replyToken", "")
            tok      = conf.get("token", "")
            logger.info("LINE group message: groupId=%s userId=%s text=%s", group_id, user_id, msg_text[:30])

            # ถ้ากลุ่มนี้ยังไม่ได้บันทึก Group ID → แจ้ง Group ID อีกครั้ง
            if group_id and not conf.get("targetId") and rt and tok:
                await _send_reply(rt, (
                    f"📋 Group ID ของกลุ่มนี้คือ:\n"
                    f"{group_id}\n\n"
                    f"กรุณาแจ้ง IT นำ Group ID นี้ไปตั้งค่าในระบบ PlaNeat\n"
                    f"(หน้า Integration → ตั้งค่าระบบควบคุมโมดูล)"
                ), tok)

            # Y/N approval จากกลุ่ม (ถ้ามี)
            if msg_text and user_id:
                handled = await _handle_user_approval_reply(text=msg_text, user_id=user_id, reply_token=rt, access_token=tok)
                if not handled:
                    await _handle_approval_reply(text=msg_text, user_id=user_id, reply_token=rt, access_token=tok)

        elif event_type == "follow" and source_type == "user":
            # อัปเดต targetId ถ้ายังไม่มี
            if not updated_target_id:
                updated_target_id = source.get("userId", updated_target_id)
            # สร้าง/อัปเดต Customer
            await _handle_follow(event, conf)

        elif event_type == "unfollow" and source_type == "user":
            await _handle_unfollow(event)

        elif event_type == "postback":
            postback_data = event.get("postback", {}).get("data", "")
            uid = source.get("userId", "")
            rt  = event.get("replyToken", "")
            tok = conf.get("token", "")
            if postback_data and uid:
                from urllib.parse import parse_qs
                params   = parse_qs(postback_data)
                action   = params.get("action", [""])[0]
                draft_id = params.get("draft_id", [""])[0]

                if action == "approve" and draft_id:
                    await _handle_approval_reply(text="Y", user_id=uid, reply_token=rt,
                                                 access_token=tok, draft_id_override=draft_id)
                elif action == "reject" and draft_id:
                    await _handle_approval_reply(text="N", user_id=uid, reply_token=rt,
                                                 access_token=tok, draft_id_override=draft_id)
                elif action == "approve_all":
                    await _handle_approve_all(user_id=uid, reply_token=rt, access_token=tok)
                elif action == "view_pending":
                    await _handle_view_pending(user_id=uid, reply_token=rt, access_token=tok)

        elif event_type == "message":
            msg = event.get("message", {})
            if msg.get("type") == "text":
                text = msg.get("text", "").strip()
                uid = source.get("userId", "")
                rt  = event.get("replyToken", "")
                tok = conf.get("token", "")
                # 1. ตรวจ Y/N อนุมัติสมาชิกใหม่ก่อน
                handled = await _handle_user_approval_reply(text=text, user_id=uid, reply_token=rt, access_token=tok)
                if handled:
                    continue
                # 2. keyword "รายการ" → แสดงรายการรออนุมัติ
                if text in ("รายการ", "ดูรายการ", "pending", "list"):
                    await _handle_view_pending(user_id=uid, reply_token=rt, access_token=tok)
                    continue
                # 3. ตรวจ Y/N อนุมัติค่าใช้จ่าย (fallback ไม่มี draft_id)
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
