# ระบบ LINE — Planeat App

## ✅ มีอยู่แล้ว

| ฟีเจอร์ | Trigger | การทำงาน |
|---|---|---|
| Follow | user แอด LINE OA | สร้าง Customer + ส่ง Welcome Message |
| Unfollow | user บล็อก | ตั้ง Customer status = inactive |
| OTP ยืนยันตัวตน | พิมพ์ OTP 6 หลัก | verify session สมัครสมาชิก |
| ส่งแจ้งเตือน | manager กดใน HistoryTab | ส่งข้อความผ่าน LINE Notify |
| Join Group | bot เข้ากลุ่ม | บันทึก groupId อัตโนมัติ |

---

## ⏳ ยังไม่มี (แผนในอนาคต)

| ฟีเจอร์ | ประโยชน์ |
|---|---|
| แจ้งเตือน expense เกินงบ | แจ้ง manager ทันทีเมื่อค่าใช้จ่ายเกิน |
| รายงานประจำวัน/สัปดาห์ | ส่งสรุปค่าใช้จ่ายเข้ากลุ่มอัตโนมัติ |
| รับคำสั่งผ่าน chat | พิมพ์ "ยอดวันนี้" บอทตอบกลับ |
| แจ้งเตือน inventory ต่ำ | แจ้งเมื่อสินค้าใกล้หมด |
| แจ้งเตือน customer ใหม่ | แจ้ง manager เมื่อมี lead ใหม่ |

---

## Webhook URL

| สภาพแวดล้อม | URL |
|---|---|
| Local (ทดสอบ) | `https://porous-nell-cruelly.ngrok-free.dev/api/line/webhook/main` |
| VPS (Production) | `https://yourdomain.com/api/line/webhook/main` |

---

## การตั้งค่าใน LINE Developer Console

| การตั้งค่า | ค่า |
|---|---|
| Use webhook | ✅ เปิด |
| Webhook redelivery | ✅ เปิด |
| Auto-reply messages | ❌ ปิด |
