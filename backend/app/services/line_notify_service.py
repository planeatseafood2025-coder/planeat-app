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
    """ดึง users ตาม role ที่มี lineNotifyToken"""
    db = get_db()
    cursor = db.users.find(
        {"role": {"$in": roles}, "lineNotifyToken": {"$exists": True, "$ne": ""}, "status": "active"},
        {"lineNotifyToken": 1, "username": 1, "name": 1, "firstName": 1, "_id": 0}
    )
    return await cursor.to_list(None)


def _build_approval_flex(recorder_name: str, cat: str, date_str: str, amount: str, detail: str) -> dict:
    """สร้าง Flex Message Card สำหรับขออนุมัติค่าใช้จ่าย"""
    return {
        "type": "flex",
        "altText": f"🔔 รายการรอการอนุมัติ — {recorder_name} / {cat} / ฿{amount}",
        "contents": {
            "type": "bubble",
            "size": "kilo",
            "header": {
                "type": "box",
                "layout": "vertical",
                "backgroundColor": "#1e3a8a",
                "paddingAll": "14px",
                "contents": [
                    {
                        "type": "text",
                        "text": "🔔 รายการรอการอนุมัติ",
                        "color": "#93c5fd",
                        "size": "sm",
                        "weight": "bold",
                    }
                ],
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "paddingAll": "14px",
                "spacing": "sm",
                "contents": [
                    _flex_row("ผู้กรอก", recorder_name, "#1e293b", bold=True),
                    _flex_row("หมวด",    cat,           "#1e293b"),
                    _flex_row("วันที่",   date_str,      "#475569"),
                    _flex_row("ยอด",     f"฿{amount}",  "#dc2626", bold=True),
                    _flex_row("รายละเอียด", detail,     "#475569"),
                    {"type": "separator", "margin": "md"},
                    {
                        "type": "text",
                        "text": "อนุมัติรายการนี้ไหม?",
                        "size": "sm",
                        "color": "#334155",
                        "margin": "md",
                        "weight": "bold",
                    },
                ],
            },
            "footer": {
                "type": "box",
                "layout": "horizontal",
                "spacing": "sm",
                "paddingAll": "12px",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": "#16a34a",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "✅ อนุมัติ",
                            "text": "Y",
                        },
                    },
                    {
                        "type": "button",
                        "style": "primary",
                        "color": "#dc2626",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "❌ ปฏิเสธ",
                            "text": "N",
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
            {"type": "text", "text": label, "size": "sm", "color": "#94a3b8", "flex": 3},
            {"type": "text", "text": value,  "size": "sm", "color": value_color,
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
        {"role": {"$in": ["it", "admin", "super_admin"]}, "status": "active"},
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
    draft_id     = draft.get("_id") or draft.get("id", "")
    recorder     = draft.get("recorder", "")
    recorder_name = draft.get("recorderName", recorder)
    cat          = draft.get("category", "")
    amount       = _fmt(float(draft.get("total", draft.get("amount", 0))))
    detail       = (draft.get("detail", "") or "")[:50]
    date_str     = draft.get("date", "")

    # ── 1. แจ้ง recorder (ผู้กรอก) ──────────────────────────────────────────
    recorder_user = await db.users.find_one(
        {"username": recorder},
        {"lineUid": 1, "lineNotifyToken": 1, "_id": 0}
    )
    if recorder_user:
        msg_recorder = (
            f"📋 ส่งรายการสำเร็จ รอการอนุมัติ\n"
            f"หมวด: {cat}\n"
            f"วันที่: {date_str}\n"
            f"ยอด: ฿{amount}\n"
            f"รายละเอียด: {detail or '-'}\n"
            f"ระบบจะแจ้งเมื่อผู้จัดการอนุมัติแล้ว"
        )
        # ส่งผ่าน LINE OA (push ไปหา lineUid ส่วนตัว)
        if recorder_user.get("lineUid"):
            await _push_to_uid(recorder_user["lineUid"], [{"type": "text", "text": msg_recorder}])
        # fallback: LINE Notify ถ้าตั้งค่าไว้
        elif recorder_user.get("lineNotifyToken"):
            await _notify_personal(recorder_user["lineNotifyToken"], f"\n{msg_recorder}")

    # ── 2. แจ้ง accounting_manager ส่วนตัวผ่าน lineUid ─────────────────────
    managers = await db.users.find(
        {"role": {"$in": ["accounting_manager", "admin", "super_admin"]},
         "status": "active",
         "username": {"$ne": recorder}},
        {"username": 1, "firstName": 1, "lastName": 1, "nickname": 1,
         "lineUid": 1, "lineNotifyToken": 1, "_id": 0}
    ).to_list(20)

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
            flex = _build_approval_flex(recorder_name, cat, date_str, amount, detail or "-")
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

async def _get_expense_group() -> tuple[str, str]:
    """คืน (token, groupId) ของกลุ่มระบบควบคุมค่าใช้จ่าย"""
    db = get_db()
    doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    token = doc.get("mainLineOa", {}).get("token", "")
    gid   = doc.get("moduleConnections", {}).get("expense", "")
    return token, gid


async def _get_users_with_permission(cat_key: str) -> list:
    """ดึง users ที่มีสิทธิ์ในหมวด cat_key และ active"""
    db = get_db()
    cursor = db.users.find(
        {f"permissions.{cat_key}": True, "status": "active"},
        {"username": 1, "lineUid": 1, "lineNotifyToken": 1, "_id": 0}
    )
    return await cursor.to_list(50)


# ─── Event: draft approved (อนุมัติแล้ว) ────────────────────────────────────

async def notify_expense_approved(expense: dict, approver_username: str = "") -> None:
    """
    เมื่ออนุมัติค่าใช้จ่าย:
    1. ส่ง Flex Message ไปกลุ่ม LINE OA (expense control group)
    2. แจ้งผู้มีสิทธิ์ในหมวดนั้น (ยอดอัปเดต)
    """
    db = get_db()
    now = datetime.now()
    cat_key  = expense.get("catKey", "")
    cat      = expense.get("category", "")
    amount   = _fmt(float(expense.get("amount", 0)))
    detail   = (expense.get("detail", "") or "")[:40]
    date_str = expense.get("date", "")
    recorder = expense.get("recorderName", expense.get("recorder", ""))

    # คำนวณยอดสะสม + งบ
    month_str = now.strftime("%Y-%m")
    agg = await db.expenses.aggregate([
        {"$match": {"date_iso": {"$regex": f"^{month_str}"}, "catKey": cat_key}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(None)
    month_total     = agg[0]["total"] if agg else 0.0
    my              = f"{now.month:02d}/{now.year}"
    budget_doc      = await db.budgets.find_one({"monthYear": my}) or {}
    monthly_budget  = float(budget_doc.get("budgets", {}).get(cat_key, {}).get("monthly", 0))
    remaining       = monthly_budget - month_total
    remain_color    = "#16a34a" if remaining >= 0 else "#dc2626"
    remain_label    = f"฿{_fmt(remaining)}" if remaining >= 0 else f"-฿{_fmt(abs(remaining))}"

    # ─── 1. ส่งไปกลุ่ม LINE OA ──────────────────────────────────────────────
    token, gid = await _get_expense_group()
    if token and gid:
        flex = {
            "type": "flex",
            "altText": f"✅ อนุมัติแล้ว — {cat} ฿{amount}",
            "contents": {
                "type": "bubble", "size": "kilo",
                "header": {
                    "type": "box", "layout": "vertical",
                    "backgroundColor": "#16a34a", "paddingAll": "12px",
                    "contents": [{"type": "text", "text": "✅ อนุมัติค่าใช้จ่ายแล้ว",
                                  "color": "#ffffff", "size": "sm", "weight": "bold"}],
                },
                "body": {
                    "type": "box", "layout": "vertical",
                    "paddingAll": "14px", "spacing": "sm",
                    "contents": [
                        _flex_row("หมวด",      cat,           "#1e293b", bold=True),
                        _flex_row("ผู้กรอก",   recorder,      "#1e293b"),
                        _flex_row("วันที่",    date_str,      "#475569"),
                        _flex_row("ยอด",      f"฿{amount}",  "#1e3a8a", bold=True),
                        _flex_row("รายละเอียด", detail or "-", "#475569"),
                        {"type": "separator", "margin": "md"},
                        _flex_row("สะสมเดือนนี้", f"฿{_fmt(month_total)}", "#1e293b"),
                        _flex_row("งบประมาณ",    f"฿{_fmt(monthly_budget)}", "#64748b"),
                        _flex_row("คงเหลือ",     remain_label, remain_color, bold=True),
                        _flex_row("อนุมัติโดย",  approver_username, "#475569"),
                    ],
                },
                "footer": {
                    "type": "box", "layout": "vertical", "paddingAll": "8px",
                    "contents": [{"type": "text", "text": _now_thai(),
                                  "size": "xxs", "color": "#94a3b8", "align": "center"}],
                },
            },
        }
        await _push(token, gid, [flex])

    # ─── 2. แจ้งผู้มีสิทธิ์ในหมวดนั้น ──────────────────────────────────────
    perm_users = await _get_users_with_permission(cat_key)
    msg_perm = (
        f"✅ อนุมัติรายการแล้ว\n"
        f"หมวด: {cat} | {date_str}\n"
        f"ยอด: ฿{amount}\n"
        f"รายละเอียด: {detail or '-'}\n"
        f"ยอดสะสมเดือนนี้: ฿{_fmt(month_total)}\n"
        f"คงเหลือ: {remain_label}"
    )
    for u in perm_users:
        if u.get("lineUid"):
            await _push_to_uid(u["lineUid"], [{"type": "text", "text": msg_perm}])
        elif u.get("lineNotifyToken"):
            await _notify_personal(u["lineNotifyToken"], f"\n{msg_perm}")


# ─── สรุปค่าใช้จ่าย (รายวัน/สัปดาห์/เดือน) ──────────────────────────────────

async def _build_period_summary_flex(
    period_label: str,
    expenses_rows: list,   # [{"category": str, "catKey": str, "spent": float, "budget": float}]
    grand_spent: float,
    title: str = "📊 สรุปค่าใช้จ่าย",
    monthly: bool = False,
) -> dict:
    """สร้าง Flex Message ตารางสรุปค่าใช้จ่ายตามช่วงเวลา"""
    body_items = []

    # header row
    body_items.append({
        "type": "box", "layout": "horizontal",
        "backgroundColor": "#f1f5f9", "paddingAll": "5px", "cornerRadius": "4px",
        "contents": [
            {"type": "text", "text": "หมวด",     "size": "xs", "flex": 4, "weight": "bold", "color": "#475569"},
            {"type": "text", "text": "ใช้ไป",    "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
            {"type": "text", "text": "งบ/เดือน", "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
        ]
    })

    for row in expenses_rows:
        pct = row["spent"] / row["budget"] * 100 if row["budget"] > 0 else 0
        icon = "🔴" if pct > 100 else ("🟡" if pct > 80 else "🟢")
        amt_color = "#dc2626" if pct > 100 else "#1e293b"

        body_items.append({
            "type": "box", "layout": "horizontal", "paddingAll": "4px",
            "contents": [
                {"type": "text", "text": f"{icon} {row['category']}", "size": "xs", "flex": 4, "color": "#1e293b", "wrap": True},
                {"type": "text", "text": f"฿{_fmt(row['spent'])}", "size": "xs", "flex": 3, "align": "end", "color": amt_color},
                {"type": "text", "text": f"฿{_fmt(row['budget'])}", "size": "xs", "flex": 3, "align": "end", "color": "#64748b"},
            ]
        })

        # รายเดือน: เพิ่มแถวคงเหลือ/ติดลบ
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
                "type": "box", "layout": "vertical", "paddingAll": "8px",
                "contents": [{"type": "text", "text": _now_thai(), "size": "xxs", "color": "#94a3b8", "align": "center"}],
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


async def notify_daily_summary(year: int, month: int, day: int) -> None:
    """ส่งสรุปค่าใช้จ่ายรายวันไปกลุ่ม LINE OA"""
    token, gid = await _get_expense_group()
    if not token or not gid:
        return

    date_str  = f"{year}-{month:02d}-{day:02d}"
    rows, grand = await _query_period_expenses(date_str, date_str)

    if not rows:
        msg = {"type": "text", "text": f"📋 สรุปค่าใช้จ่ายประจำวันที่ {day}/{month}/{year+543}\n\n— ไม่พบการใช้จ่ายในวันนี้ —"}
        await _push(token, gid, [msg])
        return

    period_label = f"วันที่ {day} {THAI_MONTHS[month]} {year+543}"
    flex = await _build_period_summary_flex(period_label, rows, grand, title="📋 สรุปค่าใช้จ่ายรายวัน")
    await _push(token, gid, [flex])


async def notify_weekly_summary(week_start: datetime) -> None:
    """ส่งสรุปค่าใช้จ่ายรายสัปดาห์ไปกลุ่ม LINE OA"""
    token, gid = await _get_expense_group()
    if not token or not gid:
        return

    week_end  = week_start + timedelta(days=6)
    from_str  = week_start.strftime("%Y-%m-%d")
    to_str    = week_end.strftime("%Y-%m-%d")
    rows, grand = await _query_period_expenses(from_str, to_str)

    d_from = f"{week_start.day}/{week_start.month}/{week_start.year+543}"
    d_to   = f"{week_end.day}/{week_end.month}/{week_end.year+543}"
    period_label = f"{d_from} – {d_to}"

    if not rows:
        msg = {"type": "text", "text": f"📋 สรุปค่าใช้จ่ายรายสัปดาห์ {period_label}\n\n— ไม่พบการใช้จ่ายในช่วงนี้ —"}
        await _push(token, gid, [msg])
        return

    flex = await _build_period_summary_flex(period_label, rows, grand, title="📋 สรุปค่าใช้จ่ายรายสัปดาห์")
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
        if u.get("lineNotifyToken"):
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
        notify_token = u.get("lineNotifyToken", "")
        line_uid     = u.get("lineUid", "")
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
