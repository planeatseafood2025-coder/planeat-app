"""
Shared helpers for monthly budget calculations.
Centralises the date_iso $regex pattern and budget lookup used in
budget_service.py, line_webhook.py, and reports.py.
"""

from typing import Optional
import calendar as _cal
from datetime import datetime


def month_regex(yyyy: int, mm: int) -> str:
    """Return regex prefix for matching date_iso in a given month, e.g. '^2026-05'"""
    return f"^{yyyy}-{mm:02d}"


def parse_month_year(month_year: str) -> tuple[int, int]:
    """Parse 'MM/YYYY' → (yyyy, mm). Raises ValueError on bad format."""
    parts = month_year.split("/")
    if len(parts) != 2:
        raise ValueError(f"Invalid monthYear format: {month_year!r} — expected MM/YYYY")
    mm, yyyy = int(parts[0]), int(parts[1])
    return yyyy, mm


def current_month_year() -> tuple[int, int]:
    """Return (yyyy, mm) for today."""
    now = datetime.now()
    return now.year, now.month


def month_year_str(yyyy: int, mm: int) -> str:
    """Return 'MM/YYYY' string used as budget document key."""
    return f"{mm:02d}/{yyyy}"


def days_in_month(yyyy: int, mm: int) -> int:
    return _cal.monthrange(yyyy, mm)[1]


async def get_monthly_spent(db, cat_key: str, yyyy: int, mm: int) -> float:
    """Sum expenses for one category in a given month."""
    agg = await db.expenses.aggregate([
        {"$match": {"date_iso": {"$regex": month_regex(yyyy, mm)}, "catKey": cat_key}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(None)
    return float(agg[0]["total"]) if agg else 0.0


async def get_monthly_spent_all(db, yyyy: int, mm: int) -> dict[str, float]:
    """Sum expenses for ALL categories in a given month. Returns {catKey: total}."""
    agg = await db.expenses.aggregate([
        {"$match": {"date_iso": {"$regex": month_regex(yyyy, mm)}}},
        {"$group": {"_id": "$catKey", "total": {"$sum": "$amount"}}},
    ]).to_list(None)
    return {row["_id"]: float(row["total"]) for row in agg}


async def get_budget_doc(db, yyyy: int, mm: int) -> Optional[dict]:
    """Fetch budget document for a month. Returns None if not set."""
    return await db.budgets.find_one({"monthYear": month_year_str(yyyy, mm)})


async def get_cat_monthly_budget(db, cat_key: str, yyyy: int, mm: int) -> float:
    """Return the monthly budget amount for one category. Returns 0.0 if not set."""
    doc = await get_budget_doc(db, yyyy, mm)
    if not doc:
        return 0.0
    return float(doc.get("budgets", {}).get(cat_key, {}).get("monthly", 0))
