# Budget

ระบบตั้งงบประมาณรายเดือน/รายปี และเปรียบเทียบกับ Expense จริง

Route: `/budget`

---

## ฟังก์ชันหลัก

| API | ทำอะไร |
|---|---|
| `GET /api/budget` | ดู budget summary รายเดือน |
| `POST /api/budget` | ตั้ง budget |
| `GET /api/budget/yearly` | Budget vs Actual รายเดือนตลอดปี (admin) |

---

## เชื่อมกับ Expense Control

```
Budget ← เปรียบเทียบกับ → Expense จริง
```

- หน้า `/expense-control` แสดง % การใช้งานเทียบ budget
- ถ้าเกิน limit → แจ้งเตือนผ่าน [[ระบบ LINE]] (Phase 2)

---

## ไฟล์สำคัญ

- `backend/app/routers/budget.py`
- `backend/app/services/budget_service.py`
- `backend/app/models/budget.py`

---

_ดู Expense: [[Expense Control]]_
_ดู LINE alerts: [[LINE Command Center]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
