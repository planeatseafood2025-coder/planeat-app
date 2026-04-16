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


async def get_yearly_budget_vs_actual(year: int = None) -> dict:
    """
    Budget vs Actual รายเดือนตลอดปี สำหรับผู้บริหาร
    คืน: { year, categories: [{id,name,color,icon,months:[{month,budget,spent,variance,pct}],
           ytdBudget,ytdSpent,ytdVariance,ytdPct,status}], grandTotal }
    """
    from datetime import datetime
    db = get_db()
    now = datetime.now()
    if not year:
        year = now.year

    # ─── 1. ดึงหมวดหมู่ทั้งหมด ─────────────────────────────────────────
    cat_docs = await db.expense_categories.find({"isActive": True}).sort("order", 1).to_list(None)

    # ─── 2. ยอดจริงต่อหมวด × เดือน ────────────────────────────────────
    pipeline = [
        {"$match": {"date_iso": {"$regex": f"^{year}-"}}},
        {"$addFields": {"month_str": {"$substr": ["$date_iso", 5, 2]}}},
        {"$group": {"_id": {"catKey": "$catKey", "month": "$month_str"}, "total": {"$sum": "$amount"}}},
    ]
    agg = await db.expenses.aggregate(pipeline).to_list(None)
    # spent_map[catKey][month_int] = amount
    spent_map: dict = {}
    for r in agg:
        ck = r["_id"]["catKey"]
        mo = int(r["_id"]["month"])
        spent_map.setdefault(ck, {})[mo] = r["total"]

    # ─── 3. งบประมาณต่อหมวด × เดือน ────────────────────────────────────
    budget_docs = await db.budgets.find(
        {"monthYear": {"$regex": f"/{year}$"}}
    ).to_list(None)
    # budget_map[catKey][month_int] = monthly_budget
    budget_map: dict = {}
    for doc in budget_docs:
        my = doc.get("monthYear", "")        # "MM/YYYY"
        try:
            mo = int(my.split("/")[0])
        except Exception:
            continue
        for ck, bdata in doc.get("budgets", {}).items():
            budget_map.setdefault(ck, {})[mo] = float(bdata.get("monthly", 0))

    # ─── 4. สร้าง result ─────────────────────────────────────────────────
    current_month = now.month if now.year == year else 12
    categories = []
    grand_ytd_budget = 0.0
    grand_ytd_spent  = 0.0

    for cat in cat_docs:
        ck    = cat["_id"]
        months = []
        ytd_b = 0.0
        ytd_s = 0.0

        for mo in range(1, 13):
            budget = budget_map.get(ck, {}).get(mo, 0.0)
            spent  = spent_map.get(ck, {}).get(mo, 0.0)
            future = (year == now.year and mo > current_month) or year > now.year
            variance = budget - spent
            pct = round(spent / budget * 100, 1) if budget > 0 else (None if spent == 0 else 999)
            months.append({
                "month":    mo,
                "budget":   budget,
                "spent":    spent,
                "variance": variance,
                "pct":      pct,
                "future":   future,
            })
            if not future:
                ytd_b += budget
                ytd_s += spent

        ytd_var = ytd_b - ytd_s
        ytd_pct = round(ytd_s / ytd_b * 100, 1) if ytd_b > 0 else (None if ytd_s == 0 else 999)
        if ytd_pct is None:
            status = "nodata"
        elif ytd_pct > 100:
            status = "over"
        elif ytd_pct > 80:
            status = "warning"
        else:
            status = "good"

        grand_ytd_budget += ytd_b
        grand_ytd_spent  += ytd_s

        categories.append({
            "id":         ck,
            "name":       cat.get("name", ck),
            "color":      cat.get("color", "#64748b"),
            "icon":       cat.get("icon", "receipt_long"),
            "months":     months,
            "ytdBudget":  ytd_b,
            "ytdSpent":   ytd_s,
            "ytdVariance":ytd_var,
            "ytdPct":     ytd_pct,
            "status":     status,
        })

    grand_var = grand_ytd_budget - grand_ytd_spent
    grand_pct = round(grand_ytd_spent / grand_ytd_budget * 100, 1) if grand_ytd_budget > 0 else 0.0

    return {
        "success":    True,
        "year":       year,
        "categories": categories,
        "grandTotal": {
            "ytdBudget":   grand_ytd_budget,
            "ytdSpent":    grand_ytd_spent,
            "ytdVariance": grand_var,
            "ytdPct":      grand_pct,
            "status":      "over" if grand_pct > 100 else ("warning" if grand_pct > 80 else "good"),
        },
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

    # Auto-compute daily = monthly ÷ days ถ้า daily ไม่ได้ตั้งไว้
    try:
        parts = month_year.split("/")
        mm, yyyy = int(parts[0]), int(parts[1])
        import calendar as _cal
        days_in_month = _cal.monthrange(yyyy, mm)[1]
        for cat_key, vals in budgets.items():
            if isinstance(vals, dict):
                monthly = float(vals.get("monthly", 0))
                daily   = float(vals.get("daily", 0))
                if monthly > 0 and daily == 0:
                    vals["daily"] = round(monthly / days_in_month, 2)
    except Exception:
        pass

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
