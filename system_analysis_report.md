# PlaNeat — System Analysis Report
> อัปเดตล่าสุด: 2026-04-06

---

## 1. ภาพรวมระบบ

**PlaNeat** คือ Web Application สำหรับจัดการองค์กร ครอบคลุมสองระบบหลัก:

| ระบบ | ชื่อ | สถานะ |
|---|---|---|
| **REP** | Expense Reporting & Budget System | ✅ Production-ready |
| **CRM** | Customer Relationship Management | ✅ Phase 1 เสร็จ / Phase 2 กำลังดำเนินการ |

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                    Docker Compose                      │
│                                                        │
│  ┌──────────────┐   ┌────────────────────────────┐    │
│  │  mongodb     │   │  redis (7-alpine)           │    │
│  │  port 27017  │   │  port 6379                 │    │
│  └──────┬───────┘   └──────────────┬─────────────┘    │
│         │                          │                   │
│  ┌──────▼──────────────────────────▼──────────────┐   │
│  │          backend (FastAPI)  port 8001           │   │
│  │  - Motor async MongoDB driver                  │   │
│  │  - JWT Auth + RBAC                             │   │
│  │  - SSE Streaming                               │   │
│  │  - LINE Messaging API                          │   │
│  │  - SMTP Email (HTML templates)                 │   │
│  │  - reportlab PDF (landscape A4, Thai font)     │   │
│  └──────────────────────┬──────────────────────────┘  │
│                         │                             │
│  ┌──────────────────────▼──────────────────────────┐  │
│  │        planeat-worker (ARQ)                     │  │
│  │  - Cron: scheduled PDF reports (hourly)         │  │
│  │  - Same image as backend, different CMD         │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │        frontend (Next.js 14)  port 3001         │  │
│  │  - App Router + TypeScript + Tailwind CSS       │  │
│  │  - SSE client (EventSource)                     │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  Volumes: pdf_data (persistent PDF storage)            │
└────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | หมายเหตุ |
|---|---|---|
| Frontend | Next.js 14 App Router + TypeScript | port 3001 |
| Styling | Tailwind CSS | |
| Backend | FastAPI + Uvicorn | port 8001 |
| DB Driver | Motor (async MongoDB) | ไม่ใช้ PyMongo sync |
| Database | MongoDB | |
| Cache | Redis 7 | TTL-based |
| Job Queue | ARQ (async Redis queue) | replaces APScheduler |
| PDF | reportlab + Garuda Thai font | landscape A4 |
| Realtime | SSE (sse-starlette >= 1.6.5) | replaces setInterval polling |
| Auth | JWT + RBAC | python-jose |
| Email | SMTP (aiosmtplib) | HTML email templates |
| LINE | LINE Messaging API v2 | Webhook + Push |
| Deploy | Docker Compose | 5 services |

---

## 4. REP System — Expense Reporting & Budget

### 4.1 Workflow หลัก

```
ผู้ใช้กรอกรายจ่าย (DailyTab)
        │
        ▼
POST /api/expenses/draft    ← บันทึกเป็น draft รออนุมัติ
        │
        ▼
Approver (manager/admin) เห็นรายการ pending
        │
   ┌────┴────┐
   ▼         ▼
Approve    Reject
   │         │
   ▼         ▼
บันทึก     ส่ง Email
expense    แจ้งเหตุผล
ใน DB
   │
   ├── ส่ง Email (PDF download link)
   ├── สร้าง PDF landscape A4
   └── Push ผ่าน LINE OA
```

### 4.2 หมวดหมู่ค่าใช้จ่าย (Expense Categories)

- เก็บใน `expense_categories` collection
- สูตรคำนวณ: `fixed`, `per_unit`, `per_person`, `formula`
- **Redis Cache** TTL 300s — ล้างอัตโนมัติเมื่อ create/update/delete
- จัดการผ่าน **CategoryManagerTab** (admin/manager)

### 4.3 Expense Draft Model

| Field | คำอธิบาย |
|---|---|
| `recorder` | username ผู้บันทึก |
| `status` | `pending` / `approved` / `rejected` |
| `submittedAt` | เวลาส่ง |
| `approvedBy` | username ผู้อนุมัติ |
| `rejectionReason` | เหตุผลปฏิเสธ (กรณี reject) |

### 4.4 PDF Report

- สร้างบน backend ด้วย **reportlab** + **Garuda font** (รองรับภาษาไทยสมบูรณ์)
- รูปแบบ: **landscape A4**
- ประเภท: รายวัน / รายสัปดาห์ / รายเดือน
- เนื้อหา: Summary boxes → Category breakdown → ตารางรายการ → ช่องลงนาม
- เก็บใน Docker volume `pdf_data` (persistent ข้าม container restart)
- `_PdfStore`: ตรวจ in-memory ก่อน → fallback filesystem

### 4.5 LINE OA Integration (REP)

- ตั้งค่าได้หลาย config ใน IT Access (`/it-access`)
- Push notification หลังอนุมัติ expense
- Scheduled PDF report ส่งอัตโนมัติ (ARQ cron job ทุกชั่วโมง)
- Mode per config: `receive` / `send` / `both`

### 4.6 3-Day Edit/Delete Lock

- Expense ที่บันทึกเกิน **3 วัน** → ไม่สามารถแก้ไข/ลบได้
- ตรวจสอบที่ backend (`_check_editable`) และ frontend (ปุ่มถูก disabled)

### 4.7 Frontend Pages (REP)

| Path | คำอธิบาย |
|---|---|
| `/expense-control` | OverviewTab, DailyTab, HistoryTab, CategoryManagerTab |
| `/expense` | แบบฟอร์มส่ง expense (simplified form) |
| `/budget` | จัดการงบประมาณ |

---

## 5. CRM System — Customer Relationship Management

### 5.1 โครงสร้าง Multi-Workspace

```
CRM Workspace (crm_workspaces)
    │
    ├── Customer Segments  ← กลุ่มลูกค้า custom (color, icon)
    │
    ├── Customers          ← ข้อมูลลูกค้า + tags + segmentIds
    │       └── source tracking (line_oa / google_sheets / manual / ...)
    │
    ├── Deals              ← Sales Pipeline [Phase 2]
    │
    └── Activities         ← Call, Email, Meeting logs [Phase 2]
```

### 5.2 Customer Data Model

```json
{
  "_id": "uuid",
  "workspaceId": "ws-id",
  "name": "string",
  "type": "B2B | B2C",
  "segmentIds": ["seg-id"],
  "email": "string",
  "phone": "string",
  "lineUid": "string",
  "lineDisplayName": "string",
  "linePictureUrl": "string",
  "facebookId": "string",
  "tags": ["VIP", "Lead"],
  "company": "string",
  "address": "string",
  "note": "string",
  "source": "manual | line_oa | google_sheets | facebook | instagram | tiktok | shopee",
  "status": "active | inactive",
  "createdAt": "datetime",
  "updatedAt": "datetime",
  "createdBy": "username"
}
```

### 5.3 Customer Segments

- เก็บใน `customer_segments` collection (workspace-scoped)
- ปรับแต่ง: ชื่อ, สี (color picker), ไอคอน, คำอธิบาย
- กรองลูกค้าตาม segment ได้ใน list view

### 5.4 Data Source Channels

| ช่องทาง | สถานะ | Mechanism |
|---|---|---|
| **Manual** | ✅ | CRUD form |
| **LINE OA** | ✅ | follow/unfollow webhook → auto-create/deactivate |
| **Google Sheets** | ✅ | Apps Script POST → `/api/data-sources/webhook/{sourceId}` |
| **Facebook** | ⏳ รอ Meta Review | Meta Webhook (~1-4 สัปดาห์) |
| **Instagram** | ⏳ รอ Meta Review | Meta Webhook |
| **TikTok Shop** | ⏳ รอ Approval | TikTok Partner Account |
| **Shopee** | ⏳ รอ Approval | Shopee Open Platform |

### 5.5 LINE OA Auto-Import

- `follow` event → ดึง LINE profile → สร้าง Customer (`source: line_oa`, `status: active`)
- `unfollow` event → ตั้ง `status: inactive`
- Welcome message ส่งอัตโนมัติ (ตั้งค่าได้ใน IT Access)
- endpoint: `POST /api/line/webhook/{config_id}`

### 5.6 Google Sheets Auto-Import

- Apps Script ใน Google Sheets ส่ง POST ไปที่ webhook endpoint
- Column mapping config (Google column → Customer field) ตั้งค่าได้
- หน้าตั้งค่า: `/customers/connections`

### 5.7 Frontend Pages (CRM)

| Path | คำอธิบาย |
|---|---|
| `/customers` | รายการลูกค้า + ค้นหา + กรอง (type/tag/segment/status) + Export CSV |
| `/customers/[id]` | รายละเอียดลูกค้า 360° view |
| `/customers/segments` | จัดการกลุ่มลูกค้า (CRUD + color/icon picker) |
| `/customers/workspaces` | จัดการ CRM Workspaces |
| `/customers/connections` | ตั้งค่า Data Source |
| `/sales/deals` | Sales Pipeline (Kanban Board) — Phase 2 |

---

## 6. Infrastructure

### 6.1 MongoDB Collections

| Collection | ใช้สำหรับ |
|---|---|
| `users` | ผู้ใช้งานระบบ |
| `otp_tokens` | OTP (TTL index — หมดอายุอัตโนมัติ) |
| `expenses` | รายการค่าใช้จ่ายที่อนุมัติแล้ว |
| `expense_drafts` | รายการรออนุมัติ / ปฏิเสธ |
| `expense_categories` | หมวดหมู่ค่าใช้จ่าย |
| `inventory_warehouses` | คลังสินค้า |
| `inventory_items` | รายการสินค้าในคลัง |
| `inventory_transactions` | บันทึกเบิก/รับสินค้า |
| `chat_messages` | ข้อความ real-time chat |
| `notifications` | แจ้งเตือนในระบบ |
| `system_settings` | ตั้งค่าระบบ (SMTP, LINE OA configs) |
| `crm_workspaces` | CRM Workspaces |
| `customer_segments` | กลุ่มลูกค้า (workspace-scoped) |
| `customers` | ข้อมูลลูกค้า (workspace-scoped) |
| `deals` | Sales Deals — Phase 2 |
| `activities` | CRM Activities — Phase 2 |

### 6.2 Redis

| Key Pattern | ใช้สำหรับ | TTL |
|---|---|---|
| `categories:active` | cache หมวดหมู่ที่ active | 300s |
| `categories:all` | cache หมวดหมู่ทั้งหมด | 300s |
| ARQ job queues | background jobs | — |

### 6.3 ARQ Worker

- Container `planeat-worker` — image เดียวกับ backend
- Command: `arq app.worker.WorkerSettings`
- Cron: `run_scheduled_reports` ทุกชั่วโมง (minute=0)
- ป้องกัน duplicate cron เมื่อ scale backend หลาย instance

### 6.4 Server-Sent Events (SSE)

| Endpoint | Push interval | ใช้สำหรับ |
|---|---|---|
| `GET /api/sse/notifications?token=` | ทุก 8s | แจ้งเตือน + unread count |
| `GET /api/sse/chat/{username}?token=` | ทุก 2s | real-time chat messages |

- Auth ผ่าน `token` query param (EventSource API ไม่รองรับ custom headers)
- Frontend: fallback → 30s setInterval ถ้า SSE connection error

### 6.5 PDF Storage

- Docker volume `pdf_data` → mount ที่ `/app/pdf_storage`
- `_PdfStore` dict subclass: ตรวจ in-memory → fallback อ่าน filesystem
- Persistent ข้าม container restart / redeploy

---

## 7. API Endpoints (ทั้งหมด)

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login → JWT token |
| POST | `/api/auth/register` | สมัครสมาชิก |
| POST | `/api/auth/request-register-otp` | ขอ OTP สำหรับสมัคร |
| POST | `/api/auth/forgot-password` | ลืมรหัสผ่าน |
| POST | `/api/auth/verify-otp` | ยืนยัน OTP |
| POST | `/api/auth/reset-password` | รีเซ็ตรหัสผ่าน |

### Expenses & Drafts
| Method | Path | Description |
|---|---|---|
| GET | `/api/expenses` | รายการ (filter: monthYear) |
| POST | `/api/expenses` | บันทึกตรง (admin) |
| PUT | `/api/expenses/{id}` | แก้ไข (3-day lock) |
| DELETE | `/api/expenses/{id}` | ลบ (3-day lock) |
| POST | `/api/expenses/draft` | ส่ง draft รออนุมัติ |
| GET | `/api/expenses/drafts` | รายการ draft |
| PUT | `/api/expenses/drafts/{id}/approve` | อนุมัติ → email + LINE |
| PUT | `/api/expenses/drafts/{id}/reject` | ปฏิเสธ → email |
| GET | `/api/expenses/history` | ประวัติทั้งหมด (filter/page) |
| POST | `/api/expenses/draft/dynamic` | dynamic category draft |
| POST | `/api/expenses/draft/public` | public draft (ไม่ต้อง login) |
| PUT | `/api/expenses/drafts/{id}/approve/dynamic` | อนุมัติ dynamic |

### Budget & Analysis
| Method | Path | Description |
|---|---|---|
| GET | `/api/budget` | ดูงบประมาณ |
| POST | `/api/budget` | ตั้งงบประมาณ |
| GET | `/api/analysis` | วิเคราะห์ค่าใช้จ่าย |
| GET | `/api/analysis/dynamic` | วิเคราะห์ dynamic |

### Reports (PDF)
| Method | Path | Description |
|---|---|---|
| POST | `/api/reports/generate` | สร้าง PDF (กำหนด catId, period) |
| GET | `/api/reports/download/{id}` | ดาวน์โหลด PDF |
| GET | `/api/reports/history-pdf` | PDF จาก history ตรง (landscape) |

### Categories
| Method | Path | Description |
|---|---|---|
| GET | `/api/categories` | ทั้งหมด (Redis cached) |
| GET | `/api/categories/mine` | ของตัวเอง |
| GET | `/api/categories/public` | ของ user อื่น |
| GET | `/api/categories/{id}/summary` | สรุปหมวดหมู่ |
| POST | `/api/categories` | สร้าง + invalidate cache |
| PUT | `/api/categories/{id}` | แก้ไข + invalidate cache |
| DELETE | `/api/categories/{id}` | ลบ + invalidate cache |

### CRM Workspaces
| Method | Path | Description |
|---|---|---|
| GET | `/api/crm-workspaces` | รายการทั้งหมด |
| POST | `/api/crm-workspaces` | สร้าง workspace |
| GET | `/api/crm-workspaces/{id}` | รายละเอียด |
| PUT | `/api/crm-workspaces/{id}` | แก้ไข |
| DELETE | `/api/crm-workspaces/{id}` | ลบ |

### Customers
| Method | Path | Description |
|---|---|---|
| GET | `/api/crm-workspaces/{ws}/customers` | รายการ (q/type/tag/status/segment/page) |
| POST | `/api/crm-workspaces/{ws}/customers` | สร้างลูกค้า |
| GET | `/api/crm-workspaces/{ws}/customers/{id}` | รายละเอียด |
| PUT | `/api/crm-workspaces/{ws}/customers/{id}` | แก้ไข |
| DELETE | `/api/crm-workspaces/{ws}/customers/{id}` | ลบ |
| GET | `/api/crm-workspaces/{ws}/customers/tags` | tags ทั้งหมด |
| POST | `/api/crm-workspaces/{ws}/customers/{id}/tags` | เพิ่ม tag |
| DELETE | `/api/crm-workspaces/{ws}/customers/{id}/tags/{tag}` | ลบ tag |
| GET | `/api/crm-workspaces/{ws}/customers/export/csv` | Export CSV (auth via token param) |

### Segments
| Method | Path | Description |
|---|---|---|
| GET | `/api/crm-workspaces/{ws}/segments` | รายการ |
| POST | `/api/crm-workspaces/{ws}/segments` | สร้าง |
| PUT | `/api/crm-workspaces/{ws}/segments/{id}` | แก้ไข |
| DELETE | `/api/crm-workspaces/{ws}/segments/{id}` | ลบ |

### Deals & Activities (Phase 2 — มี endpoint แล้ว)
| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/deals` | Sales deals |
| PUT/DELETE | `/api/deals/{id}` | จัดการ deal |
| GET/POST | `/api/activities` | CRM activities |
| PUT/DELETE | `/api/activities/{id}` | จัดการ activity |

### Inventory
| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/inventory/warehouses` | คลังสินค้า |
| POST | `/api/inventory/warehouses/verify` | Verify PIN |
| POST | `/api/inventory/warehouses/change-pin` | เปลี่ยน PIN |
| PUT/DELETE | `/api/inventory/warehouses/{id}` | จัดการคลัง |
| GET | `/api/inventory/summary` | สรุปสต็อก |
| GET/POST | `/api/inventory/items` | รายการสินค้า |
| PUT/DELETE | `/api/inventory/items/{id}` | จัดการสินค้า |
| GET/POST | `/api/inventory/transactions` | บันทึกเบิก/รับ |
| PUT/DELETE | `/api/inventory/transactions/{id}` | จัดการ transaction |

### Others
| Method | Path | Description |
|---|---|---|
| GET | `/api/sse/notifications?token=` | SSE notification stream |
| GET | `/api/sse/chat/{username}?token=` | SSE chat stream |
| POST | `/api/line/webhook/{config_id}` | LINE Webhook (follow/unfollow/message) |
| POST | `/api/data-sources/webhook/{sourceId}` | Google Sheets webhook |
| GET | `/api/google-sheets/...` | Google Sheets config |
| GET/PUT | `/api/settings` | System settings (SMTP, LINE OA configs) |
| GET/PUT | `/api/profile/me` | โปรไฟล์ผู้ใช้ |
| PUT | `/api/profile/photo` | อัปเดตรูปโปรไฟล์ |
| PUT | `/api/profile/signature` | อัปเดตลายเซ็น |
| POST | `/api/profile/request-permission` | ขอสิทธิ์ |
| GET | `/api/notifications` | รายการแจ้งเตือน |
| PUT | `/api/notifications/{id}/read` | Mark read |
| PUT | `/api/notifications/read-all` | Mark all read |
| POST | `/api/notifications/line-notify` | ส่งผ่าน LINE Notify |
| GET/DELETE | `/api/users` | จัดการผู้ใช้ (admin) |
| GET | `/api/chat/contacts` | รายการ contacts |
| GET | `/api/chat/messages/{username}` | ประวัติ chat |
| POST | `/api/chat/messages/{username}` | ส่งข้อความ |
| GET | `/api/health` | Health check |

---

## 8. Auth & RBAC

| Role | สิทธิ์หลัก |
|---|---|
| `admin` | ทุกอย่าง รวมถึง system settings |
| `manager` | อนุมัติ/ปฏิเสธ expense, แก้ไขประวัติ |
| `accounting` | บันทึกค่าใช้จ่าย, ดูรายงาน |
| `viewer` | ดูข้อมูลได้อย่างเดียว |

- Token เก็บใน `sessionStorage` (key: `planeat_user`)
- SSE ใช้ `?token=` query param (EventSource ไม่รองรับ custom headers)
- Token หมดอายุ → frontend redirect ไป `/login`

---

## 9. ปัญหาที่แก้ไขแล้ว ✅

| ปัญหา | วิธีแก้ |
|---|---|
| ภาษาไทยใน PDF ไม่แสดง (jsPDF) | ย้ายไป backend: reportlab + Garuda font |
| APScheduler race condition (multi-container) | ARQ Worker เป็น container แยก |
| Polling 30s overhead | SSE — connection stays open, push ทุก 8s |
| PDF หายหลัง container restart | Docker volume `pdf_data` + `_PdfStore` filesystem fallback |
| CORS open (`*`) | จำกัด origins ใน config |
| Secret หลุดใน git | .gitignore + .env.example อัปเดต |
| Category ไม่ cache | Redis TTL 300s + invalidate on write |

---

## 10. Roadmap

### Phase 1E — Facebook/Instagram (รอ Meta Review ~1-4 สัปดาห์)
- สร้าง Meta App + ขอ permission (pages_messaging, instagram_content_publish)
- Facebook Messenger Webhook → auto-create Customer
- Instagram DM Webhook → auto-create Customer

### Phase 1F — TikTok/Shopee (รอ Platform Approval)
- TikTok Shop API (ต้องมี Seller Account)
- Shopee Open Platform (ต้องมี Partner Account)

### Phase 2 — Sales Pipeline
- Deals CRUD + Stage transition (Kanban Board drag & drop)
- Activity Log (Call, Email, Meeting, LINE)
- Follow-up Reminder (Dashboard + LINE Notify)
- Sales Dashboard (Win Rate, Pipeline Value)

### Phase 3 — Marketing Campaigns
- Segment-based targeting + LINE Broadcast
- Email Marketing (SMTP + unsubscribe link — PDPA compliant)
- Scheduled Broadcast (ARQ)
- Welcome Drip Campaign
- Campaign Analytics (Sent / Failed / Rate)

### Phase 4 — Analytics & AI
- Claude API integration (AI Summary, LINE AI Bot)
- Customer Insight Summary
- Revenue Analytics Dashboard
- ROI Analysis
- Annual PDF Report

---

*อัปเดต: 2026-04-06 | สถานะ: Phase 0 ✅ | Phase 1A–D ✅ | Phase 1E–F รอ Platform Approval | Phase 2+ In Progress*
