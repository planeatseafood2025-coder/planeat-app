#!/bin/bash
# =============================================================================
# install.sh — Planeat Full Auto Install
# รันครั้งเดียวจบ: ติดตั้ง → ตั้งค่า → Deploy → SSL
#
# วิธีใช้บน VPS ใหม่:
#   git clone https://github.com/planeatseafood2025-coder/planeat-app /opt/planeat-app
#   bash /opt/planeat-app/deploy/install.sh
# =============================================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
section() { echo -e "\n${CYAN}══ $1 ══${NC}"; }

APP_DIR="/opt/planeat-app"

clear
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Planeat — Full Auto Installer         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── ตรวจสอบว่ารันด้วย root ──────────────────────────────────
[ "$EUID" -ne 0 ] && error "กรุณารันด้วย root: sudo bash deploy/install.sh"
[ ! -d "$APP_DIR" ] && error "ไม่พบโฟลเดอร์ $APP_DIR — กรุณา clone repo ก่อน"

# =============================================================================
# STEP 1 — รับข้อมูลจากผู้ใช้
# =============================================================================
section "ขั้นตอนที่ 1/5 — ตั้งค่าระบบ"
echo ""

read -p "  Domain ของ VPS (เช่น app.example.com): " APP_DOMAIN
[ -z "$APP_DOMAIN" ] && error "ต้องระบุ Domain"

read -p "  Email สำหรับ SSL (Let's Encrypt): " SSL_EMAIL
[ -z "$SSL_EMAIL" ] && error "ต้องระบุ Email"

read -p "  MongoDB Password: " MONGO_PASSWORD
[ -z "$MONGO_PASSWORD" ] && error "ต้องระบุ MongoDB Password"

read -p "  JWT Secret (กด Enter = สร้างอัตโนมัติ): " JWT_SECRET
JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32)}

echo ""
echo "  ── LINE OA (ถ้ายังไม่มีกด Enter ข้ามได้) ──"
read -p "  LINE Channel Access Token: " LINE_TOKEN
read -p "  LINE Channel Secret: " LINE_SECRET

echo ""
info "รับข้อมูลครบแล้ว"

# =============================================================================
# STEP 2 — ติดตั้ง Dependencies
# =============================================================================
section "ขั้นตอนที่ 2/5 — ติดตั้ง Dependencies"

info "Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

info "Installing curl, git, ufw, nginx, certbot..."
apt-get install -y -qq curl git ufw nginx certbot python3-certbot-nginx

if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
else
  info "Docker: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
  info "Installing Docker Compose v2..."
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
       -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
else
  info "Docker Compose: $(docker compose version)"
fi

info "Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# =============================================================================
# STEP 3 — สร้าง .env
# =============================================================================
section "ขั้นตอนที่ 3/5 — สร้าง .env"

cat > "$APP_DIR/.env" <<EOF
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

info ".env สร้างแล้ว"

# =============================================================================
# STEP 4 — Deploy Docker
# =============================================================================
section "ขั้นตอนที่ 4/5 — Deploy Docker"

cd "$APP_DIR"

info "Pulling latest code..."
git fetch origin main
git reset --hard origin/main

info "Building and starting containers..."
docker compose down 2>/dev/null || true
docker rmi planeat-app-frontend planeat-app-backend -f 2>/dev/null || true
docker compose up -d --build

info "Waiting for containers to be healthy..."
sleep 20

info "Container status:"
docker compose ps

# =============================================================================
# STEP 5 — Nginx + SSL
# =============================================================================
section "ขั้นตอนที่ 5/5 — Nginx + SSL"

NGINX_CONF="/etc/nginx/sites-available/planeat"

cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    server_name ${APP_DOMAIN};

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        client_max_body_size 20M;
    }

    location /api/sse/ {
        proxy_pass         http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Cache-Control no-cache;
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
    }
}
NGINXEOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/planeat
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
info "Nginx configured"

info "Obtaining SSL certificate..."
certbot --nginx -d "$APP_DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect
info "SSL configured"

# Auto-renew SSL
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
info "Auto-renew SSL cronjob added"

# =============================================================================
# DONE
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║           ติดตั้งเสร็จสมบูรณ์ ✅             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  🌐 เว็บแอป:     https://${APP_DOMAIN}"
echo "  🔗 LINE Webhook: https://${APP_DOMAIN}/api/line/webhook/main"
echo "  📋 Logs:         docker compose -f $APP_DIR/docker-compose.yml logs -f"
echo ""
echo "  ⚠️  อย่าลืมตั้ง Webhook URL ใน LINE Developer Console:"
echo "     https://${APP_DOMAIN}/api/line/webhook/main"
echo ""
