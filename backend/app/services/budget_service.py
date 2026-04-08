"""
Budget service — mirrors getBudgetSummary / setBudget in FinanceController.gs
"""
from datetime import datetime
from typing import Optional
from ..database import get_db


def _days_in_month(month: int, year: int) -> int:
    import calendar
    return calendar.monthrange(year, month)[1]


async def get_budget_summary(month_year: Optional[str] = None) -> dict:
    """
    Returns budget + spent amounts for 4 categories.
    Mirrors getBudgetSummary(monthYear) in FinanceController.gs
    """
    db = get_db()
    today = datetime.now()
    if not month_year:
        month_year = f"{today.month:02d}/{today.year}"

    parts = month_year.split("/")
    mm, yyyy = int(parts[0]), int(parts[1])
    current_day = today.day if (today.month == mm and today.year == yyyy) else _days_in_month(mm, yyyy)

    # Load budget doc
    budget_doc = await db.budgets.find_one({"monthYear": month_year}) or {}
    budgets_raw = budget_doc.get("budgets", {})

    # Get spent per category for this month
    pipeline = [
        {"$match": {"date_iso": {"$regex": f"^{yyyy}-{mm:02d}"}}},
        {"$group": {"_id": "$catKey", "total": {"$sum": "$amount"}}},
    ]
    agg = await db.expenses.aggregate(pipeline).to_list(None)
    spent_month = {r["_id"]: r["total"] for r in agg}

    # Get spent today
    today_iso = today.strftime("%Y-%m-%d")
    pipeline_today = [
        {"$match": {"date_iso": today_iso}},
        {"$group": {"_id": "$catKey", "total": {"$sum": "$amount"}}},
    ]
    agg_today = await db.expenses.aggregate(pipeline_today).to_list(None)
    spent_today = {r["_id"]: r["total"] for r in agg_today}

    # Load dynamic categories from DB
    cat_docs = await db.expense_categories.find({"isActive": True}).sort("order", 1).to_list(None)
    if not cat_docs:
        cat_docs = [{"_id": k, "name": k, "color": "#64748b", "icon": "receipt_long"} for k in ["labor", "raw", "chem", "repair"]]

    data = {}
    for cat_doc in cat_docs:
        cat_id = cat_doc["_id"]
        cat_budget = budgets_raw.get(cat_id, {})
        monthly = float(cat_budget.get("monthly", 0))
        daily_rate = float(cat_budget.get("daily", 0))
        s_today = spent_today.get(cat_id, 0.0)
        s_month = spent_month.get(cat_id, 0.0)
        remain_day = (current_day * daily_rate) - s_month
        remain_month = monthly - s_month
        data[cat_id] = {
            "monthlyBudget": monthly,
            "dailyRate": daily_rate,
            "spentToday": s_today,
            "spentMonth": s_month,
            "remainDay": remain_day,
            "remainMonth": remain_month,
            "currentDay": current_day,
            "label": cat_doc.get("name", cat_id),
            "color": cat_doc.get("color", "#64748b"),
            "icon": cat_doc.get("icon", "receipt_long"),
        }

    return {
        "success": True,
        "data": data,
        "monthYear": month_year,
        "currentDay": current_day,
    }


async def set_budget(payload: dict) -> dict:
    """
    Save/update budget for a given monthYear.
    Mirrors setBudget(budgetData) in FinanceController.gs
    """
    db = get_db()
    month_year = payload.get("monthYear", "")
    budgets = payload.get("budgets", {})
    username = payload.get("username", "")

    if not month_year:
        return {"success": False, "message": "monthYear is required"}

    # Upsert
    await db.budgets.update_one(
        {"monthYear": month_year},
        {
            "$set": {
                "monthYear": month_year,
                "budgets": budgets,
                "updatedBy": username,
                "updatedAt": datetime.utcnow().isoformat(),
            }
        },
        upsert=True,
    )

    # Log
    await db.activity_logs.insert_one({
        "username": username,
        "action": "setBudget",
        "detail": f"ตั้งงบประมาณ {month_year}",
        "timestamp": datetime.utcnow().isoformat(),
    })

    return {"success": True, "message": f"บันทึกงบประมาณ {month_year} เรียบร้อย"}
