'use client'

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

type MonthPoint = { month: number; targetThb: number; forecastThb: number; actualThb: number }

export default function RevenueTrendChart({ months, activeMonth }: { months: MonthPoint[]; activeMonth?: number }) {
  const W = 720, H = 240, padL = 44, padR = 12, padT = 16, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(1, ...months.map((m) => Math.max(m.targetThb, m.actualThb)))
  const x = (i: number) => padL + (innerW / 12) * (i + 0.5)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const barW = (innerW / 12) * 0.5
  const targetLine = months.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(m.targetThb)}`).join(' ')

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>เทรนด์รายได้ย้อนหลัง</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2, marginRight: 4 }} />รายได้จริง</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#d97706', marginRight: 4, verticalAlign: 'middle' }} />เป้า</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 0.5, 1].map((t) => {
          const gy = padT + innerH - t * innerH
          return (
            <g key={t}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#f1f5f9" />
              <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtShort(max * t)}</text>
            </g>
          )
        })}
        {months.map((m, i) => (
          <rect key={`bar-${i}`} x={x(i) - barW / 2} y={y(m.actualThb)} width={barW} height={padT + innerH - y(m.actualThb)} rx={2}
            fill={activeMonth === m.month ? '#15803d' : '#16a34a'} opacity={activeMonth && activeMonth !== m.month ? 0.55 : 1}>
            <title>{`${MONTHS_TH[i]}: จริง ${fmtShort(m.actualThb)} · เป้า ${fmtShort(m.targetThb)} · คาดการณ์ ${fmtShort(m.forecastThb)}`}</title>
          </rect>
        ))}
        <path d={targetLine} fill="none" stroke="#d97706" strokeWidth={2} strokeDasharray="4 3" />
        {months.map((m, i) => (
          <text key={`lbl-${i}`} x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">{MONTHS_TH[i]}</text>
        ))}
      </svg>
    </div>
  )
}
