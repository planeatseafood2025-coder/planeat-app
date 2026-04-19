"""
Expense service — mirrors FinanceController.gs logic + draft/approval workflow.
Supports both legacy hardcoded categories and new dynamic categories.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from ..database import get_db
from .category_service import get_category_by_id, calc_total_dynamic

CAT_KEY_MAP = {
    "ค่าแรงงาน":                     "labor",
    "ค่าวัตถุดิบ":                    "raw",
    "ค่าเคมี/หีบห่อ/ส่วนผสม":        "chem",
    "ค่าซ่อมแซมและบำรุงรักษา":        "repair",
}

CAT_KEY_REVERSE = {v: k for k, v in CAT_KEY_MAP.items()}

ACCOUNTING_ROLES = ["accounting_manager", "accountant", "super_admin", "it_manager", "admin"]


def thai_date_to_iso(date_str: str) -> str:
    """Convert dd/MM/yyyy to YYYY-MM-DD"""
    parts = date_str.split("/")
    if len(parts) == 3:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return date_str


def iso_to_thai_date(iso: str) -> str:
    """Convert YYYY-MM-DD to dd/MM/yyyy"""
    parts = iso.split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return iso


def _f(val, default: float = 0.0) -> float:
    """แปลงค่าเป็น float อย่างปลอดภัย — รองรับ '', None, และ string ตัวเลข"""
    try:
        return float(val) if val not in (None, "") else default
    except (ValueError, TypeError):
        return default


def calc_expense_total(category: str, row: dict) -> tuple:
    cat_key = CAT_KEY_MAP.get(category, "")
    if cat_key == "labor":
        workers = _f(row.get("workers"))
        wage    = _f(row.get("dailyWage"))
        ot      = _f(row.get("ot"))
        total   = workers * wage + ot
        detail  = f"{int(workers)} คน × {wage:.0f}฿ + OT {ot:.0f}฿"
        return total, detail, row.get("note", "")
    elif cat_key == "raw":
        qty   = _f(row.get("quantity"))
        price = _f(row.get("pricePerKg"))
        total = qty * price
        name  = row.get("itemName", "")
        detail = f"{name} {qty}กก. × {price:.2f}฿/กก."
        return total, detail, row.get("note", "")
    elif cat_key == "chem":
        qty   = _f(row.get("quantity"))
        price = _f(row.get("price"))
        total = qty * price
        name  = row.get("itemName", "")
        detail = f"{name} {qty} × {price:.2f}฿"
        return total, detail, row.get("note", "")
    elif cat_key == "repair":
        total = _f(row.get("totalCost"))
        item  = row.get("repairItem", "")
        return total, item, row.get("note", "")
    return 0.0, "", ""


# ─── Shared helpers ──────────────────────────────────────────────

async def _get_user_line_info(db, username: str) -> tuple[str, str]:
    """คืน (recorder_name, lineUid) จาก username — ใช้ร่วมกันในทุก submit path."""
    user = await db.users.find_one(
        {"username": username},
        {"_id": 0, "name": 1, "firstName": 1, "lastName": 1, "lineUid": 1},
    )
    if not user:
        return username, ""
    fn = user.get("firstName", "").strip()
    ln = user.get("lastName", "").strip()
    name = f"{fn} {ln}".strip() or user.get("name", "").strip() or username
    return name, user.get("lineUid", "")


async def _submit_draft_internal(
    db,
    username: str,
    recorder_name: str,
    recorder_line_id: str,
    cat_name: str,
    cat_key: str,
    rows: list,
    total: float,
    detail: str,
    note: str,
    date_str: str,
    is_standalone: bool = False,
    line_items: list = None,
) -> dict:
    """สร้าง draft + notify managers (in-app + LINE) — จุดเดียว ใช้ร่วมทั้ง 3 path."""
    now = datetime.now(timezone.utc)
    draft = {
        "_id": str(uuid.uuid4()),
        "recorder": username,
        "recorderName": recorder_name,
        "recorderLineId": recorder_line_id,
        "date": date_str,
        "date_iso": thai_date_to_iso(date_str),
        "category": cat_name,
        "catKey": cat_key,
        "rows": rows,
        "total": total,
        "detail": detail,
        "lineItems": line_items or [],
        "note": note,
        "status": "pending",
        "submittedAt": now.isoformat(),
        "reviewedBy": None,
        "reviewedAt": None,
        "rejectReason": "",
        "approvedExpenseIds": [],
    }
    await db.expense_drafts.insert_one(draft)

    # in-app notifications ให้ managers
    admins = await db.users.find(
        {"role": {"$in": ACCOUNTING_ROLES}, "status": "active"},
        {"username": 1},
    ).to_list(50)
    title = "รายการใหม่จากพนักงาน (Standalone)" if is_standalone else "รายการใหม่รอตรวจสอบ"
    notifs = []
    for admin in admins:
        if admin["username"] == username:
            continue
        notifs.append({
            "id": str(uuid.uuid4()),
            "recipientUsername": admin["username"],
            "senderUsername": username,
            "type": "expense_draft",
            "title": title,
            "body": f"{recorder_name} ส่งรายการ{cat_name} วันที่ {date_str} ยอด ฿{total:,.0f} รอการอนุมัติ",
            "read": False,
            "createdAt": now,
            "data": {"draftId": draft["_id"]},
        })
    if notifs:
        await db.notifications.insert_many(notifs)

    # แจ้ง LINE: recorder + managers
    try:
        from ..services.line_notify_service import notify_draft_submitted
        await notify_draft_submitted(draft)
    except Exception as _e:
        print(f"[LINE notify] draft submitted: {_e}")

    return {"success": True, "message": "ส่งรายการเพื่อขออนุมัติสำเร็จ", "draftId": draft["_id"]}


async def save_expense(payload: dict) -> dict:
    db = get_db()
    username = payload.get("username", "")
    category = payload.get("category", "")
    date_str = payload.get("date", "")
    rows = payload.get("rows", [])
    cat_key = CAT_KEY_MAP.get(category, "unknown")

    # resolve ชื่อจริงของผู้กรอก
    _user = await db.users.find_one({"username": username}, {"name": 1, "firstName": 1, "lastName": 1, "lineUid": 1, "_id": 0})
    if _user:
        _fn = _user.get("firstName", "").strip()
        _ln = _user.get("lastName", "").strip()
        recorder_name = f"{_fn} {_ln}".strip() or _user.get("name", "").strip() or username
    else:
        recorder_name = username
    recorder_line_id = (_user or {}).get("lineUid", "")

    saved_count = 0
    for row in rows:
        total, detail, note = calc_expense_total(category, row)
        if total <= 0 and not detail:
            continue
        doc = {
            "_id": str(uuid.uuid4()),
            "date": date_str,
            "date_iso": thai_date_to_iso(date_str),
            "category": category,
            "catKey": cat_key,
            "amount": total,
            "recorder": username,
            "recorderName": recorder_name,
            "recorderLineId": recorder_line_id,
            "detail": detail,
            "note": note,
            "rows": [row],
            "approvedBy": None,
            "approverName": "",
            "approverLineId": "",
            "approvedAt": None,
            "draftId": None,
            "createdAt": datetime.utcnow().isoformat(),
        }
        await db.expenses.insert_one(doc)
        saved_count += 1
    await db.activity_logs.insert_one({
        "username": username,
        "action": "saveExpense",
        "detail": f"บันทึก {saved_count} รายการ หมวด {category}",
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"success": True, "message": f"บันทึกสำเร็จ {saved_count} รายการ"}


async def get_expenses(month_year: Optional[str] = None) -> dict:
    db = get_db()
    query = {}
    if month_year:
        parts = month_year.split("/")
        if len(parts) == 2:
            mm, yyyy = parts[0].zfill(2), parts[1]
            query["date_iso"] = {"$regex": f"^{yyyy}-{mm}"}
    cursor = db.expenses.find(query).sort("date_iso", -1)
    expenses = []
    async for doc in cursor:
        expenses.append({
            "id": doc.get("_id", ""),
            "date": doc.get("date", ""),
            "category": doc.get("category", ""),
            "catKey": doc.get("catKey", ""),
            "amount": doc.get("amount", 0),
            "recorder": doc.get("recorder", ""),
            "note": doc.get("note", ""),
            "detail": doc.get("detail", ""),
        })
    return {"success": True, "expenses": expenses, "monthYear": month_year or ""}


async def get_monthly_analysis(month_year: Optional[str] = None) -> dict:
    db = get_db()
    today = datetime.now()
    if not month_year:
        month_year = f"{today.month:02d}/{today.year}"
    parts = month_year.split("/")
    mm, yyyy = parts[0].zfill(2), parts[1]
    pipeline = [
        {"$match": {"date_iso": {"$regex": f"^{yyyy}-{mm}"}}},
        {"$group": {"_id": "$catKey", "total": {"$sum": "$amount"}}},
    ]
    result = await db.expenses.aggregate(pipeline).to_list(None)
    totals = {r["_id"]: r["total"] for r in result}
    budget_doc = await db.budgets.find_one({"monthYear": month_year}) or {}
    budgets_data = budget_doc.get("budgets", {})
    cat_info = {
        "labor":  {"label": "ค่าแรงงาน",              "color": "#f59e0b"},
        "raw":    {"label": "ค่าวัตถุดิบ",             "color": "#10b981"},
        "chem":   {"label": "ค่าเคมี/หีบห่อ/ส่วนผสม", "color": "#8b5cf6"},
        "repair": {"label": "ค่าซ่อมแซมและบำรุงรักษา", "color": "#f43f5e"},
    }
    analysis = {}
    overall = 0.0
    for key, info in cat_info.items():
        total = totals.get(key, 0.0)
        overall += total
        budget = budgets_data.get(key, {}).get("monthly", 0) if budgets_data else 0
        analysis[key] = {"total": total, "label": info["label"], "color": info["color"], "budget": budget}
    return {"success": True, "monthYear": month_year, "analysis": analysis, "overallTotal": overall}


# ─── Draft / Approval Workflow ────────────────────────────────────

async def submit_draft(payload: dict, current: dict) -> dict:
    db = get_db()
    username = current["sub"]
    recorder_name, recorder_line_id = await _get_user_line_info(db, username)

    category = payload.get("category", "")
    date_str = payload.get("date", "")
    rows = payload.get("rows", [])
    cat_key = CAT_KEY_MAP.get(category, "unknown")

    total = 0.0
    details = []
    notes = []
    line_items = []
    for row in rows:
        t, d, n = calc_expense_total(category, row)
        total += t
        if d: details.append(d)
        if n: notes.append(n)
        if t > 0 or d:
            line_items.append({"detail": d or n or "รายการ", "amount": t})

    return await _submit_draft_internal(
        db, username, recorder_name, recorder_line_id,
        category, cat_key, rows, total,
        ", ".join(details), ", ".join(notes), date_str,
        line_items=line_items,
    )


async def get_drafts(current: dict, status: str = "pending") -> dict:
    db = get_db()
    username = current["sub"]
    role = current.get("role", "")
    query = {}
    if role not in ACCOUNTING_ROLES:
        query["recorder"] = username
    if status and status != "all":
        query["status"] = status
    cursor = db.expense_drafts.find(query).sort("submittedAt", -1).limit(200)
    drafts = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        drafts.append(doc)
    return {"success": True, "drafts": drafts, "isManager": role in ACCOUNTING_ROLES}


async def approve_draft(draft_id: str, current: dict) -> dict:
    db = get_db()
    username = current["sub"]
    now = datetime.now(timezone.utc)

    approver = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1, "lineUid": 1})
    approver_name = f"{approver.get('firstName', '')} {approver.get('lastName', '')}".strip() or approver.get("name", username) if approver else username
    approver_line_id = approver.get("lineUid", "") if approver else ""

    # Atomic claim — ป้องกัน manager หลายคนอนุมัติซ้อนกัน
    draft = await db.expense_drafts.find_one_and_update(
        {"_id": draft_id, "status": "pending"},
        {"$set": {"status": "approved", "reviewedBy": approver_name, "reviewedAt": now.isoformat()}},
    )
    if not draft:
        existing = await db.expense_drafts.find_one({"_id": draft_id})
        if not existing:
            raise ValueError("ไม่พบรายการ")
        raise ValueError("รายการนี้ดำเนินการไปแล้ว")

    category = draft["category"]
    expense_ids = []
    for row in draft["rows"]:
        total, detail, note = calc_expense_total(category, row)
        if total <= 0 and not detail:
            continue
        doc = {
            "_id": str(uuid.uuid4()),
            "date": draft["date"],
            "date_iso": draft["date_iso"],
            "category": category,
            "catKey": draft["catKey"],
            "amount": total,
            "recorder": draft["recorder"],
            "recorderName": draft["recorderName"],
            "recorderLineId": draft["recorderLineId"],
            "detail": detail,
            "note": note,
            "rows": [row],
            "approvedBy": username,
            "approverName": approver_name,
            "approverLineId": approver_line_id,
            "approvedAt": now.isoformat(),
            "draftId": draft_id,
            "createdAt": now.isoformat(),
        }
        await db.expenses.insert_one(doc)
        expense_ids.append(doc["_id"])

    # อัปเดตเฉพาะ approvedExpenseIds (status ถูก claim atomically แล้วข้างบน)
    await db.expense_drafts.update_one(
        {"_id": draft_id},
        {"$set": {"approvedExpenseIds": expense_ids}}
    )

    # Notify recorder
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "recipientUsername": draft["recorder"],
        "senderUsername": username,
        "type": "expense_approved",
        "title": "✅ รายการได้รับการอนุมัติ",
        "body": f"{approver_name} อนุมัติรายการ{category} วันที่ {draft['date']} ยอด ฿{draft['total']:,.0f} แล้ว",
        "read": False,
        "createdAt": now,
        "data": {"draftId": draft_id},
    })

    return {"success": True, "message": "อนุมัติสำเร็จ", "expenseIds": expense_ids}


async def reject_draft(draft_id: str, reason: str, current: dict) -> dict:
    db = get_db()
    username = current["sub"]
    now = datetime.now(timezone.utc)

    approver = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1})
    approver_name = f"{approver.get('firstName', '')} {approver.get('lastName', '')}".strip() or approver.get("name", username) if approver else username

    # Atomic claim — ป้องกัน manager หลายคนปฏิเสธซ้อนกัน
    draft = await db.expense_drafts.find_one_and_update(
        {"_id": draft_id, "status": "pending"},
        {"$set": {"status": "rejected", "reviewedBy": approver_name, "reviewedAt": now.isoformat(), "rejectReason": reason}},
    )
    if not draft:
        existing = await db.expense_drafts.find_one({"_id": draft_id})
        if not existing:
            raise ValueError("ไม่พบรายการ")
        raise ValueError("รายการนี้ดำเนินการไปแล้ว")

    # Notify recorder
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "recipientUsername": draft["recorder"],
        "senderUsername": username,
        "type": "expense_rejected",
        "title": "❌ รายการไม่ผ่านการอนุมัติ",
        "body": f"{approver_name} ไม่อนุมัติรายการ{draft['category']} วันที่ {draft['date']} — เหตุผล: {reason or 'ไม่ระบุ'}",
        "read": False,
        "createdAt": now,
        "data": {"draftId": draft_id, "reason": reason},
    })

    # ── Rejection email ───────────────────────────────────────────────────────
    try:
        db2 = get_db()
        smtp_doc = await db2.system_settings.find_one({"_id": "system_settings"}) or {}
        recorder_user = await db2.users.find_one({"username": draft["recorder"]}, {"_id": 0, "email": 1})
        recorder_email = recorder_user.get("email", "") if recorder_user else ""
        if recorder_email:
            from .email_service import send_rejection_email
            await send_rejection_email(recorder_email, draft["recorderName"], draft["category"], draft["date"], reason, smtp_doc)
    except Exception as _e:
        print(f"[Reject] Email failed: {_e}")

    return {"success": True, "message": "ปฏิเสธรายการแล้ว"}


async def submit_draft_dynamic(payload: dict, current: dict) -> dict:
    """Submit draft using dynamic category (catId instead of hardcoded name)."""
    db = get_db()
    username = current["sub"]
    cat_id = payload.get("catId", "")

    cat = await get_category_by_id(cat_id)
    if not cat:
        raise ValueError(f"ไม่พบหมวด: {cat_id}")

    recorder_name, recorder_line_id = await _get_user_line_info(db, username)

    date_str = payload.get("date", "")
    rows = payload.get("rows", [])

    total = 0.0
    details = []
    line_items = []
    for row in rows:
        t, d = calc_total_dynamic(cat, row)
        total += t
        if d:
            details.append(d)
        if t > 0 or d:
            line_items.append({"detail": d or "รายการ", "amount": t})

    return await _submit_draft_internal(
        db, username, recorder_name, recorder_line_id,
        cat["name"], cat_id, rows, total,
        ", ".join(details), payload.get("note", ""), date_str,
        line_items=line_items,
    )


async def submit_draft_dynamic_public(payload: dict) -> dict:
    """Submit draft without auth (standalone page) — username/lineUid มาจาก payload ที่ verify ด้วย stoken แล้ว."""
    db = get_db()
    username      = payload.get("username", "")
    recorder_name = payload.get("recorderName", "") or username or "ไม่ได้ระบุชื่อ"
    recorder_line_id = payload.get("recorderLineUid", "")

    cat_id = payload.get("catId", "")
    cat = await get_category_by_id(cat_id)
    if not cat:
        raise ValueError(f"ไม่พบหมวด: {cat_id}")

    date_str = payload.get("date", "")
    rows = payload.get("rows", [])

    total = 0.0
    details = []
    line_items = []
    for row in rows:
        t, d = calc_total_dynamic(cat, row)
        total += t
        if d:
            details.append(d)
        if t > 0 or d:
            line_items.append({"detail": d or "รายการ", "amount": t})

    return await _submit_draft_internal(
        db, username, recorder_name, recorder_line_id,
        cat["name"], cat_id, rows, total,
        ", ".join(details), payload.get("note", ""), date_str,
        is_standalone=True,
        line_items=line_items,
    )


async def approve_draft_dynamic(draft_id: str, current: dict) -> dict:
    """Approve draft — supports both legacy and dynamic categories."""
    db = get_db()
    username = current["sub"]
    now = datetime.now(timezone.utc)

    approver = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1, "lineUid": 1})
    approver_name = f"{approver.get('firstName', '')} {approver.get('lastName', '')}".strip() or approver.get("name", username) if approver else username
    approver_line_id = approver.get("lineUid", "") if approver else ""

    # Atomic claim — ป้องกัน manager หลายคนอนุมัติซ้อนกัน
    draft = await db.expense_drafts.find_one_and_update(
        {"_id": draft_id, "status": "pending"},
        {"$set": {"status": "approved", "reviewedBy": approver_name, "reviewedAt": now.isoformat()}},
    )
    if not draft:
        existing = await db.expense_drafts.find_one({"_id": draft_id})
        if not existing:
            raise ValueError("ไม่พบรายการ")
        raise ValueError("รายการนี้ดำเนินการไปแล้ว")

    cat_id = draft["catKey"]
    cat = await get_category_by_id(cat_id)
    expense_ids = []
    for row in draft["rows"]:
        if cat:
            total, detail = calc_total_dynamic(cat, row)
            note = row.get("note", "")
        else:
            # fallback to legacy
            total, detail, note = calc_expense_total(draft["category"], row)
        if total <= 0 and not detail:
            continue
        doc = {
            "_id": str(uuid.uuid4()),
            "date": draft["date"],
            "date_iso": draft.get("date_iso", ""),
            "category": draft["category"],
            "catKey": cat_id,
            "amount": total,
            "recorder": draft["recorder"],
            "recorderName": draft["recorderName"],
            "recorderLineId": draft.get("recorderLineId", ""),
            "detail": detail,
            "note": note,
            "rows": [row],
            "approvedBy": username,
            "approverName": approver_name,
            "approverLineId": approver_line_id,
            "approvedAt": now.isoformat(),
            "draftId": draft_id,
            "createdAt": now.isoformat(),
        }
        await db.expenses.insert_one(doc)
        expense_ids.append(doc["_id"])

    # อัปเดตเฉพาะ approvedExpenseIds (status ถูก claim atomically แล้วข้างบน)
    await db.expense_drafts.update_one(
        {"_id": draft_id},
        {"$set": {"approvedExpenseIds": expense_ids}}
    )

    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "recipientUsername": draft["recorder"],
        "senderUsername": username,
        "type": "expense_approved",
        "title": "✅ รายการได้รับการอนุมัติ",
        "body": f"{approver_name} อนุมัติรายการ{draft['category']} วันที่ {draft['date']} ยอด ฿{draft['total']:,.0f} แล้ว",
        "read": False,
        "createdAt": now,
        "data": {"draftId": draft_id},
    })

    # ── Email + PDF + LINE OA ─────────────────────────────────────────────────
    try:
        db2 = get_db()
        smtp_doc = await db2.system_settings.find_one({"_id": "system_settings"}) or {}

        # Fetch recorder email
        recorder_user = await db2.users.find_one({"username": draft["recorder"]}, {"_id": 0, "email": 1})
        recorder_email = recorder_user.get("email", "") if recorder_user else ""

        if recorder_email:
            from .email_service import send_approval_email
            # PDF link: generate on-the-fly and store
            from .report_service import build_report_data
            from .pdf_service import generate_expense_report_pdf
            from ..routers.reports import _pdf_store, _pdf_save, _pdf_path
            import uuid as _uuid
            try:
                report_data = await build_report_data(cat_id, "daily", now)
                pdf_bytes = generate_expense_report_pdf(report_data)
                report_id = str(_uuid.uuid4())
                _pdf_save(report_id, pdf_bytes)
                _pdf_store[report_id] = _pdf_path(report_id)
                pdf_url = f"/api/reports/download/{report_id}"
            except Exception as _e:
                print(f"[Approve] PDF gen failed: {_e}")
                pdf_url = ""
            await send_approval_email(recorder_email, draft["recorderName"], draft["category"], draft["date"], draft["total"], pdf_url, smtp_doc)

        # ── ส่ง LINE OA หลังอนุมัติ (ใช้ mainLineOa + moduleConnections.expense) ──
        main_oa   = smtp_doc.get("mainLineOa") or {}
        oa_token  = main_oa.get("token", "")
        mc        = smtp_doc.get("moduleConnections") or {}
        target_id = mc.get("expense", "")
        if oa_token:
            from .report_service import build_report_data as _brd
            from .pdf_service import generate_expense_report_pdf as _genpdf
            from .line_oa_service import push_line_report
            from ..routers.reports import _pdf_store as _ps, _pdf_save as _psave, _pdf_path as _ppath
            import uuid as _u2
            try:
                rd  = await _brd(cat_id, "daily", now)
                pb  = _genpdf(rd)
                rid = str(_u2.uuid4())
                _psave(rid, pb)
                _ps[rid] = _ppath(rid)
                await push_line_report(oa_token, target_id, rd, f"/api/reports/download/{rid}")
            except Exception as _e2:
                print(f"[Approve] LINE push failed: {_e2}")
    except Exception as _e3:
        print(f"[Approve] Post-approval hook failed: {_e3}")

    return {"success": True, "message": "อนุมัติสำเร็จ", "expenseIds": expense_ids}


async def get_monthly_analysis_dynamic(month_year: Optional[str] = None) -> dict:
    """Analysis ที่ดึงหมวดจาก dynamic categories."""
    from .category_service import get_all_categories
    db = get_db()
    today = datetime.now()
    if not month_year:
        month_year = f"{today.month:02d}/{today.year}"
    parts = month_year.split("/")
    if len(parts) != 2:
        return {"success": False, "message": "รูปแบบเดือนไม่ถูกต้อง"}
    mm, yyyy = parts[0].zfill(2), parts[1]

    pipeline = [
        {"$match": {"date_iso": {"$regex": f"^{yyyy}-{mm}"}}},
        {"$group": {"_id": "$catKey", "total": {"$sum": "$amount"}}},
    ]
    result = await db.expenses.aggregate(pipeline).to_list(None)
    totals = {r["_id"]: r["total"] for r in result}

    budget_doc = await db.budgets.find_one({"monthYear": month_year}) or {}
    budgets_data = budget_doc.get("budgets", {})

    categories = await get_all_categories()
    analysis = {}
    overall = 0.0
    entries = []
    for cat in categories:
        key = cat["id"]
        total = totals.get(key, 0.0)
        overall += total
        budget = budgets_data.get(key, {}).get("monthly", 0) if budgets_data else 0
        entry = {
            "catKey": key,
            "total":  total,
            "label":  cat["name"],
            "color":  cat["color"],
            "icon":   cat["icon"],
            "budget": budget,
        }
        analysis[key] = entry
        entries.append(entry)
    return {"success": True, "monthYear": month_year, "analysis": analysis, "overallTotal": overall, "categories": entries}


async def get_expense_history(month_year: Optional[str] = None, cat_key: Optional[str] = None,
                               search: Optional[str] = None, page: int = 1, per_page: int = 20) -> dict:
    db = get_db()
    query: dict = {}
    if month_year:
        parts = month_year.split("/")
        if len(parts) == 2:
            mm, yyyy = parts[0].zfill(2), parts[1]
            query["date_iso"] = {"$regex": f"^{yyyy}-{mm}"}
    if cat_key and cat_key != "all":
        query["catKey"] = cat_key
    if search and search.strip():
        s = search.strip()
        query["$or"] = [
            {"detail": {"$regex": s, "$options": "i"}},
            {"recorder": {"$regex": s, "$options": "i"}},
            {"recorderName": {"$regex": s, "$options": "i"}},
            {"note": {"$regex": s, "$options": "i"}},
            {"date": {"$regex": s, "$options": "i"}},
        ]
    total = await db.expenses.count_documents(query)
    skip = (page - 1) * per_page
    cursor = db.expenses.find(query).sort("date_iso", -1).skip(skip).limit(per_page)
    expenses = []
    async for doc in cursor:
        expenses.append({
            "id": doc.get("_id", ""),
            "date": doc.get("date", ""),
            "category": doc.get("category", ""),
            "catKey": doc.get("catKey", ""),
            "amount": doc.get("amount", 0),
            "recorder": doc.get("recorder", ""),
            "recorderName": doc.get("recorderName", doc.get("recorder", "")),
            "recorderLineId": doc.get("recorderLineId", ""),
            "detail": doc.get("detail", ""),
            "note": doc.get("note", ""),
            "approvedBy": doc.get("approvedBy"),
            "approverName": doc.get("approverName", doc.get("approvedBy", "")),
            "approverLineId": doc.get("approverLineId", ""),
            "approvedAt": doc.get("approvedAt"),
            "draftId": doc.get("draftId"),
        })
    return {
        "success": True,
        "expenses": expenses,
        "total": total,
        "page": page,
        "perPage": per_page,
        "totalPages": max(1, (total + per_page - 1) // per_page),
    }
