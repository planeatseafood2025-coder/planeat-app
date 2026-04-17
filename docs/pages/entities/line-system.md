---
title: LINE System
type: entity
tags: [line, api, infra]
updated: 2026-04-17
sources: [CLAUDE.md, memory/project_line_system.md]
---

# LINE System — ระบบ LINE ทั้งหมด

## ภาพรวม
มี 3 ส่วนหลัก:
1. **LINE Login** — login เข้า app ด้วย LINE account
2. **LINE Webhook** — รับ event จาก LINE OA (approval, register)
3. **LINE Flex Message** — ส่ง approval request และ notification

---

## LINE Approval Flow
เมื่อมี request ที่ต้อง approve:
1. ระบบส่ง Flex Message ไปยัง admin/manager ผ่าน LINE OA
2. admin กด approve/reject บน LINE
3. LINE ส่ง Webhook event กลับ
4. ระบบอัปเดต status + notify ผู้ขอ

## LINE Register Flow (Standalone)
- หน้า register แยกออกมา (standalone)
- ผู้ใช้ลงทะเบียนผ่าน LINE
- OTP **ถูกลบออกแล้ว** — ใช้ approval flow แทน

---

## Webhook URL
- URL เป็น **dynamic** (ไม่ hardcode)
- ใช้ domain DuckDNS สำหรับ VPS
- ดูการตั้งค่าใน [[domain-ssl]]

---

## Collections ที่เกี่ยวข้อง (MongoDB)
- `line_users` — mapping LINE userId ↔ app user
- `line_approvals` — approval requests และ status
- `line_notifications` — log การส่ง notification

---

## Backend Endpoints
| Method | Path | หมายเหตุ |
|--------|------|---------|
| `POST` | `/api/webhook/line` | รับ LINE events |
| `POST` | `/api/notifications/line-notify` | ส่ง LINE Notify |

---

## Related
- [[auth]] — LINE Login ← auth system
- [[expense-control]] — HistoryTab ส่ง LINE Notify
- [[domain-ssl]] — Webhook URL และ SSL
- [[overview]] — ภาพรวมระบบ
