'use client'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { categoryApi, dynamicDraftApi, budgetApi } from '@/lib/api'
import { fmt, todayIso, isoToThai, monthInputToApi, todayMonth } from '@/lib/utils'
import type { BudgetResponse, ExpenseCategory } from '@/types'
import Swal from 'sweetalert2'

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001').replace(/\/$/, '')

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
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{background:'linear-gradient(135deg,#0f172a,#1e3a8a,#0ea5e9)'}}><span className="material-icons-round spin text-white" style={{fontSize:32}}>refresh</span></div>}><StandaloneInner /></Suspense>
}

function StandaloneInner() {
  const params = useSearchParams()
  const stoken   = params.get('stoken')
  const status   = params.get('status')
  const register = params.get('register')
  const tid      = params.get('tid')
  const lineName = params.get('name') || ''
  const linePic  = params.get('pic') || ''

  const [authState, setAuthState] = useState<'loading'|'login'|'form'|'pending'|'suspended'|'register'|'error'>('loading')
  const [userName, setUserName] = useState('')
  const [userFirstName, setUserFirstName] = useState('')
  const [systemUsername, setSystemUsername] = useState('')
  const [userLineUid, setUserLineUid] = useState('')

  // register form
  const [regFirstName, setRegFirstName] = useState('')
  const [regLastName, setRegLastName]   = useState('')
  const [regUsername, setRegUsername]   = useState('')
  const [regPhone, setRegPhone]         = useState('')
  const [regSaving, setRegSaving]       = useState(false)
  const [regError, setRegError]         = useState('')

  const [date, setDate] = useState(todayIso())
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const [panels, setPanels] = useState<Record<string, Record<string, string>[]>>({})
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  // ─── ตรวจ URL params เมื่อ load ───
  useEffect(() => {
    if (status === 'pending')   { setAuthState('pending');   return }
    if (status === 'suspended') { setAuthState('suspended'); return }
    if (register === 'true') {
      // ตั้งชื่อเริ่มต้นจาก LINE displayName
      const parts = lineName.split(' ')
      setRegFirstName(parts[0] || '')
      setRegLastName(parts.slice(1).join(' ') || '')
      setAuthState('register')
      return
    }
    if (status === 'error' || params.get('error')) { setAuthState('error'); return }

    if (stoken) {
      // มี stoken → verify กับ backend
      fetch(`${API}/api/auth/line/standalone-verify?stoken=${stoken}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setUserName(data.displayName || data.name || data.username)
            setUserFirstName(data.displayName || data.firstName || data.name || data.username)
            setSystemUsername(data.username)
            setUserLineUid(data.lineUid || '')
            const cats: ExpenseCategory[] = data.categories || []
            setCategories(cats)
            const init: Record<string, Record<string, string>[]> = {}
            cats.forEach((c: ExpenseCategory) => { init[c.id] = [] })
            setPanels(init)
            setAuthState('form')
          } else {
            setAuthState('login')
          }
        })
        .catch(() => setAuthState('login'))
    } else {
      setAuthState('login')
    }
  }, [])

  // โหลด budget เมื่อมี categories
  useEffect(() => {
    if (authState !== 'form') return
    budgetApi.getBudget(monthInputToApi(todayMonth())).then((res) => {
      setBudget(res as BudgetResponse)
    }).catch(() => {})
  }, [authState])

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
    if (!userName.trim()) { alert('กรุณาระบุชื่อผู้บันทึก'); return }
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
        username:        systemUsername,
        recorderName:    userFirstName || userName,
        recorderLineUid: userLineUid,
        catId:           cat.id,
        date:            isoToThai(date),
        rows:            items
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

  const bg = { background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }

  // ─── Loading ───
  if (authState === 'loading') return (
    <div className="min-h-screen flex items-center justify-center" style={bg}>
      <span className="material-icons-round spin text-white" style={{ fontSize: 36 }}>refresh</span>
    </div>
  )

  // ─── Login (ยังไม่ได้ผ่าน LINE) ───
  if (authState === 'login') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={bg}>
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#f0fdf4' }}>
          <span className="material-icons-round" style={{ fontSize: 28, color: '#06c755' }}>chat</span>
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">เข้าสู่ระบบด้วย LINE</h2>
        <p className="text-sm text-slate-500 mb-6">เพื่อตรวจสิทธิ์และบันทึกข้อมูลประจำวัน</p>
        <a href={`${API}/api/auth/line/standalone-start`} className="block">
          <button style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#06c755', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="material-icons-round" style={{ fontSize: 20 }}>login</span>
            เข้าสู่ระบบด้วย LINE
          </button>
        </a>
        <Link href="/" className="block mt-4 text-sm text-slate-400 hover:text-slate-600">← กลับหน้าหลัก</Link>
      </div>
    </div>
  )

  // ─── Pending ───
  if (authState === 'pending') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={bg}>
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
        <span className="material-icons-round" style={{ fontSize: 48, color: '#f59e0b' }}>hourglass_top</span>
        <h2 className="text-lg font-bold text-slate-800 mt-3 mb-2">รอการอนุมัติ</h2>
        <p className="text-sm text-slate-500">บัญชีของคุณกำลังรอการอนุมัติจาก IT<br/>ระบบจะแจ้งผ่าน LINE เมื่ออนุมัติแล้ว</p>
        <Link href="/" className="block mt-6 text-sm text-slate-400">← กลับหน้าหลัก</Link>
      </div>
    </div>
  )

  // ─── Suspended ───
  if (authState === 'suspended') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={bg}>
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
        <span className="material-icons-round" style={{ fontSize: 48, color: '#ef4444' }}>block</span>
        <h2 className="text-lg font-bold text-slate-800 mt-3 mb-2">บัญชีถูกระงับ</h2>
        <p className="text-sm text-slate-500">กรุณาติดต่อ IT เพื่อปลดล็อคบัญชี</p>
        <Link href="/" className="block mt-6 text-sm text-slate-400">← กลับหน้าหลัก</Link>
      </div>
    </div>
  )

  // ─── Register (ผู้ใช้ใหม่) ───
  async function handleRegister() {
    if (!regFirstName.trim()) { setRegError('กรุณากรอกชื่อ'); return }
    if (!regUsername.trim())  { setRegError('กรุณากรอก Username'); return }
    if (!regPhone.trim())     { setRegError('กรุณากรอกเบอร์โทรศัพท์'); return }
    setRegSaving(true); setRegError('')
    try {
      const res = await fetch(`${API}/api/auth/line/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: tid, firstName: regFirstName, lastName: regLastName, username: regUsername, phone: regPhone }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAuthState('pending')
      } else {
        setRegError(data.detail || data.message || 'เกิดข้อผิดพลาด')
      }
    } catch { setRegError('เกิดข้อผิดพลาดในการเชื่อมต่อ') }
    finally { setRegSaving(false) }
  }

  if (authState === 'register') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-8" style={bg}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          {linePic && <img src={linePic} alt="" className="w-12 h-12 rounded-full border-2 border-green-200" />}
          <div>
            <h2 className="font-bold text-slate-800">ยินดีต้อนรับ!</h2>
            <p className="text-xs text-slate-500">{lineName}</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4">กรอกข้อมูลเพื่อสมัครสมาชิก</p>

        {regError && <div className="mb-3 p-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200">{regError}</div>}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อ *</label>
              <input value={regFirstName} onChange={e => setRegFirstName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="ชื่อจริง" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">นามสกุล</label>
              <input value={regLastName} onChange={e => setRegLastName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="นามสกุล" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Username *</label>
            <input value={regUsername} onChange={e => setRegUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="เช่น EMP0001" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">เบอร์โทรศัพท์ *</label>
            <input value={regPhone} onChange={e => setRegPhone(e.target.value)} type="tel"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="0812345678" />
          </div>
        </div>

        <button onClick={handleRegister} disabled={regSaving}
          className="mt-5 w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
          {regSaving
            ? <><span className="material-icons-round text-base animate-spin">sync</span>กำลังส่ง...</>
            : <><span className="material-icons-round text-base">send</span>ส่งคำขอสมัครสมาชิก</>}
        </button>
        <Link href="/" className="block text-center text-sm text-slate-400 mt-4">← กลับหน้าหลัก</Link>
      </div>
    </div>
  )

  // ─── Error ───
  if (authState === 'error') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={bg}>
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
        <span className="material-icons-round" style={{ fontSize: 48, color: '#ef4444' }}>error_outline</span>
        <h2 className="text-lg font-bold text-slate-800 mt-3 mb-2">เกิดข้อผิดพลาด</h2>
        <p className="text-sm text-slate-500 mb-4">ยังไม่ได้ตั้งค่า LINE Login หรือ session หมดอายุ</p>
        <Link href="/">
          <button style={{ width: '100%', padding: '10px', borderRadius: 10, background: '#2563eb', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>กลับหน้าหลัก</button>
        </Link>
      </div>
    </div>
  )

  // ─── Form (ผ่าน LINE แล้ว) ───
  return (
    <div className="category-select-page min-h-screen" style={bg}>
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between border-b"
        style={{ position: 'relative', background: 'rgba(15,23,42,0.95)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <span className="material-icons-round text-white" style={{ fontSize: 18 }}>corporate_fare</span>
          </div>
          <div>
            <span className="text-white font-bold text-sm block">PlaNeat — บันทึกข้อมูลประจำวัน</span>
            <span className="text-slate-400 text-xs">สวัสดี, {userName}</span>
          </div>
        </div>
        <Link href="/">
          <button className="landing-btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>home</span>
            หน้าหลัก
          </button>
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6" style={{ position: 'relative', zIndex: 1 }}>
        {/* วันที่ */}
        <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm border border-slate-100">
          <label className="form-label">วันที่ <span className="text-red-500">*</span></label>
          <input
            type="date"
            className="form-input"
            style={{ fontSize: 16, padding: '10px 14px', width: '100%' }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {categories.length === 0 && (
          <div className="text-center py-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <span className="material-icons-round text-slate-300" style={{ fontSize: 40 }}>lock</span>
            <p className="text-slate-500 mt-2 text-sm">คุณยังไม่มีสิทธิ์กรอกข้อมูลในหมวดใด<br/>กรุณาติดต่อ IT เพื่อเพิ่มสิทธิ์</p>
          </div>
        )}

        {/* Category panels */}
        {categories.map((cat) => {
          const budgetEntry = (budget?.data as any)?.[cat.id]
          const isOpen = openPanel === cat.id
          const items = panels[cat.id] || []

          // คำนวณยอดร่าง (preview) real-time ตามที่กรอกแบบฟอร์ม
          const draftTotal = items.reduce((sum, item) => sum + calcTotalDynamic(cat, item), 0)
          const previewSpentMonth = (budgetEntry?.spentMonth || 0) + draftTotal
          const previewRemain = (budgetEntry?.monthlyBudget || 0) - previewSpentMonth
          const remainColor = previewRemain < 0 ? 'text-red-500' : previewSpentMonth / (budgetEntry?.monthlyBudget || 1) >= 0.8 ? 'text-amber-500' : 'text-green-600'

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
                  {budgetEntry?.monthlyBudget > 0 && (
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-slate-400">งบคงเหลือ/เดือน</p>
                      <p className={`text-xs font-bold ${remainColor}`}>{fmt(previewRemain)}</p>
                    </div>
                  )}
                  <span className="material-icons-round text-slate-400" style={{ fontSize: 20 }}>
                    {isOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </button>

              {/* Budget info strip — real-time preview */}
              {isOpen && budgetEntry && (
                <div className="px-4 py-2 border-t border-slate-50 grid grid-cols-3 gap-2 text-center text-xs" style={{ background: cat.color + '10' }}>
                  <div>
                    <p className="text-slate-500">ใช้วันนี้</p>
                    <p className="font-bold text-slate-700">{fmt(budgetEntry.spentToday)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">ใช้เดือนนี้</p>
                    <p className={`font-bold ${draftTotal > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {fmt(previewSpentMonth)}
                      {draftTotal > 0 && <span className="block text-xs font-normal text-slate-400">(+{fmt(draftTotal)} ร่าง)</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">คงเหลือ/เดือน</p>
                    <p className={`font-bold ${remainColor}`}>{fmt(previewRemain)}</p>
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
