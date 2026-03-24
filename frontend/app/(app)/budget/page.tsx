'use client'
import { useState, useCallback, useEffect } from 'react'
import { getSession } from '@/lib/auth'
import { fetchWithCache, invalidateCache } from '@/lib/cache'
import { budgetApi } from '@/lib/api'
import { fmt, todayMonth, monthInputToApi, autoDailyRate } from '@/lib/utils'
import type { BudgetResponse, CatKey } from '@/types'
import { CAT_STYLE } from '@/types'

const CAT_KEYS: CatKey[] = ['labor', 'raw', 'chem', 'repair']

export default function BudgetPage() {
  const user = getSession()
  const canEdit = user?.role === 'admin' || user?.role === 'accountant'
  const [month, setMonth] = useState(todayMonth())
  const [data, setData] = useState<BudgetResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)

  // Modal form state
  const [modalMonth, setModalMonth] = useState(todayMonth())
  const [budgets, setBudgets] = useState<Record<CatKey, { monthly: string; daily: string; manual: boolean }>>({
    labor:  { monthly: '', daily: '', manual: false },
    raw:    { monthly: '', daily: '', manual: false },
    chem:   { monthly: '', daily: '', manual: false },
    repair: { monthly: '', daily: '', manual: false },
  })
  const [saving, setSaving] = useState(false)

  const loadBudget = useCallback(async (m: string) => {
    const mY = monthInputToApi(m)
    setLoading(true); setError('')
    try {
      await fetchWithCache<BudgetResponse>(
        `budget:${mY}`,
        () => budgetApi.getBudget(mY) as Promise<BudgetResponse>,
        {
          onData: (res) => { setData(res); setLoading(false) },
          onSkeleton: () => setLoading(true),
        }
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadBudget(month) }, [month, loadBudget])

  async function openModal() {
    const mY = monthInputToApi(month)
    setModalMonth(month)
    // Pre-populate with existing budget
    try {
      const res = await budgetApi.getBudget(mY) as BudgetResponse
      const newBudgets = { ...budgets }
      CAT_KEYS.forEach((k) => {
        const entry = res.data?.[k]
        if (entry) {
          const autoDaily = autoDailyRate(entry.monthlyBudget, mY)
          const isManual = Math.abs(entry.dailyRate - autoDaily) > 1
          newBudgets[k] = {
            monthly: String(entry.monthlyBudget || ''),
            daily: String(entry.dailyRate || ''),
            manual: isManual,
          }
        }
      })
      setBudgets(newBudgets)
    } catch {}
    setShowModal(true)
  }

  function updateBudget(cat: CatKey, field: string, value: string | boolean) {
    setBudgets((prev) => {
      const next = { ...prev, [cat]: { ...prev[cat], [field]: value } }
      // Auto-calc daily if not manual
      if (field === 'monthly' && !next[cat].manual) {
        const monthly = parseFloat(value as string) || 0
        const mY = monthInputToApi(modalMonth)
        next[cat].daily = String(autoDailyRate(monthly, mY))
      }
      return next
    })
  }

  async function saveBudget() {
    if (!modalMonth) { alert('กรุณาเลือกเดือน'); return }
    setSaving(true)
    try {
      const payload = {
        username: user?.username || '',
        monthYear: monthInputToApi(modalMonth),
        budgets: Object.fromEntries(
          CAT_KEYS.map((k) => [k, {
            monthly: parseFloat(budgets[k].monthly) || 0,
            daily: parseFloat(budgets[k].daily) || 0,
          }])
        ),
      }
      const res = await budgetApi.setBudget(payload) as { success: boolean; message: string }
      if (res.success) {
        setShowModal(false)
        invalidateCache(`budget:${monthInputToApi(month)}`)
        await loadBudget(month)
        const { default: Swal } = await import('sweetalert2')
        Swal.fire({ icon: 'success', title: 'บันทึกงบประมาณสำเร็จ', timer: 2000, showConfirmButton: false })
      } else {
        alert(res.message)
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-section active">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <input
            type="month"
            className="form-input"
            style={{ padding: '7px 12px', maxWidth: 180 }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openModal}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>settings</span>
            ตั้งงบประมาณ
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons-round spin text-blue-400" style={{ fontSize: 40 }}>refresh</span>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CAT_KEYS.map((cat) => {
            const cs = CAT_STYLE[cat]
            const entry = data?.data?.[cat]
            if (!entry) return null
            const spent = entry.spentMonth
            const budget = entry.monthlyBudget
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
            const barColor = pct > 90 ? '#f43f5e' : pct > 75 ? '#f59e0b' : '#10b981'

            return (
              <div key={cat} className="budget-card">
                {/* Card header */}
                <div className="p-5 border-b border-slate-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: cs.bg }}>
                        <span className="material-icons-round" style={{ fontSize: 20, color: cs.color }}>{cs.icon}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{cs.label}</p>
                        <p className="text-lg font-bold" style={{ color: cs.color }}>{fmt(budget)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">งบ/วัน</p>
                      <p className="text-sm font-semibold text-slate-700">{fmt(entry.dailyRate)}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-slate-400">ใช้ไป {pct.toFixed(1)}%</span>
                    <span className="text-xs font-semibold" style={{ color: barColor }}>{fmt(spent)}</span>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 divide-x divide-y divide-slate-50">
                  <div className="p-4">
                    <p className="text-xs text-slate-400 mb-1">ใช้วันนี้</p>
                    <p className="text-base font-bold text-slate-800">{fmt(entry.spentToday)}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-slate-400 mb-1">ใช้ทั้งเดือน</p>
                    <p className="text-base font-bold text-slate-800">{fmt(entry.spentMonth)}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-slate-400 mb-1">งบคงเหลือ/วัน</p>
                    <p className={`text-base font-bold ${entry.remainDay < 0 ? 'budget-val-negative' : 'budget-val-positive'}`}>{fmt(entry.remainDay)}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-slate-400 mb-1">งบคงเหลือ/เดือน</p>
                    <p className={`text-base font-bold ${entry.remainMonth < 0 ? 'budget-val-negative' : 'budget-val-positive'}`}>{fmt(entry.remainMonth)}</p>
                  </div>
                </div>

                <div className="px-4 pb-3 pt-2 text-xs text-slate-400 text-right">
                  วันที่ {entry.currentDay} · อัตรา {fmt(entry.dailyRate)}/วัน
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Budget Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">ตั้งงบประมาณ</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <div className="mb-4">
                <label className="form-label">เดือน</label>
                <input
                  type="month"
                  className="form-input"
                  value={modalMonth}
                  onChange={(e) => {
                    setModalMonth(e.target.value)
                    // Recalc auto daily for all cats
                    setBudgets((prev) => {
                      const next = { ...prev }
                      CAT_KEYS.forEach((k) => {
                        if (!next[k].manual) {
                          const monthly = parseFloat(next[k].monthly) || 0
                          next[k] = { ...next[k], daily: String(autoDailyRate(monthly, monthInputToApi(e.target.value))) }
                        }
                      })
                      return next
                    })
                  }}
                />
              </div>
              {CAT_KEYS.map((cat) => {
                const cs = CAT_STYLE[cat]
                const b = budgets[cat]
                return (
                  <div key={cat} className="mb-5 p-4 rounded-xl border" style={{ borderColor: cs.color + '30', background: cs.bg + '40' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-icons-round" style={{ fontSize: 16, color: cs.color }}>{cs.icon}</span>
                      <span className="text-sm font-bold" style={{ color: cs.color }}>{cs.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">งบรายเดือน (฿)</label>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          placeholder="0"
                          value={b.monthly}
                          onChange={(e) => updateBudget(cat, 'monthly', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label flex items-center gap-2">
                          อัตรา/วัน (฿)
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={b.manual}
                              onChange={(e) => updateBudget(cat, 'manual', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-normal text-slate-400">กำหนดเอง</span>
                          </label>
                        </label>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={b.daily}
                          disabled={!b.manual}
                          onChange={(e) => updateBudget(cat, 'daily', e.target.value)}
                          style={{ opacity: b.manual ? 1 : 0.6 }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>ยกเลิก</button>
              <button className="btn-primary" onClick={saveBudget} disabled={saving}>
                {saving ? <><span className="material-icons-round spin" style={{ fontSize: 14 }}>refresh</span>กำลังบันทึก...</> : <><span className="material-icons-round" style={{ fontSize: 14 }}>save</span>บันทึก</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
