'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

type Account = any
type Contact = any
type Deal = any
type Activity = any

const TIER_COLOR: Record<string, { bg: string; color: string }> = {
  A: { bg: '#fef3c7', color: '#b45309' },
  B: { bg: '#dbeafe', color: '#1d4ed8' },
  C: { bg: '#f1f5f9', color: '#475569' },
}

function fmtTHB(n: number) {
  if (!n) return '฿0'
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `฿${(n / 1_000).toFixed(0)}K`
  return `฿${n.toLocaleString()}`
}

export default function AccountDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'contacts' | 'deals' | 'activity'>('overview')
  const [account, setAccount] = useState<Account | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])

  async function load() {
    setLoading(true)
    try {
      const [a, c, d, act] = await Promise.all([
        crmB2bApi.getAccount(id) as any,
        crmB2bApi.getContacts(id, 1, 20) as any,
        crmB2bApi.getDeals({ accountId: id }) as any,
        crmB2bApi.getActivities({ accountId: id }) as any,
      ])
      setAccount(a || null)
      setContacts(c?.contacts || [])
      setDeals(d?.deals || [])
      setActivities(act?.activities || [])
    } catch {
      setAccount(null)
    }
    setLoading(false)
  }

  useEffect(() => { if (id) void load() }, [id])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>กำลังโหลด...</div>
  if (!account) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>ไม่พบบริษัท</div>

  const tier = account.tier || 'C'
  const tc = TIER_COLOR[tier] || TIER_COLOR.C

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#64748b' }}>
        <button onClick={() => router.push('/crm-b2b/accounts')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, padding: 0 }}>Accounts</button>
        <span>›</span>
        <span style={{ color: '#0f172a', fontWeight: 600 }}>{account.name || '-'}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>{account.name || '-'}</h1>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: tc.bg, color: tc.color }}>Tier {tier}</span>
            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: account.status === 'active' ? '#d1fae5' : '#f1f5f9', color: account.status === 'active' ? '#065f46' : '#475569' }}>{account.status || '-'}</span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#64748b' }}>{account.industry || '-'} · {account.city || '-'}, {account.country || '-'}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          ['ดีลเปิด', String(account.dealsOpen || 0)],
          ['มูลค่ารวม', fmtTHB(account.dealsValueThb || 0)],
          ['ผู้ติดต่อ', String(contacts.length)],
          ['กิจกรรม', String(activities.length)],
        ].map(([k, v]) => (
          <div key={k} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{k}</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 4, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          {[
            { k: 'overview', l: 'ภาพรวม' },
            { k: 'contacts', l: `ผู้ติดต่อ (${contacts.length})` },
            { k: 'deals', l: `ดีล (${deals.length})` },
            { k: 'activity', l: `กิจกรรม (${activities.length})` },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as any)} style={{ background: tab === t.k ? '#eff6ff' : 'transparent', color: tab === t.k ? '#1d4ed8' : '#64748b', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t.l}</button>
          ))}
        </div>

        <div style={{ padding: 18 }}>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                {[
                  ['Industry', account.industry || '-'],
                  ['สกุลเงิน', `${account.currency || 'THB'} · ${account.language || '-'}`],
                  ['เงื่อนไขชำระ', account.paymentTerms || '-'],
                  ['เซลล์', account.assignedTo ? `@${account.assignedTo}` : '-'],
                  ['Timezone', account.timezone || '-'],
                  ['ติดต่อล่าสุด', account.lastContact || '-'],
                  ['Website', account.website || '-'],
                  ['Email', account.email || '-'],
                  ['Phone', account.phone || '-'],
                  ['Address', account.address || '-'],
                ].map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}><span style={{ color: '#94a3b8', fontSize: 12 }}>{k}</span><span style={{ color: '#0f172a', fontSize: 13 }}>{v}</span></div>)}
              </div>
            </div>
          )}

          {tab === 'contacts' && (
            <div>
              {contacts.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>ยังไม่มีผู้ติดต่อ</div> : contacts.map(c => (
                <div key={c._id} onClick={() => router.push(`/crm-b2b/contacts/${c._id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: 10, border: '1px solid #f1f5f9', marginBottom: 8, cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.firstName || ''} {c.lastName || ''}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{c.position || '-'}{c.department ? ` · ${c.department}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', textAlign: 'right' }}>
                    <div>{c.email || '-'}</div><div>{c.phone || '-'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'deals' && (
            <div>
              {deals.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>ยังไม่มีดีล</div> : deals.map(d => (
                <div key={d._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>{d.title || '-'}</div>
                  <div style={{ fontWeight: 700 }}>{fmtTHB(d.valueThb || 0)}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'activity' && (
            <div>
              {activities.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>ยังไม่มีกิจกรรม</div> : activities.map(a => (
                <div key={a._id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontWeight: 600 }}>{a.type || '-'} · @{a.createdBy || '-'}</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>{a.note || '-'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
