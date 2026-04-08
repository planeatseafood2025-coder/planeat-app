"""
reports.py — API สำหรับสร้างและดาวน์โหลดรายงาน PDF + ส่ง LINE OA
"""
import os
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse, JSONResponse, Response

from ..deps import require_admin, get_current_user
from ..database import get_db
from ..config import settings
from ..services.report_service import build_report_data
from ..services.pdf_service import generate_expense_report_pdf, generate_history_pdf
from ..services.line_oa_service import push_line_report

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _pdf_dir() -> str:
    """คืน path โฟลเดอร์เก็บ PDF (สร้างถ้ายังไม่มี)"""
    os.makedirs(settings.pdf_storage_path, exist_ok=True)
    return settings.pdf_storage_path


def _pdf_path(report_id: str) -> str:
    return os.path.join(_pdf_dir(), f"{report_id}.pdf")


def _pdf_save(report_id: str, pdf_bytes: bytes) -> str:
    """บันทึก PDF ลงไฟล์ คืน path"""
    path = _pdf_path(report_id)
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return path


# compat shim — code นอก module ยังคง import _pdf_store ได้
# แต่ตอนนี้ key → path จาก persistent storage เสมอ
class _PdfStore(dict):
    def __setitem__(self, key: str, value: str):
        super().__setitem__(key, value)

    def get(self, key, default=None):  # type: ignore[override]
        # ตรวจ in-memory ก่อน, fallback ไปยัง persistent storage
        val = super().get(key)
        if val and os.path.exists(val):
            return val
        p = _pdf_path(key)
        return p if os.path.exists(p) else default


_pdf_store = _PdfStore()


@router.get("/download/{report_id}")
async def download_pdf(report_id: str):
    """
    ดาวน์โหลด PDF ที่ถูกสร้างไว้แล้ว
    ไม่ต้องการ auth เพื่อให้ LINE OA ลิงก์ได้โดยตรง
    """
    path = _pdf_store.get(report_id)
    if not path:
        return JSONResponse(status_code=404, content={"error": "ไม่พบรายงาน หรือรายงานหมดอายุแล้ว"})
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"planeat_report_{report_id[:8]}.pdf",
    )


@router.post("/generate")
async def generate_report(
    body: dict,
    current: dict = Depends(require_admin),
):
    """
    สร้างรายงาน + ส่ง LINE OA (ถ้าเปิดตัวเลือก)

    Body JSON:
    {
        "catId":          string,
        "periodType":     "daily" | "weekly" | "monthly",
        "sendLine":       bool (optional, default false),
        "lineOaConfigId": string (optional),
        "targetId":       string (optional)
    }

    Response:
    {
        "success":  bool,
        "reportId": string,
        "pdfUrl":   string,
        "lineSent": bool
    }
    """
    cat_id      = body.get("catId", "")
    period_type = body.get("periodType", "daily")
    send_line   = bool(body.get("sendLine", False))
    oa_config_id = body.get("lineOaConfigId", "")
    target_id   = body.get("targetId", "")

    if not cat_id:
        return JSONResponse(status_code=400, content={"error": "catId is required"})
    if period_type not in ("daily", "weekly", "monthly"):
        return JSONResponse(status_code=400, content={"error": "periodType must be daily/weekly/monthly"})

    ref_date = datetime.now()

    try:
        report_data = await build_report_data(cat_id, period_type, ref_date)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"สร้างข้อมูลรายงานล้มเหลว: {e}"})

    # ─── Generate PDF ────────────────────────────────────────────
    try:
        pdf_bytes = generate_expense_report_pdf(report_data)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"สร้าง PDF ล้มเหลว: {e}"})

    report_id = str(uuid.uuid4())
    _pdf_save(report_id, pdf_bytes)
    _pdf_store[report_id] = _pdf_path(report_id)

    pdf_url = f"/api/reports/download/{report_id}"

    # ─── Send LINE OA ────────────────────────────────────────────
    line_sent = False
    if send_line and oa_config_id:
        db = get_db()
        smtp_conf   = await db.system_settings.find_one({"_id": "system_settings"}) or {}
        oa_configs  = {c["id"]: c for c in smtp_conf.get("lineOaConfigs", [])}
        oa_conf     = oa_configs.get(oa_config_id)
        if oa_conf:
            token      = oa_conf.get("token", "")
            final_target = target_id or oa_conf.get("targetId", "")
            if token:
                line_sent = await push_line_report(token, final_target, report_data, pdf_url)

    return {
        "success":  True,
        "reportId": report_id,
        "pdfUrl":   pdf_url,
        "lineSent": line_sent,
        "catName":  report_data.get("catName"),
        "period":   report_data.get("period"),
        "total":    report_data.get("total"),
    }


THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
                     "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
THAI_MONTHS_FULL  = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                     "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"]


def _thai_date(d: "date_type") -> str:  # type: ignore[name-defined]
    return f"{d.day} {THAI_MONTHS_SHORT[d.month-1]} {d.year + 543}"


def _auto_period_label(date_from: "date_type", date_to: "date_type") -> str:  # type: ignore[name-defined]
    if date_from == date_to:
        return f"ประจำวันที่ {_thai_date(date_from)}"
    if date_from.year == date_to.year and date_from.month == date_to.month:
        return f"ประจำเดือน {THAI_MONTHS_FULL[date_from.month-1]} {date_from.year + 543}"
    if date_from.year == date_to.year:
        return f"ระหว่าง {_thai_date(date_from)} ถึง {_thai_date(date_to)} พ.ศ. {date_from.year + 543}"
    return f"ระหว่าง {_thai_date(date_from)} ถึง {_thai_date(date_to)}"


@router.get("/history-pdf")
async def history_pdf(
    catKey:    str = Query("all"),
    dateFrom:  str = Query(""),   # YYYY-MM-DD
    dateTo:    str = Query(""),   # YYYY-MM-DD
    mode:      str = Query("auto"),  # auto | summary | detail
    current:   dict = Depends(get_current_user),
):
    """
    สร้าง PDF รายงานประวัติค่าใช้จ่าย แนวนอน (มาตรฐานบัญชีไทย)
    - catKey:   หมวดที่ต้องการ หรือ "all"
    - dateFrom: วันเริ่มต้น (YYYY-MM-DD)
    - dateTo:   วันสิ้นสุด  (YYYY-MM-DD)
    ถ้าไม่ระบุ dateFrom/dateTo จะใช้เดือนปัจจุบัน
    """
    from datetime import date as date_type

    now = datetime.now()
    try:
        d_from = date_type.fromisoformat(dateFrom) if dateFrom else date_type(now.year, now.month, 1)
        d_to   = date_type.fromisoformat(dateTo)   if dateTo   else date_type(now.year, now.month + 1 if now.month < 12 else 1,
                                                                               1 if now.month < 12 else 31) - timedelta(days=1) \
                 if not dateTo else date_type.fromisoformat(dateTo)
    except Exception:
        d_from = date_type(now.year, now.month, 1)
        import calendar
        d_to   = date_type(now.year, now.month, calendar.monthrange(now.year, now.month)[1])

    # ป้องกัน dateTo น้อยกว่า dateFrom
    if d_to < d_from:
        d_from, d_to = d_to, d_from

    period_label = _auto_period_label(d_from, d_to)

    # ─── fetch expenses ──────────────────────────────────────────────────────
    db = get_db()
    date_query = {
        "date_iso": {
            "$gte": d_from.strftime("%Y-%m-%d"),
            "$lte": d_to.strftime("%Y-%m-%d") + "T23:59:59",
        }
    }
    base_query: dict = {**date_query}
    if catKey and catKey != "all":
        base_query["catKey"] = catKey

    expenses = await db.expenses.find(base_query).sort("date_iso", 1).to_list(None)

    doc_no = f"RPT-{now.strftime('%Y%m%d%H%M%S')}"
    records = []
    for exp in expenses:
        records.append({
            "id":       str(exp.get("_id", "")),
            "date":     exp.get("date", ""),
            "date_iso": exp.get("date_iso", ""),
            "category": exp.get("category", ""),
            "detail":   exp.get("detail", ""),
            "note":     exp.get("note", ""),
            "amount":   float(exp.get("amount", 0)),
            "recorder": exp.get("recorderName", exp.get("recorder", "")),
            "approver": exp.get("approverName", exp.get("approvedBy", "")),
            "catKey":   exp.get("catKey", ""),
        })

    # ─── resolve cat_name ────────────────────────────────────────────────────
    cat_name = "ทุกหมวด"
    if catKey and catKey != "all":
        try:
            cat_doc = await db.expense_categories.find_one({"_id": catKey})
            if cat_doc:
                cat_name = cat_doc.get("name", catKey)
            else:
                cat_name = catKey
        except Exception:
            cat_name = catKey

    # ─── category summary (for "all") ────────────────────────────────────────
    categories_summary = None
    if catKey == "all":
        cat_map: dict = {}
        for r in records:
            ck = r.get("catKey", "")
            cn = r.get("category", ck)
            if ck not in cat_map:
                cat_map[ck] = {"name": cn, "total": 0.0, "count": 0}
            cat_map[ck]["total"] += r["amount"]
            cat_map[ck]["count"] += 1
        categories_summary = list(cat_map.values())

    # ─── budget for single category (same month only) ─────────────────────────
    total_budget = 0.0
    if catKey and catKey != "all" and d_from.month == d_to.month and d_from.year == d_to.year:
        my = f"{d_from.month:02d}/{d_from.year}"
        budget_doc = await db.budgets.find_one({"monthYear": my}) or {}
        total_budget = budget_doc.get("budgets", {}).get(catKey, {}).get("monthly", 0.0)

    # ─── generate PDF ─────────────────────────────────────────────────────────
    try:
        pdf_bytes = generate_history_pdf(
            records=records,
            period_label=period_label,
            cat_name=cat_name,
            categories_summary=categories_summary,
            total_budget=total_budget,
            doc_no=doc_no,
            mode=mode,
        )
    except Exception as e:
        import traceback; traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"สร้าง PDF ล้มเหลว: {e}"})

    filename = f"planeat-{d_from}-{d_to}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
