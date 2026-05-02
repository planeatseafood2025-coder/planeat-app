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

        # ── ดึง token + Group ID จาก OA expense module ──
        from .services.line_notify_service import _get_module_group
        token, expense_gid = await _get_module_group("expense")

        for cat in cats:
            ns     = cat.get("notificationSchedule", {})
            cat_id = str(cat["_id"])

            async def _send(period_type: str, schedule_item: dict):
                try:
                    if not token:
                        logger.warning("Skipping report: expense OA token not set")
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


async def _get_auto_notify() -> dict:
    """ดึง autoNotify settings จาก DB (return defaults ถ้าไม่มี)"""
    from .database import get_db
    db = get_db()
    doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    es = doc.get("expenseSettings", {})
    defaults = {
        "allEnabled": True, "morningGreeting": True,
        "weeklySummary": True, "monthlySummary": True,
        "budgetWarning": True, "approvedCard": True,
    }
    defaults.update(es.get("autoNotify", {}))
    return defaults


async def run_daily_line_summary(ctx: dict):
    """Cron ทุกวัน 20:00 — ส่งสรุปค่าใช้จ่ายรายวันไปกลุ่ม LINE OA"""
    from .services.line_notify_service import notify_daily_summary
    cfg = await _get_auto_notify()
    if not cfg["allEnabled"]:
        logger.info("run_daily_line_summary: skipped (disabled)")
        return
    now = datetime.now()
    try:
        await notify_daily_summary(now.year, now.month, now.day)
        logger.info("Daily LINE summary sent: %d/%d/%d", now.day, now.month, now.year)
    except Exception as e:
        logger.error("run_daily_line_summary error: %s", e)


async def run_weekly_line_summary(ctx: dict):
    """Cron ทุกวันจันทร์ 09:30 — ส่งสรุปค่าใช้จ่ายรายสัปดาห์ไปกลุ่ม LINE OA"""
    from .services.line_notify_service import notify_weekly_summary
    from .services.line_notify_service import notify_monthly_summary
    cfg = await _get_auto_notify()
    if not cfg["allEnabled"] or not cfg["weeklySummary"]:
        logger.info("run_weekly_line_summary: skipped (disabled)")
        return
    now = datetime.now()
    # สัปดาห์ที่แล้ว (จันทร์–อาทิตย์ ครบแล้ว)
    last_monday = now - timedelta(days=now.weekday() + 7)
    last_monday = last_monday.replace(hour=0, minute=0, second=0, microsecond=0)
    last_sunday = last_monday + timedelta(days=6)

    try:
        # ถ้าสัปดาห์ข้ามเดือน → สรุปเฉพาะช่วงต้นเดือนใหม่ (monthly summary จัดการโดย cron วันที่ 1)
        if last_monday.month != last_sunday.month:
            new_month_start = last_sunday.replace(day=1)
            await notify_weekly_summary(new_month_start, last_sunday)
            logger.info("Cross-month weekly: partial new month %s–%s sent", new_month_start.strftime("%Y-%m-%d"), last_sunday.strftime("%Y-%m-%d"))
        else:
            await notify_weekly_summary(last_monday, last_sunday)
            logger.info("Weekly LINE summary sent: %s–%s", last_monday.strftime("%Y-%m-%d"), last_sunday.strftime("%Y-%m-%d"))
    except Exception as e:
        logger.error("run_weekly_line_summary error: %s", e)


async def run_monthly_summary(ctx: dict):
    """Cron วันที่ 1 เวลา 08:00 — สรุปเดือนที่แล้ว + แจ้งตั้งงบประมาณ"""
    from .services.line_notify_service import notify_monthly_summary, notify_budget_day30
    cfg = await _get_auto_notify()
    if not cfg["allEnabled"] or not cfg["monthlySummary"]:
        logger.info("run_monthly_summary: skipped (disabled)")
        return
    now = datetime.now()
    # วันที่ 1 ของเดือนนี้ → สรุปเดือนที่แล้ว
    if now.month == 1:
        prev_year, prev_month = now.year - 1, 12
    else:
        prev_year, prev_month = now.year, now.month - 1
    try:
        await notify_monthly_summary(prev_year, prev_month)
        logger.info("Monthly summary sent: %d/%d (prev month)", prev_month, prev_year)
    except Exception as e:
        logger.error("run_monthly_summary error: %s", e)
    try:
        await notify_budget_day30(now.year, now.month)
        logger.info("Budget reminder sent: %d/%d", now.month, now.year)
    except Exception as e:
        logger.error("run_budget_day30 error: %s", e)


async def run_budget_reminder(ctx: dict):
    """Cron วันที่ 4 เวลา 09:00 — แจ้งเตือนหากยังไม่ตั้งงบประมาณ"""
    from .services.line_notify_service import notify_budget_missing
    cfg = await _get_auto_notify()
    if not cfg["allEnabled"] or not cfg["budgetWarning"]:
        logger.info("run_budget_reminder: skipped (disabled)")
        return
    now = datetime.now()
    try:
        await notify_budget_missing(now.year, now.month)
        logger.info("Budget reminder checked: %d/%d", now.month, now.year)
    except Exception as e:
        logger.error("run_budget_reminder error: %s", e)



async def run_morning_greeting(ctx: dict):
    """
    Cron 09:05 ไทย (02:05 UTC) จันทร์–เสาร์
    ส่ง Flex Message ทักทายพร้อมปุ่มกดลิ้งค์ไปกลุ่ม LINE C13eda4d50c68d7efc87da9bd2a93492b
    """
    import os
    from .database import get_db
    from .services.line_notify_service import _push

    cfg = await _get_auto_notify()
    if not cfg["allEnabled"] or not cfg["morningGreeting"]:
        logger.info("morning_greeting: skipped (disabled)")
        return

    now = datetime.now()
    if now.weekday() == 6:
        logger.info("morning_greeting: skip Sunday")
        return

    # วันหยุดนักขัตฤกษ์ไทย (MM-DD)
    THAI_HOLIDAYS = {
        "01-01",  # วันขึ้นปีใหม่
        "04-06",  # วันจักรี
        "04-13", "04-14", "04-15",  # สงกรานต์
        "05-01",  # วันแรงงาน
        "05-04",  # วันฉัตรมงคล
        "06-03",  # วันเฉลิมพระชนมพรรษา พระราชินี
        "07-28",  # วันเฉลิมพระชนมพรรษา ร.10
        "08-12",  # วันแม่แห่งชาติ
        "10-13",  # วันนวมินทรมหาราช
        "10-23",  # วันปิยมหาราช
        "12-05",  # วันพ่อแห่งชาติ
        "12-10",  # วันรัฐธรรมนูญ
        "12-31",  # วันสิ้นปี
    }
    if now.strftime("%m-%d") in THAI_HOLIDAYS:
        logger.info("morning_greeting: skip holiday %s", now.strftime("%m-%d"))
        return

    GROUP_ID = "C13eda4d50c68d7efc87da9bd2a93492b"

    th_days   = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"]
    th_months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                 "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
    wd = now.weekday()
    day_name = th_days[wd]
    date_str = f"วัน{day_name}ที่ {now.day} {th_months[now.month - 1]} {now.year + 543}"

    # สีและข้อความตามวัน
    day_themes = {
        0: {"color": "#1e40af", "light": "#dbeafe", "emoji": "☀️", "header": "สวัสดีวันจันทร์ครับ", "greet": "ขอให้ทุกท่านมีสัปดาห์ที่ดีและงานสำเร็จลุล่วงนะครับ ☀️"},
        1: {"color": "#be185d", "light": "#fce7f3", "emoji": "🌤️", "header": "สวัสดีวันอังคารครับ", "greet": "ขอให้ทุกท่านมีวันที่ราบรื่นและงานก้าวหน้านะครับ 🌤️"},
        2: {"color": "#15803d", "light": "#dcfce7", "emoji": "🌿", "header": "สวัสดีวันพุธครับ", "greet": "ขอให้ทุกท่านมีพลังและวันที่ดีตลอดนะครับ 🌿"},
        3: {"color": "#b45309", "light": "#fef3c7", "emoji": "🌸", "header": "สวัสดีวันพฤหัสฯ ครับ", "greet": "ขอให้ทุกท่านมีวันที่เปี่ยมไปด้วยความสำเร็จนะครับ 🌸"},
        4: {"color": "#7c3aed", "light": "#ede9fe", "emoji": "✨", "header": "สวัสดีวันศุกร์ครับ", "greet": "ขอให้ทุกท่านมีวันที่ดีและราบรื่นตลอดนะครับ ✨"},
        5: {"color": "#0f766e", "light": "#ccfbf1", "emoji": "🌅", "header": "สวัสดีวันเสาร์ครับ", "greet": "ขอบคุณทุกท่านที่ทุ่มเทครับ ขอให้วันนี้ผ่านไปได้ราบรื่นนะครับ 🌅"},
    }
    t = day_themes[wd]

    daily_url = "https://planeatsupport.duckdns.org/standalone"

    flex = {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": t["color"],
            "paddingAll": "20px",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {"type": "text", "text": t["emoji"], "size": "xxl", "flex": 0},
                        {
                            "type": "box", "layout": "vertical", "flex": 1,
                            "paddingStart": "12px",
                            "contents": [
                                {"type": "text", "text": t["header"],
                                 "color": "#ffffff", "size": "sm", "weight": "bold"},
                                {"type": "text", "text": date_str,
                                 "color": t["light"], "size": "xs"},
                            ],
                        },
                    ],
                },
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "paddingAll": "20px",
            "contents": [
                {
                    "type": "text",
                    "text": t["greet"],
                    "wrap": True,
                    "size": "sm",
                    "color": "#1e293b",
                    "weight": "bold",
                },
                {"type": "separator"},
                {
                    "type": "text",
                    "text": "อย่าลืมบันทึกรายจ่ายของวันนี้ด้วยนะครับ\nกดปุ่มด้านล่างเพื่อเข้าสู่ระบบได้เลย 👇",
                    "wrap": True,
                    "size": "sm",
                    "color": "#475569",
                },
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": t["color"],
                    "height": "sm",
                    "action": {
                        "type": "uri",
                        "label": "📝 กรอกข้อมูลรายจ่ายวันนี้",
                        "uri": daily_url,
                    },
                },
                {
                    "type": "text",
                    "text": "Planeat — ระบบจัดการค่าใช้จ่าย",
                    "size": "xxs",
                    "color": "#94a3b8",
                    "align": "center",
                    "margin": "sm",
                },
            ],
        },
    }

    try:
        from .services.line_notify_service import _get_module_group
        token, group_id = await _get_module_group("expense")
        if not token:
            logger.warning("morning_greeting: no token, skip")
            return
        if not group_id:
            group_id = GROUP_ID

        ok = await _push(token, group_id, [{"type": "flex", "altText": f"สวัสดีวัน{day_name}! อย่าลืมบันทึกรายจ่ายวันนี้นะครับ 📋", "contents": flex}])
        logger.info("morning_greeting: sent to group ok=%s", ok)
    except Exception as e:
        logger.error("run_morning_greeting error: %s", e)


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
        run_scheduled_reports,
        run_weekly_line_summary, run_monthly_summary, run_budget_reminder,
        run_morning_greeting,
    ]
    cron_jobs     = [
        cron(run_scheduled_reports,     hour=set(range(24)), minute=0),
        cron(run_weekly_line_summary,   hour=2,  minute=30, weekday=0),               # จันทร์ 09:30 ไทย (UTC+7)
        cron(run_monthly_summary,       hour=1,  minute=0, day=1),                    # วันที่ 1 08:00 ไทย — สรุปเดือนที่แล้ว
        cron(run_budget_reminder,       hour=2,  minute=0, day=4),                    # 09:00 ไทย (UTC+7)
        cron(run_morning_greeting,      hour=2,  minute=5,                            # 09:05 ไทย (UTC+7) จันทร์–เสาร์
             weekday={0, 1, 2, 3, 4, 5}),
    ]
    on_startup    = startup
    on_shutdown   = shutdown
    redis_settings = _redis_settings()
    max_jobs      = 5
    job_timeout   = 300   # 5 นาที
