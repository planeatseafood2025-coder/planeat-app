'use client'
import React from 'react'
import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { expenseDraftApi, categoryApi, dynamicDraftApi, budgetApi, analysisApi, expenseApi, notificationApi, settingsApi, reportApi } from '@/lib/api'
import { invalidateCache } from '@/lib/cache'
import { fmt, todayIso, isoToThai, todayMonth, monthInputToApi } from '@/lib/utils'
import type {
  ExpenseDraft, ExpenseRecord, DraftsResponse, ExpenseHistoryResponse,
  ExpenseCategory, CategoriesResponse, CategorySummary,
  BudgetResponse, CatKey,
  AnalysisResponse, ExpensesResponse, Expense,
} from '@/types'
import { CAT_STYLE, ROLE_LABELS } from '@/types'

const DoughnutChart = dynamic(() => import('@/components/charts/DoughnutChart'), { ssr: false })
const TrendChart    = dynamic(() => import('@/components/charts/TrendChart'),    { ssr: false })

type Tab = 'overview' | 'daily' | 'pending' | 'budget' | 'history' | 'categories' | 'executive'

const MANAGER_ROLES = ['accounting_manager', 'super_admin', 'it_manager', 'admin']

export default function ExpenseControlPage() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'overview'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [catVersion, setCatVersion] = useState(0)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [user, setUser] = useState<ReturnType<typeof getSession>>(null)
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    const u = getSession()
    setUser(u)
    setIsManager(MANAGER_ROLES.includes(u?.role || ''))
  }, [])

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const tabBtn = (t: Tab, label: string, icon: string) => (
    <button key={t} onClick={() => { setTab(t); setShowSettingsMenu(false) }} style={{
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

  const MANAGER_TABS: { t: Tab; label: string; icon: string }[] = [
    { t: 'budget',     label: 'งบประมาณ',    icon: 'savings' },
    { t: 'categories', label: 'จัดการหมวด',  icon: 'category' },
    { t: 'executive',  label: 'บริหารงบปี',   icon: 'leaderboard' },
  ]
  const activeManagerTab = MANAGER_TABS.find(m => m.t === tab)

  return (
    <div className="page-section active">
      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.type === 'ok' ? '#166534' : '#991b1b', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>{msg.type === 'ok' ? 'check_circle' : 'error'}</span>
          {msg.text}
        </div>
      )}

      {/* Header / Tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-5" style={{ borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* ชื่อระบบ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRight: '1px solid #f1f5f9', flexShrink: 0 }}>
            <span className="material-icons-round text-blue-500" style={{ fontSize: 20 }}>account_balance</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>ระบบควบคุมค่าใช้จ่าย</span>
          </div>

          {/* แท็บหลัก */}
          <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', flex: 1 }}>
            {tabBtn('overview', 'ภาพรวม',       'bar_chart')}
            {tabBtn('daily',    'บันทึกรายวัน',  'edit_note')}
            {tabBtn('pending',  'รอดำเนินการ',   'pending_actions')}
            {tabBtn('history',  'ประวัติ',        'history')}
          </div>

          {/* ปุ่ม ⚙️ ตั้งค่า (Manager only) — อยู่นอก overflow container */}
          {isManager && (
            <div style={{ position: 'relative', flexShrink: 0, paddingRight: 8 }}>
              <button
                onClick={() => setShowSettingsMenu(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: activeManagerTab ? '#eff6ff' : '#f8fafc',
                  color: activeManagerTab ? '#2563eb' : '#64748b',
                  transition: 'all 0.15s',
                }}>
                <span className="material-icons-round" style={{ fontSize: 15 }}>settings</span>
                {activeManagerTab ? activeManagerTab.label : 'ตั้งค่า'}
                <span className="material-icons-round" style={{ fontSize: 14 }}>{showSettingsMenu ? 'expand_less' : 'expand_more'}</span>
              </button>

              {showSettingsMenu && (
                <div style={{ position: 'absolute', right: 8, top: 'calc(100% + 4px)', background: 'white', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', zIndex: 200, minWidth: 160, overflow: 'hidden' }}>
                  {MANAGER_TABS.map(m => (
                    <button key={m.t}
                      onClick={() => { setTab(m.t); setShowSettingsMenu(false) }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                        background: tab === m.t ? '#eff6ff' : 'white',
                        color: tab === m.t ? '#2563eb' : '#374151',
                        fontWeight: tab === m.t ? 600 : 400,
                        textAlign: 'left',
                      }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {tab === 'overview'    && <OverviewTab user={user} onGoToCategories={() => setTab('categories')} onGoToExecutive={() => setTab('executive')} />}
      {tab === 'daily'       && <DailyTab user={user} flash={flash} catVersion={catVersion} />}
      {tab === 'pending'     && <PendingTab user={user} flash={flash} />}
      {tab === 'budget'      && <BudgetTab user={user} flash={flash} />}
      {tab === 'history'     && <HistoryTab />}
      {tab === 'categories'  && isManager && <CategoryManagerTab flash={flash} onCatChange={() => setCatVersion(v => v + 1)} />}
      {tab === 'executive'   && isManager && <ExecutiveTab />}
    </div>
  )
}

// ─── Overview Tab (Full Analytics) ───────────────────────────────────────────
function OverviewTab({ user, onGoToCategories, onGoToExecutive }: {
  user: ReturnType<typeof getSession>
  onGoToCategories: () => void
  onGoToExecutive: () => void
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
  const [catSearch, setCatSearch] = useState('')

  const load = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const mY = monthInputToApi(m)
      const [aRes, eRes, cRes] = await Promise.all([
        dynamicDraftApi.getAnalysis(mY) as Promise<AnalysisResponse>,
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

          {/* Category chips + search + manage button */}
          <div className="mb-5">
            {/* Search box — แสดงเมื่อมีหมวดมากกว่า 5 */}
            {cats.length > 5 && (
              <div className="flex items-center gap-2 mb-3" style={{ maxWidth: 280 }}>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex-1" style={{ boxShadow: '0 1px 3px #0001' }}>
                  <span className="material-icons-round text-slate-400" style={{ fontSize: 15 }}>search</span>
                  <input
                    type="text"
                    placeholder="ค้นหาหมวด..."
                    value={catSearch}
                    onChange={e => setCatSearch(e.target.value)}
                    style={{ border: 'none', outline: 'none', fontSize: 12, background: 'transparent', flex: 1, color: '#1e293b' }}
                  />
                  {catSearch && (
                    <button onClick={() => setCatSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', lineHeight: 1, fontSize: 16, padding: 0 }}>×</button>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              {cats.filter(c => !catSearch || c.label.toLowerCase().includes(catSearch.toLowerCase())).map(c => (
                <button key={c.catKey}
                  onClick={() => { setCatFilter(catFilter === c.catKey ? 'all' : c.catKey); setDayFilter(null); setCatSearch('') }}
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
              {catSearch && cats.filter(c => c.label.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>ไม่พบหมวด "{catSearch}"</span>
              )}
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
                        <p className="text-xs text-slate-400">{e.date} · {e.recorderName || e.recorder}</p>
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
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{e.recorderName || e.recorder || '—'}</td>
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

          {/* ── Executive shortcut ─────────────────────────────────────── */}
          {isManager && (
            <button onClick={onGoToExecutive}
              style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff',
                cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563eb' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-icons-round" style={{ fontSize: 20, color: '#2563eb' }}>leaderboard</span>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>ดูภาพรวมการบริหารงบประมาณทั้งปี</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Budget vs Actual รายเดือน · สำหรับผู้บริหาร</p>
                </div>
              </div>
              <span className="material-icons-round" style={{ fontSize: 18, color: '#94a3b8' }}>arrow_forward</span>
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── Daily Tab (Dynamic) ─────────────────────────────────────────────────────
type BudgetEntry = { spentToday: number; spentMonth: number; monthlyBudget: number; dailyRate: number }

function DailyTab({ user, flash, catVersion }: { user: ReturnType<typeof getSession>; flash: (t: 'ok'|'err', m: string) => void; catVersion: number }) {
  const [date, setDate] = useState(todayIso())
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [panels, setPanels] = useState<Record<string, { open: boolean; items: Record<string, string>[] }>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [loadingCats, setLoadingCats] = useState(true)
  const [budgetMap, setBudgetMap] = useState<Record<string, BudgetEntry>>({})

  useEffect(() => {
    setLoadingCats(true)
    Promise.all([
      categoryApi.getMine(),
      budgetApi.getBudget(monthInputToApi(todayMonth())),
    ]).then(([catRes, budgetRes]) => {
      const r = catRes as CategoriesResponse
      setCategories(r.categories || [])
      const init: Record<string, { open: boolean; items: Record<string, string>[] }> = {}
      ;(r.categories || []).forEach(cat => { init[cat.id] = { open: false, items: [] } })
      setPanels(init)
      const bd = (budgetRes as BudgetResponse)?.data as unknown as Record<string, BudgetEntry> | undefined
      if (bd) setBudgetMap(bd)
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
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>info</span>
            รายการจะถูกส่งให้ผู้จัดการฝ่ายบัญชีตรวจสอบก่อนบันทึกจริง
          </div>
          <button onClick={() => {
            setLoadingCats(true)
            categoryApi.getMine().then((res) => {
              const r = res as CategoriesResponse
              setCategories(r.categories || [])
              const init: Record<string, { open: boolean; items: Record<string, string>[] }> = {}
              ;(r.categories || []).forEach(cat => { init[cat.id] = { open: false, items: [] } })
              setPanels(init)
            }).catch(() => {}).finally(() => setLoadingCats(false))
          }} style={{ padding: '8px 12px', borderRadius: 10, background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, flexShrink: 0 }}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>refresh</span>
            รีเฟรช
          </button>
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
          const budgetEntry = budgetMap[cat.id]
          const draftTotal = panel.items.reduce((sum, item) => sum + calcPreview(cat, item), 0)
          const previewSpentMonth = (budgetEntry?.spentMonth || 0) + draftTotal
          const previewRemain = (budgetEntry?.monthlyBudget || 0) - previewSpentMonth
          const budgetPct = budgetEntry?.monthlyBudget > 0 ? previewSpentMonth / budgetEntry.monthlyBudget * 100 : 0
          const remainColor = previewRemain < 0 ? '#dc2626' : budgetPct >= 80 ? '#d97706' : '#16a34a'
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {budgetEntry?.monthlyBudget > 0 && (
                    <span style={{ fontSize: 11, color: remainColor, fontWeight: 700 }}>
                      งบคงเหลือ/เดือน {fmt(previewRemain)}
                    </span>
                  )}
                  <span className="material-icons-round text-slate-400" style={{ fontSize: 20 }}>{panel.open ? 'expand_less' : 'expand_more'}</span>
                </div>
              </button>

              {/* Budget summary chips — แสดงเมื่อ panel เปิด */}
              {panel.open && budgetEntry && (
                <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', flexWrap: 'wrap' }}>
                  <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>ใช้วันนี้ </span>
                    <span style={{ fontWeight: 700, color: '#0369a1' }}>{fmt(budgetEntry.spentToday)}</span>
                  </div>
                  <div style={{ background: draftTotal > 0 ? '#fef3c7' : '#f8fafc', borderRadius: 8, padding: '6px 12px', fontSize: 12, transition: 'background 0.2s' }}>
                    <span style={{ color: '#64748b' }}>ใช้เดือนนี้ </span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(previewSpentMonth)}</span>
                    {draftTotal > 0 && (
                      <span style={{ color: '#d97706', fontSize: 10 }}> (รวมร่าง +{fmt(draftTotal)})</span>
                    )}
                  </div>
                  <div style={{ background: previewRemain < 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 8, padding: '6px 12px', fontSize: 12, transition: 'background 0.2s' }}>
                    <span style={{ color: '#64748b' }}>คงเหลือ/เดือน </span>
                    <span style={{ fontWeight: 700, color: remainColor }}>{fmt(previewRemain)}</span>
                  </div>
                  {/* DEBUG: remove after fix */}
                  <div style={{ fontSize: 10, color: '#94a3b8', alignSelf: 'center' }}>
                    draft={fmt(draftTotal)} items={panel.items.length}
                  </div>
                </div>
              )}

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
  const [catMap, setCatMap] = useState<Record<string, { icon: string; color: string }>>({})

  useEffect(() => {
    categoryApi.getMine().then((r: any) => {
      const map: Record<string, { icon: string; color: string }> = {}
      ;(r.categories || []).forEach((c: ExpenseCategory) => { map[c.id] = { icon: c.icon || 'receipt_long', color: c.color || '#64748b' } })
      setCatMap(map)
    }).catch(() => {})
  }, [])

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
            const dynCat = catMap[d.catKey]
            const legacyCat = CAT_STYLE[d.catKey as CatKey]
            const cs = dynCat
              ? { bg: dynCat.color + '20', color: dynCat.color, icon: dynCat.icon, label: d.category }
              : legacyCat || { bg: '#f1f5f9', color: '#64748b', icon: 'receipt_long', label: d.category }
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
        const e = (budgetRes.data as unknown as Record<string, typeof budgetRes.data.labor>)?.[cat.id]
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
    const entry = data?.data ? (data.data as unknown as Record<string, { label?: string; color?: string; icon?: string; monthlyBudget?: number; dailyRate?: number; spentToday?: number; spentMonth?: number; remainDay?: number; remainMonth?: number; currentDay?: number }>)[catId] : undefined
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
            const entry = data?.data ? (data.data as unknown as Record<string, { monthlyBudget: number; dailyRate: number; spentToday: number; spentMonth: number; remainDay: number; remainMonth: number; currentDay: number }>)[catId] : undefined
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
                          value={b.monthly} onChange={e => {
                            const monthly = parseFloat(e.target.value) || 0
                            const [yr, mo] = modalMonth.split('-').map(Number)
                            const daysInMonth = new Date(yr, mo, 0).getDate()
                            const autoDaily = monthly > 0 ? String(Math.round(monthly / daysInMonth * 100) / 100) : ''
                            setBudgets(prev => ({ ...prev, [cat.id]: { monthly: e.target.value, daily: autoDaily } }))
                          }} />
                      </div>
                      <div>
                        <label className="form-label">งบรายวัน (฿) <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>คำนวณอัตโนมัติ</span></label>
                        <input type="number" className="form-input" min="0" placeholder="คำนวณอัตโนมัติ"
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
  const user = getSession()
  const isManager = MANAGER_ROLES.includes(user?.role || '')
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

  // Edit modal
  const [editTarget, setEditTarget] = useState<ExpenseRecord | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDetail, setEditDetail] = useState('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Select mode
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deletingBulk, setDeletingBulk] = useState(false)

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleSelectAll() {
    if (selected.size === expenses.length) setSelected(new Set())
    else setSelected(new Set(expenses.map(e => e.id)))
  }
  function exitSelectMode() { setSelectMode(false); setSelected(new Set()) }

  async function deleteBulk() {
    if (!selected.size) return
    if (!confirm(`ลบ ${selected.size} รายการที่เลือก?`)) return
    setDeletingBulk(true)
    try {
      await Promise.all([...selected].map(id => expenseApi.deleteExpense(id)))
      exitSelectMode()
      loadHistory(page, monthFilter, catFilter, search)
    } catch {} finally { setDeletingBulk(false) }
  }

  function exportCSV() {
    const rows = selectMode && selected.size > 0
      ? expenses.filter(e => selected.has(e.id))
      : expenses
    const header = 'วันที่,หมวด,รายละเอียด,หมายเหตุ,ยอด,ผู้บันทึก,อนุมัติโดย'
    const lines = rows.map(e =>
      [e.date, getCatLabel(e), e.detail || '', e.note || '', e.amount, e.recorderName || e.recorder, e.approverName || '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = '\uFEFF' + header + '\n' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `expense_${monthFilter}.csv`; a.click()
    URL.revokeObjectURL(url)
  }


  function isWithin3Days(e: ExpenseRecord): boolean {
    const raw = e.createdAt || e.approvedAt
    if (!raw) return true
    const d = new Date(raw)
    return (Date.now() - d.getTime()) <= 3 * 24 * 60 * 60 * 1000
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await expenseApi.deleteExpense(deleteTarget.id) as { success: boolean }
      if (res.success) {
        setDeleteTarget(null)
        loadHistory(page, monthFilter, catFilter, search)
      }
    } catch {} finally { setDeleting(false) }
  }

  function openEdit(e: ExpenseRecord) {
    setEditTarget(e)
    setEditDate(e.date.split('/').reverse().join('-'))
    setEditAmount(String(e.amount))
    setEditDetail(e.detail || '')
    setEditNote(e.note || '')
  }

  async function saveEdit() {
    if (!editTarget) return
    setSaving(true)
    try {
      const res = await expenseApi.editExpense(editTarget.id, {
        date: editDate ? editDate.split('-').reverse().join('/') : undefined,
        amount: parseFloat(editAmount) || undefined,
        detail: editDetail || undefined,
        note: editNote || undefined,
      }) as { success: boolean; message: string }
      if (res.success) {
        setEditTarget(null)
        loadHistory(page, monthFilter, catFilter, search)
      }
    } catch {} finally { setSaving(false) }
  }

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

  function printRecord(e: ExpenseRecord) {
    const printHtml = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบบันทึกค่าใช้จ่าย</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; background: #fff; color: #1e293b; }
  .header { background: #1e3a8a; color: white; padding: 18px 24px; display:flex; align-items:center; justify-content:space-between; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .header p { font-size: 11px; opacity: 0.75; margin-top:2px; }
  .body { padding: 28px 24px; }
  .title { font-size: 15px; font-weight: 700; color: #1e3a8a; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
  .row { display:flex; margin-bottom: 12px; }
  .label { width: 120px; font-weight: 600; color: #64748b; font-size: 13px; flex-shrink:0; }
  .value { font-size: 13px; color: #1e293b; flex: 1; }
  .amount-row { margin-top: 20px; padding: 16px; background: #eff6ff; border-radius: 8px; display:flex; justify-content:space-between; align-items:center; }
  .amount-label { font-weight: 600; color: #1e3a8a; }
  .amount-value { font-size: 22px; font-weight: 700; color: #1e3a8a; }
  .sig { margin-top: 40px; display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  .sig-box { text-align:center; }
  .sig-line { border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 36px; font-size: 12px; color: #64748b; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align:center; font-size: 11px; color: #94a3b8; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>PlaNeat Support</h1>
    <p>ใบบันทึกค่าใช้จ่าย</p>
  </div>
  <div style="font-size:12px;opacity:0.8">พิมพ์เมื่อ: ${new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
</div>
<div class="body">
  <div class="title">${e.category || '—'}</div>
  <div class="row"><span class="label">วันที่:</span><span class="value">${e.date || '—'}</span></div>
  <div class="row"><span class="label">รายละเอียด:</span><span class="value">${e.detail || '—'}</span></div>
  <div class="row"><span class="label">หมายเหตุ:</span><span class="value">${e.note || '—'}</span></div>
  <div class="row"><span class="label">ผู้บันทึก:</span><span class="value">${e.recorderName || e.recorder || '—'}</span></div>
  ${e.approverName ? `<div class="row"><span class="label">อนุมัติโดย:</span><span class="value">${e.approverName}</span></div>` : ''}
  <div class="amount-row">
    <span class="amount-label">ยอดเงิน</span>
    <span class="amount-value">฿${e.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
  </div>
  <div class="sig">
    <div class="sig-box"><div class="sig-line">ผู้บันทึก</div></div>
    <div class="sig-box"><div class="sig-line">ผู้อนุมัติ</div></div>
  </div>
  <div class="footer">PlaNeat Support System · รหัสรายการ: ${e.id.slice(0, 8).toUpperCase()}</div>
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`
    const win = window.open('', '_blank', 'width=700,height=900')
    if (win) { win.document.write(printHtml); win.document.close() }
  }

  // Print options modal
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printCatKey, setPrintCatKey] = useState('all')
  const [printing, setPrinting] = useState(false)
  // Default date range = current month
  const _todayStr = () => new Date().toISOString().slice(0, 10)
  const _monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
  const [printDateFrom, setPrintDateFrom] = useState(_monthStart)
  const [printDateTo, setPrintDateTo] = useState(_todayStr)
  const [printMode, setPrintMode] = useState<'auto' | 'summary' | 'detail'>('auto')

  async function openPdfReport() {
    if (!printDateFrom || !printDateTo) { alert('กรุณาเลือกช่วงวันที่'); return }
    if (printDateFrom > printDateTo) { alert('วันเริ่มต้นต้องไม่มากกว่าวันสิ้นสุด'); return }
    setPrinting(true)
    try {
      const params = new URLSearchParams({ catKey: printCatKey, dateFrom: printDateFrom, dateTo: printDateTo, mode: printMode })
      let token = ''
      if (typeof window !== 'undefined') {
        try {
          const saved = sessionStorage.getItem('planeat_user')
          if (saved) token = JSON.parse(saved)?.token || ''
        } catch {}
      }
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
      const res = await fetch(`${baseUrl}/api/reports/history-pdf?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { alert('สร้างรายงานล้มเหลว'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setShowPrintModal(false)
    } catch { alert('เกิดข้อผิดพลาด') } finally { setPrinting(false) }
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
          <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => setShowPrintModal(true)}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>picture_as_pdf</span>
            พิมพ์รายงาน
          </button>
          <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: 12 }} onClick={exportCSV}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>download</span>
            Export CSV
          </button>
          <button onClick={() => { setSelectMode(v => !v); setSelected(new Set()) }}
            style={{ padding: '7px 14px', fontSize: 12, borderRadius: 8, border: '1px solid', cursor: 'pointer', fontWeight: 600,
              background: selectMode ? '#1e3a8a' : 'white', color: selectMode ? 'white' : '#475569', borderColor: selectMode ? '#1e3a8a' : '#e2e8f0' }}>
            <span className="material-icons-round" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>
              {selectMode ? 'close' : 'checklist'}
            </span>
            {selectMode ? 'ยกเลิก' : 'เลือก'}
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94a3b8' }}>พบ {total.toLocaleString('th-TH')} รายการ · ยอดรวมหน้านี้ ฿{expenses.reduce((s,e) => s + e.amount, 0).toLocaleString('th-TH')}</p>
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
                  {selectMode && (
                    <th style={{ padding: '10px 12px', width: 36 }}>
                      <input type="checkbox" checked={selected.size === expenses.length && expenses.length > 0}
                        onChange={toggleSelectAll} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                    </th>
                  )}
                  {['วันที่','หมวด','รายละเอียด','ยอด (฿)','ผู้บันทึก','อนุมัติโดย',''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => {
                  const dynCatH = categories.find(c => c.id === e.catKey)
                  const cs = dynCatH
                    ? { bg: dynCatH.color + '20', color: dynCatH.color }
                    : CAT_STYLE[e.catKey as CatKey]
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: selected.has(e.id) ? '#eff6ff' : undefined }} className="hover:bg-slate-50 transition-colors">
                      {selectMode && (
                        <td style={{ padding: '10px 12px', width: 36 }}>
                          <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)}
                            style={{ cursor: 'pointer', width: 15, height: 15 }} />
                        </td>
                      )}
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
                        <div style={{ display: 'flex', gap: 2 }}>
                          {isManager && (() => {
                            const editable = isWithin3Days(e)
                            return (
                              <>
                                <button onClick={() => editable ? openEdit(e) : undefined}
                                  title={editable ? 'แก้ไขรายการ' : 'ไม่สามารถแก้ไขรายการที่เกิน 3 วันได้'}
                                  style={{ background: 'none', border: 'none', cursor: editable ? 'pointer' : 'not-allowed', color: editable ? '#94a3b8' : '#e2e8f0', padding: 4, borderRadius: 6 }}
                                  onMouseEnter={ev => { if (editable) ev.currentTarget.style.color = '#f59e0b' }}
                                  onMouseLeave={ev => { if (editable) ev.currentTarget.style.color = '#94a3b8' }}>
                                  <span className="material-icons-round" style={{ fontSize: 18 }}>edit</span>
                                </button>
                                <button onClick={() => editable ? setDeleteTarget(e) : undefined}
                                  title={editable ? 'ลบรายการ' : 'ไม่สามารถลบรายการที่เกิน 3 วันได้'}
                                  style={{ background: 'none', border: 'none', cursor: editable ? 'pointer' : 'not-allowed', color: editable ? '#94a3b8' : '#e2e8f0', padding: 4, borderRadius: 6 }}
                                  onMouseEnter={ev => { if (editable) ev.currentTarget.style.color = '#ef4444' }}
                                  onMouseLeave={ev => { if (editable) ev.currentTarget.style.color = '#94a3b8' }}>
                                  <span className="material-icons-round" style={{ fontSize: 18 }}>delete</span>
                                </button>
                              </>
                            )
                          })()}
                          <button onClick={() => printRecord(e)} title="พิมพ์รายการนี้"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6 }}
                            onMouseEnter={ev => (ev.currentTarget.style.color = '#2563eb')}
                            onMouseLeave={ev => (ev.currentTarget.style.color = '#94a3b8')}>
                            <span className="material-icons-round" style={{ fontSize: 18 }}>print</span>
                          </button>
                        </div>
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

      {/* ── Edit Modal ─────────────────────────────────────── */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-icons-round" style={{ fontSize: 18, color: '#f59e0b' }}>edit</span>
                แก้ไขรายการ
              </h3>
              <button onClick={() => setEditTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <span className="material-icons-round" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">วันที่</label>
                <input type="date" className="form-input" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">ยอดเงิน (฿)</label>
                <input type="number" className="form-input" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
              </div>
              <div>
                <label className="form-label">รายละเอียด</label>
                <input type="text" className="form-input" value={editDetail} onChange={e => setEditDetail(e.target.value)} />
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <input type="text" className="form-input" value={editNote} onChange={e => setEditNote(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn-secondary" onClick={() => setEditTarget(null)}>ยกเลิก</button>
                <button className="btn-primary" onClick={saveEdit} disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Options Modal ───────────────────────────── */}
      {showPrintModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-icons-round" style={{ fontSize: 18, color: '#2563eb' }}>picture_as_pdf</span>
                ตัวเลือกรายงาน PDF
              </h3>
              <button onClick={() => setShowPrintModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <span className="material-icons-round" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Quick range shortcuts */}
              <div>
                <label className="form-label">ช่วงเวลาด่วน</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {([
                    ['วันนี้', () => { const t = new Date().toISOString().slice(0,10); setPrintDateFrom(t); setPrintDateTo(t) }],
                    ['สัปดาห์นี้', () => { const t = new Date(); const mon = new Date(t); mon.setDate(t.getDate()-t.getDay()+1); setPrintDateFrom(mon.toISOString().slice(0,10)); setPrintDateTo(t.toISOString().slice(0,10)) }],
                    ['เดือนนี้', () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth(), 1); setPrintDateFrom(s.toISOString().slice(0,10)); setPrintDateTo(t.toISOString().slice(0,10)) }],
                    ['เดือนที่แล้ว', () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth()-1, 1); const e = new Date(t.getFullYear(), t.getMonth(), 0); setPrintDateFrom(s.toISOString().slice(0,10)); setPrintDateTo(e.toISOString().slice(0,10)) }],
                    ['ปีนี้', () => { const t = new Date(); setPrintDateFrom(`${t.getFullYear()}-01-01`); setPrintDateTo(t.toISOString().slice(0,10)) }],
                  ] as [string, () => void][]).map(([label, fn]) => (
                    <button key={label} onClick={fn}
                      style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Custom date range */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">ตั้งแต่วันที่</label>
                  <input type="date" className="form-input" style={{ marginTop: 6 }} value={printDateFrom} onChange={e => setPrintDateFrom(e.target.value)} />
                </div>
                <div style={{ paddingBottom: 8, color: '#94a3b8', fontWeight: 600 }}>—</div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">ถึงวันที่</label>
                  <input type="date" className="form-input" style={{ marginTop: 6 }} value={printDateTo} onChange={e => setPrintDateTo(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">หมวดหมู่</label>
                <select className="form-input" style={{ marginTop: 6 }} value={printCatKey} onChange={e => setPrintCatKey(e.target.value)}>
                  <option value="all">ทุกหมวด (รวมทั้งหมด)</option>
                  {CAT_KEYS_LEGACY.map(k => <option key={k} value={k}>{CAT_STYLE[k].label}</option>)}
                  {categories.filter(c => !['labor','raw','chem','repair'].includes(c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">รูปแบบรายงาน</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {([
                    ['auto',    'อัตโนมัติ',   'auto_awesome', '≤50 รายการ = รายละเอียด, >50 = แยกหมวด'],
                    ['summary', 'สรุปเท่านั้น', 'summarize',    'แสดงยอดรวมต่อหมวด (เหมาะรายปี)'],
                    ['detail',  'รายละเอียด',   'format_list_bulleted', 'แสดงทุก transaction'],
                  ] as [string,string,string,string][]).map(([val, label, icon, tip]) => (
                    <button key={val} onClick={() => setPrintMode(val as any)} title={tip}
                      style={{
                        flex: 1, padding: '7px 6px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                        border: printMode === val ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: printMode === val ? '#eff6ff' : 'white',
                        color: printMode === val ? '#1d4ed8' : '#475569',
                        fontWeight: printMode === val ? 700 : 400,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPrintModal(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>ยกเลิก</button>
              <button onClick={openPdfReport} disabled={printing}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontSize: 13, fontWeight: 600, cursor: printing ? 'not-allowed' : 'pointer', opacity: printing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>open_in_new</span>
                {printing ? 'กำลังสร้าง...' : 'เปิดรายงาน PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating action bar */}
      {selectMode && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 49,
          background: '#1e293b', color: 'white', borderRadius: 16, padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {selected.size > 0 ? `เลือกแล้ว ${selected.size} รายการ` : 'เลือกรายการที่ต้องการ'}
          </span>
          {selected.size > 0 && (
            <>
              <span style={{ opacity: 0.3 }}>|</span>
              <button onClick={exportCSV}
                style={{ background: '#2563eb', border: 'none', color: 'white', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons-round" style={{ fontSize: 15 }}>download</span>
                Export CSV
              </button>
              {isManager && (
                <button onClick={deleteBulk} disabled={deletingBulk}
                  style={{ background: '#ef4444', border: 'none', color: 'white', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: deletingBulk ? 0.6 : 1 }}>
                  <span className="material-icons-round" style={{ fontSize: 15 }}>delete</span>
                  {deletingBulk ? 'กำลังลบ...' : 'ลบที่เลือก'}
                </button>
              )}
            </>
          )}
          <button onClick={exitSelectMode}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
            <span className="material-icons-round" style={{ fontSize: 15 }}>close</span>
          </button>
        </div>
      )}

      {/* ── Delete Confirm Modal ───────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons-round" style={{ fontSize: 20, color: '#ef4444' }}>delete_forever</span>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>ยืนยันการลบรายการ</h3>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>คุณต้องการลบรายการนี้ใช่หรือไม่?</p>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#991b1b' }}>
                <strong>{deleteTarget.category}</strong> — {deleteTarget.date}<br />
                ยอด ฿{deleteTarget.amount.toLocaleString('th-TH')} | {deleteTarget.recorderName || deleteTarget.recorder}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: '#ef4444' }}>การลบไม่สามารถกู้คืนได้</p>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>ยกเลิก</button>
              <button onClick={confirmDelete} disabled={deleting}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#ef4444', color: 'white', fontSize: 13, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

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
  qty: 'ตัวคูณ/จำนวน', price: 'ราคาต่อหน่วย', addend: 'บวกเพิ่ม',
  fixed: 'ยอดรวมคงที่', note: 'หมายเหตุ', none: 'ไม่ใช้คำนวณ',
}
const ROLE_ICONS_CALC: Record<CalcRole, string> = {
  qty: 'tag', price: 'sell', addend: 'add_circle_outline',
  fixed: 'attach_money', note: 'notes', none: 'block',
}
const ROLE_COLORS_CALC: Record<CalcRole, string> = {
  qty: '#3b82f6', price: '#10b981', addend: '#f59e0b',
  fixed: '#8b5cf6', note: '#64748b', none: '#cbd5e1',
}
const FORMULAS = ['qty*price', 'qty*price+addend', 'fixed', 'qty+price']
const FORMULA_LABELS: Record<string, string> = {
  'qty*price':        'จำนวน × ราคาต่อหน่วย',
  'qty*price+addend': 'จำนวน × ราคา + ส่วนเพิ่ม',
  'fixed':            'ระบุยอดรวมคงที่',
  'qty+price':        'ยอดที่ 1 + ยอดที่ 2',
}
const FORMULA_HINTS: Record<string, string> = {
  'qty*price':        'เหมาะกับรายการที่มีจำนวนมาก เช่น ซื้อของชิ้นเล็กเยอะๆ ระบบจะคำนวณ จำนวน × ราคาต่อหน่วย ให้อัตโนมัติ',
  'qty*price+addend': 'เหมาะกับค่าแรงรายวัน + ค่าล่วงเวลา OT ระบบจะคำนวณ (จำนวน × ราคา) + ค่าเพิ่มเติม',
  'fixed':            'เหมาะกับค่าน้ำ ค่าไฟ รายเดือน หรือรายการที่รู้ยอดสรุปอยู่แล้ว ระบุยอดรวมได้เลย',
  'qty+price':        'กรณีมีตัวเลขสองส่วนที่ต้องบวกกันโดยตรง เช่น ค่าวัสดุ + ค่าขนส่ง',
}

const CATEGORY_TEMPLATES: Record<string, FieldDraft[]> = {
  'qty*price': [
    { fieldId: 'itemName', label: 'ชื่อรายการ', type: 'text', unit: '', placeholder: 'ระบุชื่อ', required: true, calcRole: 'none', options: [] },
    { fieldId: 'quantity', label: 'จำนวน', type: 'number', unit: '', placeholder: '0', required: true, calcRole: 'qty', options: [] },
    { fieldId: 'price', label: 'ราคาต่อหน่วย', type: 'number', unit: '฿', placeholder: '0', required: true, calcRole: 'price', options: [] },
    { fieldId: 'note', label: 'หมายเหตุ', type: 'text', unit: '', placeholder: '(ถ้ามี)', required: false, calcRole: 'note', options: [] },
  ],
  'qty*price+addend': [
    { fieldId: 'itemName', label: 'ชื่อรายการ', type: 'text', unit: '', placeholder: 'ระบุชื่อ', required: true, calcRole: 'none', options: [] },
    { fieldId: 'workers', label: 'จำนวน', type: 'number', unit: 'คน', placeholder: '0', required: true, calcRole: 'qty', options: [] },
    { fieldId: 'dailyWage', label: 'ราคาต่อหน่วย', type: 'number', unit: '฿', placeholder: '0', required: true, calcRole: 'price', options: [] },
    { fieldId: 'ot', label: 'ค่าเพิ่มเติม', type: 'number', unit: '฿', placeholder: '0', required: false, calcRole: 'addend', options: [] },
    { fieldId: 'note', label: 'หมายเหตุ', type: 'text', unit: '', placeholder: '(ถ้ามี)', required: false, calcRole: 'note', options: [] },
  ],
  'fixed': [
    { fieldId: 'itemName', label: 'ชื่อรายการ', type: 'text', unit: '', placeholder: 'ระบุชื่อ', required: true, calcRole: 'none', options: [] },
    { fieldId: 'totalCost', label: 'ยอดเงิน', type: 'number', unit: '฿', placeholder: '0', required: true, calcRole: 'fixed', options: [] },
    { fieldId: 'note', label: 'หมายเหตุ', type: 'text', unit: '', placeholder: '(ถ้ามี)', required: false, calcRole: 'note', options: [] },
  ],
  'qty+price': [
    { fieldId: 'itemName', label: 'ชื่อรายการ', type: 'text', unit: '', placeholder: 'ระบุชื่อ', required: true, calcRole: 'none', options: [] },
    { fieldId: 'qty', label: 'ระบุยอดที่ 1', type: 'number', unit: '', placeholder: '0', required: true, calcRole: 'qty', options: [] },
    { fieldId: 'price', label: 'ระบุยอดที่ 2', type: 'number', unit: '฿', placeholder: '0', required: true, calcRole: 'price', options: [] },
    { fieldId: 'note', label: 'หมายเหตุ', type: 'text', unit: '', placeholder: '(ถ้ามี)', required: false, calcRole: 'note', options: [] },
  ],
}

// ── Preset color palette ──────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#ec4899','#6366f1','#14b8a6',
]

// ── Unit groups ───────────────────────────────────────────────────────────────
const UNIT_GROUPS = [
  {
    label: 'หมวดสิ่งของ',
    icon: 'inventory_2',
    units: ['ชิ้น','อัน','กล่อง','ชุด','รีม','เครื่อง','กิโลกรัม','แพ็ค','ถุง','แผ่น'],
  },
  {
    label: 'หมวดเวลา',
    icon: 'schedule',
    units: ['เดือน','วัน','ชั่วโมง','ปี','ครั้ง','นาที','สัปดาห์','งวด'],
  },
  {
    label: 'หมวดการวัด/บริการ',
    icon: 'straighten',
    units: ['ลิตร','หน่วย','ตารางเมตร','กิโลเมตร','ทริป','เมตร','ตัน','ถัง'],
  },
]

// ── Popular Material Icons for picker ─────────────────────────────────────────
const ICON_LIBRARY = [
  { name: 'receipt_long', tags: ['bill','receipt','เงิน'] },
  { name: 'local_gas_station', tags: ['fuel','gas','น้ำมัน'] },
  { name: 'construction', tags: ['repair','ซ่อม','build'] },
  { name: 'science', tags: ['chemical','chem','สาร'] },
  { name: 'people', tags: ['labor','worker','แรงงาน','คน'] },
  { name: 'inventory_2', tags: ['stock','สินค้า','ของ'] },
  { name: 'electric_bolt', tags: ['electric','ไฟฟ้า'] },
  { name: 'water_drop', tags: ['water','น้ำ'] },
  { name: 'local_shipping', tags: ['shipping','ส่ง','ขนส่ง'] },
  { name: 'restaurant', tags: ['food','อาหาร','ร้าน'] },
  { name: 'build', tags: ['tool','เครื่องมือ','repair'] },
  { name: 'medical_services', tags: ['medical','สุขภาพ','ยา'] },
  { name: 'attach_money', tags: ['money','เงิน','salary'] },
  { name: 'payments', tags: ['pay','จ่าย','เงิน'] },
  { name: 'account_balance', tags: ['bank','ธนาคาร'] },
  { name: 'shopping_cart', tags: ['shop','ซื้อ','cart'] },
  { name: 'warehouse', tags: ['warehouse','โกดัง','store'] },
  { name: 'agriculture', tags: ['farm','เกษตร','crop'] },
  { name: 'forest', tags: ['tree','ป่า','plant'] },
  { name: 'eco', tags: ['green','eco','ปุ๋ย'] },
  { name: 'grass', tags: ['grass','หญ้า','plant'] },
  { name: 'pest_control', tags: ['pest','สาร','กำจัด'] },
  { name: 'local_cafe', tags: ['cafe','coffee','กาแฟ'] },
  { name: 'drive_eta', tags: ['car','รถ','vehicle'] },
  { name: 'local_taxi', tags: ['taxi','รถ','travel'] },
  { name: 'flight', tags: ['flight','เดินทาง','plane'] },
  { name: 'home_repair_service', tags: ['repair','บ้าน','fix'] },
  { name: 'cleaning_services', tags: ['clean','ทำความสะอาด'] },
  { name: 'settings', tags: ['setting','ตั้งค่า','gear'] },
  { name: 'handyman', tags: ['fix','ช่าง','repair'] },
  { name: 'plumbing', tags: ['plumb','ท่อ','water'] },
  { name: 'electrical_services', tags: ['electric','ไฟฟ้า','plug'] },
  { name: 'fire_extinguisher', tags: ['fire','ดับเพลิง'] },
  { name: 'security', tags: ['security','รปภ.','guard'] },
  { name: 'badge', tags: ['id','badge','พนักงาน'] },
  { name: 'category', tags: ['category','หมวด'] },
  { name: 'business_center', tags: ['business','งาน','office'] },
  { name: 'calculate', tags: ['calc','คำนวณ'] },
  { name: 'bar_chart', tags: ['chart','กราฟ'] },
  { name: 'trending_up', tags: ['trend','ขึ้น','growth'] },
  { name: 'stars', tags: ['star','พิเศษ'] },
  { name: 'label', tags: ['label','ป้าย','tag'] },
  { name: 'loyalty', tags: ['loyalty','ส่วนลด'] },
  { name: 'redeem', tags: ['gift','ของขวัญ'] },
  { name: 'phone_android', tags: ['phone','มือถือ'] },
  { name: 'computer', tags: ['computer','คอม','it'] },
  { name: 'print', tags: ['print','พิมพ์','printer'] },
  { name: 'content_cut', tags: ['cut','ตัด','scissors'] },
  { name: 'brush', tags: ['paint','ทาสี','art'] },
  { name: 'format_paint', tags: ['paint','สี','ทาสี'] },
]

// ── Creatable Unit Select Component ───────────────────────────────────────────
function UnitSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allUnits = UNIT_GROUPS.flatMap(g => g.units)
  const filteredGroups = query.trim()
    ? UNIT_GROUPS.map(g => ({ ...g, units: g.units.filter(u => u.includes(query)) })).filter(g => g.units.length > 0)
    : UNIT_GROUPS
  const showCreate = query.trim() && !allUnits.includes(query.trim())

  function select(v: string) { onChange(v); setQuery(''); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>
        <span style={{ color: value ? '#1e293b' : '#94a3b8' }}>{value || 'เลือกหน่วย...'}</span>
        <span className="material-icons-round" style={{ fontSize: 14, color: '#94a3b8' }}>expand_more</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px #0002', zIndex: 100, marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: 'white' }}>
            <input autoFocus type="text" placeholder="ค้นหาหรือพิมพ์หน่วยใหม่..." value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && query.trim()) select(query.trim()) }}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 12, color: '#1e293b', background: 'transparent' }} />
          </div>
          {showCreate && (
            <button onClick={() => select(query.trim())} style={{ width: '100%', padding: '8px 12px', background: '#eff6ff', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-icons-round" style={{ fontSize: 14 }}>add_circle</span>
              สร้างหน่วย "{query.trim()}"
            </button>
          )}
          {filteredGroups.map(g => (
            <div key={g.label}>
              <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-icons-round" style={{ fontSize: 12 }}>{g.icon}</span>
                {g.label}
              </div>
              {g.units.map(u => (
                <button key={u} onClick={() => select(u)}
                  style={{ width: '100%', padding: '6px 20px', background: value === u ? '#eff6ff' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: value === u ? '#2563eb' : '#374151', fontWeight: value === u ? 700 : 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  onMouseEnter={e => { if (value !== u) (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (value !== u) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                  {u}
                  {value === u && <span className="material-icons-round" style={{ fontSize: 14, color: '#2563eb' }}>check</span>}
                </button>
              ))}
            </div>
          ))}
          {filteredGroups.length === 0 && !showCreate && (
            <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>ไม่พบหน่วย กด Enter เพื่อสร้างใหม่</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Icon Picker Component ─────────────────────────────────────────────────────
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.trim()
    ? ICON_LIBRARY.filter(ic => ic.name.includes(query) || ic.tags.some(t => t.includes(query)))
    : ICON_LIBRARY

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
        <span className="material-icons-round" style={{ fontSize: 20, color: '#3b82f6' }}>{value || 'receipt_long'}</span>
        <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{value || 'receipt_long'}</span>
        <span className="material-icons-round" style={{ fontSize: 14, color: '#94a3b8' }}>expand_more</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 32px #0003', zIndex: 200, marginTop: 4 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 8, padding: '6px 10px' }}>
              <span className="material-icons-round" style={{ fontSize: 16, color: '#94a3b8' }}>search</span>
              <input autoFocus type="text" placeholder="ค้นหาไอคอน เช่น car, water, lab..." value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 13, background: 'transparent', flex: 1, color: '#1e293b' }} />
              {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1 }}>×</button>}
            </div>
          </div>
          <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {filtered.map(ic => (
              <button key={ic.name} title={ic.name} onClick={() => { onChange(ic.name); setOpen(false) }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', background: value === ic.name ? '#eff6ff' : 'transparent', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (value !== ic.name) (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9' }}
                onMouseLeave={e => { if (value !== ic.name) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                <span className="material-icons-round" style={{ fontSize: 22, color: value === ic.name ? '#2563eb' : '#374151' }}>{ic.name}</span>
                <span style={{ fontSize: 8, color: '#94a3b8', marginTop: 2, lineHeight: 1.2, textAlign: 'center', maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ic.name.replace(/_/g, ' ')}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '16px 0', fontSize: 12, color: '#94a3b8' }}>ไม่พบไอคอน</div>
            )}
          </div>
          <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>หรือพิมพ์ชื่อ Material Icon โดยตรง:</span>
              <input type="text" placeholder="เช่น local_fire_department" value={value}
                onChange={e => onChange(e.target.value)}
                style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
  const [publicAccess, setPublicAccess] = useState(false)
  const [accessError, setAccessError] = useState(false)

  // User search state
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<{ username: string; name: string; role: string }[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  // Formula tooltip
  const [formulaTooltip, setFormulaTooltip] = useState(false)

  // Preview state
  const [previewRow, setPreviewRow] = useState<Record<string, string>>({})
  const previewCat = useMemo(() => {
    return {
      id: 'preview',
      name: name || 'ชื่อหมวดจำลอง...',
      color,
      icon,
      formula: formula as any,
      fields: fields.map(f => ({ ...f, type: f.type as any, calcRole: f.calcRole as any })),
      allowedUsers: [], allowedRoles: [], isActive: true, order: 999, createdAt: '', createdBy: ''
    } as ExpenseCategory
  }, [name, color, icon, formula, fields])

  const previewTotal = useMemo(() => {
    const vals: Record<string, number> = {}
    previewCat.fields.forEach(f => {
      if (['qty','price','addend','fixed'].includes(f.calcRole)) {
        vals[f.calcRole] = parseFloat(previewRow[f.fieldId] || '0') || 0
      }
    })
    const { qty = 0, price = 0, addend = 0, fixed = 0 } = vals
    if (previewCat.formula === 'qty*price') return qty * price
    if (previewCat.formula === 'qty*price+addend') return qty * price + addend
    if (previewCat.formula === 'fixed') return fixed
    if (previewCat.formula === 'qty+price') return qty + price
    return fixed || (qty * price + addend)
  }, [previewCat, previewRow])

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
    setAccessError(false)
    setUserSearch(''); setUserResults([])
  }

  async function openCreate() {
    setEditingId(null)
    setName(''); setColor('#3b82f6'); setIcon('receipt_long'); setFormula('fixed'); setOrder(999)
    setFields(CATEGORY_TEMPLATES['fixed'].map(f => ({ ...f })))
    setAllowedUsers([]); setPublicAccess(false); setAccessError(false)
    setUserSearch(''); setUserResults([])
    setShowModal(true)
  }

  function openEdit(cat: ExpenseCategory) {
    setEditingId(cat.id)
    setName(cat.name); setColor(cat.color); setIcon(cat.icon); setFormula(cat.formula); setOrder(cat.order)
    setFields(cat.fields.map(f => ({ ...f })))
    const users = cat.allowedUsers || []
    setAllowedUsers([...users])
    setPublicAccess(users.length === 0)
    setAccessError(false)
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
    if (!name.trim()) { flash('err', 'กรุณาระบุชื่อหมวด'); return }
    if (!publicAccess && allowedUsers.length === 0) { setAccessError(true); flash('err', 'กรุณาเลือกผู้มีสิทธิ์กรอกข้อมูลอย่างน้อย 1 คน หรือเปิด "ให้ทุกคนเข้าถึงได้"'); return }
    setAccessError(false)
    setSaving(true)
    try {
      const payload = { name, color, icon, formula, order, fields, allowedRoles: [], allowedUsers: publicAccess ? [] : allowedUsers }
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
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>{FORMULA_LABELS[cat.formula] || cat.formula}</span>
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => setColor(c)}
                        style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? `3px solid ${c}` : '2px solid white', outline: color === c ? `2px solid ${c}` : 'none', cursor: 'pointer', boxShadow: '0 1px 4px #0002', transition: 'transform 0.1s', transform: color === c ? 'scale(1.2)' : 'scale(1)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={color} onChange={e => setColor(e.target.value)}
                      style={{ width: 36, height: 32, border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                    <input type="text" className="form-input" value={color} onChange={e => setColor(e.target.value)} style={{ flex: 1 }} />
                  </div>
                </div>
                <div>
                  <label className="form-label">ไอคอน (Material Icons)</label>
                  <IconPicker value={icon} onChange={setIcon} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">รูปแบบการคำนวน</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="form-input" style={{ flex: 1 }} value={formula} onChange={e => {
                        const newFormula = e.target.value;
                        setFormula(newFormula);
                        if (CATEGORY_TEMPLATES[newFormula]) {
                          setFields(CATEGORY_TEMPLATES[newFormula].map(f => ({ ...f })));
                        }
                      }}>
                        {FORMULAS.map(f => <option key={f} value={f}>{FORMULA_LABELS[f] || f}</option>)}
                      </select>
                      <button type="button"
                        onMouseEnter={() => setFormulaTooltip(true)}
                        onMouseLeave={() => setFormulaTooltip(false)}
                        style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', cursor: 'default', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-icons-round" style={{ fontSize: 18 }}>info_outline</span>
                      </button>
                    </div>
                    {formulaTooltip && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 300, background: '#1e293b', color: 'white', padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.6, zIndex: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: '#93c5fd' }}>{FORMULA_LABELS[formula]}</div>
                        {FORMULA_HINTS[formula]}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview UI — ใต้รูปแบบการคำนวน */}
              <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <label className="form-label" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#3b82f6' }}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>visibility</span>
                  พรีวิวฟอร์ม
                </label>
                <div style={{ background: 'white', padding: 8, borderRadius: 10 }}>
                  <DynamicItemCard cat={previewCat} item={previewRow} idx={0} total={previewTotal} canDelete={false}
                    onChange={(fId, v) => setPreviewRow(prev => ({ ...prev, [fId]: v }))}
                    onDelete={() => {}} />
                </div>
              </div>

              {/* Permission */}
              <div style={{ marginBottom: 20, padding: 16, background: accessError ? '#fef2f2' : '#f8fafc', borderRadius: 12, border: `1px solid ${accessError ? '#fca5a5' : 'transparent'}`, transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className="form-label" style={{ margin: 0, color: accessError ? '#dc2626' : undefined }}>
                    สิทธิ์การกรอกข้อมูล <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: publicAccess ? '#059669' : '#475569', fontWeight: 500 }}>
                    <input type="checkbox" checked={publicAccess}
                      onChange={e => { setPublicAccess(e.target.checked); setAccessError(false); if (e.target.checked) setAllowedUsers([]) }}
                      style={{ accentColor: '#059669' }} />
                    ให้ทุกคนเข้าถึงได้
                  </label>
                </div>
                {/* Public access warning */}
                {publicAccess && (
                  <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, fontSize: 12, color: '#854d0e', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span className="material-icons-round" style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>warning_amber</span>
                    <span><strong>ทุกคนในระบบจะกรอกข้อมูลหมวดนี้ได้</strong> — ตรวจสอบให้แน่ใจก่อนบันทึก</span>
                  </div>
                )}
                {/* Error hint */}
                {accessError && (
                  <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-icons-round" style={{ fontSize: 16 }}>error_outline</span>
                    กรุณาเลือกผู้มีสิทธิ์อย่างน้อย 1 คน หรือเปิด "ให้ทุกคนเข้าถึงได้"
                  </div>
                )}
                {/* Selected users chips */}
                {!publicAccess && allowedUsers.length > 0 && (
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
                {!publicAccess && (
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
                )}
              </div>

              {/* Field Builder */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <label className="form-label" style={{ margin: 0 }}>ฟิลด์กรอกข้อมูล</label>
                  <button onClick={addField} style={{ padding: '5px 12px', borderRadius: 8, background: '#eff6ff', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons-round" style={{ fontSize: 14 }}>add</span>เพิ่มฟิลด์เสริม
                  </button>
                </div>
                {fields.map((f, idx) => {
                  const rCol = ROLE_COLORS_CALC[f.calcRole] || '#cbd5e1'
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, background: rCol + '18', color: rCol, flexShrink: 0 }} title={`บทบาทการคำนวณ: ${ROLE_LABELS_CALC[f.calcRole] || f.calcRole}`}>
                        <span className="material-icons-round" style={{ fontSize: 18 }}>{ROLE_ICONS_CALC[f.calcRole] || 'edit'}</span>
                      </div>
                      
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <input type="text" className="form-input" style={{ fontSize: 13, padding: '7px 10px' }} placeholder="ชื่อฟิลด์ที่จะแสดงให้คนกรอกเห็น" value={f.label} onChange={e => updateField(idx, 'label', e.target.value)} />
                      </div>

                      <div style={{ width: 160 }}>
                        {f.calcRole === 'qty' ? (
                          <UnitSelect value={f.unit} onChange={v => updateField(idx, 'unit', v)} />
                        ) : (
                          <div style={{ padding: '6px 10px', fontSize: 13, color: '#64748b', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', minHeight: '34px', display: 'flex', alignItems: 'center' }}>
                            {f.unit || '-'}
                          </div>
                        )}
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', width: 70, color: '#475569' }}>
                        <input type="checkbox" checked={f.required} onChange={e => updateField(idx, 'required', e.target.checked)} />
                        บังคับ
                      </label>

                      <div style={{ width: 28, display: 'flex', justifyContent: 'center' }}>
                        {fields.length > 1 && (
                          <button onClick={() => removeField(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4, display: 'flex', alignItems: 'center' }}>
                            <span className="material-icons-round" style={{ fontSize: 18 }}>delete_outline</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
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

// ─── Executive Tab — Budget vs Actual รายปี ──────────────────────────────────
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

interface MonthData { month: number; budget: number; spent: number; variance: number; pct: number | null; future: boolean }
interface CatYear {
  id: string; name: string; color: string; icon: string
  months: MonthData[]
  ytdBudget: number; ytdSpent: number; ytdVariance: number; ytdPct: number | null; status: string
}
interface YearlyData {
  year: number
  categories: CatYear[]
  grandTotal: { ytdBudget: number; ytdSpent: number; ytdVariance: number; ytdPct: number; status: string }
}

// สีมืออาชีพ: ไม่ใช้ emoji — ใช้ accent color เท่านั้น
function pctStyle(pct: number | null, future: boolean): { bar: string; text: string; bg: string; label: string } {
  if (future || pct === null) return { bar: 'transparent', text: '#94a3b8', bg: 'transparent', label: '—' }
  if (pct > 100) return { bar: '#dc2626', text: '#dc2626', bg: '#fff5f5', label: `${pct}%` }
  if (pct > 80)  return { bar: '#f59e0b', text: '#b45309', bg: '#fffbeb', label: `${pct}%` }
  if (pct === 0) return { bar: '#e2e8f0', text: '#94a3b8', bg: 'transparent', label: '0%' }
  return { bar: '#2563eb', text: '#1d4ed8', bg: '#eff6ff', label: `${pct}%` }
}


function ExecutiveTab() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<YearlyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ cat: CatYear; m: MonthData } | null>(null)

  useEffect(() => {
    setLoading(true)
    budgetApi.getYearly(year)
      .then(r => setData(r as YearlyData))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  const yearOptions = Array.from({ length: 5 }, (_, i) => thisYear - 2 + i)

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Budget vs Actual</p>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>เปรียบเทียบงบประมาณกับยอดจริงรายเดือน</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Legend inline */}
          {[['#2563eb','< 80%'],['#f59e0b','80–100%'],['#dc2626','> 100%']].map(([c,l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
            </span>
          ))}
          <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 4px' }} />
          <span style={{ fontSize: 12, color: '#64748b' }}>ปี</span>
          <select style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 13, color: '#1e293b', background: '#fff', cursor: 'pointer' }}
            value={year} onChange={e => setYear(Number(e.target.value))}>
            {yearOptions.map(y => <option key={y} value={y}>{y + 543}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <span className="material-icons-round spin text-blue-400" style={{ fontSize: 36 }}>refresh</span>
        </div>
      ) : !data || data.categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8', fontSize: 14 }}>
          <span className="material-icons-round" style={{ fontSize: 44, display: 'block', marginBottom: 8, color: '#cbd5e1' }}>table_chart</span>
          ยังไม่มีข้อมูลสำหรับปี {year + 543}
        </div>
      ) : (
        <>
          {/* ── Main Table ─────────────────────────────────────────────────── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 1 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '11px 16px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11, minWidth: 160, background: '#f8fafc', position: 'sticky', left: 0, zIndex: 2, whiteSpace: 'nowrap' }}>หมวดหมู่</th>
                    {THAI_MONTHS_SHORT.map((m, i) => (
                      <th key={i} style={{ padding: '11px 4px', textAlign: 'center', color: '#64748b', fontWeight: 500, fontSize: 11, minWidth: 64, background: '#f8fafc', whiteSpace: 'nowrap' }}>{m}</th>
                    ))}
                    <th style={{ padding: '11px 14px', textAlign: 'right', color: '#475569', fontWeight: 600, fontSize: 11, minWidth: 110, background: '#f8fafc', whiteSpace: 'nowrap' }}>YTD ใช้ (฿)</th>
                    <th style={{ padding: '11px 14px', textAlign: 'right', color: '#475569', fontWeight: 600, fontSize: 11, minWidth: 110, background: '#f8fafc', whiteSpace: 'nowrap' }}>งบ YTD (฿)</th>
                    <th style={{ padding: '11px 14px', textAlign: 'right', color: '#475569', fontWeight: 600, fontSize: 11, minWidth: 110, background: '#f8fafc', whiteSpace: 'nowrap' }}>±คงเหลือ (฿)</th>
                    <th style={{ padding: '11px 14px', textAlign: 'center', color: '#475569', fontWeight: 600, fontSize: 11, minWidth: 64, background: '#f8fafc', whiteSpace: 'nowrap' }}>% ใช้</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((cat, ri) => {
                    const ytdPs = pctStyle(cat.ytdPct, false)
                    const rowBg = ri % 2 === 0 ? '#fff' : '#fafafa'
                    return (
                      <tr key={cat.id} style={{ borderBottom: '1px solid #f1f5f9', background: rowBg }}>
                        {/* Category */}
                        <td style={{ padding: '10px 16px', position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 3, height: 28, borderRadius: 2, background: cat.color, flexShrink: 0 }} />
                            <span className="material-icons-round" style={{ fontSize: 15, color: cat.color }}>{cat.icon}</span>
                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 12 }}>{cat.name}</span>
                          </div>
                        </td>
                        {/* Month cells */}
                        {cat.months.map(m => {
                          const ps = pctStyle(m.pct, m.future)
                          const isEmpty = m.budget === 0 && m.spent === 0
                          return (
                            <td key={m.month} style={{ padding: '6px 3px', textAlign: 'center', cursor: isEmpty || m.future ? 'default' : 'pointer' }}
                              onClick={() => !isEmpty && !m.future && setSelected(s => s?.cat.id === cat.id && s?.m.month === m.month ? null : { cat, m })}>
                              {isEmpty || m.future ? (
                                <span style={{ color: '#e2e8f0', fontSize: 11 }}>—</span>
                              ) : (
                                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 6px', borderRadius: 5,
                                  background: selected?.cat.id === cat.id && selected?.m.month === m.month ? ps.bg : 'transparent',
                                  border: selected?.cat.id === cat.id && selected?.m.month === m.month ? `1px solid ${ps.bar}` : '1px solid transparent',
                                  transition: 'all 0.1s' }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: ps.text, fontVariantNumeric: 'tabular-nums' }}>{ps.label}</span>
                                  {/* mini bar */}
                                  <div style={{ width: 40, height: 3, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, m.pct ?? 0)}%`, background: ps.bar, borderRadius: 2 }} />
                                  </div>
                                </div>
                              )}
                            </td>
                          )
                        })}
                        {/* YTD summary */}
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          ฿{fmt(cat.ytdSpent)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          ฿{fmt(cat.ytdBudget)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
                          color: cat.ytdVariance >= 0 ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                          {cat.ytdVariance >= 0 ? '+' : ''}฿{fmt(cat.ytdVariance)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: ytdPs.bg || '#f1f5f9', color: ytdPs.text, fontVariantNumeric: 'tabular-nums',
                            border: `1px solid ${cat.ytdPct !== null && cat.ytdPct > 100 ? '#fecaca' : cat.ytdPct !== null && cat.ytdPct > 80 ? '#fde68a' : '#dbeafe'}` }}>
                            {cat.ytdPct === null ? '—' : `${cat.ytdPct}%`}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Grand total footer */}
                <tfoot>
                  {(() => {
                    const g = data.grandTotal
                    const gPs = pctStyle(g.ytdPct, false)
                    return (
                      <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a', fontSize: 12, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>รวมทั้งปี</td>
                        {Array.from({ length: 12 }, (_, i) => <td key={i} />)}
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>฿{fmt(g.ytdSpent)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#475569', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>฿{fmt(g.ytdBudget)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                          color: g.ytdVariance >= 0 ? '#15803d' : '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>
                          {g.ytdVariance >= 0 ? '+' : ''}฿{fmt(g.ytdVariance)}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 800,
                            background: gPs.bg || '#f1f5f9', color: gPs.text,
                            border: `1px solid ${g.ytdPct > 100 ? '#fecaca' : g.ytdPct > 80 ? '#fde68a' : '#dbeafe'}` }}>
                            {g.ytdPct}%
                          </span>
                        </td>
                      </tr>
                    )
                  })()}
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Detail panel (กดเซลล์แล้ว expand ด้านล่าง) ─────────────── */}
          {selected && (
            <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#fff', padding: '16px 24px', display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{selected.cat.name} · {THAI_MONTHS_SHORT[selected.m.month - 1]} {year + 543}</p>
                <div style={{ display: 'flex', gap: 32, marginTop: 8 }}>
                  {[['งบประมาณ', selected.m.budget, '#475569'],['ใช้จริง', selected.m.spent, '#0f172a'],['±คงเหลือ', selected.m.variance, selected.m.variance >= 0 ? '#15803d' : '#b91c1c']].map(([l,v,c]) => (
                    <div key={l as string}>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{l as string}</p>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c as string, fontVariantNumeric: 'tabular-nums' }}>
                        {(l as string).startsWith('±') && (v as number) >= 0 ? '+' : ''}฿{fmt(v as number)}
                      </p>
                    </div>
                  ))}
                  {selected.m.pct !== null && (
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>% ใช้งบ</p>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: selected.m.pct > 100 ? '#b91c1c' : selected.m.pct > 80 ? '#b45309' : '#1d4ed8' }}>
                        {selected.m.pct}%
                      </p>
                    </div>
                  )}
                </div>
                {selected.m.budget > 0 && (
                  <div style={{ marginTop: 10, width: 280, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, selected.m.pct ?? 0)}%`,
                      background: (selected.m.pct ?? 0) > 100 ? '#dc2626' : (selected.m.pct ?? 0) > 80 ? '#f59e0b' : '#2563eb',
                      borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
              <button onClick={() => setSelected(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
