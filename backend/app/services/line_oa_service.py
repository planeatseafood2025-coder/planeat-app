"""
line_oa_service.py — ส่ง LINE OA Flex Message รายงานค่าใช้จ่าย
ใช้ LINE Messaging API (push / broadcast)
"""
import httpx
from datetime import datetime


def _fmt(n: float) -> str:
    return f"{n:,.2f}"


def _build_report_flex(report_data: dict, pdf_url: str) -> dict:
    """สร้าง LINE Flex Message bubble สำหรับรายงานค่าใช้จ่าย"""
    cat_name  = report_data.get("catName",  "รายงาน")
    cat_color = report_data.get("catColor", "#1e3a8a")
    period    = report_data.get("period",   "")
    total         = report_data.get("total",         0)
    monthly_budget = report_data.get("monthlyBudget", 0)
    pct_used      = report_data.get("pctUsed",       0)
    remaining     = report_data.get("remaining",     0)
    records       = report_data.get("records",       [])

    # ── Header ────────────────────────────────────────────────────
    header = {
        "type": "box",
        "layout": "vertical",
        "backgroundColor": "#1e3a8a",
        "paddingAll": "16px",
        "contents": [
            {
                "type": "text",
                "text": "PlaNeat Support",
                "color": "#93c5fd",
                "size": "xs",
                "weight": "bold",
            },
            {
                "type": "text",
                "text": cat_name,
                "color": "#ffffff",
                "size": "lg",
                "weight": "bold",
                "wrap": True,
                "margin": "sm",
            },
            {
                "type": "text",
                "text": period,
                "color": "#cbd5e1",
                "size": "sm",
                "margin": "xs",
                "wrap": True,
            },
        ],
    }

    # ── Budget summary (4 cols) ────────────────────────────────────
    remain_color = "#16a34a" if remaining >= 0 else "#dc2626"
    pct_color    = "#dc2626" if pct_used > 100 else ("#d97706" if pct_used > 80 else "#16a34a")

    def _stat_box(label: str, value: str, color: str = "#1e293b") -> dict:
        return {
            "type": "box",
            "layout": "vertical",
            "alignItems": "center",
            "contents": [
                {"type": "text", "text": label, "size": "xxs", "color": "#64748b", "wrap": True, "align": "center"},
                {"type": "text", "text": value, "size": "sm", "weight": "bold", "color": color, "wrap": True, "align": "center", "margin": "xs"},
            ],
        }

    budget_box = {
        "type": "box",
        "layout": "horizontal",
        "backgroundColor": "#eff6ff",
        "borderColor": "#bfdbfe",
        "borderWidth": "1px",
        "cornerRadius": "8px",
        "paddingAll": "10px",
        "margin": "md",
        "contents": [
            _stat_box("ยอดใช้แล้ว\n(฿)", _fmt(total), "#1e3a8a"),
            {"type": "separator", "margin": "sm"},
            _stat_box("งบประมาณ\n(฿)", _fmt(monthly_budget), "#1e3a8a"),
            {"type": "separator", "margin": "sm"},
            _stat_box("% ที่ใช้ไป", f"{pct_used:.1f}%", pct_color),
            {"type": "separator", "margin": "sm"},
            _stat_box("คงเหลือ\n(฿)", _fmt(remaining), remain_color),
        ],
    }

    # ── Table header ──────────────────────────────────────────────
    table_header = {
        "type": "box",
        "layout": "horizontal",
        "backgroundColor": "#1e3a8a",
        "paddingAll": "6px",
        "margin": "md",
        "contents": [
            {"type": "text", "text": "วันที่",      "color": "#ffffff", "size": "xs", "flex": 2, "weight": "bold"},
            {"type": "text", "text": "รายละเอียด", "color": "#ffffff", "size": "xs", "flex": 4, "weight": "bold"},
            {"type": "text", "text": "ยอด (฿)",    "color": "#ffffff", "size": "xs", "flex": 2, "weight": "bold", "align": "end"},
        ],
    }

    # ── Top 8 rows ────────────────────────────────────────────────
    shown  = records[:8]
    extra  = len(records) - 8

    row_items = []
    for i, rec in enumerate(shown):
        bg = "#f8fafc" if i % 2 == 0 else "#ffffff"
        row_items.append({
            "type": "box",
            "layout": "horizontal",
            "backgroundColor": bg,
            "paddingAll": "5px",
            "contents": [
                {"type": "text", "text": str(rec.get("date", "")),   "size": "xxs", "flex": 2, "color": "#475569", "wrap": True},
                {"type": "text", "text": str(rec.get("detail", "")), "size": "xxs", "flex": 4, "color": "#1e293b", "wrap": True},
                {"type": "text", "text": _fmt(rec.get("amount", 0)), "size": "xxs", "flex": 2, "color": "#1e293b", "align": "end", "wrap": True},
            ],
        })

    if extra > 0:
        row_items.append({
            "type": "text",
            "text": f"... และอีก {extra} รายการ",
            "size": "xs",
            "color": "#94a3b8",
            "align": "center",
            "margin": "sm",
        })

    # ── Total row ─────────────────────────────────────────────────
    total_row = {
        "type": "box",
        "layout": "horizontal",
        "backgroundColor": "#1e3a8a",
        "paddingAll": "7px",
        "margin": "sm",
        "contents": [
            {"type": "text", "text": "รวมทั้งสิ้น", "color": "#ffffff", "size": "xs", "flex": 6, "weight": "bold"},
            {"type": "text", "text": _fmt(total),    "color": "#ffffff", "size": "xs", "flex": 2, "weight": "bold", "align": "end"},
        ],
    }

    # ── Body ──────────────────────────────────────────────────────
    body_contents = [budget_box, {"type": "separator", "margin": "md"}, table_header]
    body_contents.extend(row_items)
    body_contents.append(total_row)

    body = {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "12px",
        "contents": body_contents,
    }

    # ── Footer ────────────────────────────────────────────────────
    footer_contents = []
    if pdf_url:
        footer_contents.append({
            "type": "button",
            "action": {
                "type": "uri",
                "label": "ดาวน์โหลด PDF",
                "uri": pdf_url,
            },
            "style": "primary",
            "color": "#1e3a8a",
            "height": "sm",
        })

    now = datetime.now()
    gen_str = now.strftime("%d/%m/") + str(now.year + 543) + now.strftime(" %H:%M น.")
    footer_contents.append({
        "type": "text",
        "text": f"สร้าง: {gen_str}",
        "size": "xxs",
        "color": "#94a3b8",
        "align": "center",
        "margin": "sm",
    })

    footer = {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "10px",
        "contents": footer_contents,
    }

    bubble = {
        "type": "bubble",
        "size": "giga",
        "header": header,
        "body":   body,
        "footer": footer,
    }

    return {
        "type": "flex",
        "altText": f"รายงาน {cat_name} | {period} | ยอดรวม ฿{_fmt(total)}",
        "contents": bubble,
    }


async def push_line_report(
    token: str,
    target_id: str,
    report_data: dict,
    pdf_url: str = "",
) -> bool:
    """
    ส่ง Flex Message รายงานผ่าน LINE OA Messaging API

    Parameters
    ----------
    token     : Channel Access Token
    target_id : LINE group ID / user ID (ว่าง = broadcast ไปทุกคน)
    report_data : dict จาก build_report_data()
    pdf_url   : URL ดาวน์โหลด PDF (ว่างได้)

    Returns
    -------
    bool — True ถ้าสำเร็จ
    """
    flex_msg = _build_report_flex(report_data, pdf_url)

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    if target_id:
        url  = "https://api.line.me/v2/bot/message/push"
        body = {"to": target_id, "messages": [flex_msg]}
    else:
        url  = "https://api.line.me/v2/bot/message/broadcast"
        body = {"messages": [flex_msg]}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=body, headers=headers)
            if resp.status_code == 200:
                return True
            else:
                print(f"[LINE OA] Error {resp.status_code}: {resp.text}")
                return False
    except Exception as e:
        print(f"[LINE OA] Exception: {e}")
        return False
