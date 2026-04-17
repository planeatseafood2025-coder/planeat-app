---
title: Authentication & Authorization
type: entity
tags: [auth, api, frontend]
updated: 2026-04-17
sources: [CLAUDE.md]
---

# Auth — ระบบ Login และสิทธิ์

## Overview
ใช้ **JWT** สำหรับ session — login แล้วได้ token, ส่งใน Authorization header ทุก request

## Login Flow
1. User กรอก username/password
2. Backend ตรวจสอบ → return JWT token
3. Frontend เก็บ token → redirect ตาม role (→ `/expense-control`)
4. ทุก API call แนบ Bearer token

## Register
- มีหน้า standalone register
- OTP **ถูกลบออกแล้ว** (ดู [[line-system]] สำหรับ LINE-based approval แทน)

## Roles

ดูรายละเอียดใน [[roles]]

| Role | สิทธิ์หลัก |
|------|-----------|
| admin | ทุกอย่าง |
| manager | แก้ไข expense ได้ |
| accounting | บันทึก expense |
| viewer | ดูอย่างเดียว |

## Backend
- `ACCOUNTING_ROLES` = `[admin, manager, accounting]` — มีสิทธิ์แก้ไข expense
- Endpoint auth อยู่ใน `backend/app/routers/`

## Related
- [[roles]] — รายละเอียดสิทธิ์แต่ละ role
- [[line-system]] — LINE Login integration
- [[overview]] — ภาพรวมระบบ
