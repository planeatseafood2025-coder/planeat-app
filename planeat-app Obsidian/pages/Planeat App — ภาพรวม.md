# Planeat App — ภาพรวม

แอพ ERP องค์กร — Expense, CRM, Sales, Inventory + ควบคุมผ่าน LINE

---

## แผนที่ระบบทั้งหมด

```
Planeat App — ภาพรวม (หน้านี้)
│
├── Core Features
│   ├── [[Auth & Roles]]           ← Login, JWT, LINE OAuth, EMP username
│   ├── [[Expense Control]]        ← บันทึก/อนุมัติค่าใช้จ่าย (4 tabs)
│   ├── [[Budget]]                 ← ตั้งงบ + Budget vs Actual
│   ├── [[CRM — Customers]]        ← ลูกค้า, Workspace, Segment
│   └── [[Sales Pipeline]]         ← Deals, Activity Log (Phase 2)
│
├── LINE System
│   ├── [[ระบบ LINE]]              ← Webhook, Flex Message, Approval
│   └── [[LINE Command Center]]    ← คำสั่ง LINE สำหรับผู้บริหาร
│
├── โมดูลเพิ่มเติม
│   └── [[โมดูลอื่นๆ]]             ← Inventory, Chat, Notify, PDF, Search, Settings
│
├── โครงสร้างพื้นฐาน
│   ├── [[Infrastructure]]         ← Redis, ARQ Worker, SSE, Docker
│   ├── [[Deploy & Environments]]  ← Domains, ENV vars
│   └── [[Deploy — วิธีใช้งาน]]   ← SSH + deploy commands
│
└── วางแผน / บันทึก
    ├── [[Roadmap]]                ← Phases 0–5
    ├── [[งานขั้นต่อไป]]           ← Blockers + Phase 2–5 breakdown
    └── [[Changelog — VPS Session 2026-04-17]]
```

---

## Stack หลัก

| ส่วน     | เทคโนโลยี                        | Port                 |
| -------- | -------------------------------- | -------------------- |
| Frontend | Next.js 14, TypeScript, Tailwind | 3001 prod / 3002 dev |
| Backend  | FastAPI, Motor, MongoDB          | 8001 prod / 8002 dev |
| Queue    | Redis + ARQ Worker               | —                    |
| Proxy    | Nginx                            | —                    |
| Deploy   | Docker Compose                   | —                    |

---

## User Roles

`admin` → `manager` → `accounting` → `viewer` → `IT`

---

## จุดเชื่อมต่อสำคัญ

- [[ระบบ LINE]] เป็น backbone — approval, notification, login ทุกอย่าง
- [[Expense Control]] → Flex Message → [[ระบบ LINE]] → approve → DB
- [[Auth & Roles]] → LINE OAuth → pending → IT อนุมัติผ่าน [[ระบบ LINE]]
- [[CRM — Customers]] → LINE follow → auto-create customer
- [[Sales Pipeline]] → Activity Log → เชื่อม [[CRM — Customers]]
- [[Budget]] → เปรียบเทียบกับ [[Expense Control]]
- [[Infrastructure]] → ARQ Worker → ส่ง LINE push
- [[LINE Command Center]] → ใช้ [[ระบบ LINE]] + ทุกโมดูล
