# CRM Revenue Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างระบบสรุปรายได้ใน CRM B2B แสดงเป้า/คาดการณ์/จริง แยก domestic/international รองรับ date range และปิดรอบเดือน

**Architecture:** Backend เพิ่ม router `/api/crm/revenue` ใหม่ + collection `revenue_targets` ใน MongoDB. Frontend สร้างหน้า `/crm-b2b/revenue` และเพิ่ม banner ใน overview. API ดึง deal ที่มี `forecastDate` หรือ `actualReceivedAt` อยู่ใน range ที่เลือก แล้วสรุปยอด THB แยก marketType.

**Tech Stack:** FastAPI + Motor (async MongoDB), Next.js 14 App Router, TypeScript, Tailwind CSS

---

## File Map

**สร้างใหม่:**
- `backend/app/models/revenue_target.py` — Pydantic models สำหรับ revenue target
- `backend/app/routers/crm_revenue.py` — API endpoints 4 ตัว
- `frontend/app/(app)/crm-b2b/revenue/page.tsx` — หน้าสรุปรายได้เต็มรูปแบบ

**แก้ไขของเดิม:**
- `backend/app/main.py` — import และ include router ใหม่
- `frontend/lib/api.ts` — เพิ่ม revenueApi object
- `frontend/app/(app)/crm-b2b/overview/page.tsx` — เพิ่ม revenue banner
- `frontend/components/layout/Sidebar.tsx` — เพิ่มเมนู "สรุปรายได้"

---

## Task 1: Backend Model — revenue_target.py

**Files:**
- Create: `backend/app/models/revenue_target.py`

- [ ] **Step 1: สร้างไฟล์ model**

```python
# backend/app/models/revenue_target.py
from pydantic import BaseModel
from typing import Optional


class RevenueTargetUpsert(BaseModel):
    year: int
    month: int  # 1-12
    targetThb: float = 0
    domesticTargetThb: float = 0
    internationalTargetThb: float = 0


class CloseMonthRequest(BaseModel):
    year: int
    month: int
    closedActualThb: float
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/revenue_target.py
git commit -m "feat(crm-revenue): add revenue target pydantic models"
```

---

## Task 2: Backend Router — crm_revenue.py

**Files:**
- Create: `backend/app/routers/crm_revenue.py`

- [ ] **Step 1: สร้าง router พร้อม 4 endpoints**

```python
# backend/app/routers/crm_revenue.py
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query, Depends, HTTPException
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models.revenue_target import RevenueTargetUpsert, CloseMonthRequest

router = APIRouter(prefix="/api/crm/revenue", tags=["crm-revenue"])


def _fmt_thb(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


@router.get("/summary")
async def get_revenue_summary(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    db=Depends(get_db),
    current=Depends(get_current_user),
):
    """
    ดึงสรุปรายได้ในช่วง from–to (ISO date string เช่น 2026-06-01)
    - forecastThb: รวม forecastAmount ของ deal ที่ forecastDate อยู่ใน range
    - actualThb: รวม actualAmount ของ deal ที่ actualReceivedAt อยู่ใน range
    - แยก domestic / international ตาม marketType
    """
    from_dt = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
    to_dt = datetime.fromisoformat(to_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    # ดึง deal ที่ forecastDate หรือ actualReceivedAt อยู่ใน range
    deals_cursor = db.crm_deals_b2b.find({
        "$or": [
            {"forecastDate": {"$gte": from_date, "$lte": to_date}},
            {"actualReceivedAt": {"$gte": from_date, "$lte": to_date}},
        ]
    })
    deals = await deals_cursor.to_list(length=1000)

    forecast_thb = 0.0
    actual_thb = 0.0
    dom_forecast = 0.0
    dom_actual = 0.0
    int_forecast = 0.0
    int_actual = 0.0
    deal_list = []

    for d in deals:
        market = d.get("marketType", "domestic")
        fa = _fmt_thb(d.get("forecastAmount"))
        aa = _fmt_thb(d.get("actualAmount"))
        is_forecast = bool(d.get("forecastDate") and from_date <= d["forecastDate"] <= to_date)
        is_actual = bool(d.get("actualReceivedAt") and from_date <= d["actualReceivedAt"] <= to_date)

        if is_forecast:
            forecast_thb += fa
            if market == "domestic":
                dom_forecast += fa
            else:
                int_forecast += fa

        if is_actual:
            actual_thb += aa
            if market == "domestic":
                dom_actual += aa
            else:
                int_actual += aa

        deal_list.append({
            "id": str(d["_id"]),
            "title": d.get("title", ""),
            "accountId": d.get("accountId", ""),
            "marketType": market,
            "forecastAmount": fa,
            "forecastDate": d.get("forecastDate"),
            "actualAmount": aa,
            "actualReceivedAt": d.get("actualReceivedAt"),
            "revenueStatus": d.get("revenueStatus", "pending"),
            "stage": d.get("stage", ""),
        })

    # หา revenue_target ของช่วงนี้ (ใช้เดือนของ from_date)
    year = from_dt.year
    month = from_dt.month
    target_doc = await db.revenue_targets.find_one({"year": year, "month": month})
    target_thb = _fmt_thb(target_doc.get("targetThb") if target_doc else 0)
    is_closed = bool(target_doc and target_doc.get("isClosed"))

    return {
        "from": from_date,
        "to": to_date,
        "targetThb": target_thb,
        "forecastThb": forecast_thb,
        "actualThb": actual_thb,
        "domestic": {"forecastThb": dom_forecast, "actualThb": dom_actual},
        "international": {"forecastThb": int_forecast, "actualThb": int_actual},
        "deals": deal_list,
        "isClosed": is_closed,
        "closedActualThb": _fmt_thb(target_doc.get("closedActualThb") if target_doc else 0),
    }


@router.get("/targets")
async def get_revenue_targets(
    year: int = Query(...),
    db=Depends(get_db),
    current=Depends(get_current_user),
):
    """ดึงเป้าทั้งปีของปีที่ระบุ"""
    cursor = db.revenue_targets.find({"year": year}).sort("month", 1)
    docs = await cursor.to_list(length=12)
    for d in docs:
        d["_id"] = str(d["_id"])
    return {"year": year, "targets": docs}


@router.post("/targets")
async def upsert_revenue_target(
    body: RevenueTargetUpsert,
    db=Depends(get_db),
    current=Depends(require_admin),
):
    """ตั้ง/แก้เป้ารายเดือน (Admin only)"""
    now = datetime.now(timezone.utc).isoformat()
    await db.revenue_targets.update_one(
        {"year": body.year, "month": body.month},
        {"$set": {
            "targetThb": body.targetThb,
            "domesticTargetThb": body.domesticTargetThb,
            "internationalTargetThb": body.internationalTargetThb,
            "updatedAt": now,
        }, "$setOnInsert": {"createdAt": now, "isClosed": False, "closedAt": None, "closedActualThb": None, "closedBy": None}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/close-month")
async def close_month(
    body: CloseMonthRequest,
    db=Depends(get_db),
    current=Depends(require_admin),
):
    """ปิดรอบเดือน — ล็อกข้อมูลรายได้จริง (Admin only)"""
    existing = await db.revenue_targets.find_one({"year": body.year, "month": body.month})
    if existing and existing.get("isClosed"):
        raise HTTPException(status_code=400, detail="เดือนนี้ปิดรอบไปแล้ว")
    now = datetime.now(timezone.utc).isoformat()
    await db.revenue_targets.update_one(
        {"year": body.year, "month": body.month},
        {"$set": {
            "isClosed": True,
            "closedAt": now,
            "closedActualThb": body.closedActualThb,
            "closedBy": current.get("username"),
            "updatedAt": now,
        }, "$setOnInsert": {"createdAt": now, "targetThb": 0, "domesticTargetThb": 0, "internationalTargetThb": 0}},
        upsert=True,
    )
    return {"ok": True}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/crm_revenue.py
git commit -m "feat(crm-revenue): add revenue summary and target management API"
```

---

## Task 3: เชื่อม Router เข้า main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: import router ใหม่**

ใน `backend/app/main.py` บรรทัด 8 แก้ import เพิ่ม `crm_revenue`:

```python
from .routers import auth, expenses, budget, users, inventory, chat, profile, notifications, categories, settings, reports, line_webhook, sse, customers, crm_workspaces, segments, google_sheets, deals, activities, field_history, crm_b2b, agent, skills, mail, crm_revenue
```

- [ ] **Step 2: include router**

หลังบรรทัดที่ include router ตัวอื่น ๆ ให้เพิ่ม:

```python
app.include_router(crm_revenue.router)
```

(หา pattern `app.include_router(crm_b2b.router)` แล้วเพิ่มต่อท้าย)

- [ ] **Step 3: ทดสอบ backend start**

```bash
# รันใน container หรือ local
curl http://localhost:8001/api/crm/revenue/summary?from=2026-06-01&to=2026-06-30
# Expected: JSON response (อาจ 401 ถ้าไม่มี token — แปลว่า route ทำงาน)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(crm-revenue): register crm_revenue router in main"
```

---

## Task 4: Frontend API Client — api.ts

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: เพิ่ม revenueApi ต่อท้ายไฟล์ (ก่อน export สุดท้าย)**

```typescript
export const revenueApi = {
  getSummary: (from: string, to: string) =>
    request<{
      from: string
      to: string
      targetThb: number
      forecastThb: number
      actualThb: number
      domestic: { forecastThb: number; actualThb: number }
      international: { forecastThb: number; actualThb: number }
      deals: Array<{
        id: string
        title: string
        accountId: string
        marketType: string
        forecastAmount: number
        forecastDate: string | null
        actualAmount: number
        actualReceivedAt: string | null
        revenueStatus: string
        stage: string
      }>
      isClosed: boolean
      closedActualThb: number
    }>('GET', '/api/crm/revenue/summary', undefined, { from, to }),

  getTargets: (year: number) =>
    request<{ year: number; targets: Array<{ month: number; targetThb: number; domesticTargetThb: number; internationalTargetThb: number; isClosed: boolean }> }>(
      'GET', '/api/crm/revenue/targets', undefined, { year: String(year) }
    ),

  upsertTarget: (data: { year: number; month: number; targetThb: number; domesticTargetThb: number; internationalTargetThb: number }) =>
    request<{ ok: boolean }>('POST', '/api/crm/revenue/targets', data),

  closeMonth: (data: { year: number; month: number; closedActualThb: number }) =>
    request<{ ok: boolean }>('POST', '/api/crm/revenue/close-month', data),
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(crm-revenue): add revenueApi client functions"
```

---

## Task 5: หน้าใหม่ /crm-b2b/revenue/page.tsx

**Files:**
- Create: `frontend/app/(app)/crm-b2b/revenue/page.tsx`

- [ ] **Step 1: สร้างหน้า revenue**

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { revenueApi } from '@/lib/api'
import Link from 'next/link'

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function fmtTHB(v: number) {
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `฿${(v / 1_000).toFixed(0)}K`
  return `฿${v.toLocaleString()}`
}

function pct(val: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((val / total) * 100)}%`
}

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  return { from, to }
}

type Summary = Awaited<ReturnType<typeof revenueApi.getSummary>>

export default function RevenuePage() {
  const now = new Date()
  const [year] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<{ role?: string } | null>(null)

  // ตั้งเป้า
  const [showTargetForm, setShowTargetForm] = useState(false)
  const [targetInput, setTargetInput] = useState({ targetThb: '', domesticTargetThb: '', internationalTargetThb: '' })
  const [targetSaving, setTargetSaving] = useState(false)

  // ปิดรอบ
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [closeActual, setCloseActual] = useState('')
  const [closeSaving, setCloseSaving] = useState(false)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('planeat_user')
      if (saved) setUser(JSON.parse(saved))
    } catch {}
  }, [])

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = useCustom && customFrom && customTo
        ? { from: customFrom, to: customTo }
        : monthRange(year, selectedMonth)
      const data = await revenueApi.getSummary(from, to)
      setSummary(data as Summary)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, year, useCustom, customFrom, customTo])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  async function handleSaveTarget() {
    setTargetSaving(true)
    try {
      await revenueApi.upsertTarget({
        year,
        month: selectedMonth,
        targetThb: Number(targetInput.targetThb) || 0,
        domesticTargetThb: Number(targetInput.domesticTargetThb) || 0,
        internationalTargetThb: Number(targetInput.internationalTargetThb) || 0,
      })
      setShowTargetForm(false)
      fetchSummary()
    } finally {
      setTargetSaving(false)
    }
  }

  async function handleCloseMonth() {
    setCloseSaving(true)
    try {
      await revenueApi.closeMonth({ year, month: selectedMonth, closedActualThb: Number(closeActual) || 0 })
      setShowCloseForm(false)
      fetchSummary()
    } finally {
      setCloseSaving(false)
    }
  }

  const s = summary

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">สรุปรายได้ CRM</h1>
        <Link href="/crm-b2b/overview" className="text-sm text-slate-400 hover:text-white">← ภาพรวม</Link>
      </div>

      {/* เลือกช่วงเวลา */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <p className="text-xs text-slate-400 uppercase tracking-wider">ช่วงเวลา</p>
        <div className="flex flex-wrap gap-2">
          {MONTHS.map((m, i) => (
            <button
              key={i}
              onClick={() => { setSelectedMonth(i + 1); setUseCustom(false) }}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                !useCustom && selectedMonth === i + 1
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-600 text-slate-400 hover:border-slate-400'
              }`}
            >
              {m}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              useCustom ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600 text-slate-400 hover:border-slate-400'
            }`}
          >
            กำหนดเอง
          </button>
        </div>
        {useCustom && (
          <div className="flex items-center gap-3">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white" />
            <span className="text-slate-400 text-sm">ถึง</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white" />
            <button onClick={fetchSummary} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg">
              ดู
            </button>
          </div>
        )}
      </div>

      {loading && <p className="text-slate-400 text-sm">กำลังโหลด...</p>}

      {s && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-2">🎯 เป้ารายได้</p>
              <p className="text-2xl font-bold text-white">{fmtTHB(s.targetThb)}</p>
              {isAdmin && (
                <button onClick={() => setShowTargetForm(true)} className="mt-2 text-xs text-blue-400 hover:underline">
                  แก้ไขเป้า
                </button>
              )}
            </div>
            <div className="bg-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-2">📈 รายได้คาดการณ์</p>
              <p className="text-2xl font-bold text-blue-400">{fmtTHB(s.forecastThb)}</p>
              <p className="text-xs text-slate-500 mt-1">{pct(s.forecastThb, s.targetThb)} ของเป้า</p>
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: pct(s.forecastThb, s.targetThb) }} />
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-400 mb-2">✅ รายได้จริง</p>
              <p className="text-2xl font-bold text-emerald-400">{fmtTHB(s.actualThb)}</p>
              <p className="text-xs text-slate-500 mt-1">{pct(s.actualThb, s.targetThb)} ของเป้า</p>
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: pct(s.actualThb, s.targetThb) }} />
              </div>
            </div>
          </div>

          {/* แยก domestic / international */}
          <div className="bg-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-4">แยกตามตลาด</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="pb-2 font-medium">ตลาด</th>
                  <th className="pb-2 font-medium text-right">คาดการณ์</th>
                  <th className="pb-2 font-medium text-right">จริง</th>
                  <th className="pb-2 font-medium text-right">% ของเป้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                <tr>
                  <td className="py-2"><span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full">ในประเทศ</span></td>
                  <td className="py-2 text-right text-slate-300">{fmtTHB(s.domestic.forecastThb)}</td>
                  <td className="py-2 text-right text-emerald-400">{fmtTHB(s.domestic.actualThb)}</td>
                  <td className="py-2 text-right text-slate-400">{pct(s.domestic.actualThb, s.targetThb)}</td>
                </tr>
                <tr>
                  <td className="py-2"><span className="bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded-full">ต่างประเทศ</span></td>
                  <td className="py-2 text-right text-slate-300">{fmtTHB(s.international.forecastThb)}</td>
                  <td className="py-2 text-right text-emerald-400">{fmtTHB(s.international.actualThb)}</td>
                  <td className="py-2 text-right text-slate-400">{pct(s.international.actualThb, s.targetThb)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2 text-white">รวม</td>
                  <td className="py-2 text-right text-blue-400">{fmtTHB(s.forecastThb)}</td>
                  <td className="py-2 text-right text-emerald-400">{fmtTHB(s.actualThb)}</td>
                  <td className="py-2 text-right text-white">{pct(s.actualThb, s.targetThb)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* รายการ Deal */}
          <div className="bg-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-4">Deal ในช่วงนี้ ({s.deals.length} รายการ)</p>
            {s.deals.length === 0 && <p className="text-slate-500 text-sm">ไม่มี deal ในช่วงเวลาที่เลือก</p>}
            <div className="divide-y divide-slate-700">
              {s.deals.map(d => (
                <div key={d.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-white">{d.title || '(ไม่มีชื่อ)'}</p>
                    <p className="text-xs text-slate-500">
                      {d.marketType === 'domestic' ? 'ในประเทศ' : 'ต่างประเทศ'} •{' '}
                      {d.stage}
                    </p>
                  </div>
                  <div className="text-right">
                    {d.actualReceivedAt ? (
                      <>
                        <p className="text-sm font-semibold text-emerald-400">{fmtTHB(d.actualAmount)}</p>
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">รับเงินแล้ว</span>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-blue-400">{fmtTHB(d.forecastAmount)}</p>
                        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">คาดการณ์</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ปิดรอบเดือน (Admin) */}
          {isAdmin && (
            <div className="bg-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">ปิดรอบเดือน</p>
              {s.isClosed ? (
                <div className="flex items-center gap-2">
                  <span className="bg-slate-600 text-slate-300 text-xs px-3 py-1 rounded-full">🔒 ปิดรอบแล้ว</span>
                  <span className="text-sm text-slate-400">ยอดจริง: {fmtTHB(s.closedActualThb)}</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowCloseForm(true)}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2 rounded-lg"
                  >
                    🔒 ปิดรอบเดือน {MONTHS[selectedMonth - 1]} {year}
                  </button>
                  <p className="text-xs text-slate-500 mt-2">เมื่อปิดรอบแล้ว ข้อมูลจะถูกล็อกเป็นประวัติ Admin เท่านั้นที่แก้ได้</p>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal ตั้งเป้า */}
      {showTargetForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-80 space-y-4">
            <h3 className="text-white font-semibold">ตั้งเป้ารายได้ — {MONTHS[selectedMonth - 1]} {year}</h3>
            <div className="space-y-3">
              {[
                { label: 'เป้ารวม (THB)', key: 'targetThb' },
                { label: 'ในประเทศ (THB)', key: 'domesticTargetThb' },
                { label: 'ต่างประเทศ (THB)', key: 'internationalTargetThb' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-slate-400">{f.label}</label>
                  <input
                    type="number"
                    value={targetInput[f.key as keyof typeof targetInput]}
                    onChange={e => setTargetInput(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowTargetForm(false)} className="flex-1 border border-slate-600 text-slate-300 py-2 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleSaveTarget} disabled={targetSaving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold">
                {targetSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ปิดรอบ */}
      {showCloseForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-80 space-y-4">
            <h3 className="text-white font-semibold">ปิดรอบ {MONTHS[selectedMonth - 1]} {year}</h3>
            <div>
              <label className="text-xs text-slate-400">ยอดรายได้จริงทั้งหมด (THB)</label>
              <input
                type="number"
                value={closeActual}
                onChange={e => setCloseActual(e.target.value)}
                className="w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="0"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCloseForm(false)} className="flex-1 border border-slate-600 text-slate-300 py-2 rounded-lg text-sm">ยกเลิก</button>
              <button onClick={handleCloseMonth} disabled={closeSaving} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-semibold">
                {closeSaving ? 'กำลังปิดรอบ...' : 'ยืนยันปิดรอบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/\(app\)/crm-b2b/revenue/page.tsx
git commit -m "feat(crm-revenue): add revenue summary page"
```

---

## Task 6: เพิ่ม Revenue Banner ใน Overview

**Files:**
- Modify: `frontend/app/(app)/crm-b2b/overview/page.tsx`

- [ ] **Step 1: เพิ่ม import revenueApi และ state**

ที่บรรทัด import ด้านบน เพิ่ม:
```typescript
import { crmB2bApi, revenueApi } from '@/lib/api'
import Link from 'next/link'
```

- [ ] **Step 2: เพิ่ม state และ useEffect ดึงข้อมูล**

ใน component function เพิ่ม state:
```typescript
const [revSummary, setRevSummary] = useState<{ targetThb: number; forecastThb: number; actualThb: number } | null>(null)
```

เพิ่ม useEffect ดึงข้อมูล revenue เดือนปัจจุบัน (วางหลัง useEffect อื่น ๆ):
```typescript
useEffect(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  revenueApi.getSummary(from, to).then((data: any) => setRevSummary(data)).catch(() => {})
}, [])
```

- [ ] **Step 3: เพิ่ม banner ก่อน return content หลัก**

หา JSX ด้านบนสุดของ return (หลัง `<div` wrapper หลัก) แล้วเพิ่ม:
```tsx
{revSummary && (
  <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-3 flex items-center justify-between mb-4">
    <div className="flex gap-6 text-sm">
      <span className="text-slate-400">🎯 เป้า <span className="text-white font-semibold">{revSummary.targetThb >= 1000 ? `฿${(revSummary.targetThb/1000).toFixed(0)}K` : `฿${revSummary.targetThb}`}</span></span>
      <span className="text-slate-400">📈 คาดการณ์ <span className="text-blue-400 font-semibold">{revSummary.forecastThb >= 1000 ? `฿${(revSummary.forecastThb/1000).toFixed(0)}K` : `฿${revSummary.forecastThb}`}</span></span>
      <span className="text-slate-400">✅ จริง <span className="text-emerald-400 font-semibold">{revSummary.actualThb >= 1000 ? `฿${(revSummary.actualThb/1000).toFixed(0)}K` : `฿${revSummary.actualThb}`}</span></span>
    </div>
    <Link href="/crm-b2b/revenue" className="text-xs text-blue-400 hover:underline whitespace-nowrap">ดูรายละเอียด →</Link>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(app\)/crm-b2b/overview/page.tsx
git commit -m "feat(crm-revenue): add revenue banner to overview page"
```

---

## Task 7: เพิ่มเมนูใน Sidebar

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: หาตำแหน่ง CRM menu group แล้วเพิ่ม item**

ค้นหา pattern `crm-b2b` ใน Sidebar.tsx แล้วเพิ่ม item "สรุปรายได้" ในกลุ่มเดียวกัน:

```typescript
{ href: '/crm-b2b/revenue', label: 'สรุปรายได้', icon: '📊' },
```

(วางหลัง item overview หรือ deals ตามลำดับที่เหมาะสม)

- [ ] **Step 2: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx
git commit -m "feat(crm-revenue): add revenue menu item to sidebar"
```

---

## Task 8: Build และ Deploy

- [ ] **Step 1: ตรวจสอบ TypeScript build**

```bash
cd frontend && npx tsc --noEmit
# Expected: ไม่มี error
```

- [ ] **Step 2: Deploy ขึ้น VPS (รอคำสั่งจาก user เท่านั้น)**

```bash
# รันบน VPS หลังได้รับอนุญาต
cd ~/planeat-app
docker compose down && docker rmi planeat-app-frontend planeat-app-backend -f && docker compose up -d --build
```

- [ ] **Step 3: ทดสอบ API บน production**

```bash
curl -H "Authorization: Bearer <token>" \
  "https://planeatsupport.duckdns.org/api/crm/revenue/summary?from=2026-06-01&to=2026-06-30"
```
