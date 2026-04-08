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


def calc_expense_total(category: str, row: dict) -> tuple:
    cat_key = CAT_KEY_MAP.get(category, "")
    if cat_key == "labor":
        workers = float(row.get("workers", 0))
        wage = float(row.get("dailyWage", 0))
        ot = float(row.get("ot", 0))
        total = workers * wage + ot
        detail = f"{int(workers)} คน × {wage:.0f}฿ + OT {ot:.0f}฿"
        return total, detail, row.get("note", "")
    elif cat_key == "raw":
        qty = float(row.get("quantity", 0))
        price = float(row.get("pricePerKg", 0))
        total = qty * price
        name = row.get("itemName", "")
        detail = f"{name} {qty}กก. × {price:.2f}฿/กก."
        return total, detail, row.get("note", "")
    elif cat_key == "chem":
        qty = float(row.get("quantity", 0))
        price = float(row.get("price", 0))
        total = qty * price
        name = row.get("itemName", "")
        detail = f"{name} {qty} × {price:.2f}฿"
        return total, detail, row.get("note", "")
    elif cat_key == "repair":
        total = float(row.get("totalCost", 0))
        item = row.get("repairItem", "")
        return total, item, row.get("note", "")
    return 0.0, "", ""


async def save_expense(payload: dict) -> dict:
    db = get_db()
    username = payload.get("username", "")
    category = payload.get("category", "")
    date_str = payload.get("date", "")
    rows = payload.get("rows", [])
    cat_key = CAT_KEY_MAP.get(category, "unknown")
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
            "recorderName": username,
            "recorderLineId": "",
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
    user = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1, "lineId": 1})
    recorder_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get("name", username) if user else username
    recorder_line_id = user.get("lineId", "") if user else ""

    category = payload.get("category", "")
    date_str = payload.get("date", "")
    rows = payload.get("rows", [])
    cat_key = CAT_KEY_MAP.get(category, "unknown")

    total = 0.0
    details = []
    notes = []
    for row in rows:
        t, d, n = calc_expense_total(category, row)
        total += t
        if d: details.append(d)
        if n: notes.append(n)

    now = datetime.now(timezone.utc)
    draft = {
        "_id": str(uuid.uuid4()),
        "recorder": username,
        "recorderName": recorder_name,
        "recorderLineId": recorder_line_id,
        "date": date_str,
        "date_iso": thai_date_to_iso(date_str),
        "category": category,
        "catKey": cat_key,
        "rows": rows,
        "total": total,
        "detail": ", ".join(details),
        "note": ", ".join(notes),
        "status": "pending",
        "submittedAt": now.isoformat(),
        "reviewedBy": None,
        "reviewedAt": None,
        "rejectReason": "",
        "approvedExpenseIds": [],
    }
    await db.expense_drafts.insert_one(draft)

    # Notify accounting managers
    admins = await db.users.find(
        {"role": {"$in": ACCOUNTING_ROLES}, "status": "active"},
        {"username": 1}
    ).to_list(50)
    notifs = []
    for admin in admins:
        if admin["username"] == username:
            continue
        notifs.append({
            "id": str(uuid.uuid4()),
            "recipientUsername": admin["username"],
            "senderUsername": username,
            "type": "expense_draft",
            "title": "รายการใหม่รอตรวจสอบ",
            "body": f"{recorder_name} ส่งรายการ{category} วันที่ {date_str} ยอด ฿{total:,.0f} รอการอนุมัติ",
            "read": False,
            "createdAt": now,
            "data": {"draftId": draft["_id"]},
        })
    if notifs:
        await db.notifications.insert_many(notifs)

    return {"success": True, "message": "ส่งรายการเพื่อขออนุมัติสำเร็จ", "draftId": draft["_id"]}


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
    draft = await db.expense_drafts.find_one({"_id": draft_id})
    if not draft:
        raise ValueError("ไม่พบรายการ")
    if draft["status"] != "pending":
        raise ValueError("รายการนี้ดำเนินการไปแล้ว")

    approver = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1, "lineId": 1})
    approver_name = f"{approver.get('firstName', '')} {approver.get('lastName', '')}".strip() or approver.get("name", username) if approver else username
    approver_line_id = approver.get("lineId", "") if approver else ""

    now = datetime.now(timezone.utc)
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

    await db.expense_drafts.update_one(
        {"_id": draft_id},
        {"$set": {"status": "approved", "reviewedBy": username, "reviewedAt": now.isoformat(), "approvedExpenseIds": expense_ids}}
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

    # [PORT] LINE Group — เตรียมไว้สำหรับเชื่อมต่อภายหลัง
    # line_group_message = f"✅ อนุมัติแล้ว\nผู้บันทึก: {draft['recorderName']}\nหมวด: {category}\nวันที่: {draft['date']}\nยอด: ฿{draft['total']:,.0f}\nอนุมัติโดย: {approver_name}"
    # await send_line_group(line_group_message)

    return {"success": True, "message": "อนุมัติสำเร็จ", "expenseIds": expense_ids}


async def reject_draft(draft_id: str, reason: str, current: dict) -> dict:
    db = get_db()
    username = current["sub"]
    draft = await db.expense_drafts.find_one({"_id": draft_id})
    if not draft:
        raise ValueError("ไม่พบรายการ")
    if draft["status"] != "pending":
        raise ValueError("รายการนี้ดำเนินการไปแล้ว")

    approver = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1})
    approver_name = f"{approver.get('firstName', '')} {approver.get('lastName', '')}".strip() or approver.get("name", username) if approver else username

    now = datetime.now(timezone.utc)
    await db.expense_drafts.update_one(
        {"_id": draft_id},
        {"$set": {"status": "rejected", "reviewedBy": username, "reviewedAt": now.isoformat(), "rejectReason": reason}}
    )

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

    # [PORT] LINE Notify recorder — เตรียมไว้สำหรับเชื่อมต่อภายหลัง
    # recorder_line_id = draft.get("recorderLineId", "")
    # if recorder_line_id:
    #     await send_line_notify(recorder_line_id, f"รายการของคุณไม่ผ่านการอนุมัติ\nเหตุผล: {reason}")

    return {"success": True, "message": "ปฏิเสธรายการแล้ว"}


async def submit_draft_dynamic(payload: dict, current: dict) -> dict:
    """Submit draft using dynamic category (catId instead of hardcoded name)."""
    db = get_db()
    username = current["sub"]
    cat_id = payload.get("catId", "")

    cat = await get_category_by_id(cat_id)
    if not cat:
        raise ValueError(f"ไม่พบหมวด: {cat_id}")

    user = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1, "lineId": 1})
    recorder_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get("name", username) if user else username
    recorder_line_id = user.get("lineId", "") if user else ""

    date_str = payload.get("date", "")
    rows = payload.get("rows", [])

    total = 0.0
    details = []
    for row in rows:
        t, d = calc_total_dynamic(cat, row)
        total += t
        if d:
            details.append(d)

    now = datetime.now(timezone.utc)
    draft = {
        "_id": str(uuid.uuid4()),
        "recorder": username,
        "recorderName": recorder_name,
        "recorderLineId": recorder_line_id,
        "date": date_str,
        "date_iso": thai_date_to_iso(date_str),
        "category": cat["name"],
        "catKey": cat_id,
        "rows": rows,
        "total": total,
        "detail": ", ".join(details),
        "note": payload.get("note", ""),
        "status": "pending",
        "submittedAt": now.isoformat(),
        "reviewedBy": None,
        "reviewedAt": None,
        "rejectReason": "",
        "approvedExpenseIds": [],
    }
    await db.expense_drafts.insert_one(draft)

    # Notify accounting managers
    admins = await db.users.find(
        {"role": {"$in": ACCOUNTING_ROLES}, "status": "active"},
        {"username": 1}
    ).to_list(50)
    notifs = []
    for admin in admins:
        if admin["username"] == username:
            continue
        notifs.append({
            "id": str(uuid.uuid4()),
            "recipientUsername": admin["username"],
            "senderUsername": username,
            "type": "expense_draft",
            "title": "รายการใหม่รอตรวจสอบ",
            "body": f"{recorder_name} ส่งรายการ{cat['name']} วันที่ {date_str} ยอด ฿{total:,.0f} รอการอนุมัติ",
            "read": False,
            "createdAt": now,
            "data": {"draftId": draft["_id"]},
        })
    if notifs:
        await db.notifications.insert_many(notifs)

    # [PORT] LINE Group notify
    # await send_line_group(f"📋 รายการใหม่รอตรวจสอบ\n{recorder_name} | {cat['name']} | {date_str} | ฿{total:,.0f}")

    return {"success": True, "message": "ส่งรายการเพื่อขออนุมัติสำเร็จ", "draftId": draft["_id"]}


async def approve_draft_dynamic(draft_id: str, current: dict) -> dict:
    """Approve draft — supports both legacy and dynamic categories."""
    db = get_db()
    username = current["sub"]
    draft = await db.expense_drafts.find_one({"_id": draft_id})
    if not draft:
        raise ValueError("ไม่พบรายการ")
    if draft["status"] != "pending":
        raise ValueError("รายการนี้ดำเนินการไปแล้ว")

    approver = await db.users.find_one({"username": username}, {"_id": 0, "name": 1, "firstName": 1, "lastName": 1, "lineId": 1})
    approver_name = f"{approver.get('firstName', '')} {approver.get('lastName', '')}".strip() or approver.get("name", username) if approver else username
    approver_line_id = approver.get("lineId", "") if approver else ""

    cat_id = draft["catKey"]
    cat = await get_category_by_id(cat_id)

    now = datetime.now(timezone.utc)
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

    await db.expense_drafts.update_one(
        {"_id": draft_id},
        {"$set": {"status": "approved", "reviewedBy": username, "reviewedAt": now.isoformat(), "approvedExpenseIds": expense_ids}}
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

    # [PORT] LINE Group
    # await send_line_group(f"✅ อนุมัติแล้ว\n{draft['recorderName']} | {draft['category']} | {draft['date']} | ฿{draft['total']:,.0f}\nโดย: {approver_name}")

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
