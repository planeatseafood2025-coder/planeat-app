'use client'
import { useState, useEffect, useMemo } from 'react'
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
  return n >= 1_000_000
    ? `฿${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `฿${(n / 1_000).toFixed(0)}K`
    : `฿${n.toLocaleString()}`
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return d.slice(0, 10)
}

const BLANK: Omit<Account, '_id'> = {
  name: '', country: '', city: '', industry: '', tier: 'C', status: 'active',
  assignedTo: '', dealsOpen: 0, dealsValueThb: 0, currency: 'USD',
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

  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; data: Partial<Account> }>({ open: false, mode: 'add', data: {} })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await crmB2bApi.getAccounts() as any
      setAccounts(res.accounts || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const countries = useMemo(() => ['all', ...Array.from(new Set(accounts.map(a => a.country))).sort()], [accounts])

  const filtered = useMemo(() => {
    let list = accounts.filter(a => {
      if (tier !== 'all' && a.tier !== tier) return false
      if (country !== 'all' && a.country !== country) return false
      if (q) {
        const t = q.toLowerCase()
        if (!a.name.toLowerCase().includes(t) && !a.country.toLowerCase().includes(t) && !a.industry.toLowerCase().includes(t)) return false
      }
      return true
    })
    if (sort === 'value-desc') list.sort((a, b) => b.dealsValueThb - a.dealsValueThb)
    else if (sort === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'recent') list.sort((a, b) => (b.lastContact || '').localeCompare(a.lastContact || ''))
    return list
  }, [accounts, q, tier, country, sort])

  function openAdd() {
    setModal({ open: true, mode: 'add', data: { ...BLANK } })
  }

  function openEdit(a: Account) {
    setModal({ open: true, mode: 'edit', data: { ...a } })
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (modal.mode === 'add') {
        await crmB2bApi.createAccount(modal.data)
      } else {
        await crmB2bApi.updateAccount(modal.data._id!, modal.data)
      }
      setModal(m => ({ ...m, open: false }))
      await load()
    } catch (e: any) {
      alert(e.message)
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    await crmB2bApi.deleteAccount(deleteId)
    setDeleteId(null)
    await load()
  }

  function setField(k: string, v: any) {
    setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', background: '#f8fafc', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>บริษัทลูกค้า (B2B)</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{filtered.length} จาก {accounts.length} บริษัท</p>
        </div>
        <button
          onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          <span className="material-icons-round" style={{ fontSize: 18 }}>add</span>
          เพิ่มบริษัท
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <span className="material-icons-round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 18 }}>search</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อบริษัท / ประเทศ / อุตสาหกรรม"
            style={{ width: '100%', paddingLeft: 38, padding: '9px 12px 9px 38px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <select value={tier} onChange={e => setTier(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 120, outline: 'none' }}>
          <option value="all">ทุก Tier</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
        </select>
        <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 160, outline: 'none' }}>
          {countries.map(c => <option key={c} value={c}>{c === 'all' ? 'ทุกประเทศ' : c}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 170, outline: 'none' }}>
          <option value="value-desc">มูลค่าสูง → ต่ำ</option>
          <option value="name-asc">ชื่อ A → Z</option>
          <option value="recent">ติดต่อล่าสุด</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>ไม่พบบริษัท — กด "เพิ่มบริษัท" เพื่อเริ่มต้น</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>บริษัท</th>
                <th style={th}>ประเทศ</th>
                <th style={th}>อุตสาหกรรม</th>
                <th style={th}>Tier</th>
                <th style={{ ...th, textAlign: 'right' }}>ดีลเปิด</th>
                <th style={{ ...th, textAlign: 'right' }}>มูลค่า</th>
                <th style={th}>เซลล์</th>
                <th style={th}>ติดต่อล่าสุด</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a._id} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onClick={() => router.push(`/crm-b2b/accounts/${a._id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#dbeafe,#93c5fd)', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                        {a.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.city}{a.city && a.currency ? ' · ' : ''}{a.currency}</div>
                      </div>
                    </div>
                  </td>
                  <td style={td}>{a.country}</td>
                  <td style={{ ...td, color: '#64748b' }}>{a.industry}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: TIER_COLOR[a.tier]?.bg || '#f1f5f9', color: TIER_COLOR[a.tier]?.color || '#475569' }}>
                      Tier {a.tier}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{a.dealsOpen}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmtTHB(a.dealsValueThb)}</td>
                  <td style={{ ...td, color: '#64748b' }}>@{a.assignedTo}</td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{fmtDate(a.lastContact)}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); openEdit(a) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, borderRadius: 6 }}>
                        <span className="material-icons-round" style={{ fontSize: 17 }}>edit</span>
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleteId(a._id) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 6 }}>
                        <span className="material-icons-round" style={{ fontSize: 17 }}>delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(680px,100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{modal.mode === 'add' ? 'เพิ่มบริษัทใหม่' : 'แก้ไขบริษัท'}</h3>
              <button onClick={() => setModal(m => ({ ...m, open: false }))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([
                ['name', 'ชื่อบริษัท', 'text'],
                ['industry', 'อุตสาหกรรม', 'text'],
                ['country', 'ประเทศ', 'text'],
                ['city', 'เมือง', 'text'],
                ['currency', 'สกุลเงิน', 'text'],
                ['paymentTerms', 'เงื่อนไขชำระ', 'text'],
                ['website', 'Website', 'text'],
                ['assignedTo', 'เซลล์ (username)', 'text'],
              ] as [string, string, string][]).map(([k, label, type]) => (
                <div key={k}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input
                    type={type}
                    value={(modal.data as any)[k] || ''}
                    onChange={e => setField(k, e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tier</label>
                <select value={modal.data.tier || 'C'} onChange={e => setField('tier', e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                  <option value="A">A — Top</option>
                  <option value="B">B — Mid</option>
                  <option value="C">C — Standard</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>สถานะ</label>
                <select value={modal.data.status || 'active'} onChange={e => setField('status', e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="prospect">Prospect</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>พิกัด (lon, lat) — ใช้แสดงบน Globe</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    placeholder="Longitude"
                    value={modal.data.coordinates?.[0] ?? 0}
                    onChange={e => setField('coordinates', [parseFloat(e.target.value) || 0, modal.data.coordinates?.[1] ?? 0])}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
                  />
                  <input
                    type="number"
                    placeholder="Latitude"
                    value={modal.data.coordinates?.[1] ?? 0}
                    onChange={e => setField('coordinates', [modal.data.coordinates?.[0] ?? 0, parseFloat(e.target.value) || 0])}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>หมายเหตุ</label>
                <textarea
                  value={modal.data.notes || ''}
                  onChange={e => setField('notes', e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(m => ({ ...m, open: false }))} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>ยืนยันการลบ</div>
            <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>คุณแน่ใจหรือไม่ว่าต้องการลบบริษัทนี้? ข้อมูลที่เกี่ยวข้องจะถูกลบทั้งหมด</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>ยกเลิก</button>
              <button onClick={handleDelete} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
