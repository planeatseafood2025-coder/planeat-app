# Deploy — วิธีใช้งาน

---

## ⚠️ กฎเหล็ก

| กฎ | รายละเอียด |
|---|---|
| **ห้าม `compose down`** | ทำให้ข้อมูล MongoDB หาย → ใช้ `up --build` เท่านั้น |
| **ห้ามแตะ port 3001/8001** | prod — เจ้าของจัดการเอง |
| **ห้าม `-v` flag** | `compose down -v` ลบ volumes ทิ้งหมด |

---

## เชื่อมต่อ VPS

```bash
ssh -i "C:/Users/hot it/.ssh/planeat-vps" root@76.13.211.161
```

---

## Workflow 1: อัพโค้ดจากเครื่องหลัก (แนะนำ)

```bash
# รัน script นี้บนเครื่องหลัก — upload + deploy ในขั้นตอนเดียว
bash "c:/Users/hot it/Downloads/planeat-app/upload-dev.sh"
```

script นี้จะ:
1. rsync โค้ดขึ้น VPS (ข้าม `.env`, `node_modules`, `.git`)
2. รัน `deploy-dev.sh` บน VPS โดยอัตโนมัติ

---

## Workflow 2: Deploy บน VPS โดยตรง

```bash
# SSH เข้า VPS แล้วรัน
bash /root/planeat-app/deploy-dev.sh
```

หรือ manual:
```bash
cd /root/planeat-app
docker compose -f docker-compose.dev.yml up -d --build
```

---

## Deploy แค่ Frontend (เร็วกว่า)

```bash
cd /root/planeat-app
docker compose -f docker-compose.dev.yml build --no-cache frontend
docker compose -f docker-compose.dev.yml up -d
```

---

## ตรวจสอบหลัง Deploy

```bash
# ดู containers
docker compose -f docker-compose.dev.yml ps

# ดู logs ถ้ามีปัญหา
docker compose -f docker-compose.dev.yml logs --tail=50 backend
docker compose -f docker-compose.dev.yml logs --tail=50 frontend
```

---

## สถานการณ์พิเศษ — Container conflict

**อาการ**: `Error: container name "/planeat-dev-mongodb" is already in use`

```bash
docker rm -f planeat-dev-mongodb planeat-dev-redis planeat-dev-backend planeat-dev-frontend planeat-dev-worker
docker compose -f docker-compose.dev.yml up -d
```

> ห้าม `docker compose down` → ใช้ `docker rm -f` เฉพาะ container แทน

---

## Environments

| | URL | Port | สถานะ |
|---|---|---|---|
| Dev | `https://planeatdev.duckdns.org` | 3002 / 8002 | ✅ ใช้งาน |
| Production | `https://planeatsupport.duckdns.org` | 3001 / 8001 | เจ้าของจัดการ |

> ⚠️ ตอนนี้ nginx prod ชี้ไป 3002/8002 เหมือนกัน — เจ้าของต้องแก้ nginx ก่อน deploy prod จริง

---

## Workflow: AI แก้โค้ดบน VPS

```
1. git pull บนเครื่องหลักก่อน (รับของล่าสุด)
2. AI แก้บน VPS
3. AI commit + push
4. git pull บนเครื่องหลักอีกครั้ง
```

---

_ดูรายละเอียด ENV: [[Deploy & Environments]]_
_ดู VPS infrastructure: [[VPS Infrastructure]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
