# Planeat App — บันทึกงานสำหรับ AI

> รายละเอียดงาน/สถานะ/roadmap อยู่ใน Obsidian (hotcache.md) เป็นหลัก

## Stack
- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS — port 3001
- **Backend**: FastAPI + Motor (async) + MongoDB — port 8001
- **Deploy**: Docker Compose บน VPS

## Deploy Command (รันบน VPS)
```bash
cd ~/planeat-app
docker-compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker-compose up -d --build
```

## Frontend only
```bash
docker-compose build --no-cache frontend && docker-compose up -d
```

---

## Domain & Environment
| | URL |
|---|---|
| Dev | `https://planeatdev.duckdns.org` (ยังไม่มี SSL) |
| Production | `https://planeatsupport.duckdns.org` |

**ENV สำคัญ:**
- `PUBLIC_URL` — URL สาธารณะของ backend
- `MONGO_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`

---

## LINE System Architecture

### Collections ใน MongoDB
- `users` — เก็บ `lineUid`, `status` (pending/active/rejected)
- `line_login_states` — CSRF state สำหรับ LINE Login OAuth
- `line_login_temp` — เก็บ profile ชั่วคราวระหว่างสมัคร (15 นาที)
- `line_approval_pending` — รอ Y/N อนุมัติ expense จาก manager
- `line_user_approval_pending` — รอ Y/N อนุมัติสมาชิกจาก IT/Admin

### Webhook URL
```
/api/line/webhook/main        ← mainLineOa
/api/line/webhook/{config_id} ← lineOaConfigs แต่ละตัว
```

### การส่ง LINE
- **Push ส่วนตัว** → ใช้ `lineUid` + `mainLineOa.token`
- **Push กลุ่ม** → ใช้ `targetId` + `mainLineOa.token`
- **LINE Notify** → fallback ถ้าไม่มี `lineUid`

---

## โครงสร้างไฟล์สำคัญ

```
planeat-app/
├── frontend/
│   ├── app/(app)/
│   │   ├── expense-control/page.tsx
│   │   ├── integrations/page.tsx
│   │   ├── it-access/page.tsx
│   │   └── ...
│   ├── app/auth/line/callback/page.tsx
│   ├── app/login/page.tsx
│   ├── components/layout/Sidebar.tsx
│   ├── lib/api.ts
│   └── types/index.ts
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── line_webhook.py
│   │   │   ├── expenses.py
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── line_notify_service.py
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
