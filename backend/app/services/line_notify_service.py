"""
line_notify_service.py — ส่ง LINE แจ้งเตือนตาม event และ role

กฎ:
- กลุ่ม: LINE OA Messaging API (push) ผ่าน lineOaConfigs (mode=send/both)
- ส่วนตัว: LINE Notify API ใช้ lineNotifyToken จาก profile ของผู้ใช้
- ส่วนตัวผ่าน OA: push ไปที่ lineUid ของ user โดยตรง (ต้อง add OA ก่อน)
"""
import os
import httpx
from datetime import datetime, timedelta
import calendar
from ..database import get_db

FRONTEND_URL = os.environ.get("PUBLIC_URL", "http://localhost:3001").rstrip("/")


def _fmt(n: float) -> str:
    return f"{n:,.2f}"


def _build_recorder_flex(draft: dict, mode: str, approver_name: str = "", reject_reason: str = "",
                          monthly_budget: float = 0.0, spent_month: float = 0.0) -> dict:
    """
    สร้าง Flex card แจ้งผู้กรอก
    mode: 'submitted' | 'approved' | 'rejected'
    """
    cat      = draft.get("category", "")
    date_str = draft.get("date", "")
    total    = float(draft.get("total", draft.get("amount", 0)))
    items    = draft.get("lineItems", [])

    if mode == "submitted":
        header_bg   = "#1e3a8a"
        header_text = "📋 ส่งรายการสำเร็จ"
        header_color = "#93c5fd"
        footer_items = [{"type": "text", "text": "รอการอนุมัติจากผู้จัดการ",
                         "size": "xs", "color": "#94a3b8", "align": "center"}]
    elif mode == "approved":
        header_bg   = "#15803d"
        header_text = "✅ รายการได้รับการอนุมัติแล้ว"
        header_color = "#bbf7d0"
        _draft_id   = str(draft.get("_id", ""))
        pdf_url     = f"{FRONTEND_URL}/api/reports/draft-receipt/{_draft_id}"
        footer_items = [
            {"type": "button", "style": "primary", "color": "#15803d", "height": "sm",
             "action": {"type": "uri", "label": "📄 ดาวน์โหลดเอกสาร", "uri": pdf_url}},
        ]
    else:  # rejected
        header_bg   = "#b91c1c"
        header_text = "❌ รายการไม่ผ่านการอนุมัติ"
        header_color = "#fecaca"
        footer_items = [{"type": "text", "text": "กรุณาติดต่อผู้จัดการเพื่อสอบถาม",
                         "size": "xs", "color": "#94a3b8", "align": "center"}]

    # ── body ─────────────────────────────────────────────────────────────────
    body = [
        _flex_row("หมวด",  cat,      "#1e293b", bold=True),
        _flex_row("วันที่", date_str, "#475569"),
    ]
    if mode == "approved" and approver_name:
        body.append(_flex_row("อนุมัติโดย", approver_name, "#15803d"))
    # แสดง label ถ้าเป็นรายการย้อนหลัง (date_iso คนละเดือนกับปัจจุบัน)
    if mode == "approved":
        from datetime import datetime as _dt
        _iso = draft.get("date_iso", "") or draft.get("date", "")
        try:
            _exp_m = _dt.fromisoformat(_iso[:10]).strftime("%Y-%m")
        except Exception:
            _exp_m = ""
        if _exp_m and _exp_m != _dt.now().strftime("%Y-%m"):
            body.append(_flex_row("หมายเหตุ", "⏪ รายการย้อนหลัง", "#d97706"))
    if mode == "rejected" and reject_reason:
        body.append(_flex_row("เหตุผล", reject_reason, "#b91c1c"))

    # รายการ table
    body.append({"type": "separator", "margin": "sm"})
    body.append({
        "type": "box", "layout": "horizontal", "margin": "xs",
        "contents": [
            {"type": "text", "text": "รายการ", "size": "xs", "color": "#94a3b8", "flex": 7},
            {"type": "text", "text": "ยอด",    "size": "xs", "color": "#94a3b8", "flex": 3, "align": "end"},
        ],
    })
    if items:
        for item in items:
            body.append({
                "type": "box", "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": f"• {item['detail']}", "size": "xs", "color": "#334155", "flex": 7, "wrap": True},
                    {"type": "text", "text": f"฿{_fmt(item['amount'])}", "size": "xs", "color": "#1e293b", "flex": 3, "align": "end"},
                ],
            })
    else:
        detail = (draft.get("detail", "") or "-")[:60]
        body.append({
            "type": "box", "layout": "horizontal",
            "contents": [
                {"type": "text", "text": f"• {detail}", "size": "xs", "color": "#334155", "flex": 7, "wrap": True},
                {"type": "text", "text": f"฿{_fmt(total)}", "size": "xs", "color": "#1e293b", "flex": 3, "align": "end"},
            ],
        })
    body.append({"type": "separator", "margin": "sm"})
    total_color = "#15803d" if mode == "approved" else ("#b91c1c" if mode == "rejected" else "#1e3a8a")
    body.append(_flex_row("รวมทั้งหมด", f"฿{_fmt(total)}", total_color, bold=True))

    if mode == "approved" and monthly_budget > 0:
        after_remain = monthly_budget - spent_month
        after_color = "#16a34a" if after_remain >= 0 else "#dc2626"
        after_label = f"฿{_fmt(after_remain)}" if after_remain >= 0 else f"-฿{_fmt(abs(after_remain))}"
        body += [
            {"type": "separator", "margin": "sm"},
            _flex_row("งบเดือนนี้",  f"฿{_fmt(monthly_budget)}", "#64748b"),
            _flex_row("รวมหลังใช้",  f"฿{_fmt(spent_month)}",   "#475569"),
            _flex_row("คงเหลือ",     after_label,                after_color, bold=True),
        ]

    alt_prefix = {"submitted": "📋 ส่งรายการสำเร็จ", "approved": "✅ อนุมัติแล้ว", "rejected": "❌ ไม่ผ่านอนุมัติ"}
    return {
        "type": "flex",
        "altText": f"{alt_prefix[mode]} — {cat} ฿{_fmt(total)}",
        "contents": {
            "type": "bubble", "size": "giga",
            "header": {
                "type": "box", "layout": "vertical",
                "backgroundColor": header_bg, "paddingAll": "14px",
                "contents": [{"type": "text", "text": header_text,
                               "color": header_color, "size": "sm", "weight": "bold"}],
            },
            "body": {"type": "box", "layout": "vertical", "paddingAll": "14px", "spacing": "sm", "contents": body},
            "footer": {"type": "box", "layout": "vertical", "paddingAll": "10px",
                       "spacing": "sm", "contents": footer_items},
        },
    }


def _fmt_draft_items(draft: dict) -> str:
    """แปลง lineItems เป็น string หลายบรรทัดสำหรับ text message"""
    items = draft.get("lineItems", [])
    if len(items) > 1:
        lines = [f"  {i+1}. {item['detail']} — ฿{_fmt(item['amount'])}" for i, item in enumerate(items)]
        return "รายการ:\n" + "\n".join(lines)
    d = (items[0].get("detail", "") if items else None) or draft.get("detail", "")
    return f"รายละเอียด: {d or '-'}"


def _now_thai() -> str:
    now = datetime.now()
    return now.strftime("%d/%m/") + str(now.year + 543) + now.strftime(" %H:%M น.")


# ─── ส่ง push message ────────────────────────────────────────────────────────

async def _push(token: str, to: str, messages: list) -> bool:
    """Push message ผ่าน LINE Messaging API"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.line.me/v2/bot/message/push",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"to": to, "messages": messages},
            )
            if r.status_code != 200:
                print(f"[LINE] push failed {r.status_code}: {r.text[:200]}")
            return r.status_code == 200
    except Exception as e:
        print(f"[LINE] push exception: {e}")
        return False


async def _get_send_configs() -> list:
    """ดึง LINE OA configs ที่มี mode send/both"""
    db = get_db()
    settings = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    return [c for c in settings.get("lineOaConfigs", []) if c.get("mode") in ("send", "both") and c.get("token")]


async def _get_users_by_role(roles: list) -> list:
    """ดึง users ตาม role ที่มี lineUid หรือ lineNotifyToken"""
    db = get_db()
    cursor = db.users.find(
        {"role": {"$in": roles}, "status": "active", "$or": [
            {"lineUid": {"$exists": True, "$ne": ""}},
            {"lineNotifyToken": {"$exists": True, "$ne": ""}},
        ]},
        {"lineUid": 1, "lineNotifyToken": 1, "username": 1, "name": 1, "firstName": 1, "_id": 0}
    )
    return await cursor.to_list(None)


def _build_approval_flex(
    recorder_name: str, cat: str, date_str: str, amount: str, detail: str,
    monthly_budget: float = 0, spent_month: float = 0, draft_id: str = "",
    row_items: list = None,
) -> dict:
    """สร้าง Flex Message Card สำหรับขออนุมัติค่าใช้จ่าย"""
    budget_rows = []
    if monthly_budget > 0:
        try:
            this_amount = float(amount.replace(",", "").replace("฿", ""))
        except Exception:
            this_amount = 0.0
        after_total   = spent_month + this_amount
        after_remain  = monthly_budget - after_total
        after_color   = "#16a34a" if after_remain >= 0 else "#dc2626"
        after_label   = f"฿{_fmt(after_remain)}" if after_remain >= 0 else f"-฿{_fmt(abs(after_remain))}"
        budget_rows = [
            {"type": "separator", "margin": "sm"},
            _flex_row("งบเดือนนี้",     f"฿{_fmt(monthly_budget)}", "#64748b"),
            _flex_row("ใช้ไปแล้ว",     f"฿{_fmt(spent_month)}",    "#475569"),
            _flex_row("+ รายการนี้",    f"฿{_fmt(this_amount)}",    "#d97706"),
            {"type": "separator", "margin": "xs"},
            _flex_row("รวมหลังอนุมัติ", f"฿{_fmt(after_total)}",    "#475569"),
            _flex_row("คงเหลือ",        after_label,                after_color, bold=True),
        ]

    # ─── body items ─────────────────────────────────────────────────────────
    body_contents = [
        _flex_row("ผู้กรอก", recorder_name, "#1e293b", bold=True),
        _flex_row("หมวด",    cat,           "#1e293b"),
        _flex_row("วันที่",   date_str,      "#475569"),
    ]

    if row_items:
        # มี row_items → แสดงเป็น table (ทั้ง 1 รายการและหลายรายการ)
        body_contents.append({"type": "separator", "margin": "sm"})
        body_contents.append({
            "type": "box", "layout": "horizontal", "margin": "xs",
            "contents": [
                {"type": "text", "text": "รายการ", "size": "xs", "color": "#94a3b8", "flex": 7},
                {"type": "text", "text": "ยอด",    "size": "xs", "color": "#94a3b8", "flex": 3, "align": "end"},
            ],
        })
        for item in row_items:
            body_contents.append({
                "type": "box", "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": f"• {item['detail']}", "size": "xs",
                     "color": "#334155", "flex": 7, "wrap": True},
                    {"type": "text", "text": f"฿{_fmt(item['amount'])}", "size": "xs",
                     "color": "#dc2626", "flex": 3, "align": "end"},
                ],
            })
        body_contents.append({"type": "separator", "margin": "sm"})
        body_contents.append(_flex_row("รวมทั้งหมด", f"฿{amount}", "#dc2626", bold=True))
    else:
        # fallback: ไม่มี lineItems (draft เก่า)
        body_contents.append(_flex_row("ยอด",        f"฿{amount}",  "#dc2626", bold=True))
        body_contents.append(_flex_row("รายละเอียด", detail or "-", "#475569"))

    body_contents += [
        *budget_rows,
        {"type": "separator", "margin": "md"},
        {"type": "text", "text": "อนุมัติรายการนี้ไหม?",
         "size": "sm", "color": "#334155", "margin": "md", "weight": "bold"},
    ]

    return {
        "type": "flex",
        "altText": f"🔔 รายการรอการอนุมัติ — {recorder_name} / {cat} / ฿{amount}",
        "contents": {
            "type": "bubble",
            "size": "giga",
            "header": {
                "type": "box",
                "layout": "vertical",
                "backgroundColor": "#1e3a8a",
                "paddingAll": "14px",
                "contents": [
                    {"type": "text", "text": "🔔 รายการรอการอนุมัติ",
                     "color": "#93c5fd", "size": "sm", "weight": "bold"}
                ],
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "paddingAll": "14px",
                "spacing": "sm",
                "contents": body_contents,
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "paddingAll": "12px",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "button",
                                "style": "primary",
                                "color": "#16a34a",
                                "height": "sm",
                                "action": {
                                    "type": "postback",
                                    "label": "✅ อนุมัติ",
                                    "data": f"action=approve&draft_id={draft_id}",
                                },
                            },
                            {
                                "type": "button",
                                "style": "primary",
                                "color": "#dc2626",
                                "height": "sm",
                                "action": {
                                    "type": "postback",
                                    "label": "❌ ปฏิเสธ",
                                    "data": f"action=reject&draft_id={draft_id}",
                                },
                            },
                        ],
                    },
                    {
                        "type": "button",
                        "style": "secondary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "📋 รายการทั้งหมดที่รอดำเนินการ",
                            "text": "รายการ",
                        },
                    },
                ],
            },
        },
    }


def _flex_row(label: str, value: str, value_color: str = "#1e293b", bold: bool = False) -> dict:
    return {
        "type": "box",
        "layout": "horizontal",
        "contents": [
            {"type": "text", "text": label or "—", "size": "sm", "color": "#94a3b8", "flex": 3},
            {"type": "text", "text": value or "—",  "size": "sm", "color": value_color,
             "flex": 7, "wrap": True, "weight": "bold" if bold else "regular"},
        ],
    }


async def _notify_personal(token: str, message: str) -> bool:
    """ส่ง LINE Notify ส่วนตัว (ง่ายกว่า Messaging API)"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://notify-api.line.me/api/notify",
                headers={"Authorization": f"Bearer {token}"},
                data={"message": message},
            )
            return r.status_code == 200
    except Exception as e:
        print(f"[LINE Notify] exception: {e}")
        return False


# ─── ส่ง push ไปหา lineUid ส่วนตัว (ผ่าน mainLineOa token) ─────────────────

async def _push_to_uid(line_uid: str, messages: list) -> bool:
    """Push message ไปยัง lineUid ส่วนตัวโดยใช้ mainLineOa token"""
    if not line_uid:
        return False
    db = get_db()
    doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    token = doc.get("mainLineOa", {}).get("token", "")
    if not token:
        return False
    return await _push(token, line_uid, messages)


# ─── Event: draft submitted (ขออนุมัติ) ─────────────────────────────────────

async def notify_new_member_to_admins(
    username: str, name: str, phone: str, line_uid: str, picture_url: str = ""
) -> None:
    """แจ้ง IT/Admin ทุกคนผ่าน LINE ส่วนตัว เมื่อมีสมาชิกใหม่รอการอนุมัติ"""
    db = get_db()
    import uuid as _uuid

    admins = await db.users.find(
        {"role": {"$in": ["it", "IT", "admin", "super_admin"]}, "status": {"$in": ["active", "approved"]}},
        {"username": 1, "lineUid": 1, "lineNotifyToken": 1, "_id": 0}
    ).to_list(20)

    flex = _build_member_approval_flex(name, username, phone, picture_url)
    plain = (
        f"🔔 สมาชิกใหม่รอการอนุมัติ\n"
        f"ชื่อ: {name}\n"
        f"Username: {username}\n"
        f"เบอร์: {phone}\n"
        f"ตอบ Y = อนุมัติ / N = ปฏิเสธ"
    )

    for admin in admins:
        admin_line_uid = admin.get("lineUid", "")
        notify_token   = admin.get("lineNotifyToken", "")
        if not admin_line_uid and not notify_token:
            continue

        if admin_line_uid:
            # บันทึก pending state สำหรับรับคำตอบ Y/N
            await db.line_user_approval_pending.insert_one({
                "_id":              str(_uuid.uuid4()),
                "adminLineUid":     admin_line_uid,
                "adminUsername":    admin.get("username", ""),
                "targetUsername":   username,
                "targetLineUid":    line_uid,
                "createdAt":        datetime.now().isoformat(),
            })
            await _push_to_uid(admin_line_uid, [flex])
        elif notify_token:
            await _notify_personal(notify_token, f"\n{plain}")


def _build_member_approval_flex(name: str, username: str, phone: str, picture_url: str = "") -> dict:
    """Flex Message Card สำหรับอนุมัติสมาชิกใหม่"""
    header_contents = [
        {"type": "text", "text": "🔔 สมาชิกใหม่รอการอนุมัติ",
         "color": "#93c5fd", "size": "sm", "weight": "bold"},
    ]
    body_contents = [
        _flex_row("ชื่อ",      name,     "#1e293b", bold=True),
        _flex_row("Username",  username, "#1e293b"),
        _flex_row("เบอร์",     phone,    "#475569"),
        _flex_row("ช่องทาง",   "LINE",   "#0ea5e9"),
    ]
    if picture_url:
        body_contents.insert(0, {
            "type": "image", "url": picture_url,
            "size": "xxs", "aspectMode": "cover",
            "aspectRatio": "1:1", "align": "center",
        })

    return {
        "type": "flex",
        "altText": f"🔔 สมาชิกใหม่รอการอนุมัติ — {name} ({username})",
        "contents": {
            "type": "bubble", "size": "kilo",
            "header": {
                "type": "box", "layout": "vertical",
                "backgroundColor": "#1e3a8a", "paddingAll": "14px",
                "contents": header_contents,
            },
            "body": {
                "type": "box", "layout": "vertical",
                "paddingAll": "14px", "spacing": "sm",
                "contents": body_contents + [
                    {"type": "separator", "margin": "md"},
                    {"type": "text", "text": "อนุมัติสมาชิกรายนี้ไหม?",
                     "size": "sm", "color": "#334155", "margin": "md", "weight": "bold"},
                ],
            },
            "footer": {
                "type": "box", "layout": "horizontal",
                "spacing": "sm", "paddingAll": "12px",
                "contents": [
                    {"type": "button", "style": "primary", "color": "#16a34a", "height": "sm",
                     "action": {"type": "message", "label": "✅ อนุมัติ", "text": "Y"}},
                    {"type": "button", "style": "primary", "color": "#dc2626", "height": "sm",
                     "action": {"type": "message", "label": "❌ ปฏิเสธ", "text": "N"}},
                ],
            },
        },
    }


async def notify_draft_submitted(draft: dict) -> None:
    """
    1. แจ้ง recorder (ผู้กรอก) ว่าส่งสำเร็จ รอการอนุมัติ
    2. แจ้ง accounting_manager ส่วนตัวผ่าน lineUid พร้อมปุ่ม Y/N
    """
    db = get_db()

    # ── เช็ค lineNotify.personal toggle ─────────────────────────────────────
    _es_doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    _ln_cfg = _es_doc.get("expenseSettings", {}).get("lineNotify", {})
    notify_personal = _ln_cfg.get("personal", True)
    if not notify_personal:
        return

    draft_id  = draft.get("_id") or draft.get("id", "")
    recorder  = draft.get("recorder", "")
    cat       = draft.get("category", "")
    amount    = _fmt(float(draft.get("total", draft.get("amount", 0))))
    detail    = (draft.get("detail", "") or "")[:50]
    date_str  = draft.get("date", "")

    # ── 1. แจ้ง recorder (ผู้กรอก) — re-query ชื่อจริงจาก DB เสมอ ──────────
    recorder_user = await db.users.find_one(
        {"username": recorder},
        {"lineUid": 1, "lineNotifyToken": 1, "name": 1, "firstName": 1, "lastName": 1, "_id": 0}
    )
    if recorder_user:
        _fn = recorder_user.get("firstName", "").strip()
        _ln = recorder_user.get("lastName", "").strip()
        recorder_name = f"{_fn} {_ln}".strip() or recorder_user.get("name", "").strip() or recorder
    else:
        recorder_name = draft.get("recorderName", recorder)
    if recorder_user:
        flex_recorder = _build_recorder_flex(draft, mode="submitted")
        if recorder_user.get("lineUid"):
            await _push_to_uid(recorder_user["lineUid"], [flex_recorder])
        elif recorder_user.get("lineNotifyToken"):
            # fallback text สำหรับ LINE Notify (ไม่รองรับ Flex)
            msg_plain = (
                f"📋 ส่งรายการสำเร็จ รอการอนุมัติ\n"
                f"หมวด: {cat} | {date_str}\nยอด: ฿{amount}\n"
                f"{_fmt_draft_items(draft)}"
            )
            await _notify_personal(recorder_user["lineNotifyToken"], f"\n{msg_plain}")

    # ── 2. แจ้ง accounting_manager ส่วนตัวผ่าน lineUid ─────────────────────
    managers = await db.users.find(
        {"role": {"$in": ["accounting_manager", "admin", "super_admin"]},
         "status": "active"},
        {"username": 1, "firstName": 1, "lastName": 1, "nickname": 1,
         "lineUid": 1, "lineNotifyToken": 1, "_id": 0}
    ).to_list(20)

    # ── คำนวณงบประมาณเดือนนี้ ────────────────────────────────────────────────
    cat_key = draft.get("catKey", "")
    now = datetime.now()
    month_str = now.strftime("%Y-%m")
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

    for mgr in managers:
        line_uid = mgr.get("lineUid", "")
        notify_token = mgr.get("lineNotifyToken", "")
        if not line_uid and not notify_token:
            continue

        if line_uid:
            # บันทึก pending approval state สำหรับรับคำตอบ Y/N
            import uuid as _uuid
            await db.line_approval_pending.insert_one({
                "_id": str(_uuid.uuid4()),
                "managerLineUid": line_uid,
                "managerUsername": mgr.get("username", ""),
                "draftId": draft_id,
                "createdAt": datetime.now().isoformat(),
            })
            flex = _build_approval_flex(
                recorder_name, cat, date_str, amount, detail or "-",
                monthly_budget=monthly_budget, spent_month=spent_month,
                draft_id=str(draft_id),
                row_items=draft.get("lineItems") or [],
            )
            await _push_to_uid(line_uid, [flex])
        elif notify_token:
            # fallback LINE Notify (ไม่รองรับ Flex)
            msg_mgr = (
                f"🔔 รายการรอการอนุมัติ\n"
                f"ผู้กรอก: {recorder_name}\n"
                f"หมวด: {cat}\n"
                f"วันที่: {date_str}\n"
                f"ยอด: ฿{amount}\n"
                f"รายละเอียด: {detail or '-'}\n"
                f"ตอบ Y = อนุมัติ / N = ไม่อนุมัติ"
            )
            await _notify_personal(notify_token, f"\n{msg_mgr}")


# ─── ดึง expense group token + groupId ───────────────────────────────────────

async def _get_module_group(module_key: str) -> tuple[str, str]:
    """คืน (token, groupId) ของโมดูลที่ระบุ — ใช้ OA ที่เลือกไว้ หรือ fallback mainLineOa"""
    db = get_db()
    doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    mc = doc.get("moduleConnections", {})
    gid = mc.get(module_key, "")
    oa_id = mc.get(f"{module_key}OaId", "")
    if oa_id:
        configs = doc.get("lineOaConfigs", [])
        selected = next((c for c in configs if c.get("id") == oa_id), None)
        if selected and selected.get("token"):
            return selected["token"], gid
    token = doc.get("mainLineOa", {}).get("token", "")
    return token, gid


async def _get_expense_group() -> tuple[str, str]:
    """คืน (token, groupId) ของกลุ่มระบบควบคุมค่าใช้จ่าย"""
    return await _get_module_group("expense")


async def _get_users_with_permission(cat_key: str) -> list:
    """ดึง users ที่มีสิทธิ์ในหมวด cat_key และ active"""
    db = get_db()
    cursor = db.users.find(
        {f"permissions.{cat_key}": True, "status": "active"},
        {"username": 1, "lineUid": 1, "lineNotifyToken": 1, "_id": 0}
    )
    return await cursor.to_list(50)


# ─── Event: draft approved (อนุมัติแล้ว) ────────────────────────────────────

async def notify_expense_approved(expense: dict, approver_username=None) -> None:
    """
    เมื่ออนุมัติค่าใช้จ่าย:
    1. ส่ง Flex Message ไปกลุ่ม LINE OA (expense control group) — ใช้ format เดียวกับ recorder card
    2. แจ้งผู้มีสิทธิ์ในหมวดนั้น (ยอดอัปเดต)
    """
    db = get_db()
    now = datetime.now()
    cat_key  = expense.get("catKey", "")
    cat      = expense.get("category", "")

    # ดึงเดือนจาก date_iso ของ expense (ป้องกันรายการย้อนหลังใช้งบผิดเดือน)
    date_iso = expense.get("date_iso", "") or expense.get("date", "")
    try:
        exp_date = datetime.fromisoformat(date_iso[:10])
    except Exception:
        exp_date = now
    exp_month_str = exp_date.strftime("%Y-%m")
    exp_my        = f"{exp_date.month:02d}/{exp_date.year}"

    # handle approver เป็น dict (JWT current user) หรือ string
    if isinstance(approver_username, dict):
        approver_uname = approver_username.get("sub") or approver_username.get("username", "")
    else:
        approver_uname = str(approver_username or "")

    # lookup ชื่อจริงของผู้อนุมัติ
    approver_real = approver_uname
    if approver_uname:
        _apr = await db.users.find_one(
            {"username": approver_uname},
            {"firstName": 1, "lastName": 1, "name": 1, "_id": 0}
        )
        if _apr:
            _fn = _apr.get("firstName", "").strip()
            _ln = _apr.get("lastName", "").strip()
            approver_real = f"{_fn} {_ln}".strip() or _apr.get("name", "").strip() or approver_uname

    # คำนวณยอดสะสม + งบ — ใช้เดือนของ expense ไม่ใช่เดือนปัจจุบัน
    agg = await db.expenses.aggregate([
        {"$match": {"date_iso": {"$regex": f"^{exp_month_str}"}, "catKey": cat_key}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(None)
    month_total     = agg[0]["total"] if agg else 0.0
    budget_doc      = await db.budgets.find_one({"monthYear": exp_my}) or {}
    monthly_budget  = float(budget_doc.get("budgets", {}).get(cat_key, {}).get("monthly", 0))

    # ─── Budget warning: แจ้งครั้งแรกที่ข้ามเส้น 80% และ 100% ──────────────
    if monthly_budget > 0:
        pct_used = month_total / monthly_budget * 100
        threshold = 100 if pct_used >= 100 else (80 if pct_used >= 80 else None)
        if threshold is not None:
            flag_month = exp_date.strftime("%m/%Y")
            existing_flag = await db.budget_warning_flags.find_one({
                "monthYear": flag_month, "catKey": cat_key, "threshold": threshold
            })
            if not existing_flag:
                try:
                    await db.budget_warning_flags.insert_one({
                        "monthYear": flag_month, "catKey": cat_key,
                        "threshold": threshold, "sentAt": now.isoformat()
                    })
                    await notify_budget_warning(cat, pct_used, month_total, monthly_budget, cat_key)
                except Exception as _bwe:
                    print(f"[LINE] notify_budget_warning failed: {_bwe}")

    # ── อ่าน settings — lineNotify.group + autoNotify.approvedCard ─────────────
    _es_doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    _es_cfg  = _es_doc.get("expenseSettings", {})
    _ln_cfg  = _es_cfg.get("lineNotify", {})
    _an_cfg  = _es_cfg.get("autoNotify", {})
    notify_group   = _ln_cfg.get("group", True)
    approved_card  = _an_cfg.get("approvedCard", True)
    all_enabled    = _an_cfg.get("allEnabled", True)
    if not all_enabled or not approved_card:
        return

    # ─── 1. ส่งไปกลุ่ม LINE OA ───────────────────────────────────────────────
    if notify_group:
        token, gid = await _get_expense_group()
        if not gid:
            # fallback: ใช้ targetId ของ mainLineOa
            _sys = await db.system_settings.find_one({"_id": "system_settings"}) or {}
            token = token or _sys.get("mainLineOa", {}).get("token", "")
            gid   = _sys.get("mainLineOa", {}).get("targetId", "")
        if token and gid:
            draft_id  = expense.get("draftId", "")
            draft_doc = await db.expense_drafts.find_one({"_id": draft_id}) if draft_id else None
            flex_src  = draft_doc if draft_doc else expense
            flex = _build_recorder_flex(
                flex_src, mode="approved",
                approver_name=approver_real,
                monthly_budget=monthly_budget,
                spent_month=month_total,
            )
            await _push(token, gid, [flex])

    # แจ้งกลุ่มเท่านั้น — ไม่ส่งส่วนตัวซ้ำ


# ─── สรุปค่าใช้จ่าย (รายวัน/สัปดาห์/เดือน) ──────────────────────────────────

async def _build_period_summary_flex(
    period_label: str,
    expenses_rows: list,   # [{"category": str, "catKey": str, "spent": float, "budget": float}]
    grand_spent: float,
    title: str = "📊 สรุปค่าใช้จ่าย",
    monthly: bool = False,
    daily: bool = False,
    pdf_url: str = "",
    col1_label: str = "วันนี้",
) -> dict:
    """สร้าง Flex Message ตารางสรุปค่าใช้จ่ายตามช่วงเวลา"""
    body_items = []

    # header row — daily ใช้หัวคอลัมน์ใหม่
    if daily:
        body_items.append({
            "type": "box", "layout": "horizontal",
            "backgroundColor": "#f1f5f9", "paddingAll": "5px", "cornerRadius": "4px",
            "contents": [
                {"type": "text", "text": "หมวด",          "size": "xs", "flex": 4, "weight": "bold", "color": "#475569"},
                {"type": "text", "text": col1_label,      "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
                {"type": "text", "text": "ใช้ไปทั้งหมด",  "size": "xs", "flex": 4, "weight": "bold", "color": "#475569", "align": "end"},
            ]
        })
    else:
        body_items.append({
            "type": "box", "layout": "horizontal",
            "backgroundColor": "#f1f5f9", "paddingAll": "5px", "cornerRadius": "4px",
            "contents": [
                {"type": "text", "text": "หมวด",     "size": "xs", "flex": 4, "weight": "bold", "color": "#475569"},
                {"type": "text", "text": "ใช้ไป",    "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
                {"type": "text", "text": "งบ/เดือน", "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
            ]
        })

    # ดึงยอดสะสมเดือน (สำหรับ daily mode คำนวณคงเหลือจาก spentMonth)
    if daily:
        db = get_db()
        now = datetime.now()
        my  = f"{now.month:02d}/{now.year}"
        budget_doc   = await db.budgets.find_one({"monthYear": my}) or {}
        budgets_cfg  = budget_doc.get("budgets", {})
        # aggregate ยอดสะสมทั้งเดือนต่อ catKey
        month_prefix = now.strftime("%Y-%m")
        agg_pipe = [
            {"$match": {"date_iso": {"$regex": f"^{month_prefix}"}}},
            {"$group": {"_id": "$catKey", "total": {"$sum": "$amount"}}},
        ]
        month_agg = await db.expenses.aggregate(agg_pipe).to_list(None)
        spent_month_map = {r["_id"]: r["total"] for r in month_agg}

    for row in expenses_rows:
        cat_key  = row["catKey"]
        cat_name = row["category"]

        if daily:
            today_spent  = row["spent"]
            month_budget = float(budgets_cfg.get(cat_key, {}).get("monthly", 0)) if daily else row["budget"]
            spent_month  = spent_month_map.get(cat_key, 0.0)
            remaining    = month_budget - spent_month
            pct_used     = spent_month / month_budget * 100 if month_budget > 0 else 0

            if pct_used > 100:
                pct_color = "#dc2626"
                pct_icon  = "🔴"
                cat_label = f"❗ {cat_name}"
            elif pct_used > 80:
                pct_color = "#d97706"
                pct_icon  = "🟡"
                cat_label = cat_name
            else:
                pct_color = "#16a34a"
                pct_icon  = "🟢"
                cat_label = cat_name

            # แถวข้อมูล 3 คอลัมน์ + กดทั้งแถวเพื่อดูเอกสาร
            doc_url         = f"{FRONTEND_URL}/expense-control?tab=history&cat={cat_key}"
            no_budget       = month_budget == 0
            today_pct       = today_spent / month_budget * 100 if month_budget > 0 else 0

            # สี today_pct
            if no_budget:     today_pct_color = "#94a3b8"
            elif today_pct > 20: today_pct_color = "#dc2626"
            elif today_pct > 10: today_pct_color = "#d97706"
            else:             today_pct_color = "#16a34a"

            budget_sub   = f"งบ ฿{_fmt(month_budget)}" if not no_budget else "ยังไม่ได้ตั้งงบ"
            budget_color = "#64748b" if not no_budget else "#94a3b8"

            body_items.append({
                "type": "box", "layout": "horizontal", "paddingAll": "4px",
                "action": {"type": "uri", "uri": doc_url},
                "contents": [
                    # คอลัมน์ 1: ชื่อหมวด + งบ/เดือน
                    {"type": "box", "layout": "vertical", "flex": 4, "contents": [
                        {"type": "text", "text": f"{pct_icon} {cat_label}", "size": "xs", "color": "#1e293b", "wrap": True, "weight": "bold"},
                        {"type": "text", "text": budget_sub, "size": "xxs", "color": budget_color},
                    ]},
                    # คอลัมน์ 2: วันนี้ + % ของงบ
                    {"type": "box", "layout": "vertical", "flex": 3, "contents": [
                        {"type": "text", "text": f"฿{_fmt(today_spent)}", "size": "xs", "align": "end", "color": today_pct_color},
                        {"type": "text", "text": f"{today_pct:.0f}% ของงบ" if not no_budget else "—", "size": "xxs", "align": "end", "color": today_pct_color},
                    ]},
                    # คอลัมน์ 3: ใช้ไปทั้งหมด + % ของงบ
                    {"type": "box", "layout": "vertical", "flex": 4, "contents": [
                        {"type": "text", "text": f"฿{_fmt(spent_month)}", "size": "xs", "align": "end", "color": pct_color},
                        {"type": "text", "text": f"{pct_used:.0f}% ของงบ" if not no_budget else "—", "size": "xxs", "align": "end", "color": pct_color},
                    ]},
                ]
            })
            body_items.append({"type": "separator"})

        else:
            pct = row["spent"] / row["budget"] * 100 if row["budget"] > 0 else 0
            icon = "🔴" if pct > 100 else ("🟡" if pct > 80 else "🟢")
            amt_color = "#dc2626" if pct > 100 else "#1e293b"

            body_items.append({
                "type": "box", "layout": "horizontal", "paddingAll": "4px",
                "contents": [
                    {"type": "text", "text": f"{icon} {cat_name}", "size": "xs", "flex": 4, "color": "#1e293b", "wrap": True},
                    {"type": "text", "text": f"฿{_fmt(row['spent'])}", "size": "xs", "flex": 3, "align": "end", "color": amt_color},
                    {"type": "text", "text": f"฿{_fmt(row['budget'])}", "size": "xs", "flex": 3, "align": "end", "color": "#64748b"},
                ]
            })

            if monthly and row["budget"] > 0:
                remaining = row["budget"] - row["spent"]
                r_color  = "#16a34a" if remaining >= 0 else "#dc2626"
                r_label  = f"คงเหลือ ฿{_fmt(remaining)}" if remaining >= 0 else f"ติดลบ -฿{_fmt(abs(remaining))}"
                body_items.append({
                    "type": "text", "text": f"   └ {r_label}", "size": "xxs", "color": r_color
                })

    body_items.append({"type": "separator", "margin": "sm"})
    body_items.append({
        "type": "box", "layout": "horizontal", "margin": "sm",
        "contents": [
            {"type": "text", "text": "รวมทั้งหมด", "size": "sm", "weight": "bold", "color": "#1e293b", "flex": 5},
            {"type": "text", "text": f"฿{_fmt(grand_spent)}", "size": "sm", "weight": "bold", "color": "#1e3a8a", "flex": 5, "align": "end"},
        ]
    })

    # footer contents
    footer_contents: list = []
    if daily:
        dl_url = pdf_url or f"{FRONTEND_URL}/expense-control?tab=history"
        footer_contents.append({
            "type": "button", "style": "primary", "margin": "sm",
            "color": "#1e3a8a",
            "action": {"type": "uri", "label": "📋 ดูรายงานวันนี้", "uri": dl_url},
        })

    return {
        "type": "flex",
        "altText": f"{title} {period_label}",
        "contents": {
            "type": "bubble", "size": "giga",
            "header": {
                "type": "box", "layout": "vertical",
                "backgroundColor": "#1e3a8a", "paddingAll": "14px",
                "contents": [
                    {"type": "text", "text": title, "color": "#93c5fd", "size": "sm", "weight": "bold"},
                    {"type": "text", "text": period_label, "color": "#ffffff", "size": "lg", "weight": "bold", "margin": "sm"},
                ],
            },
            "body": {
                "type": "box", "layout": "vertical",
                "paddingAll": "14px", "spacing": "xs",
                "contents": body_items,
            },
            "footer": {
                "type": "box", "layout": "vertical", "paddingAll": "8px", "spacing": "xs",
                "contents": footer_contents,
            },
        },
    }


async def _query_period_expenses(date_from: str, date_to: str) -> tuple[list, float]:
    """
    ดึงค่าใช้จ่ายในช่วง date_from..date_to (YYYY-MM-DD)
    คืน (rows_by_cat, grand_total)
    rows_by_cat: [{"category","catKey","spent","budget"}]
    """
    db = get_db()
    # aggregate by catKey
    pipeline = [
        {"$match": {"date_iso": {"$gte": date_from, "$lte": date_to + "T"}}},
        {"$group": {"_id": {"catKey": "$catKey", "category": "$category"}, "spent": {"$sum": "$amount"}}},
        {"$sort": {"spent": -1}},
    ]
    raw = await db.expenses.aggregate(pipeline).to_list(None)

    # ดึงงบเดือนนี้
    now = datetime.now()
    my  = f"{now.month:02d}/{now.year}"
    budget_doc = await db.budgets.find_one({"monthYear": my}) or {}
    budgets    = budget_doc.get("budgets", {})

    rows = []
    grand = 0.0
    for r in raw:
        cat_key  = r["_id"]["catKey"]
        category = r["_id"]["category"] or cat_key
        spent    = r["spent"]
        budget   = float(budgets.get(cat_key, {}).get("monthly", 0))
        rows.append({"category": category, "catKey": cat_key, "spent": spent, "budget": budget})
        grand += spent
    return rows, grand


async def _query_approved_expenses(date_from: str, date_to: str) -> tuple[list, float]:
    """ดึงค่าใช้จ่ายที่อนุมัติในช่วง date_from..date_to (YYYY-MM-DD) กลุ่มตาม catKey"""
    from datetime import timedelta
    db = get_db()
    next_day = (datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"approvedAt": {"$gte": date_from, "$lt": next_day}}},
        {"$group": {"_id": {"catKey": "$catKey", "category": "$category"}, "spent": {"$sum": "$amount"}}},
        {"$sort": {"spent": -1}},
    ]
    raw = await db.expenses.aggregate(pipeline).to_list(None)
    now = datetime.now()
    my  = f"{now.month:02d}/{now.year}"
    budget_doc = await db.budgets.find_one({"monthYear": my}) or {}
    budgets    = budget_doc.get("budgets", {})
    rows, grand = [], 0.0
    for r in raw:
        cat_key  = r["_id"]["catKey"]
        category = r["_id"]["category"] or cat_key
        spent    = r["spent"]
        budget   = float(budgets.get(cat_key, {}).get("monthly", 0))
        rows.append({"category": category, "catKey": cat_key, "spent": spent, "budget": budget})
        grand += spent
    return rows, grand


async def notify_daily_summary(year: int, month: int, day: int) -> None:
    """ส่งสรุปค่าใช้จ่ายรายวันไปกลุ่ม LINE OA — นับตามวันที่อนุมัติ"""
    token, gid = await _get_expense_group()
    if not token or not gid:
        return

    date_prefix = f"{year}-{month:02d}-{day:02d}"
    rows, grand = await _query_approved_expenses(date_prefix, date_prefix)

    if not rows:
        return

    period_label = f"วันที่ {day} {THAI_MONTHS[month]} {year+543}"
    flex = await _build_period_summary_flex(period_label, rows, grand, title="📋 สรุปค่าใช้จ่ายรายวัน", daily=True)
    await _push(token, gid, [flex])


async def _build_daily_carousel(period_label: str, rows: list, grand: float, spent_month_map: dict, budgets_cfg: dict) -> dict:
    """สร้าง Carousel — 1 bubble ต่อหมวด + bubble สุดท้ายสรุปรวม"""
    bubbles = []
    header_colors = ["#1e3a8a", "#15803d", "#7c3aed", "#b45309", "#0f766e", "#be185d"]

    for i, row in enumerate(rows):
        cat_key     = row["catKey"]
        cat_name    = row["category"]
        today_spent = row["spent"]
        month_budget = float(budgets_cfg.get(cat_key, {}).get("monthly", 0))
        spent_month  = spent_month_map.get(cat_key, 0.0)
        remaining    = month_budget - spent_month
        no_budget    = month_budget == 0

        pct_used   = spent_month  / month_budget * 100 if month_budget > 0 else 0
        today_pct  = today_spent  / month_budget * 100 if month_budget > 0 else 0
        remain_pct = 100 - pct_used

        def _pct_color(pct_used):
            if pct_used > 100: return "#dc2626"
            if pct_used > 80:  return "#d97706"
            return "#16a34a"

        def _remain_color(pct_left):
            if pct_left < 0:   return "#dc2626"
            if pct_left < 20:  return "#d97706"
            return "#16a34a"

        pct_icon   = "🔴" if pct_used > 100 else ("🟡" if pct_used > 80 else "🟢")
        hdr_color  = header_colors[i % len(header_colors)]
        doc_url    = f"{FRONTEND_URL}/expense-control?tab=history&cat={cat_key}"

        def _row(label, amount, pct_text, amt_color, pct_color_val):
            return {
                "type": "box", "layout": "horizontal", "paddingTop": "4px",
                "contents": [
                    {"type": "text", "text": label,   "size": "xs", "color": "#64748b", "flex": 3},
                    {"type": "text", "text": f"฿{_fmt(amount)}", "size": "xs", "align": "end", "color": amt_color, "flex": 4, "weight": "bold"},
                    {"type": "text", "text": pct_text, "size": "xxs", "align": "end", "color": pct_color_val, "flex": 3},
                ]
            }

        body_contents = [
            {"type": "text", "text": f"งบ/เดือน: {'฿'+_fmt(month_budget) if not no_budget else 'ยังไม่ตั้งงบ'}", "size": "xxs", "color": "#94a3b8"},
            {"type": "separator", "margin": "sm"},
            _row("วันนี้",     today_spent, f"{today_pct:.0f}% ของงบ" if not no_budget else "—",
                 _pct_color(today_pct) if not no_budget else "#1e293b",
                 _pct_color(today_pct) if not no_budget else "#94a3b8"),
            _row("ใช้แล้ว",   spent_month, f"{pct_used:.0f}% ของงบ" if not no_budget else "—",
                 _pct_color(pct_used) if not no_budget else "#475569",
                 _pct_color(pct_used) if not no_budget else "#94a3b8"),
            {"type": "separator", "margin": "sm"},
            _row("คงเหลือ",   abs(remaining) if not no_budget else 0,
                 f"เหลือ {remain_pct:.0f}%" if not no_budget else "—",
                 _remain_color(remain_pct) if not no_budget else "#94a3b8",
                 _remain_color(remain_pct) if not no_budget else "#94a3b8"),
        ]

        bubbles.append({
            "type": "bubble", "size": "kilo",
            "header": {
                "type": "box", "layout": "vertical",
                "backgroundColor": hdr_color, "paddingAll": "12px",
                "contents": [
                    {"type": "text", "text": f"{pct_icon} {cat_name}", "color": "#ffffff", "size": "sm", "weight": "bold", "wrap": True},
                ]
            },
            "body": {
                "type": "box", "layout": "vertical", "paddingAll": "10px", "spacing": "xs",
                "contents": body_contents,
            },
            "footer": {
                "type": "box", "layout": "vertical", "paddingAll": "6px",
                "contents": [{
                    "type": "button", "style": "secondary", "height": "sm",
                    "action": {"type": "uri", "label": "📋 ดูเอกสาร", "uri": doc_url},
                }]
            },
        })

    # bubble สุดท้าย: สรุปรวม
    history_url = f"{FRONTEND_URL}/expense-control?tab=history"
    bubbles.append({
        "type": "bubble", "size": "kilo",
        "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": "#0f172a", "paddingAll": "12px",
            "contents": [
                {"type": "text", "text": "📊 สรุปรวม", "color": "#93c5fd", "size": "sm", "weight": "bold"},
                {"type": "text", "text": period_label,  "color": "#cbd5e1", "size": "xxs"},
            ]
        },
        "body": {
            "type": "box", "layout": "vertical", "paddingAll": "10px", "spacing": "xs",
            "contents": [
                {"type": "box", "layout": "horizontal", "contents": [
                    {"type": "text", "text": "รวมวันนี้",   "size": "xs", "color": "#64748b", "flex": 3},
                    {"type": "text", "text": f"฿{_fmt(grand)}", "size": "sm", "align": "end", "color": "#1e3a8a", "flex": 7, "weight": "bold"},
                ]},
                {"type": "text", "text": f"{len(rows)} หมวด", "size": "xxs", "color": "#94a3b8", "align": "end"},
            ]
        },
        "footer": {
            "type": "box", "layout": "vertical", "paddingAll": "6px",
            "contents": [{
                "type": "button", "style": "primary", "height": "sm", "color": "#1e3a8a",
                "action": {"type": "uri", "label": "📋 ดูรายงาน", "uri": history_url},
            }]
        },
    })

    return {
        "type": "flex",
        "altText": f"📋 สรุปค่าใช้จ่าย {period_label}",
        "contents": {"type": "carousel", "contents": bubbles},
    }


async def preview_daily_summary_to_uid(line_uid: str) -> bool:
    """ส่ง preview สรุปวันนี้ (carousel) ไปที่ lineUid"""
    now = datetime.now()
    db  = get_db()
    date_prefix = now.strftime("%Y-%m-%d")
    rows, grand = await _query_approved_expenses(date_prefix, date_prefix)

    # ถ้าไม่มีรายการวันนี้ ใช้ข้อมูลจำลอง
    if not rows:
        _my    = f"{now.month:02d}/{now.year}"
        _bdoc  = await db.budgets.find_one({"monthYear": _my}) or {}
        _budgets = _bdoc.get("budgets", {})
        from ..services.category_service import get_all_categories
        cats = await get_all_categories()
        rows  = []
        for c in cats[:4]:
            ck = c["id"]
            rows.append({"category": c["name"], "catKey": ck, "spent": 12500.0,
                         "budget": float(_budgets.get(ck, {}).get("monthly", 0))})
        grand = sum(r["spent"] for r in rows)

    # ดึงยอดสะสมเดือน
    month_prefix = now.strftime("%Y-%m")
    _my  = f"{now.month:02d}/{now.year}"
    _bdoc = await db.budgets.find_one({"monthYear": _my}) or {}
    budgets_cfg = _bdoc.get("budgets", {})
    agg = await db.expenses.aggregate([
        {"$match": {"date_iso": {"$regex": f"^{month_prefix}"}}},
        {"$group": {"_id": "$catKey", "total": {"$sum": "$amount"}}},
    ]).to_list(None)
    spent_month_map = {r["_id"]: r["total"] for r in agg}

    period_label = f"วันที่ {now.day} {THAI_MONTHS[now.month]} {now.year+543} (ตัวอย่าง)"
    flex = await _build_period_summary_flex(period_label, rows, grand, title="📋 สรุปค่าใช้จ่ายรายวัน", daily=True)

    token, _ = await _get_module_group("expense")
    if not token or not line_uid:
        return False
    return await _push(token, line_uid, [flex])


async def preview_weekly_summary_to_uid(line_uid: str) -> bool:
    """ส่ง preview สรุปสัปดาห์นี้ไปที่ lineUid (ใช้ข้อมูลจริงจาก DB)"""
    now        = datetime.now()
    week_start = now - __import__('datetime').timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end   = week_start + timedelta(days=6)
    from_str   = week_start.strftime("%Y-%m-%d")
    to_str     = week_end.strftime("%Y-%m-%d")

    rows, grand = await _query_period_expenses(from_str, to_str)

    # ถ้าไม่มีรายการสัปดาห์นี้ ใช้ข้อมูลจำลอง
    if not rows:
        db = get_db()
        _my   = f"{now.month:02d}/{now.year}"
        _bdoc = await db.budgets.find_one({"monthYear": _my}) or {}
        _budgets = _bdoc.get("budgets", {})
        from ..services.category_service import get_all_categories
        cats  = await get_all_categories()
        rows  = []
        for c in cats[:4]:
            ck = c["id"]
            rows.append({"category": c["name"], "catKey": ck, "spent": 12500.0,
                         "budget": float(_budgets.get(ck, {}).get("monthly", 0))})
        grand = sum(r["spent"] for r in rows)

    d_from = f"{week_start.day}/{week_start.month}/{week_start.year+543}"
    d_to   = f"{week_end.day}/{week_end.month}/{week_end.year+543}"
    period_label = f"{d_from} – {d_to} (ตัวอย่าง)"

    flex = await _build_period_summary_flex(
        period_label, rows, grand,
        title="📋 สรุปค่าใช้จ่ายรายสัปดาห์", daily=True, col1_label="สัปดาห์นี้"
    )
    db  = get_db()
    doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    token = doc.get("mainLineOa", {}).get("token", "")
    if not token or not line_uid:
        return False
    return await _push(token, line_uid, [flex])


async def notify_weekly_summary(week_start: datetime, week_end: datetime = None) -> None:
    """ส่งสรุปค่าใช้จ่ายรายสัปดาห์ไปกลุ่ม LINE OA"""
    token, gid = await _get_expense_group()
    if not token or not gid:
        db = get_db()
        _doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
        token = _doc.get("mainLineOa", {}).get("token", "")
        gid   = _doc.get("mainLineOa", {}).get("targetId", "")
    if not token or not gid:
        return

    if week_end is None:
        week_end = week_start + timedelta(days=6)
    from_str  = week_start.strftime("%Y-%m-%d")
    to_str    = week_end.strftime("%Y-%m-%d")
    rows, grand = await _query_period_expenses(from_str, to_str)

    d_from = f"{week_start.day}/{week_start.month}/{week_start.year+543}"
    d_to   = f"{week_end.day}/{week_end.month}/{week_end.year+543}"
    period_label = f"{d_from} – {d_to}"

    # ถ้าข้ามเดือน ไม่แสดงงบเปรียบเทียบ (เพราะงบคนละเดือน)
    cross_month = week_start.month != week_end.month
    title = "📋 สรุปค่าใช้จ่าย" + (" (ต้นเดือน)" if cross_month and week_start.day == 1 else "รายสัปดาห์")

    if not rows:
        msg = {"type": "text", "text": f"{title} {period_label}\n\n— ไม่พบรายการในช่วงนี้ —"}
        await _push(token, gid, [msg])
        return

    flex = await _build_period_summary_flex(
        period_label, rows, grand,
        title=title, daily=not cross_month, col1_label="ช่วงนี้"
    )
    await _push(token, gid, [flex])


# ─── Event: budget over threshold ────────────────────────────────────────────

async def notify_budget_warning(cat_name: str, pct: float, spent: float, budget: float, cat_key: str = "") -> None:
    """แจ้งเตือนเมื่อใช้งบเกิน 80% → accounting_manager + ผู้มีสิทธิ์ในหมวดนั้น"""
    remaining = budget - spent
    label = "🔴 เกินงบประมาณ!" if pct > 100 else "⚠️ ใช้งบเกิน 80%"

    text = (
        f"\n{label}\n"
        f"หมวด: {cat_name}\n"
        f"ใช้ไป: ฿{_fmt(spent)} ({pct:.1f}%)\n"
        f"งบ: ฿{_fmt(budget)}\n"
        f"{'เกิน' if remaining < 0 else 'คงเหลือ'}: ฿{_fmt(abs(remaining))}"
    )

    # แจ้ง accounting_manager / admin
    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    notified = set()
    for u in managers:
        if u.get("lineUid"):
            await _push_to_uid(u["lineUid"], [{"type": "text", "text": text.strip()}])
            notified.add(u["username"])
        elif u.get("lineNotifyToken"):
            await _notify_personal(u["lineNotifyToken"], text)
            notified.add(u["username"])

    # แจ้งผู้มีสิทธิ์ในหมวดนั้น (ถ้ายังไม่ได้รับแจ้ง)
    if cat_key:
        perm_users = await _get_users_with_permission(cat_key)
        for u in perm_users:
            if u["username"] in notified:
                continue
            if u.get("lineUid"):
                await _push_to_uid(u["lineUid"], [{"type": "text", "text": text.strip()}])
            elif u.get("lineNotifyToken"):
                await _notify_personal(u["lineNotifyToken"], text)


# ─── Event: monthly summary (cron วันที่ 30) ────────────────────────────────

async def notify_monthly_summary(year: int, month: int) -> None:
    """
    สรุปประจำเดือน:
    1. ส่งกลุ่ม LINE OA (expense group) — Flex พร้อมคงเหลือ/ติดลบแต่ละหมวด
    2. แจ้ง accounting_manager ว่าระบบส่งสรุปไปกลุ่มแล้ว
    """
    from ..services.budget_service import get_budget_summary
    token, gid = await _get_expense_group()
    if not token or not gid:
        return

    my = f"{month:02d}/{year}"
    summary = await get_budget_summary(my)
    data    = summary.get("data", {})

    grand_spent  = sum(v["spentMonth"]    for v in data.values())
    grand_budget = sum(v["monthlyBudget"] for v in data.values())
    grand_remain = grand_budget - grand_spent
    remain_color = "#16a34a" if grand_remain >= 0 else "#dc2626"
    month_label  = f"{THAI_MONTHS[month]} {year + 543}"

    # rows ต่อหมวด + คงเหลือ/ติดลบ
    cat_rows = []
    for v in data.values():
        spent  = v["spentMonth"]
        budget = v["monthlyBudget"]
        pct    = round(spent / budget * 100, 1) if budget > 0 else 0
        icon   = "🔴" if pct > 100 else ("🟡" if pct > 80 else "🟢")
        remain = budget - spent
        r_color = "#16a34a" if remain >= 0 else "#dc2626"
        r_label = f"คงเหลือ ฿{_fmt(remain)}" if remain >= 0 else f"ติดลบ -฿{_fmt(abs(remain))}"

        cat_rows.append({
            "type": "box", "layout": "horizontal", "paddingAll": "4px",
            "contents": [
                {"type": "text", "text": f"{icon} {v['label']}", "size": "xs", "flex": 4, "color": "#1e293b", "wrap": True},
                {"type": "text", "text": f"฿{_fmt(spent)}",  "size": "xs", "flex": 3, "align": "end", "color": "#1e293b"},
                {"type": "text", "text": f"฿{_fmt(budget)}", "size": "xs", "flex": 3, "align": "end", "color": "#64748b"},
            ]
        })
        cat_rows.append({
            "type": "text", "text": f"   └ {r_label}",
            "size": "xxs", "color": r_color,
        })

    group_msg = {
        "type": "flex",
        "altText": f"📊 สรุปประจำเดือน {month_label}",
        "contents": {
            "type": "bubble", "size": "giga",
            "header": {
                "type": "box", "layout": "vertical", "backgroundColor": "#1e3a8a", "paddingAll": "16px",
                "contents": [
                    {"type": "text", "text": "📊 สรุปค่าใช้จ่ายประจำเดือน", "color": "#93c5fd", "size": "sm", "weight": "bold"},
                    {"type": "text", "text": month_label, "color": "#ffffff", "size": "xl", "weight": "bold", "margin": "sm"},
                ]
            },
            "body": {
                "type": "box", "layout": "vertical", "paddingAll": "14px", "spacing": "xs",
                "contents": [
                    {"type": "box", "layout": "horizontal", "backgroundColor": "#f8fafc",
                     "paddingAll": "6px", "cornerRadius": "4px",
                     "contents": [
                         {"type": "text", "text": "หมวด", "size": "xs", "flex": 4, "weight": "bold", "color": "#475569"},
                         {"type": "text", "text": "ใช้ไป", "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
                         {"type": "text", "text": "งบ",   "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
                     ]},
                    *cat_rows,
                    {"type": "separator", "margin": "md"},
                    {"type": "box", "layout": "horizontal", "margin": "md",
                     "contents": [
                         {"type": "text", "text": "รวมทั้งหมด", "size": "sm", "weight": "bold", "color": "#1e293b", "flex": 4},
                         {"type": "text", "text": f"฿{_fmt(grand_spent)}", "size": "sm", "weight": "bold", "color": "#1e3a8a", "flex": 3, "align": "end"},
                         {"type": "text", "text": f"฿{_fmt(grand_budget)}", "size": "sm", "color": "#64748b", "flex": 3, "align": "end"},
                     ]},
                    {"type": "box", "layout": "horizontal", "margin": "sm",
                     "contents": [
                         {"type": "text", "text": "คงเหลือรวม" if grand_remain >= 0 else "ติดลบรวม",
                          "size": "sm", "color": "#64748b", "flex": 4},
                         {"type": "text", "text": f"฿{_fmt(abs(grand_remain))}", "size": "sm",
                          "weight": "bold", "color": remain_color, "flex": 6, "align": "end"},
                     ]},
                ]
            },
            "footer": {
                "type": "box", "layout": "vertical", "paddingAll": "10px",
                "contents": [{"type": "text", "text": _now_thai(), "size": "xxs", "color": "#94a3b8", "align": "center"}]
            }
        }
    }

    # 1. ส่งกลุ่ม
    await _push(token, gid, [group_msg])

    # 2. แจ้ง accounting_manager ว่าส่งสรุปไปกลุ่มแล้ว
    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    for u in managers:
        line_uid     = u.get("lineUid", "")
        notify_token = u.get("lineNotifyToken", "")
        msg = (
            f"📊 ระบบส่งสรุปค่าใช้จ่ายเดือน {month_label} ไปกลุ่มแล้ว\n"
            f"รวมยอด: ฿{_fmt(grand_spent)} / งบ: ฿{_fmt(grand_budget)}\n"
            f"{'คงเหลือ' if grand_remain >= 0 else 'ติดลบ'}: ฿{_fmt(abs(grand_remain))}\n"
            f"ดูรายละเอียด: {FRONTEND_URL}/expense-control?tab=history"
        )
        if line_uid:
            await _push_to_uid(line_uid, [{"type": "text", "text": msg}])
        elif notify_token:
            await _notify_personal(notify_token, f"\n{msg}")


# ─── Budget reminder helpers ──────────────────────────────────────────────────

async def _get_budget_reminder_config() -> dict:
    """ดึง budget reminder config จาก system_settings"""
    db = get_db()
    s = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    return {
        "enabled": s.get("budgetReminderEnabled", True),
        "messageDay30": s.get("budgetReminderMessageDay30",
            "📋 เดือนหน้าใกล้มาแล้ว กรุณาระบุงบประมาณประจำเดือน [เดือน] ในระบบ PlaNeat"),
        "messageDay4": s.get("budgetReminderMessageDay4",
            "⚠️ ยังไม่พบการระบุงบประมาณเดือน [เดือน] กรุณาดำเนินการในระบบ PlaNeat"),
    }


THAI_MONTHS = ["","มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
               "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"]


# ─── Event: day-30 — remind managers to set next month's budget ──────────────

async def notify_budget_day30(year: int, month: int) -> None:
    """
    วันที่ 30: แจ้ง accounting_manager ตั้งงบประมาณเดือนหน้า
    - ระบุงบรายวันอัตโนมัติ = งบเดือน ÷ จำนวนวันในเดือน
    - มีลิงก์ตรงไปหน้าตั้งงบ
    """
    cfg = await _get_budget_reminder_config()
    if not cfg["enabled"]:
        return

    # คำนวณเดือนหน้า
    next_month = month + 1 if month < 12 else 1
    next_year  = year if month < 12 else year + 1
    days_next  = calendar.monthrange(next_year, next_month)[1]
    month_label = f"{THAI_MONTHS[next_month]} {next_year + 543}"
    budget_url  = f"{FRONTEND_URL}/expense-control?tab=budget"

    # ดึงหมวดที่มีอยู่
    db = get_db()
    cats = await db.expense_categories.find({"isActive": True}, {"name": 1, "_id": 0}).to_list(None)
    if not cats:
        return  # ไม่มีหมวด ไม่ต้องแจ้ง

    cat_lines = "\n".join(f"  • {c['name']}" for c in cats[:10])

    message = (
        f"📋 แจ้งเตือนตั้งงบประมาณเดือน {month_label}\n\n"
        f"หมวดที่ต้องตั้งงบ:\n{cat_lines}\n\n"
        f"💡 งบรายวัน = งบเดือน ÷ {days_next} วัน (คำนวณอัตโนมัติ)\n\n"
        f"ตั้งงบได้ที่: {budget_url}"
    )

    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    for u in managers:
        line_uid = u.get("lineUid", "")
        notify_token = u.get("lineNotifyToken", "")
        if line_uid:
            await _push_to_uid(line_uid, [{"type": "text", "text": message}])
        elif notify_token:
            await _notify_personal(notify_token, f"\n{message}")


# ─── Event: budget entry reminder (cron วันที่ 4) ────────────────────────────

async def notify_budget_missing(year: int, month: int) -> None:
    """
    วันที่ 4: ตรวจหมวดที่ยังไม่มีการตั้งงบประมาณ
    ถ้ามีหมวดที่ยังไม่ตั้ง → แจ้ง accounting_manager พร้อมลิงก์
    """
    cfg = await _get_budget_reminder_config()
    if not cfg["enabled"]:
        return

    db = get_db()
    my = f"{month:02d}/{year}"
    budget_doc = await db.budgets.find_one({"monthYear": my}) or {}
    budgets    = budget_doc.get("budgets", {})

    # หาหมวดที่ active แต่ยังไม่มีงบ
    cats = await db.expense_categories.find({"isActive": True}, {"name": 1, "key": 1, "_id": 0}).to_list(None)
    if not cats:
        return  # ไม่มีหมวด ไม่ต้องแจ้ง

    missing_cats = [
        c["name"] for c in cats
        if float(budgets.get(c.get("key", ""), {}).get("monthly", 0)) <= 0
    ]
    if not missing_cats:
        return  # ทุกหมวดมีงบแล้ว

    month_label = f"{THAI_MONTHS[month]} {year + 543}"
    days_month  = calendar.monthrange(year, month)[1]
    budget_url  = f"{FRONTEND_URL}/expense-control?tab=budget"
    cat_lines   = "\n".join(f"  • {n}" for n in missing_cats[:10])

    message = (
        f"⚠️ ยังไม่ได้ตั้งงบประมาณเดือน {month_label}\n\n"
        f"หมวดที่ยังไม่มีงบ:\n{cat_lines}\n\n"
        f"💡 งบรายวัน = งบเดือน ÷ {days_month} วัน (คำนวณอัตโนมัติ)\n\n"
        f"ตั้งงบได้ที่: {budget_url}"
    )

    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    for u in managers:
        line_uid = u.get("lineUid", "")
        notify_token = u.get("lineNotifyToken", "")
        if line_uid:
            await _push_to_uid(line_uid, [{"type": "text", "text": message}])
        elif notify_token:
            await _notify_personal(notify_token, f"\n{message}")
