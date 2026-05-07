'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

interface Activity {
  _id: string
  accountId: string
  accountName: string
  type: string
  note: string
  language: string
  createdBy: string
  createdAt: string
  nextAction?: string
  nextActionDate?: string
}

const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'visit', 'task']

const TYPE_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  note:    { icon: 'sticky_note_2', color: '#64748b', bg: '#f1f5f9' },
  call:    { icon: 'call',          color: '#0ea5e9', bg: '#e0f2fe' },
  email:   { icon: 'mail',          color: '#8b5cf6', bg: '#ede9fe' },
  meeting: { icon: 'groups',        color: '#f59e0b', bg: '#fef3c7' },
  visit:   { icon: 'place',         color: '#10b981', bg: '#d1fae5' },
  task:    { icon: 'task_alt',      color: '#2563eb', bg: '#dbeafe' },
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

const BLANK = { accountId: '', type: 'note', note: '', language: 'th', nextAction: '', nextActionDate: '' }

export default function ActivityLogPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<Activity[]>([])
  const [accounts, setAccounts] = useState<{ _id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [modal, setModal] = useState<{ open: boolean; data: any }>({ open: false, data: {} })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [ar, acr] = await Promise.all([
        crmB2bApi.getActivities() as any,
        crmB2bApi.getAccounts() as any,
      ])
      setActivities(ar.activities || [])
      setAccounts(acr.accounts || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => activities.filter(a => typeFilter === 'all' || a.type === typeFilter), [activities, typeFilter])

  const groups: Record<string, Activity[]> = {}
  for (const a of filtered) {
    const d = a.createdAt.slice(0, 10)
    if (!groups[d]) groups[d] = []
    groups[d].push(a)
  }
  const days = Object.keys(groups).sort().reverse()

  async function handleSave() {
    setSaving(true)
    try {
      await crmB2bApi.createActivity(modal.data)
      setModal({ open: false, data: {} })
      await load()
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบกิจกรรมนี้?')) return
    await crmB2bApi.deleteActivity(id)
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
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Activity Log</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{filtered.length} กิจกรรม</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
            <option value="all">ทุกประเภท</option>
            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setModal({ open: true, data: { ...BLANK } })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>add</span> บันทึกกิจกรรม
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>ยังไม่มีกิจกรรม — กด "บันทึกกิจกรรม" เพื่อเริ่มต้น</div>
      ) : (
        <div style={{ maxWidth: 980 }}>
          {days.map(day => (
            <div key={day} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', background: '#fff', padding: '6px 12px', borderRadius: 20, border: '1px solid #e2e8f0' }}>
                  {day} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {groups[day].length} รายการ</span>
                </div>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '8px 18px' }}>
                {groups[day].map(a => {
                  const ti = TYPE_ICON[a.type] || TYPE_ICON.note
                  return (
                    <div key={a._id} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: ti.bg, color: ti.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-icons-round" style={{ fontSize: 18 }}>{ti.icon}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                          <div>
                            <button onClick={() => router.push(`/crm-b2b/accounts/${a.accountId}`)} style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 14, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>{a.accountName}</button>
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>{a.type} · @{a.createdBy}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(a.createdAt)}</span>
                            <button onClick={() => handleDelete(a._id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                              <span className="material-icons-round" style={{ fontSize: 14 }}>delete</span>
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{a.note}</div>
                        {a.nextAction && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', padding: '5px 10px', borderRadius: 6 }}>
                            <span className="material-icons-round" style={{ fontSize: 14 }}>arrow_forward</span>
                            <strong>Next:</strong> {a.nextAction}
                            {a.nextActionDate && <span style={{ color: '#94a3b8', marginLeft: 6 }}>· {a.nextActionDate}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(520px,100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>บันทึกกิจกรรม</h3>
              <button onClick={() => setModal({ open: false, data: {} })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}><span className="material-icons-round">close</span></button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บริษัท *</label>
                <select value={modal.data.accountId || ''} onChange={e => setField('accountId', e.target.value)} style={inputStyle}>
                  <option value="">— เลือกบริษัท —</option>
                  {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ประเภท</label>
                <select value={modal.data.type || 'note'} onChange={e => setField('type', e.target.value)} style={inputStyle}>
                  {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บันทึก *</label>
                <textarea value={modal.data.note || ''} onChange={e => setField('note', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="รายละเอียดกิจกรรม..." />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ภาษา</label>
                <select value={modal.data.language || 'th'} onChange={e => setField('language', e.target.value)} style={inputStyle}>
                  {['th', 'en', 'zh', 'ja', 'ko'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Next Action (ถ้ามี)</label>
                <input value={modal.data.nextAction || ''} onChange={e => setField('nextAction', e.target.value)} style={inputStyle} placeholder="สิ่งที่ต้องทำต่อ..." />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>วันที่ Next Action</label>
                <input type="date" value={modal.data.nextActionDate || ''} onChange={e => setField('nextActionDate', e.target.value)} style={inputStyle} />
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
