#!/bin/bash
# ============================================================
#  PlaNeat — Deploy / Update Script
#  ใช้ทุกครั้งที่ต้องการ deploy หรืออัปเดตโค้ด
#  รัน: bash deploy/deploy.sh
# ============================================================
set -e

APP_DIR="/opt/planeat-app"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[ ! -d "$APP_DIR" ] && error "App not found at $APP_DIR — clone repo first"
[ ! -f "$APP_DIR/.env" ] && error ".env not found — copy .env.example to .env and fill in values"

cd "$APP_DIR"

info "Pulling latest code..."
git pull

info "Stopping containers..."
docker compose down

info "Removing old images..."
docker rmi planeat-app-frontend planeat-app-backend -f 2>/dev/null || true

info "Building and starting containers..."
docker compose up -d --build

info "Waiting for health checks..."
sleep 10

info "Container status:"
docker compose ps

info "Deploy complete!"
echo ""
echo "Logs: docker compose logs -f backend"
