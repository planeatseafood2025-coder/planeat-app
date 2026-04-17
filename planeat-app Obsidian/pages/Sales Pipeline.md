# Sales Pipeline

ระบบบริหาร deal ตั้งแต่ Lead จนปิดการขาย — Phase 2 (เริ่มแล้ว)

Route: `/sales/deals`

---

## Deal Stages

```
lead → qualified → proposal → negotiation → won / lost
```

| Field | รายละเอียด |
|---|---|
| `title` | ชื่อ deal |
| `customerId` | เชื่อมกับ [[CRM — Customers]] |
| `value` | มูลค่า deal |
| `stage` | ขั้นตอนปัจจุบัน |
| `probability` | โอกาสปิด 0–100% |
| `assignedTo` | sales ที่รับผิดชอบ |
| `expectedCloseDate` | วันที่คาดว่าจะปิด |

---

## Activity Log

บันทึก touchpoint ทุกครั้งที่ contact ลูกค้า ผ่าน `activities.py`

| type | ความหมาย |
|---|---|
| `note` | บันทึกโน๊ต |
| `call` | โทรหาลูกค้า |
| `email` | ส่งอีเมล |
| `meeting` | ประชุม |
| `line` | ติดต่อผ่าน LINE |

- `targetType` = `deal` หรือ `customer` — ผูกกับอะไรก็ได้
- แสดงเป็น timeline ต่อ deal

---

## สิ่งที่มีแล้ว

- ✅ `routers/deals.py` — CRUD deals + filter by stage/customer
- ✅ `routers/activities.py` — บันทึก activity log
- ✅ `models/deal.py`, `models/activity.py`
- ✅ `/sales/deals` frontend page

## สิ่งที่ยังต้องทำ

- [ ] Kanban Board UI (drag & drop)
- [ ] LINE Follow-up Reminder (ARQ Worker + LINE push)
- [ ] Sales Dashboard (Win Rate, Pipeline Value)
- [ ] เชื่อม [[LINE Command Center]] — `ตัวชี้วัดทีมขาย`

---

_ดู CRM: [[CRM — Customers]]_
_ดูระบบ LINE: [[ระบบ LINE]]_
_ดูงานต่อไป: [[งานขั้นต่อไป]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
