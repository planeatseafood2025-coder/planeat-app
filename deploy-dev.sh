#!/bin/bash
# Safe deploy script — DEV only (3002/8002)
# ห้ามใช้กับ prod เด็ดขาด | อย่าใช้ compose down (data หาย)

set -e

echo === PLANEAT DEV DEPLOY ===
echo Memory:
free -h | grep Mem
echo 

cd /root/planeat-app

# ตรวจว่ารันถูก compose file
echo Using: docker-compose.dev.yml
echo 

# SAFE: ใช้ up --build เท่านั้น — ห้าม 'down' เพราะทำให้ data หาย
docker compose -f docker-compose.dev.yml up -d --build

echo 
echo === Containers ===
docker compose -f docker-compose.dev.yml ps

echo 
echo ✅ Deploy done — planeatdev.duckdns.org
