#!/bin/bash
# ============================================================
#  PlaNeat — Nginx + SSL Setup
#  รัน: bash deploy/configure-nginx.sh yourdomain.com your@email.com
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DOMAIN="${1:-}"
EMAIL="${2:-}"

[ -z "$DOMAIN" ] && error "Usage: bash configure-nginx.sh <domain> <email>\n  Example: bash configure-nginx.sh app.planeat.com admin@planeat.com"
[ -z "$EMAIL"  ] && error "Usage: bash configure-nginx.sh <domain> <email>"

info "Setting up Nginx for domain: $DOMAIN"

# ─── Nginx config ────────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/planeat"

cat > "$NGINX_CONF" <<EOF
# PlaNeat — Nginx config (HTTP only, certbot จะเพิ่ม HTTPS)
server {
    listen 80;
    server_name ${DOMAIN};

    # ── Frontend ──────────────────────────────────────────────
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

    # ── Backend API ───────────────────────────────────────────
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

    # ── SSE (Server-Sent Events) — ต้องปิด buffering ─────────
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
EOF

# Enable site
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/planeat
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
info "Nginx configured"

# ─── SSL with Let's Encrypt ───────────────────────────────────
info "Obtaining SSL certificate for $DOMAIN..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

info "SSL configured! Site is live at https://$DOMAIN"

# ─── Auto-renew cron ─────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
info "Auto-renew SSL cronjob added"

echo ""
echo "=================================================="
echo "  Done! Webhook URL สำหรับ LINE:"
echo "  https://${DOMAIN}/api/line/webhook/{config_id}"
echo "=================================================="
