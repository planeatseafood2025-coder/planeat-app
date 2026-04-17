---
title: Project Overview
type: overview
tags: [infra, frontend, api, deploy]
updated: 2026-04-17
sources: [CLAUDE.md, DEPLOY.md]
---

# Planeat App — ภาพรวมโปรเจค

## คืออะไร
ระบบจัดการร้านอาหาร/บริษัท ครอบคลุม:
- บันทึกรายจ่ายรายวัน (Expense Control)
- จัดการลูกค้า CRM + LINE OA integration
- ระบบ approval ผ่าน LINE Flex Message
- PDF Report, Inventory, Chat

---

## Stack

| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS | 3001 |
| Backend | FastAPI + Motor (async) | 8001 |
| Database | MongoDB | internal only |
| Cache / Queue | Redis + ARQ | internal only |
| Deploy | Docker Compose | — |

---

## Infrastructure

- **Docker Compose** รัน 4 containers: `frontend`, `backend`, `mongodb`, `redis` + `planeat-worker` (ARQ)
- **PDF storage**: Docker Volume `pdf_data` (ไม่ใช้ memory)
- **Real-time**: Server-Sent Events (SSE) แทน polling 30s
- **Background jobs**: ARQ Worker (แยก process)
- **Logging**: structured format, ควบคุมด้วย `LOG_LEVEL` env

---

## โครงสร้างไฟล์สำคัญ

```
planeat-app/
├── frontend/app/(app)/
│   ├── expense-control/page.tsx
│   ├── customers/               ← CRM pages
│   ├── chat/page.tsx
│   ├── inventory/page.tsx
│   ├── profile/page.tsx
│   └── it-access/page.tsx
├── frontend/components/layout/Sidebar.tsx
├── frontend/lib/api.ts           ← API functions ทั้งหมด
├── frontend/types/index.ts
├── backend/app/
│   ├── routers/                  ← FastAPI routers
│   ├── services/                 ← business logic
│   └── models/                   ← Pydantic models
├── docker-compose.yml
└── .env.example
```

---

## Deploy Command (local)

```bash
cd "C:\Users\hot it\Downloads\planeat-app"
docker-compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker-compose up -d --build
```

> ต้อง `docker rmi` ก่อนทุกครั้ง เพราะ Docker cache มักทำให้ build ไม่อัปเดต

---

## Related Pages
- [[auth]] — JWT, roles, login flow
- [[expense-control]] — feature หลัก
- [[line-system]] — LINE integration ทั้งหมด
- [[crm]] — ระบบลูกค้า
- [[architecture]] — สถาปัตยกรรมระบบ
- [[deploy-workflow]] — วิธี deploy ทั้ง local และ VPS
- [[roles]] — สิทธิ์แต่ละ role
