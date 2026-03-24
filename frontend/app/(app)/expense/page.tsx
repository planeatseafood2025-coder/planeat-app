'use client'
import { useState, useCallback } from 'react'
import { getSession } from '@/lib/auth'
import { fetchWithCache, invalidateCache } from '@/lib/cache'
import { expenseApi } from '@/lib/api'
import { fmt, todayIso, todayMonth, monthInputToApi, isoToThai } from '@/lib/utils'
import type { CatKey, Expense, ExpensesResponse } from '@/types'
import { CAT_STYLE, CAT_NAMES } from '@/types'

// ─── Item types per category ─────────────────────────────────────
interface LaborItem { workers: string; dailyWage: string; ot: string; note: string }
interface RawItem   { itemName: string; quantity: string; pricePerKg: string; note: string }
interface ChemItem  { itemName: string; quantity: string; price: string; note: string }
interface RepairItem{ repairItem: string; totalCost: string; note: string }
type AnyItem = LaborItem | RawItem | ChemItem | RepairItem

const defaultItem: Record<CatKey, AnyItem> = {
  labor:  { workers: '', dailyWage: '', ot: '', note: '' },
  raw:    { itemName: '', quantity: '', pricePerKg: '', note: '' },
  chem:   { itemName: '', quantity: '', price: '', note: '' },
  repair: { repairItem: '', totalCost: '', note: '' },
}

function calcTotal(cat: CatKey, item: AnyItem): number {
  if (cat === 'labor') {
    const i = item as LaborItem
    return (parseFloat(i.workers)||0) * (parseFloat(i.dailyWage)||0) + (parseFloat(i.ot)||0)
  }
  if (cat === 'raw') {
    const i = item as RawItem
    return (parseFloat(i.quantity)||0) * (parseFloat(i.pricePerKg)||0)
  }
  if (cat === 'chem') {
    const i = item as ChemItem
    return (parseFloat(i.quantity)||0) * (parseFloat(i.price)||0)
  }
  if (cat === 'repair') {
    return parseFloat((item as RepairItem).totalCost)||0
  }
  return 0
}

interface PanelState {
  open: boolean
  items: AnyItem[]
}

const CAT_KEYS: CatKey[] = ['labor', 'raw', 'chem', 'repair']

export default function ExpensePage() {
  const user = getSession()
  const [recorderName, setRecorderName] = useState(user?.name || '')
  const [date, setDate] = useState(todayIso())
  const [panels, setPanels] = useState<Record<CatKey, PanelState>>({
    labor:  { open: false, items: [] },
    raw:    { open: false, items: [] },
    chem:   { open: false, items: [] },
    repair: { open: false, items: [] },
  })
  const [submitting, setSubmitting] = useState<CatKey | null>(null)

  // Expense history
  const [historyMonth, setHistoryMonth] = useState(todayMonth())
  const [historyCat, setHistoryCat] = useState('all')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState('')

  const loadExpenses = useCallback(async (month: string) => {
    const mY = monthInputToApi(month)
    setHistLoading(true)
    setHistError('')
    try {
      await fetchWithCache<ExpensesResponse>(
        `expenses-v2:${mY}`,
        () => expenseApi.getExpenses(mY) as Promise<ExpensesResponse>,
        {
          onData: (res) => { setExpenses(res.expenses || []); setHistLoading(false) },
          onSkeleton: () => setHistLoading(true),
        }
      )
    } catch (e: unknown) {
      setHistError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
      setHistLoading(false)
    }
  }, [])

  useState(() => { loadExpenses(historyMonth) })

  function togglePanel(cat: CatKey) {
    setPanels((prev) => {
      const current = prev[cat]
      if (current.open) {
        return { ...prev, [cat]: { ...current, open: false } }
      }
      // Close others, open this
      const next = { ...prev }
      CAT_KEYS.forEach((k) => { next[k] = { ...next[k], open: false } })
      const items = current.items.length === 0 ? [{ ...defaultItem[cat] }] : current.items
      next[cat] = { open: true, items }
      return next
    })
  }

  function addItem(cat: CatKey) {
    setPanels((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], items: [...prev[cat].items, { ...defaultItem[cat] }] },
    }))
  }

  function removeItem(cat: CatKey, idx: number) {
    setPanels((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], items: prev[cat].items.filter((_, i) => i !== idx) },
    }))
  }

  function updateItem(cat: CatKey, idx: number, field: string, value: string) {
    setPanels((prev) => {
      const items = [...prev[cat].items]
      items[idx] = { ...items[idx], [field]: value }
      return { ...prev, [cat]: { ...prev[cat], items } }
    })
  }

  async function submitCat(cat: CatKey) {
    if (!recorderName.trim()) {
      alert('กรุณาระบุชื่อผู้บันทึก')
      return
    }
    if (!date) {
      alert('กรุณาเลือกวันที่')
      return
    }
    const items = panels[cat].items
    const rows = items
      .map((item) => {
        if (cat === 'labor') {
          const i = item as LaborItem
          return { workers: parseFloat(i.workers)||0, dailyWage: parseFloat(i.dailyWage)||0, ot: parseFloat(i.ot)||0, note: i.note }
        }
        if (cat === 'raw') {
          const i = item as RawItem
          return { itemName: i.itemName, quantity: parseFloat(i.quantity)||0, pricePerKg: parseFloat(i.pricePerKg)||0, note: i.note }
        }
        if (cat === 'chem') {
          const i = item as ChemItem
          return { itemName: i.itemName, quantity: parseFloat(i.quantity)||0, price: parseFloat(i.price)||0, note: i.note }
        }
        if (cat === 'repair') {
          const i = item as RepairItem
          return { repairItem: i.repairItem, totalCost: parseFloat(i.totalCost)||0, note: i.note }
        }
        return null
      })
      .filter(Boolean)

    if (rows.length === 0) {
      alert('กรุณากรอกข้อมูลอย่างน้อย 1 รายการ')
      return
    }

    setSubmitting(cat)
    try {
      const res = await expenseApi.saveExpense({
        username: recorderName.trim(),
        category: CAT_NAMES[cat],
        date: isoToThai(date),
        rows,
      }) as { success: boolean; message: string }

      if (res.success) {
        setPanels((prev) => ({
          ...prev,
          [cat]: { open: false, items: [] },
        }))
        invalidateCache('overview-v2:*', 'expenses-v2:*')
        await loadExpenses(historyMonth)
        const { default: Swal } = await import('sweetalert2')
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', text: res.message, timer: 2000, showConfirmButton: false })
      } else {
        alert(res.message)
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(null)
    }
  }

  // History rendering
  const filteredExpenses = historyCat === 'all' ? expenses : expenses.filter((e) => e.catKey === historyCat)
  const sums = { labor: 0, raw: 0, chem: 0, repair: 0 } as Record<CatKey, number>
  expenses.forEach((e) => { sums[e.catKey] = (sums[e.catKey] || 0) + e.amount })

  return (
    <div className="page-section active">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="material-icons-round text-blue-500" style={{ fontSize: 20 }}>receipt_long</span>
          บันทึกรายจ่าย
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">ชื่อผู้บันทึก <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="กรอกชื่อผู้บันทึก"
              value={recorderName}
              onChange={(e) => setRecorderName(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">วันที่บันทึก <span className="text-red-500">*</span></label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Category panels */}
      {CAT_KEYS.map((cat) => {
        const cs = CAT_STYLE[cat]
        const panel = panels[cat]
        return (
          <div key={cat} className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
            {/* Panel header */}
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              onClick={() => togglePanel(cat)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: cs.bg }}>
                  <span className="material-icons-round" style={{ fontSize: 18, color: cs.color }}>{cs.icon}</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-800">{cs.label}</p>
                  <p className="text-xs text-slate-400">{panel.items.length > 0 && panel.open ? `${panel.items.length} รายการ` : 'คลิกเพื่อเพิ่มรายการ'}</p>
                </div>
              </div>
              <span className="material-icons-round text-slate-400" style={{ fontSize: 20 }}>
                {panel.open ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {/* Panel body */}
            <div className={`form-panel ${panel.open ? 'open' : ''}`}>
              <div className="px-4 pb-4">
                {panel.items.map((item, idx) => (
                  <ItemCard
                    key={idx}
                    cat={cat}
                    item={item}
                    idx={idx}
                    total={calcTotal(cat, item)}
                    canDelete={panel.items.length > 1}
                    onChange={(field, val) => updateItem(cat, idx, field, val)}
                    onDelete={() => removeItem(cat, idx)}
                  />
                ))}

                <div className="flex items-center justify-between mt-3">
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    onClick={() => addItem(cat)}
                  >
                    <span className="material-icons-round" style={{ fontSize: 14 }}>add</span>
                    เพิ่มรายการ
                  </button>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '6px 16px' }}
                    onClick={() => submitCat(cat)}
                    disabled={submitting === cat}
                  >
                    {submitting === cat ? (
                      <><span className="material-icons-round spin" style={{ fontSize: 14 }}>refresh</span>กำลังบันทึก...</>
                    ) : (
                      <><span className="material-icons-round" style={{ fontSize: 14 }}>save</span>บันทึก{cs.label}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Expense History */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-4">
        <div className="p-4 border-b border-slate-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span className="material-icons-round text-blue-500" style={{ fontSize: 18 }}>history</span>
              ประวัติการบันทึก
            </h3>
            <button
              className="text-xs px-2 py-1 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 flex items-center gap-1"
              onClick={async () => {
                const { default: Swal } = await import('sweetalert2')
                const r = await Swal.fire({ title: 'จัดระเบียบข้อมูล?', icon: 'info', showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก' })
                if (r.isConfirmed) {
                  try {
                    await expenseApi.fixData()
                    Swal.fire('สำเร็จ', 'ตรวจสอบข้อมูลเรียบร้อย', 'success')
                    loadExpenses(historyMonth)
                  } catch (e: unknown) {
                    Swal.fire('ผิดพลาด', e instanceof Error ? e.message : 'error', 'error')
                  }
                }
              }}
            >
              <span className="material-icons-round" style={{ fontSize: 12 }}>build</span>
              ซ่อมแซม/จัดระเบียบ
            </button>
          </div>
          <div className="flex gap-3 flex-wrap">
            <input
              type="month"
              className="form-input"
              style={{ padding: '6px 10px', maxWidth: 160 }}
              value={historyMonth}
              onChange={(e) => { setHistoryMonth(e.target.value); loadExpenses(e.target.value) }}
            />
            <select
              className="form-input"
              style={{ padding: '6px 10px', maxWidth: 180 }}
              value={historyCat}
              onChange={(e) => setHistoryCat(e.target.value)}
            >
              <option value="all">ทุกหมวด</option>
              <option value="labor">ค่าแรงงาน</option>
              <option value="raw">ค่าวัตถุดิบ</option>
              <option value="chem">ค่าเคมี/หีบห่อ</option>
              <option value="repair">ค่าซ่อมแซม</option>
            </select>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {(['labor','raw','chem','repair'] as CatKey[]).map((k) => (
              <div key={k} className="rounded-lg p-2 text-center" style={{ background: CAT_STYLE[k].bg }}>
                <p className="text-xs font-semibold" style={{ color: CAT_STYLE[k].color }}>{CAT_STYLE[k].label}</p>
                <p className="text-sm font-bold text-slate-800">{fmt(sums[k] || 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {histLoading ? (
            <div className="py-8 text-center">
              <span className="material-icons-round spin text-blue-400" style={{ fontSize: 32 }}>refresh</span>
            </div>
          ) : histError ? (
            <div className="py-8 text-center text-red-500 text-sm">{histError}</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="py-10 text-center">
              <span className="material-icons-round text-slate-300" style={{ fontSize: 36 }}>inbox</span>
              <p className="text-sm text-slate-400 mt-1">ไม่พบรายการ</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['วันที่','หมวด','รายละเอียด','ยอด','ผู้บันทึก','หมายเหตุ'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((e, i) => {
                  const cs = CAT_STYLE[e.catKey]
                  return (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap font-medium">{e.date}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: cs?.bg, color: cs?.color }}>
                          {cs?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate">{e.detail || '—'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-800 text-right whitespace-nowrap">{fmt(e.amount)}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{e.recorder || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{e.note || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-100">
                  <td colSpan={3} className="px-4 py-3 text-xs font-bold text-blue-700">รวม {filteredExpenses.length} รายการ</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-800">{fmt(filteredExpenses.reduce((s, e) => s + e.amount, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Item Card Component ──────────────────────────────────────────
interface ItemCardProps {
  cat: CatKey
  item: AnyItem
  idx: number
  total: number
  canDelete: boolean
  onChange: (field: string, value: string) => void
  onDelete: () => void
}

function ItemCard({ cat, item, idx, total, canDelete, onChange, onDelete }: ItemCardProps) {
  const cs = CAT_STYLE[cat]
  return (
    <div
      className="item-card rounded-xl p-4 mt-3 border"
      style={{ background: cs.bg, borderColor: cs.color + '40' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold" style={{ color: cs.color }}>รายการที่ {idx + 1}</span>
        {canDelete && (
          <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 rounded-lg transition-colors">
            <span className="material-icons-round" style={{ fontSize: 18 }}>delete_outline</span>
          </button>
        )}
      </div>

      {cat === 'labor' && (() => {
        const i = item as LaborItem
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="form-label">จำนวนพนักงาน (คน)</label>
                <input type="number" className="form-input" min="1" placeholder="10" value={i.workers} onChange={(e) => onChange('workers', e.target.value)} />
              </div>
              <div>
                <label className="form-label">ค่าจ้างรายวัน (฿)</label>
                <input type="number" className="form-input" min="0" placeholder="500" value={i.dailyWage} onChange={(e) => onChange('dailyWage', e.target.value)} />
              </div>
              <div>
                <label className="form-label">ค่า OT (฿)</label>
                <input type="number" className="form-input" min="0" placeholder="0" value={i.ot} onChange={(e) => onChange('ot', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">หมายเหตุ</label>
              <input type="text" className="form-input" placeholder="(ถ้ามี)" value={i.note} onChange={(e) => onChange('note', e.target.value)} />
            </div>
          </>
        )
      })()}

      {cat === 'raw' && (() => {
        const i = item as RawRow
        return (
          <>
            <div className="mb-3">
              <label className="form-label">รายการวัตถุดิบ</label>
              <input type="text" className="form-input" placeholder="ชื่อวัตถุดิบ" value={i.itemName} onChange={(e) => onChange('itemName', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="form-label">จำนวน (กก.)</label>
                <input type="number" className="form-input" min="0" step="0.01" placeholder="100" value={i.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
              </div>
              <div>
                <label className="form-label">ราคา (฿/กก.)</label>
                <input type="number" className="form-input" min="0" step="0.01" placeholder="25" value={i.pricePerKg} onChange={(e) => onChange('pricePerKg', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">หมายเหตุ</label>
              <input type="text" className="form-input" placeholder="(ถ้ามี)" value={i.note} onChange={(e) => onChange('note', e.target.value)} />
            </div>
          </>
        )
      })()}

      {cat === 'chem' && (() => {
        const i = item as ChemRow
        return (
          <>
            <div className="mb-3">
              <label className="form-label">รายการ</label>
              <input type="text" className="form-input" placeholder="ชื่อเคมี/หีบห่อ/ส่วนผสม" value={i.itemName} onChange={(e) => onChange('itemName', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="form-label">จำนวน</label>
                <input type="number" className="form-input" min="0" step="0.01" placeholder="10" value={i.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
              </div>
              <div>
                <label className="form-label">ราคา (฿)</label>
                <input type="number" className="form-input" min="0" step="0.01" placeholder="500" value={i.price} onChange={(e) => onChange('price', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">หมายเหตุ</label>
              <input type="text" className="form-input" placeholder="(ถ้ามี)" value={i.note} onChange={(e) => onChange('note', e.target.value)} />
            </div>
          </>
        )
      })()}

      {cat === 'repair' && (() => {
        const i = item as RepairItem
        return (
          <>
            <div className="mb-3">
              <label className="form-label">รายการซ่อม</label>
              <input type="text" className="form-input" placeholder="เช่น ซ่อมตู้เย็น" value={i.repairItem} onChange={(e) => onChange('repairItem', e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label">ยอดเงินรวม (฿)</label>
              <input type="number" className="form-input" min="0" step="0.01" placeholder="0" value={i.totalCost} onChange={(e) => onChange('totalCost', e.target.value)} />
            </div>
            <div>
              <label className="form-label">หมายเหตุ</label>
              <input type="text" className="form-input" placeholder="(ถ้ามี)" value={i.note} onChange={(e) => onChange('note', e.target.value)} />
            </div>
          </>
        )
      })()}

      <div className="mt-2 text-right text-xs font-bold" style={{ color: cs.color }}>
        รวม: {fmt(total)}
      </div>
    </div>
  )
}

// Type helpers
interface RawRow { itemName: string; quantity: string; pricePerKg: string; note: string }
interface ChemRow { itemName: string; quantity: string; price: string; note: string }
interface RepairItem { repairItem: string; totalCost: string; note: string }
