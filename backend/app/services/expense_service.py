"""
Expense service — mirrors FinanceController.gs logic.
"""
import uuid
from datetime import datetime
from typing import Optional
from ..database import get_db

CAT_KEY_MAP = {
    "ค่าแรงงาน":                     "labor",
    "ค่าวัตถุดิบ":                    "raw",
    "ค่าเคมี/หีบห่อ/ส่วนผสม":        "chem",
    "ค่าซ่อมแซมและบำรุงรักษา":        "repair",
}

CAT_KEY_REVERSE = {v: k for k, v in CAT_KEY_MAP.items()}


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


def calc_expense_total(category: str, row: dict) -> tuple[float, str]:
    """
    Calculate total and detail string for a single row.
    Mirrors GAS FinanceController calculation logic.
    """
    cat_key = CAT_KEY_MAP.get(category, "")

    if cat_key == "labor":
        workers = float(row.get("workers", 0))
        wage = float(row.get("dailyWage", 0))
        ot = float(row.get("ot", 0))
        total = workers * wage + ot
        detail = f"{int(workers)} คน × {wage:.0f}฿ + OT {ot:.0f}฿"
        note = row.get("note", "")
        return total, detail, note

    elif cat_key == "raw":
        qty = float(row.get("quantity", 0))
        price = float(row.get("pricePerKg", 0))
        total = qty * price
        name = row.get("itemName", "")
        detail = f"{name} {qty}กก. × {price:.2f}฿/กก."
        note = row.get("note", "")
        return total, detail, note

    elif cat_key == "chem":
        qty = float(row.get("quantity", 0))
        price = float(row.get("price", 0))
        total = qty * price
        name = row.get("itemName", "")
        detail = f"{name} {qty} × {price:.2f}฿"
        note = row.get("note", "")
        return total, detail, note

    elif cat_key == "repair":
        total = float(row.get("totalCost", 0))
        item = row.get("repairItem", "")
        detail = item
        note = row.get("note", "")
        return total, detail, note

    return 0.0, "", ""


async def save_expense(payload: dict) -> dict:
    db = get_db()
    username = payload.get("username", "")
    category = payload.get("category", "")
    date_str = payload.get("date", "")  # dd/MM/yyyy
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
            "detail": detail,
            "note": note,
            "rows": [row],
            "createdAt": datetime.utcnow().isoformat(),
        }
        await db.expenses.insert_one(doc)
        saved_count += 1

    # Log activity
    await db.activity_logs.insert_one({
        "username": username,
        "action": "saveExpense",
        "detail": f"บันทึก {saved_count} รายการ หมวด {category}",
        "timestamp": datetime.utcnow().isoformat(),
    })

    return {"success": True, "message": f"บันทึกสำเร็จ {saved_count} รายการ"}


async def get_expenses(month_year: Optional[str] = None) -> dict:
    """
    month_year: MM/yyyy or None (current month)
    Returns expenses sorted by date desc.
    """
    db = get_db()
    query = {}

    if month_year:
        parts = month_year.split("/")
        if len(parts) == 2:
            mm, yyyy = parts[0].zfill(2), parts[1]
            # Filter by date_iso prefix YYYY-MM
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
    """
    Returns aggregate totals per category for a month.
    Mirrors getMonthlyAnalysisData in AnalysisController.gs
    """
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

    # Get budgets
    budget_doc = await db.budgets.find_one({"monthYear": month_year}) or {}
    budgets_data = budget_doc.get("budgets", {})

    cat_info = {
        "labor":  {"label": "ค่าแรงงาน",             "color": "#f59e0b"},
        "raw":    {"label": "ค่าวัตถุดิบ",            "color": "#10b981"},
        "chem":   {"label": "ค่าเคมี/หีบห่อ/ส่วนผสม","color": "#8b5cf6"},
        "repair": {"label": "ค่าซ่อมแซมและบำรุงรักษา","color": "#f43f5e"},
    }

    analysis = {}
    overall = 0.0
    for key, info in cat_info.items():
        total = totals.get(key, 0.0)
        overall += total
        budget = budgets_data.get(key, {}).get("monthly", 0) if budgets_data else 0
        analysis[key] = {
            "total": total,
            "label": info["label"],
            "color": info["color"],
            "budget": budget,
        }

    return {
        "success": True,
        "monthYear": month_year,
        "analysis": analysis,
        "overallTotal": overall,
    }
