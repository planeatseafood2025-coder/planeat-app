#!/bin/bash
# =============================================================================
# backup-mongodb.sh — Planeat MongoDB Auto Backup Script
# =============================================================================
# วิธีใช้งาน:
#   1. อัปโหลดไฟล์นี้ไปที่ VPS: /opt/planeat/deploy/backup-mongodb.sh
#   2. ให้สิทธิ์รัน: chmod +x /opt/planeat/deploy/backup-mongodb.sh
#   3. ตั้ง cron: crontab -e  แล้วเพิ่ม:
#      0 2 * * * /opt/planeat/deploy/backup-mongodb.sh >> /var/log/planeat-backup.log 2>&1
# =============================================================================

set -euo pipefail

# ── การตั้งค่า ──────────────────────────────────────────────────────────────
CONTAINER_NAME="planeat-mongodb"           # ชื่อ container MongoDB
MONGO_USER="planeat"                       # username MongoDB
MONGO_DB="planeat"                         # ชื่อ database

# โหลด MONGO_PASSWORD จาก .env ของโปรเจค
ENV_FILE="/opt/planeat/.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^MONGO_PASSWORD=" "$ENV_FILE" | xargs)
fi

MONGO_PASSWORD="${MONGO_PASSWORD:-}"       # โหลดจาก environment

BACKUP_DIR="/opt/planeat/backups"          # โฟลเดอร์เก็บ backup บน VPS
KEEP_DAYS=0                                # 0 = เก็บตลอด ไม่ลบ
DATE=$(date +"%Y%m%d_%H%M%S")             # timestamp เช่น 20260412_020000
BACKUP_PATH="$BACKUP_DIR/$DATE"           # path เต็มของ backup นี้

# ── ตรวจสอบก่อนรัน ──────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ── เริ่ม backup MongoDB ──"

# ตรวจว่า Docker container รันอยู่ไหม
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: container '$CONTAINER_NAME' ไม่ได้รันอยู่"
    exit 1
fi

# ตรวจว่ามี password ไหม
if [ -z "$MONGO_PASSWORD" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: MONGO_PASSWORD ไม่ได้ตั้งค่า"
    exit 1
fi

# สร้างโฟลเดอร์ backup ถ้ายังไม่มี
mkdir -p "$BACKUP_DIR"

# ── ทำ Backup ───────────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] กำลัง dump database '$MONGO_DB' ..."

docker exec "$CONTAINER_NAME" mongodump \
    --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/${MONGO_DB}?authSource=admin" \
    --out="/tmp/backup_${DATE}"

# ── Copy ออกมาจาก Container ─────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] กำลัง copy ไฟล์ออกจาก container ..."

docker cp "${CONTAINER_NAME}:/tmp/backup_${DATE}" "$BACKUP_PATH"

# ── Compress เป็น .tar.gz ────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] กำลัง compress เป็น tar.gz ..."

tar -czf "${BACKUP_PATH}.tar.gz" -C "$BACKUP_DIR" "$DATE"
rm -rf "$BACKUP_PATH"

# ── ลบไฟล์ชั่วคราวใน container ──────────────────────────────────────────────
docker exec "$CONTAINER_NAME" rm -rf "/tmp/backup_${DATE}"

# ── แสดงขนาดไฟล์ ─────────────────────────────────────────────────────────────
BACKUP_SIZE=$(du -sh "${BACKUP_PATH}.tar.gz" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup สำเร็จ: ${BACKUP_PATH}.tar.gz (${BACKUP_SIZE})"

# ── ไม่ลบ Backup เก่า — เก็บไว้ตลอด ────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] (เก็บ backup ทุกไฟล์ตลอด ไม่มีการลบ)"

# ── แสดงรายการ backup ที่มีอยู่ ──────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup ที่มีอยู่ทั้งหมด:"
ls -lh "$BACKUP_DIR"/*.tar.gz 2>/dev/null || echo "  (ไม่มีไฟล์)"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ── backup เสร็จสิ้น ──"
