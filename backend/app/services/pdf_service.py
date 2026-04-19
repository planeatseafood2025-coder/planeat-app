"""
pdf_service.py — สร้างรายงาน PDF ค่าใช้จ่ายด้วย reportlab
รองรับภาษาไทยผ่านฟอนต์ Garuda (fonts-thai-tlwg) หรือ Helvetica เป็น fallback
"""
import os
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─── Thai Font Setup ──────────────────────────────────────────────────────────

GARUDA_PATH = "/usr/share/fonts/truetype/tlwg/Garuda.ttf"
_THAI_FONT  = "Helvetica"   # fallback

def _register_thai_font() -> str:
    """ลงทะเบียนฟอนต์ไทย คืนชื่อฟอนต์ที่ใช้ได้"""
    global _THAI_FONT
    if _THAI_FONT != "Helvetica":
        return _THAI_FONT
    if os.path.exists(GARUDA_PATH):
        try:
            pdfmetrics.registerFont(TTFont("Garuda", GARUDA_PATH))
            _THAI_FONT = "Garuda"
        except Exception as e:
            print(f"[PDF] Cannot load Garuda font: {e}")
    return _THAI_FONT


# ─── Color constants ──────────────────────────────────────────────────────────

C_DARK_BLUE  = colors.HexColor("#1e3a8a")
C_MID_BLUE   = colors.HexColor("#3b82f6")
C_LIGHT_BLUE = colors.HexColor("#eff6ff")
C_ALT_ROW    = colors.HexColor("#f8fafc")
C_WHITE      = colors.white
C_BLACK      = colors.HexColor("#1e293b")
C_GRAY       = colors.HexColor("#64748b")
C_BORDER     = colors.HexColor("#e2e8f0")
C_GREEN      = colors.HexColor("#16a34a")
C_RED        = colors.HexColor("#dc2626")
C_TOTAL_BG   = colors.HexColor("#1e3a8a")


def _fmt(n: float) -> str:
    """จัดรูปแบบตัวเลขพร้อม comma"""
    return f"{n:,.2f}"


def generate_expense_report_pdf(report_data: dict) -> bytes:
    """
    สร้าง PDF รายงานค่าใช้จ่าย

    Parameters
    ----------
    report_data : dict — ผลจาก build_report_data()

    Returns
    -------
    bytes — PDF binary
    """
    font_name = _register_thai_font()

    # ─── Styles ───────────────────────────────────────────────────
    styles = getSampleStyleSheet()

    def _style(name: str, **kw) -> ParagraphStyle:
        kw.setdefault("fontName", font_name)
        return ParagraphStyle(name, **kw)

    st_title   = _style("Title",   fontSize=18, textColor=C_WHITE,     spaceAfter=2,  leading=22, alignment=1)
    st_sub     = _style("SubTitle",fontSize=11, textColor=colors.HexColor("#93c5fd"), spaceAfter=2, leading=14, alignment=1)
    st_body    = _style("Body",    fontSize=9,  textColor=C_BLACK,      leading=12)
    st_label   = _style("Label",   fontSize=8,  textColor=C_GRAY,       leading=10)
    st_value   = _style("Value",   fontSize=11, textColor=C_BLACK,      leading=14, fontName=font_name)
    st_footer  = _style("Footer",  fontSize=7,  textColor=C_GRAY,       alignment=1, leading=10)
    st_note    = _style("Note",    fontSize=8,  textColor=C_GRAY,       leading=11)

    # ─── Document ─────────────────────────────────────────────────
    buf  = BytesIO()
    doc  = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=10*mm,  bottomMargin=15*mm,
        title=f"รายงาน {report_data.get('catName','')}"
    )

    page_w = A4[0] - 30*mm   # usable width

    story = []

    # ─── Header Block ─────────────────────────────────────────────
    header_data = [[
        Paragraph("PlaNeat Support", st_title),
    ]]
    sub_data = [[
        Paragraph(report_data.get("catName", ""), _style("H2", fontSize=13, textColor=C_WHITE, leading=16, alignment=1)),
    ]]
    period_data = [[
        Paragraph(report_data.get("period", ""), st_sub),
    ]]
    gen_dt = report_data.get("generatedAt", datetime.now())
    if isinstance(gen_dt, str):
        gen_dt = datetime.now()
    gen_str = gen_dt.strftime("%d/%m/") + str(gen_dt.year + 543) + gen_dt.strftime(" %H:%M น.")
    date_data = [[
        Paragraph(f"วันที่สร้าง: {gen_str}", _style("GenDate", fontSize=8, textColor=colors.HexColor("#93c5fd"), alignment=1, leading=12)),
    ]]

    header_table = Table(
        [header_data[0], sub_data[0], period_data[0], date_data[0]],
        colWidths=[page_w]
    )
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_DARK_BLUE),
        ("TOPPADDING",    (0,0), (-1,0), 14),
        ("BOTTOMPADDING", (0,-1), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("ROUNDEDCORNERS", [8]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8*mm))

    # ─── Budget Summary Boxes (4 columns) ─────────────────────────
    total         = report_data.get("total", 0)
    monthly_budget = report_data.get("monthlyBudget", 0)
    pct_used      = report_data.get("pctUsed", 0)
    remaining     = report_data.get("remaining", 0)

    def _box(label: str, value: str, color: colors.Color) -> list:
        return [
            Paragraph(label, _style(f"BL{label}", fontSize=8, textColor=C_GRAY, alignment=1, leading=10)),
            Paragraph(value, _style(f"BV{label}", fontSize=12, textColor=color, alignment=1, fontName=font_name, leading=16)),
        ]

    remain_color = C_GREEN if remaining >= 0 else C_RED
    pct_color    = C_RED   if pct_used > 100 else (colors.HexColor("#d97706") if pct_used > 80 else C_GREEN)

    box_w = page_w / 4
    budget_table = Table(
        [[
            _box("ยอดใช้แล้ว (฿)", _fmt(total),          C_DARK_BLUE),
            _box("งบประมาณ (฿)",   _fmt(monthly_budget),  C_DARK_BLUE),
            _box("% ที่ใช้ไป",     f"{pct_used:.1f}%",    pct_color),
            _box("คงเหลือ (฿)",    _fmt(remaining),        remain_color),
        ]],
        colWidths=[box_w] * 4,
    )
    budget_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_LIGHT_BLUE),
        ("BOX",           (0,0), (-1,-1), 0.5, C_BORDER),
        ("INNERGRID",     (0,0), (-1,-1), 0.5, C_BORDER),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(budget_table)
    story.append(Spacer(1, 6*mm))

    # ─── Expense Table ────────────────────────────────────────────
    COL_WIDTHS = [12*mm, 24*mm, 0, 28*mm, 28*mm, 26*mm]
    # column index 2 (รายละเอียด) fills remaining space
    detail_w = page_w - sum(w for w in COL_WIDTHS if w)
    COL_WIDTHS[2] = detail_w

    th_style = _style("TH", fontSize=8, textColor=C_WHITE, alignment=1, leading=10)
    td_style = _style("TD", fontSize=8, textColor=C_BLACK, leading=11)
    td_r     = _style("TDR", fontSize=8, textColor=C_BLACK, alignment=2, leading=11)

    headers = [
        Paragraph("ลำดับ",      th_style),
        Paragraph("วันที่",      th_style),
        Paragraph("รายละเอียด", th_style),
        Paragraph("ผู้บันทึก",  th_style),
        Paragraph("อนุมัติโดย", th_style),
        Paragraph("ยอด (฿)",    th_style),
    ]

    records = report_data.get("records", [])
    table_data = [headers]

    for i, rec in enumerate(records):
        row_style = _style(f"TD{i}", fontSize=8, textColor=C_BLACK, leading=11)
        row_style_r = _style(f"TDR{i}", fontSize=8, textColor=C_BLACK, alignment=2, leading=11)
        table_data.append([
            Paragraph(str(i + 1),               row_style),
            Paragraph(str(rec.get("date", "")), row_style),
            Paragraph(str(rec.get("detail", "")), row_style),
            Paragraph(str(rec.get("recorderName") or rec.get("recorder", "")), row_style),
            Paragraph(str(rec.get("approver", "")), row_style),
            Paragraph(_fmt(rec.get("amount", 0)), row_style_r),
        ])

    # Total row
    total_style  = _style("TotL", fontSize=9, textColor=C_WHITE, fontName=font_name, leading=12)
    total_styleR = _style("TotR", fontSize=9, textColor=C_WHITE, fontName=font_name, alignment=2, leading=12)
    table_data.append([
        Paragraph("", total_style),
        Paragraph("", total_style),
        Paragraph("", total_style),
        Paragraph("", total_style),
        Paragraph("รวมทั้งสิ้น", total_style),
        Paragraph(_fmt(total), total_styleR),
    ])

    expense_table = Table(table_data, colWidths=COL_WIDTHS, repeatRows=1)

    ts = TableStyle([
        # Header row
        ("BACKGROUND",    (0,0),  (-1,0),  C_DARK_BLUE),
        ("TEXTCOLOR",     (0,0),  (-1,0),  C_WHITE),
        ("FONTNAME",      (0,0),  (-1,0),  font_name),
        ("FONTSIZE",      (0,0),  (-1,0),  8),
        ("TOPPADDING",    (0,0),  (-1,0),  6),
        ("BOTTOMPADDING", (0,0),  (-1,0),  6),
        ("ALIGN",         (0,0),  (-1,0),  "CENTER"),
        # Data rows
        ("FONTNAME",      (0,1),  (-1,-2), font_name),
        ("FONTSIZE",      (0,1),  (-1,-2), 8),
        ("TOPPADDING",    (0,1),  (-1,-2), 4),
        ("BOTTOMPADDING", (0,1),  (-1,-2), 4),
        ("VALIGN",        (0,0),  (-1,-1), "MIDDLE"),
        ("GRID",          (0,0),  (-1,-1), 0.3, C_BORDER),
        ("ALIGN",         (-1,1), (-1,-1), "RIGHT"),
        # Total row
        ("BACKGROUND",    (0,-1), (-1,-1), C_TOTAL_BG),
        ("FONTNAME",      (0,-1), (-1,-1), font_name),
        ("TOPPADDING",    (0,-1), (-1,-1), 6),
        ("BOTTOMPADDING", (0,-1), (-1,-1), 6),
        ("SPAN",          (0,-1), (3,-1)),
    ])

    # Alternating row colors
    for row_idx in range(1, len(table_data) - 1):
        if row_idx % 2 == 0:
            ts.add("BACKGROUND", (0, row_idx), (-1, row_idx), C_ALT_ROW)

    expense_table.setStyle(ts)
    story.append(expense_table)
    story.append(Spacer(1, 10*mm))

    # ─── Signature Section ────────────────────────────────────────
    sig_style = _style("Sig", fontSize=9, textColor=C_BLACK, leading=14)
    sig_table = Table(
        [[
            Paragraph("ผู้บันทึก: ___________________________", sig_style),
            Paragraph("ผู้อนุมัติ: ___________________________", sig_style),
        ]],
        colWidths=[page_w / 2, page_w / 2],
    )
    sig_table.setStyle(TableStyle([
        ("ALIGN",  (0,0), (0,0), "LEFT"),
        ("ALIGN",  (1,0), (1,0), "RIGHT"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(sig_table)

    story.append(Spacer(1, 8*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER))
    story.append(Spacer(1, 3*mm))

    # ─── Footer ───────────────────────────────────────────────────
    footer_str = (
        f"สร้างโดยระบบ PlaNeat Support | "
        f"วันที่สร้าง: {gen_dt.strftime('%d/%m/')}{gen_dt.year + 543}{gen_dt.strftime(' %H:%M')}"
    )
    story.append(Paragraph(footer_str, st_footer))

    doc.build(story)
    return buf.getvalue()


def generate_history_pdf(
    records: list,
    period_label: str,
    cat_name: str = "ทุกหมวด",
    categories_summary: list = None,  # [{name, total, count}] for "all"
    total_budget: float = 0,
    doc_no: str = "",
    mode: str = "auto",  # "auto" | "summary" | "detail"
) -> bytes:
    """
    สร้าง PDF รายงานประวัติค่าใช้จ่าย แนวนอน (Landscape A4)
    รองรับการแสดงทุกหมวดหมู่หรือหมวดเดียว
    """
    font = _register_thai_font()
    PAGE = landscape(A4)
    page_w = PAGE[0] - 30 * mm

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=PAGE,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=10 * mm,  bottomMargin=12 * mm,
        title=f"รายงานค่าใช้จ่าย {period_label}",
    )

    def S(name, **kw):
        kw.setdefault("fontName", font)
        return ParagraphStyle(name, **kw)

    st_h1     = S("h1",    fontSize=18, textColor=C_WHITE,    alignment=1, leading=22, spaceAfter=2)
    st_h2     = S("h2",    fontSize=11, textColor=colors.HexColor("#93c5fd"), alignment=1, leading=14)
    st_gen    = S("gen",   fontSize=8,  textColor=colors.HexColor("#bfdbfe"), alignment=1, leading=11)
    st_th     = S("th",    fontSize=8,  textColor=C_WHITE,    alignment=1, leading=11)
    st_td     = S("td",    fontSize=8,  textColor=C_BLACK,    leading=11)
    st_tdr    = S("tdr",   fontSize=8,  textColor=C_BLACK,    alignment=2, leading=11)
    st_total  = S("tot",   fontSize=9,  textColor=C_WHITE,    leading=13)
    st_totalr = S("totr",  fontSize=9,  textColor=C_WHITE,    alignment=2, leading=13)
    st_sig    = S("sig",   fontSize=9,  textColor=C_BLACK,    leading=14)
    st_footer = S("ft",    fontSize=7,  textColor=C_GRAY,     alignment=1, leading=10)
    st_sumth  = S("sumth", fontSize=8,  textColor=C_WHITE,    alignment=1, leading=11)
    st_sumtd  = S("sumtd", fontSize=8,  textColor=C_BLACK,    leading=11)
    st_sumtdr = S("sumtdr",fontSize=8,  textColor=C_BLACK,    alignment=2, leading=11)

    story = []
    now = datetime.now()
    gen_str = now.strftime("%d/%m/") + str(now.year + 543) + now.strftime(" %H:%M น.")
    doc_no_str = doc_no or f"RPT-{now.strftime('%Y%m%d%H%M%S')}"

    # ─── Header ──────────────────────────────────────────────────────────────
    header_tbl = Table(
        [
            [Paragraph("PlaNeat Support — รายงานค่าใช้จ่าย", st_h1)],
            [Paragraph(f"{cat_name}  ·  {period_label}", st_h2)],
            [Paragraph(f"เลขที่เอกสาร: {doc_no_str}  ·  พิมพ์เมื่อ: {gen_str}", st_gen)],
        ],
        colWidths=[page_w],
    )
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_DARK_BLUE),
        ("TOPPADDING",    (0, 0), (-1,  0), 14),
        ("BOTTOMPADDING", (0,-1), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 16),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 16),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 6 * mm))

    grand_total = sum(r.get("amount", 0) for r in records)

    # ─── Summary boxes ────────────────────────────────────────────────────────
    def _box2(lbl, val, color):
        return [
            Paragraph(lbl, S(f"bl{lbl}", fontSize=8, textColor=C_GRAY, alignment=1, leading=10)),
            Paragraph(val, S(f"bv{lbl}", fontSize=13, textColor=color, alignment=1, fontName=font, leading=17)),
        ]

    pct = round(grand_total / total_budget * 100, 1) if total_budget > 0 else 0.0
    remaining = total_budget - grand_total
    pct_color = C_RED if pct > 100 else (colors.HexColor("#d97706") if pct > 80 else C_GREEN)
    rem_color = C_GREEN if remaining >= 0 else C_RED

    sum_boxes = [
        _box2("จำนวนรายการ", str(len(records)), C_DARK_BLUE),
        _box2("ยอดรวม (฿)", _fmt(grand_total), C_DARK_BLUE),
    ]
    box_w_list = [page_w / 4, page_w / 4]
    if total_budget > 0:
        sum_boxes += [_box2("งบประมาณ (฿)", _fmt(total_budget), C_DARK_BLUE), _box2("% ที่ใช้ไป / คงเหลือ", f"{pct:.1f}% / ฿{_fmt(remaining)}", pct_color)]
        box_w_list = [page_w / 4] * 4
    else:
        box_w_list = [page_w / 2, page_w / 2]

    sum_tbl = Table([sum_boxes], colWidths=box_w_list)
    sum_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_LIGHT_BLUE),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, C_BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 5 * mm))

    # ─── Category summary (when "all") ───────────────────────────────────────
    if categories_summary:
        cs = categories_summary
        cat_headers = [Paragraph(h, st_sumth) for h in ["หมวดหมู่", "จำนวนรายการ", "ยอดรวม (฿)"]]
        cat_rows = [cat_headers]
        for c in sorted(cs, key=lambda x: -x.get("total", 0)):
            cat_rows.append([
                Paragraph(c.get("name", ""), st_sumtd),
                Paragraph(str(c.get("count", 0)), S("sc", fontSize=8, textColor=C_BLACK, alignment=1, leading=11)),
                Paragraph(_fmt(c.get("total", 0)), st_sumtdr),
            ])
        cat_rows.append([
            Paragraph("รวมทั้งสิ้น", st_total),
            Paragraph(str(len(records)), st_totalr),
            Paragraph(_fmt(grand_total), st_totalr),
        ])
        cw = [page_w * 0.5, page_w * 0.2, page_w * 0.3]
        cat_tbl = Table(cat_rows, colWidths=cw)
        cat_ts = TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  C_MID_BLUE),
            ("FONTNAME",      (0, 0), (-1, 0),  font),
            ("GRID",          (0, 0), (-1, -1), 0.3, C_BORDER),
            ("FONTNAME",      (0, 1), (-1, -2), font),
            ("FONTSIZE",      (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",         (1, 1), (2, -1),  "RIGHT"),
            ("BACKGROUND",    (0,-1), (-1, -1), C_TOTAL_BG),
            ("FONTNAME",      (0,-1), (-1, -1), font),
        ])
        for ri in range(1, len(cat_rows) - 1):
            if ri % 2 == 0:
                cat_ts.add("BACKGROUND", (0, ri), (-1, ri), C_ALT_ROW)
        cat_tbl.setStyle(cat_ts)
        story.append(KeepTogether([
            Paragraph("สรุปตามหมวดหมู่", S("csub", fontSize=9, textColor=C_DARK_BLUE, fontName=font, leading=13, spaceAfter=3)),
            cat_tbl,
        ]))
        story.append(Spacer(1, 5 * mm))

    # ─── Decide effective mode ────────────────────────────────────────────────
    # auto: ≤50 → flat detail, >50 → grouped by category
    effective_mode = mode
    if mode == "auto":
        effective_mode = "detail" if len(records) <= 50 else "grouped"

    # ─── Helper: build one detail table (flat list of records) ────────────────
    def _build_detail_table(recs: list, show_cat: bool, start_no: int = 1):
        if show_cat:
            cw = [10*mm, 20*mm, 25*mm, 0, 25*mm, 25*mm, 25*mm, 24*mm]
            cw[3] = page_w - sum(w for w in cw if w)
            hdr = [Paragraph(h, st_th) for h in ["ลำดับ","วันที่","หมวดหมู่","รายละเอียด","หมายเหตุ","ผู้บันทึก","อนุมัติโดย","ยอด (฿)"]]
        else:
            cw = [10*mm, 24*mm, 0, 30*mm, 30*mm, 30*mm, 26*mm]
            cw[2] = page_w - sum(w for w in cw if w)
            hdr = [Paragraph(h, st_th) for h in ["ลำดับ","วันที่","รายละเอียด","หมายเหตุ","ผู้บันทึก","อนุมัติโดย","ยอด (฿)"]]

        rows = [hdr]
        subtotal = 0.0
        for i, rec in enumerate(recs):
            amt = rec.get("amount", 0)
            subtotal += amt
            ast = S(f"a{start_no+i}", fontSize=8, textColor=C_BLACK, alignment=2, leading=11)
            if show_cat:
                rows.append([
                    Paragraph(str(start_no + i), st_td),
                    Paragraph(str(rec.get("date", "")), st_td),
                    Paragraph(str(rec.get("category", "")), st_td),
                    Paragraph(str(rec.get("detail", "")), st_td),
                    Paragraph(str(rec.get("note", "")), st_td),
                    Paragraph(str(rec.get("recorderName") or rec.get("recorder", "")), st_td),
                    Paragraph(str(rec.get("approver", "")), st_td),
                    Paragraph(_fmt(amt), ast),
                ])
            else:
                rows.append([
                    Paragraph(str(start_no + i), st_td),
                    Paragraph(str(rec.get("date", "")), st_td),
                    Paragraph(str(rec.get("detail", "")), st_td),
                    Paragraph(str(rec.get("note", "")), st_td),
                    Paragraph(str(rec.get("recorderName") or rec.get("recorder", "")), st_td),
                    Paragraph(str(rec.get("approver", "")), st_td),
                    Paragraph(_fmt(amt), ast),
                ])

        n = len(hdr)
        rows.append(
            [Paragraph("", st_total)] * (n - 2) +
            [Paragraph("รวม", st_total), Paragraph(_fmt(subtotal), st_totalr)]
        )

        tbl = Table(rows, colWidths=cw, repeatRows=1)
        ts = TableStyle([
            ("BACKGROUND",    (0, 0),  (-1, 0),  C_DARK_BLUE),
            ("FONTNAME",      (0, 0),  (-1, 0),  font),
            ("FONTSIZE",      (0, 0),  (-1, 0),  8),
            ("TOPPADDING",    (0, 0),  (-1, 0),  6),
            ("BOTTOMPADDING", (0, 0),  (-1, 0),  6),
            ("FONTNAME",      (0, 1),  (-1, -2), font),
            ("FONTSIZE",      (0, 1),  (-1, -2), 8),
            ("TOPPADDING",    (0, 1),  (-1, -2), 4),
            ("BOTTOMPADDING", (0, 1),  (-1, -2), 4),
            ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
            ("GRID",          (0, 0),  (-1, -1), 0.3, C_BORDER),
            ("ALIGN",         (-1, 1), (-1, -1), "RIGHT"),
            ("BACKGROUND",    (0, -1), (-1, -1), C_TOTAL_BG),
            ("FONTNAME",      (0, -1), (-1, -1), font),
            ("TOPPADDING",    (0, -1), (-1, -1), 6),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
            ("SPAN",          (0, -1), (n - 3, -1)),
        ])
        for ri in range(1, len(rows) - 1):
            if ri % 2 == 0:
                ts.add("BACKGROUND", (0, ri), (-1, ri), C_ALT_ROW)
        tbl.setStyle(ts)
        return tbl

    # ─── Render detail section ────────────────────────────────────────────────
    show_cat_col = cat_name == "ทุกหมวด"

    if effective_mode == "summary":
        # Summary only — no detail table
        pass

    elif effective_mode == "grouped":
        # Group records by category
        from collections import OrderedDict
        groups: dict = OrderedDict()
        for rec in records:
            ck = rec.get("catKey") or rec.get("category", "อื่นๆ")
            cn = rec.get("category", ck)
            if ck not in groups:
                groups[ck] = {"name": cn, "recs": []}
            groups[ck]["recs"].append(rec)

        story.append(Paragraph(
            "รายละเอียดแยกตามหมวดหมู่",
            S("gsub", fontSize=10, textColor=C_DARK_BLUE, fontName=font, leading=14, spaceAfter=4)
        ))
        global_no = 1
        for ck, grp in groups.items():
            grp_total = sum(r.get("amount", 0) for r in grp["recs"])
            story.append(KeepTogether([
                Paragraph(
                    f'<font color="#1e3a8a"><b>{grp["name"]}</b></font>'
                    f'  ({len(grp["recs"])} รายการ  ·  ฿{_fmt(grp_total)})',
                    S(f"gh{ck}", fontSize=9, textColor=C_BLACK, fontName=font, leading=13,
                      spaceBefore=6, spaceAfter=3, backColor=C_LIGHT_BLUE,
                      leftIndent=6, rightIndent=6, borderPadding=(4, 6, 4, 6))
                ),
                _build_detail_table(grp["recs"], show_cat=False, start_no=global_no),
            ]))
            global_no += len(grp["recs"])
            story.append(Spacer(1, 4 * mm))

    else:
        # detail mode — flat table (original behavior)
        story.append(Paragraph(
            "รายการทั้งหมด",
            S("esub", fontSize=9, textColor=C_DARK_BLUE, fontName=font, leading=13, spaceAfter=3)
        ))
        story.append(_build_detail_table(records, show_cat=show_cat_col, start_no=1))

    story.append(Spacer(1, 8 * mm))

    # ─── Signature ────────────────────────────────────────────────────────────
    sig_tbl = Table([[
        Paragraph("ผู้จัดทำ: ___________________________", st_sig),
        Paragraph("ผู้ตรวจสอบ: ___________________________", st_sig),
        Paragraph("ผู้อนุมัติ: ___________________________", st_sig),
    ]], colWidths=[page_w / 3] * 3)
    sig_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sig_tbl)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        f"สร้างโดยระบบ PlaNeat Support  ·  {gen_str}",
        st_footer,
    ))

    doc.build(story)
    return buf.getvalue()
