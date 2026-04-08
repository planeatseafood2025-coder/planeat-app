# PlaNeat — คู่มือ Deploy บน VPS

## ขั้นตอนทั้งหมด

### 1. เตรียม VPS (Ubuntu 22.04)
- สมัคร Contabo / DigitalOcean / Vultr
- รับ IP เช่น `103.xx.xx.xx`
- SSH เข้าไป: `ssh root@103.xx.xx.xx`

### 2. ชี้ Domain ไปที่ VPS
ไปที่ DNS ของ Domain ของคุณ เพิ่ม A Record:
```
Type: A
Name: app   (หรือ @ ถ้าใช้ root domain)
Value: 103.xx.xx.xx  ← IP VPS ของคุณ
TTL: 3600
```
รอ DNS propagate ~5-30 นาที

### 3. Setup VPS (ติดตั้ง Docker, Nginx)
```bash
# บน VPS
curl -fsSL https://raw.githubusercontent.com/<your-repo>/main/deploy/setup-vps.sh | bash
```
หรือ copy ไฟล์ขึ้นไปแล้วรัน:
```bash
bash deploy/setup-vps.sh
```

### 4. Clone โปรเจกต์
```bash
git clone <your-repo-url> /opt/planeat-app
cd /opt/planeat-app
```

### 5. ตั้งค่า .env
```bash
cp .env.example .env
nano .env
```
แก้ค่าเหล่านี้:
```env
VPS_IP=103.xx.xx.xx
APP_DOMAIN=https://app.planeat.com
CORS_ORIGINS=https://app.planeat.com
MONGO_PASSWORD=รหัสผ่านแข็งแรง
JWT_SECRET=random-string-ยาวๆ
```

### 6. Setup Nginx + SSL
```bash
bash deploy/configure-nginx.sh app.planeat.com admin@planeat.com
```
สคริปต์จะ:
- ตั้งค่า Nginx reverse proxy
- ขอ SSL certificate ฟรีจาก Let's Encrypt
- ตั้ง auto-renew อัตโนมัติ

### 7. Deploy App
```bash
bash deploy/deploy.sh
```

### 8. ตั้งค่า LINE Webhook
Webhook URL ที่ได้:
```
https://app.planeat.com/api/line/webhook/{config_id}
```
- ไป LINE Developer Console
- Messaging API → Webhook URL → วาง URL ข้างบน
- กด Verify ✓
- เปิด "Use webhook" ON

---

## การ Deploy ครั้งต่อไป (อัปเดตโค้ด)
```bash
cd /opt/planeat-app
bash deploy/deploy.sh
```

## ดู Logs
```bash
docker compose logs -f backend    # backend logs
docker compose logs -f frontend   # frontend logs
docker compose logs -f            # ทั้งหมด
```

## Troubleshooting
```bash
docker compose ps          # ดูสถานะ containers
docker compose restart backend   # restart backend
nginx -t && systemctl reload nginx  # reload nginx
certbot renew              # ต่ออายุ SSL (ปกติ auto)
```
