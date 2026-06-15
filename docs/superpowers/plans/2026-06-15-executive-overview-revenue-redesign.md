# Executive Overview Revenue-First Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้หน้า `/crm-b2b/overview` เป็น executive cockpit ที่เน้นรายได้ เลือกช่วงเวลาได้ และมีกราฟเทรนด์ย้อนหลัง 12 เดือน

**Architecture:** ต่อยอดของเดิม (ตาราง executive / globe / insight คงไว้) เพิ่ม period selector + revenue hero + trend chart และทำให้ทุกส่วนผูกกับช่วงเวลาที่เลือก. Backend ขยาย `_is_in_period` ให้รับ month + เพิ่ม endpoint `/trend`. Frontend เพิ่ม state `period` คุม fetch ทั้งหมด.

**Tech Stack:** FastAPI + Motor (backend, port 8001), Next.js 14 App Router + TypeScript inline styles (frontend, port 3001), pytest/unittest (backend tests), SVG วาดเอง (ไม่ลง chart library)

**สำคัญมาก:** VPS มีโค้ดใหม่กว่า local repo (ดู memory `project_vps_ahead_of_local`). ต้อง sync ไฟล์ที่จะแก้จาก VPS → local ก่อนเสมอ (Task 0) มิฉะนั้น SCP กลับจะทับโค้ด VPS ที่ใหม่กว่าและทำ backend พัง.

VPS: `ssh -i ~/.ssh/planeat-vps root@76.13.211.161`, path `/root/planeat-app` (absolute — tilde ขยายฝั่ง local). Deploy ใช้ `docker compose` (v2, ไม่มี dash).

---

## File Structure

| ไฟล์ | ความรับผิดชอบ |
|------|----------------|
| `backend/app/services/crm_dashboard_service.py` | เพิ่ม `period='month'` ใน `_is_in_period` |
| `backend/app/routers/crm_b2b.py` | endpoint `/executive-dashboard` รับ `year`, `month` |
| `backend/app/routers/crm_revenue.py` | เพิ่ม `compute_revenue_trend()` (pure) + endpoint `GET /trend` |
| `backend/tests/test_crm_dashboard_service.py` | เพิ่ม test `_is_in_period` month mode |
| `backend/tests/test_crm_revenue_trend.py` | (สร้างใหม่) test `compute_revenue_trend` |
| `frontend/lib/api.ts` | `revenueApi.getTrend(year)` + `getExecutiveDashboard` รับ year/month |
| `frontend/components/crm/RevenueTrendChart.tsx` | (สร้างใหม่) SVG กราฟเทรนด์ |
| `frontend/app/(app)/crm-b2b/overview/page.tsx` | PeriodSelector + RevenueHero + period state + empty state + ใช้ TrendChart |

---

## Task 0: Sync VPS-current files to local (กันทับโค้ดใหม่)

**Files:**
- Overwrite local จาก VPS: 5 ไฟล์ด้านล่าง

- [ ] **Step 1: ดึงไฟล์ปัจจุบันจาก VPS มา local**

```bash
cd "c:/Users/hot/Desktop/planeat-app"
K=~/.ssh/planeat-vps; H=root@76.13.211.161; B=/root/planeat-app
scp -i $K $H:$B/backend/app/routers/crm_b2b.py backend/app/routers/crm_b2b.py
scp -i $K $H:$B/backend/app/services/crm_dashboard_service.py backend/app/services/crm_dashboard_service.py
scp -i $K $H:$B/backend/app/routers/crm_revenue.py backend/app/routers/crm_revenue.py
scp -i $K $H:$B/frontend/lib/api.ts frontend/lib/api.ts
scp -i $K "$H:$B/frontend/app/(app)/crm-b2b/overview/page.tsx" "frontend/app/(app)/crm-b2b/overview/page.tsx"
echo SYNCED
```

Expected: พิมพ์ `SYNCED`

- [ ] **Step 2: ยืนยันว่า local มีโค้ดใหม่แล้ว**

Run:
```bash
grep -c "build_account_update_payload" backend/app/models/crm_b2b.py
grep -c "executive-dashboard" backend/app/routers/crm_b2b.py
grep -c "_is_in_period" backend/app/services/crm_dashboard_service.py
```
Expected: แต่ละบรรทัดคืนค่า ≥ 1

- [ ] **Step 3: Commit baseline**

```bash
git add backend/app/routers/crm_b2b.py backend/app/services/crm_dashboard_service.py backend/app/routers/crm_revenue.py frontend/lib/api.ts "frontend/app/(app)/crm-b2b/overview/page.tsx"
git commit -m "chore(crm): sync VPS-current files to local before overview redesign"
```

---

## Task 1: Backend — `_is_in_period` รองรับ month mode

**Files:**
- Modify: `backend/app/services/crm_dashboard_service.py` (ฟังก์ชัน `_is_in_period`)
- Test: `backend/tests/test_crm_dashboard_service.py`

- [ ] **Step 1: เขียน test ที่ fail**

เพิ่ม import และ test method ใน `backend/tests/test_crm_dashboard_service.py`:

แก้บรรทัด import ด้านบนไฟล์เป็น:
```python
from app.services.crm_dashboard_service import (
    derive_account_business_fields,
    get_account_health,
    is_stalled_deal,
    _is_in_period,
)
```

เพิ่ม method นี้ในคลาส `CrmDashboardServiceTests`:
```python
    def test_is_in_period_month_mode_matches_specific_month(self):
        now = datetime(2026, 6, 15, tzinfo=timezone.utc)
        doc = {"stageUpdatedAt": "2026-03-10T00:00:00+00:00"}

        self.assertTrue(
            _is_in_period(doc, {"period": "month", "year": "2026", "month": "3"}, now)
        )
        self.assertFalse(
            _is_in_period(doc, {"period": "month", "year": "2026", "month": "6"}, now)
        )
        # ไม่ส่ง year/month → fallback เป็นเดือนปัจจุบัน (now=มิ.ย.) จึงไม่แมตช์ มี.ค.
        self.assertFalse(_is_in_period(doc, {"period": "month"}, now))
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd backend && python -m pytest tests/test_crm_dashboard_service.py::CrmDashboardServiceTests::test_is_in_period_month_mode_matches_specific_month -v`
Expected: FAIL (period `month` ยังไม่รองรับ → คืน `True` ผ่าน `return True` ท้ายฟังก์ชัน ทำให้ assertFalse แรก fail)

- [ ] **Step 3: เพิ่มกรณี month ใน `_is_in_period`**

ใน `backend/app/services/crm_dashboard_service.py` หา block นี้:
```python
    if period == "ytd":
        return date_value.year == now.year
    return True
```
แก้เป็น:
```python
    if period == "ytd":
        return date_value.year == now.year
    if period == "month":
        year = int(filters.get("year") or now.year)
        month = int(filters.get("month") or now.month)
        return date_value.year == year and date_value.month == month
    return True
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd backend && python -m pytest tests/test_crm_dashboard_service.py -v`
Expected: PASS ทุก test

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/crm_dashboard_service.py backend/tests/test_crm_dashboard_service.py
git commit -m "feat(crm-dashboard): support explicit month period in _is_in_period"
```

---

## Task 2: Backend — endpoint executive-dashboard รับ year/month

**Files:**
- Modify: `backend/app/routers/crm_b2b.py` (ฟังก์ชัน `executive_dashboard`, ราว ๆ บรรทัด 224-239)

- [ ] **Step 1: เพิ่ม query params year/month**

หา endpoint นี้:
```python
@router.get("/executive-dashboard")
async def executive_dashboard(
    marketScope: str = Query("all"),
    country: str = Query("all"),
    owner: str = Query("all"),
    period: str = Query("this_month"),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    filters = {
        "marketScope": marketScope,
        "country": country,
        "owner": owner,
        "period": period,
    }
    return await get_executive_dashboard(db, filters)
```
แก้เป็น:
```python
@router.get("/executive-dashboard")
async def executive_dashboard(
    marketScope: str = Query("all"),
    country: str = Query("all"),
    owner: str = Query("all"),
    period: str = Query("this_month"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    filters = {
        "marketScope": marketScope,
        "country": country,
        "owner": owner,
        "period": period,
    }
    if year is not None:
        filters["year"] = str(year)
    if month is not None:
        filters["month"] = str(month)
    return await get_executive_dashboard(db, filters)
```

(หมายเหตุ: `Optional` ถูก import อยู่แล้วใน router นี้ — ยืนยันด้วย `grep -n "from typing import" backend/app/routers/crm_b2b.py`. ถ้าไม่มี ให้เพิ่ม `from typing import Optional`)

- [ ] **Step 2: ยืนยัน syntax ถูกต้อง (compile)**

Run: `cd backend && python -c "import ast; ast.parse(open('app/routers/crm_b2b.py', encoding='utf-8').read()); print('OK')"`
Expected: พิมพ์ `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/crm_b2b.py
git commit -m "feat(crm-dashboard): executive-dashboard endpoint accepts year/month"
```

---

## Task 3: Backend — revenue trend helper + endpoint

**Files:**
- Modify: `backend/app/routers/crm_revenue.py`
- Test: `backend/tests/test_crm_revenue_trend.py` (สร้างใหม่)

- [ ] **Step 1: เขียน test ที่ fail**

สร้างไฟล์ `backend/tests/test_crm_revenue_trend.py`:
```python
import unittest

from app.routers.crm_revenue import compute_revenue_trend


class ComputeRevenueTrendTests(unittest.TestCase):
    def test_splits_forecast_and_actual_by_month(self):
        targets = [{"month": 6, "targetThb": 500000}]
        deals = [
            {"stage": "proposal", "forecastDate": "2026-06-10", "forecastAmount": 200000},
            {"stage": "won", "actualReceivedAt": "2026-06-20", "actualAmount": 120000},
            {"stage": "won", "actualReceivedAt": "2026-05-15", "actualAmount": 80000},
            {"stage": "lost", "forecastDate": "2026-06-01", "forecastAmount": 999999},
        ]

        months = compute_revenue_trend(2026, targets, deals)

        self.assertEqual(len(months), 12)
        june = months[5]
        self.assertEqual(june["month"], 6)
        self.assertEqual(june["targetThb"], 500000)
        self.assertEqual(june["forecastThb"], 200000)  # lost ไม่ถูกนับ
        self.assertEqual(june["actualThb"], 120000)
        self.assertEqual(months[4]["actualThb"], 80000)  # พ.ค.
        self.assertEqual(months[0]["actualThb"], 0)      # ม.ค. ว่าง

    def test_handles_missing_fields(self):
        months = compute_revenue_trend(2026, [], [{"stage": "won"}])
        self.assertEqual(months[5]["actualThb"], 0)
        self.assertEqual(months[5]["targetThb"], 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd backend && python -m pytest tests/test_crm_revenue_trend.py -v`
Expected: FAIL (`ImportError: cannot import name 'compute_revenue_trend'`)

- [ ] **Step 3: เพิ่ม `compute_revenue_trend` ใน `crm_revenue.py`**

ใน `backend/app/routers/crm_revenue.py` หลังฟังก์ชัน `_fmt_thb` (บนสุดของไฟล์) เพิ่ม:
```python
def compute_revenue_trend(year: int, targets: list, deals: list) -> list:
    """คืนข้อมูลรายเดือน 12 รายการ: เป้า/คาดการณ์/จริง
    forecast = ดีลที่ยังไม่ปิด (stage ∉ won,lost) + forecastDate ในเดือนนั้น
    actual   = ดีลที่ปิดสำเร็จ (stage == won) + actualReceivedAt ในเดือนนั้น
    """
    target_by_month = {int(t.get("month")): _fmt_thb(t.get("targetThb")) for t in targets if t.get("month")}
    months = []
    for m in range(1, 13):
        prefix = f"{year}-{m:02d}"
        forecast = 0.0
        actual = 0.0
        for d in deals:
            stage = d.get("stage", "")
            forecast_date = d.get("forecastDate") or ""
            actual_date = d.get("actualReceivedAt") or ""
            if stage not in ("won", "lost") and forecast_date.startswith(prefix):
                forecast += _fmt_thb(d.get("forecastAmount"))
            if stage == "won" and actual_date.startswith(prefix):
                actual += _fmt_thb(d.get("actualAmount"))
        months.append({
            "month": m,
            "targetThb": target_by_month.get(m, 0.0),
            "forecastThb": forecast,
            "actualThb": actual,
        })
    return months
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd backend && python -m pytest tests/test_crm_revenue_trend.py -v`
Expected: PASS ทั้ง 2 test

- [ ] **Step 5: เพิ่ม endpoint `GET /trend`**

ใน `backend/app/routers/crm_revenue.py` เพิ่ม endpoint นี้ (วางก่อน `@router.post("/targets")` หรือท้ายไฟล์ก็ได้):
```python
@router.get("/trend")
async def revenue_trend(
    year: int = Query(...),
    db=Depends(get_db),
    current=Depends(get_current_user),
):
    targets = await db.revenue_targets.find({"year": year}).to_list(length=12)
    deals = await db.crm_deals_b2b.find({}).to_list(length=5000)
    return {"year": year, "months": compute_revenue_trend(year, targets, deals)}
```

ยืนยันว่า `Query` ถูก import แล้ว (ไฟล์นี้มี `from fastapi import APIRouter, Query, Depends, HTTPException` อยู่แล้ว)

- [ ] **Step 6: ยืนยัน syntax ถูกต้อง**

Run: `cd backend && python -c "import ast; ast.parse(open('app/routers/crm_revenue.py', encoding='utf-8').read()); print('OK')"`
Expected: พิมพ์ `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/crm_revenue.py backend/tests/test_crm_revenue_trend.py
git commit -m "feat(crm-revenue): add monthly revenue trend helper and GET /trend endpoint"
```

---

## Task 4: Frontend — api.ts: getTrend + dashboard year/month

**Files:**
- Modify: `frontend/lib/api.ts` (`crmB2bApi.getExecutiveDashboard` และ `revenueApi`)

- [ ] **Step 1: เพิ่ม year/month ใน getExecutiveDashboard**

หา:
```ts
  getExecutiveDashboard: (params?: { marketScope?: string; country?: string; owner?: string; period?: string }) => {
    const p: Record<string, string> = {}
    if (params?.marketScope) p.marketScope = params.marketScope
    if (params?.country) p.country = params.country
    if (params?.owner) p.owner = params.owner
    if (params?.period) p.period = params.period
    return request('GET', '/api/crm-b2b/executive-dashboard', undefined, p)
  },
```
แก้เป็น:
```ts
  getExecutiveDashboard: (params?: { marketScope?: string; country?: string; owner?: string; period?: string; year?: number; month?: number }) => {
    const p: Record<string, string> = {}
    if (params?.marketScope) p.marketScope = params.marketScope
    if (params?.country) p.country = params.country
    if (params?.owner) p.owner = params.owner
    if (params?.period) p.period = params.period
    if (params?.year) p.year = String(params.year)
    if (params?.month) p.month = String(params.month)
    return request('GET', '/api/crm-b2b/executive-dashboard', undefined, p)
  },
```

- [ ] **Step 2: เพิ่ม getTrend ใน revenueApi**

หาใน `revenueApi` บรรทัด:
```ts
  closeMonth: (data: { year: number; month: number; closedActualThb: number }) =>
    request<{ ok: boolean }>('POST', '/api/crm/revenue/close-month', data),
}
```
แก้เป็น (เพิ่ม getTrend ก่อนปิด `}`):
```ts
  closeMonth: (data: { year: number; month: number; closedActualThb: number }) =>
    request<{ ok: boolean }>('POST', '/api/crm/revenue/close-month', data),

  getTrend: (year: number) =>
    request<{ year: number; months: Array<{ month: number; targetThb: number; forecastThb: number; actualThb: number }> }>(
      'GET', '/api/crm/revenue/trend', undefined, { year: String(year) }
    ),
}
```

- [ ] **Step 3: ยืนยัน type-check ไม่มี error ใหม่ใน api.ts**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "lib/api.ts" || echo "no api.ts errors"`
Expected: พิมพ์ `no api.ts errors`

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(api): revenueApi.getTrend + executive dashboard year/month params"
```

---

## Task 5: Frontend — RevenueTrendChart component (SVG)

**Files:**
- Create: `frontend/components/crm/RevenueTrendChart.tsx`

- [ ] **Step 1: สร้างไฟล์ component**

สร้าง `frontend/components/crm/RevenueTrendChart.tsx`:
```tsx
'use client'

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

type MonthPoint = { month: number; targetThb: number; forecastThb: number; actualThb: number }

export default function RevenueTrendChart({ months, activeMonth }: { months: MonthPoint[]; activeMonth?: number }) {
  const W = 720, H = 240, padL = 44, padR = 12, padT = 16, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(1, ...months.map((m) => Math.max(m.targetThb, m.actualThb)))
  const x = (i: number) => padL + (innerW / 12) * (i + 0.5)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const barW = (innerW / 12) * 0.5
  const targetLine = months.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(m.targetThb)}`).join(' ')

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>เทรนด์รายได้ย้อนหลัง</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2, marginRight: 4 }} />รายได้จริง</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#d97706', marginRight: 4, verticalAlign: 'middle' }} />เป้า</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 0.5, 1].map((t) => {
          const gy = padT + innerH - t * innerH
          return (
            <g key={t}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#f1f5f9" />
              <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtShort(max * t)}</text>
            </g>
          )
        })}
        {months.map((m, i) => (
          <rect key={`bar-${i}`} x={x(i) - barW / 2} y={y(m.actualThb)} width={barW} height={padT + innerH - y(m.actualThb)} rx={2}
            fill={activeMonth === m.month ? '#15803d' : '#16a34a'} opacity={activeMonth && activeMonth !== m.month ? 0.55 : 1}>
            <title>{`${MONTHS_TH[i]}: จริง ${fmtShort(m.actualThb)} · เป้า ${fmtShort(m.targetThb)} · คาดการณ์ ${fmtShort(m.forecastThb)}`}</title>
          </rect>
        ))}
        <path d={targetLine} fill="none" stroke="#d97706" strokeWidth={2} strokeDasharray="4 3" />
        {months.map((m, i) => (
          <text key={`lbl-${i}`} x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">{MONTHS_TH[i]}</text>
        ))}
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: ยืนยัน type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "RevenueTrendChart" || echo "no chart errors"`
Expected: พิมพ์ `no chart errors`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/crm/RevenueTrendChart.tsx
git commit -m "feat(crm): add RevenueTrendChart SVG component"
```

---

## Task 6: Frontend — period state + helpers + fetch wiring

**Files:**
- Modify: `frontend/app/(app)/crm-b2b/overview/page.tsx`

- [ ] **Step 1: เพิ่ม import TrendChart และ constants**

ใต้บรรทัด import ของ overview page เพิ่ม:
```tsx
import RevenueTrendChart from '@/components/crm/RevenueTrendChart'
```

ใกล้ ๆ constants อื่น (เช่นหลัง `EXECUTIVE_TABS`) เพิ่ม:
```tsx
type PeriodMode = 'month' | 'quarter' | 'ytd'
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const YEAR_NOW = new Date().getFullYear()
const YEAR_OPTIONS = [YEAR_NOW, YEAR_NOW - 1, YEAR_NOW - 2]

function periodRange(p: { mode: PeriodMode; year: number; month: number }) {
  if (p.mode === 'ytd') return { from: `${p.year}-01-01`, to: `${p.year}-12-31` }
  if (p.mode === 'quarter') {
    const q = Math.floor((p.month - 1) / 3)
    const startM = q * 3 + 1
    const endM = startM + 2
    const lastDay = new Date(p.year, endM, 0).getDate()
    return { from: `${p.year}-${String(startM).padStart(2, '0')}-01`, to: `${p.year}-${String(endM).padStart(2, '0')}-${lastDay}` }
  }
  const lastDay = new Date(p.year, p.month, 0).getDate()
  return { from: `${p.year}-${String(p.month).padStart(2, '0')}-01`, to: `${p.year}-${String(p.month).padStart(2, '0')}-${lastDay}` }
}

function dashboardParams(p: { mode: PeriodMode; year: number; month: number }) {
  if (p.mode === 'month') return { period: 'month', year: p.year, month: p.month }
  if (p.mode === 'quarter') return { period: 'this_quarter' }
  return { period: 'ytd' }
}
```

- [ ] **Step 2: เพิ่ม state period + trend**

หาบรรทัด `const [revSummary, setRevSummary] = useState<...>(null)` แล้วเพิ่มใต้มัน:
```tsx
  const [period, setPeriod] = useState<{ mode: PeriodMode; year: number; month: number }>({
    mode: 'month', year: new Date().getFullYear(), month: new Date().getMonth() + 1,
  })
  const [trend, setTrend] = useState<Array<{ month: number; targetThb: number; forecastThb: number; actualThb: number }>>([])
```

- [ ] **Step 3: แก้ `load` ให้ใช้ period และดึง trend**

แทนที่ทั้ง body ของ `const load = useCallback(async () => { ... }, [])` ด้วย:
```tsx
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = periodRange(period)
      const [overviewResponse, dashboardResponse, rev, tr] = await Promise.all([
        crmB2bApi.getOverview() as any,
        crmB2bApi.getExecutiveDashboard(dashboardParams(period)) as any,
        (revenueApi.getSummary as any)(from, to),
        (revenueApi.getTrend as any)(period.year),
      ])
      setData(overviewResponse)
      setDashboard(dashboardResponse)
      setRevSummary(rev)
      setTrend(tr?.months || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [period])
```

(ลบ block try/catch เดิมที่ดึง revenue summary แยก เพราะรวมเข้า Promise.all แล้ว — ยืนยันว่าไม่มี `revenueApi.getSummary` ซ้ำสองที่)

- [ ] **Step 4: ยืนยัน type-check ไม่มี error ใหม่**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "overview/page.tsx" || echo "no overview errors"`
Expected: `no overview errors` (หมายเหตุ: error ที่มีอยู่เดิมก่อนหน้านี้ของไฟล์อื่นไม่นับ — ดูเฉพาะ overview/page.tsx)

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/crm-b2b/overview/page.tsx"
git commit -m "feat(crm-overview): add period state and wire fetches to selected period"
```

---

## Task 7: Frontend — PeriodSelector + RevenueHero + TrendChart + empty state UI

**Files:**
- Modify: `frontend/app/(app)/crm-b2b/overview/page.tsx`

- [ ] **Step 1: เพิ่ม RevenueHero component (local)**

ก่อน `export default function CrmOverviewPage()` เพิ่ม component:
```tsx
function RevenueHero({ target, forecast, actual }: { target: number; forecast: number; actual: number }) {
  const cell = (label: string, value: number, color: string) => {
    const p = target ? Math.min(100, Math.round((value / target) * 100)) : 0
    return (
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{fmtTHB(value)}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 8px' }}>{target ? `${p}% ของเป้า` : 'ยังไม่ตั้งเป้า'}</div>
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 20, marginBottom: 18, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>เป้ารายได้</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{fmtTHB(target)}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>ตั้งโดย Admin</div>
      </div>
      {cell('รายได้คาดการณ์', forecast, '#2563eb')}
      {cell('รายได้จริง', actual, '#16a34a')}
    </div>
  )
}
```

- [ ] **Step 2: เพิ่ม PeriodSelector + RevenueHero + TrendChart + empty state ในหน้า**

ใน return ของ `CrmOverviewPage`, ภายใน block หลัง loading (`) : (` แล้วก่อน demo banner / KPI grid), ใส่ตัวแปร derived ก่อน return (วางใกล้ ๆ `displayStats`):
```tsx
  const periodLabel =
    period.mode === 'month'
      ? `${MONTHS_TH[period.month - 1]} ${period.year + 543}`
      : period.mode === 'quarter'
        ? `ไตรมาสปัจจุบัน`
        : `ปี ${period.year + 543}`
  const noData =
    !!revSummary &&
    revSummary.targetThb === 0 &&
    revSummary.forecastThb === 0 &&
    revSummary.actualThb === 0 &&
    executive.countryRows.length === 0
```

จากนั้น **เหนือ** `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', ...}}>` (KPI cards) ใส่:
```tsx
          {/* Period selector */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
              {([['month', 'รายเดือน'], ['quarter', 'ไตรมาส'], ['ytd', 'ทั้งปี']] as [PeriodMode, string][]).map(([m, label]) => (
                <button key={m} onClick={() => setPeriod((prev) => ({ ...prev, mode: m }))} style={{ ...buttonBase, background: period.mode === m ? '#0f172a' : 'transparent', color: period.mode === m ? '#fff' : '#334155' }}>
                  {label}
                </button>
              ))}
            </div>
            <select value={period.year} onChange={(e) => setPeriod((prev) => ({ ...prev, year: Number(e.target.value) }))} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, outline: 'none' }}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{`ปี ${y + 543}`}</option>)}
            </select>
            {period.mode === 'month' && (
              <select value={period.month} onChange={(e) => setPeriod((prev) => ({ ...prev, month: Number(e.target.value) }))} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, outline: 'none' }}>
                {MONTHS_TH.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
              </select>
            )}
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>กำลังดู: {periodLabel}</span>
          </div>

          {/* Revenue hero */}
          <RevenueHero target={revSummary?.targetThb || 0} forecast={revSummary?.forecastThb || 0} actual={revSummary?.actualThb || 0} />

          {/* Trend chart */}
          <RevenueTrendChart months={trend} activeMonth={period.mode === 'month' ? period.month : undefined} />

          {/* Empty state */}
          {noData && !demoPreview && (
            <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 14, padding: 20, marginBottom: 18, textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>ยังไม่มีข้อมูลของ {periodLabel}</div>
              <div style={{ fontSize: 12 }}>กรอกมูลค่า/ยอดคาดการณ์ในดีล หรือปัดดีลเป็น won เพื่อให้ตัวเลขขึ้น — หรือกดปุ่ม “เปิดตัวอย่างเดโม” ด้านบนเพื่อดูภาพรวมตัวอย่าง</div>
            </div>
          )}
```

(หมายเหตุ: `buildExecutiveRows` ถูกเรียกเป็น `executive` อยู่แล้วก่อน return — `executive.countryRows` ใช้ได้. `fmtTHB` และ `buttonBase` มีอยู่แล้วใน scope)

- [ ] **Step 3: type-check + build**

Run:
```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "overview/page.tsx" || echo "no overview errors"
```
Expected: `no overview errors`

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(app)/crm-b2b/overview/page.tsx"
git commit -m "feat(crm-overview): add period selector, revenue hero, trend chart, empty state"
```

---

## Task 8: Deploy to VPS + verify (ต้องขออนุญาตผู้ใช้ก่อน deploy)

**Files:** ไม่มีการแก้โค้ด — เป็นขั้น deploy

> **GATE:** ห้าม deploy ก่อนได้รับคำสั่งชัดเจนจากผู้ใช้ (ดู memory `feedback_vps_deploy`).

- [ ] **Step 1: เทียบไฟล์ปลายทางก่อน SCP (กันทับของใหม่บน VPS)**

Run (ตรวจว่าไฟล์ที่จะทับไม่มีโค้ด VPS-only ที่ local ขาด):
```bash
K=~/.ssh/planeat-vps; H=root@76.13.211.161; B=/root/planeat-app
for f in backend/app/services/crm_dashboard_service.py backend/app/routers/crm_b2b.py backend/app/routers/crm_revenue.py frontend/lib/api.ts "frontend/app/(app)/crm-b2b/overview/page.tsx"; do
  echo "=== $f ==="; ssh -i $K $H "cd $B && git diff --stat -- \"$f\""; done
```
Expected: ไม่มี diff แปลกปลอม (ไฟล์ตรงกับ baseline ที่ sync มาใน Task 0). ถ้ามี diff ที่ไม่รู้จัก → หยุด แล้ว merge ด้วยมือก่อน

- [ ] **Step 2: SCP 7 ไฟล์ขึ้น VPS**

```bash
cd "c:/Users/hot/Desktop/planeat-app"
K=~/.ssh/planeat-vps; H=root@76.13.211.161; B=/root/planeat-app
scp -i $K backend/app/services/crm_dashboard_service.py $H:$B/backend/app/services/crm_dashboard_service.py
scp -i $K backend/app/routers/crm_b2b.py $H:$B/backend/app/routers/crm_b2b.py
scp -i $K backend/app/routers/crm_revenue.py $H:$B/backend/app/routers/crm_revenue.py
scp -i $K backend/tests/test_crm_dashboard_service.py $H:$B/backend/tests/test_crm_dashboard_service.py
scp -i $K backend/tests/test_crm_revenue_trend.py $H:$B/backend/tests/test_crm_revenue_trend.py
scp -i $K frontend/lib/api.ts $H:$B/frontend/lib/api.ts
scp -i $K frontend/components/crm/RevenueTrendChart.tsx $H:$B/frontend/components/crm/RevenueTrendChart.tsx
scp -i $K "frontend/app/(app)/crm-b2b/overview/page.tsx" "$H:$B/frontend/app/(app)/crm-b2b/overview/page.tsx"
echo DEPLOYED_FILES
```
Expected: `DEPLOYED_FILES`

- [ ] **Step 3: rebuild + restart ทั้ง backend และ frontend**

```bash
ssh -i ~/.ssh/planeat-vps root@76.13.211.161 "cd /root/planeat-app && docker compose build --no-cache backend frontend && docker compose up -d backend frontend"
```
Expected: build เสร็จ, container `Started`

- [ ] **Step 4: verify health + endpoints**

```bash
ssh -i ~/.ssh/planeat-vps root@76.13.211.161 "cd /root/planeat-app && sleep 8 && docker compose ps --format '{{.Name}} {{.Status}}' && curl -s -o /dev/null -w 'frontend:%{http_code}\n' http://localhost:3001/ && curl -s -o /dev/null -w 'trend:%{http_code}\n' 'http://localhost:8001/api/crm/revenue/trend?year=2026' -H 'Authorization: Bearer x'"
```
Expected: ทุก container `healthy`/`Up`, `frontend:200`, `trend:401` (route ทำงาน ต้อง auth — ไม่ใช่ 404/500)

- [ ] **Step 5: แจ้งผู้ใช้ให้ทดสอบจริง**

แจ้ง URL `https://planeatsupport.duckdns.org/crm-b2b/overview` — ลองสลับเดือน/ไตรมาส/ปี และดูว่า hero, กราฟเทรนด์, ตาราง อัปเดตตามช่วงเวลา

---

## Self-Review Notes (ผู้เขียนแผนตรวจแล้ว)

- **Spec coverage:** period selector (Task 6,7) ✓ · revenue hero (Task 7) ✓ · trend chart + endpoint (Task 3,5,7) ✓ · period-aware dashboard (Task 1,2,6) ✓ · empty state (Task 7) ✓ · ไฟล์ตรงกับตารางใน spec ✓
- **VPS-ahead risk:** จัดการด้วย Task 0 (sync ก่อนแก้) + Task 8 Step 1 (เทียบก่อนทับ) ✓
- **Type consistency:** `compute_revenue_trend(year, targets, deals)` ใช้ชื่อตรงกันใน Task 3 (helper, endpoint, test) · `getTrend(year)` → `{ months: [...] }` ตรงกันใน Task 4 (api), Task 5 (chart props `months`), Task 6 (`setTrend(tr.months)`) · `period` shape `{mode, year, month}` ตรงกันทุก task ✓
- **Quarter/YTD limitation:** backend `this_quarter`/`ytd` อิง `now` (ช่วงปัจจุบันเท่านั้น) — ตรงตาม spec ที่ระบุ month เป็นมิติย้อนหลังหลัก; year dropdown มีผลกับ month + trend เป็นหลัก ✓
