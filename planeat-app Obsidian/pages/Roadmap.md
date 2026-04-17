# Roadmap

สิ่งที่ทำเสร็จแล้วและที่ยังค้างอยู่

---

## ✅ เสร็จแล้ว

### Core
- [[Auth & Roles]] — Login, JWT, Role-based access
- [[Expense Control]] — Overview, Daily, History, Category Manager tabs
- Profile page, IT Access page, Chat (SSE), Inventory, PDF Report

### Phase 0 — Infrastructure
- [[Infrastructure]] — Redis, ARQ Worker, SSE, Logging

### Phase 1A–1D — CRM
- Customer CRUD + Segments
- LINE OA Auto-Import
- Google Sheets integration
- [[CRM — Customers]] — Workspace, Segment, Connections

### [[ระบบ LINE]]
- LINE Login OAuth 2.0 (แทน OTP)
- Flex Message อนุมัติ expense
- Flex Message อนุมัติสมาชิกใหม่
- Push แจ้งผู้กรอก expense
- Webhook URL dynamic จาก `PUBLIC_URL`

### Integrations Page
- Sidebar layout 5 เมนู
- แสดง Webhook URL + copy button
- Status dot

---

## ⏳ ค้างอยู่

### ทำต่อได้เลย
- [ ] SSL บน `planeatdev.duckdns.org` → [[Deploy & Environments]]
- [ ] ทดสอบ LINE Flex Message + Y/N approval จริง → [[ระบบ LINE]]
- [ ] Push โค้ดขึ้น VPS + GitHub Actions CI/CD → [[Deploy & Environments]]

### รอก่อน
- [ ] Phase 1E — Facebook/Instagram (รอ Meta Review)
- [ ] Phase 2+ — ตาม PROJECT_MASTER_PLAN.md

---

## Pattern การพัฒนาที่ใช้

```
1. Infrastructure ก่อน (Redis, Worker, SSE)
2. Core feature (Expense Control)
3. Integration ทีละ platform (LINE → Facebook → ...)
4. แต่ละ integration มี: OAuth + Webhook + Notification + Approval flow
```

---

_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
_ดูงานต่อไป (รายละเอียด): [[งานขั้นต่อไป]]_
_ดู LINE future: [[LINE Command Center]]_
_ดู changelog ล่าสุด: [[Changelog — VPS Session 2026-04-17]]_
