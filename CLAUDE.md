# Planeat App — บันทึกงานสำหรับ AI

## Stack
- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS — port 3001
- **Backend**: FastAPI + Motor (async) + MongoDB — port 8001
- **Deploy**: Docker Compose

## Deploy Command (ใช้ทุกครั้งที่แก้โค้ด)
```bash
cd "C:\Users\hot it\Downloads\planeat-app"
docker-compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker-compose up -d --build
```

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
- [x] **CategoryManagerTab** — ปรับปรุง UX: เติมฟิลด์อัตโนมัติเมื่อเปลี่ยนสูตรทันที, เพิ่มฟิลด์ "ชื่อรายการ" ในค่าเริ่มต้นทุกสูตร, ล็อคหน่วยนับสำหรับยอดเงิน/ค่าคงที่ (แก้ได้เฉพาะจำนวน)

### Backend Endpoints ที่เพิ่มล่าสุด
- [x] `PUT /api/expenses/{id}` — แก้ไขรายการ (manager เท่านั้น)
- [x] `POST /api/notifications/line-notify` — ส่งข้อความผ่าน LINE Notify API

### Phase 0 — Infrastructure ✅ (เสร็จทั้งหมด)
- [x] 0.6 ตรวจสอบ `.gitignore` (ป้องกัน Secret หลุด)
- [x] 0.7 ย้าย PDF Storage ออกจาก Memory ไปยัง Docker Volume (`pdf_data`)
- [x] 0.8 + 0.11 ติดตั้ง Redis (caching หมวดหมู่ + ARQ job queue)
- [x] 0.9 แยก Scheduler ออกเป็น ARQ Background Worker (`planeat-worker`)
- [x] 0.10 เปลี่ยน Polling 30s เป็น Server-Sent Events (SSE)
- [x] 0.12 ตั้งค่าระบบ Logging (LOG_LEVEL env, structured format)
- [x] 0.13 อัปเดต `.env.example` ให้ครบสำหรับการสเกล

### อื่นๆ
- [x] Profile page — ขอ/แสดงสิทธิ์
- [x] IT Access page
- [x] Chat page (SSE real-time)
- [x] Inventory page
- [x] PDF Report — landscape A4, Thai font, รายวัน/รายสัปดาห์/รายเดือน

### Phase 1A — Core Customer CRUD ✅
- [x] Customer model + service + router (workspace-scoped)
- [x] หน้ารายการลูกค้า + ค้นหา + กรอง + Export CSV
- [x] หน้าดูรายละเอียดลูกค้า

### Phase 1B — Customer Segments ✅
- [x] 1.8 `customer_segments` collection + Pydantic models + API (`/api/crm-workspaces/{ws}/segments`)
- [x] 1.9 หน้าจัดการกลุ่มลูกค้า (`/customers/segments`) — CRUD + color/icon picker
- [x] 1.10 เพิ่ม `segmentIds` field ใน Customer model + form เลือกกลุ่มได้
- [x] 1.11 Filter ลูกค้าตาม segment (segment pills + backend query)

---

## งานที่ยังค้าง / ยังไม่ได้ทำ ⏳

- [ ] ทดสอบการใช้งานจริงทุก feature ที่เพิ่มใหม่
- [x] Phase 1C — LINE OA Auto-Import (1.12–1.14)
- [x] Phase 1D — Google Sheets Auto-Import (1.15–1.17)
- [ ] Phase 1E — Facebook/Instagram (รอ Meta Review)
- [ ] Phase 2+ — ตามแผน PROJECT_MASTER_PLAN.md

---

## โครงสร้างไฟล์สำคัญ

```
planeat-app/
├── frontend/
│   ├── app/(app)/
│   │   ├── expense-control/page.tsx   ← หน้าหลัก (OverviewTab, DailyTab, HistoryTab, CategoryManagerTab)
│   │   ├── dashboard/page.tsx         ← redirect → /expense-control
│   │   ├── chat/page.tsx
│   │   ├── inventory/page.tsx
│   │   ├── profile/page.tsx
│   │   └── it-access/page.tsx
│   ├── components/layout/Sidebar.tsx
│   ├── lib/api.ts                     ← API functions ทั้งหมด
│   └── types/index.ts
├── backend/
│   ├── app/
│   │   ├── routers/                   ← expenses.py, notifications.py, categories.py, ...
│   │   ├── services/                  ← business logic
│   │   └── models/                    ← Pydantic models
│   └── requirements.txt
└── docker-compose.yml
```

---

## หมายเหตุสำคัญ
- Docker cache ปัญหาบ่อย → ต้อง `docker rmi` ก่อน build ทุกครั้ง
- Frontend build ใหม่ต้องตรวจสอบด้วย: `docker-compose exec -T frontend sh -c "grep -r 'keyword' /app/.next/ | wc -l"`
- Backend role ที่มีสิทธิ์แก้ไข expense: `ACCOUNTING_ROLES` (admin, manager, accounting)
