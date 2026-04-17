# Expense Control

ฟีเจอร์หลักของแอพ — บันทึก ดู และอนุมัติค่าใช้จ่ายองค์กร

Route: `/expense-control`

---

## 4 Tabs หลัก

| Tab | ทำอะไร |
|---|---|
| **Overview** | สรุปงบ, Top 5 หมวดหมู่, กรอง category |
| **Daily** | บันทึกรายจ่ายรายวัน + Refresh |
| **History** | ดูประวัติ, แก้ไข (manager), ส่ง LINE Notify |
| **Category Manager** | จัดการหมวดหมู่ |

---

## Flow การอนุมัติ Expense

```
ผู้กรอก บันทึก expense
    → แจ้งผู้กรอกทาง LINE ว่าส่งสำเร็จ
    → ส่ง Flex Message หา accounting_manager
    → manager กด ✅ / ❌ บน LINE
    → webhook รับ Y/N → update DB
    → แจ้ง recorder กลับทาง LINE
```

---

## สิทธิ์

- **บันทึก/ดู**: accounting, manager, admin
- **แก้ไข**: manager, admin เท่านั้น
- **ACCOUNTING_ROLES**: `admin`, `manager`, `accounting`

---

## MongoDB Collections

| Collection | ใช้ทำอะไร |
|---|---|
| `expenses` | รายการค่าใช้จ่าย |
| `expense_categories` | หมวดหมู่ |
| `line_approval_pending` | รอ manager กด Y/N |

---

## ไฟล์สำคัญ

- `frontend/app/(app)/expense-control/page.tsx`
- `backend/app/routers/expenses.py`
- `backend/app/services/expense_service.py`
- `backend/app/services/line_notify_service.py` — ส่ง Flex Message

---

_ดูระบบแจ้งเตือน: [[ระบบ LINE]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
