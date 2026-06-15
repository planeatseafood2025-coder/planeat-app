'use client'

import { useEffect, useState } from 'react'
import { revenueApi } from '@/lib/api'

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function fmtTHB(v: number) {
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `฿${(v / 1_000).toFixed(0)}K`
  return `฿${v.toLocaleString()}`
}

function pct(val: number, total: number) {
  if (!total) return 0
  return Math.min(Math.round((val / total) * 100), 100)
}

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  return { from, to }
}

function RevenueStatCard({ icon, label, value, sublabel, color }: { icon: string; label: string; value: string; sublabel?: string; color: string }) {
  const bgMap: Record<string, string> = {
    '#2563eb': '#eff6ff',
    '#16a34a': '#f0fdf4',
    '#d97706': '#fffbeb',
    '#7c3aed': '#f5f3ff',
    '#dc2626': '#fef2f2',
  }
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: bgMap[color] || '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-icons-round" style={{ fontSize: 18, color }}>{icon}</span>
        </div>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      {sublabel && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sublabel}</div>}
    </div>
  )
}

type Summary = {
  targetThb: number
  forecastThb: number
  actualThb: number
  domestic: { forecastThb: number; actualThb: number }
  international: { forecastThb: number; actualThb: number }
  deals: Array<{
    id: string
    title: string
    accountId: string
    marketType: string
    forecastAmount: number
    forecastDate: string | null
    actualAmount: number
    actualReceivedAt: string | null
    revenueStatus: string
    stage: string
  }>
  isClosed: boolean
  closedActualThb: number
}

export default function RevenuePage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [customMode, setCustomMode] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const [showTargetForm, setShowTargetForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [targetTotal, setTargetTotal] = useState('')
  const [targetDomestic, setTargetDomestic] = useState('')
  const [targetInternational, setTargetInternational] = useState('')
  const [closeActual, setCloseActual] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('planeat_user')
      if (saved) {
        const u = JSON.parse(saved)
        setIsAdmin(u.role === 'admin' || u.role === 'super_admin')
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (customMode) return
    fetchSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, customMode])

  async function fetchSummary(fromOverride?: string, toOverride?: string) {
    setLoading(true)
    try {
      const { from, to } =
        fromOverride && toOverride
          ? { from: fromOverride, to: toOverride }
          : monthRange(currentYear, selectedMonth)
      const data = await revenueApi.getSummary(from, to)
      setSummary(data)
    } catch {
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  function handleCustomSearch() {
    if (!customFrom || !customTo) return
    fetchSummary(customFrom, customTo)
  }

  async function handleSaveTarget() {
    if (!targetTotal) return
    setSaving(true)
    try {
      await revenueApi.upsertTarget({
        year: currentYear,
        month: selectedMonth,
        targetThb: Number(targetTotal),
        domesticTargetThb: Number(targetDomestic) || 0,
        internationalTargetThb: Number(targetInternational) || 0,
      })
      setShowTargetForm(false)
      setTargetTotal('')
      setTargetDomestic('')
      setTargetInternational('')
      fetchSummary()
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseMonth() {
    if (!closeActual) return
    setSaving(true)
    try {
      await revenueApi.closeMonth({
        year: currentYear,
        month: selectedMonth,
        closedActualThb: Number(closeActual),
      })
      setShowCloseForm(false)
      setCloseActual('')
      fetchSummary()
    } finally {
      setSaving(false)
    }
  }

  const target = summary?.targetThb ?? 0
  const forecast = summary?.forecastThb ?? 0
  const actual = summary?.actualThb ?? 0
  const forecastPct = pct(forecast, target)
  const actualPct = pct(actual, target)
  const domestic = summary?.domestic ?? { forecastThb: 0, actualThb: 0 }
  const international = summary?.international ?? { forecastThb: 0, actualThb: 0 }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    color: '#0f172a',
    background: '#fff',
  }

  const btnStyle: React.CSSProperties = {
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>สรุปรายได้</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>ติดตามเป้า คาดการณ์ และรายได้จริงรายเดือน</p>
      </div>

      {/* Month Picker */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {MONTHS.map((m, i) => {
            const mo = i + 1
            const active = !customMode && selectedMonth === mo
            return (
              <button
                key={mo}
                onClick={() => { setCustomMode(false); setSelectedMonth(mo) }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: active ? 'none' : '1px solid #e2e8f0',
                  background: active ? '#0f172a' : '#f8fafc',
                  color: active ? '#fff' : '#334155',
                  transition: 'all 0.15s',
                }}
              >
                {m}
              </button>
            )
          })}
          <button
            onClick={() => setCustomMode(c => !c)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: customMode ? 'none' : '1px solid #e2e8f0',
              background: customMode ? '#0f172a' : '#f8fafc',
              color: customMode ? '#fff' : '#334155',
            }}
          >
            กำหนดเอง
          </button>
        </div>
        {customMode && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            <span style={{ color: '#64748b', fontSize: 13 }}>ถึง</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            <button
              onClick={handleCustomSearch}
              style={{ ...btnStyle, background: '#2563eb', color: '#fff', padding: '8px 16px', fontSize: 13 }}
            >
              ดูข้อมูล
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <RevenueStatCard
          icon="flag"
          label="เป้ารายได้"
          value={loading ? '—' : fmtTHB(target)}
          color="#d97706"
        />
        <RevenueStatCard
          icon="trending_up"
          label="รายได้คาดการณ์"
          value={loading ? '—' : fmtTHB(forecast)}
          sublabel={target ? `${forecastPct}% ของเป้า` : undefined}
          color="#2563eb"
        />
        <RevenueStatCard
          icon="check_circle"
          label="รายได้จริง"
          value={loading ? '—' : fmtTHB(actual)}
          sublabel={target ? `${actualPct}% ของเป้า` : undefined}
          color="#16a34a"
        />
      </div>

      {/* Progress bars */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 16, marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>คาดการณ์ vs เป้า</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{forecastPct}%</span>
          </div>
          <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${forecastPct}%`, height: '100%', background: '#2563eb', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>จริง vs เป้า</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>{actualPct}%</span>
          </div>
          <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${actualPct}%`, height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>
      </div>

      {/* Market breakdown table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>แยกตามตลาด</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['ตลาด', 'คาดการณ์', 'จริง', '% ของเป้า'].map(h => (
                <th
                  key={h}
                  style={{
                    textAlign: h === 'ตลาด' ? 'left' : 'right',
                    fontSize: 11,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 700,
                    padding: '0 0 8px',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>ในประเทศ</span>
              </td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: 13, color: '#0f172a' }}>{fmtTHB(domestic.forecastThb)}</td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: 13, color: '#0f172a' }}>{fmtTHB(domestic.actualThb)}</td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: 13, color: '#0f172a' }}>{pct(domestic.actualThb, target)}%</td>
            </tr>
            <tr>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ background: '#f5f3ff', color: '#7c3aed', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>ต่างประเทศ</span>
              </td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: 13, color: '#0f172a' }}>{fmtTHB(international.forecastThb)}</td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: 13, color: '#0f172a' }}>{fmtTHB(international.actualThb)}</td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: 13, color: '#0f172a' }}>{pct(international.actualThb, target)}%</td>
            </tr>
            <tr>
              <td style={{ padding: '10px 0', fontWeight: 700, fontSize: 13, color: '#0f172a' }}>รวม</td>
              <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{fmtTHB(forecast)}</td>
              <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{fmtTHB(actual)}</td>
              <td style={{ padding: '10px 0', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{actualPct}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Deal list */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Deal ในช่วงนี้</span>
          <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
            {summary?.deals?.length ?? 0}
          </span>
        </div>
        {!summary?.deals?.length ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
            ไม่มี deal ในช่วงเวลาที่เลือก
          </div>
        ) : (
          <div>
            {summary.deals.map(deal => {
              const isReceived = deal.revenueStatus === 'received'
              const amount = isReceived ? deal.actualAmount : deal.forecastAmount
              const marketDomestic = deal.marketType === 'domestic'
              return (
                <div
                  key={deal.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{deal.title}</div>
                    <span
                      style={{
                        background: marketDomestic ? '#eff6ff' : '#f5f3ff',
                        color: marketDomestic ? '#2563eb' : '#7c3aed',
                        borderRadius: 6,
                        padding: '1px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {marketDomestic ? 'ในประเทศ' : 'ต่างประเทศ'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{fmtTHB(amount)}</span>
                    <span
                      style={{
                        background: isReceived ? '#dcfce7' : '#dbeafe',
                        color: isReceived ? '#166534' : '#1d4ed8',
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {isReceived ? 'รับเงินแล้ว' : 'คาดการณ์'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Admin Section */}
      {isAdmin && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>การจัดการเดือน</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: showTargetForm || showCloseForm ? 16 : 0 }}>
            <button
              onClick={() => { setShowTargetForm(f => !f); setShowCloseForm(false) }}
              style={{ ...btnStyle, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
              ตั้งเป้ารายได้
            </button>
            {summary?.isClosed ? (
              <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>
                ปิดรอบแล้ว · ยอดจริง: {fmtTHB(summary.closedActualThb)}
              </span>
            ) : (
              <button
                onClick={() => { setShowCloseForm(f => { const next = !f; if (next) setCloseActual(String(summary?.actualThb ?? 0)); return next }); setShowTargetForm(false) }}
                style={{ ...btnStyle, background: '#fff', color: '#dc2626', border: '1px solid #dc2626', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span className="material-icons-round" style={{ fontSize: 16 }}>lock</span>
                ปิดรอบเดือน
              </button>
            )}
          </div>

          {showTargetForm && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                ตั้งเป้ารายได้ — {MONTHS[selectedMonth - 1]} {currentYear}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>เป้ารวม (THB)</label>
                  <input type="number" value={targetTotal} onChange={e => setTargetTotal(e.target.value)} placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>ในประเทศ (THB)</label>
                  <input type="number" value={targetDomestic} onChange={e => setTargetDomestic(e.target.value)} placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>ต่างประเทศ (THB)</label>
                  <input type="number" value={targetInternational} onChange={e => setTargetInternational(e.target.value)} placeholder="0" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveTarget} disabled={saving} style={{ ...btnStyle, background: '#2563eb', color: '#fff', fontSize: 13, padding: '8px 16px' }}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button onClick={() => setShowTargetForm(false)} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155', fontSize: 13, padding: '8px 16px' }}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {showCloseForm && (
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: 16, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                ปิดรอบเดือน — {MONTHS[selectedMonth - 1]} {currentYear}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                ระบบรวมยอดจากดีลที่ปิดสำเร็จ (won) ในเดือนนี้ให้อัตโนมัติ — แก้ไขได้หากต้องการ
              </div>
              <div style={{ maxWidth: 280, marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>ยอดรายได้จริง (THB)</label>
                <input type="number" value={closeActual} onChange={e => setCloseActual(e.target.value)} placeholder="0" style={inputStyle} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>คำนวณจากดีล won: {fmtTHB(summary?.actualThb ?? 0)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCloseMonth} disabled={saving} style={{ ...btnStyle, background: '#dc2626', color: '#fff', fontSize: 13, padding: '8px 16px' }}>
                  {saving ? 'กำลังปิดรอบ...' : 'ยืนยันปิดรอบ'}
                </button>
                <button onClick={() => setShowCloseForm(false)} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155', fontSize: 13, padding: '8px 16px' }}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
