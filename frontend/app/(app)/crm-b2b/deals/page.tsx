'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

interface Deal {
  _id: string
  accountId: string
  accountName: string
  title: string
  value: number
  currency: string
  valueThb: number
  stage: string
  probability: number
  assignedTo: string
  expectedCloseDate?: string
  notes?: string
  createdAt: string
}

const STAGES = [
  { key: 'lead',       label: 'Lead',       color: '#94a3b8' },
  { key: 'qualified',  label: 'Qualified',  color: '#60a5fa' },
  { key: 'proposal',   label: 'Proposal',   color: '#a78bfa' },
  { key: 'negotiation',label: 'Negotiation',color: '#f59e0b' },
  { key: 'won',        label: 'Won',        color: '#10b981' },
  { key: 'lost',       label: 'Lost',       color: '#ef4444' },
]

function fmtTHB(n: number) {
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `฿${(n / 1_000).toFixed(0)}K`
  return `฿${n.toLocaleString()}`
}

const BLANK_DEAL = { accountId: '', title: '', value: 0, currency: 'USD', valueThb: 0, stage: 'lead', probability: 10, assignedTo: '', expectedCloseDate: '', notes: '' }

export default function DealsPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [accounts, setAccounts] = useState<{ _id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; data: Partial<Deal> }>({ open: false, data: {} })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [dr, ar] = await Promise.all([
        crmB2bApi.getDeals() as any,
        crmB2bApi.getAccounts() as any,
      ])
      setDeals(dr.deals || [])
      setAccounts(ar.accounts || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const assignees = useMemo(() => ['all', ...Array.from(new Set(deals.map(d => d.assignedTo).filter(Boolean)))], [deals])
  const filtered = useMemo(() => deals.filter(d => assigneeFilter === 'all' || d.assignedTo === assigneeFilter), [deals, assigneeFilter])
  const openDeals = filtered.filter(d => !['won', 'lost'].includes(d.stage))
  const pipelineThb = openDeals.reduce((s, d) => s + d.valueThb, 0)

  async function handleDrop(stageKey: string) {
    if (!draggingId) return
    setDeals(ds => ds.map(d => d._id === draggingId ? { ...d, stage: stageKey } : d))
    await crmB2bApi.updateDeal(draggingId, { stage: stageKey })
    setDraggingId(null); setOverStage(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await crmB2bApi.createDeal(modal.data)
      setModal({ open: false, data: {} })
      await load()
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบดีลนี้?')) return
    await crmB2bApi.deleteDeal(id)
    await load()
  }

  function setField(k: string, v: any) {
    setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Deal Pipeline</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Pipeline รวม {fmtTHB(pipelineThb)} · {openDeals.length} ดีลเปิด</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
            {assignees.map(a => <option key={a} value={a}>{a === 'all' ? 'เซลล์ทุกคน' : `@${a}`}</option>)}
          </select>
          <button onClick={() => setModal({ open: true, data: { ...BLANK_DEAL } })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>add</span> เพิ่มดีล
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px,1fr))`, gap: 12, minWidth: 1320 }}>
            {STAGES.map(stage => {
              const items = filtered.filter(d => d.stage === stage.key)
              const sumThb = items.reduce((s, d) => s + d.valueThb, 0)
              const isOver = overStage === stage.key
              return (
                <div key={stage.key}
                  onDragOver={e => { e.preventDefault(); setOverStage(stage.key) }}
                  onDragLeave={() => setOverStage(null)}
                  onDrop={() => handleDrop(stage.key)}
                  style={{ background: isOver ? '#eff6ff' : '#f4f7fa', border: isOver ? '2px dashed #2563eb' : '1px solid #e2e8f0', borderRadius: 14, padding: 10, minHeight: 500 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, display: 'inline-block' }} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{stage.label}</span>
                      <span style={{ fontSize: 12, color: '#64748b', background: '#fff', borderRadius: 8, padding: '1px 7px' }}>{items.length}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{fmtTHB(sumThb)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(d => (
                      <div key={d._id}
                        draggable
                        onDragStart={() => setDraggingId(d._id)}
                        onDragEnd={() => { setDraggingId(null); setOverStage(null) }}
                        style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', opacity: draggingId === d._id ? 0.5 : 1 }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 3, lineHeight: 1.3 }}>{d.title}</div>
                        <button onClick={() => router.push(`/crm-b2b/accounts/${d.accountId}`)} style={{ background: 'transparent', border: 'none', padding: 0, color: '#2563eb', fontSize: 11, cursor: 'pointer', marginBottom: 8 }}>{d.accountName}</button>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{d.currency} {d.value.toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmtTHB(d.valueThb)}</div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 10, color: '#94a3b8' }}>
                            {d.expectedCloseDate?.slice(0, 10) || '—'}
                          </div>
                        </div>
                        <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ width: `${d.probability}%`, height: '100%', background: stage.color }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                          <span>@{d.assignedTo} · {d.probability}%</span>
                          <button onClick={() => handleDelete(d._id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                            <span className="material-icons-round" style={{ fontSize: 14 }}>delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 12 }}>— ว่าง —</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(560px,100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>เพิ่มดีลใหม่</h3>
              <button onClick={() => setModal({ open: false, data: {} })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}><span className="material-icons-round">close</span></button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บริษัท *</label>
                <select value={modal.data.accountId || ''} onChange={e => setField('accountId', e.target.value)} style={inputStyle}>
                  <option value="">— เลือกบริษัท —</option>
                  {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อดีล *</label>
                <input value={modal.data.title || ''} onChange={e => setField('title', e.target.value)} style={inputStyle} placeholder="เช่น Q3 Bulk Order" />
              </div>
              {([['value', 'มูลค่า', 'number'], ['currency', 'สกุลเงิน', 'text'], ['valueThb', 'มูลค่า (THB)', 'number'], ['assignedTo', 'เซลล์ (username)', 'text']] as [string, string, string][]).map(([k, label, type]) => (
                <div key={k}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input type={type} value={(modal.data as any)[k] ?? ''} onChange={e => setField(k, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Stage</label>
                <select value={modal.data.stage || 'lead'} onChange={e => setField('stage', e.target.value)} style={inputStyle}>
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>โอกาสปิด (%)</label>
                <input type="number" min={0} max={100} value={modal.data.probability ?? 10} onChange={e => setField('probability', parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>วันที่คาดปิด</label>
                <input type="date" value={modal.data.expectedCloseDate || ''} onChange={e => setField('expectedCloseDate', e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal({ open: false, data: {} })} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
