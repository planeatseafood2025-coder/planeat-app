'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

interface Contact {
  _id: string; accountId: string; accountName?: string
  firstName: string; lastName: string; position: string; department: string
  email: string; phone: string; isPrimary: boolean
  preferredLanguage: string; lineUid?: string; notes?: string
}
interface Activity {
  _id: string; type: string; note: string; createdBy: string; createdAt: string
  nextAction?: string; nextActionDate?: string
}

const LANG_LABEL: Record<string, string> = { en: 'English', th: 'ไทย', zh: '中文', ja: '日本語', ar: 'عربي', ko: '한국어' }
const LANG_FLAG: Record<string, string>  = { en: '🇬🇧', th: '🇹🇭', zh: '🇨🇳', ja: '🇯🇵', ar: '🇸🇦', ko: '🇰🇷' }
const AVATAR_COLORS = ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1']
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
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

export default function ContactDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  const [actModal, setActModal] = useState(false)
  const [actForm, setActForm] = useState({ type: 'note', note: '', nextAction: '', nextActionDate: '' })
  const [actSaving, setActSaving] = useState(false)

  const [emailModal, setEmailModal] = useState(false)
  const [emailForm, setEmailForm] = useState({ subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cr, ar, accr] = await Promise.all([
        crmB2bApi.getContacts() as any,
        crmB2bApi.getActivities({ contactId: id }) as any,
        crmB2bApi.getAccounts() as any,
      ])
      const found = (cr.contacts || []).find((c: any) => c._id === id)
      if (found) {
        const accs: any[] = accr.accounts || []
        found.accountName = accs.find((a: any) => a._id === found.accountId)?.name || found.accountId
        setContact(found)
      }
      setActivities((ar.activities || []).filter((a: any) => a.contactId === id))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleAddActivity() {
    if (!actForm.note.trim()) return
    setActSaving(true)
    try {
      await crmB2bApi.createActivity({ contactId: id, accountId: contact?.accountId, ...actForm })
      setActModal(false)
      setActForm({ type: 'note', note: '', nextAction: '', nextActionDate: '' })
      load()
    } catch {}
    setActSaving(false)
  }

  async function handleSendEmail() {
    if (!emailForm.subject.trim() || !emailForm.body.trim()) return
    setSending(true)
    setEmailResult(null)
    try {
      const token = localStorage.getItem('token') || ''
      const res = await fetch('/api/crm-b2b/send-contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: contact?.email,
          toName: `${contact?.firstName} ${contact?.lastName}`,
          subject: emailForm.subject,
          body: emailForm.body,
        }),
      }).then(r => r.json())
      if (res.success) {
        setEmailResult({ ok: true, msg: `ส่งอีเมลถึง ${contact?.email} สำเร็จ` })
        setEmailForm({ subject: '', body: '' })
        await crmB2bApi.createActivity({
          contactId: id, accountId: contact?.accountId,
          type: 'email', note: `ส่งอีเมล: ${emailForm.subject}`,
        })
        load()
      } else {
        setEmailResult({ ok: false, msg: res.message || 'ส่งอีเมลไม่สำเร็จ' })
      }
    } catch (e: any) {
      setEmailResult({ ok: false, msg: e.message || 'เกิดข้อผิดพลาด' })
    }
    setSending(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <span className="material-icons-round spin text-blue-400" style={{ fontSize: 36 }}>refresh</span>
    </div>
  )
  if (!contact) return <div className="text-center py-24 text-slate-400">ไม่พบข้อมูลผู้ติดต่อ</div>

  const fullName = `${contact.firstName} ${contact.lastName}`
  const bg = avatarColor(fullName)

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        <span onClick={() => router.push('/crm-b2b/accounts')} style={{ cursor: 'pointer', color: '#3b82f6' }}>Accounts</span>
        <span className="material-icons-round" style={{ fontSize: 14 }}>chevron_right</span>
        <span onClick={() => router.push(`/crm-b2b/accounts/${contact.accountId}`)} style={{ cursor: 'pointer', color: '#3b82f6' }}>{contact.accountName}</span>
        <span className="material-icons-round" style={{ fontSize: 14 }}>chevron_right</span>
        <span style={{ color: '#1e293b', fontWeight: 600 }}>{fullName}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{fullName}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
            {contact.position}{contact.department ? ` · ${contact.department}` : ''} · {contact.accountName}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setEmailModal(true)} disabled={!contact.email}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: contact.email ? 'pointer' : 'not-allowed', fontSize: 14, color: '#475569', opacity: contact.email ? 1 : 0.4 }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>mail</span> ส่งอีเมล
          </button>
          <button onClick={() => router.push('/crm-b2b/contacts')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: '#3b82f6', cursor: 'pointer', fontSize: 14, color: '#fff', fontWeight: 600 }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>arrow_back</span> กลับ
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Left card */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 auto 12px' }}>
              {contact.firstName[0]?.toUpperCase()}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{fullName}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{contact.position}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              {contact.isPrimary && (
                <span style={{ background: '#fef3c7', color: '#b45309', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>primary</span>
              )}
              {contact.preferredLanguage && (
                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>
                  {LANG_FLAG[contact.preferredLanguage]} {LANG_LABEL[contact.preferredLanguage] || contact.preferredLanguage}
                </span>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>ช่องทางติดต่อ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {contact.phone && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="material-icons-round" style={{ fontSize: 18, color: '#10b981', marginTop: 1 }}>call</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{contact.phone}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>โทร</div>
                </div>
              </div>
            )}
            {contact.email && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="material-icons-round" style={{ fontSize: 18, color: '#8b5cf6', marginTop: 1 }}>mail</span>
                <div>
                  <a href={`mailto:${contact.email}`} style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>{contact.email}</a>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>อีเมล</div>
                </div>
              </div>
            )}
            {contact.lineUid && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="material-icons-round" style={{ fontSize: 18, color: '#06b6d4', marginTop: 1 }}>chat</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{contact.lineUid}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>LINE UID</div>
                </div>
              </div>
            )}
          </div>
          {contact.notes && (
            <div style={{ marginTop: 20, padding: '10px 12px', background: '#fffbeb', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
              {contact.notes}
            </div>
          )}
        </div>

        {/* Right: activity */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>ประวัติการสื่อสาร</div>
            <button onClick={() => setActModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <span className="material-icons-round" style={{ fontSize: 16 }}>add</span> เพิ่มกิจกรรม
            </button>
          </div>
          {activities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <span className="material-icons-round" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>history</span>
              ยังไม่มีประวัติการสื่อสาร
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activities.map(a => {
                const ti = TYPE_ICON[a.type] || TYPE_ICON.note
                return (
                  <div key={a._id} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: ti.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-icons-round" style={{ fontSize: 18, color: ti.color }}>{ti.icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{a.type} · {a.createdBy}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(a.createdAt)}</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>{a.note}</p>
                      {a.nextAction && (
                        <div style={{ marginTop: 6, padding: '4px 10px', background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                          ⏭ Next: {a.nextAction}
                          {a.nextActionDate && <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 600 }}>{a.nextActionDate}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity Modal */}
      {actModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setActModal(false) }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>เพิ่มกิจกรรม</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {['note','call','email','meeting','visit','task'].map(t => (
                <button key={t} onClick={() => setActForm(f => ({ ...f, type: t }))}
                  style={{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${actForm.type === t ? '#3b82f6' : '#e2e8f0'}`, background: actForm.type === t ? '#eff6ff' : '#fff', color: actForm.type === t ? '#1d4ed8' : '#475569', fontSize: 13, cursor: 'pointer', fontWeight: actForm.type === t ? 700 : 400 }}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={actForm.note} onChange={e => setActForm(f => ({ ...f, note: e.target.value }))}
              placeholder="รายละเอียด..." rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
            <input value={actForm.nextAction} onChange={e => setActForm(f => ({ ...f, nextAction: e.target.value }))}
              placeholder="Next action (ถ้ามี)" type="text"
              style={{ width: '100%', marginTop: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
            <input value={actForm.nextActionDate} onChange={e => setActForm(f => ({ ...f, nextActionDate: e.target.value }))}
              type="date"
              style={{ width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setActModal(false)} style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14 }}>ยกเลิก</button>
              <button onClick={handleAddActivity} disabled={actSaving}
                style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {actSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setEmailModal(false); setEmailResult(null) } }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>ส่งอีเมล</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>ถึง: <strong>{contact.email}</strong></p>
            {emailResult && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: emailResult.ok ? '#f0fdf4' : '#fef2f2', color: emailResult.ok ? '#15803d' : '#dc2626', fontSize: 13, marginBottom: 16 }}>
                {emailResult.ok ? '✅' : '❌'} {emailResult.msg}
              </div>
            )}
            <input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="หัวเรื่อง" type="text"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none', marginBottom: 10 }} />
            <textarea value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
              placeholder="เนื้อหาอีเมล..." rows={6}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setEmailModal(false); setEmailResult(null) }}
                style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14 }}>ยกเลิก</button>
              <button onClick={handleSendEmail} disabled={sending || !emailForm.subject.trim() || !emailForm.body.trim()}
                style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (sending || !emailForm.subject.trim() || !emailForm.body.trim()) ? 0.6 : 1 }}>
                {sending ? 'กำลังส่ง...' : '📧 ส่งอีเมล'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
