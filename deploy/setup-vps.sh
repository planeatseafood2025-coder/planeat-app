#!/bin/bash
# ============================================================
#  PlaNeat — VPS Setup Script
#  รองรับ Ubuntu 20.04 / 22.04
#  ใช้: bash setup-vps.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "=================================================="
echo "   PlaNeat — VPS Setup (Ubuntu 20.04 / 22.04)"
echo "=================================================="
echo ""

# ─── 1. Update system ────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ─── 2. Install dependencies ─────────────────────────────────
info "Installing curl, git, ufw, nginx, certbot..."
apt-get install -y -qq curl git ufw nginx certbot python3-certbot-nginx

# ─── 3. Install Docker ───────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
else
  info "Docker already installed: $(docker --version)"
fi

# ─── 4. Install Docker Compose v2 ────────────────────────────
if ! docker compose version &>/dev/null; then
  info "Installing Docker Compose v2..."
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
       -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
else
  info "Docker Compose already installed: $(docker compose version)"
fi

# ─── 5. Firewall ─────────────────────────────────────────────
info "Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ─── 6. Clone / pull repo ────────────────────────────────────
APP_DIR="/opt/planeat-app"
if [ -d "$APP_DIR/.git" ]; then
  info "Pulling latest code..."
  cd "$APP_DIR" && git pull
else
  warn "App directory not found at $APP_DIR"
  warn "Please clone your repo manually:"
  warn "  git clone <your-repo-url> $APP_DIR"
fi

# ─── 7. สร้าง .env อัตโนมัติ ─────────────────────────────────
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  info "ตั้งค่า .env — กรุณากรอกข้อมูลต่อไปนี้:"
  echo ""

  read -p "  Domain ของ VPS (เช่น app.example.com): " APP_DOMAIN
  read -p "  MongoDB Password: " MONGO_PASSWORD
  read -p "  JWT Secret (กด Enter = สร้างอัตโนมัติ): " JWT_SECRET
  JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32)}
  read -p "  LINE Channel Token (ถ้ายังไม่มีกด Enter ข้ามได้): " LINE_TOKEN
  read -p "  LINE Channel Secret (ถ้ายังไม่มีกด Enter ข้ามได้): " LINE_SECRET

  cat > "$ENV_FILE" <<EOF
# ── Database ──────────────────────────────────────
MONGO_PASSWORD=${MONGO_PASSWORD}

# ── Auth ──────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}

# ── App Domain ────────────────────────────────────
APP_DOMAIN=https://${APP_DOMAIN}
CORS_ORIGINS=https://${APP_DOMAIN}

# ── LINE OA ───────────────────────────────────────
LINE_CHANNEL_TOKEN=${LINE_TOKEN}
LINE_CHANNEL_SECRET=${LINE_SECRET}

# ── Logging ───────────────────────────────────────
LOG_LEVEL=INFO
EOF

  info ".env สร้างแล้วที่ $ENV_FILE"
else
  info ".env มีอยู่แล้ว — ข้ามขั้นตอนนี้"
fi

info "Setup complete! Next step: run  bash deploy/configure-nginx.sh  after setting your domain."
