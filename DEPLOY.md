# PlaNeat Deploy Guide — Hostinger VPS

## Prerequisites (ทำครั้งแรกครั้งเดียว)

SSH เข้า VPS แล้วรัน:
```bash
# ติดตั้ง Docker ถ้ายังไม่มี (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# ติดตั้ง Docker Compose plugin (ถ้าใช้ docker compose v2)
sudo apt-get install docker-compose-plugin
```

---

## Deploy Steps

### 1. Copy โปรเจคขึ้น VPS
```bash
# บนเครื่องตัวเอง — zip แล้ว scp
zip -r planeat-app.zip planeat-app/
scp planeat-app.zip root@<VPS_IP>:/home/planeat/

# บน VPS
ssh root@<VPS_IP>
cd /home
mkdir -p planeat
cd planeat
unzip ~/planeat-app.zip
cd planeat-app
```

### 2. ตั้งค่า Environment
```bash
cp .env.example .env
nano .env
```
ใส่ค่า:
```
MONGO_PASSWORD=<รหัสผ่านที่แข็งแรง>
JWT_SECRET=<สุ่มได้จาก: openssl rand -hex 32>
VPS_IP=<IP ของ VPS เช่น 123.456.789.000>
```

### 3. Build & Start
```bash
docker compose build
docker compose up -d
```

รอประมาณ 3-5 นาที ให้ build เสร็จ

### 4. สร้าง Admin User (ครั้งแรก)
```bash
docker exec -it planeat-backend python scripts/init_admin.py
```

จะสร้าง users เริ่มต้น:
| Username   | Password  | Role       |
|------------|-----------|------------|
| admin      | admin1234 | admin      |
| accountant | acc1234   | accountant |
| recorder   | rec1234   | recorder   |
| viewer     | view1234  | viewer     |

⚠️ **เปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก!**

### 5. ตรวจสอบ
```bash
# ดู logs
docker compose logs -f

# ทดสอบ backend
curl http://localhost:8001/api/health

# เปิดใน browser
http://<VPS_IP>:3001   ← Frontend
http://<VPS_IP>:8001   ← Backend API
```

---

## การอัปเดต (ครั้งถัดไป)
```bash
# บน VPS
cd /home/planeat/planeat-app

# อัปเดตไฟล์ (scp หรือ git pull)
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Port ที่ใช้
| Service  | Port | หมายเหตุ |
|----------|------|---------|
| Frontend | 3001 | Next.js (หลีกเลี่ยง conflict กับ n8n) |
| Backend  | 8001 | FastAPI |
| MongoDB  | —    | ไม่ expose (ใช้ภายใน Docker network) |
| n8n      | (เดิม)| ไม่กระทบ |

---

## Useful Commands
```bash
docker compose ps          # ดูสถานะ containers
docker compose logs backend # ดู backend logs
docker compose logs frontend # ดู frontend logs
docker compose restart backend # restart service เดียว
docker compose down && docker compose up -d # restart ทั้งหมด
docker system prune -f     # ล้าง unused images (ประหยัด disk)
```
