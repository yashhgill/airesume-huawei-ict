#!/usr/bin/env bash
# Pull the latest code, rebuild and restart. Run as root on the ECS.
set -euo pipefail
cd /opt/airesume
sudo -u airesume git pull --ff-only
sudo -u airesume npm ci
sudo -u airesume npm run build
systemctl restart airesume
sleep 2 && curl -fsS http://127.0.0.1:8787/api/health && echo
