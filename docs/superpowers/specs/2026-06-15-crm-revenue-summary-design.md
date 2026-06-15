# CRM Revenue Summary — Design Spec
**วันที่:** 2026-06-15  
**สถานะ:** อนุมัติแล้ว

---

## ภาพรวม

สร้างระบบสรุปรายได้ใน CRM B2B ที่ตอบคำถามว่า "เดือนนี้บริษัทได้รายได้เท่าไร" โดยแยกระหว่าง รายได้คาดการณ์ (จาก deal ใน pipeline) และ รายได้จริง (จาก deal ที่รับเงินแล้ว) เปรียบเทียบกับเป้าที่ Admin ตั้งไว้ รองรับการดูย้อนหลังและการปิดรอบเดือน

---

## โครงสร้างข้อมูล (Backend)

### Collection ใหม่: `revenue_targets`
```json
{
  "year": 2026,
  "month": 6,
  "targetThb": 500000,
  "domesticTargetThb": 300000,
  "internationalTargetThb": 200000,
  "isClosed": false,
  "closedAt": null,
  "closedActualThb": null,
  "closedBy": null,
  "createdAt": "2026-06-01T00:00:00Z",
  "updatedAt": "2026-06-01T00:00:00Z"
}
```

### ฟิลด์ที่ต้องตรวจสอบใน `crm_deals_b2b`
ฟิลด์เหล่านี้มีใน model แล้วแต่ UI ยังไม่ได้รองรับการกรอก:
- `actualReceivedAt` — วันที่รับเงินจริง (ISO string)
- `actualAmount` — ยอดที่รับจริง (THB)
- `actualMonthKey` — เช่น "2026-06"
- `forecastAmount` — ยอดคาดการณ์ (THB)
- `forecastMonthKey` — เช่น "2026-06"
- `marketType` — "domestic" | "international"
- `revenueStatus` — "pending" | "partial" | "received"

---

## API ใหม่

### 1. สรุปรายได้ตาม date range
```
GET /api/crm/revenue/summary?from=2026-06-01&to=2026-06-30
```
Response:
```json
{
  "from": "2026-06-01",
  "to": "2026-06-30",
  "targetThb": 500000,
  "forecastThb": 320000,
  "actualThb": 180000,
  "domestic": { "forecastThb": 200000, "actualThb": 120000 },
  "international": { "forecastThb": 120000, "actualThb": 60000 },
  "deals": [ ... ],
  "isClosed": false
}
```

### 2. ตั้ง/แก้เป้ารายเดือน (Admin only)
```
POST /api/crm/revenue/targets
Body: { year, month, targetThb, domesticTargetThb, internationalTargetThb }
```

### 3. ปิดรอบเดือน (Admin only)
```
POST /api/crm/revenue/close-month
Body: { year, month, closedActualThb }
```

### 4. ดึงเป้ารายเดือน
```
GET /api/crm/revenue/targets?year=2026
```

---

## Frontend

### หน้า Overview (แก้ไขของเดิม)
เพิ่ม banner สรุปเดือนปัจจุบันด้านบนสุด:
```
🎯 เป้า ฿500K  |  📈 คาดการณ์ ฿320K  |  ✅ จริง ฿180K  →  [ดูรายละเอียด]
```

### หน้าใหม่: `/crm-b2b/revenue`
**ส่วน 1 — เลือกช่วงเวลา**
- ปุ่ม preset 12 เดือน (ม.ค.–ธ.ค.) + ปีปัจจุบัน
- date picker "กำหนดเอง" สำหรับ range อิสระ

**ส่วน 2 — KPI Cards**
- เป้ารายได้ (สีขาว)
- รายได้คาดการณ์ (สีน้ำเงิน) พร้อม % เทียบเป้า
- รายได้จริง (สีเขียว) พร้อม % เทียบเป้า
- Progress bar แสดง 2 ค่าซ้อนกัน

**ส่วน 3 — ตารางแยก domestic/international**
| ตลาด | คาดการณ์ | จริง | % ของเป้า |
|------|----------|------|-----------|
| ในประเทศ | ฿200K | ฿120K | 24% |
| ต่างประเทศ | ฿120K | ฿60K | 12% |
| รวม | ฿320K | ฿180K | 36% |

**ส่วน 4 — รายการ Deal**
แสดง deal ที่มี `actualReceivedAt` หรือ `forecastDate` อยู่ในช่วง range ที่เลือก พร้อม status badge (รับเงินแล้ว / คาดการณ์)

**ส่วน 5 — ปิดรอบเดือน (Admin เท่านั้น)**
- ปุ่ม "ปิดรอบเดือน [ชื่อเดือน]"
- กรอก closedActualThb ยืนยัน
- หลังปิดแล้วข้อมูลถูกล็อก แสดง badge "ปิดรอบแล้ว"

### Sidebar
เพิ่มเมนู "สรุปรายได้" ใต้ CRM B2B

---

## สิทธิ์

| action | role |
|--------|------|
| ดูหน้าสรุปรายได้ | ทุก role ใน CRM |
| ตั้งเป้ารายเดือน | admin |
| ปิดรอบเดือน | admin |

---

## ลำดับการทำงาน

1. Backend: สร้าง router `crm_revenue.py` + model `revenue_target.py`
2. Backend: เชื่อม router เข้า main.py
3. Frontend: สร้างหน้า `/crm-b2b/revenue/page.tsx`
4. Frontend: เพิ่ม banner ใน overview
5. Frontend: เพิ่ม sidebar link
6. Frontend: เพิ่ม UI กรอก actualReceivedAt ใน deal modal
