'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { workspaceApi } from '@/lib/api'
import { getSession } from '@/lib/auth'

const ICONS   = ['business', 'store', 'groups', 'apartment', 'factory', 'local_shipping', 'restaurant', 'spa', 'school', 'medical_services']
const COLORS  = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#9333ea', '#64748b', '#0f172a']

interface Workspace {
  id: string; name: string; description: string
  color: string; icon: string; lineOaConfigId: string
  memberUsernames: string[]; createdAt: string; createdBy: string
}

interface WsStat {
  workspaceId: string; name: string; color: string; icon: string
  lineOaConfigId: string; total: number; active: number; inactive: number
  b2c: number; b2b: number; lineCustomers: number; newThisMonth: number
}

interface Totals { total: number; active: number; inactive: number; b2c: number; newThisMonth: number }

const DEFAULT_FORM = { name: '', description: '', color: '#7c3aed', icon: 'business', lineOaConfigId: '', memberUsernames: [] as string[] }

export default function WorkspacesPage() {
  const router   = useRouter()
  const session  = getSession()
  const myRole   = session?.role ?? ''
  const canManage = ['admin', 'super_admin', 'it_manager', 'accounting_manager'].includes(myRole)
  const API_BASE  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [stats,      setStats]      = useState<WsStat[]>([])
  const [totals,     setTotals]     = useState<Totals | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  const [showModal,    setShowModal]    = useState(false)
  const [editTarget,   setEditTarget]   = useState<Workspace | null>(null)
  const [form,         setForm]         = useState({ ...DEFAULT_FORM })
  const [saving,       setSaving]       = useState(false)
  const [memberInput,  setMemberInput]  = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const token = session?.token ?? ''
      const [wsRes, stRes] = await Promise.all([
        workspaceApi.getAll() as Promise<{ workspaces: Workspace[] }>,
        fetch(`${API_BASE}/api/crm-workspaces/stats/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()),
      ])
      setWorkspaces(wsRes.workspaces || [])
      setStats(stRes.workspaces || [])
      setTotals(stRes.totals || null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally { setLoading(false) }
  }, [API_BASE, session?.token])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditTarget(null); setForm({ ...DEFAULT_FORM }); setMemberInput(''); setShowModal(true) }
  function openEdit(ws: Workspace) {
    setEditTarget(ws)
    setForm({ name: ws.name, description: ws.description || '', color: ws.color || '#7c3aed', icon: ws.icon || 'business', lineOaConfigId: ws.lineOaConfigId || '', memberUsernames: ws.memberUsernames || [] })
    setMemberInput(''); setShowModal(true)
  }
  function addMember() {
    const u = memberInput.trim()
    if (!u || form.memberUsernames.includes(u)) return
    setForm(f => ({ ...f, memberUsernames: [...f.memberUsernames, u] })); setMemberInput('')
  }
  function removeMember(u: string) { setForm(f => ({ ...f, memberUsernames: f.memberUsernames.filter(x => x !== u) })) }

  async function handleSave() {
    if (!form.name.trim()) { alert('กรุณาใส่ชื่อ Workspace'); return }
    setSaving(true)
    try {
      if (editTarget) { await workspaceApi.update(editTarget.id, form) }
      else { await workspaceApi.create(form) }
      setShowModal(false); load()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  async function handleDelete(ws: Workspace) {
    if (!confirm(`ลบ Workspace "${ws.name}" ?\nลูกค้าทั้งหมดใน workspace นี้จะถูกลบด้วย`)) return
    try { await workspaceApi.delete(ws.id); load() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'ลบไม่สำเร็จ') }
  }

  const getStat = (id: string) => stats.find(s => s.workspaceId === id)

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">CRM Workspaces</h1>
          <p className="text-sm text-slate-500 mt-1">ภาพรวมลูกค้าแยกตามแบรนด์/ธุรกิจ</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openCreate}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>add</span>
            สร้าง Workspace
          </button>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>}

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
        <>
          {/* ── Workspace Cards (แนวนอน) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            {workspaces.map(ws => {
              const st = getStat(ws.id)
              return (
                <div key={ws.id} style={{
                  background: 'white', borderRadius: 16, border: '1px solid #e2e8f0',
                  borderLeft: `5px solid ${ws.color || '#7c3aed'}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', padding: '18px 20px',
                  display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                }}>
                  {/* Icon + Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 180 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: `${ws.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-icons-round" style={{ fontSize: 24, color: ws.color || '#7c3aed' }}>{ws.icon || 'business'}</span>
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', margin: 0 }}>{ws.name}</p>
                      {ws.description && <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{ws.description}</p>}
                      {ws.lineOaConfigId && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                          <span className="material-icons-round" style={{ fontSize: 12 }}>chat_bubble</span>LINE OA
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ width: 1, height: 48, background: '#f1f5f9', flexShrink: 0 }} />

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: 24, flex: 1, flexWrap: 'wrap' }}>
                    <StatBox label="ลูกค้าทั้งหมด" value={st?.total ?? 0} icon="groups" color="#2563eb" />
                    <StatBox label="Follow (active)" value={st?.active ?? 0} icon="person_add" color="#16a34a" />
                    <StatBox label="Unfollow" value={st?.inactive ?? 0} icon="person_remove" color="#dc2626" />
                    <StatBox label="B2C" value={st?.b2c ?? 0} icon="face" color="#7c3aed" />
                    <StatBox label="ใหม่เดือนนี้" value={st?.newThisMonth ?? 0} icon="star" color="#d97706" />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button
                      onClick={() => router.push(`/customers?workspace=${ws.id}`)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'white', padding: '8px 16px', borderRadius: 10, background: ws.color || '#7c3aed', border: 'none', cursor: 'pointer' }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>people</span>
                      ดูลูกค้า
                    </button>
                    {canManage && (
                      <>
                        <button onClick={() => openEdit(ws)}
                          style={{ padding: '7px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', display: 'flex' }}>
                          <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
                        </button>
                        <button onClick={() => handleDelete(ws)}
                          style={{ padding: '7px', borderRadius: 9, background: '#fff1f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', display: 'flex' }}>
                          <span className="material-icons-round" style={{ fontSize: 16 }}>delete_outline</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Summary Bar ── */}
          {totals && (
            <div style={{ background: '#1e293b', borderRadius: 16, padding: '16px 24px', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
              <p style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, margin: 0, letterSpacing: 1 }}>รวมทุก Workspace</p>
              <SummaryItem label="ลูกค้าทั้งหมด" value={totals.total} color="#60a5fa" />
              <SummaryItem label="Active" value={totals.active} color="#4ade80" />
              <SummaryItem label="Unfollow" value={totals.inactive} color="#f87171" />
              <SummaryItem label="B2C" value={totals.b2c} color="#c084fc" />
              <SummaryItem label="ใหม่เดือนนี้" value={totals.newThisMonth} color="#fbbf24" />
            </div>
          )}
        </>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '100%', maxWidth: 520, boxShadow: '0 20px 80px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">{editTarget ? 'แก้ไข Workspace' : 'สร้าง Workspace ใหม่'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="form-label">ชื่อ Workspace *</label>
                <input type="text" className="form-input" placeholder="เช่น ปลาณีต, sniffy" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">คำอธิบาย</label>
                <input type="text" className="form-input" placeholder="อธิบายสั้นๆ" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">สี</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: form.color === c ? '3px solid #1e293b' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                  ))}
                </div>
              </div>
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
              <div>
                <label className="form-label">LINE OA Config ID (optional)</label>
                <input type="text" className="form-input" placeholder="ID จากหน้า Connections" value={form.lineOaConfigId}
                  onChange={e => setForm(f => ({ ...f, lineOaConfigId: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">สมาชิก (username)</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" className="form-input flex-1" placeholder="username" value={memberInput}
                    onChange={e => setMemberInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMember()} />
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

function StatBox({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 70 }}>
      <span className="material-icons-round" style={{ fontSize: 18, color, marginBottom: 2 }}>{icon}</span>
      <p style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1 }}>{value.toLocaleString()}</p>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, marginTop: 2, textAlign: 'center' }}>{label}</p>
    </div>
  )
}

function SummaryItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value.toLocaleString()}</p>
      <p style={{ fontSize: 11, color: '#64748b', margin: 0, marginTop: 2 }}>{label}</p>
    </div>
  )
}
