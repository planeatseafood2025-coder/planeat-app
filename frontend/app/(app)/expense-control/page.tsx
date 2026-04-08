'use client'
import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { expenseDraftApi, categoryApi, dynamicDraftApi, budgetApi, analysisApi, expenseApi } from '@/lib/api'
import { fetchWithCache, invalidateCache } from '@/lib/cache'
import { fmt, todayIso, isoToThai, todayMonth, monthInputToApi } from '@/lib/utils'
import type {
  ExpenseDraft, ExpenseRecord, DraftsResponse, ExpenseHistoryResponse,
  ExpenseCategory, CategoriesResponse, CategorySummary, DynamicAnalysisResponse,
  DynamicAnalysisEntry, BudgetResponse, CatKey,
  AnalysisResponse, ExpensesResponse, Expense,
} from '@/types'
import { CAT_STYLE, CHART_COLORS, ROLE_LABELS } from '@/types'

const DoughnutChart = dynamic(() => import('@/components/charts/DoughnutChart'), { ssr: false })
const TrendChart    = dynamic(() => import('@/components/charts/TrendChart'),    { ssr: false })

type Tab = 'overview' | 'daily' | 'pending' | 'budget' | 'history' | 'categories'

const MANAGER_ROLES = ['accounting_manager', 'super_admin', 'it_manager', 'admin']

export default function ExpenseControlPage() {
  const user = getSession()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'overview'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [catVersion, setCatVersion] = useState(0)
  const isManager = MANAGER_ROLES.includes(user?.role || '')

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const tabBtn = (t: Tab, label: string, icon: string) => (
    <button key={t} onClick={() => setTab(t)} style={{
      padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
      color: tab === t ? '#2563eb' : '#64748b',
      background: 'transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4,
      whiteSpace: 'nowrap',
    }}>
      <span className="material-icons-round" style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  )

  return (
    <div className="page-section active">
      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.type === 'ok' ? '#166534' : '#991b1b', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>{msg.type === 'ok' ? 'check_circle' : 'error'}</span>
          {msg.text}
        </div>
      )}

      {/* Header / Tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-5">
        <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', gap: 0, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRight: '1px solid #f1f5f9', flexShrink: 0 }}>
            <span className="material-icons-round text-blue-500" style={{ fontSize: 20 }}>account_balance</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>ระบบควบคุมค่าใช้จ่าย</span>
          </div>
          {tabBtn('overview',    'ภาพรวม',          'bar_chart')}
          {tabBtn('daily',       'บันทึกรายวัน',     'edit_note')}
          {tabBtn('pending',     'รอดำเนินการ',      'pending_actions')}
          {tabBtn('budget',      'งบประมาณ',         'savings')}
          {tabBtn('history',     'ประวัติ',           'history')}
          {isManager && tabBtn('categories', 'จัดการหมวด', 'category')}
        </div>
      </div>

      {tab === 'overview'    && <OverviewTab user={user} onGoToCategories={() => setTab('categories')} />}
      {tab === 'daily'       && <DailyTab user={user} flash={flash} catVersion={catVersion} />}
      {tab === 'pending'     && <PendingTab user={user} flash={flash} />}
      {tab === 'budget'      && <BudgetTab user={user} flash={flash} />}
      {tab === 'history'     && <HistoryTab />}
      {tab === 'categories'  && isManager && <CategoryManagerTab flash={flash} onCatChange={() => setCatVersion(v => v + 1)} />}
    </div>
  )
}

// ─── Overview Tab (Full Analytics) ───────────────────────────────────────────
function OverviewTab({ user, onGoToCategories }: {
  user: ReturnType<typeof getSession>
  onGoToCategories: () => void
}) {
  const isManager = MANAGER_ROLES.includes(user?.role || '')
  const [monthFilter, setMonthFilter] = useState(todayMonth())
  const [catFilter, setCatFilter] = useState('all')
  const [chartView, setChartView] = useState<'trend' | 'pie'>('trend')
  const [pieMode, setPieMode] = useState<'categories' | 'budget'>('categories')
  const [loading, setLoading] = useState(true)
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null)
  const [dynCategories, setDynCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [dayFilter, setDayFilter] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)

  const load = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const mY = monthInputToApi(m)
      const [aRes, eRes, cRes] = await Promise.all([
        analysisApi.getAnalysis(mY) as Promise<AnalysisResponse>,
        expenseApi.getExpenses(mY) as Promise<ExpensesResponse>,
        categoryApi.getMine() as Promise<CategoriesResponse>,
      ])
      setAnalysisData(aRes)
      setExpenses(eRes.expenses || [])
      setDynCategories(cRes.categories || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load(monthFilter) }, [monthFilter, load])

  // Merge dynamic categories with analysis data
  const analysisMap = (analysisData?.analysis || {}) as Record<string, { total: number; budget: number; label: string; color: string }>
  const cats = dynCategories.length > 0
    ? dynCategories.map(cat => ({
        catKey: cat.id,
        label: cat.name,
        color: cat.color || '#3b82f6',
        icon: (cat as ExpenseCategory & { icon?: string }).icon || 'receipt_long',
        total: analysisMap[cat.id]?.total || 0,
        budget: analysisMap[cat.id]?.budget || 0,
      }))
    : Object.entries(analysisMap).map(([key, val]) => ({
        catKey: key, label: val.label || key, color: val.color || '#3b82f6',
        icon: 'receipt_long', total: val.total, budget: val.budget,
      }))

  const activeCat = catFilter !== 'all' ? cats.find(c => c.catKey === catFilter) : null
  const totalBudget = catFilter === 'all' ? cats.reduce((s, c) => s + c.budget, 0) : (activeCat?.budget || 0)
  const totalSpent  = catFilter === 'all' ? (analysisData?.overallTotal || 0) : (activeCat?.total || 0)
  const pct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  const filteredExpenses = catFilter === 'all' ? expenses : expenses.filter(e => e.catKey === catFilter)
  const dayFilteredExpenses = dayFilter ? filteredExpenses.filter(e => e.date.startsWith(dayFilter + '/')) : filteredExpenses
  const top5 = catFilter === 'all'
    ? [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5)
    : [...expenses].filter(e => e.catKey === catFilter).sort((a, b) => b.amount - a.amount).slice(0, 5)

  // Trend chart
  const [yyyy, mm] = monthFilter.split('-')
  const daysInMonth = new Date(parseInt(yyyy), parseInt(mm), 0).getDate()
  const trendLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
  const trendData = trendLabels.map(day => {
    const dayStr = day.padStart(2, '0') + '/' + mm + '/' + yyyy
    return filteredExpenses.filter(e => e.date === dayStr).reduce((s, e) => s + e.amount, 0)
  })

  // Pie chart
  const visibleCats = catFilter === 'all' ? cats : cats.filter(c => c.catKey === catFilter)
  const doughnutLabels = pieMode === 'categories'
    ? (catFilter === 'all' ? cats.map(c => c.label) : [activeCat?.label || '', 'คงเหลือ'])
    : ['ใช้ไป', 'คงเหลือ']
  const doughnutData = pieMode === 'categories'
    ? (catFilter === 'all' ? cats.map(c => c.total) : [activeCat?.total || 0, Math.max(0, (activeCat?.budget || 0) - (activeCat?.total || 0))])
    : [totalSpent, Math.max(0, totalBudget - totalSpent)]
  const doughnutColors = pieMode === 'categories'
    ? (catFilter === 'all' ? cats.map(c => c.color) : [activeCat?.color || '#3b82f6', '#e2e8f0'])
    : [totalSpent > totalBudget ? '#f43f5e' : '#3b82f6', '#e2e8f0']
  const centerText = pieMode === 'budget' ? `${pct}%` : fmt(totalSpent)
  const centerSub  = pieMode === 'budget' ? (pct > 100 ? 'เกินงบ' : 'ใช้ไปแล้ว') : 'รวมทั้งหมด'

  return (
    <div>
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 flex-1">
          <span className="material-icons-round text-slate-400" style={{ fontSize: 18 }}>filter_list</span>
          <select className="form-input flex-1" style={{ padding: '7px 12px' }}
            value={catFilter} onChange={e => { setCatFilter(e.target.value); setDayFilter(null) }}>
            <option value="all">ทุกหมวดหมู่</option>
            {cats.map(c => <option key={c.catKey} value={c.catKey}>{c.label}</option>)}
          </select>
        </div>
        <input type="month" className="form-input" style={{ padding: '7px 12px' }}
          value={monthFilter} onChange={e => { setMonthFilter(e.target.value); setDayFilter(null) }} />
        <button className="btn-secondary" style={{ padding: '7px 12px' }} onClick={() => load(monthFilter)}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>sync</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons-round spin text-blue-400" style={{ fontSize: 40 }}>refresh</span>
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
                  <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: pct > 90 ? '#f43f5e' : pct > 75 ? '#f59e0b' : '#10b981' }} />
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">{pct}% ของงบประมาณ</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: totalBudget - totalSpent < 0 ? '#fef2f2' : '#f0fdf4' }}>
                  <span className="material-icons-round"
                    style={{ color: totalBudget - totalSpent < 0 ? '#ef4444' : '#10b981', fontSize: 20 }}>account_balance_wallet</span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">งบประมาณคงเหลือ</p>
                  <p className="text-lg font-bold" style={{ color: totalBudget - totalSpent < 0 ? '#ef4444' : '#10b981' }}>
                    {fmt(totalBudget - totalSpent)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Category chips + manage button */}
          <div className="flex gap-2 flex-wrap mb-5 items-center">
            {cats.map(c => (
              <button key={c.catKey}
                onClick={() => { setCatFilter(catFilter === c.catKey ? 'all' : c.catKey); setDayFilter(null) }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-semibold"
                style={{
                  background: catFilter === c.catKey ? c.color + '22' : '#fff',
                  borderColor: catFilter === c.catKey ? c.color : '#e2e8f0',
                  color: catFilter === c.catKey ? c.color : '#64748b',
                  opacity: catFilter !== 'all' && catFilter !== c.catKey ? 0.5 : 1,
                }}>
                <span className="material-icons-round" style={{ fontSize: 14 }}>{c.icon || 'receipt_long'}</span>
                <span>{c.label}</span>
                <span className="font-bold">{fmt(c.total)}</span>
              </button>
            ))}
            {isManager && (
              <button onClick={onGoToCategories}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all text-xs font-semibold"
                style={{ borderStyle: 'dashed', borderColor: '#94a3b8', color: '#64748b', background: '#fff' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b' }}>
                <span className="material-icons-round" style={{ fontSize: 14 }}>add_circle</span>
                แก้ไขและสร้างหมวดใหม่
              </button>
            )}
          </div>

          {/* Chart + Top5 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span className="material-icons-round text-blue-500" style={{ fontSize: 18 }}>bar_chart</span>
                  การวิเคราะห์รายจ่าย
                </h3>
                <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: '#f1f5f9' }}>
                  {(['trend', 'pie'] as const).map(v => (
                    <button key={v} onClick={() => setChartView(v)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${chartView === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                      {v === 'trend' ? 'แนวโน้ม' : 'สัดส่วน'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 relative" style={{ minHeight: 260 }}>
                <div style={{ opacity: chartView === 'trend' ? 1 : 0, pointerEvents: chartView === 'trend' ? 'auto' : 'none', height: 240, position: 'absolute', inset: '16px', transition: 'opacity 0.3s' }}>
                  <TrendChart labels={trendLabels} data={trendData}
                    color={catFilter !== 'all' ? (activeCat?.color || '#6366f1') : '#6366f1'}
                    label="ยอดรวม"
                    onDayClick={(day) => setDayFilter(dayFilter === day.padStart(2,'0') ? null : day.padStart(2,'0'))} />
                </div>
                <div style={{ opacity: chartView === 'pie' ? 1 : 0, pointerEvents: chartView === 'pie' ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                  {chartView === 'pie' && (
                    <>
                      <div className="flex items-center justify-end gap-1 mb-3">
                        {(['categories', 'budget'] as const).map(m => (
                          <button key={m} onClick={() => setPieMode(m)}
                            className={`px-2 py-0.5 text-xs font-bold rounded transition-all ${pieMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                            {m === 'categories' ? 'หมวด' : 'งบ %'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-4">
                        <DoughnutChart labels={doughnutLabels} data={doughnutData} colors={doughnutColors}
                          centerText={centerText} centerSubText={centerSub}
                          onSliceClick={(i) => {
                            if (pieMode === 'categories' && catFilter === 'all' && cats[i]) {
                              setCatFilter(cats[i].catKey); setDayFilter(null)
                            } else if (pieMode === 'categories' && catFilter !== 'all') {
                              setCatFilter('all'); setDayFilter(null)
                            }
                          }} />
                        <div className="flex-1 space-y-2">
                          {pieMode === 'categories' && visibleCats.map(c => (
                            <div key={c.catKey} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color, display: 'inline-block' }} />
                                <span className="text-slate-600">{c.label}</span>
                              </div>
                              <span className="font-bold text-slate-700">{fmt(c.total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Top 5 */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span className="material-icons-round text-amber-500" style={{ fontSize: 18 }}>format_list_bulleted</span>
                  5 อันดับรายจ่ายสูงสุด{catFilter !== 'all' && activeCat ? ` · ${activeCat.label}` : ''}
                </h3>
              </div>
              <div className="p-3">
                {top5.length === 0 ? (
                  <div className="py-8 text-center">
                    <span className="material-icons-round text-slate-300" style={{ fontSize: 32 }}>inbox</span>
                    <p className="text-xs text-slate-400 mt-1">ไม่มีรายการ</p>
                  </div>
                ) : top5.map((e, i) => {
                  const cat = cats.find(c => c.catKey === e.catKey)
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer group"
                      onClick={() => { setShowTable(true); setDayFilter(e.date.slice(0, 2)) }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
                        style={{ background: (cat?.color || '#3b82f6') + '22' }}>
                        <span className="material-icons-round" style={{ fontSize: 14, color: cat?.color || '#3b82f6' }}>{cat?.icon || 'receipt_long'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{e.detail || cat?.label || e.category}</p>
                        <p className="text-xs text-slate-400">{e.date} · {e.recorder}</p>
                      </div>
                      <p className="text-xs font-bold text-slate-800 whitespace-nowrap">{fmt(e.amount)}</p>
                    </div>
                  )
                })}
                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-xs text-slate-400">รวมทั้งเดือน</span>
                  <span className="text-sm font-bold text-slate-800">{fmt(expenses.reduce((s, e) => s + e.amount, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-50">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="material-icons-round text-blue-500" style={{ fontSize: 18 }}>table_chart</span>
                รายการทั้งหมด
                {dayFilter && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full cursor-pointer"
                    style={{ background: '#dbeafe', color: '#2563eb' }}
                    onClick={() => setDayFilter(null)}>
                    วันที่ {dayFilter} ✕
                  </span>
                )}
              </h3>
              <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => setShowTable(!showTable)}>
                <span className="material-icons-round" style={{ fontSize: 14 }}>{showTable ? 'expand_less' : 'expand_more'}</span>
                {showTable ? 'ซ่อน' : 'แสดง'}
              </button>
            </div>
            {showTable && (
              <div className="overflow-x-auto">
                {dayFilteredExpenses.length === 0 ? (
                  <div className="py-10 text-center">
                    <span className="material-icons-round text-slate-300" style={{ fontSize: 36 }}>inbox</span>
                    <p className="text-sm text-slate-400 mt-1">ไม่พบรายการ</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['วันที่','หมวด','รายละเอียด','ยอด','ผู้บันทึก'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dayFilteredExpenses.map((e, i) => {
                        const cat = cats.find(c => c.catKey === e.catKey)
                        return (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap font-medium">{e.date}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                                style={{ background: (cat?.color || '#3b82f6') + '22', color: cat?.color || '#3b82f6' }}>
                                {cat?.label || e.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate">{e.detail || '—'}</td>
                            <td className="px-4 py-3 text-sm font-bold text-slate-800 text-right whitespace-nowrap">{fmt(e.amount)}</td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{e.recorder || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-50 border-t-2 border-blue-100">
                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-blue-700">รวม {dayFilteredExpenses.length} รายการ</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-800">{fmt(dayFilteredExpenses.reduce((s, e) => s + e.amount, 0))}</td>
                        <td />
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

// ─── Daily Tab (Dynamic) ─────────────────────────────────────────────────────
function DailyTab({ user, flash, catVersion }: { user: ReturnType<typeof getSession>; flash: (t: 'ok'|'err', m: string) => void; catVersion: number }) {
  const [date, setDate] = useState(todayIso())
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [panels, setPanels] = useState<Record<string, { open: boolean; items: Record<string, string>[] }>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [loadingCats, setLoadingCats] = useState(true)

  useEffect(() => {
    setLoadingCats(true)
    categoryApi.getMine().then((res) => {
      const r = res as CategoriesResponse
      setCategories(r.categories || [])
      const init: Record<string, { open: boolean; items: Record<string, string>[] }> = {}
      ;(r.categories || []).forEach(cat => { init[cat.id] = { open: false, items: [] } })
      setPanels(init)
    }).catch(() => {}).finally(() => setLoadingCats(false))
  }, [catVersion])

  function defaultRow(cat: ExpenseCategory): Record<string, string> {
    const row: Record<string, string> = {}
    cat.fields.forEach(f => { row[f.fieldId] = '' })
    return row
  }

  function togglePanel(catId: string, cat: ExpenseCategory) {
    setPanels(prev => {
      const next: typeof prev = {}
      Object.keys(prev).forEach(k => { next[k] = { ...prev[k], open: false } })
      const cur = prev[catId]
      if (!cur?.open) {
        const items = (cur?.items.length || 0) === 0 ? [defaultRow(cat)] : (cur?.items || [defaultRow(cat)])
        next[catId] = { open: true, items }
      }
      return next
    })
  }

  function addItem(catId: string, cat: ExpenseCategory) {
    setPanels(prev => ({ ...prev, [catId]: { ...prev[catId], items: [...prev[catId].items, defaultRow(cat)] } }))
  }

  function removeItem(catId: string, idx: number) {
    setPanels(prev => ({ ...prev, [catId]: { ...prev[catId], items: prev[catId].items.filter((_, i) => i !== idx) } }))
  }

  function updateItem(catId: string, idx: number, fieldId: string, value: string) {
    setPanels(prev => {
      const items = [...prev[catId].items]
      items[idx] = { ...items[idx], [fieldId]: value }
      return { ...prev, [catId]: { ...prev[catId], items } }
    })
  }

  function calcPreview(cat: ExpenseCategory, row: Record<string, string>): number {
    const vals: Record<string, number> = {}
    cat.fields.forEach(f => {
      if (['qty','price','addend','fixed'].includes(f.calcRole)) {
        vals[f.calcRole] = parseFloat(row[f.fieldId] || '0') || 0
      }
    })
    const { qty = 0, price = 0, addend = 0, fixed = 0 } = vals
    if (cat.formula === 'qty*price') return qty * price
    if (cat.formula === 'qty*price+addend') return qty * price + addend
    if (cat.formula === 'fixed') return fixed
    if (cat.formula === 'qty+price') return qty + price
    return fixed || (qty * price + addend)
  }

  async function submitDraft(catId: string, cat: ExpenseCategory) {
    if (!date) { flash('err', 'กรุณาเลือกวันที่'); return }
    const items = panels[catId]?.items || []
    if (items.length === 0) { flash('err', 'กรุณากรอกข้อมูลอย่างน้อย 1 รายการ'); return }

    // Validate required fields
    for (const item of items) {
      for (const f of cat.fields) {
        if (f.required && f.calcRole !== 'note' && !item[f.fieldId]) {
          flash('err', `กรุณากรอก "${f.label}"`)
          return
        }
      }
    }

    const rows = items.map(item => {
      const row: Record<string, string | number> = {}
      cat.fields.forEach(f => {
        row[f.fieldId] = f.type === 'number' ? (parseFloat(item[f.fieldId] || '0') || 0) : (item[f.fieldId] || '')
      })
      return row
    })

    setSubmitting(catId)
    try {
      const res = await dynamicDraftApi.submit({
        username: user?.username || '',
        catId,
        date: isoToThai(date),
        rows,
      }) as { success: boolean; message: string }
      if (res.success) {
        setPanels(prev => ({ ...prev, [catId]: { open: false, items: [] } }))
        invalidateCache('*')
        flash('ok', `${res.message} — รอผู้จัดการฝ่ายบัญชีตรวจสอบ`)
      } else {
        flash('err', res.message)
      }
    } catch (e: unknown) {
      flash('err', (e as Error).message || 'เกิดข้อผิดพลาด')
    } finally { setSubmitting(null) }
  }

  if (loadingCats) return (
    <div className="flex items-center justify-center py-16">
      <span className="material-icons-round spin text-blue-400" style={{ fontSize: 36 }}>refresh</span>
    </div>
  )

  return (
    <div>
      {/* Recorder info */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">ผู้บันทึก</label>
            <div className="form-input" style={{ background: '#f8fafc', color: '#475569' }}>
              {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.name || user?.username || '—'}
              {user?.role && <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>({ROLE_LABELS[user.role] ?? user.role})</span>}
            </div>
          </div>
          <div>
            <label className="form-label">วันที่บันทึก <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>info</span>
          รายการจะถูกส่งให้ผู้จัดการฝ่ายบัญชีตรวจสอบก่อนบันทึกจริง
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
          <span className="material-icons-round text-slate-300" style={{ fontSize: 48 }}>lock</span>
          <p className="text-slate-400 mt-2 text-sm">คุณไม่มีสิทธิ์บันทึกหมวดใด</p>
        </div>
      ) : (
        categories.map(cat => {
          const panel = panels[cat.id] || { open: false, items: [] }
          return (
            <div key={cat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
              <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors" onClick={() => togglePanel(cat.id, cat)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: cat.color + '22' }}>
                    <span className="material-icons-round" style={{ fontSize: 18, color: cat.color }}>{cat.icon}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800">{cat.name}</p>
                    <p className="text-xs text-slate-400">{panel.items.length > 0 && panel.open ? `${panel.items.length} รายการ` : 'คลิกเพื่อเพิ่มรายการ'}</p>
                  </div>
                </div>
                <span className="material-icons-round text-slate-400" style={{ fontSize: 20 }}>{panel.open ? 'expand_less' : 'expand_more'}</span>
              </button>
              <div className={`form-panel ${panel.open ? 'open' : ''}`}>
                <div className="px-4 pb-4">
                  {panel.items.map((item, idx) => (
                    <DynamicItemCard key={idx} cat={cat} item={item} idx={idx}
                      total={calcPreview(cat, item)}
                      canDelete={panel.items.length > 1}
                      onChange={(fId, v) => updateItem(cat.id, idx, fId, v)}
                      onDelete={() => removeItem(cat.id, idx)} />
                  ))}
                  <div className="flex items-center justify-between mt-3">
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => addItem(cat.id, cat)}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>add</span>เพิ่มรายการ
                    </button>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '6px 16px', background: '#2563eb' }}
                      onClick={() => submitDraft(cat.id, cat)} disabled={submitting === cat.id}>
                      {submitting === cat.id
                        ? <><span className="material-icons-round spin" style={{ fontSize: 14 }}>refresh</span>กำลังส่ง...</>
                        : <><span className="material-icons-round" style={{ fontSize: 14 }}>send</span>ส่งขออนุมัติ</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Dynamic Item Card ────────────────────────────────────────────────────────
function DynamicItemCard({ cat, item, idx, total, canDelete, onChange, onDelete }: {
  cat: ExpenseCategory; item: Record<string, string>; idx: number; total: number
  canDelete: boolean; onChange: (fId: string, v: string) => void; onDelete: () => void
}) {
  return (
    <div style={{ background: cat.color + '11', border: `1px solid ${cat.color}44`, borderRadius: 12, padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: cat.color }}>รายการที่ {idx + 1}</span>
        {canDelete && (
          <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>delete_outline</span>
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 4 }}>
        {cat.fields.filter(f => f.calcRole !== 'note').map(f => (
          <div key={f.fieldId}>
            <label className="form-label">{f.label}{f.unit ? ` (${f.unit})` : ''}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
            {f.type === 'select' ? (
              <select className="form-input" value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)}>
                <option value="">เลือก...</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type} className="form-input" placeholder={f.placeholder}
                value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)} />
            )}
          </div>
        ))}
      </div>

      {cat.fields.filter(f => f.calcRole === 'note').map(f => (
        <div key={f.fieldId} style={{ marginTop: 12 }}>
          <label className="form-label">{f.label}</label>
          <input type="text" className="form-input" placeholder={f.placeholder}
            value={item[f.fieldId] || ''} onChange={e => onChange(f.fieldId, e.target.value)} />
        </div>
      ))}

      <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12, fontWeight: 700, color: cat.color }}>รวม: {fmt(total)}</div>
    </div>
  )
}

// ─── Pending Approval Tab ─────────────────────────────────────────────────────
function PendingTab({ user, flash }: { user: ReturnType<typeof getSession>; flash: (t: 'ok'|'err', m: string) => void }) {
  const [drafts, setDrafts] = useState<ExpenseDraft[]>([])
  const [isManager, setIsManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const loadDrafts = useCallback(async (s: string) => {
    setLoading(true)
    try {
      const res = await expenseDraftApi.getDrafts(s) as DraftsResponse
      setDrafts(res.drafts || [])
      setIsManager(res.isManager || false)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadDrafts(statusFilter) }, [statusFilter, loadDrafts])

  async function handleApprove(id: string) {
    setProcessing(id)
    try {
      // Try dynamic approve first (handles both dynamic and legacy)
      const res = await dynamicDraftApi.approve(id) as { success: boolean; message: string }
      if (res.success) { flash('ok', 'อนุมัติสำเร็จ — บันทึกลงระบบแล้ว'); invalidateCache('*'); loadDrafts(statusFilter) }
      else flash('err', res.message)
    } catch (e: unknown) { flash('err', (e as Error).message || 'เกิดข้อผิดพลาด') }
    finally { setProcessing(null) }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) { flash('err', 'กรุณาระบุเหตุผล'); return }
    setProcessing(id)
    try {
      const res = await expenseDraftApi.reject(id, rejectReason) as { success: boolean; message: string }
      if (res.success) { flash('ok', 'ส่งผลการปฏิเสธแล้ว'); setRejectId(null); setRejectReason(''); loadDrafts(statusFilter) }
      else flash('err', res.message)
    } catch (e: unknown) { flash('err', (e as Error).message || 'เกิดข้อผิดพลาด') }
    finally { setProcessing(null) }
  }

  function fmtDT(iso: string) {
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
    pending:  { label: 'รอดำเนินการ', bg: '#fef9c3', color: '#a16207' },
    approved: { label: 'อนุมัติแล้ว',  bg: '#dcfce7', color: '#166534' },
    rejected: { label: 'ไม่อนุมัติ',   bg: '#fee2e2', color: '#991b1b' },
  }

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-2">
            {(['pending','approved','rejected'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${statusFilter === s ? STATUS_LABELS[s].color : '#e2e8f0'}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusFilter === s ? STATUS_LABELS[s].bg : 'white', color: statusFilter === s ? STATUS_LABELS[s].color : '#64748b' }}>
                {STATUS_LABELS[s].label}
              </button>
            ))}
          </div>
          {!isManager && (
            <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: 6 }}>
              แสดงเฉพาะรายการของคุณ
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons-round spin text-blue-400" style={{ fontSize: 36 }}>refresh</span>
        </div>
      ) : drafts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
          <span className="material-icons-round text-slate-300" style={{ fontSize: 48 }}>inbox</span>
          <p className="text-slate-400 mt-2 text-sm">ไม่มีรายการ</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {drafts.map(d => {
            const cs = CAT_STYLE[d.catKey as CatKey] || { bg: '#f1f5f9', color: '#64748b', icon: 'receipt_long' }
            const st = STATUS_LABELS[d.status] || STATUS_LABELS.pending
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: cs.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-icons-round" style={{ fontSize: 20, color: cs.color }}>{cs.icon}</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{d.category}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                        วันที่ {d.date} · ส่งโดย <strong>{d.recorderName}</strong>
                        {d.recorderLineId && <span style={{ color: '#06b6d4', marginLeft: 6 }}>LINE: {d.recorderLineId}</span>}
                      </p>
                      {d.detail && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>{d.detail}</p>}
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>ส่งเมื่อ {fmtDT(d.submittedAt)}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b' }}>฿{d.total.toLocaleString('th-TH')}</p>
                  </div>
                </div>

                {d.status === 'rejected' && d.rejectReason && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
                    <strong>เหตุผล:</strong> {d.rejectReason}
                    {d.reviewedBy && <span style={{ marginLeft: 8, color: '#b91c1c' }}>— โดย {d.reviewedBy}</span>}
                  </div>
                )}
                {d.status === 'approved' && d.reviewedBy && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                    อนุมัติโดย <strong>{d.reviewedBy}</strong> เมื่อ {d.reviewedAt ? fmtDT(d.reviewedAt) : ''}
                  </div>
                )}

                {checkIsManager(user) && d.status === 'pending' && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => handleApprove(d.id)} disabled={processing === d.id}
                      style={{ padding: '8px 20px', borderRadius: 8, background: '#16a34a', color: 'white', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>check_circle</span>
                      {processing === d.id ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
                    </button>
                    <button onClick={() => { setRejectId(rejectId === d.id ? null : d.id); setRejectReason('') }}
                      style={{ padding: '8px 20px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>cancel</span>
                      ไม่อนุมัติ
                    </button>
                  </div>
                )}

                {rejectId === d.id && (
                  <div style={{ marginTop: 10, padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>เหตุผลที่ไม่อนุมัติ <span style={{ color: '#ef4444' }}>*</span></label>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="ระบุเหตุผล..." rows={2}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #fca5a5', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                    <button onClick={() => handleReject(d.id)} disabled={processing === d.id}
                      style={{ marginTop: 8, padding: '6px 16px', borderRadius: 8, background: '#dc2626', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      ยืนยันการปฏิเสธ
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function checkIsManager(user: ReturnType<typeof getSession>) {
  return MANAGER_ROLES.includes(user?.role || '')
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────
const CAT_KEYS_LEGACY: CatKey[] = ['labor', 'raw', 'chem', 'repair']

function BudgetTab({ user, flash }: { user: ReturnType<typeof getSession>; flash: (t: 'ok'|'err', m: string) => void }) {
  const canEdit = MANAGER_ROLES.includes(user?.role || '') || user?.role === 'accountant'
  const [month, setMonth] = useState(todayMonth())
  const [data, setData] = useState<BudgetResponse | null>(null)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalMonth, setModalMonth] = useState(todayMonth())
  const [budgets, setBudgets] = useState<Record<string, { monthly: string; daily: string }>>({})
  const [saving, setSaving] = useState(false)

  const loadBudget = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const [budgetRes, catRes] = await Promise.all([
        budgetApi.getBudget(monthInputToApi(m)) as Promise<BudgetResponse>,
        categoryApi.getAll() as Promise<CategoriesResponse>,
      ])
      setData(budgetRes)
      setCategories(catRes.categories || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadBudget(month) }, [month, loadBudget])

  async function openModal() {
    setModalMonth(month)
    try {
      const [budgetRes, catRes] = await Promise.all([
        budgetApi.getBudget(monthInputToApi(month)) as Promise<BudgetResponse>,
        categoryApi.getAll() as Promise<CategoriesResponse>,
      ])
      setCategories(catRes.categories || [])
      const nb: Record<string, { monthly: string; daily: string }> = {}
      ;(catRes.categories || []).forEach(cat => {
        const e = budgetRes.data?.[cat.id]
        nb[cat.id] = { monthly: e?.monthlyBudget ? String(e.monthlyBudget) : '', daily: e?.dailyRate ? String(e.dailyRate) : '' }
      })
      setBudgets(nb)
    } catch {}
    setShowModal(true)
  }

  async function saveBudget() {
    setSaving(true)
    try {
      const payload = {
        username: user?.username || '',
        monthYear: monthInputToApi(modalMonth),
        budgets: Object.fromEntries(categories.map(cat => [cat.id, {
          monthly: parseFloat(budgets[cat.id]?.monthly) || 0,
          daily: parseFloat(budgets[cat.id]?.daily) || 0,
        }]))
      }
      const res = await budgetApi.setBudget(payload) as { success: boolean; message: string }
      if (res.success) { flash('ok', 'บันทึกงบประมาณสำเร็จ'); setShowModal(false); loadBudget(month); invalidateCache('*') }
      else flash('err', res.message || 'เกิดข้อผิดพลาด')
    } catch (e: unknown) { flash('err', (e as Error).message || 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  // Get display info for a category id — prefer data returned from backend, fallback to local category list
  function getCatMeta(catId: string) {
    const entry = data?.data?.[catId] as (typeof data.data)[string] & { label?: string; color?: string; icon?: string } | undefined
    const cat = categories.find(c => c.id === catId)
    return {
      label: entry?.label || cat?.name || catId,
      color: entry?.color || cat?.color || '#64748b',
      icon: entry?.icon || cat?.icon || 'receipt_long',
    }
  }

  const catIds = categories.map(c => c.id)

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex items-center gap-3 flex-wrap">
        <div>
          <label className="form-label">เดือน</label>
          <input type="month" className="form-input" style={{ padding: '6px 10px', width: 160 }}
            value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        {canEdit && (
          <button className="btn-primary" style={{ marginTop: 20, fontSize: 13 }} onClick={openModal}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
            ตั้งงบประมาณ
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons-round spin text-blue-400" style={{ fontSize: 36 }}>refresh</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {catIds.map(catId => {
            const meta = getCatMeta(catId)
            const entry = data?.data?.[catId]
            const pct = entry && entry.monthlyBudget > 0 ? Math.min(100, (entry.spentMonth / entry.monthlyBudget) * 100) : 0
            const over = entry && entry.spentMonth > entry.monthlyBudget && entry.monthlyBudget > 0
            return (
              <div key={catId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 18, color: meta.color }}>{meta.icon}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{meta.label}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10 }}>
                    <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>งบรายเดือน</p>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>฿{(entry?.monthlyBudget || 0).toLocaleString('th-TH')}</p>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10 }}>
                    <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>ใช้ไปแล้ว</p>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: over ? '#dc2626' : '#1e293b' }}>฿{(entry?.spentMonth || 0).toLocaleString('th-TH')}</p>
                  </div>
                </div>
                {entry && entry.monthlyBudget > 0 && (
                  <>
                    <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: over ? '#ef4444' : meta.color, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: over ? '#dc2626' : '#94a3b8' }}>
                      {over ? `เกินงบ ${fmt(entry.spentMonth - entry.monthlyBudget)}` : `คงเหลือ ${fmt(entry.monthlyBudget - entry.spentMonth)}`}
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Budget modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>ตั้งงบประมาณ</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                <span className="material-icons-round" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">เดือน</label>
                <input type="month" className="form-input" style={{ maxWidth: 200 }} value={modalMonth} onChange={e => setModalMonth(e.target.value)} />
              </div>
              {categories.map(cat => {
                const b = budgets[cat.id] || { monthly: '', daily: '' }
                return (
                  <div key={cat.id} style={{ marginBottom: 16, padding: 16, background: cat.color + '15', borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span className="material-icons-round" style={{ fontSize: 16, color: cat.color }}>{cat.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{cat.name}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="form-label">งบรายเดือน (฿)</label>
                        <input type="number" className="form-input" min="0" placeholder="0"
                          value={b.monthly} onChange={e => setBudgets(prev => ({ ...prev, [cat.id]: { ...prev[cat.id], monthly: e.target.value } }))} />
                      </div>
                      <div>
                        <label className="form-label">งบรายวัน (฿)</label>
                        <input type="number" className="form-input" min="0" placeholder="0"
                          value={b.daily} onChange={e => setBudgets(prev => ({ ...prev, [cat.id]: { ...prev[cat.id], daily: e.target.value } }))} />
                      </div>
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={saveBudget} disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกงบประมาณ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const PER_PAGE = 20

  const [monthFilter, setMonthFilter] = useState(todayMonth())
  const [catFilter, setCatFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    categoryApi.getAll().then((r) => {
      const res = r as CategoriesResponse
      setCategories(res.categories || [])
    }).catch(() => {})
  }, [])

  const loadHistory = useCallback(async (p: number, mf: string, cf: string, s: string) => {
    setLoading(true)
    try {
      const res = await expenseDraftApi.getHistory({
        monthYear: monthInputToApi(mf), catKey: cf, search: s, page: p, perPage: PER_PAGE,
      }) as ExpenseHistoryResponse
      setExpenses(res.expenses || [])
      setTotal(res.total || 0)
      setTotalPages(res.totalPages || 1)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadHistory(page, monthFilter, catFilter, search) }, [page, monthFilter, catFilter, search, loadHistory])

  function handleSearch() { setPage(1); setSearch(searchInput) }

  async function printRecord(e: ExpenseRecord) {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a5' })
    doc.setFont('helvetica')
    const cx = 74
    doc.setFillColor(37, 99, 235)
    doc.rect(0, 0, 148, 22, 'F')
    doc.setFontSize(14); doc.setTextColor(255, 255, 255)
    doc.text('PlaNeat', cx, 10, { align: 'center' })
    doc.setFontSize(9)
    doc.text('ใบบันทึกค่าใช้จ่าย', cx, 17, { align: 'center' })
    doc.setTextColor(30, 41, 59)
    let y = 30
    doc.setFontSize(11); doc.setFont('helvetica', 'bold')
    doc.text(e.category, 14, y); y += 8
    const rows: [string, string][] = [
      ['วันที่:', e.date], ['รายละเอียด:', e.detail || '—'],
      ['ยอดเงิน:', `฿${e.amount.toLocaleString('th-TH')}`], ['หมายเหตุ:', e.note || '—'],
    ]
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const [k, v] of rows) {
      doc.setFont('helvetica', 'bold'); doc.text(k, 14, y)
      doc.setFont('helvetica', 'normal'); doc.text(v, 50, y); y += 7
    }
    y += 4; doc.setDrawColor(226, 232, 240); doc.line(14, y, 134, y); y += 7
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text('ผู้บันทึก:', 14, y); doc.setFont('helvetica', 'normal')
    doc.text(e.recorderName || e.recorder, 50, y)
    y += 9
    if (e.approverName) {
      doc.setFont('helvetica', 'bold'); doc.text('อนุมัติโดย:', 14, y)
      doc.setFont('helvetica', 'normal'); doc.text(e.approverName, 50, y)
    }
    doc.setFontSize(7); doc.setTextColor(148, 163, 184)
    doc.text(`พิมพ์เมื่อ: ${new Date().toLocaleString('th-TH')} · PlaNeat System`, cx, 185, { align: 'center' })
    doc.save(`expense-${e.id.slice(0, 8)}.pdf`)
  }

  async function printAll() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFont('helvetica'); doc.setFontSize(14)
    doc.text('ประวัติค่าใช้จ่าย — PlaNeat', 14, 16)
    doc.setFontSize(10)
    doc.text(`เดือน: ${monthInputToApi(monthFilter)}  ค้นหา: ${search || '-'}`, 14, 24)
    doc.text(`พิมพ์เมื่อ: ${new Date().toLocaleDateString('th-TH')} · รวม ${total} รายการ`, 14, 30)
    autoTable(doc, {
      startY: 36,
      head: [['วันที่', 'หมวด', 'รายละเอียด', 'ยอด (฿)', 'ผู้บันทึก', 'อนุมัติโดย']],
      body: expenses.map(e => [e.date, e.category, e.detail || '—', e.amount.toLocaleString('th-TH'), e.recorderName || e.recorder, e.approverName || '—']),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [37, 99, 235] },
    })
    doc.save(`planeat-history-${monthFilter}.pdf`)
  }

  const pageNums = () => {
    const nums: number[] = []
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) nums.push(i)
    return nums
  }

  const getCatLabel = (e: ExpenseRecord) => {
    const cs = CAT_STYLE[e.catKey as CatKey]
    if (cs) return cs.label
    const dynCat = categories.find(c => c.id === e.catKey)
    return dynCat?.name || e.category
  }

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="form-label">เดือน</label>
            <input type="month" className="form-input" style={{ padding: '7px 10px' }} value={monthFilter}
              onChange={e => { setMonthFilter(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="form-label">หมวด</label>
            <select className="form-input" style={{ padding: '7px 10px' }} value={catFilter}
              onChange={e => { setCatFilter(e.target.value); setPage(1) }}>
              <option value="all">ทุกหมวด</option>
              {CAT_KEYS_LEGACY.map(k => <option key={k} value={k}>{CAT_STYLE[k].label}</option>)}
              {categories.filter(c => !['labor','raw','chem','repair'].includes(c.id)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="form-label">ค้นหา</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" className="form-input" style={{ flex: 1, padding: '7px 10px' }}
                placeholder="ชื่อผู้บันทึก, รายละเอียด..."
                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button className="btn-primary" style={{ padding: '7px 14px', fontSize: 13 }} onClick={handleSearch}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>search</span>
              </button>
            </div>
          </div>
          <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: 12 }} onClick={printAll}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>picture_as_pdf</span>
            พิมพ์รายการ
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94a3b8' }}>พบ {total.toLocaleString('th-TH')} รายการ</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center"><span className="material-icons-round spin text-blue-400" style={{ fontSize: 36 }}>refresh</span></div>
        ) : expenses.length === 0 ? (
          <div className="py-16 text-center">
            <span className="material-icons-round text-slate-300" style={{ fontSize: 48 }}>inbox</span>
            <p className="text-slate-400 mt-2 text-sm">ไม่พบรายการ</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['วันที่','หมวด','รายละเอียด','ยอด (฿)','ผู้บันทึก','LINE ผู้บันทึก','อนุมัติโดย',''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => {
                  const cs = CAT_STYLE[e.catKey as CatKey]
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50 transition-colors">
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: 12 }}>{e.date}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: cs?.bg || '#f1f5f9', color: cs?.color || '#64748b', whiteSpace: 'nowrap' }}>
                          {getCatLabel(e)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569', maxWidth: 200 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.detail}>{e.detail || '—'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e293b', textAlign: 'right', whiteSpace: 'nowrap' }}>{e.amount.toLocaleString('th-TH')}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{e.recorderName || e.recorder}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11 }}>
                        {e.recorderLineId ? <span style={{ color: '#0891b2', fontWeight: 500 }}>{e.recorderLineId}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{e.approverName || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => printRecord(e)} title="พิมพ์รายการนี้"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6 }}
                          onMouseEnter={ev => (ev.currentTarget.style.color = '#2563eb')}
                          onMouseLeave={ev => (ev.currentTarget.style.color = '#94a3b8')}>
                          <span className="material-icons-round" style={{ fontSize: 18 }}>print</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                  <td colSpan={3} style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>หน้านี้ {expenses.length} รายการ / ทั้งหมด {total.toLocaleString('th-TH')} รายการ</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>
                    {expenses.reduce((s, e) => s + e.amount, 0).toLocaleString('th-TH')}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#cbd5e1' : '#475569' }}>«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#cbd5e1' : '#475569' }}>‹</button>
            {pageNums().map(n => (
              <button key={n} onClick={() => setPage(n)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${n === page ? '#2563eb' : '#e2e8f0'}`, background: n === page ? '#2563eb' : 'white', fontSize: 12, fontWeight: n === page ? 700 : 400, color: n === page ? 'white' : '#475569', cursor: 'pointer' }}>{n}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#cbd5e1' : '#475569' }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#cbd5e1' : '#475569' }}>»</button>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>หน้า {page}/{totalPages}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Category Manager Tab ─────────────────────────────────────────────────────
type CalcRole = 'qty' | 'price' | 'addend' | 'fixed' | 'note' | 'none'
type FieldType = 'number' | 'text' | 'select'

interface FieldDraft {
  fieldId: string; label: string; type: FieldType; unit: string
  placeholder: string; required: boolean; calcRole: CalcRole; options: string[]
}

const CALC_ROLES: CalcRole[] = ['qty', 'price', 'addend', 'fixed', 'note', 'none']
const ROLE_LABELS_CALC: Record<CalcRole, string> = {
  qty: 'จำนวน (qty)', price: 'ราคา (price)', addend: 'บวกเพิ่ม (addend)',
  fixed: 'ยอดรวม (fixed)', note: 'หมายเหตุ', none: 'ไม่ใช้คำนวณ',
}
const FORMULAS = ['qty*price', 'qty*price+addend', 'fixed', 'qty+price']

function CategoryManagerTab({ flash, onCatChange }: { flash: (t: 'ok'|'err', m: string) => void; onCatChange: () => void }) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseCategory | null>(null)
  const [deleteSummary, setDeleteSummary] = useState<CategorySummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [icon, setIcon] = useState('receipt_long')
  const [formula, setFormula] = useState('fixed')
  const [order, setOrder] = useState(999)
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [allowedUsers, setAllowedUsers] = useState<string[]>([])

  // User search state
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<{ username: string; name: string; role: string }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  const loadCats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await categoryApi.getAll() as CategoriesResponse
      setCategories(res.categories || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadCats() }, [loadCats])

  async function searchUsers(q: string) {
    setUserSearch(q)
    if (!q.trim()) { setUserResults([]); return }
    setSearchingUsers(true)
    try {
      const res = await categoryApi.searchUsers(q) as { users: { username: string; name: string; role: string }[] }
      setUserResults(res.users || [])
    } catch {} finally { setSearchingUsers(false) }
  }

  function addAllowedUser(username: string) {
    if (!allowedUsers.includes(username)) setAllowedUsers(prev => [...prev, username])
    setUserSearch(''); setUserResults([])
  }

  function openCreate() {
    setEditingId(null)
    setName(''); setColor('#3b82f6'); setIcon('receipt_long'); setFormula('fixed'); setOrder(999)
    setFields([{ fieldId: 'totalCost', label: 'ยอดเงิน', type: 'number', unit: '฿', placeholder: '0', required: true, calcRole: 'fixed', options: [] }])
    setAllowedUsers([])
    setUserSearch(''); setUserResults([])
    setShowModal(true)
  }

  function openEdit(cat: ExpenseCategory) {
    setEditingId(cat.id)
    setName(cat.name); setColor(cat.color); setIcon(cat.icon); setFormula(cat.formula); setOrder(cat.order)
    setFields(cat.fields.map(f => ({ ...f })))
    setAllowedUsers([...(cat.allowedUsers || [])])
    setUserSearch(''); setUserResults([])
    setShowModal(true)
  }

  async function openDelete(cat: ExpenseCategory) {
    setDeleteTarget(cat)
    setDeleteSummary(null)
    try {
      const summary = await categoryApi.getSummary(cat.id) as CategorySummary
      setDeleteSummary(summary)
    } catch {}
  }

  function addField() {
    setFields(prev => [...prev, {
      fieldId: `field_${Date.now()}`, label: 'ฟิลด์ใหม่', type: 'number', unit: '', placeholder: '', required: false, calcRole: 'none', options: []
    }])
  }

  function removeField(idx: number) { setFields(prev => prev.filter((_, i) => i !== idx)) }

  function updateField(idx: number, key: keyof FieldDraft, val: string | boolean) {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f))
  }

  async function saveCategory() {
    if (!name.trim()) { flash('err', 'กรุณาระส่ชื่อหมวด'); return }
    setSaving(true)
    try {
      const payload = { name, color, icon, formula, order, fields, allowedRoles: [], allowedUsers }
      if (editingId) {
        await categoryApi.update(editingId, payload)
        flash('ok', 'อัปเดตหมวดสำเร็จ')
      } else {
        await categoryApi.create(payload)
        flash('ok', 'สร้างหมวดใหม่สำเร็จ')
      }
      setShowModal(false)
      loadCats()
      onCatChange()
    } catch (e: unknown) { flash('err', (e as Error).message || 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await categoryApi.delete(deleteTarget.id)
      flash('ok', `ลบหมวด "${deleteTarget.name}" สำเร็จ`)
      setDeleteTarget(null)
      loadCats()
      onCatChange()
    } catch (e: unknown) { flash('err', (e as Error).message || 'เกิดข้อผิดพลาด') }
    finally { setDeleting(false) }
  }

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex items-center justify-between">
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{categories.length} หมวดในระบบ</p>
        <button className="btn-primary" style={{ fontSize: 13 }} onClick={openCreate}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>add</span>
          สร้างหมวดใหม่
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons-round spin text-blue-400" style={{ fontSize: 36 }}>refresh</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {categories.map(cat => (
            <div key={cat.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: cat.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-icons-round" style={{ fontSize: 20, color: cat.color }}>{cat.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{cat.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>{cat.formula}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{cat.fields.length} ฟิลด์</span>
                    {(cat.allowedUsers?.length || 0) > 0 ? (
                      <span style={{ fontSize: 11, color: '#7c3aed', background: '#ede9fe', padding: '2px 8px', borderRadius: 10 }}>
                        จำกัดสิทธิ์: {cat.allowedUsers!.length} คน
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 10 }}>ทุกคนเข้าถึงได้</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(cat)}
                    style={{ padding: '6px 14px', borderRadius: 8, background: '#eff6ff', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons-round" style={{ fontSize: 14 }}>edit</span>แก้ไข
                  </button>
                  <button onClick={() => openDelete(cat)}
                    style={{ padding: '6px 14px', borderRadius: 8, background: '#fef2f2', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons-round" style={{ fontSize: 14 }}>delete</span>ลบ
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 40, overflowY: 'auto' }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '100%', maxWidth: 680 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                {editingId ? 'แก้ไขหมวด' : 'สร้างหมวดใหม่'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                <span className="material-icons-round" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div style={{ padding: 24 }}>
              {/* Basic Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">ชื่อหมวด <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" className="form-input" placeholder="เช่น ค่าไฟฟ้า" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">สี</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={color} onChange={e => setColor(e.target.value)}
                      style={{ width: 40, height: 36, border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                    <input type="text" className="form-input" value={color} onChange={e => setColor(e.target.value)} style={{ flex: 1 }} />
                  </div>
                </div>
                <div>
                  <label className="form-label">ไอคอน (Material Icons)</label>
                  <input type="text" className="form-input" placeholder="receipt_long" value={icon} onChange={e => setIcon(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">สูตรคำนวณ</label>
                  <select className="form-input" value={formula} onChange={e => setFormula(e.target.value)}>
                    {FORMULAS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">ลำดับแสดง</label>
                  <input type="number" className="form-input" min="1" value={order} onChange={e => setOrder(parseInt(e.target.value) || 999)} />
                </div>
              </div>

              {/* Permission */}
              <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 12 }}>
                <label className="form-label" style={{ marginBottom: 10, display: 'block' }}>
                  สิทธิ์การใช้งาน
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(ไม่เลือกผู้ใช้ = ทุกคนเข้าถึงได้)</span>
                </label>
                {/* Selected users chips */}
                {allowedUsers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {allowedUsers.map(u => (
                      <span key={u} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>
                        <span className="material-icons-round" style={{ fontSize: 14 }}>person</span>
                        {u}
                        <button onClick={() => setAllowedUsers(prev => prev.filter(x => x !== u))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: '0 0 0 2px', lineHeight: 1, fontSize: 16 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Search box */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px' }}>
                    <span className="material-icons-round" style={{ fontSize: 16, color: '#94a3b8' }}>{searchingUsers ? 'hourglass_empty' : 'search'}</span>
                    <input type="text" placeholder="ค้นหาชื่อหรือ username..." value={userSearch}
                      onChange={e => searchUsers(e.target.value)}
                      style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, background: 'transparent' }} />
                    {userSearch && (
                      <button onClick={() => { setUserSearch(''); setUserResults([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                  {userResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px #0002', zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                      {userResults.map(u => (
                        <button key={u.username} onClick={() => addAllowedUser(u.username)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-icons-round" style={{ fontSize: 16, color: '#7c3aed' }}>person</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{u.name?.trim() || u.username}</p>
                            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>@{u.username} · {u.role}</p>
                          </div>
                          {allowedUsers.includes(u.username) && (
                            <span className="material-icons-round" style={{ fontSize: 16, color: '#7c3aed' }}>check_circle</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Field Builder */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <label className="form-label" style={{ margin: 0 }}>ฟิลด์กรอกข้อมูล</label>
                  <button onClick={addField} style={{ padding: '5px 12px', borderRadius: 8, background: '#eff6ff', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons-round" style={{ fontSize: 14 }}>add</span>เพิ่มฟิลด์
                  </button>
                </div>
                {fields.map((f, idx) => (
                  <div key={idx} style={{ marginBottom: 10, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                      <div>
                        <label className="form-label">ชื่อฟิลด์ (ID)</label>
                        <input type="text" className="form-input" style={{ fontSize: 11 }} value={f.fieldId} onChange={e => updateField(idx, 'fieldId', e.target.value)} />
                      </div>
                      <div>
                        <label className="form-label">Label</label>
                        <input type="text" className="form-input" style={{ fontSize: 11 }} value={f.label} onChange={e => updateField(idx, 'label', e.target.value)} />
                      </div>
                      <div>
                        <label className="form-label">ประเภท</label>
                        <select className="form-input" style={{ fontSize: 11 }} value={f.type} onChange={e => updateField(idx, 'type', e.target.value)}>
                          <option value="number">number</option>
                          <option value="text">text</option>
                          <option value="select">select</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label">หน่วย</label>
                        <input type="text" className="form-input" style={{ fontSize: 11 }} placeholder="฿, กก., ..." value={f.unit} onChange={e => updateField(idx, 'unit', e.target.value)} />
                      </div>
                      <div>
                        <label className="form-label">บทบาทคำนวณ</label>
                        <select className="form-input" style={{ fontSize: 11 }} value={f.calcRole} onChange={e => updateField(idx, 'calcRole', e.target.value as CalcRole)}>
                          {CALC_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS_CALC[r]}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 2 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                          <input type="checkbox" checked={f.required} onChange={e => updateField(idx, 'required', e.target.checked)} />
                          บังคับ
                        </label>
                        {fields.length > 1 && (
                          <button onClick={() => removeField(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}>
                            <span className="material-icons-round" style={{ fontSize: 18 }}>delete_outline</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={saveCategory} disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : (editingId ? 'บันทึกการแก้ไข' : 'สร้างหมวด')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #fecaca', background: '#fef2f2', borderRadius: '16px 16px 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-icons-round" style={{ fontSize: 24, color: '#dc2626' }}>warning</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#991b1b' }}>ยืนยันการลบหมวด</h3>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: '#374151' }}>
                คุณกำลังจะลบหมวด <strong>"{deleteTarget.name}"</strong> การลบนี้จะลบข้อมูลที่เกี่ยวข้องทั้งหมดด้วย:
              </p>
              {deleteSummary ? (
                <div style={{ background: '#fef2f2', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{deleteSummary.drafts}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>รายการรอ</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{deleteSummary.records}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>ประวัติ</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{deleteSummary.budgets}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>งบประมาณ</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: 20 }}>
                  <span className="material-icons-round spin text-slate-400" style={{ fontSize: 24 }}>refresh</span>
                </div>
              )}
              <p style={{ margin: '0 0 20px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>⚠ การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>ยกเลิก</button>
                <button onClick={confirmDelete} disabled={deleting}
                  style={{ padding: '8px 20px', borderRadius: 10, background: '#dc2626', color: 'white', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-icons-round" style={{ fontSize: 16 }}>delete_forever</span>
                  {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
