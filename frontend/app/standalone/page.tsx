'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { expenseApi, budgetApi } from '@/lib/api'
import { fmt, todayIso, isoToThai, monthInputToApi, todayMonth } from '@/lib/utils'
import type { CatKey, BudgetResponse } from '@/types'
import { CAT_STYLE, CAT_NAMES } from '@/types'

type AnyItem = Record<string, string>
const CAT_KEYS: CatKey[] = ['raw', 'labor', 'chem', 'repair']

function defaultItem(cat: CatKey): AnyItem {
  if (cat === 'labor')  return { workers: '', dailyWage: '', ot: '', note: '' }
  if (cat === 'raw')    return { itemName: '', quantity: '', pricePerKg: '', note: '' }
  if (cat === 'chem')   return { itemName: '', quantity: '', price: '', note: '' }
  if (cat === 'repair') return { repairItem: '', totalCost: '', note: '' }
  return {}
}

function calcTotal(cat: CatKey, item: AnyItem): number {
  if (cat === 'labor')  return (parseFloat(item.workers)||0)*(parseFloat(item.dailyWage)||0)+(parseFloat(item.ot)||0)
  if (cat === 'raw')    return (parseFloat(item.quantity)||0)*(parseFloat(item.pricePerKg)||0)
  if (cat === 'chem')   return (parseFloat(item.quantity)||0)*(parseFloat(item.price)||0)
  if (cat === 'repair') return parseFloat(item.totalCost)||0
  return 0
}

export default function StandalonePage() {
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayIso())
  const [openPanel, setOpenPanel] = useState<CatKey | null>(null)
  const [panels, setPanels] = useState<Record<CatKey, AnyItem[]>>({
    labor: [], raw: [], chem: [], repair: [],
  })
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [submitting, setSubmitting] = useState<CatKey | null>(null)

  useEffect(() => {
    budgetApi.getBudget(monthInputToApi(todayMonth())).then((res) => {
      setBudget(res as BudgetResponse)
    }).catch(() => {})
  }, [])

  function togglePanel(cat: CatKey) {
    if (openPanel === cat) {
      setOpenPanel(null)
      return
    }
    setOpenPanel(cat)
    if (panels[cat].length === 0) {
      setPanels((p) => ({ ...p, [cat]: [defaultItem(cat)] }))
    }
  }

  function addItem(cat: CatKey) {
    setPanels((p) => ({ ...p, [cat]: [...p[cat], defaultItem(cat)] }))
  }

  function removeItem(cat: CatKey, idx: number) {
    setPanels((p) => ({ ...p, [cat]: p[cat].filter((_, i) => i !== idx) }))
  }

  function updateItem(cat: CatKey, idx: number, field: string, val: string) {
    setPanels((p) => {
      const items = [...p[cat]]
      items[idx] = { ...items[idx], [field]: val }
      return { ...p, [cat]: items }
    })
  }

  async function submitCat(cat: CatKey) {
    if (!name.trim()) { alert('กรุณาระบุชื่อผู้บันทึก'); return }
    if (!date) { alert('กรุณาเลือกวันที่'); return }
    const rows = panels[cat].map((item) => {
      const obj: Record<string, unknown> = {}
      Object.entries(item).forEach(([k, v]) => {
        const n = parseFloat(v)
        obj[k] = isNaN(n) ? v : n
      })
      return obj
    })

    setSubmitting(cat)
    try {
      const res = await expenseApi.saveExpense({
        username: name.trim(),
        category: CAT_NAMES[cat],
        date: isoToThai(date),
        rows,
      }) as { success: boolean; message: string }

      if (res.success) {
        setPanels((p) => ({ ...p, [cat]: [] }))
        setOpenPanel(null)
        const { default: Swal } = await import('sweetalert2')
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', text: res.message, timer: 2500, showConfirmButton: false })
      } else {
        alert(res.message)
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="category-select-page min-h-screen">
      {/* Header */}
      <div
        className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between border-b"
        style={{ background: 'rgba(15,23,42,0.95)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <span className="material-icons-round text-white" style={{ fontSize: 18 }}>corporate_fare</span>
          </div>
          <span className="text-white font-bold text-sm">PlaNeat — บันทึกข้อมูลประจำวัน</span>
        </div>
        <Link href="/">
          <button className="landing-btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>home</span>
            หน้าหลัก
          </button>
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Recorder info */}
        <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm border border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">ชื่อผู้บันทึก <span className="text-red-500">*</span></label>
              <input type="text" className="form-input" placeholder="กรอกชื่อ" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">วันที่ <span className="text-red-500">*</span></label>
              <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Category panels */}
        {CAT_KEYS.map((cat) => {
          const cs = CAT_STYLE[cat]
          const budgetEntry = budget?.data?.[cat]
          const isOpen = openPanel === cat
          return (
            <div key={cat} className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
              {/* Header */}
              <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors" onClick={() => togglePanel(cat)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: cs.bg }}>
                    <span className="material-icons-round" style={{ fontSize: 18, color: cs.color }}>{cs.icon}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800">{cs.label}</p>
                </div>
                <div className="flex items-center gap-3">
                  {budgetEntry && (
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-slate-400">งบคงเหลือ/เดือน</p>
                      <p className={`text-xs font-bold ${budgetEntry.remainMonth < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {fmt(budgetEntry.remainMonth)}
                      </p>
                    </div>
                  )}
                  <span className="material-icons-round text-slate-400" style={{ fontSize: 20 }}>
                    {isOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </button>

              {/* Budget info strip */}
              {isOpen && budgetEntry && (
                <div className="px-4 py-2 border-t border-slate-50 grid grid-cols-3 gap-2 text-center text-xs" style={{ background: cs.bg + '60' }}>
                  <div>
                    <p className="text-slate-500">ใช้วันนี้</p>
                    <p className="font-bold text-slate-700">{fmt(budgetEntry.spentToday)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">ใช้เดือนนี้</p>
                    <p className="font-bold text-slate-700">{fmt(budgetEntry.spentMonth)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">คงเหลือ/เดือน</p>
                    <p className={`font-bold ${budgetEntry.remainMonth < 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt(budgetEntry.remainMonth)}</p>
                  </div>
                </div>
              )}

              {/* Form */}
              <div className={`form-panel ${isOpen ? 'open' : ''}`}>
                <div className="px-4 pb-4">
                  {panels[cat].map((item, idx) => (
                    <div key={idx} className="item-card rounded-xl p-4 mt-3 border" style={{ background: cs.bg, borderColor: cs.color + '40' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold" style={{ color: cs.color }}>รายการที่ {idx + 1}</span>
                        {panels[cat].length > 1 && (
                          <button onClick={() => removeItem(cat, idx)} className="text-red-400 hover:text-red-600 p-1 rounded-lg">
                            <span className="material-icons-round" style={{ fontSize: 18 }}>delete_outline</span>
                          </button>
                        )}
                      </div>

                      {cat === 'labor' && (
                        <>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div><label className="form-label">จำนวนพนักงาน</label><input type="number" className="form-input" placeholder="10" value={item.workers} onChange={(e) => updateItem(cat, idx, 'workers', e.target.value)} /></div>
                            <div><label className="form-label">ค่าจ้าง (฿/วัน)</label><input type="number" className="form-input" placeholder="500" value={item.dailyWage} onChange={(e) => updateItem(cat, idx, 'dailyWage', e.target.value)} /></div>
                            <div><label className="form-label">ค่า OT (฿)</label><input type="number" className="form-input" placeholder="0" value={item.ot} onChange={(e) => updateItem(cat, idx, 'ot', e.target.value)} /></div>
                          </div>
                          <div><label className="form-label">หมายเหตุ</label><input type="text" className="form-input" placeholder="(ถ้ามี)" value={item.note} onChange={(e) => updateItem(cat, idx, 'note', e.target.value)} /></div>
                        </>
                      )}

                      {cat === 'raw' && (
                        <>
                          <div className="mb-3"><label className="form-label">รายการวัตถุดิบ</label><input type="text" className="form-input" placeholder="ชื่อวัตถุดิบ" value={item.itemName} onChange={(e) => updateItem(cat, idx, 'itemName', e.target.value)} /></div>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div><label className="form-label">จำนวน (กก.)</label><input type="number" className="form-input" placeholder="100" value={item.quantity} onChange={(e) => updateItem(cat, idx, 'quantity', e.target.value)} /></div>
                            <div><label className="form-label">ราคา (฿/กก.)</label><input type="number" className="form-input" placeholder="25" value={item.pricePerKg} onChange={(e) => updateItem(cat, idx, 'pricePerKg', e.target.value)} /></div>
                          </div>
                          <div><label className="form-label">หมายเหตุ</label><input type="text" className="form-input" placeholder="(ถ้ามี)" value={item.note} onChange={(e) => updateItem(cat, idx, 'note', e.target.value)} /></div>
                        </>
                      )}

                      {cat === 'chem' && (
                        <>
                          <div className="mb-3"><label className="form-label">รายการ</label><input type="text" className="form-input" placeholder="ชื่อเคมี/หีบห่อ" value={item.itemName} onChange={(e) => updateItem(cat, idx, 'itemName', e.target.value)} /></div>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div><label className="form-label">จำนวน</label><input type="number" className="form-input" placeholder="10" value={item.quantity} onChange={(e) => updateItem(cat, idx, 'quantity', e.target.value)} /></div>
                            <div><label className="form-label">ราคา (฿)</label><input type="number" className="form-input" placeholder="500" value={item.price} onChange={(e) => updateItem(cat, idx, 'price', e.target.value)} /></div>
                          </div>
                          <div><label className="form-label">หมายเหตุ</label><input type="text" className="form-input" placeholder="(ถ้ามี)" value={item.note} onChange={(e) => updateItem(cat, idx, 'note', e.target.value)} /></div>
                        </>
                      )}

                      {cat === 'repair' && (
                        <>
                          <div className="mb-3"><label className="form-label">รายการซ่อม</label><input type="text" className="form-input" placeholder="เช่น ซ่อมตู้เย็น" value={item.repairItem} onChange={(e) => updateItem(cat, idx, 'repairItem', e.target.value)} /></div>
                          <div className="mb-3"><label className="form-label">ยอดเงินรวม (฿)</label><input type="number" className="form-input" placeholder="0" value={item.totalCost} onChange={(e) => updateItem(cat, idx, 'totalCost', e.target.value)} /></div>
                          <div><label className="form-label">หมายเหตุ</label><input type="text" className="form-input" placeholder="(ถ้ามี)" value={item.note} onChange={(e) => updateItem(cat, idx, 'note', e.target.value)} /></div>
                        </>
                      )}

                      <div className="mt-2 text-right text-xs font-bold" style={{ color: cs.color }}>
                        รวม: {fmt(calcTotal(cat, item))}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between mt-3">
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => addItem(cat)}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>add</span> เพิ่มรายการ
                    </button>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '6px 16px' }} onClick={() => submitCat(cat)} disabled={submitting === cat}>
                      {submitting === cat ? (
                        <><span className="material-icons-round spin" style={{ fontSize: 14 }}>refresh</span>กำลังบันทึก...</>
                      ) : (
                        <><span className="material-icons-round" style={{ fontSize: 14 }}>save</span>บันทึก</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
