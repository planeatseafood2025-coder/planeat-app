'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { crmB2bApi } from '@/lib/api'

const EMAIL_TEMPLATES = [
  { id: 'intro', name: 'Intro / Cold outreach', subject: 'Introduction — {{accountName}} × PlaNeat', body: 'Dear {{firstName}},\n\nI hope this finds you well. I am reaching out from PlaNeat regarding our specialty product portfolio that may be relevant to {{accountName}}\'s operations in {{country}}.\n\nWould you be open to a 20-minute call next week?\n\nBest regards,\n{{senderName}}' },
  { id: 'followup', name: 'Follow-up', subject: 'Following up — our recent discussion', body: 'Dear {{firstName}},\n\nThank you for taking the time to connect. I wanted to follow up and see if you had any further questions.\n\nKind regards,\n{{senderName}}' },
  { id: 'quote', name: 'Quote / Proposal', subject: 'Quotation for {{accountName}}', body: 'Dear {{firstName}},\n\nPlease find attached our quotation.\n\nCurrency: {{currency}}\n\nLooking forward to your feedback.\n\nBest regards,\n{{senderName}}' },
  { id: 'reengage', name: 'Re-engage dormant', subject: 'It\'s been a while — {{accountName}}', body: 'Dear {{firstName}},\n\nWe noticed it has been some time since we last connected. Our latest catalog is attached — there are several new lines that may interest {{accountName}}.\n\nHappy to schedule a quick call at your convenience.\n\n{{senderName}}' },
]

interface Campaign {
  _id: string
  name: string
  subject: string
  status: string
  totalRecipients: number
  sent: number
  failed: number
  createdAt: string
}

interface Account {
  _id: string
  name: string
  country: string
  tier: string
  status: string
}

export default function CampaignsPage() {
  const [step, setStep] = useState(1)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [tab, setTab] = useState<'new' | 'history'>('new')

  const [audience, setAudience] = useState({ tier: 'all', country: 'all', status: 'active' })
  const [tplId, setTplId] = useState('reengage')
  const [campName, setCampName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [perHour, setPerHour] = useState(90)
  const [windowStart, setWindowStart] = useState('09:00')
  const [windowEnd, setWindowEnd] = useState('18:00')
  const [respectTz, setRespectTz] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState<any>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    crmB2bApi.getAccounts().then((r: any) => setAccounts(r.accounts || []))
    crmB2bApi.getCampaigns().then((r: any) => setCampaigns(r.campaigns || []))
  }, [])

  useEffect(() => {
    const tpl = EMAIL_TEMPLATES.find(t => t.id === tplId)
    if (tpl) {
      setSubject(tpl.subject)
      setBody(tpl.body)
    }
  }, [tplId])

  const countries = useMemo(() => ['all', ...Array.from(new Set(accounts.map(a => a.country))).sort()], [accounts])

  const filteredAccounts = useMemo(() => accounts.filter(a => {
    if (audience.tier !== 'all' && a.tier !== audience.tier) return false
    if (audience.country !== 'all' && a.country !== audience.country) return false
    if (audience.status !== 'all' && a.status !== audience.status) return false
    return true
  }), [accounts, audience])

  const totalCount = filteredAccounts.length
  const totalHours = perHour > 0 ? Math.ceil(totalCount / perHour) : 0

  async function startCampaign() {
    if (!campName.trim()) { alert('กรุณากรอกชื่อแคมเปญ'); return }
    if (!subject.trim() || !body.trim()) { alert('กรุณากรอกหัวเรื่องและเนื้อหา'); return }
    setLaunching(true)
    try {
      const res = await crmB2bApi.createCampaign({
        name: campName,
        subject,
        body,
        audience,
        perHour,
        windowStart,
        windowEnd,
        respectTimezone: respectTz,
      }) as any
      setActiveCampaignId(res.campaignId)
      setStep(4)
      setLiveStatus({ sent: 0, failed: 0, totalRecipients: res.totalRecipients, status: 'running' })
      crmB2bApi.getCampaigns().then((r: any) => setCampaigns(r.campaigns || []))
    } catch (e: any) {
      alert(e.message)
    }
    setLaunching(false)
  }

  useEffect(() => {
    if (!activeCampaignId || step !== 4) return
    pollRef.current = setInterval(async () => {
      try {
        const r = await crmB2bApi.getCampaignStatus(activeCampaignId) as any
        setLiveStatus(r)
        if (r.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current)
          crmB2bApi.getCampaigns().then((res: any) => setCampaigns(res.campaigns || []))
        }
      } catch {}
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeCampaignId, step])

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  function FilterSelect({ label, field, options }: { label: string; field: string; options: [string, string][] }) {
    return (
      <div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{label}</div>
        <select style={inputStyle} value={(audience as any)[field]} onChange={e => setAudience(a => ({ ...a, [field]: e.target.value }))}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    )
  }

  const steps = [
    { n: 1, l: '1. กลุ่มผู้รับ' },
    { n: 2, l: '2. เนื้อหา' },
    { n: 3, l: '3. Rate Limit' },
    { n: 4, l: '4. กำลังส่ง' },
  ]

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>แคมเปญอีเมล</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>ส่งอีเมล HTML จำนวนมาก พร้อมจำกัดอัตราการส่ง</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setTab('new'); setStep(1) }} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: tab === 'new' ? '#2563eb' : '#fff', color: tab === 'new' ? '#fff' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>แคมเปญใหม่</button>
          <button onClick={() => setTab('history')} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: tab === 'history' ? '#2563eb' : '#fff', color: tab === 'history' ? '#fff' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ประวัติ ({campaigns.length})</button>
        </div>
      </div>

      {tab === 'history' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          {campaigns.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>ยังไม่มีแคมเปญ</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['ชื่อแคมเปญ', 'หัวเรื่อง', 'สถานะ', 'ส่งสำเร็จ', 'Failed', 'วันที่'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c._id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{c.name}</td>
                    <td style={{ padding: '12px 14px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: c.status === 'completed' ? '#d1fae5' : c.status === 'running' ? '#dbeafe' : '#fef3c7', color: c.status === 'completed' ? '#065f46' : c.status === 'running' ? '#1d4ed8' : '#92400e' }}>
                        {c.status === 'completed' ? 'เสร็จสิ้น' : c.status === 'running' ? 'กำลังส่ง' : c.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#10b981' }}>{c.sent.toLocaleString()} / {c.totalRecipients.toLocaleString()}</td>
                    <td style={{ padding: '12px 14px', color: '#ef4444' }}>{c.failed}</td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{c.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'new' && (
        <>
          {/* Stepper */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {steps.map(s => (
              <div key={s.n} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${step === s.n ? '#2563eb' : '#e2e8f0'}`, background: step >= s.n ? '#fff' : '#f8fafc', color: step >= s.n ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: step >= s.n ? '#2563eb' : '#e2e8f0', color: step >= s.n ? '#fff' : '#94a3b8', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step > s.n ? '✓' : s.n}
                </span>
                {s.l}
              </div>
            ))}
          </div>

          {/* Step 1 — Audience */}
          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 15, color: '#0f172a' }}>เลือกกลุ่มผู้รับ</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <FilterSelect label="Tier" field="tier" options={[['all', 'ทุก Tier'], ['A', 'A'], ['B', 'B'], ['C', 'C']]} />
                  <FilterSelect label="ประเทศ" field="country" options={countries.map(c => [c, c === 'all' ? 'ทุกประเทศ' : c])} />
                  <FilterSelect label="สถานะ" field="status" options={[['active', 'Active'], ['inactive', 'Inactive'], ['all', 'ทั้งหมด']]} />
                </div>
                <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', borderRadius: 10 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 8 }}>ตัวอย่างผู้รับ ({totalCount} บริษัท)</div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {filteredAccounts.slice(0, 20).map(a => (
                      <div key={a._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
                        <span>{a.name} <span style={{ color: '#94a3b8' }}>({a.country})</span></span>
                        <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: a.tier === 'A' ? '#fef3c7' : a.tier === 'B' ? '#dbeafe' : '#f1f5f9', color: a.tier === 'A' ? '#b45309' : a.tier === 'B' ? '#1d4ed8' : '#475569' }}>
                          {a.tier}
                        </span>
                      </div>
                    ))}
                    {totalCount > 20 && <div style={{ textAlign: 'center', padding: 8, color: '#94a3b8', fontSize: 12 }}>... อีก {totalCount - 20} บริษัท</div>}
                  </div>
                </div>
              </div>
              <div style={{ background: 'linear-gradient(160deg,#0b1d4a,#0f172a)', color: '#fff', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700 }}>ผู้รับทั้งหมด</div>
                <div style={{ fontSize: 48, fontWeight: 700, margin: '6px 0', lineHeight: 1 }}>{totalCount}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>บริษัท</div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '14px 0' }} />
                {(['A', 'B', 'C'] as const).map(t => (
                  <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>Tier {t}</span>
                    <span style={{ fontWeight: 700 }}>{filteredAccounts.filter(a => a.tier === t).length}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '14px 0' }} />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>กระจายในประเทศ</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{new Set(filteredAccounts.map(a => a.country)).size} ประเทศ</div>
              </div>
            </div>
          )}

          {/* Step 2 — Content */}
          {step === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อแคมเปญ</label>
                  <input value={campName} onChange={e => setCampName(e.target.value)} placeholder="เช่น Q2 Re-engagement" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>เลือก Template</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {EMAIL_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => setTplId(t.id)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${tplId === t.id ? '#2563eb' : '#e2e8f0'}`, background: tplId === t.id ? '#eff6ff' : '#fff', color: tplId === t.id ? '#1d4ed8' : '#475569', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{t.name}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>หัวเรื่อง</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>เนื้อหา (รองรับ HTML)</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>ตัวแปร: {'{{firstName}} {{accountName}} {{country}} {{currency}} {{senderName}}'}</div>
                </div>
              </div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, color: '#64748b', fontWeight: 600 }}>พรีวิว — ผู้รับคนแรก</div>
                <div style={{ padding: '14px 18px' }}>
                  {filteredAccounts[0] ? (
                    <>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>To: contact@{filteredAccounts[0].name.toLowerCase().replace(/[^a-z]/g, '')}.com</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '10px 0 12px' }}>
                        {subject.replace(/\{\{accountName\}\}/g, filteredAccounts[0].name).replace(/\{\{[^}]+\}\}/g, '[...]')}
                      </div>
                      <div style={{ fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {body.replace(/\{\{firstName\}\}/g, 'Procurement').replace(/\{\{accountName\}\}/g, filteredAccounts[0].name).replace(/\{\{country\}\}/g, filteredAccounts[0].country).replace(/\{\{senderName\}\}/g, 'PlaNeat CRM').replace(/\{\{currency\}\}/g, 'USD')}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: 13 }}>ไม่มีผู้รับที่ตรงกับเงื่อนไข</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Rate limit */}
          {step === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 15, color: '#0f172a' }}>Rate limit & กำหนดเวลา</h3>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>ความเร็วการส่ง (ต่อชั่วโมง)</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{perHour} ฉบับ/ชม.</span>
                  </div>
                  <input type="range" min={20} max={500} step={10} value={perHour} onChange={e => setPerHour(+e.target.value)} style={{ width: '100%', accentColor: '#2563eb' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 2 }}><span>20</span><span>250</span><span>500</span></div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
                    แนะนำ <strong>50–120 ฉบับ/ชม.</strong> เพื่อลดโอกาสติด spam
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>ส่งในช่วง (เริ่ม)</label>
                    <input type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>ส่งในช่วง (จบ)</label>
                    <input type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, background: '#f8fafc', borderRadius: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={respectTz} onChange={e => setRespectTz(e.target.checked)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>เคารพ Timezone ของผู้รับ</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>ส่งให้แต่ละคนในช่วง {windowStart}–{windowEnd} ตามเวลาท้องถิ่น</div>
                  </div>
                </label>
              </div>
              <div style={{ background: 'linear-gradient(160deg,#0b1d4a,#0f172a)', color: '#fff', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700 }}>สรุปการส่ง</div>
                {[
                  { label: 'ผู้รับ', value: `${totalCount} บริษัท` },
                  { label: 'อัตราส่ง', value: `${perHour}/ชม.` },
                  { label: 'ใช้เวลาทั้งหมด', value: totalHours < 24 ? `~${totalHours} ชม.` : `~${Math.ceil(totalHours / 24)} วัน`, highlight: true },
                  { label: 'ช่วงเวลา', value: `${windowStart}–${windowEnd}` },
                  { label: 'Timezone', value: respectTz ? 'ตามผู้รับ' : 'UTC คงที่' },
                ].map(({ label, value, highlight }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
                    <span style={{ fontSize: highlight ? 15 : 13, fontWeight: highlight ? 700 : 500, color: highlight ? '#fbbf24' : '#fff' }}>{value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#fde68a' }}>
                  คาดการณ์: เปิดอ่าน ~{Math.round(totalCount * 0.32)} (32%) · bounce ~{Math.round(totalCount * 0.02)} (2%)
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Running */}
          {step === 4 && liveStatus && (
            <div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: liveStatus.status === 'running' ? '#10b981' : '#f59e0b', display: 'inline-block' }} />
                  <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
                    {liveStatus.status === 'completed' ? 'เสร็จสิ้น' : 'กำลังส่งแคมเปญ'}
                  </h3>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>หัวเรื่อง: {subject}</div>
                <div style={{ height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: `${liveStatus.totalRecipients > 0 ? ((liveStatus.sent + liveStatus.failed) / liveStatus.totalRecipients) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius: 5, transition: 'width 0.5s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                  <span><strong style={{ color: '#0f172a' }}>{(liveStatus.sent + liveStatus.failed).toLocaleString()}</strong> / {liveStatus.totalRecipients?.toLocaleString()} ส่งแล้ว</span>
                  <span>ส่งสำเร็จ: <strong style={{ color: '#10b981' }}>{liveStatus.sent}</strong> · Failed: <strong style={{ color: '#ef4444' }}>{liveStatus.failed}</strong></span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[
                  { label: 'ส่งสำเร็จ', value: liveStatus.sent, color: '#10b981', bg: '#d1fae5' },
                  { label: 'Failed', value: liveStatus.failed, color: '#ef4444', bg: '#fee2e2' },
                  { label: 'ทั้งหมด', value: liveStatus.totalRecipients, color: '#2563eb', bg: '#dbeafe' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value?.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer nav */}
          {step < 4 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: step === 1 ? '#94a3b8' : '#475569', fontWeight: 600, fontSize: 13, cursor: step === 1 ? 'not-allowed' : 'pointer' }}>← ย้อนกลับ</button>
              {step < 3 ? (
                <button onClick={() => setStep(s => s + 1)} style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>ถัดไป →</button>
              ) : (
                <button onClick={startCampaign} disabled={launching || totalCount === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', border: 'none', borderRadius: 8, background: totalCount === 0 ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: launching || totalCount === 0 ? 'not-allowed' : 'pointer', opacity: launching ? 0.7 : 1 }}>
                  <span className="material-icons-round" style={{ fontSize: 16 }}>send</span>
                  {launching ? 'กำลังส่ง...' : `เริ่มส่ง ${totalCount} อีเมล`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
