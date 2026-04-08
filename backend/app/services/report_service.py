"""
report_service.py — รวบรวมข้อมูลค่าใช้จ่ายสำหรับสร้างรายงาน
"""
from datetime import datetime, timedelta
from bson import ObjectId
from ..database import get_db

THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
    "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
    "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]


def _thai_date_label(dt: datetime) -> str:
    """แปลงวันที่เป็น DD เดือนไทย YYYY (พ.ศ.)"""
    return f"{dt.day} {THAI_MONTHS[dt.month - 1]} {dt.year + 543}"


def _period_label(period_type: str, ref_date: datetime) -> str:
    """สร้าง label ของช่วงเวลา"""
    if period_type == "daily":
        return f"ประจำวัน {_thai_date_label(ref_date)}"
    elif period_type == "weekly":
        monday = ref_date - timedelta(days=ref_date.weekday())
        sunday = monday + timedelta(days=6)
        return f"ประจำสัปดาห์ {_thai_date_label(monday)} – {_thai_date_label(sunday)}"
    else:  # monthly
        return f"ประจำเดือน {THAI_MONTHS[ref_date.month - 1]} {ref_date.year + 543}"


def _build_date_query(period_type: str, ref_date: datetime) -> dict:
    """สร้าง MongoDB query สำหรับกรองวันที่"""
    if period_type == "daily":
        prefix = ref_date.strftime("%Y-%m-%d")
        return {"date_iso": {"$regex": f"^{prefix}"}}
    elif period_type == "weekly":
        monday = ref_date - timedelta(days=ref_date.weekday())
        sunday = monday + timedelta(days=6)
        # ใช้ $gte / $lte บนสตริง ISO ได้เพราะรูปแบบ YYYY-MM-DD เรียงตามตัวอักษร
        mon_str = monday.strftime("%Y-%m-%d")
        sun_str = sunday.strftime("%Y-%m-%d")
        return {"date_iso": {"$gte": mon_str, "$lte": sun_str + "T23:59:59"}}
    else:  # monthly
        prefix = ref_date.strftime("%Y-%m")
        return {"date_iso": {"$regex": f"^{prefix}"}}


async def build_report_data(cat_id: str, period_type: str, ref_date: datetime) -> dict:
    """
    รวบรวมข้อมูลสำหรับสร้างรายงาน

    Parameters
    ----------
    cat_id      : str   — ObjectId string ของ expense_category
    period_type : str   — "daily" | "weekly" | "monthly"
    ref_date    : datetime — วันอ้างอิง (ใช้ดึงช่วงเวลา)

    Returns
    -------
    dict with keys:
        catName, catColor, period, records, total,
        monthlyBudget, pctUsed, remaining, date
    """
    db = get_db()

    # ─── ข้อมูล category ───────────────────────────────────────────
    try:
        cat_doc = await db.expense_categories.find_one({"_id": ObjectId(cat_id)})
    except Exception:
        cat_doc = None

    cat_name  = cat_doc.get("name",  "ไม่ระบุหมวด") if cat_doc else "ไม่ระบุหมวด"
    cat_color = cat_doc.get("color", "#1e3a8a")      if cat_doc else "#1e3a8a"

    # ─── งบประมาณรายเดือน ──────────────────────────────────────────
    month_year = ref_date.strftime("%m/%Y")
    budget_doc = await db.budgets.find_one({"monthYear": month_year}) or {}
    monthly_budget = (
        budget_doc
        .get("budgets", {})
        .get(cat_id, {})
        .get("monthly", 0)
    )

    # ─── ดึงรายการค่าใช้จ่าย ──────────────────────────────────────
    date_query = _build_date_query(period_type, ref_date)
    query = {"catKey": cat_id, **date_query}

    expense_cursor = db.expenses.find(query).sort("date_iso", 1)
    expenses = await expense_cursor.to_list(None)

    # ─── สร้าง records ────────────────────────────────────────────
    records = []
    for exp in expenses:
        records.append({
            "id":       str(exp.get("_id", "")),
            "date":     exp.get("date", exp.get("date_iso", "")[:10] if exp.get("date_iso") else ""),
            "detail":   exp.get("detail", exp.get("note", "")),
            "amount":   float(exp.get("amount", 0)),
            "recorder": exp.get("recorderName", exp.get("recorder", "")),
            "approver": exp.get("approverName", exp.get("approvedBy", "")),
        })

    total = sum(r["amount"] for r in records)

    # ─── คำนวณ % ──────────────────────────────────────────────────
    pct_used  = round((total / monthly_budget * 100), 1) if monthly_budget > 0 else 0.0
    remaining = monthly_budget - total

    return {
        "catName":       cat_name,
        "catColor":      cat_color,
        "period":        _period_label(period_type, ref_date),
        "periodType":    period_type,
        "records":       records,
        "total":         total,
        "monthlyBudget": monthly_budget,
        "pctUsed":       pct_used,
        "remaining":     remaining,
        "date":          ref_date.strftime("%d/%m/") + str(ref_date.year + 543),
        "generatedAt":   datetime.now(),
    }
