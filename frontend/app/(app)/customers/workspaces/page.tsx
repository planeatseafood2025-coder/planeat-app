'use client'
import { useState, useEffect, useCallback } from 'react'
import { workspaceApi } from '@/lib/api'
import { getSession } from '@/lib/auth'

const ICONS = ['business', 'store', 'groups', 'apartment', 'factory', 'local_shipping', 'restaurant', 'spa', 'school', 'medical_services']
const COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#9333ea', '#64748b', '#0f172a']

interface Workspace {
  id: string
  name: string
  description: string
  color: string
  icon: string
  lineOaConfigId: string
  memberUsernames: string[]
  createdAt: string
  createdBy: string
}

const DEFAULT_FORM = {
  name: '', description: '', color: '#7c3aed', icon: 'business',
  lineOaConfigId: '', memberUsernames: [] as string[],
}

export default function WorkspacesPage() {
  const session = getSession()
  const myRole = session?.role ?? ''
  const canManage = ['admin', 'super_admin', 'it_manager', 'accounting_manager'].includes(myRole)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Workspace | null>(null)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [saving, setSaving] = useState(false)
  const [memberInput, setMemberInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await workspaceApi.getAll() as { workspaces: Workspace[] }
      setWorkspaces(res.workspaces || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditTarget(null)
    setForm({ ...DEFAULT_FORM })
    setMemberInput('')
    setShowModal(true)
  }

  function openEdit(ws: Workspace) {
    setEditTarget(ws)
    setForm({
      name: ws.name,
      description: ws.description || '',
      color: ws.color || '#7c3aed',
      icon: ws.icon || 'business',
      lineOaConfigId: ws.lineOaConfigId || '',
      memberUsernames: ws.memberUsernames || [],
    })
    setMemberInput('')
    setShowModal(true)
  }

  function addMember() {
    const u = memberInput.trim()
    if (!u || form.memberUsernames.includes(u)) return
    setForm(f => ({ ...f, memberUsernames: [...f.memberUsernames, u] }))
    setMemberInput('')
  }

  function removeMember(u: string) {
    setForm(f => ({ ...f, memberUsernames: f.memberUsernames.filter(x => x !== u) }))
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('กรุณาใส่ชื่อ Workspace'); return }
    setSaving(true)
    try {
      if (editTarget) {
        await workspaceApi.update(editTarget.id, form)
      } else {
        await workspaceApi.create(form)
      }
      setShowModal(false); load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  async function handleDelete(ws: Workspace) {
    if (!confirm(`ลบ Workspace "${ws.name}" ?\nลูกค้าทั้งหมดใน workspace นี้จะถูกลบด้วย`)) return
    try {
      await workspaceApi.delete(ws.id)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    }
  }

  return (
    <div className="page-wrapper">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">CRM Workspaces</h1>
          <p className="text-sm text-slate-500 mt-1">จัดการกลุ่มธุรกิจ / ทีมขาย แยกข้อมูลลูกค้าตามหน่วยงาน</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openCreate}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>add</span>
            สร้าง Workspace
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <span className="material-icons-round" style={{ fontSize: 40 }}>hourglass_empty</span>
          <p className="mt-2 text-sm">กำลังโหลด...</p>
        </div>
      ) : workspaces.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '2px dashed #e2e8f0', borderRadius: 16 }}>
          <span className="material-icons-round" style={{ fontSize: 48, color: '#cbd5e1' }}>business</span>
          <p className="mt-3 font-semibold text-slate-600">ยังไม่มี Workspace</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">สร้าง Workspace เพื่อเริ่มจัดการข้อมูลลูกค้า</p>
          {canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <span className="material-icons-round" style={{ fontSize: 18 }}>add</span>
              สร้าง Workspace แรก
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {workspaces.map(ws => (
            <div key={ws.id} className="card hover:border-blue-200 transition-colors" style={{ borderLeft: `4px solid ${ws.color || '#7c3aed'}` }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${ws.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 22, color: ws.color || '#7c3aed' }}>{ws.icon || 'business'}</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>{ws.name}</p>
                    {ws.description && <p className="text-xs text-slate-500 mt-0.5">{ws.description}</p>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(ws)}
                      style={{ padding: '5px', borderRadius: 7, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', display: 'flex' }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button onClick={() => handleDelete(ws)}
                      style={{ padding: '5px', borderRadius: 7, background: '#fff1f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', display: 'flex' }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>delete_outline</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="material-icons-round" style={{ fontSize: 14 }}>people</span>
                    {(ws.memberUsernames || []).length} สมาชิก
                  </span>
                  {ws.lineOaConfigId && (
                    <span className="flex items-center gap-1" style={{ color: '#16a34a' }}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>chat_bubble</span>
                      ผูก LINE OA
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <a href={`/customers?workspace=${ws.id}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: ws.color || '#7c3aed', textDecoration: 'none', padding: '6px 14px', borderRadius: 8, background: `${ws.color}15`, border: `1px solid ${ws.color}30` }}>
                    <span className="material-icons-round" style={{ fontSize: 14 }}>open_in_new</span>
                    ดูลูกค้า
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '100%', maxWidth: 520, boxShadow: '0 20px 80px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">
                {editTarget ? 'แก้ไข Workspace' : 'สร้าง Workspace ใหม่'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="form-label">ชื่อ Workspace *</label>
                <input type="text" className="form-input" placeholder="เช่น ทีมขายภาคเหนือ" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div>
                <label className="form-label">คำอธิบาย</label>
                <input type="text" className="form-input" placeholder="อธิบายสั้นๆ" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              {/* Color picker */}
              <div>
                <label className="form-label">สี</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: form.color === c ? '3px solid #1e293b' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                  ))}
                </div>
              </div>

              {/* Icon picker */}
              <div>
                <label className="form-label">ไอคอน</label>
                <div className="flex gap-2 flex-wrap">
                  {ICONS.map(ic => (
                    <button key={ic} type="button" onClick={() => setForm(f => ({ ...f, icon: ic }))}
                      style={{ width: 38, height: 38, borderRadius: 9, background: form.icon === ic ? form.color : '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-icons-round" style={{ fontSize: 20, color: form.icon === ic ? 'white' : '#64748b' }}>{ic}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* LINE OA Config ID */}
              <div>
                <label className="form-label">LINE OA Config ID (optional)</label>
                <input type="text" className="form-input" placeholder="ID จากหน้า IT Access → การเชื่อมต่อ" value={form.lineOaConfigId}
                  onChange={e => setForm(f => ({ ...f, lineOaConfigId: e.target.value }))} />
              </div>

              {/* Members */}
              <div>
                <label className="form-label">สมาชิก (username)</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" className="form-input flex-1" placeholder="username"
                    value={memberInput} onChange={e => setMemberInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addMember()} />
                  <button type="button" className="btn-secondary" onClick={addMember} style={{ padding: '0 14px' }}>เพิ่ม</button>
                </div>
                {form.memberUsernames.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {form.memberUsernames.map(u => (
                      <span key={u} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#f1f5f9', borderRadius: 20, fontSize: 12, color: '#475569' }}>
                        {u}
                        <button type="button" onClick={() => removeMember(u)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}>
                          <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>ตัวอย่าง</p>
                <div className="flex items-center gap-3">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${form.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 20, color: form.color }}>{form.icon}</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800" style={{ fontSize: 14 }}>{form.name || 'ชื่อ Workspace'}</p>
                    {form.description && <p style={{ fontSize: 12, color: '#64748b' }}>{form.description}</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => setShowModal(false)}>ยกเลิก</button>
              <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>save</span>
                {saving ? 'กำลังบันทึก...' : editTarget ? 'บันทึก' : 'สร้าง Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
