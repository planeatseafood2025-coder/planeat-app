'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { crmB2bApi } from '@/lib/api'

const GlobeMap = dynamic(() => import('@/components/crm/GlobeMap'), { ssr: false })

function fmtTHB(v: number) {
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `฿${(v / 1_000).toFixed(0)}K`
  return `฿${v.toLocaleString()}`
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m} นาทีที่แล้ว`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ชม.ที่แล้ว`
  return `${Math.floor(h / 24)} วันที่แล้ว`
}

function StatCard({ icon, label, value, sublabel, tone }: { icon: string; label: string; value: string | number; sublabel?: string; tone: string }) {
  const colors: Record<string, { bg: string; icon: string }> = {
    blue: { bg: '#eff6ff', icon: '#2563eb' },
    purple: { bg: '#f5f3ff', icon: '#7c3aed' },
    amber: { bg: '#fffbeb', icon: '#d97706' },
    green: { bg: '#f0fdf4', icon: '#16a34a' },
  }
  const c = colors[tone] || colors.blue
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-icons-round" style={{ fontSize: 18, color: c.icon }}>{icon}</span>
        </div>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      {sublabel && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sublabel}</div>}
    </div>
  )
}

export default function CrmOverviewPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ tier: 'all', region: 'all' })
  const [autoRotate, setAutoRotate] = useState(true)
  const [selected, setSelected] = useState<any>(null)

  const REGIONS: Record<string, string[]> = {
    apac: ['Japan', 'China', 'South Korea', 'Thailand', 'Vietnam', 'Indonesia', 'India', 'Australia'],
    emea: ['Germany', 'UK', 'UAE', 'South Africa', 'France', 'Netherlands'],
    amer: ['USA', 'Brazil', 'Mexico', 'Canada'],
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await crmB2bApi.getOverview() as any
      setData(res)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const accounts = data?.accounts || []
  const stats = data?.stats || {}
  const topCountries = data?.topCountries || []
  const activities = data?.recentActivities || []
  const reminders = data?.reminders || []

  const filteredAccounts = accounts.filter((a: any) => {
    if (filter.tier !== 'all' && a.tier !== filter.tier) return false
    if (filter.region !== 'all') {
      const r = REGIONS[filter.region] || []
      if (!r.includes(a.country)) return false
    }
    return true
  })

  const pins = filteredAccounts
    .filter((a: any) => a.coordinates?.length === 2)
    .map((a: any) => ({ _id: a._id, name: a.name, country: a.country, city: a.city, tier: a.tier, dealsOpen: a.dealsOpen || 0, coordinates: a.coordinates as [number, number] }))

  return (
    <div className="page-section active">
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: '#64748b' }}>
          <span className="material-icons-round" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>refresh</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
            <StatCard icon="business" label="ลูกค้าทั้งหมด" value={stats.totalAccounts || 0} sublabel={`active ${stats.activeAccounts || 0}`} tone="blue" />
            <StatCard icon="public" label="ประเทศที่ครอบคลุม" value={stats.countries || 0} sublabel="หลายภูมิภาค" tone="purple" />
            <StatCard icon="payments" label="Pipeline (เปิดอยู่)" value={fmtTHB(stats.pipelineThb || 0)} sublabel={`${stats.openDeals || 0} ดีล`} tone="amber" />
            <StatCard icon="verified" label="Won — เดือนนี้" value={fmtTHB(stats.wonThbMtd || 0)} sublabel="ยอดรวม" tone="green" />
          </div>

          {/* Hero: Globe + rail */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 18 }}>
            {/* Globe panel */}
            <div style={{ background: 'linear-gradient(160deg,#0b1d4a 0%,#0f172a 100%)', borderRadius: 20, padding: 24, color: '#fff', position: 'relative', overflow: 'hidden', minHeight: 580 }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 30%,rgba(96,165,250,0.18),transparent 30%),radial-gradient(circle at 80% 70%,rgba(37,99,235,0.18),transparent 30%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700 }}>LIVE • CUSTOMER MAP</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 2px' }}>พิกัดลูกค้าทั่วโลก</h2>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>คลิกหมุดเพื่อดูรายละเอียด ลากเพื่อหมุนโลก</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 4, display: 'flex', gap: 2, fontSize: 12 }}>
                    {['all', 'A', 'B', 'C'].map(t => (
                      <button key={t} onClick={() => setFilter(f => ({ ...f, tier: t }))} style={{ background: filter.tier === t ? 'rgba(255,255,255,0.18)' : 'transparent', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>
                        {t === 'all' ? 'ทั้งหมด' : `Tier ${t}`}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setAutoRotate(r => !r)} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                    <span className="material-icons-round" style={{ fontSize: 16 }}>{autoRotate ? 'pause' : 'play_arrow'}</span>
                    {autoRotate ? 'หยุดหมุน' : 'หมุนอัตโนมัติ'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, position: 'relative', zIndex: 2 }}>
                <GlobeMap size={500} pins={pins} autoRotate={autoRotate} onPinClick={p => setSelected(accounts.find((a: any) => a._id === p._id) || null)} />
              </div>
              <div style={{ position: 'absolute', left: 24, bottom: 20, display: 'flex', gap: 8, zIndex: 3 }}>
                {[{ k: 'all', l: '🌐 ทั่วโลก' }, { k: 'apac', l: 'APAC' }, { k: 'emea', l: 'EMEA' }, { k: 'amer', l: 'AMER' }].map(r => (
                  <button key={r.k} onClick={() => setFilter(f => ({ ...f, region: r.k }))} style={{ background: filter.region === r.k ? '#2563eb' : 'rgba(255,255,255,0.10)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{r.l}</button>
                ))}
              </div>
              <div style={{ position: 'absolute', right: 24, bottom: 20, background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(6px)', padding: '8px 12px', borderRadius: 10, fontSize: 11, color: 'rgba(255,255,255,0.85)', display: 'flex', gap: 14, zIndex: 3 }}>
                {[['#fbbf24', 'Tier A'], ['#60a5fa', 'Tier B'], ['#a3a3a3', 'Tier C']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}</span>
                ))}
              </div>
            </div>

            {/* Right rail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16, flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>ลูกค้าบนโลก ({filteredAccounts.length})</div>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 300, marginRight: -6, paddingRight: 6 }}>
                  {filteredAccounts.map((a: any) => (
                    <button key={a._id} onClick={() => setSelected(a)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 8, border: 'none', background: selected?._id === a._id ? '#eff6ff' : 'transparent', cursor: 'pointer', marginBottom: 2 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.tier === 'A' ? '#fbbf24' : a.tier === 'B' ? '#60a5fa' : '#a3a3a3', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{a.city}, {a.country} · {a.dealsOpen || 0} ดีล</div>
                      </div>
                      <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>{fmtTHB(a.dealsValueThb || 0)}</div>
                    </button>
                  ))}
                  {filteredAccounts.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>ไม่มีข้อมูล — เพิ่ม account ในหน้า Accounts</div>}
                </div>
              </div>

              {/* Top countries */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 10 }}>Pipeline สูงสุดตามประเทศ</div>
                {topCountries.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>ยังไม่มีข้อมูล deals</div>}
                {topCountries.map((item: any) => {
                  const max = topCountries[0]?.value || 1
                  const pct = (item.value / max) * 100
                  return (
                    <div key={item.country} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: '#0f172a', fontWeight: 600 }}>{item.country}</span>
                        <span style={{ color: '#64748b' }}>{fmtTHB(item.value)}</span>
                      </div>
                      <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginTop: 18 }}>
            {/* Recent activities */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 18 }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>กิจกรรมล่าสุด</div>
              {activities.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>ยังไม่มีกิจกรรม</div>}
              {activities.map((a: any) => (
                <div key={a._id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-icons-round" style={{ fontSize: 16, color: '#2563eb' }}>event_note</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ color: '#0f172a', fontWeight: 600, fontSize: 13 }}>{a.accountName}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{timeAgo(a.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.note}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reminders */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 18 }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Reminder วันนี้</div>
              {reminders.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>ไม่มี reminder</div>}
              {reminders.map((r: any) => (
                <div key={r._id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: r.priority === 'high' ? '#ef4444' : r.priority === 'medium' ? '#f59e0b' : '#94a3b8', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#0f172a' }}>{r.message}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.channel} · {r.accountName}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
