---
title: Roles & Permissions
type: concept
tags: [auth]
updated: 2026-04-17
sources: [CLAUDE.md]
---

# Roles & Permissions

## Roles ที่มี

| Role | ระดับ | สิทธิ์ |
|------|-------|--------|
| `admin` | สูงสุด | ทุกอย่าง รวม user management |
| `manager` | สูง | แก้ไข expense, approve requests |
| `accounting` | กลาง | บันทึก expense, ดู report |
| `viewer` | ต่ำ | ดูได้อย่างเดียว |

## ACCOUNTING_ROLES
กลุ่ม role ที่มีสิทธิ์แก้ไข expense:
```python
ACCOUNTING_ROLES = ["admin", "manager", "accounting"]
```

## Expense Edit Permission
- แก้ไข expense (`PUT /api/expenses/{id}`) → **manager เท่านั้น**
- บันทึก expense → `ACCOUNTING_ROLES`

## Frontend Redirect After Login
- หลัง login ทุก role → redirect ไป `/expense-control`

## Profile Page
- ผู้ใช้สามารถขอ/ดูสิทธิ์ได้จากหน้า `/profile`

---

## Related
- [[auth]] — JWT และ login flow
- [[expense-control]] — การตรวจสิทธิ์ใน expense
