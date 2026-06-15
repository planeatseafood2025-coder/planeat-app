'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { crmB2bApi, revenueApi } from '@/lib/api'
import { buildCrmDemoPreview, shouldUseCrmDemoPreview } from '@/lib/crmB2bDemo'
import { buildExecutiveRows } from '@/lib/crmB2bExecutive'
import { translateCrmB2bLabel } from '@/lib/crmB2bLabels'
import RevenueTrendChart from '@/components/crm/RevenueTrendChart'

const GlobeMap = dynamic(() => import('@/components/crm/GlobeMap'), { ssr: false })

type ViewMode = 'executive' | 'map'
type ExecutiveTab = 'country' | 'customer' | 'stalled' | 'followup'

function fmtTHB(value: number) {
  if (value >= 1_000_000) return `฿${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `฿${(value / 1_000).toFixed(0)}K`
  return `฿${value.toLocaleString()}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชม.ที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}

const TIER_OPTIONS = [
  { value: 'S', label: 'ระดับ S', color: '#f87171' },
  { value: 'A', label: 'ระดับ A', color: '#fbbf24' },
  { value: 'B', label: 'ระดับ B', color: '#60a5fa' },
  { value: 'C', label: 'ระดับ C', color: '#a3a3a3' },
  { value: 'non_customer', label: 'ยังไม่เป็นลูกค้า', color: '#94a3b8' },
]

const COUNTRY_MODE_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'domestic', label: 'ภายในประเทศ' },
  { value: 'international', label: 'ต่างประเทศ' },
] as const

const EXECUTIVE_TABS: Array<{ id: ExecutiveTab; label: string }> = [
  { id: 'country', label: 'สรุปตามประเทศ' },
  { id: 'customer', label: 'สรุปตามลูกค้า' },
  { id: 'stalled', label: 'ดีลค้าง' },
  { id: 'followup', label: 'งานติดตาม' },
]

type PeriodMode = 'month' | 'quarter' | 'ytd'
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const YEAR_NOW = new Date().getFullYear()
const YEAR_OPTIONS = [YEAR_NOW, YEAR_NOW - 1, YEAR_NOW - 2]

function periodRange(p: { mode: PeriodMode; year: number; month: number }) {
  if (p.mode === 'ytd') return { from: `${p.year}-01-01`, to: `${p.year}-12-31` }
  if (p.mode === 'quarter') {
    const q = Math.floor((p.month - 1) / 3)
    const startM = q * 3 + 1
    const endM = startM + 2
    const lastDay = new Date(p.year, endM, 0).getDate()
    return { from: `${p.year}-${String(startM).padStart(2, '0')}-01`, to: `${p.year}-${String(endM).padStart(2, '0')}-${lastDay}` }
  }
  const lastDay = new Date(p.year, p.month, 0).getDate()
  return { from: `${p.year}-${String(p.month).padStart(2, '0')}-01`, to: `${p.year}-${String(p.month).padStart(2, '0')}-${lastDay}` }
}

function dashboardParams(p: { mode: PeriodMode; year: number; month: number }) {
  if (p.mode === 'month') return { period: 'month', year: p.year, month: p.month }
  if (p.mode === 'quarter') return { period: 'this_quarter' }
  return { period: 'ytd' }
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: string
  label: string
  value: string | number
  sublabel?: string
  tone: string
}) {
  const colors: Record<string, { bg: string; icon: string }> = {
    blue: { bg: '#eff6ff', icon: '#2563eb' },
    purple: { bg: '#f5f3ff', icon: '#7c3aed' },
    amber: { bg: '#fffbeb', icon: '#d97706' },
    green: { bg: '#f0fdf4', icon: '#16a34a' },
  }
  const color = colors[tone] || colors.blue

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-icons-round" style={{ fontSize: 18, color: color.icon }}>
            {icon}
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      {sublabel && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sublabel}</div>}
    </div>
  )
}

function TableShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'linear-gradient(160deg,#0b1d4a 0%,#0f172a 100%)', borderRadius: 20, padding: 24, color: '#fff', position: 'relative', overflow: 'hidden', minHeight: 580 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 20%,rgba(96,165,250,0.14),transparent 30%),radial-gradient(circle at 80% 80%,rgba(14,165,233,0.10),transparent 28%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700 }}>ภาพรวมผู้บริหาร</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 4px' }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', marginBottom: 16 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  )
}

function InsightCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function Pill({ label, tone }: { label: string; tone: 'neutral' | 'good' | 'warn' | 'risk' }) {
  const styles = {
    neutral: { background: '#e2e8f0', color: '#334155' },
    good: { background: '#dcfce7', color: '#166534' },
    warn: { background: '#fef3c7', color: '#92400e' },
    risk: { background: '#fee2e2', color: '#b91c1c' },
  }[tone]

  return <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, ...styles }}>{label}</span>
}

function getStatusTone(status: string) {
  if (status === 'Active' || status === 'healthy') return 'good'
  if (status === 'At risk' || status === 'High' || status === 'dormant') return 'risk'
  if (status === 'Needs follow-up' || status === 'watchlist' || status === 'Medium' || status === 'Strategic') return 'warn'
  return 'neutral'
}

function RevenueHero({ target, forecast, actual }: { target: number; forecast: number; actual: number }) {
  const cell = (label: string, value: number, color: string) => {
    const p = target ? Math.min(100, Math.round((value / target) * 100)) : 0
    return (
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{fmtTHB(value)}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 8px' }}>{target ? `${p}% ของเป้า` : 'ยังไม่ตั้งเป้า'}</div>
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 20, marginBottom: 18, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>เป้ารายได้</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{fmtTHB(target)}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>ตั้งโดย Admin</div>
      </div>
      {cell('รายได้คาดการณ์', forecast, '#2563eb')}
      {cell('รายได้จริง', actual, '#16a34a')}
    </div>
  )
}

export default function CrmOverviewPage() {
  const [data, setData] = useState<any>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [revSummary, setRevSummary] = useState<{ targetThb: number; forecastThb: number; actualThb: number } | null>(null)
  const [period, setPeriod] = useState<{ mode: PeriodMode; year: number; month: number }>({
    mode: 'month', year: new Date().getFullYear(), month: new Date().getMonth() + 1,
  })
  const [trend, setTrend] = useState<Array<{ month: number; targetThb: number; forecastThb: number; actualThb: number }>>([])
  const [filter, setFilter] = useState({ tier: 'all', countryMode: 'all', country: 'all' })
  const [autoRotate, setAutoRotate] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [demoPreview, setDemoPreview] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('executive')
  const [executiveTab, setExecutiveTab] = useState<ExecutiveTab>('country')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = periodRange(period)
      const [overviewResponse, dashboardResponse, rev, tr] = await Promise.all([
        crmB2bApi.getOverview() as any,
        crmB2bApi.getExecutiveDashboard(dashboardParams(period)) as any,
        (revenueApi.getSummary as any)(from, to),
        (revenueApi.getTrend as any)(period.year),
      ])
      setData(overviewResponse)
      setDashboard(dashboardResponse)
      setRevSummary(rev)
      setTrend(tr?.months || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  const canUseDemoPreview = shouldUseCrmDemoPreview(data, dashboard)
  const demo = demoPreview && canUseDemoPreview ? buildCrmDemoPreview() : null
  const activeData = demo?.data || data
  const activeDashboard = demo?.dashboard || dashboard
  const accounts = activeData?.accounts || []
  const stats = activeData?.stats || {}
  const topCountries = activeData?.topCountries || []
  const activities = activeData?.recentActivities || []
  const reminders = activeData?.reminders || []
  const kpis = activeDashboard?.kpis || {}
  const executive = buildExecutiveRows(activeData, activeDashboard)
  const countries = Array.from(new Set(accounts.map((account: any) => String(account.country || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const thailandAliases = new Set(['Thailand', 'ไทย'])

  const isThailand = (country?: string) => thailandAliases.has(String(country || '').trim())

  const filteredAccounts = accounts.filter((account: any) => {
    if (filter.tier !== 'all' && account.tier !== filter.tier) return false
    if (filter.countryMode === 'domestic' && !isThailand(account.country)) return false
    if (filter.countryMode === 'international' && isThailand(account.country)) return false
    if (filter.country !== 'all' && account.country !== filter.country) return false
    return true
  })

  const filteredTopCountries = topCountries.filter((item: any) => {
    if (filter.countryMode === 'domestic' && !isThailand(item.country)) return false
    if (filter.countryMode === 'international' && isThailand(item.country)) return false
    if (filter.country !== 'all' && item.country !== filter.country) return false
    return true
  })

  const pins = filteredAccounts
    .filter((account: any) => account.coordinates?.length === 2)
    .map((account: any) => ({
      _id: account._id,
      name: account.name,
      country: account.country,
      city: account.city,
      tier: account.tier,
      dealsOpen: account.dealsOpen || 0,
      coordinates: account.coordinates as [number, number],
    }))

  const displayStats = {
    openPipelineThb: Number(kpis.openPipeline?.totalThb ?? stats.pipelineThb ?? 0),
    openDealCount: Number(kpis.openPipeline?.openDealCount ?? stats.openDeals ?? 0),
    wonThisMonthThb: Number(kpis.wonThisMonth?.totalThb ?? stats.wonThbMtd ?? 0),
    wonDealCount: Number(kpis.wonThisMonth?.wonDealCount ?? 0),
    overdueFollowUps: Number(kpis.overdueFollowUps?.totalAccounts ?? 0),
    stalledDeals: Number(kpis.stalledDeals?.totalDeals ?? 0),
  }

  const periodLabel =
    period.mode === 'month'
      ? `${MONTHS_TH[period.month - 1]} ${period.year + 543}`
      : period.mode === 'quarter'
        ? `ไตรมาสปัจจุบัน`
        : `ปี ${period.year + 543}`
  const noData =
    !!revSummary &&
    revSummary.targetThb === 0 &&
    revSummary.forecastThb === 0 &&
    revSummary.actualThb === 0 &&
    executive.countryRows.length === 0

  const executiveRows =
    executiveTab === 'country'
      ? executive.countryRows
      : executiveTab === 'customer'
        ? executive.customerRows
        : executiveTab === 'stalled'
          ? executive.stalledDealRows
          : executive.followUpRows

  const buttonBase: React.CSSProperties = {
    border: 'none',
    padding: '7px 12px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  }

  return (
    <div className="page-section active">
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: '#64748b' }}>
          <span className="material-icons-round" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>
            refresh
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {canUseDemoPreview && (
            <div style={{ background: demoPreview ? 'linear-gradient(135deg,#0f766e,#0f172a)' : '#fff', color: demoPreview ? '#fff' : '#0f172a', border: demoPreview ? '1px solid rgba(255,255,255,0.16)' : '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>
                  {demoPreview ? 'เปิดตัวอย่างเดโมอยู่' : 'ยังไม่มีข้อมูล CRM B2B จริงสำหรับคำนวณแดชบอร์ด'}
                </div>
                <div style={{ fontSize: 12, color: demoPreview ? 'rgba(255,255,255,0.76)' : '#64748b', maxWidth: 720 }}>
                  {demoPreview
                    ? 'ตัวเลขและรายการด้านล่างเป็นข้อมูลตัวอย่างเพื่อดูภาพรวมสำหรับผู้บริหารเท่านั้น ยังไม่ได้บันทึกลงฐานข้อมูลจริง'
                    : 'ตอนนี้ฐานข้อมูลลูกค้า ดีล งานติดตาม และกิจกรรมยังว่างอยู่ สามารถเปิดตัวอย่างเพื่อดูภาพรวมสำหรับผู้บริหารก่อนเริ่มใส่ข้อมูลจริงได้'}
                </div>
              </div>
              <button onClick={() => setDemoPreview((current) => !current)} style={{ border: 'none', borderRadius: 12, padding: '10px 14px', background: demoPreview ? 'rgba(255,255,255,0.16)' : '#0f172a', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-icons-round" style={{ fontSize: 17 }}>
                  {demoPreview ? 'visibility_off' : 'play_circle'}
                </span>
                {demoPreview ? 'ปิดตัวอย่าง' : 'เปิดตัวอย่างเดโม'}
              </button>
            </div>
          )}

          {/* Period selector */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
              {([['month', 'รายเดือน'], ['quarter', 'ไตรมาส'], ['ytd', 'ทั้งปี']] as [PeriodMode, string][]).map(([m, label]) => (
                <button key={m} onClick={() => setPeriod((prev) => ({ ...prev, mode: m }))} style={{ ...buttonBase, background: period.mode === m ? '#0f172a' : 'transparent', color: period.mode === m ? '#fff' : '#334155' }}>
                  {label}
                </button>
              ))}
            </div>
            <select value={period.year} onChange={(e) => setPeriod((prev) => ({ ...prev, year: Number(e.target.value) }))} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, outline: 'none' }}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{`ปี ${y + 543}`}</option>)}
            </select>
            {period.mode === 'month' && (
              <select value={period.month} onChange={(e) => setPeriod((prev) => ({ ...prev, month: Number(e.target.value) }))} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, outline: 'none' }}>
                {MONTHS_TH.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
              </select>
            )}
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>กำลังดู: {periodLabel}</span>
          </div>

          {/* Revenue hero */}
          <RevenueHero target={revSummary?.targetThb || 0} forecast={revSummary?.forecastThb || 0} actual={revSummary?.actualThb || 0} />

          {/* Trend chart */}
          <RevenueTrendChart months={trend} activeMonth={period.mode === 'month' ? period.month : undefined} />

          {/* Empty state */}
          {noData && !demoPreview && (
            <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 14, padding: 20, marginBottom: 18, textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>ยังไม่มีข้อมูลของ {periodLabel}</div>
              <div style={{ fontSize: 12 }}>กรอกมูลค่า/ยอดคาดการณ์ในดีล หรือปัดดีลเป็น won เพื่อให้ตัวเลขขึ้น — หรือกดปุ่ม "เปิดตัวอย่างเดโม" ด้านบนเพื่อดูภาพรวมตัวอย่าง</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
            <StatCard icon="payments" label="มูลค่าดีลที่กำลังดำเนินการ" value={fmtTHB(displayStats.openPipelineThb)} sublabel={`${displayStats.openDealCount} ดีล`} tone="amber" />
            <StatCard icon="verified" label="ยอดปิดได้เดือนนี้" value={fmtTHB(displayStats.wonThisMonthThb)} sublabel={`${displayStats.wonDealCount} ดีลที่ปิดได้`} tone="green" />
            <StatCard icon="notification_important" label="งานติดตามที่เลยกำหนด" value={displayStats.overdueFollowUps} sublabel="บริษัทที่รอติดตาม" tone="purple" />
            <StatCard icon="hourglass_top" label="ดีลค้าง" value={displayStats.stalledDeals} sublabel="เกินระยะของสถานะปัจจุบัน" tone="blue" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>ภาพรวมสำหรับผู้บริหาร</div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '4px 0 0' }}>ภาพรวม CRM B2B สำหรับผู้บริหาร</h1>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 4, display: 'flex', gap: 4 }}>
              <button onClick={() => setViewMode('executive')} style={{ ...buttonBase, background: viewMode === 'executive' ? '#0f172a' : 'transparent', color: viewMode === 'executive' ? '#fff' : '#334155' }}>
                ภาพรวมสำหรับผู้บริหาร
              </button>
              <button onClick={() => setViewMode('map')} style={{ ...buttonBase, background: viewMode === 'map' ? '#0f172a' : 'transparent', color: viewMode === 'map' ? '#fff' : '#334155' }}>
                แผนที่ลูกค้า
              </button>
            </div>
          </div>

          {viewMode === 'executive' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 18 }}>
                <TableShell title="ภาพรวมสำหรับผู้บริหาร" subtitle="ใช้ตารางหลักเพื่อดูประเทศ ลูกค้า ดีลค้าง และงานติดตามจากมุมมองเดียว">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {EXECUTIVE_TABS.map((tab) => (
                      <button key={tab.id} onClick={() => setExecutiveTab(tab.id)} style={{ ...buttonBase, background: executiveTab === tab.id ? '#fff' : 'rgba(255,255,255,0.08)', color: executiveTab === tab.id ? '#0f172a' : '#fff' }}>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: executiveTab === 'country' ? '1.2fr .7fr .7fr .9fr .8fr .8fr .8fr .9fr 1fr' : executiveTab === 'customer' ? '1.5fr .9fr .6fr .7fr .9fr .9fr .9fr .8fr .8fr' : executiveTab === 'stalled' ? '1.3fr 1fr .8fr .7fr .8fr .9fr .7fr .8fr' : '1.2fr .8fr .8fr .8fr .8fr .7fr .8fr .9fr', gap: 12, padding: '12px 14px', color: '#93c5fd', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {(executiveTab === 'country'
                        ? ['Country', 'Accounts', 'Open Deals', 'Pipeline', 'Won MTD', 'Overdue', 'Stalled', 'Growth', 'Status']
                        : executiveTab === 'customer'
                          ? ['Customer', 'Country', 'Tier', 'Deals', 'Pipeline', 'Last Contact', 'Next Follow-up', 'Health', 'Owner']
                          : executiveTab === 'stalled'
                            ? ['Deal', 'Customer', 'Country', 'Stage', 'Days', 'Value', 'Risk', 'Owner']
                            : ['Customer', 'Country', 'Next Follow-up', 'Overdue', 'Channel', 'Priority', 'Owner', 'Recommended Action']
                      ).map((column) => (
                        <div key={column}>{translateCrmB2bLabel(column)}</div>
                      ))}
                    </div>

                    <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                      {executiveRows.length === 0 && <div style={{ padding: 24, color: 'rgba(255,255,255,0.66)' }}>ไม่มีข้อมูลสำหรับมุมมองนี้</div>}

                      {executiveTab === 'country' &&
                        executive.countryRows.map((row: any) => (
                          <div key={row.country} style={{ display: 'grid', gridTemplateColumns: '1.2fr .7fr .7fr .9fr .8fr .8fr .8fr .9fr 1fr', gap: 12, padding: '14px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontWeight: 700 }}>{row.country}</div>
                            <div>{row.accounts}</div>
                            <div>{row.openDeals}</div>
                            <div style={{ fontWeight: 700 }}>{fmtTHB(row.pipeline)}</div>
                            <div>{fmtTHB(row.wonMtd)}</div>
                            <div>{row.overdueFollowUps}</div>
                            <div>{row.stalledDeals}</div>
                            <div>
                              <Pill label={translateCrmB2bLabel(row.growthFocus)} tone={getStatusTone(row.growthFocus)} />
                            </div>
                            <div>
                              <Pill label={translateCrmB2bLabel(row.status)} tone={getStatusTone(row.status)} />
                            </div>
                          </div>
                        ))}

                      {executiveTab === 'customer' &&
                        executive.customerRows.map((row: any) => (
                          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr .9fr .6fr .7fr .9fr .9fr .9fr .8fr .8fr', gap: 12, padding: '14px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontWeight: 700 }}>{row.customer}</div>
                            <div>{row.country}</div>
                            <div>{translateCrmB2bLabel(row.tier)}</div>
                            <div>{row.openDeals}</div>
                            <div style={{ fontWeight: 700 }}>{fmtTHB(row.pipeline)}</div>
                            <div>{row.lastContact}</div>
                            <div>{row.nextFollowUp}</div>
                            <div>
                              <Pill label={translateCrmB2bLabel(row.health)} tone={getStatusTone(row.health)} />
                            </div>
                            <div>{translateCrmB2bLabel(row.owner)}</div>
                          </div>
                        ))}

                      {executiveTab === 'stalled' &&
                        executive.stalledDealRows.map((row: any) => (
                          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr .8fr .7fr .8fr .9fr .7fr .8fr', gap: 12, padding: '14px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontWeight: 700 }}>{row.deal}</div>
                            <div>{row.customer}</div>
                            <div>{row.country}</div>
                            <div>{translateCrmB2bLabel(row.stage)}</div>
                            <div>{row.daysInStage}</div>
                            <div style={{ fontWeight: 700 }}>{fmtTHB(row.value)}</div>
                            <div>
                              <Pill label={translateCrmB2bLabel(row.risk)} tone={getStatusTone(row.risk)} />
                            </div>
                            <div>{translateCrmB2bLabel(row.owner)}</div>
                          </div>
                        ))}

                      {executiveTab === 'followup' &&
                        executive.followUpRows.map((row: any) => (
                          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr .8fr .8fr .7fr .8fr .9fr', gap: 12, padding: '14px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontWeight: 700 }}>{row.customer}</div>
                            <div>{row.country}</div>
                            <div>{row.nextFollowUp}</div>
                            <div>{row.daysOverdue}</div>
                            <div>{translateCrmB2bLabel(row.channel)}</div>
                            <div>
                              <Pill label={translateCrmB2bLabel(row.priority)} tone={getStatusTone(row.priority)} />
                            </div>
                            <div>{translateCrmB2bLabel(row.owner)}</div>
                            <div>{translateCrmB2bLabel(row.recommendedAction)}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                </TableShell>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <InsightCard title="สิ่งที่ควรทำวันนี้">
                    {executive.actionItems.map((item: any) => (
                      <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{item.title}</div>
                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{item.subtitle}</div>
                        <div style={{ marginTop: 6 }}>
                          <Pill label={translateCrmB2bLabel(item.meta)} tone={item.tone === 'risk' ? 'risk' : 'warn'} />
                        </div>
                      </div>
                    ))}
                  </InsightCard>

                  <InsightCard title="ประเทศที่มีโอกาสเติบโตสูง">
                    {executive.growthCountries.map((item: any) => (
                      <div key={item.country} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                          <span style={{ color: '#0f172a', fontWeight: 700 }}>{item.country}</span>
                          <span style={{ color: '#64748b' }}>{fmtTHB(item.pipeline)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>{item.openDeals} ดีลเปิด · {translateCrmB2bLabel(item.growthFocus)}</div>
                        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999 }}>
                          <div style={{ width: `${Math.min(100, Math.max(18, item.pipeline / 50000))}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#2563eb,#38bdf8)' }} />
                        </div>
                      </div>
                    ))}
                  </InsightCard>

                  <InsightCard title="ลูกค้าที่ควรเฝ้าระวัง">
                    {executive.watchlistCustomers.map((item: any) => (
                      <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{item.customer}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                          {item.country} · {translateCrmB2bLabel(item.owner)}
                        </div>
                        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Pill label={translateCrmB2bLabel(item.health)} tone={getStatusTone(item.health)} />
                          <span style={{ color: '#0f172a', fontSize: 12, fontWeight: 700 }}>{fmtTHB(item.pipeline)}</span>
                        </div>
                      </div>
                    ))}
                  </InsightCard>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginTop: 18 }}>
                <InsightCard title="กิจกรรมล่าสุด">
                  {activities.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>ยังไม่มีกิจกรรม</div>}
                  {activities.map((activity: any) => (
                    <div key={activity._id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-icons-round" style={{ fontSize: 16, color: '#2563eb' }}>
                          event_note
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ color: '#0f172a', fontWeight: 600, fontSize: 13 }}>{activity.accountName}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{timeAgo(activity.createdAt)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{activity.note}</div>
                      </div>
                    </div>
                  ))}
                </InsightCard>

                <InsightCard title="งานติดตามวันนี้">
                  {reminders.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>ไม่มีงานติดตาม</div>}
                  {reminders.map((reminder: any) => (
                    <div key={reminder._id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: reminder.priority === 'high' ? '#ef4444' : reminder.priority === 'medium' ? '#f59e0b' : '#94a3b8', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#0f172a' }}>{reminder.message}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                          {translateCrmB2bLabel(reminder.channel)} · {reminder.accountName}
                        </div>
                      </div>
                    </div>
                  ))}
                </InsightCard>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 18 }}>
              <TableShell title="แผนที่ลูกค้า" subtitle="ใช้มุมมองนี้เมื่ออยากสำรวจลูกค้าตามประเทศและดูจุดกระจุกตัวของมูลค่าดีล">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {COUNTRY_MODE_OPTIONS.map((option) => (
                      <button key={option.value} onClick={() => setFilter((current) => ({ ...current, countryMode: option.value, country: 'all' }))} style={{ ...buttonBase, background: filter.countryMode === option.value && filter.country === 'all' ? '#fff' : 'rgba(255,255,255,0.10)', color: filter.countryMode === option.value && filter.country === 'all' ? '#0f172a' : '#fff' }}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={filter.country} onChange={(event) => setFilter((current) => ({ ...current, country: event.target.value, countryMode: event.target.value === 'all' ? current.countryMode : 'all' }))} style={{ minWidth: 180, background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, outline: 'none' }}>
                      <option value="all" style={{ color: '#0f172a' }}>
                        เลือกประเทศ
                      </option>
                      {countries.map((country) => (
                        <option key={country} value={country} style={{ color: '#0f172a' }}>
                          {country}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => setAutoRotate((current) => !current)} style={{ ...buttonBase, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>
                        {autoRotate ? 'pause' : 'play_arrow'}
                      </span>
                      {autoRotate ? 'หยุดหมุน' : 'หมุนอัตโนมัติ'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', minHeight: 460, alignItems: 'center' }}>
                  <GlobeMap size={500} pins={pins} autoRotate={autoRotate} onPinClick={(pin) => setSelected(filteredAccounts.find((account: any) => account._id === pin._id) || null)} />
                </div>
              </TableShell>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <InsightCard title={`ลูกค้าบนแผนที่ (${filteredAccounts.length})`}>
                  {filteredAccounts.map((account: any) => (
                    <button key={account._id} onClick={() => setSelected(account)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: TIER_OPTIONS.find((option) => option.value === account.tier)?.color || '#94a3b8', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{account.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {account.city}, {account.country} · {account.dealsOpen || 0} ดีล
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>{fmtTHB(account.dealsValueThb || 0)}</div>
                    </button>
                  ))}
                  {filteredAccounts.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>ไม่มีข้อมูลในตัวกรองนี้</div>}
                </InsightCard>

                <InsightCard title="มูลค่าดีลสูงสุดตามประเทศ">
                  {filteredTopCountries.map((item: any) => (
                    <div key={item.country} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: '#0f172a', fontWeight: 700 }}>{item.country}</span>
                        <span style={{ color: '#64748b' }}>{fmtTHB(item.value)}</span>
                      </div>
                      <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(item.value / Math.max(filteredTopCountries[0]?.value || 1, 1)) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                  {filteredTopCountries.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>ยังไม่มีข้อมูลดีล</div>}
                </InsightCard>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
