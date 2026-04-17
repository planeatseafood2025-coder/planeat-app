---
title: CRM — Customer Management
type: entity
tags: [crm, api, frontend]
updated: 2026-04-17
sources: [CLAUDE.md]
---

# CRM — ระบบจัดการลูกค้า

## Phase ที่เสร็จแล้ว

### Phase 1A — Core Customer CRUD ✅
- Customer model + service + router (workspace-scoped)
- หน้ารายการลูกค้า + ค้นหา + กรอง + Export CSV
- หน้าดูรายละเอียดลูกค้า

### Phase 1B — Customer Segments ✅
- Collection `customer_segments` + Pydantic models
- API: `/api/crm-workspaces/{ws}/segments`
- หน้าจัดการกลุ่มลูกค้า `/customers/segments` — CRUD + color/icon picker
- Customer model มี `segmentIds` field
- Filter ลูกค้าตาม segment (pills + backend query)

### Phase 1C — LINE OA Auto-Import ✅
- Import ลูกค้าจาก LINE OA โดยอัตโนมัติ

### Phase 1D — Google Sheets Auto-Import ✅
- Import ลูกค้าจาก Google Sheets

---

## Phase ที่รอ

### Phase 1E — Facebook/Instagram
- รอ Meta Review ก่อนจึงจะทำได้

---

## หน้าหลัก
`frontend/app/(app)/customers/`

---

## Workspace Scoping
ข้อมูลลูกค้าแบ่งตาม **workspace** — ทุก API path ขึ้นต้นด้วย `/api/crm-workspaces/{ws}/`

---

## Collections (MongoDB)
- `customers` — ข้อมูลลูกค้า
- `customer_segments` — กลุ่มลูกค้า

---

## Related
- [[line-system]] — LINE OA import
- [[overview]] — ภาพรวมระบบ
