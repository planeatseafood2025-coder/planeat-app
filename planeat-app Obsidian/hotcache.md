# Hotcache — Recent Conversation Summary

อัปเดตล่าสุด: 2026-04-17

---

## Wiki นี้คืออะไร

Personal knowledge base สำหรับโปรเจค Planeat App — LLM เขียนและดูแล wiki ทั้งหมด

---

## โครงสร้าง

```
planeat-app Obsidian/
├── raw/        ← source (LLM ห้ามแก้)
├── pages/      ← LLM เขียนทั้งหมด
├── hotcache.md ← อ่านก่อนทุกครั้ง (ไฟล์นี้)
├── index.md    ← สารบัญ
├── log.md      ← history
└── CLAUDE.md   ← schema + กฎ VPS
```

---

## สถานะโค้ดล่าสุด

- **Commit**: `6409bec` — VPS dev synced กับ GitHub และเครื่องหลัก ✅
- **VPS dev**: planeatdev.duckdns.org — port 3002/8002 ทำงานปกติ

---

## Deploy Workflow — กฎสำคัญ

```
เครื่องหลัก (แก้โค้ด) → อัพ VPS โดยตรง (ไม่ผ่าน git)
VPS (AI แก้โค้ด) → git commit + push → เครื่องหลัก git pull
```

- **Deploy ขึ้น 3002/8002 เสมอ** — 3001/8001 เจ้าของจัดการเอง ห้ามแตะ
- **Git = backup เท่านั้น** — push เมื่อเจ้าของสั่งเท่านั้น
- **SSH เข้า VPS → ตรวจ memory ก่อนเสมอ**: `free -h && docker stats --no-stream`
- ถ้า memory สูงผิดปกติ → image เก่าค้างอยู่ → rebuild (DB ปลอดภัยเสมอ)
- **Deploy command**: `docker compose -f docker-compose.dev.yml up -d --build` → ใช้ script `/root/planeat-app/deploy-dev.sh`
- **ห้าม `compose down`** — ทำให้ข้อมูลหาย ถ้า container conflict ให้ `docker rm -f <container>` แทน
- **Upload จากเครื่องหลัก**: `bash upload-dev.sh` (rsync + auto deploy)
- **รหัสผ่าน VPS**: เปลี่ยนบ่อย — ต้องถามผู้ใช้ทุกครั้ง ห้ามสมมติเอง
- **VPS IP**: `76.13.211.161` | SSH Key: `C:/Users/hot it/.ssh/planeat-vps`
- **nginx prod ชี้ไป dev ports** — planeatsupport.duckdns.org → 3002/8002 (ยังไม่ได้แก้ เจ้าของต้องแก้เอง)

---

## โมดูลที่มีในระบบ (ครบแล้ว)

| โมดูล | Route | สถานะ |
|---|---|---|
| Auth & Roles | /login, /register | ✅ |
| Expense Control | /expense-control | ✅ |
| Budget | /budget | ✅ |
| CRM Customers | /customers | ✅ |
| Sales Pipeline | /sales/deals | ✅ Phase 2 เริ่มแล้ว |
| Inventory | /inventory | ✅ |
| Chat | /chat | ✅ |
| Integrations | /integrations | ✅ |

---

## LINE System — สถานะปัจจุบัน

- LINE Login OAuth 2.0 แทน OTP ✅
- Flex Message อนุมัติ expense ✅
- Flex Message อนุมัติสมาชิกใหม่ ✅
- Push แจ้งผู้กรอก expense ✅
- Webhook URL dynamic จาก `PUBLIC_URL` ✅
- **OTP ระบบเก่า — ลบออกแล้วทั้งหมด**

MongoDB collections ใหม่:
- `line_approval_pending` — pending Y/N อนุมัติ expense
- `line_user_approval_pending` — pending Y/N อนุมัติสมาชิก
- `line_login_temp` — temp profile ระหว่าง LINE OAuth
- `line_login_states` — CSRF state

LINE push ส่วนตัวได้ก็ต่อเมื่อ user **add OA เป็นเพื่อน** ก่อนเท่านั้น — fallback ใช้ lineNotifyToken

---

## Blockers ด่วน

1. **SSL บน planeatdev.duckdns.org** — LINE approval พร้อมแล้ว รอแค่นี้
2. **Dev DB แยกออกจาก Prod** — ตั้ง `MONGO_DB` env ใหม่

---

## แผนที่ยังไม่ได้เริ่ม

### Auth Upgrade — 17 Roles (ยังไม่เริ่ม)
แผนอัปเกรด role system จาก 5 roles เป็น 17 roles:
`super_admin, it_manager, it_support, accounting_manager, accountant, hr_manager, hr, warehouse_manager, warehouse_staff, production_manager, production_staff, marketing_manager, marketing_staff, engineering_manager, engineering_staff, general_user`

ลำดับงาน: backend role model → register API → forgot password → frontend login/register/access control → chat system

---

## Phase Roadmap

- **Phase 2 (Q2/2026)**: Kanban UI, LINE Reminder, Sales Dashboard — deals.py เริ่มแล้ว
- **Phase 3 (Q3/2026)**: LINE Broadcast, Email, Facebook/IG
- **Phase 4 (Q4/2026)**: AI Bot LINE, KPI Real-time
- **Phase 5 (Q1/2027)**: Quotation, Billing, HR, Payroll → ERP ครบ

---

## Preferences

- ภาษาไทยเป็นหลัก
- สไตล์ conversational — hook, หัวข้อย่อยชัด, one-liner สรุป
- ไม่ใช้ศัพท์ tech กับคนทั่วไป
