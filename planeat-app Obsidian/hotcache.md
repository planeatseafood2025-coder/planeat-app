# Hotcache — Recent Conversation Summary

อัปเดตล่าสุด: 2026-04-19

---

## Wiki นี้คืออะไร

Personal knowledge base สำหรับโปรเจค Planeat App — LLM เขียนและดูแล wiki ทั้งหมด

---

## โครงสร้าง

```
planeat-app Obsidian/
├── raw/        ← source (LLM ห้ามแก้)
├── pages/      ← LLM เขียนทั้งหมด
├── hotcache.md ← อ่านก่อนทุกครั้ง (ไฟล์นี้)
├── index.md    ← สารบัญ
├── log.md      ← history
└── CLAUDE.md   ← schema + กฎ VPS
```

---

## สถานะโค้ดล่าสุด

- **Commit**: `6409bec` (base) — session ล่าสุดแก้ตรง VPS โดยตรง ยังไม่ได้ commit
- **VPS dev**: planeatdev.duckdns.org — port 3002/8002 ทำงานปกติ ✅

---

## Deploy Workflow — กฎสำคัญ

```
เครื่องหลัก (แก้โค้ด) → อัพ VPS โดยตรง (ไม่ผ่าน git)
VPS (AI แก้โค้ด) → git commit + push → เครื่องหลัก git pull
```

- **Deploy ขึ้น 3002/8002 เสมอ** — 3001/8001 เจ้าของจัดการเอง ห้ามแตะ
- **Git = backup เท่านั้น** — push เมื่อเจ้าของสั่งเท่านั้น
- **SSH เข้า VPS → ตรวจ memory ก่อนเสมอ**: `free -h && docker stats --no-stream`
- ถ้า memory สูงผิดปกติ → image เก่าค้างอยู่ → rebuild (DB ปลอดภัยเสมอ)
- **Deploy command**: `docker compose -f docker-compose.dev.yml up -d --build` → ใช้ script `/root/planeat-app/deploy-dev.sh`
- **ห้าม `compose down`** — ทำให้ข้อมูลหาย ถ้า container conflict ให้ `docker rm -f <container>` แทน
- **Upload จากเครื่องหลัก**: `bash upload-dev.sh` (rsync + auto deploy)
- **รหัสผ่าน VPS**: เปลี่ยนบ่อย — ต้องถามผู้ใช้ทุกครั้ง ห้ามสมมติเอง
- **VPS IP**: `76.13.211.161` | SSH Key: `C:/Users/hot it/.ssh/planeat-vps`
- **nginx prod ชี้ไป dev ports** — planeatsupport.duckdns.org → 3002/8002 (ยังไม่ได้แก้ เจ้าของต้องแก้เอง)

---

## โมดูลที่มีในระบบ (ครบแล้ว)

| โมดูล | Route | สถานะ |
|---|---|---|
| Auth & Roles | /login, /register | ✅ |
| Expense Control | /expense-control | ✅ |
| Budget | /budget | ✅ |
| CRM Customers | /customers | ✅ |
| Sales Pipeline | /sales/deals | ✅ Phase 2 เริ่มแล้ว |
| Inventory | /inventory | ✅ |
| Chat | /chat | ✅ |
| Integrations | /integrations | ✅ |

---

## อัปเดตล่าสุด (2026-04-19)

### 1. LINE Approval Flex — แสดงงบคงเหลือ ✅
**ไฟล์**: `backend/app/services/line_notify_service.py`
- `_build_approval_flex()` รับ `monthly_budget` + `spent_month` เพิ่มเติม
- ถ้ามีงบตั้งไว้ การ์ดจะแสดง 3 แถวใหม่: **งบเดือนนี้ / ใช้ไปแล้ว / คงเหลือ** (สีเขียว/แดง)
- `notify_draft_submitted()` query งบจาก MongoDB ก่อนส่ง flex ทุกครั้ง

### 2. ผู้กรอก = ผู้อนุมัติ รับ Flex card ด้วย ✅
**ไฟล์**: `backend/app/services/line_notify_service.py`
- **เดิม**: filter `"username": {"$ne": recorder}` — ถ้ากรอกเองแล้วเป็น manager คนเดียว ไม่มีใครได้รับการ์ดเลย
- **ใหม่**: ลบ filter ออก — manager ทุกคนรับการ์ดรวมถึงตัวเอง
- ⚠️ เหมาะกับทีมเล็ก/ช่วงทดสอบ — ถ้าต้องการ strict ภายหลังให้เพิ่ม filter กลับ

### 3. Standalone LINE Login Flow ✅
**ไฟล์**: `backend/app/routers/auth.py`

เพิ่ม 2 endpoints ใหม่ + ปรับ callback:

| Endpoint | หน้าที่ |
|---|---|
| `GET /api/auth/line/standalone-start` | Redirect browser ไป LINE OAuth (standalone flag ใน state) |
| `GET /api/auth/line/standalone-verify?stoken=xxx` | ตรวจ token คืน user data + categories ที่มีสิทธิ์ |
| `GET /api/auth/line/callback` (ปรับ) | ถ้า state มี `standalone=True` → return `{"status":"standalone_redirect","redirectUrl":"..."}` แทน JSON ปกติ |

**Flow**:
```
standalone-start → LINE OAuth → /auth/line/callback (frontend)
→ fetch /api/auth/line/callback → ตรวจ standalone → standalone_redirect
→ window.location.href = /standalone?stoken=xxx
→ standalone-verify → categories → กรอกฟอร์ม
```

**MongoDB collection ใหม่**: `line_standalone_tokens` — stoken อายุ 4 ชั่วโมง

**ข้อควรระวัง**: standalone-start ใช้ `callbackUrl` เดียวกับ regular login (ตั้งค่าใน LINE Console ครั้งเดียวได้เลย)

### 4. Refactor submit_draft — รวม 3 functions เป็น helpers ✅
**ไฟล์**: `backend/app/services/expense_service.py`
- **เดิม**: `submit_draft`, `submit_draft_dynamic`, `submit_draft_dynamic_public` ซ้ำกัน 90+ บรรทัด/ตัว
- **ใหม่**: แยกเป็น 2 helper:
  - `_get_user_line_info(db, username)` → คืน `(name, lineUid)` จาก DB
  - `_submit_draft_internal(...)` → logic กลางทั้งหมด รองรับ `is_standalone` flag
- แต่ละ route function ตอนนี้ ~20 บรรทัด เรียก helper เท่านั้น
- **Category ใหม่ที่ admin สร้าง**: ทำงานเหมือนกันหมด — `_submit_draft_internal` ไม่รู้จัก category ทำแค่ notify

### 5. Bug fixes ที่พบระหว่าง session ✅
- `lineId` → `lineUid` แก้ใน 5+ จุดใน expense_service.py
- `save_expense()` เดิม hardcode `recorderLineId: ""` → แก้ให้ query DB จริง
- username auto-gen สำหรับชื่อไทย: `EMP0001, EMP0002...` แทนการ fallback เป็น "user"
- Approval buttons เปลี่ยนจาก Message → Postback (ไม่แสดงข้อความใน chat)

### 6. Docker Build Cache ⚠️
- Build cache สะสมได้ถึง **28GB** จากการ deploy ซ้ำหลายรอบ
- ล้างด้วย: `docker builder prune -af`
- แนะนำรันเดือนละครั้งหรือเมื่อพื้นที่ตึง
- **ไม่กระทบ** การทำงานของระบบ — deploy ครั้งต่อไปแค่ build นานขึ้นเล็กน้อย

---

## LINE System — สถานะปัจจุบัน

- LINE Login OAuth 2.0 แทน OTP ✅
- Flex Message อนุมัติ expense ✅
- Flex Message อนุมัติสมาชิกใหม่ ✅
- Push แจ้งผู้กรอก expense ✅
- Webhook URL dynamic จาก `PUBLIC_URL` ✅
- **OTP ระบบเก่า — ลบออกแล้วทั้งหมด**

MongoDB collections ใหม่:
- `line_approval_pending` — pending Y/N อนุมัติ expense
- `line_user_approval_pending` — pending Y/N อนุมัติสมาชิก
- `line_login_temp` — temp profile ระหว่าง LINE OAuth
- `line_login_states` — CSRF state

LINE push ส่วนตัวได้ก็ต่อเมื่อ user **add OA เป็นเพื่อน** ก่อนเท่านั้น — fallback ใช้ lineNotifyToken

---

## Blockers ด่วน

1. **SSL บน planeatdev.duckdns.org** — LINE approval พร้อมแล้ว รอแค่นี้
2. **Dev DB แยกออกจาก Prod** — ตั้ง `MONGO_DB` env ใหม่

---

## Checklist ก่อน Go-Live Prod (3001/8001)

> รอทำ — ยังใช้ dev อยู่

- [ ] **sync code dev → prod** — deploy โค้ดล่าสุดขึ้น 3001/8001
- [ ] **`.env` prod**: `PUBLIC_URL=https://planeatsupport.duckdns.org`, CORS ถูกต้อง
- [ ] **SSL cert** — `certbot --nginx -d planeatsupport.duckdns.org`
- [ ] **LINE Login channel ใหม่** (สมัครแยก prod/dev) → เอา clientId + clientSecret ใส่ใน Integrations → LINE Login
  - Callback URL: `https://planeatsupport.duckdns.org/auth/line/callback`
- [ ] **LINE Console webhook URL** → `https://planeatsupport.duckdns.org/api/line/webhook/main`
- [ ] **ปิด built-in Greeting Message** ใน LINE OA Manager → ตั้งค่า → การตอบกลับ → ปิด Greeting Message (ถ้าไม่ปิด ระบบส่ง Flex card แต่ LINE ส่งข้อความตัวเองทับ)
- [ ] **สร้าง IT/Admin user** อย่างน้อย 1 คน + add LINE OA ไว้รับแจ้งเตือน
- [ ] ทดสอบ end-to-end: add OA → welcome → login → register → IT อนุมัติ → เข้าระบบ

---

## แผนที่ยังไม่ได้เริ่ม

### Auth Upgrade — 17 Roles (ยังไม่เริ่ม)
แผนอัปเกรด role system จาก 5 roles เป็น 17 roles:
`super_admin, it_manager, it_support, accounting_manager, accountant, hr_manager, hr, warehouse_manager, warehouse_staff, production_manager, production_staff, marketing_manager, marketing_staff, engineering_manager, engineering_staff, general_user`

ลำดับงาน: backend role model → register API → forgot password → frontend login/register/access control → chat system

---

## Phase Roadmap

- **Phase 2 (Q2/2026)**: Kanban UI, LINE Reminder, Sales Dashboard — deals.py เริ่มแล้ว
- **Phase 3 (Q3/2026)**: LINE Broadcast, Email, Facebook/IG
- **Phase 4 (Q4/2026)**: AI Bot LINE, KPI Real-time
- **Phase 5 (Q1/2027)**: Quotation, Billing, HR, Payroll → ERP ครบ

---

## Preferences

- ภาษาไทยเป็นหลัก
- สไตล์ conversational — hook, หัวข้อย่อยชัด, one-liner สรุป
- ไม่ใช้ศัพท์ tech กับคนทั่วไป
