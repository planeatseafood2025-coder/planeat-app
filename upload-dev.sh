#!/bin/bash
# Upload code to VPS DEV and rebuild
# รัน script นี้บนเครื่องหลัก เพื่ออัพโค้ดขึ้น VPS dev (3002/8002)
# ไม่แตะ prod (3001/8001) เด็ดขาด

VPS="root@76.13.211.161"
KEY="C:/Users/hot it/.ssh/planeat-vps"
REMOTE_DIR="/root/planeat-app"

echo "📦 Uploading code to VPS dev..."

# Sync code — ไม่แตะ .env บน VPS (ไม่ sync --delete เพื่อปลอดภัย)
rsync -avz --progress \
  -e "ssh -i \"$KEY\"" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='__pycache__' \
  --exclude='.next' \
  --exclude='*.pyc' \
    --exclude='planeat-app Obsidian' \
  --exclude='docs' \
  "c:/Users/hot it/Downloads/planeat-app/" \
  "$VPS:$REMOTE_DIR/"

echo ""
echo "🚀 Running deploy on VPS..."
ssh -i "$KEY" "$VPS" "bash $REMOTE_DIR/deploy-dev.sh"
