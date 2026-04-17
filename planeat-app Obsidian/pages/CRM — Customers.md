# CRM — Customers

ระบบบริหารลูกค้า — รองรับ B2B/B2C + เชื่อม LINE OA อัตโนมัติ

---

## Pages

| Route | ฟังก์ชัน |
|---|---|
| `/customers` | รายชื่อลูกค้าทั้งหมด |
| `/customers/[id]` | รายละเอียดลูกค้า + activity |
| `/customers/workspaces` | จัดการ Workspace |
| `/customers/segments` | กลุ่มลูกค้า |
| `/customers/connections` | การเชื่อมต่อ |

---

## การเชื่อมกับระบบอื่น

| ระบบ | วิธีเชื่อม |
|---|---|
| [[ระบบ LINE]] | follow event → สร้าง Customer อัตโนมัติ, unfollow → inactive |
| [[Sales Pipeline]] | Customer ผูกกับ Deal ผ่าน `customerId` |
| Google Sheets | นำเข้าลูกค้าจาก Sheets |
| Segments | แบ่งกลุ่มลูกค้าตาม tag/เงื่อนไข |

---

## Workspaces

แต่ละ LINE OA config ผูกกับ workspace — ลูกค้าที่ follow OA นั้นจะเข้า workspace นั้นอัตโนมัติ

```
LINE OA follow event
    → _handle_follow()
    → _get_or_create_default_workspace(config_id)
    → create/update Customer ใน workspace นั้น
```

---

## MongoDB Collections

| Collection | ใช้ทำอะไร |
|---|---|
| `crm_customers` | ข้อมูลลูกค้า |
| `crm_workspaces` | workspaces |
| `crm_segments` | กลุ่มลูกค้า |

---

## ไฟล์สำคัญ

- `backend/app/routers/customers.py`
- `backend/app/routers/crm_workspaces.py`
- `backend/app/routers/segments.py`
- `backend/app/services/customer_service.py`
- `backend/app/services/crm_workspace_service.py`

---

_ดูระบบ LINE: [[ระบบ LINE]]_
_ดู Sales: [[Sales Pipeline]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
