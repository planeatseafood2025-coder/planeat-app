# Auth & Roles

ระบบ Authentication และการจัดการสิทธิ์ผู้ใช้

---

## Flow การสมัครสมาชิก

```
LINE Login OAuth
    → callback → กรอกข้อมูลเพิ่มเติม
    → status: pending
    → IT/Admin รับ Flex Message ทาง LINE
    → กด ✅ อนุมัติ / ❌ ปฏิเสธ
    → แจ้งผู้สมัครกลับทาง LINE ทันที
```

> หมายเหตุ: ปิดการสมัครผ่านหน้าเว็บแล้ว — ต้องใช้ LINE Login เท่านั้น

---

## JWT Auth

- Login สำเร็จ → ได้ JWT token
- ทุก API call แนบ token ใน header
- เก็บ `lineUid` ใน users collection เพื่อส่ง push notification

---

## Roles

| Role | สิทธิ์หลัก |
|---|---|
| admin | ทุกอย่าง + อนุมัติสมาชิก |
| manager | แก้ไข expense + อนุมัติ expense |
| accounting | บันทึก/ดู expense |
| viewer | ดูได้อย่างเดียว |
| IT | อนุมัติสมาชิกใหม่ |

---

## MongoDB Collections ที่เกี่ยวข้อง

| Collection | ใช้ทำอะไร |
|---|---|
| `users` | เก็บ lineUid, status (pending/active/rejected) |
| `line_login_states` | CSRF state สำหรับ OAuth flow |
| `line_login_temp` | profile ชั่วคราว 15 นาที ระหว่างสมัคร |
| `line_user_approval_pending` | รอ IT กด Y/N อนุมัติ |

---

## ไฟล์สำคัญ

- `backend/app/routers/auth.py` — LINE Login OAuth endpoints
- `frontend/app/auth/line/callback/page.tsx` — รับ callback จาก LINE
- `frontend/app/login/page.tsx` — ปุ่ม LINE Login

---

_ดูระบบ LINE เพิ่มเติม: [[ระบบ LINE]]_
_ดูภาพรวม: [[Planeat App — ภาพรวม]]_
