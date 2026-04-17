# Deploy & Environments

Domains, ENV vars, และ deploy commands

---

## Environments

| Environment | URL | Port | สถานะ |
|---|---|---|---|
| Local + ngrok | `https://porous-nell-cruelly.ngrok-free.dev` | — | เปลี่ยนทุกครั้งที่เปิด ngrok |
| Dev | `https://planeatdev.duckdns.org` | 3002/8002 | ✅ รันอยู่ — ใช้ทดสอบ |
| Production | `https://planeatsupport.duckdns.org` | 3001/8001 | ⏳ nginx พร้อม แต่ container ยังไม่ได้ setup |

> **สถานะปัจจุบัน (2026-04-17)**: prod container ยังไม่มี — ทุกอย่างพัฒนาบน dev ก่อน พอพร้อมค่อย deploy prod แยก
> nginx ของ prod รอรับที่ port 3001/8001 แต่ไม่มี container ฟังอยู่

---

## ENV Variables สำคัญ

| Variable | ใช้ทำอะไร |
|---|---|
| `PUBLIC_URL` | URL สาธารณะของ backend — ใช้แสดง Webhook URL ใน UI |
| `MONGO_PASSWORD` | MongoDB password |
| `JWT_SECRET` | signing key สำหรับ JWT |
| `CORS_ORIGINS` | whitelist domains ที่ frontend อยู่ |

> `PUBLIC_URL` ต้องอัปเดตทุกครั้งที่เปลี่ยน environment

---

## Deploy Commands

**Full rebuild** (ใช้เมื่อแก้ทั้ง frontend + backend):
```bash
cd "C:\Users\hot it\Downloads\planeat-app"
docker-compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker-compose up -d --build
```

**Frontend only** (เร็วกว่า):
```bash
docker-compose build --no-cache frontend && docker-compose up -d
```

---

## Deploy Workflow (ใหม่)

```
เครื่องหลัก (แก้โค้ด)
    → อัพขึ้น VPS โดยตรง (ไม่ผ่าน git)

VPS (AI แก้โค้ด)
    → git commit + push
    → เครื่องหลัก git pull
```

> ไม่ใช้ GitHub Actions CI/CD — ยกเลิกแผนเดิม

## ⚠️ ปัญหาที่เจอบ่อย — จำไว้

### 1. Frontend dev ชี้ไป prod backend
**อาการ**: login ไม่ได้ ขึ้น "เกิดข้อผิดพลาด" ทั้ง username/password และ LINE Login

**สาเหตุ**: `.env` มี `APP_DOMAIN=https://planeatsupport.duckdns.org` (prod) แต่ docker-compose.dev.yml ใช้ `APP_DOMAIN` เป็น `NEXT_PUBLIC_API_URL`

**แก้**: เปลี่ยน `.env` ให้ถูก environment ก่อน build frontend
```bash
# Dev — nginx route /api/ → localhost:8002 ให้อัตโนมัติ ไม่ต้องใส่ port
APP_DOMAIN=https://planeatdev.duckdns.org

# Prod
APP_DOMAIN=https://planeatsupport.duckdns.org
```

> ห้ามใส่ port ต่อท้าย domain — nginx จัดการ routing ให้แล้ว

> ต้อง rebuild frontend ทุกครั้งที่เปลี่ยน `APP_DOMAIN` เพราะ `NEXT_PUBLIC_*` อบเข้า build

---

### 2. MongoDB container conflict หลัง rebuild
**อาการ**: `Error: container name "/planeat-dev-mongodb" is already in use`

**แก้**:
```bash
docker rm -f planeat-dev-mongodb planeat-dev-redis planeat-dev-backend planeat-dev-frontend planeat-dev-worker
docker compose -f docker-compose.dev.yml up -d
```

---

### 3. Default admin password
เมื่อ DB ใหม่หรือ admin ถูกสร้างใหม่ — password เริ่มต้นคือ **`admin1234`** ไม่ใช่ `admin`

---

### 4. Backend ใช้ DB ชื่อ `planeat` เสมอ — แก้แล้ว 2026-04-17
**สำคัญมาก**: `config.py` hardcode `db_name = "planeat"` — แม้ MONGO_URL จะมี `planeat_dev` ก็ตาม backend ไม่ได้ใช้

```python
# config.py
db_name: str = "planeat"   # ← ชื่อนี้เสมอ ไม่ว่าจะ dev หรือ prod
```

ถ้าต้องการ restore หรือ insert ข้อมูลเข้า MongoDB ให้ใช้:
```bash
db = db.getSiblingDB("planeat")  # ✅ ถูก
db = db.getSiblingDB("planeat_dev")  # ❌ backend ไม่ได้อ่านที่นี่
```

---

## ยังต้องทำ

- [ ] ติดตั้ง SSL บน `planeatdev.duckdns.org`
- [ ] แยก `APP_DOMAIN` เป็น 2 .env file (`env.dev` / `env.prod`) กันสับสน

---

_ดู infrastructure: [[Infrastructure]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
