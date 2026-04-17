# Planeat App — บันทึกงานสำหรับ AI

## Stack
- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS — port 3001
- **Backend**: FastAPI + Motor (async) + MongoDB — port 8001
- **Deploy**: Docker Compose

## Deploy Workflow (โครงสร้างใหม่)

```
เครื่องหลัก → อัพขึ้น VPS โดยตรง (ไม่ผ่าน git)
VPS (AI แก้โค้ด) → git push → เครื่องหลัก pull
```

**ทิศทางการไหลของโค้ด:**
- แก้บนเครื่องหลัก → sync ขึ้น VPS โดยตรง
- AI แก้บน VPS → commit + push → เครื่องหลัก `git pull`
- **ไม่มี** GitHub Actions CI/CD (ยกเลิกแผนเดิม)

## Deploy Command (รัน บน VPS หลัง sync โค้ด)
```bash
cd ~/planeat-app
docker-compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker-compose up -d --build
```

## Frontend only (เร็วกว่า ถ้าแก้แค่ frontend)
```bash
docker-compose build --no-cache frontend && docker-compose up -d
```

---

## Domain & Environment
| | URL | หมายเหตุ |
|---|---|---|
| Local + ngrok | `https://porous-nell-cruelly.ngrok-free.dev` | เปลี่ยนทุกครั้งที่เปิด ngrok ใหม่ |
| Dev (duckdns) | `https://planeatdev.duckdns.org` | IP 124.120.58.98 — ยังไม่มี SSL |
| Production | `https://planeatsupport.duckdns.org` | VPS จริง |

**ENV ที่สำคัญใน `.env`:**
- `PUBLIC_URL` — URL สาธารณะของ backend (ใช้แสดง Webhook URL ใน UI)
- `MONGO_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`

---

## งานที่เสร็จแล้ว ✅

### ระบบหลัก
- [x] Login / Register / JWT Auth
- [x] Role-based access (admin, manager, accounting, viewer, ...)
- [x] Dashboard redirect → `/expense-control`
- [x] Sidebar navigation

### Expense Control (`/expense-control`)
- [x] **OverviewTab** — แสดงสรุปงบ, Top 5 หมวดหมู่, กรอง category ได้
- [x] **DailyTab** — บันทึกรายจ่ายรายวัน + ปุ่ม Refresh
- [x] **HistoryTab** — ดูประวัติ, แก้ไขรายการ (manager), ส่ง LINE Notify
- [x] **CategoryManagerTab** — ปรับปรุง UX

### Phase 0 — Infrastructure ✅
- [x] Redis (caching + ARQ job queue)
- [x] ARQ Background Worker (`planeat-worker`)
- [x] Server-Sent Events (SSE) แทน polling
- [x] Logging, `.env.example`

### Phase 1A-1D — CRM ✅
- [x] Customer CRUD + Segments + LINE OA Auto-Import + Google Sheets

### LINE System ✅ (ทำล่าสุด)
- [x] **LINE Login OAuth 2.0** — ปุ่ม Login ด้วย LINE ในหน้า login
  - flow: LINE OAuth → callback → กรอกข้อมูล → pending → IT อนุมัติ
  - เก็บ `lineUid` ใน users collection
- [x] **ลบ OTP สมัครสมาชิก** ออกทั้งหมด (ใช้ LINE Login แทน)
- [x] **Flex Message อนุมัติค่าใช้จ่าย** — ส่งหา accounting_manager ส่วนตัวผ่าน lineUid
  - ปุ่ม ✅ อนุมัติ / ❌ ปฏิเสธ กดได้เลย
  - webhook รับ Y/N → approve/reject อัตโนมัติ
  - แจ้ง recorder กลับทาง LINE
- [x] **Flex Message อนุมัติสมาชิกใหม่** — ส่งหา IT/Admin ทุกคนส่วนตัว
  - ปุ่ม ✅ อนุมัติ / ❌ ปฏิเสธ กดได้เลย
  - webhook รับ Y/N → เปลี่ยน status active/rejected
  - แจ้งผู้สมัครทาง LINE ทันที
- [x] **แจ้งผู้กรอก expense** ทาง LINE เมื่อส่งรายการสำเร็จ
- [x] **Webhook URL** ดึงจาก `PUBLIC_URL` env (ถูกต้องทุก environment)

### Integrations Page (`/integrations`) ✅
- [x] Sidebar layout — 5 เมนู: LINE OA, LINE Login, SMTP, โมดูล, แจ้งเตือน
- [x] แสดง Webhook URL จริงจาก backend พร้อมปุ่ม copy
- [x] Status dot แสดงว่าเชื่อมต่อแล้วหรือยัง

### Register Page ✅
- [x] ปิดการสมัครผ่านหน้าเว็บ → แสดงข้อความให้ใช้ LINE Login แทน

### อื่นๆ
- [x] Profile page, IT Access page, Chat (SSE), Inventory, PDF Report

---

## LINE System Architecture

### Collections ใน MongoDB
- `users` — เก็บ `lineUid`, `status` (pending/active/rejected)
- `line_login_states` — CSRF state สำหรับ LINE Login OAuth
- `line_login_temp` — เก็บ profile ชั่วคราวระหว่างสมัคร (15 นาที)
- `line_approval_pending` — รอคำตอบ Y/N อนุมัติ expense จาก manager
- `line_user_approval_pending` — รอคำตอบ Y/N อนุมัติสมาชิกจาก IT/Admin

### Webhook URL
```
/api/line/webhook/main       ← mainLineOa
/api/line/webhook/{config_id} ← lineOaConfigs แต่ละตัว
```

### ลำดับรับข้อความใน webhook
1. Y/N อนุมัติสมาชิกใหม่ (`line_user_approval_pending`)
2. Y/N อนุมัติค่าใช้จ่าย (`line_approval_pending`)

### การส่ง LINE
- **Push ส่วนตัว** → ใช้ `lineUid` + `mainLineOa.token`
- **Push กลุ่ม** → ใช้ `targetId` + `mainLineOa.token`
- **LINE Notify** → fallback ถ้าไม่มี `lineUid`

---

## งานที่ยังค้าง ⏳
- [ ] ติดตั้ง SSL บน `planeatdev.duckdns.org` สำหรับทดสอบ
- [ ] Push โค้ดขึ้น VPS (git push → GitHub Actions → deploy อัตโนมัติ)
- [ ] ทดสอบ LINE Flex Message + Y/N approval จริง
- [ ] Phase 1E — Facebook/Instagram (รอ Meta Review)
- [ ] Phase 2+ — ตามแผน PROJECT_MASTER_PLAN.md

---

## โครงสร้างไฟล์สำคัญ

```
planeat-app/
├── frontend/
│   ├── app/(app)/
│   │   ├── expense-control/page.tsx
│   │   ├── integrations/page.tsx      ← การเชื่อมต่อระบบ (sidebar layout)
│   │   ├── it-access/page.tsx
│   │   └── ...
│   ├── app/auth/line/callback/page.tsx ← LINE Login callback
│   ├── app/login/page.tsx              ← มีปุ่ม LINE Login
│   ├── app/register/page.tsx           ← ปิดแล้ว → redirect login
│   ├── components/layout/Sidebar.tsx
│   ├── lib/api.ts
│   └── types/index.ts
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── auth.py                ← LINE Login OAuth endpoints
│   │   │   ├── line_webhook.py        ← webhook + Y/N approval handler
│   │   │   ├── expenses.py
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── line_notify_service.py ← Flex Message builder + push functions
│   │   │   ├── expense_service.py
│   │   │   └── ...
│   │   └── models/
└── docker-compose.yml
```

---

## หมายเหตุสำคัญ
- Docker cache ปัญหาบ่อย → ต้อง `--no-cache` เมื่อแก้โค้ดแล้ว build ไม่เปลี่ยน
- Backend role ที่มีสิทธิ์แก้ไข expense: `ACCOUNTING_ROLES` (admin, manager, accounting)
- LINE push ส่วนตัวได้ก็ต่อเมื่อ user **add OA เป็นเพื่อน** ก่อนเท่านั้น
- `PUBLIC_URL` ใน `.env` ต้องอัปเดตทุกครั้งที่เปลี่ยน environment
