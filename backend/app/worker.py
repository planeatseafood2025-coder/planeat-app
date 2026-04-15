"""
worker.py — ARQ background worker
รับผิดชอบ: scheduled LINE OA reports (แทน APScheduler ใน main.py)
รัน: arq app.worker.WorkerSettings
"""
import logging
from datetime import datetime, timedelta

from arq import cron
from arq.connections import RedisSettings

from .config import settings

logger = logging.getLogger("planeat.worker")


async def run_scheduled_reports(ctx: dict):
    """
    Cron job ทุกชั่วโมงตรง — ตรวจ schedule ของแต่ละ category แล้วส่งรายงาน LINE OA
    """
    from .database import get_db
    from .services.report_service import build_report_data
    from .services.pdf_service import generate_expense_report_pdf
    from .services.line_oa_service import push_line_report
    from .routers.reports import _pdf_store, _pdf_save, _pdf_path
    import uuid

    try:
        now          = datetime.now()
        hour         = now.hour
        weekday      = now.weekday()   # 0 = จันทร์
        day_of_month = now.day

        db = get_db()
        cats = await db.expense_categories.find({"isActive": True}).to_list(None)

        # ── ดึง mainLineOa token + expense Group ID จาก system_settings ──
        sys_conf     = await db.system_settings.find_one({"_id": "system_settings"}) or {}
        main_oa      = sys_conf.get("mainLineOa") or {}
        token        = main_oa.get("token", "")
        mc           = sys_conf.get("moduleConnections") or {}
        expense_gid  = mc.get("expense", "")   # LINE Group ID ของระบบค่าใช้จ่าย

        for cat in cats:
            ns     = cat.get("notificationSchedule", {})
            cat_id = str(cat["_id"])

            async def _send(period_type: str, schedule_item: dict):
                try:
                    if not token:
                        logger.warning("Skipping report: mainLineOa token not set")
                        return
                    report_data = await build_report_data(cat_id, period_type, now)
                    pdf_bytes   = generate_expense_report_pdf(report_data)
                    report_id   = str(uuid.uuid4())
                    _pdf_save(report_id, pdf_bytes)
                    _pdf_store[report_id] = _pdf_path(report_id)
                    pdf_url = f"/api/reports/download/{report_id}"
                    await push_line_report(token, expense_gid, report_data, pdf_url)
                except Exception as e:
                    logger.error("Scheduled report failed cat=%s period=%s: %s", cat_id, period_type, e)

            daily = ns.get("daily", {})
            if daily.get("enabled") and daily.get("hour", -1) == hour:
                await _send("daily", daily)

            weekly = ns.get("weekly", {})
            if (weekly.get("enabled")
                    and weekly.get("hour", -1) == hour
                    and ns.get("weeklyDay", 4) == weekday):
                await _send("weekly", weekly)

            monthly = ns.get("monthly", {})
            if (monthly.get("enabled")
                    and monthly.get("hour", -1) == hour
                    and ns.get("monthlyDay", 1) == day_of_month):
                await _send("monthly", monthly)

        logger.info("Scheduled reports check done (%d categories)", len(cats))

    except Exception as e:
        logger.error("run_scheduled_reports error: %s", e)


async def run_daily_line_summary(ctx: dict):
    """Cron ทุกวัน 20:00 — ส่งสรุปค่าใช้จ่ายรายวันไปกลุ่ม LINE OA"""
    from .services.line_notify_service import notify_daily_summary
    now = datetime.now()
    try:
        await notify_daily_summary(now.year, now.month, now.day)
        logger.info("Daily LINE summary sent: %d/%d/%d", now.day, now.month, now.year)
    except Exception as e:
        logger.error("run_daily_line_summary error: %s", e)


async def run_weekly_line_summary(ctx: dict):
    """Cron ทุกวันศุกร์ 20:00 — ส่งสรุปค่าใช้จ่ายรายสัปดาห์ไปกลุ่ม LINE OA"""
    from .services.line_notify_service import notify_weekly_summary
    now = datetime.now()
    # หาวันจันทร์ต้นสัปดาห์
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        await notify_weekly_summary(week_start)
        logger.info("Weekly LINE summary sent: week of %s", week_start.strftime("%Y-%m-%d"))
    except Exception as e:
        logger.error("run_weekly_line_summary error: %s", e)


async def run_monthly_summary(ctx: dict):
    """Cron วันที่ 30 เวลา 08:00 — สรุปประจำเดือน + แจ้งตั้งงบประมาณเดือนหน้า"""
    from .services.line_notify_service import notify_monthly_summary, notify_budget_day30
    now = datetime.now()
    try:
        await notify_monthly_summary(now.year, now.month)
        logger.info("Monthly summary sent: %d/%d", now.month, now.year)
    except Exception as e:
        logger.error("run_monthly_summary error: %s", e)
    try:
        await notify_budget_day30(now.year, now.month)
        logger.info("Budget day-30 reminder sent: %d/%d", now.month, now.year)
    except Exception as e:
        logger.error("run_budget_day30 error: %s", e)


async def run_budget_reminder(ctx: dict):
    """Cron วันที่ 4 เวลา 09:00 — แจ้งเตือนหากยังไม่ตั้งงบประมาณ"""
    from .services.line_notify_service import notify_budget_missing
    now = datetime.now()
    try:
        await notify_budget_missing(now.year, now.month)
        logger.info("Budget reminder checked: %d/%d", now.month, now.year)
    except Exception as e:
        logger.error("run_budget_reminder error: %s", e)


async def startup(ctx: dict):
    """เชื่อมต่อ MongoDB เมื่อ worker เริ่ม"""
    from .database import connect_db
    await connect_db()
    logger.info("ARQ worker started")


async def shutdown(ctx: dict):
    from .database import close_db
    await close_db()
    logger.info("ARQ worker stopped")


def _redis_settings() -> RedisSettings:
    url = settings.redis_url
    # แปลง redis://host:port เป็น RedisSettings
    url = url.replace("redis://", "")
    host, _, port = url.partition(":")
    return RedisSettings(host=host or "localhost", port=int(port or 6379))


class WorkerSettings:
    functions     = [
        run_scheduled_reports, run_daily_line_summary,
        run_weekly_line_summary, run_monthly_summary, run_budget_reminder,
    ]
    cron_jobs     = [
        cron(run_scheduled_reports,  hour=set(range(24)), minute=0),
        cron(run_daily_line_summary,  hour=20, minute=0),                    # ทุกวัน 20:00
        cron(run_weekly_line_summary, hour=20, minute=0, weekday=4),         # ทุกวันศุกร์ 20:00
        cron(run_monthly_summary,     hour=8,  minute=0, day=30),
        cron(run_budget_reminder,     hour=9,  minute=0, day=4),
    ]
    on_startup    = startup
    on_shutdown   = shutdown
    redis_settings = _redis_settings()
    max_jobs      = 5
    job_timeout   = 300   # 5 นาที
