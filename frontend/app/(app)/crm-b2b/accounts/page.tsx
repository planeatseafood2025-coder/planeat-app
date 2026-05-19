'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

interface Account {
  _id: string
  name: string
  country: string
  city: string
  industry: string
  tier: string
  status: string
  assignedTo: string
  dealsOpen: number
  dealsValueThb: number
  lastContact?: string
  currency: string
  paymentTerms: string
  website?: string
  notes?: string
  tags: string[]
  coordinates: number[]
}

const TIER_COLOR: Record<string, { bg: string; color: string }> = {
  A: { bg: '#fef3c7', color: '#b45309' },
  B: { bg: '#dbeafe', color: '#1d4ed8' },
  C: { bg: '#f1f5f9', color: '#475569' },
}

function fmtTHB(n: number) {
  return n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `฿${(n / 1_000).toFixed(0)}K` : `฿${n.toLocaleString()}`
}

function fmtDate(d?: string) {
  if (!d) return '-'
  return d.slice(0, 10)
}

const BLANK: Omit<Account, '_id'> = {
  name: '', country: '', city: '', industry: '', tier: 'C', status: 'active',
  assignedTo: '', dealsOpen: 0, dealsValueThb: 0, currency: 'THB',
  paymentTerms: 'NET 30', tags: [], coordinates: [0, 0],
}

export default function AccountsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tier, setTier] = useState('all')
  const [country, setCountry] = useState('all')
  const [sort, setSort] = useState('value-desc')
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data: Partial<Account> }>({ open: false, mode: 'add', data: {} })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await crmB2bApi.getAccounts({ tier, country, q, sort, page, perPage }) as any
      setAccounts(res.accounts || [])
      const totalValue = Number(res.total ?? res.accounts?.length ?? 0)
      setTotal(totalValue)
      setTotalPages(Math.max(1, Number((res.totalPages ?? Math.ceil(totalValue / perPage)) || 1)))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { void load() }, [tier, country, q, sort, page, perPage])

  const countries = ['all', ...Array.from(new Set(accounts.map(a => a.country).filter(Boolean))).sort()]

  async function handleSave() {
    setSaving(true)
    try {
      if (modal.mode === 'add') await crmB2bApi.createAccount(modal.data)
      else await crmB2bApi.updateAccount(modal.data._id!, modal.data)
      setModal(m => ({ ...m, open: false }))
      await load()
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    await crmB2bApi.deleteAccount(deleteId)
    setDeleteId(null)
    await load()
  }

  const start = total === 0 ? 0 : (page - 1) * perPage + 1
  const end = Math.min(page * perPage, total)

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>บริษัทลูกค้า (B2B)</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{accounts.length} รายการ / ทั้งหมด {total} รายการ</p>
        </div>
        <button onClick={() => setModal({ open: true, mode: 'add', data: { ...BLANK } })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          <span className="material-icons-round" style={{ fontSize: 18 }}>add</span>
          เพิ่มบริษัท
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <span className="material-icons-round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 18 }}>search</span>
          <input value={q} onChange={e => { setPage(1); setQ(e.target.value) }} placeholder="ค้นหาชื่อบริษัท / ประเทศ / อุตสาหกรรม" style={{ width: '100%', padding: '9px 12px 9px 38px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
        </div>
        <select value={tier} onChange={e => { setPage(1); setTier(e.target.value) }} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 120 }}>
          <option value="all">ทุก Tier</option><option value="A">Tier A</option><option value="B">Tier B</option><option value="C">Tier C</option>
        </select>
        <select value={country} onChange={e => { setPage(1); setCountry(e.target.value) }} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 160 }}>
          {countries.map(c => <option key={c} value={c}>{c === 'all' ? 'ทุกประเทศ' : c}</option>)}
        </select>
        <select value={sort} onChange={e => { setPage(1); setSort(e.target.value) }} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 170 }}>
          <option value="value-desc">มูลค่าสูง → ต่ำ</option><option value="name-asc">ชื่อ A → Z</option><option value="recent">ติดต่อล่าสุด</option>
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#2563eb', fontWeight: 600, fontSize: 14 }}>กำลังแสดง {start}-{end} จาก {total} รายการ</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setPage(1)} disabled={page <= 1}>{'«'}</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>{'‹'}</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const center = Math.min(Math.max(page - 2, 1), Math.max(totalPages - 4, 1))
            return center + i
          }).map(pn => (
            <button key={pn} onClick={() => setPage(pn)} style={{ background: pn === page ? '#2563eb' : '#fff', color: pn === page ? '#fff' : '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px' }}>{pn}</button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{'›'}</button>
          <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}>{'»'}</button>
          <span style={{ marginLeft: 8, color: '#64748b' }}>หน้า {page}/{totalPages}</span>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}><div style={{ maxHeight: 620, overflowY: 'auto' }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>กำลังโหลด...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ textAlign:'left',padding:'12px 14px' }}>บริษัท</th><th style={{ textAlign:'left',padding:'12px 14px' }}>ประเทศ</th><th style={{ textAlign:'left',padding:'12px 14px' }}>อุตสาหกรรม</th><th style={{ textAlign:'left',padding:'12px 14px', whiteSpace: 'nowrap' }}>Tier</th><th style={{ textAlign:'right',padding:'12px 14px', whiteSpace: 'nowrap' }}>ดีลเปิด</th><th style={{ textAlign:'right',padding:'12px 14px', whiteSpace: 'nowrap' }}>มูลค่า</th><th style={{ textAlign:'left',padding:'12px 14px', whiteSpace: 'nowrap' }}>เซลล์</th><th style={{ textAlign:'left',padding:'12px 14px', whiteSpace: 'nowrap' }}>ติดต่อล่าสุด</th></tr></thead>
            <tbody>
              {accounts.map(a => <tr key={a._id} onClick={() => router.push(`/crm-b2b/accounts/${a._id}`)} style={{ borderTop:'1px solid #f1f5f9', cursor:'pointer' }}><td style={{ padding:'12px 14px' }}>{a.name}</td><td style={{ padding:'12px 14px' }}>{a.country || '-'}</td><td style={{ padding:'12px 14px' }}>{a.industry || '-'}</td><td style={{ padding:'12px 14px', whiteSpace: 'nowrap' }}><span style={{ padding:'2px 8px', borderRadius:6, background:TIER_COLOR[a.tier]?.bg || '#f1f5f9', color:TIER_COLOR[a.tier]?.color || '#475569', whiteSpace: 'nowrap' }}>Tier {a.tier}</span></td><td style={{ padding:'12px 14px', textAlign:'right', whiteSpace: 'nowrap' }}>{a.dealsOpen}</td><td style={{ padding:'12px 14px', textAlign:'right', fontWeight:700, whiteSpace: 'nowrap' }}>{fmtTHB(a.dealsValueThb)}</td><td style={{ padding:'12px 14px', whiteSpace: 'nowrap' }}>@{a.assignedTo || 'ฮอต'}</td><td style={{ padding:'12px 14px', whiteSpace: 'nowrap' }}>{fmtDate(a.lastContact)}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </div>
  )
}
