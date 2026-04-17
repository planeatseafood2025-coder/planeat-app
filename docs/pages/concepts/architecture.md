---
title: Architecture
type: concept
tags: [infra, api, frontend, deploy]
updated: 2026-04-17
sources: [CLAUDE.md]
---

# สถาปัตยกรรมระบบ

## Containers (Docker Compose)

```
┌─────────────────────────────────────────────┐
│              Docker Network                  │
│                                              │
│  [frontend :3001]  ←→  [backend :8001]       │
│                              ↕               │
│                    [mongodb] [redis]         │
│                              ↕               │
│                    [planeat-worker]          │
│                    (ARQ background jobs)     │
└─────────────────────────────────────────────┘
```

- Frontend และ Backend เปิด port ออก host
- MongoDB และ Redis อยู่ภายใน network เท่านั้น (ไม่ expose)
- Worker เป็น process แยก รับ jobs จาก Redis queue

---

## Data Flow

### HTTP Request
```
Browser → Next.js (SSR/CSR) → FastAPI → MongoDB
                                      ↘ Redis (cache)
```

### Real-time (SSE)
```
Browser ←── SSE stream ←── FastAPI
            (แทน polling 30s)
```

### Background Jobs (ARQ)
```
FastAPI → Redis queue → ARQ Worker → ทำงาน (เช่น ส่ง email, cleanup)
```

---

## Caching Strategy
- Redis cache: หมวดหมู่ (categories) — invalidate เมื่อแก้ไข
- ARQ job queue: ผ่าน Redis เช่นกัน

---

## PDF Storage
- เก็บใน Docker Volume `pdf_data` (persistent)
- **ไม่เก็บใน memory** (เดิมเคยเป็น memory ก่อน Phase 0.7)

---

## Key Files
| File | หน้าที่ |
|------|--------|
| `frontend/lib/api.ts` | API functions ทั้งหมด (single source of truth) |
| `frontend/types/index.ts` | TypeScript types |
| `backend/app/routers/` | FastAPI route handlers |
| `backend/app/services/` | Business logic |
| `backend/app/models/` | Pydantic models |
| `docker-compose.yml` | Container orchestration |
| `.env.example` | Environment variable template |

---

## Related
- [[overview]] — ภาพรวมและ stack
- [[deploy-workflow]] — วิธี deploy
- [[roles]] — role-based access
