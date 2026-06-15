from datetime import datetime, timezone
from fastapi import APIRouter, Query, Depends, HTTPException
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models.revenue_target import RevenueTargetUpsert, CloseMonthRequest

router = APIRouter(prefix="/api/crm/revenue", tags=["crm-revenue"])


def _fmt_thb(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


@router.get("/summary")
async def get_revenue_summary(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    db=Depends(get_db),
    current=Depends(get_current_user),
):
    from_dt = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)

    deals_cursor = db.crm_deals_b2b.find({
        "$or": [
            {"forecastDate": {"$gte": from_date, "$lte": to_date}},
            {"actualReceivedAt": {"$gte": from_date, "$lte": to_date}},
        ]
    })
    deals = await deals_cursor.to_list(length=1000)

    forecast_thb = 0.0
    actual_thb = 0.0
    dom_forecast = 0.0
    dom_actual = 0.0
    int_forecast = 0.0
    int_actual = 0.0
    deal_list = []

    for d in deals:
        market = d.get("marketType", "domestic")
        fa = _fmt_thb(d.get("forecastAmount"))
        aa = _fmt_thb(d.get("actualAmount"))
        is_forecast = bool(d.get("forecastDate") and from_date <= d["forecastDate"] <= to_date)
        is_actual = bool(d.get("actualReceivedAt") and from_date <= d["actualReceivedAt"] <= to_date)

        if is_forecast:
            forecast_thb += fa
            if market == "domestic":
                dom_forecast += fa
            else:
                int_forecast += fa

        if is_actual:
            actual_thb += aa
            if market == "domestic":
                dom_actual += aa
            else:
                int_actual += aa

        deal_list.append({
            "id": str(d["_id"]),
            "title": d.get("title", ""),
            "accountId": d.get("accountId", ""),
            "marketType": market,
            "forecastAmount": fa,
            "forecastDate": d.get("forecastDate"),
            "actualAmount": aa,
            "actualReceivedAt": d.get("actualReceivedAt"),
            "revenueStatus": d.get("revenueStatus", "pending"),
            "stage": d.get("stage", ""),
        })

    year = from_dt.year
    month = from_dt.month
    target_doc = await db.revenue_targets.find_one({"year": year, "month": month})
    target_thb = _fmt_thb(target_doc.get("targetThb") if target_doc else 0)
    is_closed = bool(target_doc and target_doc.get("isClosed"))

    return {
        "from": from_date,
        "to": to_date,
        "targetThb": target_thb,
        "forecastThb": forecast_thb,
        "actualThb": actual_thb,
        "domestic": {"forecastThb": dom_forecast, "actualThb": dom_actual},
        "international": {"forecastThb": int_forecast, "actualThb": int_actual},
        "deals": deal_list,
        "isClosed": is_closed,
        "closedActualThb": _fmt_thb(target_doc.get("closedActualThb") if target_doc else 0),
    }


@router.get("/targets")
async def get_revenue_targets(
    year: int = Query(...),
    db=Depends(get_db),
    current=Depends(get_current_user),
):
    cursor = db.revenue_targets.find({"year": year}).sort("month", 1)
    docs = await cursor.to_list(length=12)
    for d in docs:
        d["_id"] = str(d["_id"])
    return {"year": year, "targets": docs}


@router.post("/targets")
async def upsert_revenue_target(
    body: RevenueTargetUpsert,
    db=Depends(get_db),
    current=Depends(require_admin),
):
    now = datetime.now(timezone.utc).isoformat()
    await db.revenue_targets.update_one(
        {"year": body.year, "month": body.month},
        {"$set": {
            "targetThb": body.targetThb,
            "domesticTargetThb": body.domesticTargetThb,
            "internationalTargetThb": body.internationalTargetThb,
            "updatedAt": now,
        }, "$setOnInsert": {"createdAt": now, "isClosed": False, "closedAt": None, "closedActualThb": None, "closedBy": None}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/close-month")
async def close_month(
    body: CloseMonthRequest,
    db=Depends(get_db),
    current=Depends(require_admin),
):
    existing = await db.revenue_targets.find_one({"year": body.year, "month": body.month})
    if existing and existing.get("isClosed"):
        raise HTTPException(status_code=400, detail="เดือนนี้ปิดรอบไปแล้ว")
    now = datetime.now(timezone.utc).isoformat()
    await db.revenue_targets.update_one(
        {"year": body.year, "month": body.month},
        {"$set": {
            "isClosed": True,
            "closedAt": now,
            "closedActualThb": body.closedActualThb,
            "closedBy": current.get("username"),
            "updatedAt": now,
        }, "$setOnInsert": {"createdAt": now, "targetThb": 0, "domesticTargetThb": 0, "internationalTargetThb": 0}},
        upsert=True,
    )
    return {"ok": True}
