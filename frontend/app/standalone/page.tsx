'use client'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react'
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
    if (f.calcRole === 'qty2') vals['qty2'] = parseFloat(row[f.fieldId] || '0') || 0
    if (f.calcRole === 'rate1') vals['rate1'] = (f as any).presetValue ?? 0
    if (f.calcRole === 'rate2') vals['rate2'] = (f as any).presetValue ?? 0
  })
  const { qty = 0, qty2 = 0, price = 0, addend = 0, fixed = 0, rate1 = 0, rate2 = 0 } = vals as any
  if (cat.formula === 'qty*price') return qty * price
  if (cat.formula === 'qty*price+addend' || cat.formula === 'qty*price+addend2') return qty * price + addend
  if (cat.formula === 'labor_ot') return (qty * rate1) + (qty2 * rate2)
  if (cat.formula === 'fixed') return fixed
  if (cat.formula === 'qty+price') return qty + price
  return fixed || (qty * price + addend)
}

const QUICK_UNITS = ['ถุง', 'กก.', 'กล่อง', 'ลัง', 'ม้วน', 'ใบ', 'ชิ้น', 'ลิตร', 'กระสอบ', 'ถัง', 'แพ็ค', 'แกลลอน']

function suggestUnit(name: string): string {
  const n = name.toLowerCase()
  if (/น้ำตาล|แป้ง|เกลือ|ข้าว/.test(n)) return 'กระสอบ'
  if (/ฟิล์ม|ผ้า|กระดาษ/.test(n)) return 'ม้วน'
  if (/น้ำ|น้ำมัน|สารเคมี|ออกซิเจน|กรด|สาร/.test(n)) return 'ลิตร'
  if (/ยา|เม็ด|แคปซูล/.test(n)) return 'เม็ด'
  if (/ถุง/.test(n)) return 'ถุง'
  if (/กล่อง/.test(n)) return 'กล่อง'
  if (/ลัง/.test(n)) return 'ลัง'
  if (/คน|แรงงาน|ช่าง/.test(n)) return 'คน'
  return ''
}

async function getHistory(catId: string, fieldId: string): Promise<string[]> {
  try {
    const res = await fetch(`${API}/api/field-history?catId=${encodeURIComponent(catId)}&fieldId=${encodeURIComponent(fieldId)}`, { credentials: 'include' })
    const data = await res.json()
    return data.items || []
  } catch { return [] }
}
async function saveHistory(catId: string, fieldId: string, value: string) {
  if (!value.trim()) return
  try {
    await fetch(`${API}/api/field-history`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catId, fieldId, value }) })
  } catch {}
}
async function deleteHistory(catId: string, fieldId: string, value: string) {
  try {
    await fetch(`${API}/api/field-history?catId=${encodeURIComponent(catId)}&fieldId=${encodeURIComponent(fieldId)}&value=${encodeURIComponent(value)}`, { method: 'DELETE', credentials: 'include' })
  } catch {}
}

function AutocompleteInput({ catId, fieldId, value, placeholder, onChange }: {
  catId: string; fieldId: string; value: string; placeholder?: string; onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refreshHistory = () => { getHistory(catId, fieldId).then(setHistory) }
  useEffect(() => { refreshHistory() }, [catId, fieldId])
  useEffect(() => { setSaved(history.includes(value.trim())) }, [value, history])

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = value.trim()
    ? history.filter(h => h.toLowerCase().includes(value.toLowerCase()))
    : history

  function handleBookmark() {
    if (!value.trim()) return
    saveHistory(catId, fieldId, value.trim()).then(refreshHistory)
    setSaved(true)
  }

  function removeItem(v: string, e: React.MouseEvent) {
    e.stopPropagation()
    deleteHistory(catId, fieldId, v).then(refreshHistory)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="form-input" placeholder={placeholder} value={value}
        onChange={e => { onChange(e.target.value); setSaved(false) }}
        onFocus={() => setShow(true)}
      />
      {show && (filtered.length > 0 || (value.trim() && !saved)) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 50, maxHeight: 200, overflowY: 'auto' }}>
          {filtered.map(h => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', cursor: 'pointer', gap: 6 }}
              onMouseDown={e => { e.preventDefault(); onChange(h); setSaved(true); setShow(false) }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
              <span className="material-icons-round" style={{ fontSize: 13, color: '#94a3b8' }}>history</span>
              <span style={{ flex: 1, fontSize: 13, color: '#1e293b' }}>{h}</span>
              <button type="button" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '0 2px', lineHeight: 1 }}
                onMouseDown={e => removeItem(h, e)}>
                <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>
          ))}
          {value.trim() && !saved && (
            <div onMouseDown={e => { e.preventDefault(); handleBookmark(); setShow(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', cursor: 'pointer', borderTop: filtered.length > 0 ? '1px solid #f1f5f9' : 'none', background: '#f7fef9' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#f7fef9')}>
              <span className="material-icons-round" style={{ fontSize: 14, color: '#16a34a' }}>add</span>
              <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>บันทึกรายการใหม่</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
        {cat.fields.filter(f => f.calcRole !== 'note' && f.calcRole !== 'rate1' && f.calcRole !== 'rate2').map(f => {
          const unitKey = `__unit_${f.fieldId}`
          const curUnit = item[unitKey] || ''
          const nameHint = suggestUnit(item[f.fieldId] || '')
          return (
            <div key={f.fieldId}>
              <label className="form-label">
                {f.label}
                {f.unit && f.unit !== '__user__' ? ` (${f.unit})` : ''}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === 'select' ? (
                <select className="form-input" value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)}>
                  <option value="">เลือก...</option>
                  {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'text' ? (
                <AutocompleteInput catId={cat.id} fieldId={f.fieldId} value={item[f.fieldId] || ''} placeholder={f.placeholder} onChange={v => onChange(f.fieldId, v)} />
              ) : (
                <input type={f.type} className="form-input" placeholder={f.placeholder}
                  value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)} />
              )}
              {f.unit === '__user__' && (
                <div style={{ marginTop: 4 }}>
                  <AutocompleteInput catId={cat.id} fieldId={unitKey} value={curUnit}
                    placeholder={nameHint ? `แนะนำ: ${nameHint}` : 'หน่วย เช่น ถุง, กก.'}
                    onChange={v => onChange(unitKey, v)} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 mt-3">
        {cat.fields.filter(f => f.calcRole === 'note').map(f => (
          <div key={f.fieldId}>
            <label className="form-label">{f.label}</label>
            <AutocompleteInput catId={cat.id} fieldId={f.fieldId} value={item[f.fieldId] || ''} placeholder={f.placeholder} onChange={v => onChange(f.fieldId, v)} />
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
  const [specialItems, setSpecialItems] = useState<Record<string, Record<string, string>>>({})
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
        if (f.required && f.calcRole !== 'rate1' && f.calcRole !== 'rate2' && !item[f.fieldId]?.toString().trim()) {
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
        // Submit special expense if filled
        const specialItem = specialItems[cat.id]
        if (cat.hasSpecialExpense && specialItem) {
          const specialFields = cat.specialExpenseFields || []
          const hasData = specialFields.some(f => specialItem[f.fieldId])
          if (hasData) {
            const specialRow: Record<string, string | number> = {}
            specialFields.forEach(f => {
              specialRow[f.fieldId] = f.type === 'number' ? (parseFloat(specialItem[f.fieldId] || '0') || 0) : (specialItem[f.fieldId] || '')
            })
            await dynamicDraftApi.submitPublic({
              username:        systemUsername,
              recorderName:    userFirstName || userName,
              recorderLineUid: userLineUid,
              catId:           cat.id,
              date:            isoToThai(date),
              rows:            [specialRow],
              labelOverride:   cat.specialExpenseName || 'ค่าใช้จ่ายพิเศษ',
            })
            setSpecialItems(prev => { const n = { ...prev }; delete n[cat.id]; return n })
          }
        }
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

          const draftTotal = items.reduce((sum, item) => sum + calcTotalDynamic(cat, item), 0)
          const previewSpentMonth = (budgetEntry?.spentMonth || 0) + draftTotal
          const previewRemain = (budgetEntry?.monthlyBudget || 0) - previewSpentMonth
          const remainColor = previewRemain < 0 ? 'text-red-500' : previewSpentMonth / (budgetEntry?.monthlyBudget || 1) >= 0.8 ? 'text-amber-500' : 'text-green-600'

          // งบสะสมถึงวันนี้
          const _now = new Date()
          const _todayNum = _now.getDate()
          const _daysInMo = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate()
          const _dailyRate = budgetEntry?.dailyRate || (budgetEntry?.monthlyBudget ? budgetEntry.monthlyBudget / _daysInMo : 0)
          const _accumulated = budgetEntry?.monthlyBudget ? Math.min(_dailyRate * _todayNum, budgetEntry.monthlyBudget) : 0
          const _accBalance = _accumulated - previewSpentMonth

          return (
            <div key={cat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
              {/* Header */}
              <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors" onClick={() => togglePanel(cat.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: cat.color + '20' }}>
                    <span className="material-icons-round" style={{ fontSize: 18, color: cat.color }}>{cat.icon || 'receipt'}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800">{cat.name}</p>
                    {budgetEntry?.monthlyBudget > 0 && (
                      <p className="text-xs" style={{ color: _accBalance < 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                        งบสะสมวันนี้ {_accBalance < 0 ? `-${fmt(Math.abs(_accBalance))}` : `+${fmt(_accBalance)}`} ฿
                        <span style={{ color: '#94a3b8', fontWeight: 400 }}> · +{fmt(_dailyRate)}/วัน</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {budgetEntry?.monthlyBudget > 0 && (
                    <div className="text-right">
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

                  {/* ค่าใช้จ่ายพิเศษ — DynamicItemCard */}
                  {cat.hasSpecialExpense && cat.specialExpenseFields && cat.specialExpenseFields.length > 0 && specialItems[cat.id] !== undefined && (() => {
                    const spCat = { ...cat, id: cat.id + '_sp', name: cat.specialExpenseName || 'ค่าใช้จ่ายพิเศษ', formula: (cat.specialExpenseFormula || 'fixed') as ExpenseCategory['formula'], fields: cat.specialExpenseFields as ExpenseCategory['fields'] }
                    const spItem = specialItems[cat.id]
                    return (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 2 }}>
                          <span className="material-icons-round" style={{ fontSize: 15, color: '#d97706' }}>star</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>{cat.specialExpenseName || 'ค่าใช้จ่ายพิเศษ'}</span>
                          <span style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', padding: '1px 7px', borderRadius: 10 }}>ไม่บังคับ</span>
                          <button onClick={() => setSpecialItems(prev => { const n = { ...prev }; delete n[cat.id]; return n })}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>ยกเลิก
                          </button>
                        </div>
                        <div style={{ background: '#fefce8', borderRadius: 12, border: '1px solid #fde68a', padding: 4 }}>
                          <DynamicItemCard cat={spCat as ExpenseCategory} item={spItem} idx={0} total={calcTotalDynamic(spCat as ExpenseCategory, spItem)} canDelete={false}
                            onChange={(fId, v) => setSpecialItems(prev => ({ ...prev, [cat.id]: { ...(prev[cat.id] || {}), [fId]: v } }))}
                            onDelete={() => {}} />
                        </div>
                      </div>
                    )
                  })()}

                  <div className="flex items-center justify-between mt-4">
                    <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => addItem(cat.id)}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>add</span> เพิ่มรายการ
                    </button>
                    {cat.hasSpecialExpense && cat.specialExpenseFields && cat.specialExpenseFields.length > 0 && specialItems[cat.id] === undefined && (
                      <button onClick={() => {
                        const defaults: Record<string, string> = {}
                        ;(cat.specialExpenseFields || []).forEach(f => { defaults[f.fieldId] = '' })
                        setSpecialItems(prev => ({ ...prev, [cat.id]: defaults }))
                      }} style={{ padding: '6px 12px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-icons-round" style={{ fontSize: 14 }}>star</span>เพิ่ม{cat.specialExpenseName || 'ค่าใช้จ่ายพิเศษ'}
                      </button>
                    )}
                    </div>
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
