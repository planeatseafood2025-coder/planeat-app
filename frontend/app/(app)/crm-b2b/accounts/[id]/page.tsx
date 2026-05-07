'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

interface Account {
  _id: string; name: string; industry: string; country: string; city: string
  tier: string; status: string; assignedTo: string; currency: string
  paymentTerms: string; timezone: string; language: string; website?: string
  notes?: string; tags: string[]; coordinates: number[]
  dealsOpen: number; dealsValueThb: number; lastContact?: string
}
interface Contact {
  _id: string; firstName: string; lastName: string; position: string
  department: string; email: string; phone: string; isPrimary: boolean
  preferredLanguage: string; notes?: string
}
interface Deal {
  _id: string; title: string; value: number; currency: string; valueThb: number
  stage: string; probability: number; assignedTo: string; expectedCloseDate?: string
}
interface Activity {
  _id: string; type: string; note: string; createdBy: string; createdAt: string
  nextAction?: string; nextActionDate?: string
}

const STAGE_COLOR: Record<string, string> = {
  lead: '#94a3b8', qualified: '#60a5fa', proposal: '#a78bfa',
  negotiation: '#f59e0b', won: '#10b981', lost: '#ef4444',
}
const TIER_COLOR: Record<string, { bg: string; color: string }> = {
  A: { bg: '#fef3c7', color: '#b45309' },
  B: { bg: '#dbeafe', color: '#1d4ed8' },
  C: { bg: '#f1f5f9', color: '#475569' },
}
const TYPE_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  note: { icon: 'sticky_note_2', color: '#64748b', bg: '#f1f5f9' },
  call: { icon: 'call', color: '#0ea5e9', bg: '#e0f2fe' },
  email: { icon: 'mail', color: '#8b5cf6', bg: '#ede9fe' },
  meeting: { icon: 'groups', color: '#f59e0b', bg: '#fef3c7' },
  visit: { icon: 'place', color: '#10b981', bg: '#d1fae5' },
  task: { icon: 'task_alt', color: '#2563eb', bg: '#dbeafe' },
}

function fmtTHB(n: number) {
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `฿${(n / 1_000).toFixed(0)}K`
  return `฿${n.toLocaleString()}`
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'visit', 'task']
const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost']

export default function AccountDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [account, setAccount] = useState<Account | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  // Modals
  const [actModal, setActModal] = useState(false)
  const [actData, setActData] = useState<any>({ type: 'note', note: '', language: 'th' })
  const [dealModal, setDealModal] = useState(false)
  const [dealData, setDealData] = useState<any>({ title: '', value: 0, currency: 'USD', valueThb: 0, stage: 'lead', probability: 10, assignedTo: '' })
  const [contactModal, setContactModal] = useState(false)
  const [contactData, setContactData] = useState<any>({ firstName: '', lastName: '', position: '', department: '', email: '', phone: '', isPrimary: false, preferredLanguage: 'en' })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [acr, cr, dr, ar] = await Promise.all([
        crmB2bApi.getAccount(id) as any,
        crmB2bApi.getContacts(id) as any,
        crmB2bApi.getDeals({ accountId: id }) as any,
        crmB2bApi.getActivities({ accountId: id }) as any,
      ])
      setAccount(acr)
      setContacts(cr.contacts || [])
      setDeals(dr.deals || [])
      setActivities(ar.activities || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { if (id) load() }, [id])

  async function saveActivity() {
    setSaving(true)
    try {
      await crmB2bApi.createActivity({ ...actData, accountId: id })
      setActModal(false)
      setActData({ type: 'note', note: '', language: 'th' })
      await load()
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function saveDeal() {
    setSaving(true)
    try {
      await crmB2bApi.createDeal({ ...dealData, accountId: id })
      setDealModal(false)
      setDealData({ title: '', value: 0, currency: 'USD', valueThb: 0, stage: 'lead', probability: 10, assignedTo: '' })
      await load()
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function saveContact() {
    setSaving(true)
    try {
      await crmB2bApi.createContact({ ...contactData, accountId: id })
      setContactModal(false)
      setContactData({ firstName: '', lastName: '', position: '', department: '', email: '', phone: '', isPrimary: false, preferredLanguage: 'en' })
      await load()
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  async function deleteActivity(aid: string) {
    await crmB2bApi.deleteActivity(aid)
    await load()
  }

  async function deleteDeal(did: string) {
    if (!confirm('ลบดีลนี้?')) return
    await crmB2bApi.deleteDeal(did)
    await load()
  }

  async function deleteContact(cid: string) {
    if (!confirm('ลบผู้ติดต่อนี้?')) return
    await crmB2bApi.deleteContact(cid)
    await load()
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>กำลังโหลด...</div>
  if (!account) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>ไม่พบบริษัท</div>

  const tc = TIER_COLOR[account.tier] || TIER_COLOR.C

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Breadcrumb + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#64748b' }}>
        <button onClick={() => router.push('/crm-b2b/accounts')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, padding: 0 }}>Accounts</button>
        <span className="material-icons-round" style={{ fontSize: 16 }}>chevron_right</span>
        <span style={{ color: '#0f172a', fontWeight: 600 }}>{account.name}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg,#dbeafe,#60a5fa)', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, flexShrink: 0 }}>
            {account.name[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{account.name}</h1>
              <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: tc.bg, color: tc.color }}>Tier {account.tier}</span>
              <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: account.status === 'active' ? '#d1fae5' : '#f1f5f9', color: account.status === 'active' ? '#065f46' : '#475569' }}>{account.status}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{account.industry} · {account.city}, {account.country}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setActModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>add_comment</span> บันทึกกิจกรรม
          </button>
          <button onClick={() => setDealModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>add</span> เพิ่มดีล
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: 'payments', label: 'ดีลเปิด', value: account.dealsOpen, color: '#f59e0b', bg: '#fef3c7' },
          { icon: 'trending_up', label: 'มูลค่ารวม', value: fmtTHB(account.dealsValueThb), color: '#10b981', bg: '#d1fae5' },
          { icon: 'contacts', label: 'ผู้ติดต่อ', value: contacts.length, color: '#2563eb', bg: '#dbeafe' },
          { icon: 'history', label: 'กิจกรรม', value: activities.length, color: '#8b5cf6', bg: '#ede9fe' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-icons-round" style={{ fontSize: 20 }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 4, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          {[
            { k: 'overview', l: 'ภาพรวม' },
            { k: 'contacts', l: `ผู้ติดต่อ (${contacts.length})` },
            { k: 'deals',    l: `ดีล (${deals.length})` },
            { k: 'activity', l: `กิจกรรม (${activities.length})` },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{ background: tab === t.k ? '#eff6ff' : 'transparent', color: tab === t.k ? '#1d4ed8' : '#64748b', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t.l}</button>
          ))}
        </div>

        <div style={{ padding: 18 }}>
          {/* Overview tab */}
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>ข้อมูลบริษัท</div>
                {[
                  ['Industry', account.industry],
                  ['สกุลเงิน', `${account.currency} · ${account.language}`],
                  ['เงื่อนไขชำระ', account.paymentTerms],
                  ['เซลล์', `@${account.assignedTo}`],
                  ['Timezone', account.timezone],
                  ['ติดต่อล่าสุด', account.lastContact || '—'],
                  ['Website', account.website || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{k}</span>
                    <span style={{ color: '#0f172a', fontSize: 13, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                {account.tags.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {account.tags.map(t => (
                      <span key={t} style={{ padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', fontSize: 12 }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>กิจกรรมล่าสุด</div>
                {activities.slice(0, 4).length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>ยังไม่มีกิจกรรม</div>
                ) : activities.slice(0, 4).map(a => {
                  const ti = TYPE_ICON[a.type] || TYPE_ICON.note
                  return (
                    <div key={a._id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: ti.bg, color: ti.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-icons-round" style={{ fontSize: 14 }}>{ti.icon}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.note}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(a.createdAt)} · @{a.createdBy}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Contacts tab */}
          {tab === 'contacts' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button onClick={() => setContactModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  <span className="material-icons-round" style={{ fontSize: 16 }}>person_add</span> เพิ่มผู้ติดต่อ
                </button>
              </div>
              {contacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>ยังไม่มีผู้ติดต่อ</div>
              ) : contacts.map(c => (
                <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: 10, border: '1px solid #f1f5f9', marginBottom: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#fde68a,#f59e0b)', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {c.firstName[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.firstName} {c.lastName}
                      {c.isPrimary && <span style={{ padding: '1px 6px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700 }}>primary</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{c.position}{c.department ? ` · ${c.department}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', textAlign: 'right' }}>
                    <div>{c.email}</div>
                    <div>{c.phone}</div>
                  </div>
                  <button onClick={() => deleteContact(c._id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                    <span className="material-icons-round" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Deals tab */}
          {tab === 'deals' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button onClick={() => setDealModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  <span className="material-icons-round" style={{ fontSize: 16 }}>add</span> เพิ่มดีล
                </button>
              </div>
              {deals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>ยังไม่มีดีล</div>
              ) : deals.map(d => (
                <div key={d._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>คาดปิด {d.expectedCloseDate?.slice(0, 10) || '—'} · @{d.assignedTo}</div>
                  </div>
                  <div style={{ textAlign: 'right', marginRight: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{d.currency} {d.value.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{fmtTHB(d.valueThb)}</div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: `${STAGE_COLOR[d.stage]}22`, color: STAGE_COLOR[d.stage], marginRight: 8 }}>{d.stage}</span>
                  <button onClick={() => deleteDeal(d._id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                    <span className="material-icons-round" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Activity tab */}
          {tab === 'activity' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button onClick={() => setActModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  <span className="material-icons-round" style={{ fontSize: 16 }}>add_comment</span> บันทึกกิจกรรม
                </button>
              </div>
              {activities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>ยังไม่มีกิจกรรม</div>
              ) : (
                <div style={{ borderLeft: '2px solid #f1f5f9', marginLeft: 14, paddingLeft: 22 }}>
                  {activities.map(a => {
                    const ti = TYPE_ICON[a.type] || TYPE_ICON.note
                    return (
                      <div key={a._id} style={{ position: 'relative', paddingBottom: 18 }}>
                        <div style={{ position: 'absolute', left: -35, top: 0, width: 26, height: 26, borderRadius: 8, background: ti.bg, color: ti.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-icons-round" style={{ fontSize: 14 }}>{ti.icon}</span>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.type} · @{a.createdBy}</span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(a.createdAt)}</span>
                              <button onClick={() => deleteActivity(a._id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}>
                                <span className="material-icons-round" style={{ fontSize: 14 }}>delete</span>
                              </button>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{a.note}</div>
                          {a.nextAction && (
                            <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="material-icons-round" style={{ fontSize: 14 }}>schedule</span>
                              <strong>Next:</strong> {a.nextAction}
                              {a.nextActionDate && <span style={{ marginLeft: 'auto' }}>{a.nextActionDate}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Activity Modal */}
      {actModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(500px,100%)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>บันทึกกิจกรรม</h3>
              <button onClick={() => setActModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}><span className="material-icons-round">close</span></button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ประเภท</label>
                <select value={actData.type} onChange={e => setActData((d: any) => ({ ...d, type: e.target.value }))} style={inputStyle}>
                  {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บันทึก *</label>
                <textarea value={actData.note} onChange={e => setActData((d: any) => ({ ...d, note: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Next Action</label>
                <input value={actData.nextAction || ''} onChange={e => setActData((d: any) => ({ ...d, nextAction: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>วันที่ Next Action</label>
                <input type="date" value={actData.nextActionDate || ''} onChange={e => setActData((d: any) => ({ ...d, nextActionDate: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setActModal(false)} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={saveActivity} disabled={saving} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Deal Modal */}
      {dealModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(520px,100%)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>เพิ่มดีล</h3>
              <button onClick={() => setDealModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}><span className="material-icons-round">close</span></button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อดีล *</label>
                <input value={dealData.title} onChange={e => setDealData((d: any) => ({ ...d, title: e.target.value }))} style={inputStyle} />
              </div>
              {([['value', 'มูลค่า', 'number'], ['currency', 'สกุลเงิน', 'text'], ['valueThb', 'มูลค่า (THB)', 'number'], ['assignedTo', 'เซลล์', 'text']] as [string,string,string][]).map(([k, label, type]) => (
                <div key={k}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input type={type} value={(dealData as any)[k] ?? ''} onChange={e => setDealData((d: any) => ({ ...d, [k]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Stage</label>
                <select value={dealData.stage} onChange={e => setDealData((d: any) => ({ ...d, stage: e.target.value }))} style={inputStyle}>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>โอกาสปิด (%)</label>
                <input type="number" min={0} max={100} value={dealData.probability} onChange={e => setDealData((d: any) => ({ ...d, probability: parseInt(e.target.value) || 0 }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>วันที่คาดปิด</label>
                <input type="date" value={dealData.expectedCloseDate || ''} onChange={e => setDealData((d: any) => ({ ...d, expectedCloseDate: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDealModal(false)} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={saveDeal} disabled={saving} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(520px,100%)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>เพิ่มผู้ติดต่อ</h3>
              <button onClick={() => setContactModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}><span className="material-icons-round">close</span></button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([['firstName','ชื่อ'],['lastName','นามสกุล'],['position','ตำแหน่ง'],['department','แผนก'],['email','Email'],['phone','เบอร์โทร']] as [string,string][]).map(([k, label]) => (
                <div key={k}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input value={(contactData as any)[k] || ''} onChange={e => setContactData((d: any) => ({ ...d, [k]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ภาษาที่ถนัด</label>
                <select value={contactData.preferredLanguage} onChange={e => setContactData((d: any) => ({ ...d, preferredLanguage: e.target.value }))} style={inputStyle}>
                  {['en','th','zh','ja','ko'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" checked={contactData.isPrimary} onChange={e => setContactData((d: any) => ({ ...d, isPrimary: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <label style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, cursor: 'pointer' }}>Primary contact</label>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setContactModal(false)} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
              <button onClick={saveContact} disabled={saving} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
