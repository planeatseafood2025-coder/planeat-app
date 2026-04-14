"""
line_notify_service.py — ส่ง LINE แจ้งเตือนตาม event และ role

กฎ:
- กลุ่ม: LINE OA Messaging API (push) ผ่าน lineOaConfigs (mode=send/both)
- ส่วนตัว: LINE Notify API ใช้ lineNotifyToken จาก profile ของผู้ใช้
- ส่วนตัวผ่าน OA: push ไปที่ lineUid ของ user โดยตรง (ต้อง add OA ก่อน)
"""
import httpx
from datetime import datetime
from ..database import get_db

FRONTEND_URL = "http://localhost:3001"   # override ด้วย ENV ได้


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


# ─── Event: draft approved (อนุมัติแล้ว) ────────────────────────────────────

async def notify_expense_approved(expense: dict, approver: dict) -> None:
    """
    แจ้ง accounting_manager ส่วนตัว หลังอนุมัติค่าใช้จ่าย
    พร้อมยอดรวมเดือนนี้ + คงเหลือ
    """
    # คำนวณยอดเดือนนี้
    db = get_db()
    now = datetime.now()
    cat_key = expense.get("catKey", "")
    month_str = now.strftime("%Y-%m")
    agg = await db.expenses.aggregate([
        {"$match": {"date_iso": {"$regex": f"^{month_str}"}, "catKey": cat_key}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(None)
    month_total = agg[0]["total"] if agg else 0.0

    my = f"{now.month:02d}/{now.year}"
    budget_doc = await db.budgets.find_one({"monthYear": my}) or {}
    monthly_budget = float(budget_doc.get("budgets", {}).get(cat_key, {}).get("monthly", 0))
    remaining = monthly_budget - month_total
    remain_label = f"+฿{_fmt(remaining)}" if remaining >= 0 else f"-฿{_fmt(abs(remaining))}"

    cat          = expense.get("category", "")
    amount       = _fmt(float(expense.get("amount", 0)))
    detail       = expense.get("detail", "")[:40]
    approver_name = approver.get("name") or approver.get("username", "")
    pending_url  = f"{FRONTEND_URL}/expense-control?tab=pending"

    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    for u in managers:
        if u.get("lineNotifyToken"):
            text = (
                f"\n✅ อนุมัติค่าใช้จ่ายแล้ว\n"
                f"หมวด: {cat}\n"
                f"ยอด: ฿{amount}\n"
                f"รายละเอียด: {detail}\n"
                f"อนุมัติโดย: {approver_name}\n"
                f"---\n"
                f"ยอดสะสมเดือนนี้: ฿{_fmt(month_total)}\n"
                f"งบประมาณ: ฿{_fmt(monthly_budget)}\n"
                f"คงเหลือ: {remain_label}\n"
                f"ดูรายการ: {pending_url}"
            )
            await _notify_personal(u["lineNotifyToken"], text)


# ─── Event: budget over threshold ────────────────────────────────────────────

async def notify_budget_warning(cat_name: str, pct: float, spent: float, budget: float) -> None:
    """แจ้งเตือนเมื่อใช้งบเกิน 80%"""
    remaining = budget - spent
    label = "🔴 เกินงบประมาณ!" if pct > 100 else "⚠️ ใช้งบเกิน 80%"

    text = (
        f"\n{label}\n"
        f"หมวด: {cat_name}\n"
        f"ใช้ไป: ฿{_fmt(spent)} ({pct:.1f}%)\n"
        f"งบ: ฿{_fmt(budget)}\n"
        f"{'เกิน' if remaining < 0 else 'คงเหลือ'}: ฿{_fmt(abs(remaining))}"
    )

    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    for u in managers:
        if u.get("lineNotifyToken"):
            await _notify_personal(u["lineNotifyToken"], text)


# ─── Event: monthly summary (cron วันที่ 30) ────────────────────────────────

async def notify_monthly_summary(year: int, month: int) -> None:
    """
    สรุปประจำเดือน:
    1. ส่งกลุ่ม: ทุก LINE OA config ที่ mode=send/both
    2. ส่งส่วนตัว: accounting_manager — ขอยืนยันยอด
    """
    from ..services.budget_service import get_budget_summary
    configs = await _get_send_configs()
    if not configs:
        return

    my = f"{month:02d}/{year}"
    summary = await get_budget_summary(my)
    data = summary.get("data", {})

    # คำนวณ grand total
    grand_spent = sum(v["spentMonth"] for v in data.values())
    grand_budget = sum(v["monthlyBudget"] for v in data.values())
    grand_remain = grand_budget - grand_spent
    remain_color = "#16a34a" if grand_remain >= 0 else "#dc2626"

    month_label = f"{THAI_MONTHS[month]} {year + 543}"

    # สร้าง rows ต่อหมวด
    cat_rows = []
    for cat_id, v in data.items():
        pct = round(v["spentMonth"] / v["monthlyBudget"] * 100, 1) if v["monthlyBudget"] > 0 else 0
        status_icon = "🔴" if pct > 100 else ("🟡" if pct > 80 else "🟢")
        cat_rows.append({
            "type": "box", "layout": "horizontal", "paddingAll": "4px",
            "contents": [
                {"type": "text", "text": f"{status_icon} {v['label']}", "size": "xs", "flex": 4, "color": "#1e293b", "wrap": True},
                {"type": "text", "text": f"฿{_fmt(v['spentMonth'])}", "size": "xs", "flex": 3, "align": "end", "color": "#1e293b"},
                {"type": "text", "text": f"฿{_fmt(v['monthlyBudget'])}", "size": "xs", "flex": 3, "align": "end", "color": "#64748b"},
            ]
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
                "type": "box", "layout": "vertical", "paddingAll": "14px",
                "contents": [
                    {"type": "box", "layout": "horizontal", "backgroundColor": "#f8fafc",
                     "paddingAll": "6px", "cornerRadius": "4px",
                     "contents": [
                         {"type": "text", "text": "หมวด", "size": "xs", "flex": 4, "weight": "bold", "color": "#475569"},
                         {"type": "text", "text": "ใช้ไป", "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
                         {"type": "text", "text": "งบ", "size": "xs", "flex": 3, "weight": "bold", "color": "#475569", "align": "end"},
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
                         {"type": "text", "text": "คงเหลือ", "size": "sm", "color": "#64748b", "flex": 4},
                         {"type": "text", "text": f"฿{_fmt(abs(grand_remain))}", "size": "sm", "weight": "bold", "color": remain_color, "flex": 6, "align": "end"},
                     ]},
                ]
            },
            "footer": {
                "type": "box", "layout": "vertical", "paddingAll": "10px",
                "contents": [{"type": "text", "text": _now_thai(), "size": "xxs", "color": "#94a3b8", "align": "center"}]
            }
        }
    }

    # ส่งกลุ่ม
    for cfg in configs:
        target = cfg.get("targetId", "")
        if target:
            await _push(cfg["token"], target, [group_msg])

    # ส่งส่วนตัว accounting_manager — ขอยืนยันยอด
    managers = await _get_users_by_role(["accounting_manager"])
    for u in managers:
        if not u.get("lineId"):
            continue
        name = u.get("firstName") or u.get("name") or u.get("username", "")
        personal_text = (
            f"\nสวัสดี คุณ{name}\n\n"
            f"ระบบ PlaNeat ขอให้ท่านตรวจสอบและยืนยันยอดค่าใช้จ่าย\n"
            f"ประจำเดือน {month_label}\n\n"
            f"รวมยอดทั้งหมด: ฿{_fmt(grand_spent)}\n\n"
            f"กรุณาตรวจสอบความถูกต้องและยืนยันก่อนสิ้นเดือน\n"
            f"{FRONTEND_URL}/expense-control?tab=history"
        )
        await _notify_personal(u["lineNotifyToken"], personal_text)


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
    month/year คือเดือนปัจจุบัน, เดือนหน้าจะเป็น month+1
    """
    cfg = await _get_budget_reminder_config()
    if not cfg["enabled"]:
        return

    # คำนวณเดือนหน้า
    next_month = month + 1 if month < 12 else 1
    next_year = year if month < 12 else year + 1
    month_label = f"{THAI_MONTHS[next_month]} {next_year + 543}"

    message = cfg["messageDay30"].replace("[เดือน]", month_label)

    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    for u in managers:
        if not u.get("lineNotifyToken"):
            continue
        await _notify_personal(u["lineNotifyToken"], f"\n{message}")


# ─── Event: budget entry reminder (cron วันที่ 4) ────────────────────────────

async def notify_budget_missing(year: int, month: int) -> None:
    """
    วันที่ 4: ตรวจว่ายังไม่มีการตั้งงบประมาณเดือนนี้
    ถ้าไม่มี → แจ้ง accounting_manager ส่วนตัว
    """
    cfg = await _get_budget_reminder_config()
    if not cfg["enabled"]:
        return

    db = get_db()
    my = f"{month:02d}/{year}"
    budget_doc = await db.budgets.find_one({"monthYear": my})

    month_label = f"{THAI_MONTHS[month]} {year + 543}"

    # ตรวจว่ามีงบหรือยัง
    has_budget = False
    if budget_doc:
        budgets = budget_doc.get("budgets", {})
        has_budget = any(float(v.get("monthly", 0)) > 0 for v in budgets.values())

    if has_budget:
        return  # มีงบแล้ว ไม่ต้องแจ้ง

    message = cfg["messageDay4"].replace("[เดือน]", month_label)

    managers = await _get_users_by_role(["accounting_manager", "admin", "super_admin"])
    for u in managers:
        if not u.get("lineNotifyToken"):
            continue
        await _notify_personal(u["lineNotifyToken"], f"\n{message}")
