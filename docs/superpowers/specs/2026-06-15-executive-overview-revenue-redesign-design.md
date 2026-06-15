# Executive Overview — Revenue-First Redesign (เลือกเดือน + เทรนด์)

**วันที่:** 2026-06-15
**สถานะ:** อนุมัติแล้ว (แนวทาง A)

---

## ปัญหา

หน้า `/crm-b2b/overview` (ภาพรวมผู้บริหาร) ปัจจุบันมีปัญหา 3 อย่าง:

1. **เนื้อหา/โครงสร้าง** — ไม่ได้โชว์สิ่งที่ผู้บริหารต้องรู้ก่อน (รายได้เทียบเป้า, สถานะ pipeline). มีตาราง executive + insight เยอะ แต่ไม่มีจุดโฟกัสด้านรายได้
2. **ข้อมูลโล่ง** — ดีลในระบบมูลค่า ฿0 ทำให้ทุก KPI เป็นศูนย์ ผู้บริหารเห็นแต่ ฿0
3. **มิติเวลา** — หน้านี้ fix ที่ `period: 'this_month'` อย่างเดียว เลือกเดือน/ดูย้อนหลังไม่ได้

## เป้าหมาย

ทำให้หน้า overview เป็น "executive cockpit" ที่:
- เน้นรายได้ก่อน (เป้า/คาดการณ์/จริง)
- เลือกช่วงเวลาได้ (เดือน/ไตรมาส/ปี) และคุมตัวเลขทั้งหน้า
- ดูเทรนด์ย้อนหลัง 12 เดือนได้
- มี empty state ชัดเจนเมื่อไม่มีข้อมูล

---

## สถาปัตยกรรม

ต่อยอดของเดิม (ไม่รื้อตาราง executive / globe / insight ที่ใช้งานได้). เพิ่ม 3 ส่วนใหม่ (period selector, revenue hero, trend chart) และทำให้ส่วนเดิมผูกกับช่วงเวลาที่เลือก.

แหล่งข้อมูลที่มีอยู่แล้ว:
- `revenueApi.getSummary(from, to)` → `{ targetThb, forecastThb, actualThb, domestic, international, deals, isClosed }`
- `revenueApi.getTargets(year)` → targets ทั้งปี
- `crmB2bApi.getExecutiveDashboard({ period })` → KPI + executive rows (ปัจจุบันรับ `this_month|this_quarter|ytd`)

ของใหม่ที่ต้องเพิ่ม:
- Backend: `_is_in_period` รองรับ `mode='month'` + `year/month`
- Backend: dashboard router รับ query `year`, `month`
- Backend: endpoint ใหม่ `GET /api/crm/revenue/trend?year=`
- Frontend: PeriodSelector, RevenueHero, TrendChart + wire period state
- Frontend: `revenueApi.getTrend(year)`, `getExecutiveDashboard` รับ year/month

---

## รายละเอียดแต่ละส่วน

### 1. แถบเลือกช่วงเวลา (PeriodSelector)

อยู่บนสุดของหน้า (เหนือ KPI cards). คุมตัวเลขทั้งหน้า.

- State บน overview:
  ```ts
  type Period = { mode: 'month' | 'quarter' | 'ytd'; year: number; month: number }
  // default = เดือนปัจจุบัน { mode: 'month', year, month }
  ```
- UI: ปุ่ม `เดือนนี้` · `ไตรมาสนี้` · `ปีนี้` + dropdown ปี (ย้อนหลัง 3 ปี) + dropdown เดือน (1-12, แสดงเมื่อ mode='month')
- เปลี่ยนค่า → trigger refetch ทั้ง dashboard + revenue summary
- ธีม: ขาวตาม CRM (`background:#fff, border:1px solid #e2e8f0, borderRadius:14`); ปุ่ม active = `#0f172a`/ขาว

### 2. Hero รายได้ (RevenueHero)

การ์ดเด่นเต็มแถว แสดงรายได้ของช่วงที่เลือก. แทนการ์ดรายได้ 2 ใบที่เคยเอาออกไป.

- 3 ช่อง: **เป้า** (amber `#d97706`) · **คาดการณ์** (blue `#2563eb`) · **จริง** (green `#16a34a`)
- แต่ละช่อง: ค่าเงิน (fmtTHB) + % เทียบเป้า + progress bar
- progress bar: track `#f1f5f9`, fill สีตามช่อง, `width = min(100, pct)`
- ข้อมูล: `revenueApi.getSummary(from, to)` ของช่วงที่เลือก
- กรณี mode='quarter'/'ytd': รวม summary หลายเดือน (เรียก getSummary ด้วย from/to ของทั้งช่วง — endpoint รับ range อยู่แล้ว)

### 3. กราฟเทรนด์ (TrendChart)

SVG วาดเอง (ไม่ลง chart library) แสดง 12 เดือนของปีที่เลือก.

- 2 series: **เป้า** (เส้น `#d97706`) vs **รายได้จริง** (แท่ง `#16a34a`)
- แกน X = ม.ค.–ธ.ค., แกน Y = บาท (auto scale จากค่าสูงสุด)
- hover แต่ละเดือน → tooltip แสดง เป้า/จริง/คาดการณ์
- เดือนที่เลือกอยู่ใน period → highlight (แท่งเข้มขึ้น/มีเส้นกรอบ)
- ข้อมูล: endpoint ใหม่ `GET /api/crm/revenue/trend?year=` (ยิงครั้งเดียวต่อปี)

**Endpoint `GET /api/crm/revenue/trend?year=`**
Response:
```json
{
  "year": 2026,
  "months": [
    { "month": 1, "targetThb": 0, "forecastThb": 0, "actualThb": 0 },
    ... (12 รายการ)
  ]
}
```
Logic ต่อเดือน:
- `targetThb` = จาก `revenue_targets` (year, month)
- `forecastThb` = sum `forecastAmount` ของดีลที่ stage ∉ (won, lost) และ `forecastDate` อยู่ในเดือนนั้น
- `actualThb` = sum `actualAmount` ของดีลที่ stage == won และ `actualReceivedAt` อยู่ในเดือนนั้น

(สอดคล้องกับ logic ใน `/summary` ที่ทำไว้แล้ว — forecast=pipeline, actual=won)

### 4. ส่วนปฏิบัติการ (ผูกกับช่วงที่เลือก)

- การ์ด KPI 4 ตัวเดิม (pipeline / won / overdue / stalled) — ดึงจาก dashboard ที่ส่ง year/month
- ตาราง executive (country/customer/stalled/followup) + insight cards + กิจกรรม/งานติดตาม — คงไว้ ผูกกับ period เดียวกัน
- Backend `_is_in_period`: เพิ่มกรณี
  ```python
  if period == "month":
      y = int(filters.get("year") or now.year)
      m = int(filters.get("month") or now.month)
      return date_value.year == y and date_value.month == m
  ```
  และ dashboard router ส่ง `period="month"` + `year`/`month` เมื่อ frontend เลือกเดือนเจาะจง (this_quarter/ytd ของเดิมคงไว้)

### 5. Empty state

เมื่อช่วงที่เลือกไม่มีดีล/รายได้ (target=forecast=actual=0 และไม่มี executive rows):
- แสดงการ์ด "ยังไม่มีข้อมูลของ [ชื่อเดือน ปี]" + ข้อความแนะนำ: กรอกมูลค่า/forecast ในดีล หรือกดปุ่มเปิดเดโม (ปุ่มเดโมมีอยู่แล้ว)
- Revenue hero ยังแสดง (เป็น ฿0 พร้อม progress ว่าง) ไม่ซ่อน เพื่อความสม่ำเสมอ

---

## ไฟล์ที่แก้

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `backend/app/services/crm_dashboard_service.py` | `_is_in_period` รองรับ `period='month'` + year/month |
| `backend/app/routers/crm_b2b.py` | endpoint executive dashboard รับ query `year`, `month`, `period` |
| `backend/app/routers/crm_revenue.py` | เพิ่ม `GET /trend?year=` |
| `frontend/app/(app)/crm-b2b/overview/page.tsx` | PeriodSelector + RevenueHero + TrendChart + wire period state เข้า fetch ทั้งหมด |
| `frontend/lib/api.ts` | `revenueApi.getTrend(year)`; `getExecutiveDashboard` รับ `{ year, month, period }` |

---

## นอกขอบเขต (YAGNI)

- สกุลเงินอื่นนอกจาก THB
- สิทธิ์การมองเห็นรายบุคคล/ราย role (admin เห็นทั้งหมดเหมือนเดิม)
- Export PDF/Excel
- Funnel ดีลตาม stage (อาจเพิ่มภายหลัง)

---

## ความเสี่ยง / หมายเหตุ

- VPS มีโค้ดใหม่กว่า local — ก่อน SCP ต้องเทียบไฟล์ปลายทางก่อนเสมอ (ดู memory `project_vps_ahead_of_local`)
- `getSummary` สำหรับ quarter/ytd ต้องส่ง from/to ครอบทั้งช่วง — endpoint รองรับ range อยู่แล้ว แต่ field `targetThb`/`isClosed` ใน summary อิงเดือนเดียว (month ของ from_date); สำหรับ quarter/ytd ให้ใช้ trend มารวมเป้าแทน หรือแสดงเฉพาะ actual/forecast รวม (รายละเอียดจัดการในแผน implementation)
