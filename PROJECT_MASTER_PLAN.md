# PlaNeat — Developer Context Document
> ใช้ไฟล์นี้เป็น Context ให้ AI เขียนโค้ดต่อยอดระบบ PlaNeat
> อัปเดตล่าสุด: 2026-04-04

---

## 1. ภาพรวมระบบปัจจุบัน (Current System)

PlaNeat เป็น Web Application สำหรับจัดการการวางแผนและติดตามค่าใช้จ่ายในองค์กร กำลังขยายสู่ **CRM & Front-office**

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS — port 3001 |
| Backend | FastAPI (Python) + Motor (Async) — port 8001 |
| Database | MongoDB |
| Cache / Queue | Redis + ARQ Worker |
| Deployment | Docker Compose |
| Auth | JWT + RBAC |
| Realtime | Server-Sent Events (SSE) |
| Notifications | LINE OA Webhook + Web Notification |

---

## 2. Features ที่มีอยู่แล้ว ✅ (Do NOT re-implement)

- **Auth**: Login/Register, JWT, RBAC (roles หลากหลาย)
- **Expense Control** (`/expense-control`): Overview, Daily, History, Category Manager
- **Inventory** (`/inventory`): คลังสินค้า CRUD
- **Chat** (`/chat`): Real-time SSE
- **Profile, IT-Access, Notifications**
- **PDF Report**: landscape A4, Thai font
- **LINE Integration**: LINE OA config, Webhook endpoint `/api/line/webhook/{config_id}`
- **SSE**: notifications + chat (แทน polling แล้ว)
- **Redis Cache**: categories (TTL 300s)
- **ARQ Worker**: scheduled reports background job

---

## 3. โครงสร้าง MongoDB Collections

### ที่มีอยู่แล้ว
- `users`, `otp_tokens`, `expenses`, `expense_drafts`, `expense_categories`
- `inventory_warehouses`, `inventory_items`, `inventory_transactions`
- `chat_messages`, `notifications`, `system_settings`

### เพิ่มใน Phase 1 (CRM)
- `customer_segments` — กลุ่ม/ประเภทลูกค้าแบบ custom
- `customers` — ข้อมูลลูกค้าพร้อม source tracking
- `data_sources` — การตั้งค่าเชื่อมต่อแต่ละช่องทาง

### เพิ่มใน Phase 2+
- `deals`, `activities`, `campaigns`, `campaign_logs`

---

## 4. Customer Data Model (ปรับปรุงแล้ว)

### `customer_segments` collection
```json
{
  "_id": "uuid-string",
  "name": "ลูกค้า VIP",
  "description": "กลุ่มลูกค้าพิเศษ",
  "color": "#7c3aed",
  "icon": "star",
  "dataSource": "manual | line_oa | facebook | instagram | google_sheets | tiktok | shopee",
  "sourceConfig": {},
  "autoAssignRules": [],
  "createdAt": "datetime",
  "createdBy": "username"
}
```

### `customers` collection (ปรับปรุงจากเดิม)
```json
{
  "_id": "uuid-string",
  "name": "string",
  "type": "B2B | B2C",
  "segmentIds": ["seg-id-1", "seg-id-2"],
  "email": "string",
  "phone": "string",
  "lineUid": "string",
  "lineDisplayName": "string",
  "linePictureUrl": "string",
  "facebookId": "string",
  "instagramId": "string",
  "tags": ["VIP", "Lead"],
  "company": "string",
  "address": "string",
  "note": "string",
  "contacts": [],
  "source": "manual | line_oa | facebook | instagram | google_sheets | tiktok | shopee",
  "sourceRef": "string",
  "status": "active | inactive",
  "createdAt": "datetime",
  "updatedAt": "datetime",
  "createdBy": "username"
}
```

---

## 5. Data Source Channels — ข้อจำกัดสำคัญ

| ช่องทาง | สถานะ | ข้อจำกัด |
|---|---|---|
| **LINE OA** | ✅ พร้อม | ต้องมี follower ก่อน, ดึง profile ผ่าน Messaging API |
| **Google Sheets** | ✅ ง่าย | เขียน Apps Script POST มาที่ `/api/data-sources/webhook/{sourceId}` |
| **Facebook** | ⚠️ ต้องรอ | Meta App Review 1-4 สัปดาห์, ต้องผ่าน Business Verification |
| **Instagram** | ⚠️ ต้องรอ | Meta App Review + Business Verify (เหมือน Facebook) |
| **TikTok Shop** | ⚠️ ต้องรอ | TikTok Partner Account + API Approval |
| **Shopee** | ⚠️ ต้องรอ | Shopee Open Platform Partner Account |

**ลำดับที่แนะนำ:** LINE OA → Google Sheets → Facebook/IG (ส่งขอ review ได้เลย) → TikTok/Shopee

---

## 6. Roadmap — อัปเดตแล้ว

### ✅ เฟส 0 — Stabilize & Infrastructure (เสร็จแล้ว)
- [x] 0.1-0.5 Security (CORS, Secrets, Deploy Guide)
- [x] 0.6 .gitignore hardening
- [x] 0.7 PDF Storage → Docker Volume
- [x] 0.8+0.11 Redis + Cache
- [x] 0.9 ARQ Background Worker
- [x] 0.10 SSE แทน Polling
- [x] 0.12 Structured Logging
- [x] 0.13 .env.example สมบูรณ์
- [x] 0.14 IT Connections Centralized Management (LINE OA, SMTP)

---

### 🔄 เฟส 1 — Customer Hub (กำลังดำเนินการ)

#### 1A — Core Customer CRUD ✅
- [x] 1.1 MongoDB Schema + Pydantic models (customers)
- [x] 1.2 routers/customers.py (CRUD API)
- [x] 1.5 หน้ารายการลูกค้า + ค้นหา + กรอง
- [x] 1.6 หน้าดูรายละเอียดลูกค้า (360° view)
- [x] 1.7 ระบบ Tags + Export CSV

#### 1B — Customer Segments ✅
- [x] 1.8 MongoDB Schema + API สำหรับ `customer_segments`
- [x] 1.9 หน้าจัดการกลุ่มลูกค้า (`/customers/segments`)
- [x] 1.10 เชื่อม segment กับ customer (เพิ่ม segmentIds)
- [x] 1.11 Filter ลูกค้าตาม segment ในหน้า list

#### 1C — LINE OA Auto-Import ✅
- [x] 1.12 LINE follow event → ดึง profile → สร้าง Customer อัตโนมัติ
- [x] 1.13 LINE unfollow event → ตั้งค่า status = inactive
- [x] 1.14 Welcome message เมื่อแอด OA (optional, ตั้งค่าได้)

#### 1D — Google Sheets Auto-Import ✅
- [x] 1.15 Webhook endpoint รับข้อมูลจาก Apps Script
- [x] 1.16 Data mapping config (Google Sheets column → Customer field)
- [x] 1.17 หน้าตั้งค่า Google Sheets connection

#### 1E — Facebook / Instagram (รอ Meta Review)
- [ ] 1.18 สร้าง Meta App + ขอ permission (instagram_content_publish, pages_messaging)
- [ ] 1.19 Facebook Messenger Webhook → สร้าง Customer
- [ ] 1.20 Instagram DM Webhook → สร้าง Customer
> ⚠️ ต้องผ่าน Meta App Review ก่อน (~1-4 สัปดาห์)

#### 1F — TikTok Shop / Shopee (รอ Approval)
- [ ] 1.21 TikTok Shop API integration (ต้องมี Seller Account)
- [ ] 1.22 Shopee Open Platform integration (ต้องมี Partner Account)
> ⚠️ ต้องสมัครเป็น Partner ก่อน

---

### เฟส 2 — Sales Pipeline
- [ ] 2.1 Schema สำหรับ `deals` + `activities`
- [ ] 2.2 API Deal CRUD + Stage transition
- [ ] 2.3 Activity Log (Call, Email, Meeting, LINE)
- [ ] 2.4 หน้า Pipeline แบบ Kanban Board (Drag & Drop)
- [ ] 2.5 Follow-up Reminder ผ่าน Dashboard + LINE Notify
- [ ] 2.6 Sales Dashboard (Win Rate, Pipeline Value)

---

### เฟส 3 — Marketing Campaigns
- [ ] 3.1 Schema สำหรับ `campaigns` + `campaign_logs`
- [ ] 3.2 Segment-based targeting (เลือกกลุ่มเป้าหมาย)
- [ ] 3.3 LINE Broadcast คราวละมากๆ (Rate limit aware)
- [ ] 3.4 Email Marketing (SMTP + unsubscribe link, PDPA compliant)
- [ ] 3.5 Scheduled Broadcast (ARQ Job)
- [ ] 3.6 Welcome Drip Campaign
- [ ] 3.7 Campaign Analytics (Sent/Failed/Rate)
- [ ] 3.8 Instagram Auto-Post (หลังผ่าน Meta review)
> ⚠️ Email ต้องมี unsubscribe link ตาม PDPA

---

### เฟส 4 — Analytics & AI
- [ ] 4.1 Claude API integration (AI Summary)
- [ ] 4.2 LINE AI Bot (รับ → Claude → ตอบ)
- [ ] 4.3 Customer insight summary
- [ ] 4.4 Revenue Analytics Dashboard
- [ ] 4.5 ROI Analysis
- [ ] 4.6 PDF รายงานสรุปประจำปี

---

## 7. API Endpoints ที่มีอยู่

| Method | Path | Description |
|---|---|---|
| POST | /api/auth/login | Login |
| GET | /api/expenses | รายการค่าใช้จ่าย |
| GET/POST/PUT/DELETE | /api/customers | Customer CRUD |
| GET | /api/customers/tags | Tags ทั้งหมด |
| GET | /api/customers/export/csv | Export CSV |
| GET/POST/PUT/DELETE | /api/inventory/... | Inventory |
| GET | /api/sse/notifications | SSE stream |
| POST | /api/line/webhook/{config_id} | LINE Webhook |
| GET/PUT | /api/settings | System settings |
| POST | /api/reports/generate | PDF Report |

---

## 8. Conventions

- **API Calls**: ใช้ `lib/api.ts` wrapper เสมอ
- **Client Components**: ใช้ `'use client'` เมื่อต้องการ state/event
- **Icons**: Google Material Icons (`material-icons-round`)
- **Async MongoDB**: Motor เสมอ (ไม่ใช้ PyMongo sync)
- **Data Validation**: Pydantic models ใน `models/`
- **Background Jobs**: ARQ + Redis
- **Customer Types**: `B2B` (ลูกค้าองค์กร) | `B2C` (ลูกค้าทั่วไป) เท่านั้น
- **Customer Segments**: แยกเป็น collection `customer_segments` (custom groups)
- **Data Source Field**: ทุก customer ต้องมี `source` บันทึกว่ามาจากช่องทางไหน

---

## 9. Environment Variables (.env)

```env
# Core
JWT_SECRET=<random>
MONGODB_URL=mongodb://...
REDIS_URL=redis://redis:6379
LOG_LEVEL=INFO

# LINE
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_CHANNEL_SECRET=<secret>

# PDF
PDF_STORAGE_PATH=/app/pdf_storage

# Email (Phase 3)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<password>
# หรือ SENDGRID_API_KEY=<key>

# Meta (Phase 1E — หลังผ่าน review)
META_APP_ID=<id>
META_APP_SECRET=<secret>
META_PAGE_ACCESS_TOKEN=<token>

# AI (Phase 4)
ANTHROPIC_API_KEY=<key>
```

---

*อัปเดต: 2026-04-04 | สถานะ: Phase 0 ✅ | Phase 1A ✅ | Phase 1B ✅ | Phase 1C ✅ | Phase 1D ✅ | Phase 1E-1F รอ Platform Approval*
