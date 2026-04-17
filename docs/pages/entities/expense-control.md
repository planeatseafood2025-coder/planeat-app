---
title: Expense Control
type: entity
tags: [expense, api, frontend]
updated: 2026-04-17
sources: [CLAUDE.md]
---

# Expense Control — ระบบบันทึกรายจ่าย

## หน้าหลัก
`frontend/app/(app)/expense-control/page.tsx`

มี 4 tabs:

### OverviewTab
- แสดงสรุปงบประมาณ
- Top 5 หมวดหมู่
- กรอง category ได้

### DailyTab
- บันทึกรายจ่ายรายวัน
- ปุ่ม Refresh

### HistoryTab
- ดูประวัติรายจ่าย
- แก้ไขรายการ (เฉพาะ manager)
- ส่ง LINE Notify

### CategoryManagerTab
- จัดการหมวดหมู่
- เติมฟิลด์อัตโนมัติเมื่อเปลี่ยนสูตร
- ฟิลด์ "ชื่อรายการ" ในค่าเริ่มต้นทุกสูตร
- ล็อคหน่วยนับสำหรับยอดเงิน/ค่าคงที่ (แก้ได้แค่จำนวน)

---

## Backend Endpoints

| Method | Path | สิทธิ์ | หมายเหตุ |
|--------|------|--------|---------|
| `PUT` | `/api/expenses/{id}` | manager เท่านั้น | แก้ไขรายการ |
| `POST` | `/api/notifications/line-notify` | — | ส่ง LINE Notify |

---

## PDF Report
- รูปแบบ landscape A4
- ใช้ Thai font
- รายวัน / รายสัปดาห์ / รายเดือน
- เก็บไว้ใน Docker Volume `pdf_data`

---

## Related
- [[categories]] — หมวดหมู่ expense
- [[roles]] — สิทธิ์แก้ไข (ACCOUNTING_ROLES)
- [[line-system]] — LINE Notify integration
- [[overview]] — ภาพรวมระบบ
