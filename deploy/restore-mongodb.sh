#!/bin/bash
# =============================================================================
# restore-mongodb.sh — Planeat MongoDB Restore Script
# =============================================================================
# วิธีใช้งาน:
#   ./restore-mongodb.sh /opt/planeat/backups/20260412_020000.tar.gz
# =============================================================================

set -euo pipefail

CONTAINER_NAME="planeat-mongodb"
MONGO_USER="planeat"
MONGO_DB="planeat"

ENV_FILE="/opt/planeat/.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^MONGO_PASSWORD=" "$ENV_FILE" | xargs)
fi

MONGO_PASSWORD="${MONGO_PASSWORD:-}"

# ── ตรวจ argument ──────────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
    echo "วิธีใช้: $0 <backup_file.tar.gz>"
    echo ""
    echo "Backup ที่มีอยู่:"
    ls -lh /opt/planeat/backups/*.tar.gz 2>/dev/null || echo "  (ไม่มีไฟล์)"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: ไม่พบไฟล์ $BACKUP_FILE"
    exit 1
fi

if [ -z "$MONGO_PASSWORD" ]; then
    echo "ERROR: MONGO_PASSWORD ไม่ได้ตั้งค่า"
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ── เริ่ม restore จาก $BACKUP_FILE ──"

# ── แตกไฟล์ ──────────────────────────────────────────────────────────────
TEMP_DIR=$(mktemp -d)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] แตกไฟล์ ..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# หาโฟลเดอร์ที่แตกออกมา
DUMP_FOLDER=$(ls "$TEMP_DIR")

# ── Copy เข้า container ──────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] copy เข้า container ..."
docker cp "$TEMP_DIR/$DUMP_FOLDER" "${CONTAINER_NAME}:/tmp/restore_data"

# ── Restore ──────────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] กำลัง restore database (จะ overwrite ข้อมูลปัจจุบัน) ..."
docker exec "$CONTAINER_NAME" mongorestore \
    --uri="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/?authSource=admin" \
    --drop \
    "/tmp/restore_data/${MONGO_DB}"

# ── ล้างของชั่วคราว ──────────────────────────────────────────────────────
docker exec "$CONTAINER_NAME" rm -rf /tmp/restore_data
rm -rf "$TEMP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ── restore เสร็จสิ้น ──"
