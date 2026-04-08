'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { customerApi, workspaceApi, segmentApi, settingsApi } from '@/lib/api'
import type { Customer, CustomerSegment, CustomersResponse } from '@/types'

const STATUS_OPTIONS = [
  { value: 'active',   label: 'ใช้งาน' },
  { value: 'inactive', label: 'ไม่ใช้งาน' },
  { value: '',         label: 'ทั้งหมด' },
]

const WS_ICONS  = ['business', 'store', 'groups', 'apartment', 'factory', 'local_shipping', 'restaurant', 'spa', 'school', 'medical_services']
const WS_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#9333ea', '#64748b', '#0f172a']

const DEFAULT_WS_FORM = { name: '', description: '', color: '#7c3aed', icon: 'business' }

interface Workspace {
  id: string; name: string; description: string
  color: string; icon: string; lineOaConfigId: string
  memberUsernames: string[]
}
interface LineOaConfig { id: string; name: string; category: string }

export default function CustomersPage() {
  const router = useRouter()
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

  // ── Workspaces ──────────────────────────────────────────────────
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [wsId, setWsId]             = useState('')
  const [wsLoading, setWsLoading]   = useState(true)

  // workspace create / edit modal
  const [showWsModal, setShowWsModal]   = useState(false)
  const [wsForm, setWsForm]             = useState({ ...DEFAULT_WS_FORM })
  const [wsSaving, setWsSaving]         = useState(false)

  // LINE OA configs (for showing badge only)
  const [lineConfigs, setLineConfigs] = useState<LineOaConfig[]>([])

  // ── Customers ───────────────────────────────────────────────────
  const [customers, setCustomers]   = useState<Customer[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading]       = useState(false)
  const [allTags, setAllTags]       = useState<string[]>([])
  const [segments, setSegments]     = useState<CustomerSegment[]>([])

  // filters
  const [q, setQ]           = useState('')
  const [typeF, setTypeF]   = useState('')
  const [tagF, setTagF]     = useState('')
  const [segmentF, setSegF] = useState('')
  const [statusF, setStF]   = useState('active')

  // customer form modal
  const [showForm, setShowForm]         = useState(false)
  const [editTarget, setEditTarget]     = useState<Customer | null>(null)
  const [formData, setFormData]         = useState({
    name: '', type: 'B2C', email: '', phone: '', company: '', address: '', note: '',
    tags: '', segmentIds: [] as string[],
  })
  const [saving, setSaving]             = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  // ── Load workspaces + LINE OA configs ───────────────────────────
  useEffect(() => {
    setWsLoading(true)
    Promise.all([
      workspaceApi.getAll(),
      settingsApi.get(),
    ]).then(([wsRes, stRes]: any) => {
      const ws = wsRes.workspaces || []
      setWorkspaces(ws)
      if (ws.length > 0) setWsId(ws[0].id)
      setLineConfigs(stRes.lineOaConfigs || [])
    }).catch(() => {}).finally(() => setWsLoading(false))
  }, [])

  // load segments/tags when workspace changes
  useEffect(() => {
    if (!wsId) return
    segmentApi.getAll(wsId).then((r: any) => setSegments(r.segments || [])).catch(() => {})
    customerApi.getTags(wsId).then((r: any) => setAllTags(r.tags || [])).catch(() => {})
  }, [wsId])

  const load = useCallback(async (p = 1) => {
    if (!wsId) return
    setLoading(true)
    try {
      const res = await customerApi.getAll(wsId, {
        q, type: typeF, tag: tagF, status: statusF, segmentId: segmentF, page: p, perPage: 20,
      }) as CustomersResponse
      setCustomers(res.customers); setTotal(res.total); setPage(p); setTotalPages(res.totalPages)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [wsId, q, typeF, tagF, statusF, segmentF])

  useEffect(() => { load(1) }, [load])

  // ── Workspace CRUD ───────────────────────────────────────────────
  function openCreateWs() {
    setWsForm({ ...DEFAULT_WS_FORM })
    setShowWsModal(true)
  }

  async function handleSaveWs() {
    if (!wsForm.name.trim()) { alert('กรุณาใส่ชื่อธุรกิจ'); return }
    setWsSaving(true)
    try {
      const res = await workspaceApi.create(wsForm) as any
      const newId = res.id || res._id || res.workspace?.id
      const wsRes = await workspaceApi.getAll() as any
      const ws = wsRes.workspaces || []
      setWorkspaces(ws)
      if (newId) setWsId(newId)
      else if (ws.length > 0) setWsId(ws[ws.length - 1].id)
      setShowWsModal(false)
    } catch (e: any) { alert(e.message || 'บันทึกไม่สำเร็จ') }
    finally { setWsSaving(false) }
  }

  // ── Customer CRUD ────────────────────────────────────────────────
  function openCreate() {
    setEditTarget(null)
    setFormData({ name: '', type: 'B2C', email: '', phone: '', company: '', address: '', note: '', tags: '', segmentIds: [] })
    setShowForm(true)
  }
  function openEdit(c: Customer) {
    setEditTarget(c)
    setFormData({ name: c.name, type: c.type, email: c.email || '', phone: c.phone || '',
      company: c.company || '', address: c.address || '', note: c.note || '',
      tags: c.tags.join(', '), segmentIds: c.segmentIds || [] })
    setShowForm(true)
  }
  async function handleSave() {
    if (!formData.name.trim() || !wsId) return
    setSaving(true)
    try {
      const payload = { ...formData, tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean) }
      if (editTarget) await customerApi.update(wsId, editTarget.id, payload)
      else await customerApi.create(wsId, payload)
      setShowForm(false); load(1)
      customerApi.getTags(wsId).then((r: any) => setAllTags(r.tags || [])).catch(() => {})
    } catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }
  async function handleDelete() {
    if (!deleteTarget || !wsId) return
    try { await customerApi.delete(wsId, deleteTarget.id); setDeleteTarget(null); load(1) }
    catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
  }
  function handleExport() {
    if (!wsId) return
    const url = customerApi.exportCsvUrl(wsId, { type: typeF, tag: tagF, status: statusF || 'active' })
    window.open(url, '_blank')
  }
  function toggleSegmentInForm(segId: string) {
    setFormData(p => ({ ...p, segmentIds: p.segmentIds.includes(segId)
      ? p.segmentIds.filter(s => s !== segId) : [...p.segmentIds, segId] }))
  }

  // ── Current workspace info ───────────────────────────────────────
  const currentWs = workspaces.find(w => w.id === wsId)
  const linkedLine = lineConfigs.find(l => l.id === currentWs?.lineOaConfigId)
  const lineWebhookUrl = linkedLine ? `${API_BASE}/api/line/webhook/${linkedLine.id}` : ''

  // ── RENDER ───────────────────────────────────────────────────────
  if (wsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <p className="text-slate-400 text-sm">กำลังโหลด...</p>
      </div>
    )
  }

  // ── No workspace: full-page prompt ──────────────────────────────
  if (workspaces.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: '#f3f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <span className="material-icons-round" style={{ fontSize: 36, color: '#7c3aed' }}>business</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">เริ่มต้นระบบ CRM</h1>
          <p className="text-slate-500 mb-8">สร้าง "ธุรกิจ" (Workspace) เพื่อแบ่งกลุ่มข้อมูลลูกค้า<br/>คุณสามารถมีหลายธุรกิจได้ เช่น ร้านค้า A / ร้านค้า B</p>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, textAlign: 'left' }}>
            <h3 className="font-semibold text-slate-700 mb-4">สร้างธุรกิจแรก</h3>
            <div className="grid gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อธุรกิจ *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="เช่น ร้านขายของ, ทีมขายภาคเหนือ"
                  value={wsForm.name} onChange={e => setWsForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">คำอธิบาย (optional)</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="อธิบายสั้นๆ"
                  value={wsForm.description} onChange={e => setWsForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">สี</label>
                <div className="flex gap-2 flex-wrap">
                  {WS_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setWsForm(f => ({ ...f, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: wsForm.color === c ? '3px solid #1e293b' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">ไอคอน</label>
                <div className="flex gap-2 flex-wrap">
                  {WS_ICONS.map(ic => (
                    <button key={ic} type="button" onClick={() => setWsForm(f => ({ ...f, icon: ic }))}
                      style={{ width: 36, height: 36, borderRadius: 8, background: wsForm.icon === ic ? wsForm.color : '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-icons-round" style={{ fontSize: 18, color: wsForm.icon === ic ? 'white' : '#64748b' }}>{ic}</span>
                    </button>
                  ))}
                </div>
              </div>
              {lineConfigs.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    เชื่อมต่อ LINE OA (optional)
                  </label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                    value={wsForm.lineOaConfigId}
                    onChange={e => setWsForm(f => ({ ...f, lineOaConfigId: e.target.value }))}>
                    <option value="">ไม่เชื่อมต่อ</option>
                    {lineConfigs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button
              onClick={handleSaveWs}
              disabled={wsSaving || !wsForm.name.trim()}
              className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: wsForm.color }}>
              <span className="material-icons-round" style={{ fontSize: 18 }}>add_business</span>
              {wsSaving ? 'กำลังสร้าง...' : 'สร้างธุรกิจ'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main page ────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">

      {/* ── Business (Workspace) Tabs ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {workspaces.map(ws => (
          <button key={ws.id} type="button"
            onClick={() => setWsId(ws.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px',
              borderRadius: 24, border: wsId === ws.id ? `2px solid ${ws.color}` : '2px solid #e2e8f0',
              background: wsId === ws.id ? `${ws.color}15` : 'white',
              color: wsId === ws.id ? ws.color : '#64748b',
              fontWeight: wsId === ws.id ? 700 : 500, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
            }}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>{ws.icon || 'business'}</span>
            {ws.name}
          </button>
        ))}
        {/* Add new business */}
        <button type="button" onClick={openCreateWs}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 24, border: '2px dashed #cbd5e1', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>add</span>
          เพิ่มธุรกิจ
        </button>
      </div>

      {/* ── Workspace header bar ── */}
      {currentWs && (
        <div style={{ background: `${currentWs.color}08`, border: `1px solid ${currentWs.color}25`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-icons-round" style={{ fontSize: 20, color: currentWs.color }}>{currentWs.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{currentWs.name}</span>
              {currentWs.description && <span style={{ fontSize: 12, color: '#94a3b8' }}>· {currentWs.description}</span>}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>ลูกค้า {total.toLocaleString()} ราย</p>
          </div>

          {/* Source badge → link to connections page */}
          <button type="button" onClick={() => router.push('/customers/connections')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
              background: linkedLine ? '#f0fdf4' : 'white',
              border: linkedLine ? '1px solid #86efac' : '1px dashed #e2e8f0',
              fontSize: 12, color: linkedLine ? '#15803d' : '#64748b', cursor: 'pointer' }}>
            <span className="material-icons-round" style={{ fontSize: 14 }}>{linkedLine ? 'chat_bubble' : 'hub'}</span>
            {linkedLine ? `LINE: ${linkedLine.name}` : 'การเชื่อมต่อ'}
          </button>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/customers/segments')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
              <span className="material-icons-round" style={{ fontSize: 14 }}>label</span>
              กลุ่ม
            </button>
            <button onClick={handleExport}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
              <span className="material-icons-round" style={{ fontSize: 14 }}>download</span>
              Export
            </button>
            <button onClick={openCreate}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: currentWs.color, border: 'none', fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
              <span className="material-icons-round" style={{ fontSize: 14 }}>person_add</span>
              เพิ่มลูกค้า
            </button>
          </div>
        </div>
      )}

      {/* Segment pills */}
      {segments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setSegF('')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={segmentF === '' ? { background: currentWs?.color || '#7c3aed', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
            ทุกกลุ่ม
          </button>
          {segments.map(seg => (
            <button key={seg.id} onClick={() => setSegF(segmentF === seg.id ? '' : seg.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={segmentF === seg.id ? { background: seg.color, color: '#fff' } : { background: seg.color + '15', color: seg.color }}>
              <span className="material-icons-round" style={{ fontSize: 13 }}>{seg.icon}</span>
              {seg.name}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <input className="col-span-2 md:col-span-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          placeholder="ค้นหาชื่อ, อีเมล, เบอร์โทร..." value={q} onChange={e => setQ(e.target.value)} />
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={typeF} onChange={e => setTypeF(e.target.value)}>
          <option value="">ทุกประเภท</option>
          <option value="B2B">B2B (องค์กร)</option>
          <option value="B2C">B2C (บุคคล)</option>
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={tagF} onChange={e => setTagF(e.target.value)}>
          <option value="">ทุก Tag</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={statusF} onChange={e => setStF(e.target.value)}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">กำลังโหลด...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <span className="material-icons-round text-4xl block mb-2">contacts</span>
            ยังไม่มีข้อมูลลูกค้า
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3 text-left">ชื่อ / บริษัท</th>
                  <th className="px-4 py-3 text-left">ประเภท</th>
                  <th className="px-4 py-3 text-left">ติดต่อ</th>
                  <th className="px-4 py-3 text-left">Tags / กลุ่ม</th>
                  <th className="px-4 py-3 text-left">LINE</th>
                  <th className="px-4 py-3 text-left">วันที่สร้าง</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => router.push(`/customers/${c.id}`)} className="text-left hover:text-purple-600 transition-colors">
                        <p className="font-medium text-gray-800">{c.name}</p>
                        {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {c.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{c.email || '-'}</p>
                      <p className="text-xs text-gray-400">{c.phone || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 2).map(t => (
                          <span key={t} className="inline-flex px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">{t}</span>
                        ))}
                        {(c.segmentIds || []).slice(0, 2).map(sid => {
                          const seg = segments.find(s => s.id === sid)
                          return seg ? (
                            <span key={sid} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs"
                              style={{ background: seg.color + '20', color: seg.color }}>
                              <span className="material-icons-round" style={{ fontSize: 10 }}>{seg.icon}</span>
                              {seg.name}
                            </span>
                          ) : null
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.lineDisplayName || '-'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{c.createdAt?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => router.push(`/customers/${c.id}`)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="ดูรายละเอียด">
                          <span className="material-icons-round" style={{ fontSize: 16 }}>visibility</span>
                        </button>
                        <button onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="แก้ไข">
                          <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
                        </button>
                        <button onClick={() => setDeleteTarget(c)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="ลบ">
                          <span className="material-icons-round" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">หน้า {page} / {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => load(page - 1)} disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40">ก่อนหน้า</button>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40">ถัดไป</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Source popup ── */}
      {showSourcePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-gray-800">เชื่อมต่อแหล่งข้อมูล</h2>
                {currentWs && <p className="text-xs text-gray-400 mt-0.5">{currentWs.name}</p>}
              </div>
              <button onClick={() => setShowSourcePopup(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-5 space-y-3">

              {/* ── LINE OA ── */}
              <div style={{ border: `2px solid ${srcLineId || currentWs?.lineOaConfigId ? '#86efac' : '#e2e8f0'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                {/* Header */}
                <div style={{ padding: '14px 16px', background: srcLineId || currentWs?.lineOaConfigId ? '#f0fdf4' : '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 20, color: '#16a34a' }}>chat_bubble</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>LINE Official Account</p>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>ดึงลูกค้าอัตโนมัติเมื่อ Follow OA</p>
                  </div>
                  {(srcLineSaved || (!srcLineSaved && currentWs?.lineOaConfigId && srcLineId === currentWs.lineOaConfigId)) && currentWs?.lineOaConfigId && (
                    <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
                      เชื่อมต่อแล้ว
                    </span>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding: '14px 16px', borderTop: '1px solid #f0fdf4' }}>
                  {lineConfigs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>ยังไม่มี LINE OA ที่ตั้งค่าไว้</p>
                      <a href="/it-access"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#7c3aed', padding: '7px 14px', borderRadius: 8, background: '#f3f0ff', textDecoration: 'none' }}>
                        <span className="material-icons-round" style={{ fontSize: 15 }}>settings</span>
                        ตั้งค่า LINE OA ที่ IT Access
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* LINE OA selector cards */}
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>เลือก LINE OA ที่ต้องการเชื่อม</p>
                      <div className="space-y-2">
                        {lineConfigs.map(l => {
                          const selected = srcLineId === l.id || (!srcLineId && currentWs?.lineOaConfigId === l.id)
                          return (
                            <button key={l.id} type="button"
                              onClick={() => setSrcLineId(l.id)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                                border: selected ? '2px solid #16a34a' : '2px solid #e2e8f0',
                                background: selected ? '#f0fdf4' : 'white',
                              }}>
                              <span className="material-icons-round" style={{ fontSize: 18, color: selected ? '#16a34a' : '#94a3b8' }}>chat</span>
                              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#1e293b', textAlign: 'left' }}>{l.name}</span>
                              {selected && <span className="material-icons-round" style={{ fontSize: 18, color: '#16a34a' }}>check_circle</span>}
                            </button>
                          )
                        })}
                        {/* Disconnect option */}
                        <button type="button"
                          onClick={() => setSrcLineId('__none__')}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                            border: srcLineId === '__none__' ? '2px solid #fca5a5' : '2px solid #f1f5f9',
                            background: srcLineId === '__none__' ? '#fff1f2' : '#fafafa',
                          }}>
                          <span className="material-icons-round" style={{ fontSize: 18, color: srcLineId === '__none__' ? '#dc2626' : '#cbd5e1' }}>link_off</span>
                          <span style={{ fontSize: 13, color: srcLineId === '__none__' ? '#dc2626' : '#94a3b8' }}>ยกเลิกการเชื่อมต่อ</span>
                        </button>
                      </div>

                      {/* Save button */}
                      {srcLineId && (
                        <button type="button"
                          disabled={srcLineSaving}
                          onClick={async () => {
                            if (!currentWs) return
                            setSrcLineSaving(true)
                            try {
                              const newLineId = srcLineId === '__none__' ? '' : srcLineId
                              await workspaceApi.update(currentWs.id, { ...currentWs, lineOaConfigId: newLineId })
                              const res = await workspaceApi.getAll() as any
                              setWorkspaces(res.workspaces || [])
                              setSrcLineSaved(true)
                              if (srcLineId === '__none__') setSrcLineId('')
                            } catch (err: any) { alert(err.message || 'บันทึกไม่สำเร็จ') }
                            finally { setSrcLineSaving(false) }
                          }}
                          style={{ width: '100%', padding: '10px', borderRadius: 10, background: srcLineId === '__none__' ? '#dc2626' : '#16a34a', border: 'none', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: srcLineSaving ? 0.6 : 1 }}>
                          {srcLineSaving ? 'กำลังบันทึก...' : srcLineSaved ? '✓ บันทึกแล้ว' : srcLineId === '__none__' ? 'ยืนยันยกเลิกการเชื่อมต่อ' : 'บันทึกการเชื่อมต่อ LINE OA'}
                        </button>
                      )}

                      {/* Webhook URL - show when connected */}
                      {(() => {
                        const connectedId = srcLineSaved
                          ? (srcLineId === '__none__' ? '' : srcLineId)
                          : currentWs?.lineOaConfigId
                        const connectedCfg = lineConfigs.find(l => l.id === connectedId)
                        const webhookUrl = connectedCfg ? `${API_BASE}/api/line/webhook/${connectedCfg.id}` : ''
                        if (!webhookUrl) return null
                        return (
                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12, marginTop: 4 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="material-icons-round" style={{ fontSize: 14 }}>link</span>
                              Webhook URL — นำไปวางใน LINE OA Console
                            </p>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <code style={{ flex: 1, fontSize: 10, background: 'white', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 8px', color: '#166534', wordBreak: 'break-all' }}>
                                {webhookUrl}
                              </code>
                              <button type="button"
                                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                                style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 7, background: '#16a34a', border: 'none', color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                คัดลอก
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Future sources */}
              {[
                { icon: 'groups', label: 'Facebook Messenger', color: '#1877f2', badge: 'รอ Meta Review' },
                { icon: 'photo_camera', label: 'Instagram DM', color: '#e1306c', badge: 'รอ Meta Review' },
                { icon: 'table_chart', label: 'Google Sheets', color: '#0f9d58', badge: 'เร็วๆ นี้' },
                { icon: 'storefront', label: 'Shopee / TikTok Shop', color: '#ff6700', badge: 'เร็วๆ นี้' },
              ].map(src => (
                <div key={src.label} style={{ border: '2px solid #f1f5f9', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.45 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: src.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-icons-round" style={{ fontSize: 20, color: src.color }}>{src.icon}</span>
                  </div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#374151' }}>{src.label}</span>
                  <span style={{ fontSize: 11, background: '#f1f5f9', color: '#94a3b8', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>{src.badge}</span>
                </div>
              ))}

            </div>
          </div>
        </div>
      )}

      {/* ── Create Workspace Modal ── */}
      {showWsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800">เพิ่มธุรกิจใหม่</h2>
              <button onClick={() => setShowWsModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อธุรกิจ *</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="เช่น ร้านขายของ, ทีมขายภาคเหนือ"
                  value={wsForm.name} onChange={e => setWsForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">คำอธิบาย</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="อธิบายสั้นๆ"
                  value={wsForm.description} onChange={e => setWsForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">สี</label>
                <div className="flex gap-2 flex-wrap">
                  {WS_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setWsForm(f => ({ ...f, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: wsForm.color === c ? '3px solid #1e293b' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">ไอคอน</label>
                <div className="flex gap-2 flex-wrap">
                  {WS_ICONS.map(ic => (
                    <button key={ic} type="button" onClick={() => setWsForm(f => ({ ...f, icon: ic }))}
                      style={{ width: 36, height: 36, borderRadius: 8, background: wsForm.icon === ic ? wsForm.color : '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-icons-round" style={{ fontSize: 18, color: wsForm.icon === ic ? 'white' : '#64748b' }}>{ic}</span>
                    </button>
                  ))}
                </div>
              </div>
              {lineConfigs.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">เชื่อมต่อ LINE OA (optional)</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                    value={wsForm.lineOaConfigId}
                    onChange={e => setWsForm(f => ({ ...f, lineOaConfigId: e.target.value }))}>
                    <option value="">ไม่เชื่อมต่อ</option>
                    {lineConfigs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button onClick={() => setShowWsModal(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleSaveWs} disabled={wsSaving || !wsForm.name.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: wsForm.color }}>
                {wsSaving ? 'กำลังบันทึก...' : 'สร้างธุรกิจ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Create/Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800">{editTarget ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ *</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    placeholder="ชื่อลูกค้า" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ประเภท</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                    value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}>
                    <option value="B2C">B2C (บุคคล)</option>
                    <option value="B2B">B2B (องค์กร)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">บริษัท</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formData.company} onChange={e => setFormData(p => ({ ...p, company: e.target.value }))}
                    placeholder="ชื่อบริษัท (B2B)" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">อีเมล</label>
                  <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">เบอร์โทร</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                    placeholder="08x-xxx-xxxx" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">ที่อยู่</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formData.address} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                    placeholder="ที่อยู่" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tags (คั่นด้วยจุลภาค)</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={formData.tags} onChange={e => setFormData(p => ({ ...p, tags: e.target.value }))}
                    placeholder="VIP, นำเข้า, ขายส่ง" />
                </div>
                {segments.length > 0 && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-2">กลุ่มลูกค้า</label>
                    <div className="flex flex-wrap gap-2">
                      {segments.map(seg => {
                        const selected = formData.segmentIds.includes(seg.id)
                        return (
                          <button key={seg.id} type="button" onClick={() => toggleSegmentInForm(seg.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                            style={selected ? { background: seg.color, color: '#fff' } : { background: seg.color + '15', color: seg.color }}>
                            <span className="material-icons-round" style={{ fontSize: 12 }}>{seg.icon}</span>
                            {seg.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
                  <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    rows={3} value={formData.note} onChange={e => setFormData(p => ({ ...p, note: e.target.value }))}
                    placeholder="บันทึกเพิ่มเติม" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving || !formData.name.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: currentWs?.color || 'var(--primary, #7c3aed)' }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-2">ยืนยันการลบ</h2>
            <p className="text-sm text-gray-600 mb-6">ต้องการลบ <span className="font-medium">{deleteTarget.name}</span> ออกจากระบบหรือไม่?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">ยกเลิก</button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-500">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
