#!/usr/bin/env bash
# One-time setup of AI Resume on a Huawei Cloud ECS (Ubuntu 22.04/24.04).
# Run as root:  curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy/ecs/setup.sh | bash -s -- <git-url>
#          or:  bash deploy/ecs/setup.sh https://github.com/<you>/<repo>.git
set -euo pipefail
REPO="${1:?usage: setup.sh <git-repo-url>}"
APP_DIR=/opt/airesume

echo "==> Packages"
apt-get update -y
apt-get install -y ca-certificates curl git nginx
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> App user and code"
id airesume >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin airesume
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi
cd "$APP_DIR"
npm ci
npm run build
mkdir -p data
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  echo "!! Edit $APP_DIR/.env and set GROQ_API_KEY and ADMIN_EMAILS, then: systemctl restart airesume"
fi
chown -R airesume:airesume "$APP_DIR"
chmod 600 .env

echo "==> systemd"
cp deploy/ecs/airesume.service /etc/systemd/system/airesume.service
systemctl daemon-reload
systemctl enable --now airesume

echo "==> nginx"
cp deploy/ecs/nginx.conf /etc/nginx/sites-available/airesume
ln -sf /etc/nginx/sites-available/airesume /etc/nginx/sites-enabled/airesume
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 'Nginx Full'; fi

sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo && echo "==> Done. Open http://$(curl -fsS ifconfig.me 2>/dev/null || echo '<EIP>')/"
