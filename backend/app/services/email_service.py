import smtplib
from email.message import EmailMessage
import asyncio
from datetime import datetime
from ..config import settings
from ..database import get_db

SETTINGS_DOC_ID = "system_settings"

def _send_email_sync(to_email: str, subject: str, html_content: str, smtp_conf: dict):
    # Use dynamic config if provided, otherwise fallback to static settings
    smtp_server = smtp_conf.get("smtpServer") or settings.smtp_server
    smtp_port = smtp_conf.get("smtpPort") or settings.smtp_port
    smtp_user = smtp_conf.get("smtpEmail") or settings.smtp_username
    smtp_pass = smtp_conf.get("smtpPassword") or settings.smtp_password
    smtp_from = smtp_conf.get("smtpEmail") or settings.smtp_from_email

    if not smtp_user or not smtp_pass:
        print(f"[DEV EMAIL] To: {to_email} | Subject: {subject}")
        print("--- CONTENT ---")
        print(html_content)
        print("---------------")
        return

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = smtp_from
    msg['To'] = to_email
    msg.set_content("Please enable HTML to view this email.")
    msg.add_alternative(html_content, subtype='html')

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
        # Re-raise so the caller (at least in dev) knows something went wrong
        raise e

async def send_expense_notification_email(to_email: str, cat_name: str, records: list, smtp_conf: dict):
    """ส่งอีเมลแจ้งเตือนสรุปค่าใช้จ่ายประจำวันตามตาราง schedule ของแต่ละหมวด"""
    total = sum(r.get("amount", 0) for r in records)
    rows_html = ""
    for i, r in enumerate(records, 1):
        rows_html += f"""
        <tr style="background:{'#f8fafc' if i%2==0 else 'white'}">
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">{r.get('date','')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">{r.get('detail') or r.get('recorder','')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">
                ฿{r.get('amount',0):,.2f}
            </td>
        </tr>"""
    if not rows_html:
        rows_html = '<tr><td colspan="3" style="padding:16px;text-align:center;color:#94a3b8;">ไม่มีรายการวันนี้</td></tr>'

    subject = f"📊 รายงานค่าใช้จ่าย: {cat_name} — {datetime.now().strftime('%d/%m/%Y')}"
    html_content = f"""<!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="font-family:'Segoe UI',sans-serif;background:#f4f7fa;margin:0;padding:0;">
      <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.07);">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:28px 30px;">
          <h1 style="margin:0;color:#fff;font-size:20px;">PlaNeat Support</h1>
          <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">สรุปค่าใช้จ่าย: {cat_name}</p>
        </div>
        <div style="padding:28px 30px;">
          <p style="margin:0 0 16px;font-size:14px;color:#475569;">รายงานประจำวันที่ <strong>{datetime.now().strftime('%d/%m/%Y')}</strong></p>
          <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">วันที่</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">รายละเอียด</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;">ยอด (฿)</th>
              </tr>
            </thead>
            <tbody>{rows_html}</tbody>
            <tfoot>
              <tr style="background:#eff6ff;">
                <td colspan="2" style="padding:12px;font-weight:700;color:#1e40af;">รวมทั้งหมด</td>
                <td style="padding:12px;text-align:right;font-weight:800;color:#1e40af;font-size:16px;">฿{total:,.2f}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="background:#f1f5f9;padding:16px 30px;text-align:center;font-size:12px;color:#64748b;">
          &copy; {datetime.now().year} PlaNeat Support — ระบบจัดการสำนักงานอัตโนมัติ
        </div>
      </div>
    </body></html>"""
    await asyncio.to_thread(_send_email_sync, to_email, subject, html_content, smtp_conf)


async def send_approval_email(to_email: str, recorder_name: str, category: str, date_str: str, amount: float, pdf_url: str, smtp_conf: dict):
    """ส่งอีเมลแจ้งผู้บันทึกว่ารายการได้รับการอนุมัติ พร้อมลิงก์ดู PDF"""
    subject = f"✅ รายการของคุณได้รับการอนุมัติ — {category} วันที่ {date_str}"
    html_content = f"""<!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="font-family:'Segoe UI',sans-serif;background:#f4f7fa;margin:0;padding:0;">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.07);">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:28px 30px;">
          <h1 style="margin:0;color:#fff;font-size:20px;">PlaNeat Support</h1>
          <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">การแจ้งเตือนรายการค่าใช้จ่าย</p>
        </div>
        <div style="padding:32px 30px;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px;">
            <span style="font-size:28px;">✅</span>
            <div>
              <p style="margin:0;font-weight:700;color:#15803d;font-size:15px;">รายการได้รับการอนุมัติแล้ว</p>
              <p style="margin:4px 0 0;font-size:13px;color:#166534;">สวัสดี {recorder_name} รายการค่าใช้จ่ายของคุณผ่านการตรวจสอบเรียบร้อยแล้ว</p>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:8px 0;font-size:13px;color:#64748b;width:140px;">หมวดหมู่</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#1e293b;">{category}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#64748b;">วันที่บันทึก</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#1e293b;">{date_str}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#64748b;">ยอดรวม</td><td style="padding:8px 0;font-size:16px;font-weight:800;color:#1e40af;">฿{amount:,.2f}</td></tr>
          </table>
          <a href="{pdf_url}" style="display:inline-block;background:linear-gradient(135deg,#1e40af,#2563eb);color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;">
            📄 ดูรายการใบบันทึก PDF
          </a>
        </div>
        <div style="background:#f1f5f9;padding:16px 30px;text-align:center;font-size:12px;color:#64748b;">
          &copy; {datetime.now().year} PlaNeat Support — ระบบจัดการสำนักงานอัตโนมัติ
        </div>
      </div>
    </body></html>"""
    await asyncio.to_thread(_send_email_sync, to_email, subject, html_content, smtp_conf)


async def send_rejection_email(to_email: str, recorder_name: str, category: str, date_str: str, reason: str, smtp_conf: dict):
    """ส่งอีเมลแจ้งผู้บันทึกว่ารายการไม่ผ่านการอนุมัติ พร้อมเหตุผล"""
    subject = f"❌ รายการของคุณไม่ผ่านการอนุมัติ — {category} วันที่ {date_str}"
    reason_display = reason or "ไม่ระบุ"
    html_content = f"""<!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="font-family:'Segoe UI',sans-serif;background:#f4f7fa;margin:0;padding:0;">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.07);">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:28px 30px;">
          <h1 style="margin:0;color:#fff;font-size:20px;">PlaNeat Support</h1>
          <p style="margin:6px 0 0;color:#93c5fd;font-size:14px;">การแจ้งเตือนรายการค่าใช้จ่าย</p>
        </div>
        <div style="padding:32px 30px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px;">
            <span style="font-size:28px;">❌</span>
            <div>
              <p style="margin:0;font-weight:700;color:#dc2626;font-size:15px;">รายการไม่ผ่านการอนุมัติ</p>
              <p style="margin:4px 0 0;font-size:13px;color:#991b1b;">สวัสดี {recorder_name} รายการค่าใช้จ่ายของคุณไม่ผ่านการตรวจสอบ</p>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:8px 0;font-size:13px;color:#64748b;width:140px;">หมวดหมู่</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#1e293b;">{category}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#64748b;">วันที่บันทึก</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#1e293b;">{date_str}</td></tr>
          </table>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.5px;">เหตุผลที่ไม่อนุมัติ</p>
            <p style="margin:0;font-size:14px;color:#c2410c;">{reason_display}</p>
          </div>
        </div>
        <div style="background:#f1f5f9;padding:16px 30px;text-align:center;font-size:12px;color:#64748b;">
          &copy; {datetime.now().year} PlaNeat Support — ระบบจัดการสำนักงานอัตโนมัติ
        </div>
      </div>
    </body></html>"""
    await asyncio.to_thread(_send_email_sync, to_email, subject, html_content, smtp_conf)


async def send_otp_email(to_email: str, otp: str, name: str = "คุณลูกค้า", is_register: bool = True):
    # Fetch dynamic settings from DB
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    smtp_conf = doc if doc else {}

    subject = "รหัส OTP สำหรับยืนยันอีเมลของคุณ (PlaNeat Support)" if is_register else "รหัส OTP สำหรับเปลี่ยนรหัสผ่าน (PlaNeat Support)"
    action_text = "โปรดนำรหัสผ่านด้านล่างนี้ไปกรอกในหน้าต่างสมัครสมาชิก" if is_register else "โปรดนำรหัสผ่านด้านล่างนี้ไปกรอกในหน้าต่างเปลี่ยนรหัสผ่านเพื่อตั้งรหัสใหม่"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }}
            .header {{ background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 30px; text-align: center; }}
            .header h1 {{ margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 0.5px; }}
            .content {{ padding: 40px 30px; text-align: center; color: #334155; }}
            .content p {{ font-size: 16px; line-height: 1.6; margin-bottom: 25px; }}
            .otp-box {{ background: #f8fafc; border: 2px dashed #94a3b8; border-radius: 12px; padding: 20px; margin: 30px auto; max-width: 300px; }}
            .otp-code {{ font-size: 36px; font-weight: bold; color: #1e40af; letter-spacing: 6px; margin: 0; text-align: center; }}
            .footer {{ background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }}
            .warning {{ font-size: 13px; color: #ef4444; margin-top: 30px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>PlaNeat Support</h1>
            </div>
            <div class="content">
                <h2>สวัสดี {name},</h2>
                <p>เราได้รับการร้องขอรหัส OTP จากคุณในระบบ PlaNeat Support<br>{action_text}</p>
                
                <div class="otp-box">
                    <p class="otp-code">{otp}</p>
                </div>
                
                <p>รหัสนี้มีอายุการใช้งาน <strong>5 นาที</strong></p>
                <p class="warning">* หากคุณไม่ได้เป็นผู้ทำรายการนี้ โปรดละเว้นอีเมลฉบับนี้</p>
            </div>
            <div class="footer">
                &copy; {datetime.now().year} PlaNeat Support. All rights reserved.<br>ระบบจัดการสำนักงานอัตโนมัติ
            </div>
        </div>
    </body>
    </html>
    """
    
    await asyncio.to_thread(_send_email_sync, to_email, subject, html_content, smtp_conf)
