# Infrastructure

ระบบ backend ที่ทำให้แอพทำงานได้ — queue, realtime, caching

---

## Components

### Redis
- **Caching** — ลด DB query ซ้ำซ้อน
- **ARQ Job Queue** — รองรับ background tasks

### ARQ Worker (`planeat-worker`)
Background job processor — ทำงานที่ไม่ต้องรอผล เช่น ส่ง LINE notification, sync ข้อมูล

```
API Request → ส่ง job เข้า Redis queue → ARQ Worker รับไปทำ
```

### Server-Sent Events (SSE)
Realtime update แทน polling — ใช้ใน Chat และ live data

```
Client เปิด connection ค้างไว้
    → Server push event เมื่อมีข้อมูลใหม่
    → ไม่ต้อง refresh หรือ poll ทุกวินาที
```

### Docker Compose
รัน frontend + backend + Redis + worker พร้อมกัน

---

## Ports

| Service | Port |
|---|---|
| Frontend | 3001 |
| Backend | 8001 |
| Redis | 6379 (internal) |

---

## ไฟล์สำคัญ

- `docker-compose.yml` — production
- `docker-compose.dev.yml` — planeatdev environment
- `.env` / `.env.example`

---

## ปัญหาที่พบบ่อย

**Docker cache** — แก้โค้ดแล้ว build ไม่เปลี่ยน → ใช้ `--no-cache`

```bash
docker-compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker-compose up -d --build
```

---

_ดู deploy: [[Deploy & Environments]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
