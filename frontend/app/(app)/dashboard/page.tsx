'use client'
import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getSession } from '@/lib/auth'
import { fetchWithCache, invalidateCache } from '@/lib/cache'
import { analysisApi, expenseApi } from '@/lib/api'
import { fmt, todayMonth, monthInputToApi, thaiLongDate } from '@/lib/utils'
import type { AnalysisResponse, ExpensesResponse, Expense, CatKey } from '@/types'
import { CAT_NAMES, CAT_STYLE, CHART_COLORS } from '@/types'

const DoughnutChart = dynamic(() => import('@/components/charts/DoughnutChart'), { ssr: false })
const TrendChart = dynamic(() => import('@/components/charts/TrendChart'), { ssr: false })

const CAT_KEYS: CatKey[] = ['labor', 'raw', 'chem', 'repair']

export default function DashboardPage() {
  const [monthFilter, setMonthFilter] = useState(todayMonth())
  const [catFilter, setCatFilter] = useState<string>('all')
  const [chartView, setChartView] = useState<'trend' | 'pie'>('trend')
  const [pieMode, setPieMode] = useState<'categories' | 'budget'>('categories')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [dayFilter, setDayFilter] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)
  const user = getSession()

  const loadData = useCallback(async (month: string, silent = false) => {
    const mY = monthInputToApi(month)
    const cacheKey = `overview-v2:${mY}`
    if (!silent) setLoading(true)
    setError('')

    try {
      await fetchWithCache<[AnalysisResponse, ExpensesResponse]>(
        cacheKey,
        () => Promise.all([
          analysisApi.getAnalysis(mY) as Promise<AnalysisResponse>,
          expenseApi.getExpenses(mY) as Promise<ExpensesResponse>,
        ]),
        {
          onData: ([aRes, eRes]) => {
            setAnalysis(aRes)
            setExpenses(eRes.expenses || [])
            setLoading(false)
          },
          onSkeleton: () => setLoading(true),
        }
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ')
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData(monthFilter) }, [monthFilter, loadData])

  // Filtered expenses
  const filteredExpenses = catFilter === 'all'
    ? expenses
    : expenses.filter((e) => e.catKey === catFilter)

  const dayFilteredExpenses = dayFilter
    ? filteredExpenses.filter((e) => e.date.startsWith(dayFilter + '/'))
    : filteredExpenses

  // Summary totals
  const totalBudget = analysis
    ? CAT_KEYS.reduce((s, k) => s + (analysis.analysis[k]?.budget || 0), 0)
    : 0
  const totalSpent = catFilter === 'all'
    ? (analysis ? CAT_KEYS.reduce((s, k) => s + (analysis.analysis[k]?.total || 0), 0) : 0)
    : (analysis?.analysis[catFilter as CatKey]?.total || 0)
  const totalRemain = totalBudget - (catFilter === 'all' ? totalSpent : (analysis?.analysis[catFilter as CatKey]?.budget || 0) - (analysis?.analysis[catFilter as CatKey]?.total || 0) + (analysis?.analysis[catFilter as CatKey]?.budget || 0) - totalBudget + totalBudget - totalSpent)

  // Doughnut data
  const doughnutLabels = catFilter === 'all'
    ? CAT_KEYS.map((k) => CAT_STYLE[k].label)
    : [CAT_STYLE[catFilter as CatKey]?.label || catFilter, 'งบคงเหลือ']

  const doughnutData = pieMode === 'categories'
    ? (catFilter === 'all'
        ? CAT_KEYS.map((k) => analysis?.analysis[k]?.total || 0)
        : [analysis?.analysis[catFilter as CatKey]?.total || 0, Math.max(0, (analysis?.analysis[catFilter as CatKey]?.budget || 0) - (analysis?.analysis[catFilter as CatKey]?.total || 0))])
    : [totalSpent, Math.max(0, totalBudget - totalSpent)]

  const doughnutColors = pieMode === 'categories'
    ? (catFilter === 'all'
        ? CAT_KEYS.map((k) => CHART_COLORS[k])
        : [CHART_COLORS[catFilter as CatKey] || '#3b82f6', '#e2e8f0'])
    : [totalSpent > totalBudget ? '#f43f5e' : '#3b82f6', '#e2e8f0']

  const pct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
  const centerText = pieMode === 'budget'
    ? `${pct}%`
    : fmt(totalSpent)
  const centerSub = pieMode === 'budget'
    ? (pct > 100 ? 'เกินงบประมาณ' : 'ใช้งบไปแล้ว')
    : 'รวมทั้งหมด'

  // Trend chart data — group by day
  const now = new Date()
  const [yyyy, mm] = monthFilter.split('-')
  const daysInMonth = new Date(parseInt(yyyy), parseInt(mm), 0).getDate()
  const trendLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
  const trendData = trendLabels.map((day) => {
    const dayStr = day.padStart(2, '0') + '/' + mm.padStart(2, '0') + '/' + yyyy
    return filteredExpenses
      .filter((e) => e.date === dayStr)
      .reduce((s, e) => s + e.amount, 0)
  })

  // Top 5 expenses
  const top5 = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  async function handleRefresh() {
    invalidateCache(`overview-v2:${monthInputToApi(monthFilter)}`)
    await loadData(monthFilter, true)
  }

  async function exportPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFont('helvetica')
    doc.setFontSize(14)
    doc.text('รายงานรายจ่าย', 14, 16)
    doc.setFontSize(10)
    doc.text(`เดือน: ${monthInputToApi(monthFilter)}   หมวด: ${catFilter === 'all' ? 'ทุกหมวด' : CAT_NAMES[catFilter as CatKey]}`, 14, 24)
    doc.text(`วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}`, 14, 30)
    autoTable(doc, {
      startY: 36,
      head: [['วันที่', 'หมวด', 'รายละเอียด', 'ยอด (฿)', 'ผู้บันทึก']],
      body: dayFilteredExpenses.map((e) => [
        e.date, CAT_STYLE[e.catKey]?.label || e.category, e.detail, e.amount.toLocaleString('th-TH'), e.recorder,
      ]),
      foot: [['', '', `รวม ${dayFilteredExpenses.length} รายการ`, dayFilteredExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString('th-TH') + ' ฿', '']],
    })
    doc.save(`planeat-report-${monthFilter}.pdf`)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(dayFilteredExpenses.map((e) => ({
      วันที่: e.date,
      หมวด: CAT_STYLE[e.catKey]?.label || e.category,
      รายละเอียด: e.detail,
      'ยอด (฿)': e.amount,
      ผู้บันทึก: e.recorder,
      หมายเหตุ: e.note,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'รายจ่าย')
    XLSX.writeFile(wb, `planeat-report-${monthFilter}.xlsx`)
  }

  return (
    <div className="page-section active">
      {/* Welcome banner */}
      <div
        className="rounded-2xl p-5 mb-5 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}
      >
        <div>
          <h2 className="text-lg font-bold text-white mb-0.5">
            สวัสดี, {user?.name || 'ผู้ใช้'}!
          </h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{thaiLongDate()}</p>
        </div>
        <span className="material-icons-round text-white opacity-40" style={{ fontSize: 48 }}>dashboard</span>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center shadow-sm">
        <div className="flex items-center gap-2 flex-1">
          <span className="material-icons-round text-slate-400" style={{ fontSize: 18 }}>filter_list</span>
          <select
            className="form-input flex-1"
            style={{ padding: '7px 12px' }}
            value={catFilter}
            onChange={(e) => { setCatFilter(e.target.value); setDayFilter(null) }}
          >
            <option value="all">ทุกหมวดหมู่</option>
            <option value="labor">ค่าแรงงาน</option>
            <option value="raw">ค่าวัตถุดิบ</option>
            <option value="chem">ค่าเคมี/หีบห่อ</option>
            <option value="repair">ค่าซ่อมแซม</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="form-input"
            style={{ padding: '7px 12px' }}
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
          <button
            className="btn-secondary"
            style={{ padding: '7px 12px' }}
            onClick={handleRefresh}
          >
            <span className="material-icons-round" style={{ fontSize: 16 }}>sync</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <span className="material-icons-round spin text-blue-400" style={{ fontSize: 40 }}>refresh</span>
            <p className="mt-2 text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12">
          <span className="material-icons-round text-red-300 mb-2" style={{ fontSize: 48 }}>error_outline</span>
          <p className="text-red-500 font-semibold">{error}</p>
          <button className="btn-primary mt-4" onClick={handleRefresh}>ลองใหม่</button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#eff6ff' }}>
                  <span className="material-icons-round text-blue-600" style={{ fontSize: 20 }}>savings</span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">งบประมาณรวมเดือนนี้</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(totalBudget)}</p>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#fffbeb' }}>
                  <span className="material-icons-round" style={{ color: '#f59e0b', fontSize: 20 }}>trending_up</span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">ใช้ไปแล้วสะสม</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(totalSpent)}</p>
                </div>
              </div>
              {totalBudget > 0 && (
                <div className="progress-track mt-2">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: pct > 90 ? '#f43f5e' : pct > 75 ? '#f59e0b' : '#10b981',
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">{pct}% ของงบประมาณ</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: totalBudget - totalSpent < 0 ? '#fef2f2' : '#f0fdf4' }}
                >
                  <span
                    className="material-icons-round"
                    style={{ color: totalBudget - totalSpent < 0 ? '#ef4444' : '#10b981', fontSize: 20 }}
                  >
                    account_balance_wallet
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">งบประมาณคงเหลือ</p>
                  <p
                    className="text-lg font-bold"
                    style={{ color: totalBudget - totalSpent < 0 ? '#ef4444' : '#10b981' }}
                  >
                    {fmt(totalBudget - totalSpent)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Category quick stats */}
          <div className="flex gap-2 flex-wrap mb-5">
            {CAT_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => { setCatFilter(catFilter === k ? 'all' : k); setDayFilter(null) }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-semibold"
                style={{
                  background: catFilter === k ? CAT_STYLE[k].bg : '#fff',
                  borderColor: catFilter === k ? CAT_STYLE[k].color : '#e2e8f0',
                  color: catFilter === k ? CAT_STYLE[k].color : '#64748b',
                  opacity: catFilter !== 'all' && catFilter !== k ? 0.5 : 1,
                }}
              >
                <span className="material-icons-round" style={{ fontSize: 14 }}>{CAT_STYLE[k].icon}</span>
                <span>{CAT_STYLE[k].label}</span>
                <span className="font-bold">{fmt(analysis?.analysis[k]?.total || 0)}</span>
              </button>
            ))}
          </div>

          {/* Analytics grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            {/* Chart card */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span className="material-icons-round text-blue-500" style={{ fontSize: 18 }}>bar_chart</span>
                  การวิเคราะห์รายจ่าย
                </h3>
                <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: '#f1f5f9' }}>
                  <button
                    onClick={() => setChartView('trend')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${chartView === 'trend' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    แนวโน้ม
                  </button>
                  <button
                    onClick={() => setChartView('pie')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${chartView === 'pie' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    สัดส่วน
                  </button>
                </div>
              </div>

              <div className="p-4 relative" style={{ minHeight: 260 }}>
                {/* Trend */}
                <div style={{ opacity: chartView === 'trend' ? 1 : 0, pointerEvents: chartView === 'trend' ? 'auto' : 'none', height: 240, position: 'absolute', inset: '16px', transition: 'opacity 0.3s' }}>
                  <TrendChart
                    labels={trendLabels}
                    data={trendData}
                    color={catFilter !== 'all' ? CHART_COLORS[catFilter as CatKey] : '#6366f1'}
                    label="ยอดรวม"
                    onDayClick={(day) => setDayFilter(day.padStart(2, '0'))}
                  />
                </div>
                {/* Pie */}
                <div style={{ opacity: chartView === 'pie' ? 1 : 0, pointerEvents: chartView === 'pie' ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                  {chartView === 'pie' && (
                    <>
                      <div className="flex items-center justify-end gap-1 mb-3">
                        {(['categories', 'budget'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setPieMode(m)}
                            className={`px-2 py-0.5 text-xs font-bold rounded uppercase transition-all ${pieMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {m === 'categories' ? 'หมวด' : 'งบ %'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-4">
                        <DoughnutChart
                          labels={doughnutLabels}
                          data={doughnutData}
                          colors={doughnutColors}
                          centerText={centerText}
                          centerSubText={centerSub}
                        />
                        {/* Legend */}
                        <div className="flex-1 space-y-2">
                          {pieMode === 'categories' && CAT_KEYS.filter(k => catFilter === 'all' || k === catFilter).map((k) => (
                            <div key={k} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_COLORS[k] }} />
                                <span className="text-slate-600">{CAT_STYLE[k].label}</span>
                              </div>
                              <span className="font-bold text-slate-700">{fmt(analysis?.analysis[k]?.total || 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Today's expenses / Top 5 */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span className="material-icons-round text-amber-500" style={{ fontSize: 18 }}>format_list_bulleted</span>
                  5 อันดับรายจ่ายสูงสุด
                </h3>
              </div>
              <div className="p-3">
                {top5.length === 0 ? (
                  <div className="py-8 text-center">
                    <span className="material-icons-round text-slate-300" style={{ fontSize: 32 }}>inbox</span>
                    <p className="text-xs text-slate-400 mt-1">ไม่มีรายการ</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {top5.map((e, i) => {
                      const cs = CAT_STYLE[e.catKey]
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group"
                          onClick={() => { setShowTable(true); setDayFilter(e.date.slice(0, 2)) }}
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
                            style={{ background: cs?.bg }}
                          >
                            <span className="material-icons-round" style={{ fontSize: 14, color: cs?.color }}>{cs?.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{e.detail || cs?.label}</p>
                            <p className="text-xs text-slate-400">{e.date} · {e.recorder}</p>
                          </div>
                          <p className="text-xs font-bold text-slate-800 whitespace-nowrap">{fmt(e.amount)}</p>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-xs text-slate-400">รวมทั้งเดือน</span>
                  <span className="text-sm font-bold text-slate-800">{fmt(expenses.reduce((s, e) => s + e.amount, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed transaction table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-50">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="material-icons-round text-blue-500" style={{ fontSize: 18 }}>table_chart</span>
                รายการทั้งหมด
                {dayFilter && (
                  <span
                    className="ml-2 text-xs px-2 py-0.5 rounded-full cursor-pointer"
                    style={{ background: '#dbeafe', color: '#2563eb' }}
                    onClick={() => setDayFilter(null)}
                  >
                    วันที่ {dayFilter} ✕
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary"
                  style={{ padding: '5px 10px', fontSize: 12 }}
                  onClick={() => setShowTable(!showTable)}
                >
                  <span className="material-icons-round" style={{ fontSize: 14 }}>
                    {showTable ? 'expand_less' : 'expand_more'}
                  </span>
                  {showTable ? 'ซ่อน' : 'แสดง'}
                </button>
                {showTable && (
                  <>
                    <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={exportPDF}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>picture_as_pdf</span>PDF
                    </button>
                    <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={exportExcel}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>table_view</span>Excel
                    </button>
                  </>
                )}
              </div>
            </div>

            {showTable && (
              <div id="detailed-transaction-container" className="overflow-x-auto">
                {dayFilteredExpenses.length === 0 ? (
                  <div className="py-10 text-center">
                    <span className="material-icons-round text-slate-300" style={{ fontSize: 36 }}>inbox</span>
                    <p className="text-sm text-slate-400 mt-1">ไม่พบรายการ</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['วันที่','หมวด','รายละเอียด','ยอด','ผู้บันทึก','หมายเหตุ'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dayFilteredExpenses.map((e, i) => {
                        const cs = CAT_STYLE[e.catKey]
                        return (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap font-medium">{e.date}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: cs?.bg, color: cs?.color }}>
                                {cs?.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate" title={e.detail}>{e.detail || '—'}</td>
                            <td className="px-4 py-3 text-sm font-bold text-slate-800 text-right whitespace-nowrap">{fmt(e.amount)}</td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{e.recorder || '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{e.note || ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-50 border-t-2 border-blue-100">
                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-blue-700">รวม {dayFilteredExpenses.length} รายการ</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-800">{fmt(dayFilteredExpenses.reduce((s, e) => s + e.amount, 0))}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
