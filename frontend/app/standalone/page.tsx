'use client'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { categoryApi, dynamicDraftApi, budgetApi } from '@/lib/api'
import { fmt, todayIso, isoToThai, monthInputToApi, todayMonth } from '@/lib/utils'
import type { BudgetResponse, ExpenseCategory } from '@/types'
import Swal from 'sweetalert2'

// ─── Shared Logic for Dynamic Items ───────────────────────────────────────────
function calcTotalDynamic(cat: ExpenseCategory, row: Record<string, string>): number {
  if (!cat) return 0
  const vals: Record<string, number> = {}
  cat.fields.forEach(f => {
    if (['qty','price','addend','fixed'].includes(f.calcRole)) {
      vals[f.calcRole] = parseFloat(row[f.fieldId] || '0') || 0
    }
  })
  const { qty = 0, price = 0, addend = 0, fixed = 0 } = vals
  if (cat.formula === 'qty*price') return qty * price
  if (cat.formula === 'qty*price+addend') return qty * price + addend
  if (cat.formula === 'fixed') return fixed
  if (cat.formula === 'qty+price') return qty + price
  return fixed || (qty * price + addend)
}

function DynamicItemCard({ cat, item, idx, total, canDelete, onChange, onDelete }: {
  cat: ExpenseCategory; item: Record<string, string>; idx: number; total: number
  canDelete: boolean; onChange: (fId: string, v: string) => void; onDelete: () => void
}) {
  return (
    <div className="item-card rounded-xl p-4 mt-3 border" style={{ background: cat.color + '15', borderColor: cat.color + '40' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold" style={{ color: cat.color }}>รายการที่ {idx + 1}</span>
        {canDelete && (
          <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 rounded-lg">
            <span className="material-icons-round" style={{ fontSize: 18 }}>delete_outline</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
        {cat.fields.filter(f => f.calcRole !== 'note').map(f => (
          <div key={f.fieldId}>
            <label className="form-label">{f.label}{f.unit ? ` (${f.unit})` : ''}{f.required && <span className="text-red-500"> *</span>}</label>
            {f.type === 'select' ? (
              <select className="form-input" value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)}>
                <option value="">เลือก...</option>
                {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type} className="form-input" placeholder={f.placeholder}
                value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)} />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {cat.fields.filter(f => f.calcRole === 'note').map(f => (
          <div key={f.fieldId}>
            <label className="form-label">{f.label}</label>
            <input type="text" className="form-input" placeholder={f.placeholder}
              value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="mt-3 text-right text-xs font-bold" style={{ color: cat.color }}>
        รวม: {fmt(total)}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StandalonePage() {
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayIso())
  
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  
  // State panel: catId -> array of item records
  const [panels, setPanels] = useState<Record<string, Record<string, string>[]>>({})
  
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  // Fetch budgets on mount
  useEffect(() => {
    budgetApi.getBudget(monthInputToApi(todayMonth())).then((res) => {
      setBudget(res as BudgetResponse)
    }).catch(() => {})
  }, [])

  // Auto-search categories when name changes (debounce 800ms)
  useEffect(() => {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setCategories([])
      setPanels({})
      return
    }

    const timer = setTimeout(() => {
      setLoadingCats(true)
      categoryApi.getPublic(trimmed).then(res => {
        const r = res as { categories: ExpenseCategory[] }
        setCategories(r.categories || [])
        const init: Record<string, Record<string, string>[]> = {}
        ;(r.categories || []).forEach(cat => { init[cat.id] = [] })
        setPanels(init)
      }).catch(() => {}).finally(() => setLoadingCats(false))
    }, 800)

    return () => clearTimeout(timer)
  }, [name])

  function createEmptyItem(cat: ExpenseCategory): Record<string, string> {
    const item: Record<string, string> = {}
    cat.fields.forEach(f => { item[f.fieldId] = '' })
    return item
  }

  function togglePanel(catId: string) {
    if (openPanel === catId) {
      setOpenPanel(null)
      return
    }
    setOpenPanel(catId)
    // auto add first item if empty
    if (!panels[catId] || panels[catId].length === 0) {
      const cat = categories.find(c => c.id === catId)
      if (cat) {
        setPanels(p => ({ ...p, [catId]: [createEmptyItem(cat)] }))
      }
    }
  }

  function addItem(catId: string) {
    const cat = categories.find(c => c.id === catId)
    if (!cat) return
    setPanels(p => ({ ...p, [catId]: [...(p[catId] || []), createEmptyItem(cat)] }))
  }

  function removeItem(catId: string, idx: number) {
    setPanels(p => {
      const list = [...(p[catId] || [])]
      list.splice(idx, 1)
      return { ...p, [catId]: list }
    })
  }

  function updateItem(catId: string, idx: number, fieldId: string, val: string) {
    setPanels(p => {
      const list = [...(p[catId] || [])]
      if (list[idx]) {
        list[idx] = { ...list[idx], [fieldId]: val }
      }
      return { ...p, [catId]: list }
    })
  }

  async function submitCat(cat: ExpenseCategory) {
    if (!name.trim()) { alert('กรุณาระบุชื่อผู้บันทึก'); return }
    if (!date) { alert('กรุณาเลือกวันที่'); return }
    
    // validate required fields
    const items = panels[cat.id] || []
    if (items.length === 0) { alert('ไม่มีข้อมูลให้บันทึก'); return }
    
    for (const item of items) {
      for (const f of cat.fields) {
        if (f.required && !item[f.fieldId]?.toString().trim()) {
          alert(`กรุณากรอกฟิลด์ "${f.label}" ให้ครบถ้วน`)
          return
        }
      }
    }

    setSubmitting(cat.id)
    try {
      const res = await dynamicDraftApi.submitPublic({
        username: name.trim(),
        catId: cat.id,
        date: isoToThai(date),
        rows: items
      }) as { success: boolean; message: string }

      if (res.success) {
        setPanels(p => ({ ...p, [cat.id]: [] }))
        setOpenPanel(null)
        Swal.fire({ icon: 'success', title: 'ส่งเรื่องสำเร็จ!', text: res.message, timer: 2500, showConfirmButton: false })
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
    <div className="category-select-page min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }}>
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between border-b"
        style={{ position: 'relative', background: 'rgba(15,23,42,0.95)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
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

      <div className="max-w-2xl mx-auto px-4 py-6" style={{ position: 'relative', zIndex: 1 }}>
        {/* Recorder info */}
        <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm border border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">พิมพ์ชื่อของคุณเพื่อค้นหาสิทธิ์ <span className="text-red-500">*</span></label>
              <input type="text" className="form-input" placeholder="กรอกชื่อ" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">วันที่ <span className="text-red-500">*</span></label>
              <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </div>

        {loadingCats && (
          <div className="text-center py-6">
            <span className="material-icons-round spin text-slate-400" style={{ fontSize: 24 }}>refresh</span>
            <p className="text-sm text-slate-500 mt-2">กำลังค้นหาหมวดค่าใช้จ่าย...</p>
          </div>
        )}

        {!loadingCats && name.trim().length >= 2 && categories.length === 0 && (
          <div className="text-center py-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <span className="material-icons-round text-slate-300" style={{ fontSize: 40 }}>lock</span>
            <p className="text-slate-500 mt-2 text-sm">คุณไม่มีสิทธิ์เข้าถึงหมวดหมู่ใดๆ<br/>กรุณาติดต่อบัญชีเพื่อเปิดสิทธิ์</p>
          </div>
        )}

        {/* Category panels */}
        {!loadingCats && categories.map((cat) => {
          const budgetEntry = (budget?.data as any)?.[cat.id]
          const isOpen = openPanel === cat.id
          const items = panels[cat.id] || []
          
          return (
            <div key={cat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
              {/* Header */}
              <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors" onClick={() => togglePanel(cat.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: cat.color + '20' }}>
                    <span className="material-icons-round" style={{ fontSize: 18, color: cat.color }}>{cat.icon || 'receipt'}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800">{cat.name}</p>
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
                <div className="px-4 py-2 border-t border-slate-50 grid grid-cols-3 gap-2 text-center text-xs" style={{ background: cat.color + '10' }}>
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
                  {items.map((item, idx) => (
                    <DynamicItemCard 
                      key={idx} idx={idx} cat={cat} item={item}
                      total={calcTotalDynamic(cat, item)}
                      canDelete={items.length > 1}
                      onChange={(fId, v) => updateItem(cat.id, idx, fId, v)}
                      onDelete={() => removeItem(cat.id, idx)}
                    />
                  ))}

                  <div className="flex items-center justify-between mt-4">
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => addItem(cat.id)}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>add</span> เพิ่มรายการ
                    </button>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '6px 20px', background: cat.color, border: 'none' }} onClick={() => submitCat(cat)} disabled={submitting === cat.id}>
                      {submitting === cat.id ? (
                        <><span className="material-icons-round spin" style={{ fontSize: 14 }}>refresh</span>กำลังส่ง...</>
                      ) : (
                        <><span className="material-icons-round" style={{ fontSize: 14 }}>send</span>ส่งให้อนุมัติ</>
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
