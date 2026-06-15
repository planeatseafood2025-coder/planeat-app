def _fmt_thb(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def compute_revenue_trend(year: int, targets: list, deals: list) -> list:
    """คืนข้อมูลรายเดือน 12 รายการ: เป้า/คาดการณ์/จริง
    forecast = ดีลที่ยังไม่ปิด (stage ∉ won,lost) + forecastDate ในเดือนนั้น
    actual   = ดีลที่ปิดสำเร็จ (stage == won) + actualReceivedAt ในเดือนนั้น
    """
    target_by_month = {int(t.get("month")): _fmt_thb(t.get("targetThb")) for t in targets if t.get("month")}
    months = []
    for m in range(1, 13):
        prefix = f"{year}-{m:02d}"
        forecast = 0.0
        actual = 0.0
        for d in deals:
            stage = d.get("stage", "")
            forecast_date = d.get("forecastDate") or ""
            actual_date = d.get("actualReceivedAt") or ""
            if stage not in ("won", "lost") and forecast_date.startswith(prefix):
                forecast += _fmt_thb(d.get("forecastAmount"))
            if stage == "won" and actual_date.startswith(prefix):
                actual += _fmt_thb(d.get("actualAmount"))
        months.append({
            "month": m,
            "targetThb": target_by_month.get(m, 0.0),
            "forecastThb": forecast,
            "actualThb": actual,
        })
    return months
