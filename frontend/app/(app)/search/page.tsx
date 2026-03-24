'use client'
import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback } from 'react'
import { fetchWithCache, invalidateCache } from '@/lib/cache'
import { analysisApi, expenseApi } from '@/lib/api'
import { fmt, todayMonth, monthInputToApi } from '@/lib/utils'
import type { AnalysisResponse, ExpensesResponse, Expense, CatKey } from '@/types'
import { CAT_STYLE, CHART_COLORS, CAT_NAMES } from '@/types'

const DoughnutChart = dynamic(() => import('@/components/charts/DoughnutChart'), { ssr: false })
const TrendChart = dynamic(() => import('@/components/charts/TrendChart'), { ssr: false })

const CAT_KEYS: CatKey[] = ['labor', 'raw', 'chem', 'repair']

export default function SearchPage() {
  const [month, setMonth] = useState(todayMonth())
  const [catFilter, setCatFilter] = useState('all')
  const [chartView, setChartView] = useState<'trend' | 'pie'>('trend')
  const [pieMode, setPieMode] = useState<'categories' | 'budget'>('categories')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [dayFilter, setDayFilter] = useState<string | null>(null)

  const loadData = useCallback(async (m: string) => {
    const mY = monthInputToApi(m)
    setLoading(true); setError('')
    try {
      await fetchWithCache<[AnalysisResponse, ExpensesResponse]>(
        `search-v2:${mY}`,
        () => Promise.all([
          analysisApi.getAnalysis(mY) as Promise<AnalysisResponse>,
          expenseApi.getExpenses(mY) as Promise<ExpensesResponse>,
        ]),
        {
          onData: ([aRes, eRes]) => { setAnalysis(aRes); setExpenses(eRes.expenses || []); setLoading(false) },
          onSkeleton: () => setLoading(true),
        }
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData(month) }, [month, loadData])

  const filteredExpenses = catFilter === 'all' ? expenses : expenses.filter((e) => e.catKey === catFilter)
  const dayFiltered = dayFilter ? filteredExpenses.filter((e) => e.date.startsWith(dayFilter + '/')) : filteredExpenses

  const totalBudget = analysis ? CAT_KEYS.reduce((s, k) => s + (analysis.analysis[k]?.budget || 0), 0) : 0
  const totalSpent  = catFilter === 'all' ? (analysis ? CAT_KEYS.reduce((s, k) => s + (analysis.analysis[k]?.total || 0), 0) : 0) : (analysis?.analysis[catFilter as CatKey]?.total || 0)
  const catBudget   = catFilter === 'all' ? totalBudget : (analysis?.analysis[catFilter as CatKey]?.budget || 0)
  const totalRemain = catBudget - totalSpent
  const pct = catBudget > 0 ? Math.round((totalSpent / catBudget) * 100) : 0

  // Trend chart
  const [yyyy, mm] = month.split('-')
  const daysInMonth = new Date(parseInt(yyyy), parseInt(mm), 0).getDate()
  const trendLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
  const trendData = trendLabels.map((day) => {
    const dayStr = day.padStart(2, '0') + '/' + mm.padStart(2, '0') + '/' + yyyy
    return filteredExpenses.filter((e) => e.date === dayStr).reduce((s, e) => s + e.amount, 0)
  })

  // Doughnut
  const doughnutLabels = pieMode === 'categories'
    ? (catFilter === 'all' ? CAT_KEYS.map((k) => CAT_STYLE[k].label) : [CAT_STYLE[catFilter as CatKey]?.label, 'งบคงเหลือ'])
    : ['ใช้ไปแล้ว', 'คงเหลือ']
  const doughnutData = pieMode === 'categories'
    ? (catFilter === 'all' ? CAT_KEYS.map((k) => analysis?.analysis[k]?.total || 0) : [totalSpent, Math.max(0, catBudget - totalSpent)])
    : [totalSpent, Math.max(0, catBudget - totalSpent)]
  const doughnutColors = pieMode === 'categories'
    ? (catFilter === 'all' ? CAT_KEYS.map((k) => CHART_COLORS[k]) : [CHART_COLORS[catFilter as CatKey] || '#3b82f6', '#e2e8f0'])
    : [totalSpent > catBudget ? '#f43f5e' : '#3b82f6', '#e2e8f0']

  async function exportPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('รายงานรายจ่าย', 14, 16)
    doc.setFontSize(10)
    doc.text(`เดือน: ${monthInputToApi(month)}`, 14, 24)
    autoTable(doc, {
      startY: 30,
      head: [['วันที่','หมวด','รายละเอียด','ยอด (฿)','ผู้บันทึก']],
      body: dayFiltered.map((e) => [e.date, CAT_STYLE[e.catKey]?.label || e.category, e.detail, e.amount.toLocaleString('th-TH'), e.recorder]),
    })
    doc.save(`planeat-search-${month}.pdf`)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(dayFiltered.map((e) => ({
      วันที่: e.date, หมวด: CAT_STYLE[e.catKey]?.label || e.category, รายละเอียด: e.detail, 'ยอด (฿)': e.amount, ผู้บันทึก: e.recorder, หมายเหตุ: e.note,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'รายจ่าย')
    XLSX.writeFile(wb, `planeat-search-${month}.xlsx`)
  }

  return (
    <div className="page-section active">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-5 flex flex-col sm:flex-row gap-3 shadow-sm">
        <select className="form-input flex-1" style={{ padding: '7px 12px' }} value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setDayFilter(null) }}>
          <option value="all">ทุกหมวดหมู่</option>
          <option value="labor">ค่าแรงงาน</option>
          <option value="raw">ค่าวัตถุดิบ</option>
          <option value="chem">ค่าเคมี/หีบห่อ</option>
          <option value="repair">ค่าซ่อมแซม</option>
        </select>
        <input type="month" className="form-input" style={{ padding: '7px 12px' }} value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn-secondary" style={{ padding: '7px 12px' }} onClick={() => { invalidateCache(`search-v2:${monthInputToApi(month)}`); loadData(month) }}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>sync</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons-round spin text-blue-400" style={{ fontSize: 40 }}>refresh</span>
        </div>
      ) : error ? (
        <div className="text-center py-12"><p className="text-red-500">{error}</p></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="stat-card">
              <p className="text-xs text-slate-500 mb-1">งบประมาณรวม</p>
              <p className="text-xl font-bold text-slate-800">{fmt(catBudget)}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-slate-500 mb-1">ใช้ไปแล้ว</p>
              <p className="text-xl font-bold text-slate-800">{fmt(totalSpent)}</p>
              <div className="progress-track mt-2">
                <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: pct > 90 ? '#f43f5e' : pct > 75 ? '#f59e0b' : '#10b981' }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{pct}%</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-slate-500 mb-1">คงเหลือ</p>
              <p className={`text-xl font-bold ${totalRemain < 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt(totalRemain)}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-700">การวิเคราะห์รายจ่าย</h3>
                <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: '#f1f5f9' }}>
                  {(['trend','pie'] as const).map((v) => (
                    <button key={v} onClick={() => setChartView(v)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${chartView === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                      {v === 'trend' ? 'แนวโน้ม' : 'สัดส่วน'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 relative" style={{ minHeight: 260 }}>
                <div style={{ opacity: chartView === 'trend' ? 1 : 0, pointerEvents: chartView === 'trend' ? 'auto' : 'none', height: 240, position: 'absolute', inset: '16px', transition: 'opacity 0.3s' }}>
                  <TrendChart labels={trendLabels} data={trendData} color={catFilter !== 'all' ? CHART_COLORS[catFilter as CatKey] : '#6366f1'} onDayClick={(d) => setDayFilter(d.padStart(2, '0'))} />
                </div>
                <div style={{ opacity: chartView === 'pie' ? 1 : 0, pointerEvents: chartView === 'pie' ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                  {chartView === 'pie' && (
                    <>
                      <div className="flex justify-end gap-1 mb-3">
                        {(['categories','budget'] as const).map((m) => (
                          <button key={m} onClick={() => setPieMode(m)}
                            className={`px-2 py-0.5 text-xs font-bold rounded uppercase transition-all ${pieMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                            {m === 'categories' ? 'หมวด' : 'งบ %'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-4">
                        <DoughnutChart labels={doughnutLabels as string[]} data={doughnutData} colors={doughnutColors}
                          centerText={pieMode === 'budget' ? `${pct}%` : fmt(totalSpent)}
                          centerSubText={pieMode === 'budget' ? 'ใช้งบไปแล้ว' : 'รวม'} />
                        <div className="flex-1 space-y-2">
                          {pieMode === 'categories' && CAT_KEYS.filter((k) => catFilter === 'all' || k === catFilter).map((k) => (
                            <div key={k} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[k] }} />
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

            {/* Category summary */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-4">สรุปตามหมวด</h3>
              {CAT_KEYS.map((k) => {
                const cs = CAT_STYLE[k]
                const total = analysis?.analysis[k]?.total || 0
                const budget = analysis?.analysis[k]?.budget || 0
                const p = budget > 0 ? Math.min(100, (total / budget) * 100) : 0
                return (
                  <div key={k} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold" style={{ color: cs.color }}>{cs.label}</span>
                      <span className="text-slate-600">{fmt(total)}</span>
                    </div>
                    <div className="progress-track" style={{ height: 6 }}>
                      <div className="progress-fill" style={{ width: `${p}%`, background: p > 90 ? '#f43f5e' : cs.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Transaction table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-50">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                รายการ
                {dayFilter && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full cursor-pointer" style={{ background: '#dbeafe', color: '#2563eb' }} onClick={() => setDayFilter(null)}>
                    วันที่ {dayFilter} ✕
                  </span>
                )}
              </h3>
              <div className="flex gap-2">
                <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={exportPDF}>
                  <span className="material-icons-round" style={{ fontSize: 14 }}>picture_as_pdf</span>PDF
                </button>
                <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={exportExcel}>
                  <span className="material-icons-round" style={{ fontSize: 14 }}>table_view</span>Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {dayFiltered.length === 0 ? (
                <div className="py-10 text-center">
                  <span className="material-icons-round text-slate-300" style={{ fontSize: 36 }}>inbox</span>
                  <p className="text-sm text-slate-400 mt-1">ไม่พบรายการ</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['วันที่','หมวด','รายละเอียด','ยอด','ผู้บันทึก','หมายเหตุ'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dayFiltered.map((e, i) => {
                      const cs = CAT_STYLE[e.catKey]
                      return (
                        <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${i % 2 === 1 ? 'bg-blue-50/20' : ''}`}>
                          <td className="px-4 py-3 text-sm whitespace-nowrap font-medium text-slate-600">{e.date}</td>
                          <td className="px-4 py-3">
                            <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: cs?.bg, color: cs?.color }}>{cs?.label}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate">{e.detail || '—'}</td>
                          <td className="px-4 py-3 text-sm font-bold text-slate-800 text-right">{fmt(e.amount)}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{e.recorder || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{e.note || ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-100">
                      <td colSpan={3} className="px-4 py-3 text-xs font-bold text-blue-700">รวม {dayFiltered.length} รายการ</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-800">{fmt(dayFiltered.reduce((s, e) => s + e.amount, 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
