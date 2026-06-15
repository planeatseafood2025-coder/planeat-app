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

  const [showTargetForm, setShowTargetForm] = useState(false)
  const [targetInput, setTargetInput] = useState({ targetThb: '', domesticTargetThb: '', internationalTargetThb: '' })
  const [targetSaving, setTargetSaving] = useState(false)

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

          <div className="bg-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-4">Deal ในช่วงนี้ ({s.deals.length} รายการ)</p>
            {s.deals.length === 0 && <p className="text-slate-500 text-sm">ไม่มี deal ในช่วงเวลาที่เลือก</p>}
            <div className="divide-y divide-slate-700">
              {s.deals.map(d => (
                <div key={d.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-white">{d.title || '(ไม่มีชื่อ)'}</p>
                    <p className="text-xs text-slate-500">
                      {d.marketType === 'domestic' ? 'ในประเทศ' : 'ต่างประเทศ'} • {d.stage}
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
