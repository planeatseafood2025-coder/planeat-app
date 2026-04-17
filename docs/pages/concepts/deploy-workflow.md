---
title: Deploy Workflow
type: concept
tags: [deploy, infra]
updated: 2026-04-17
sources: [CLAUDE.md, DEPLOY.md, memory/feedback_deploy_workflow.md]
---

# Deploy Workflow

## กฎสำคัญ (จาก feedback)
> **Deploy ไป `planeatdev` ก่อนเสมอ — deploy ไป `planeatsupport` หลังจากที่ user approve แล้วเท่านั้น**

---

## Local Deploy (Development)

```bash
cd "C:\Users\hot it\Downloads\planeat-app"
docker-compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker-compose up -d --build
```

> ต้อง `docker rmi` ก่อนทุกครั้ง เพราะ Docker cache ทำให้ build ไม่อัปเดตบ่อยมาก

### ตรวจสอบว่า build สำเร็จ
```bash
docker-compose exec -T frontend sh -c "grep -r 'keyword' /app/.next/ | wc -l"
```

---

## Dev Environment (planeatdev)
- ใช้ `docker-compose.dev.yml`
- Deploy ก่อนเสมอเพื่อทดสอบ

---

## VPS Deploy (planeatsupport / Production)

### ครั้งแรก
```bash
# บน VPS
docker compose build
docker compose up -d
docker exec -it planeat-backend python scripts/init_admin.py
```

Initial users:
| Username | Password | Role |
|----------|----------|------|
| admin | admin1234 | admin |
| accountant | acc1234 | accountant |
| recorder | rec1234 | recorder |
| viewer | view1234 | viewer |

⚠️ เปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก

### อัปเดต
```bash
cd /home/planeat/planeat-app
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Ports
| Service | Port |
|---------|------|
| Frontend | 3001 |
| Backend | 8001 |
| MongoDB | ไม่ expose |
| Redis | ไม่ expose |

---

## Useful Commands
```bash
docker compose ps
docker compose logs backend
docker compose logs frontend
docker compose restart backend
docker system prune -f   # ล้าง unused images
```

---

## Environment Variables
ดู `.env.example` — ต้อง set:
- `MONGO_PASSWORD`
- `JWT_SECRET` (ใช้ `openssl rand -hex 32`)
- `VPS_IP`

---

## Related
- [[architecture]] — container structure
- [[domain-ssl]] — domain และ SSL สำหรับ VPS
- [[overview]] — ภาพรวมระบบ
