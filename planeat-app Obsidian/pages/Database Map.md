# Database Map — MongoDB `planeat`

อัปเดต: 2026-04-17 · ดึงจาก VPS dev โดยตรง

---

## ภาพรวม

```
MongoDB database: planeat
Host: planeat-dev-mongodb (Docker)
User: planeat / authSource: admin
```

| Collection               | จำนวน (dev) | หน้าที่                           |
| ------------------------ | ----------- | --------------------------------- |
| `users`                  | 3           | บัญชีผู้ใช้ทั้งหมด                |
| `expenses`               | 22          | ค่าใช้จ่ายที่อนุมัติแล้ว          |
| `expense_drafts`         | 24          | draft รอการอนุมัติ                |
| `expense_categories`     | 4           | หมวดหมู่ค่าใช้จ่าย                |
| `budgets`                | 1           | งบประมาณรายเดือน                  |
| `system_settings`        | 1           | การตั้งค่าระบบ (LINE, SMTP)       |
| `customers`              | 1           | ลูกค้า CRM                        |
| `crm_workspaces`         | 1           | Workspace แต่ละ LINE OA           |
| `customer_segments`      | 0           | กลุ่มลูกค้า                       |
| `deals`                  | 0           | Sales Pipeline deals              |
| `activities`             | 0           | Activity Log (call/email/meeting) |
| `warehouses`             | 4           | คลังสินค้า                        |
| `inventory_items`        | 0           | สินค้าในคลัง                      |
| `inventory_transactions` | 0           | ประวัติเข้า/ออกคลัง               |
| `notifications`          | 20          | แจ้งเตือนใน app                   |
| `chat_messages`          | 0           | ข้อความแชทภายใน                   |
| `line_login_states`      | 5           | CSRF state สำหรับ LINE OAuth      |
| `otp_tokens`             | 0           | OTP (ระบบเก่า ไม่ใช้แล้ว)         |

---

## โครงสร้างแต่ละ Collection

### `users`
```
_id           ObjectId
username      string       — EMP0001, admin
password_hash string
name          string
firstName     string
lastName      string
phone         string
email         string
lineUid       string       — ใช้ส่ง LINE push
jobTitle      string
role          string       — admin, manager, accounting, IT, general_user...
status        string       — pending, active, approved, rejected
permissions   object       — {labor, raw, chem, repair: bool}
createdAt     datetime
```

### `expenses`
```
_id           string       — UUID
date          string       — DD/MM/YYYY
date_iso      string       — YYYY-MM-DDTHH:MM
category      string       — ชื่อหมวด
catKey        string       — key ของหมวด
amount        number
recorder      string       — username ผู้กรอก
recorderName  string       — ชื่อจริง
recorderLineId string
detail        string
note          string
rows          array        — รายละเอียดแต่ละแถว
approvedBy    string       — username ผู้อนุมัติ
approverName  string
approvedAt    string
draftId       string       — อ้างอิง expense_drafts
createdAt     string
```

### `expense_drafts`
```
_id           string       — UUID
recorder      string
recorderName  string
recorderLineId string
date          string
date_iso      string
category      string
catKey        string
rows          array
total         number
detail        string
note          string
status        string       — pending, approved, rejected
submittedAt   string
reviewedBy    string/null
reviewedAt    string/null
rejectReason  string
approvedExpenseIds array
```

### `expense_categories`
```
_id           string       — key เช่น "labor"
name          string       — ชื่อหมวด
color         string
icon          string
formula       string       — วิธีคำนวณ
fields        array        — field ที่ต้องกรอก
allowedRoles  array
allowedUsers  array
isActive      boolean
order         number
createdAt     string
createdBy     string
```

### `budgets`
```
_id           ObjectId
monthYear     string       — "04/2026"
budgets       object       — {catKey: {monthly, daily}}
updatedAt     string
updatedBy     string
```

### `system_settings`
```
_id                      "system_settings"
mainLineOa               object
  ├── token              string  — Channel Access Token
  ├── channelId          string
  ├── channelSecret      string
  ├── targetId           string  — Group ID
  └── basicId            string  — @xxxxx (add friend link)
lineLogin                object
  ├── clientId           string
  ├── clientSecret       string
  └── callbackUrl        string
lineOaConfigs            array   — OA configs เพิ่มเติม
moduleConnections        object  — groupId แต่ละโมดูล
smtpEmail                string
smtpPassword             string
smtpServer               string
smtpPort                 number
budgetReminderEnabled    boolean
budgetReminderMessageDay30 string
budgetReminderMessageDay4  string
```

### `customers`
```
_id           string
workspaceId   string       — เชื่อมกับ crm_workspaces
name          string
type          string       — individual, company
email         string
phone         string
lineUid       string
lineDisplayName string
linePictureUrl  string
source        string       — line, manual, sheets
sourceRef     string
tags          array
segmentIds    array
company       string
address       string
note          string
contacts      array
status        string       — active, inactive
createdAt     string
updatedAt     string
createdBy     string
```

### `crm_workspaces`
```
_id           string
name          string
description   string
color         string
icon          string
lineOaConfigId string     — เชื่อมกับ lineOaConfigs
memberUsernames array
createdAt     string
updatedAt     string
createdBy     string
```

### `deals`
```
(ยังไม่มีข้อมูล — Phase 2)
title         string
customerId    string       — เชื่อมกับ customers
value         number
stage         string       — lead/qualified/proposal/negotiation/won/lost
probability   number       — 0-100%
assignedTo    string
expectedCloseDate string
```

### `warehouses`
```
_id           ObjectId
id            string
name          string
pin           string
color         string
bg            string
icon          string
desc          string
createdAt     string
```

### `notifications`
```
_id               ObjectId
id                string
recipientUsername string
senderUsername    string
type              string
title             string
body              string
read              boolean
createdAt         datetime
data              object
```

---

## ความสัมพันธ์ระหว่าง Collections

```
users ──────────────────────────────┐
  │ recorder/approvedBy             │
  ▼                                 ▼
expense_drafts ──approve──► expenses
  │ catKey                   │ catKey
  ▼                          ▼
expense_categories        budgets
                          (monthYear)

users (lineUid)
  └── system_settings.mainLineOa.token
        └── LINE push message

customers ◄── crm_workspaces ◄── lineOaConfigs
  └── deals (customerId)
  └── activities (targetId)

warehouses ◄── inventory_items ◄── inventory_transactions
```

---

_ดูระบบ LINE: [[ระบบ LINE]]_
_ดู Infrastructure: [[Infrastructure]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
