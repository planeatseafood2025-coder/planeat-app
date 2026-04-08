'use client'
import { useState, useEffect } from 'react'
import { segmentApi, workspaceApi } from '@/lib/api'
import type { CustomerSegment } from '@/types'

const COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#db2777', '#0891b2', '#65a30d', '#9333ea', '#475569',
]

const ICONS = [
  'label', 'star', 'favorite', 'bolt', 'diamond',
  'local_fire_department', 'workspace_premium', 'group', 'storefront', 'handshake',
]

interface Workspace { id: string; name: string }

export default function SegmentsPage() {
  const [workspaces, setWorkspaces]     = useState<Workspace[]>([])
  const [wsId, setWsId]                 = useState('')
  const [segments, setSegments]         = useState<CustomerSegment[]>([])
  const [loading, setLoading]           = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [editTarget, setEditTarget]     = useState<CustomerSegment | null>(null)
  const [saving, setSaving]             = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CustomerSegment | null>(null)
  const [formData, setFormData]         = useState({ name: '', description: '', color: '#7c3aed', icon: 'label' })

  useEffect(() => {
    workspaceApi.getAll().then((r: any) => {
      const ws = r.workspaces || []
      setWorkspaces(ws)
      if (ws.length > 0) setWsId(ws[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!wsId) return
    setLoading(true)
    segmentApi.getAll(wsId)
      .then((r: any) => setSegments(r.segments || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [wsId])

  function openCreate() {
    setEditTarget(null)
    setFormData({ name: '', description: '', color: '#7c3aed', icon: 'label' })
    setShowForm(true)
  }

  function openEdit(seg: CustomerSegment) {
    setEditTarget(seg)
    setFormData({ name: seg.name, description: seg.description || '', color: seg.color, icon: seg.icon })
    setShowForm(true)
  }

  async function handleSave() {
    if (!formData.name.trim() || !wsId) return
    setSaving(true)
    try {
      if (editTarget) {
        await segmentApi.update(wsId, editTarget.id, formData)
      } else {
        await segmentApi.create(wsId, formData)
      }
      setShowForm(false)
      const r = await segmentApi.getAll(wsId) as any
      setSegments(r.segments || [])
    } catch (e: any) {
      alert(e.message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget || !wsId) return
    try {
      await segmentApi.delete(wsId, deleteTarget.id)
      setDeleteTarget(null)
      const r = await segmentApi.getAll(wsId) as any
      setSegments(r.segments || [])
    } catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">กลุ่มลูกค้า (Segments)</h1>
          <p className="text-sm text-gray-500 mt-0.5">จัดกลุ่มลูกค้าเพื่อการติดตามและการตลาด</p>
        </div>
        <div className="flex gap-2 items-center">
          {workspaces.length > 1 && (
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={wsId}
              onChange={e => setWsId(e.target.value)}
            >
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <button
            onClick={openCreate}
            disabled={!wsId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--primary, #7c3aed)' }}
          >
            <span className="material-icons-round" style={{ fontSize: 16 }}>add</span>
            เพิ่มกลุ่ม
          </button>
        </div>
      </div>

      {/* No workspace */}
      {!wsId && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <span className="material-icons-round text-4xl block mb-2">workspaces</span>
          ยังไม่มี Workspace — กรุณาสร้าง Workspace ก่อน
        </div>
      )}

      {/* Segments Grid */}
      {wsId && (
        loading ? (
          <div className="text-center text-gray-400 py-12">กำลังโหลด...</div>
        ) : segments.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <span className="material-icons-round text-4xl block mb-2">label_off</span>
            ยังไม่มีกลุ่มลูกค้า — กดปุ่ม &quot;เพิ่มกลุ่ม&quot; เพื่อเริ่มต้น
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {segments.map(seg => (
              <div key={seg.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: seg.color + '20' }}
                  >
                    <span className="material-icons-round" style={{ color: seg.color, fontSize: 22 }}>{seg.icon}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(seg)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      title="แก้ไข"
                    >
                      <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(seg)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                      title="ลบ"
                    >
                      <span className="material-icons-round" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{seg.name}</h3>
                {seg.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{seg.description}</p>}
                <div className="flex items-center gap-1 mt-auto">
                  <span className="material-icons-round text-gray-400" style={{ fontSize: 14 }}>group</span>
                  <span className="text-xs text-gray-500">{seg.customerCount ?? 0} คน</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800">{editTarget ? 'แก้ไขกลุ่ม' : 'เพิ่มกลุ่มลูกค้า'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อกลุ่ม *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="เช่น ลูกค้า VIP, ลูกค้าใหม่"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">คำอธิบาย</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formData.description}
                  onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  placeholder="รายละเอียดกลุ่ม"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">สี</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData(p => ({ ...p, color: c }))}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{
                        background: c,
                        outline: formData.color === c ? `3px solid ${c}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">ไอคอน</label>
                <div className="flex flex-wrap gap-2">
                  {ICONS.map(ic => (
                    <button
                      key={ic}
                      onClick={() => setFormData(p => ({ ...p, icon: ic }))}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${formData.icon === ic ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      style={formData.icon === ic ? { background: formData.color } : {}}
                    >
                      <span className="material-icons-round" style={{ fontSize: 20 }}>{ic}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Preview */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: formData.color + '20' }}
                >
                  <span className="material-icons-round" style={{ color: formData.color, fontSize: 22 }}>{formData.icon}</span>
                </div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">{formData.name || 'ชื่อกลุ่ม'}</p>
                  <p className="text-xs text-gray-500">{formData.description || 'คำอธิบาย'}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >ยกเลิก</button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--primary, #7c3aed)' }}
              >{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-2">ยืนยันการลบกลุ่ม</h2>
            <p className="text-sm text-gray-600 mb-1">ต้องการลบกลุ่ม <span className="font-medium">{deleteTarget.name}</span> หรือไม่?</p>
            <p className="text-xs text-orange-600 mb-6">⚠️ ลูกค้าในกลุ่มนี้จะถูกถอดออกจากกลุ่มโดยอัตโนมัติ</p>
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
