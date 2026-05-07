'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

interface Reminder {
  _id: string
  accountId: string
  accountName: string
  message: string
  remindAt: string
  channel: string
  priority: string
  status: string
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#94a3b8',
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const m = Math.floor(abs / 60000)
  if (diff < 0) return `อีก ${m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม.`}`
  if (m < 60) return `${m} นาทีที่แล้ว`
  if (m < 1440) return `${Math.floor(m / 60)} ชม.ที่แล้ว`
  return `${Math.floor(m / 1440)} วันที่แล้ว`
}

const BLANK = { accountId: '', message: '', remindAt: '', channel: 'email', priority: 'medium' }

export default function RemindersPage() {
  const router = useRouter()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [accounts, setAccounts] = useState<{ _id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('today')
  const [modal, setModal] = useState<{ open: boolean; data: any }>({ open: false, data: {} })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [rr, ar] = await Promise.all([
        crmB2bApi.getReminders({ status: 'pending' }) as any,
        crmB2bApi.getAccounts() as any,
      ])
      setReminders(rr.reminders || [])
      setAccounts(ar.accounts || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const buckets: Record<string, Reminder[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [] }
  for (const r of reminders) {
    const d = r.remindAt.slice(0, 10)
    if (d < today) buckets.overdue.push(r)
    else if (d === today) buckets.today.push(r)
    else if (d === tomorrow) buckets.tomorrow.push(r)
    else if (d <= weekEnd) buckets.week.push(r)
    else buckets.later.push(r)
  }

  const TABS = [
    { k: 'overdue',  l: 'เลยกำหนด',      c: '#ef4444' },
    { k: 'today',    l: 'วันนี้',          c: '#f59e0b' },
    { k: 'tomorrow', l: 'พรุ่งนี้',        c: '#0ea5e9' },
    { k: 'week',     l: '7 วันข้างหน้า',  c: '#8b5cf6' },
    { k: 'later',    l: 'ถัดไป',           c: '#64748b' },
  ]

  const list = buckets[tab] || []

  async function handleDone(id: string) {
    await crmB2bApi.doneReminder(id)
    await load()
  }

  async function handleDelete(id: string) {
    await crmB2bApi.deleteReminder(id)
    await load()
  }

  async function handleSave() {
    setSaving(true)
    try {
      await crmB2bApi.createReminder(modal.data)
      setModal({ open: false, data: {} })
      await load()
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  function setField(k: string, v: any) {
    setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Reminders</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{reminders.length} follow-up · {buckets.overdue.length} เลยกำหนด</p>
        </div>
        <button onClick={() => setModal({ open: true, data: { ...BLANK } })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          <span className="material-icons-round" style={{ fontSize: 18 }}>add_alarm</span> เพิ่ม Reminder
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 6, marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, background: tab === t.k ? '#0f172a' : 'transparent', color: tab === t.k ? '#fff' : '#475569', border: 'none', padding: '9px 12px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {t.l}
            {buckets[t.k].length > 0 && (
              <span style={{ background: tab === t.k ? 'rgba(255,255,255,0.2)' : t.c, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11 }}>{buckets[t.k].length}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>กำลังโหลด...</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
            <span className="material-icons-round" style={{ fontSize: 40, marginBottom: 8, display: 'block', color: '#cbd5e1' }}>check_circle</span>
            ไม่มี follow-up ในช่วงนี้
          </div>
        ) : list.map(r => (
          <div key={r._id} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <input type="checkbox" onChange={() => handleDone(r._id)} style={{ width: 18, height: 18, accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: PRIORITY_COLOR[r.priority] || '#94a3b8', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{r.message}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12, color: '#64748b', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => router.push(`/crm-b2b/accounts/${r.accountId}`)} style={{ background: 'transparent', border: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>{r.accountName}</button>
                <span>·</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span className="material-icons-round" style={{ fontSize: 14 }}>{r.channel === 'LINE' ? 'chat' : 'mail'}</span>
                  {r.channel}
                </span>
                <span>·</span>
                <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: r.priority === 'high' ? '#fee2e2' : r.priority === 'medium' ? '#fef3c7' : '#f1f5f9', color: PRIORITY_COLOR[r.priority] }}>{r.priority}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: r.remindAt.slice(0, 10) < today ? '#ef4444' : '#0f172a' }}>{fmtDateTime(r.remindAt)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(r.remindAt)}</div>
            </div>
            <button onClick={() => handleDelete(r._id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, flexShrink: 0 }}>
              <span className="material-icons-round" style={{ fontSize: 18 }}>delete</span>
            </button>
          </div>
        ))}
      </div>

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(480px,100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>เพิ่ม Reminder</h3>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ข้อความ *</label>
                <textarea value={modal.data.message || ''} onChange={e => setField('message', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="เช่น ติดตาม proposal..." />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>วันเวลาแจ้งเตือน *</label>
                <input type="datetime-local" value={modal.data.remindAt || ''} onChange={e => setField('remindAt', e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ช่องทาง</label>
                  <select value={modal.data.channel || 'email'} onChange={e => setField('channel', e.target.value)} style={inputStyle}>
                    <option value="email">Email</option>
                    <option value="LINE">LINE</option>
                    <option value="call">Phone</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ความสำคัญ</label>
                  <select value={modal.data.priority || 'medium'} onChange={e => setField('priority', e.target.value)} style={inputStyle}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
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
