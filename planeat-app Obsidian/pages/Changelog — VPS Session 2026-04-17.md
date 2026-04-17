# Changelog — VPS Session 2026-04-17

สรุปการพัฒนาทั้งหมดจาก VPS · Commits ล่าสุด 6 รายการอยู่บน GitHub branch main แล้ว

---

## ⚙️ Infrastructure

| รายการ | รายละเอียด |
|---|---|
| Docker Compose Dev | `docker-compose.dev.yml` — dev port 3002/8002 แยกจาก prod 3001/8001 |
| Default Admin | สร้าง admin user อัตโนมัติตอน start ครั้งแรก ไม่ต้องสร้างมือ |
| MongoDB Backup/Restore | script สำรองและกู้คืนข้อมูลอัตโนมัติ |
| Build Fix | `NEXT_PUBLIC_API_URL` ถูก bake เข้า Next.js build ตอน compile — แก้แล้ว |

---

## 📱 ระบบ LINE OA

### Login & Register

| รายการ | รายละเอียด |
|---|---|
| LINE Login Standalone | หน้า `/standalone` — พนักงานกรอก expense ผ่าน LINE ไม่ต้องเข้าเว็บหลัก |
| EMP Auto-Username | IT อนุมัติสมาชิก → ระบบสร้าง `EMP0001`, `EMP0002`, ... อัตโนมัติ |
| ปิด Register เก่า | หน้าสมัครแบบเดิมปิดแล้ว เหลือแค่ผ่าน LINE |
| LINE Callback Fix | backend ส่ง HTTP 302 → fetch() ตาม → HTML → `r.json()` พัง → แก้เป็น return JSON + `standalone_redirect` status |

### Webhook & Approval

| รายการ | รายละเอียด |
|---|---|
| LINE Webhook | รับ event, verify signature, บันทึก groupId อัตโนมัติ |
| Flex Message | card ขออนุมัติ expense สวยงามพร้อมปุ่มกด |
| Postback Buttons | เปลี่ยนจาก Y/N เป็น postback พร้อม `draft_id` — แต่ละปุ่มทำงานกับรายการของตัวเองถูกต้อง |
| Status Card | หลังกด → card สีเขียว/แดง/เทาแสดงผลทันที |
| View Pending Carousel | พิมพ์ "รายการ" ใน LINE → carousel แสดงรายการรออนุมัติทั้งหมด |
| อนุมัติทั้งหมด | ปุ่มใน carousel — อนุมัติทุกรายการพร้อมกันครั้งเดียว |
| แจ้ง Manager คนอื่น | มีคนกดแล้ว → แจ้ง manager ที่เหลือทันทีพร้อมชื่อผู้ดำเนินการ |

---

## 💰 ระบบค่าใช้จ่าย (Expense)

### Bug Fixes

| รายการ | รายละเอียด |
|---|---|
| Race Condition | MongoDB atomic `find_one_and_update` — ป้องกัน manager หลายคนอนุมัติซ้อนกัน |
| Empty OT Field | `ValueError: could not convert string to float: ''` เมื่อช่อง OT ว่าง — แก้แล้ว |
| Self-Approval | อนุญาตให้ผู้มีสิทธิ์อนุมัติรายการของตัวเองได้ |
| LINE Notify ไม่ถึง Manager | `submit_draft_dynamic_public` ไม่เคย call `notify_draft_submitted` — แก้แล้ว |

### แสดงชื่อจริง

| รายการ | รายละเอียด |
|---|---|
| ผู้อนุมัติ | เปลี่ยนจาก `EMP0001` → ชื่อ-นามสกุลจริง ทั้งหน้าเว็บและ LINE |
| ผู้กรอก | เปลี่ยนจาก `EMP0001` → ชื่อจริง ทุก path (standalone, เว็บหลัก, legacy) |
| Fallback Chain | `firstName + lastName` → `name` → `lineDisplayName` → `username` |

---

## 🔍 สิ่งที่ค้นพบระหว่างแก้

| สิ่งที่พบ | ผลกระทบ |
|---|---|
| **Nginx** คือ reverse proxy (ไม่ใช่ Traefik) | แก้ config ต้องดู nginx ไม่ใช่ traefik |
| Dev ใช้ DB `planeat` เดียวกับ prod | `MONGO_DB` env var ไม่ถูกตั้งใน container → **ต้องแก้ด่วน** |

---

## ไฟล์ที่เปลี่ยน (6 commits)

- `backend/app/routers/auth.py`
- `backend/app/routers/line_webhook.py`
- `backend/app/services/expense_service.py`
- `backend/app/services/line_notify_service.py`
- `frontend/app/auth/line/callback/page.tsx`
- `frontend/app/standalone/page.tsx`

---

_ดูระบบ LINE: [[ระบบ LINE]]_
_ดู Expense: [[Expense Control]]_
_ดู Infrastructure: [[Infrastructure]]_
_ดู Auth: [[Auth & Roles]]_
_ดู Deploy: [[Deploy & Environments]]_
_ดูงานต่อไป: [[งานขั้นต่อไป]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
