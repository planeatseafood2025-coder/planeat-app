# ระบบ LINE

backbone ของการแจ้งเตือนและ approval ทุกอย่างในแอพ

---

## Webhook Endpoint

```
POST /api/line/webhook/{config_id}
```

- `config_id = "main"` → ใช้ `mainLineOa` จาก system_settings
- `config_id = "xxx"` → ใช้ `lineOaConfigs[]` ที่ตรงกัน
- ทุก request ต้อง verify signature ด้วย `channelSecret` ก่อน

---

## Event Types ที่รองรับ

| Event | Source | สิ่งที่เกิดขึ้น |
|---|---|---|
| `join` | group | บันทึก groupId + ส่ง Group ID กลับในกลุ่ม |
| `follow` | user | สร้าง/อัปเดต Customer + ส่ง welcome message |
| `unfollow` | user | ตั้ง Customer status = inactive |
| `message` | group | Y/N approval (สมาชิก → expense) |
| `message` | user | Y/N → keyword "รายการ" → Y/N expense |
| `postback` | user | approve / reject / approve_all / view_pending |

---

## ลำดับการประมวลผล Message (1 ต่อ 1)

```
ข้อความเข้ามา
    1. Y/N อนุมัติสมาชิกใหม่? (line_user_approval_pending)
       ↓ ไม่ใช่
    2. "รายการ" / "ดูรายการ" / "pending" / "list"?
       → แสดง Carousel รายการรออนุมัติ
       ↓ ไม่ใช่
    3. Y/N อนุมัติ expense? (line_approval_pending)
```

---

## Postback Actions

| action | พารามิเตอร์ | ผล |
|---|---|---|
| `approve` | `draft_id` | อนุมัติรายการนั้น (atomic) |
| `reject` | `draft_id` | ปฏิเสธรายการนั้น (atomic) |
| `approve_all` | — | อนุมัติทุกรายการพร้อมกัน |
| `view_pending` | — | แสดง Carousel รายการรอทั้งหมด |

---

## Flow หลังอนุมัติ/ปฏิเสธ

```
Manager กด ✅/❌
    → Atomic find_one_and_update (ป้องกัน race condition)
    → บันทึก expense ลง DB
    → แจ้ง recorder ใน app (notifications collection)
    → แจ้ง recorder ทาง LINE (lineUid → push / lineNotifyToken → fallback)
    → แจ้งกลุ่ม LINE OA (notify_expense_approved)
    → ส่ง Status Card สีเขียว/แดง ให้ manager ที่กด
    → ส่ง Status Card สีเทา "ดำเนินการแล้ว" ให้ manager คนอื่นที่ยัง pending
    → ลบ pending records ทั้งหมดของ draft นี้
```

---

## Config Structure (system_settings)

```
mainLineOa:
    token, channelSecret, targetId, welcomeMessage

lineOaConfigs[]:
    id, name, token, channelSecret, targetId, welcomeMessage
```

---

## วิธีส่ง LINE

| วิธี | เงื่อนไข |
|---|---|
| Push ส่วนตัว (`lineUid`) | user add OA เป็นเพื่อนแล้ว |
| LINE Notify token | fallback ถ้าไม่มี lineUid |
| Reply (`replyToken`) | ตอบกลับ event นั้นทันที |
| Push กลุ่ม (`targetId`) | บอท join กลุ่มแล้ว |

---

## MongoDB Collections

| Collection | ใช้ทำอะไร |
|---|---|
| `line_approval_pending` | รอ manager กด Y/N expense |
| `line_user_approval_pending` | รอ IT/Admin กด Y/N สมาชิก |
| `line_login_states` | CSRF state OAuth |
| `line_login_temp` | profile ชั่วคราว 15 นาที |
| `system_settings` | เก็บ LINE OA config ทั้งหมด |

---

## อัปเดตล่าสุด (2026-04-17)

- ✅ Postback Buttons พร้อม `draft_id`
- ✅ Status Card หลังกด (เขียว/แดง/เทา)
- ✅ View Pending Carousel
- ✅ อนุมัติทั้งหมดพร้อมกัน
- ✅ แจ้ง manager คนอื่นอัตโนมัติ
- ✅ LINE Callback Fix

## ค้างอยู่

- [ ] ทดสอบ flow จริงบน dev (ต้องการ SSL)
- [ ] แก้ Dev DB แยกออกจาก Prod (`MONGO_DB` env)
- [ ] Phase 1E — Facebook/Instagram (รอ Meta Review)

---

_ดูการใช้งานใน expense: [[Expense Control]]_
_ดูการใช้งานใน auth: [[Auth & Roles]]_
_ดู future commands: [[LINE Command Center]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
