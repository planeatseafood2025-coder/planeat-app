# VPS Infrastructure

อัปเดต: 2026-04-17 · ดึงจาก VPS โดยตรง

---

## Server

| รายการ | ค่า |
|---|---|
| IP | `76.13.211.161` |
| OS | Ubuntu 24.04.4 LTS |
| Disk | 96GB total / 38GB used / 59GB free (39%) |
| SSH | `ssh root@76.13.211.161` |
| SSH Key | `C:/Users/hot it/.ssh/planeat-vps` |

---

## สถานะ Containers ปัจจุบัน

### ✅ Dev — รันอยู่ (planeatdev.duckdns.org)

| Container | Port | Image |
|---|---|---|
| `planeat-dev-frontend` | 3002→3000 | planeat-dev-frontend:latest (1.13GB) |
| `planeat-dev-backend` | 8002→8000 | planeat-dev-backend:latest (393MB) |
| `planeat-dev-worker` | — | planeat-dev-worker:latest (393MB) |
| `planeat-dev-mongodb` | 27017 | mongo:8 (1.3GB) |
| `planeat-dev-redis` | 6379 | redis:7-alpine (61MB) |

### ⏳ Prod — Image มีแต่ Container ยังไม่รัน (planeatsupport.duckdns.org)

| Image | ขนาด | หมายเหตุ |
|---|---|---|
| `planeat-app-frontend:latest` | 1.14GB | build ไว้แล้ว รอ deploy |
| `planeat-app-backend:latest` | 393MB | build ไว้แล้ว รอ deploy |
| `planeat-app-worker:latest` | 393MB | build ไว้แล้ว รอ deploy |

> prod เคยรันมาก่อน — images + network + volumes ยังอยู่ แต่ containers ถูกหยุดไว้

### อื่นๆ

| Container | หมายเหตุ |
|---|---|
| `n8n-n8n-1` | n8n automation — port 5678 (localhost only) |

---

## Volumes

### Named Volumes (สำคัญ)

| Volume | ใช้กับ | หมายเหตุ |
|---|---|---|
| `planeat-app_mongo_data` | prod MongoDB | DB prod — ยังไม่มี container ต่ออยู่ |
| `planeat-app_mongo_dev_data` | dev MongoDB (ปัจจุบัน) | สร้างใหม่ 2026-04-17 |
| `planeat-dev_mongo_dev_data` | dev MongoDB (เก่า) | มีข้อมูลจริง expenses:22, users:3 ← **ข้อมูลเดิม** |
| `planeat-dev_mongo_data` | — | เก่า ว่างเปล่า |
| `planeat-app_pdf_data` | prod PDF storage | — |
| `planeat-app_pdf_dev_data` | dev PDF storage | — |
| `planeat-dev_pdf_data` | เก่า | — |
| `planeat-dev_pdf_dev_data` | เก่า | — |
| `n8n_data` | n8n | — |
| `traefik_data` | traefik (ไม่ได้ใช้แล้ว) | — |

> ⚠️ มี anonymous volumes อีก ~20 ตัว (hash name) = เศษจากการ rebuild เก่า สามารถ prune ได้

---

## Networks

| Network | ใช้กับ |
|---|---|
| `planeat-app_planeat-dev-net` | dev containers (ปัจจุบัน) |
| `planeat-app_planeat-net` | prod network (ยังไม่มี container) |
| `planeat-dev_planeat-dev-net` | เก่า |

---

## Nginx Config สรุป

```
planeatdev.duckdns.org
  ├── /api/  → localhost:8002 (dev backend)
  └── /      → localhost:3002 (dev frontend)
  SSL: ใช้ cert ของ planeatsupport (shared)

planeatsupport.duckdns.org
  ├── /api/  → localhost:8002  ← ⚠️ ชี้ไป dev backend เหมือนกัน!
  └── /      → localhost:3002  ← ⚠️ ชี้ไป dev frontend เหมือนกัน!
  SSL: Let's Encrypt ✅
```

> ⚠️ ตอนนี้ทั้ง prod และ dev domain ชี้มาที่ port เดียวกัน (3002/8002) — ต้องแก้ nginx ก่อน deploy prod จริง

---

## สิ่งที่ต้องทำก่อน Deploy Prod

- [ ] แก้ nginx ให้ `planeatsupport` ชี้ไป 3001/8001
- [ ] รัน prod containers จาก `docker-compose.yml` (ไม่ใช่ dev)
- [ ] ตั้งค่า `.env` prod แยกออกจาก dev
- [ ] ทดสอบ LINE callback URL บน prod domain

---

## คำสั่งที่ใช้บ่อยบน VPS

```bash
# ตรวจ memory ก่อนทำอะไรเสมอ
free -h && docker stats --no-stream

# ดู containers ทั้งหมด
docker ps

# Dev — rebuild
cd /root/planeat-app
docker compose -f docker-compose.dev.yml up -d --build

# Dev — frontend only
docker compose -f docker-compose.dev.yml up -d --build frontend

# ลบ anonymous volumes เก่า (ปลอดภัย)
docker volume prune
```

---

_ดู Database Map: [[Database Map]]_
_ดู Deploy workflow: [[Deploy & Environments]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
