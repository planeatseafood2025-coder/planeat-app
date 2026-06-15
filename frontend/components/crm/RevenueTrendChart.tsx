'use client'

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

function fmtBaht(v: number) {
  return `฿${Math.round(v).toLocaleString()}`
}

type MonthPoint = { month: number; targetThb: number; forecastThb: number; actualThb: number }

export default function RevenueTrendChart({ months, activeMonth }: { months: MonthPoint[]; activeMonth?: number }) {
  const W = 720, H = 240, padL = 44, padR = 12, padT = 22, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(1, ...months.map((m) => Math.max(m.targetThb, m.actualThb)))
  const x = (i: number) => padL + (innerW / 12) * (i + 0.5)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const barW = (innerW / 12) * 0.5
  const targetLine = months.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(m.targetThb)}`).join(' ')

  const totalTarget = months.reduce((s, m) => s + m.targetThb, 0)
  const totalForecast = months.reduce((s, m) => s + m.forecastThb, 0)
  const totalActual = months.reduce((s, m) => s + m.actualThb, 0)

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }
  const thR: React.CSSProperties = { ...th, textAlign: 'right' }
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, color: '#0f172a' }
  const tdR: React.CSSProperties = { ...td, textAlign: 'right' }

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

        {/* actual bars + value labels */}
        {months.map((m, i) => (
          <g key={`bar-${i}`}>
            <rect x={x(i) - barW / 2} y={y(m.actualThb)} width={barW} height={padT + innerH - y(m.actualThb)} rx={2}
              fill={activeMonth === m.month ? '#15803d' : '#16a34a'} opacity={activeMonth && activeMonth !== m.month ? 0.55 : 1}>
              <title>{`${MONTHS_TH[i]}: จริง ${fmtBaht(m.actualThb)} · เป้า ${fmtBaht(m.targetThb)} · คาดการณ์ ${fmtBaht(m.forecastThb)}`}</title>
            </rect>
            {m.actualThb > 0 && (
              <text x={x(i)} y={y(m.actualThb) - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="#15803d">{fmtShort(m.actualThb)}</text>
            )}
          </g>
        ))}

        {/* target line + value labels */}
        <path d={targetLine} fill="none" stroke="#d97706" strokeWidth={2} strokeDasharray="4 3" />
        {months.map((m, i) => (
          m.targetThb > 0 ? (
            <text key={`tl-${i}`} x={x(i)} y={y(m.targetThb) - 6} textAnchor="middle" fontSize="9" fill="#d97706">{fmtShort(m.targetThb)}</text>
          ) : null
        ))}

        {/* month axis labels */}
        {months.map((m, i) => (
          <text key={`lbl-${i}`} x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">{MONTHS_TH[i]}</text>
        ))}
      </svg>

      {/* detail table */}
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>เดือน</th>
              <th style={thR}>เป้า</th>
              <th style={thR}>คาดการณ์</th>
              <th style={thR}>จริง</th>
              <th style={thR}>% เทียบเป้า</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={`row-${i}`} style={{ borderTop: '1px solid #f1f5f9', background: activeMonth === m.month ? '#f8fafc' : 'transparent' }}>
                <td style={{ ...td, fontWeight: activeMonth === m.month ? 700 : 400 }}>{MONTHS_TH[i]}</td>
                <td style={tdR}>{fmtBaht(m.targetThb)}</td>
                <td style={{ ...tdR, color: '#2563eb' }}>{fmtBaht(m.forecastThb)}</td>
                <td style={{ ...tdR, color: '#16a34a', fontWeight: 700 }}>{fmtBaht(m.actualThb)}</td>
                <td style={tdR}>{m.targetThb ? `${Math.round((m.actualThb / m.targetThb) * 100)}%` : '—'}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #e2e8f0' }}>
              <td style={{ ...td, fontWeight: 700 }}>รวมทั้งปี</td>
              <td style={{ ...tdR, fontWeight: 700 }}>{fmtBaht(totalTarget)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: '#2563eb' }}>{fmtBaht(totalForecast)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: '#16a34a' }}>{fmtBaht(totalActual)}</td>
              <td style={{ ...tdR, fontWeight: 700 }}>{totalTarget ? `${Math.round((totalActual / totalTarget) * 100)}%` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
