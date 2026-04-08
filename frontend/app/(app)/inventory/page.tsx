'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSession } from '@/lib/auth'
import { warehouseApi, inventoryApi } from '@/lib/api'
import type {
  User, Warehouse, InventoryItem, InventoryTransaction,
  InventorySummary, TxType,
} from '@/types'

// ─── Constants ───────────────────────────────────────────────────────────────
const CATEGORIES = ['วัตถุดิบ', 'บรรจุภัณฑ์', 'เคมีภัณฑ์', 'อุปกรณ์/เครื่องมือ', 'อะไหล่เครื่องจักร', 'อื่นๆ']
const PRESET_UNITS = ['กิโลกรัม', 'กรัม', 'ลิตร', 'มิลลิลิตร', 'ชิ้น', 'กระป๋อง', 'ถุง', 'ซอง', 'กล่อง', 'ลัง', 'ม้วน', 'เมตร', 'แผ่น', 'ชุด', 'แพ็ค', 'โหล', 'อื่นๆ']
const SESSION_KEY = 'planeat_warehouse'

const WH_COLORS = [
  { color: '#1e3a8a', bg: '#dbeafe', label: 'น้ำเงิน' },
  { color: '#065f46', bg: '#d1fae5', label: 'เขียว' },
  { color: '#0e7490', bg: '#cffafe', label: 'ฟ้า' },
  { color: '#6d28d9', bg: '#ede9fe', label: 'ม่วง' },
  { color: '#9a3412', bg: '#fed7aa', label: 'ส้ม' },
  { color: '#be185d', bg: '#fce7f3', label: 'ชมพู' },
  { color: '#374151', bg: '#f3f4f6', label: 'เทา' },
  { color: '#b45309', bg: '#fef3c7', label: 'เหลือง' },
]
const WH_ICONS = ['warehouse', 'business', 'set_meal', 'agriculture', 'pets', 'inventory_2', 'local_shipping', 'store', 'factory', 'science']

const TX_INFO: Record<TxType, { label: string; color: string; bg: string; icon: string }> = {
  receive: { label: 'รับเข้า',  color: '#059669', bg: '#d1fae5', icon: 'add_circle' },
  issue:   { label: 'เบิกออก', color: '#dc2626', bg: '#fee2e2', icon: 'remove_circle' },
  adjust:  { label: 'ปรับยอด', color: '#d97706', bg: '#fef3c7', icon: 'tune' },
}

type MainTab = 'overview' | 'items' | 'receive' | 'issue' | 'history'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtNum(n: number, d = 2) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtDate(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}
function stockStatus(item: InventoryItem) {
  if (item.currentStock === 0) return 'out'
  if (item.minStock > 0 && item.currentStock <= item.minStock) return 'low'
  return 'ok'
}

// ─── Export helpers ───────────────────────────────────────────────────────────
async function exportPDF(items: InventoryItem[], whName: string, title: string) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const date = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' })

  doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text(`${whName} — ${title}`, 148, 14, { align: 'center' })
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`วันที่พิมพ์: ${date}  |  รายการ: ${items.length}  |  มูลค่ารวม: ${items.reduce((s, i) => s + i.currentStock * i.unitCost, 0).toLocaleString()} บาท`, 148, 21, { align: 'center' })

  autoTable(doc, {
    startY: 26,
    head: [['รหัส', 'ชื่อสินค้า', 'หมวดหมู่', 'หน่วย', 'คงเหลือ', 'จุดสั่งซื้อ', 'ราคา/หน่วย', 'มูลค่ารวม', 'ที่เก็บ', 'สถานะ']],
    body: items.map(i => [
      i.code, i.name, i.category, i.unit,
      fmtNum(i.currentStock, 0), fmtNum(i.minStock, 0),
      fmtNum(i.unitCost), fmtNum(i.currentStock * i.unitCost),
      i.location || '-',
      i.currentStock === 0 ? 'หมด' : i.minStock > 0 && i.currentStock <= i.minStock ? 'ใกล้หมด' : 'ปกติ',
    ]),
    foot: [['', '', '', 'รวม', '', '', '', fmtNum(items.reduce((s, i) => s + i.currentStock * i.unitCost, 0)), '', '']],
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  })
  doc.save(`inventory_${whName}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

async function exportExcel(items: InventoryItem[], whName: string) {
  const XLSX = await import('xlsx')
  const data = items.map(i => ({
    'รหัสสินค้า': i.code,
    'ชื่อสินค้า': i.name,
    'หมวดหมู่': i.category,
    'หน่วย': i.unit,
    'คงเหลือ': i.currentStock,
    'จุดสั่งซื้อ': i.minStock,
    'ราคา/หน่วย (บาท)': i.unitCost,
    'มูลค่ารวม (บาท)': i.currentStock * i.unitCost,
    'สถานที่เก็บ': i.location || '',
    'สถานะ': i.currentStock === 0 ? 'หมด' : i.minStock > 0 && i.currentStock <= i.minStock ? 'ใกล้หมด' : 'ปกติ',
    'หมายเหตุ': i.note || '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'คลังสินค้า')
  XLSX.writeFile(wb, `inventory_${whName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: Warehouse Selection
// ════════════════════════════════════════════════════════════════════════════
function WarehouseSelect({
  warehouses, loading, onSelect, isAdmin, onManage,
}: {
  warehouses: Warehouse[]; loading: boolean; onSelect: (w: Warehouse) => void
  isAdmin: boolean; onManage: () => void
}) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#dbeafe' }}>
        <span className="material-icons-round text-blue-800" style={{ fontSize: 30 }}>warehouse</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">เลือกคลังสินค้า</h1>
      <p className="text-sm text-slate-500 mb-8">กรุณาเลือกคลังที่ต้องการจัดการ</p>

      {loading ? (
        <span className="material-icons-round spin text-blue-500" style={{ fontSize: 36 }}>refresh</span>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
            {warehouses.map(wh => (
              <button key={wh.id} onClick={() => onSelect(wh)}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all hover:scale-105 hover:shadow-lg"
                style={{ background: wh.bg, borderColor: `${wh.color}40` }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: wh.color }}>
                  <span className="material-icons-round text-white" style={{ fontSize: 28 }}>{wh.icon}</span>
                </div>
                <div className="text-center">
                  <p className="font-bold text-lg" style={{ color: wh.color }}>{wh.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{wh.desc}</p>
                </div>
              </button>
            ))}
          </div>
          {isAdmin && (
            <button onClick={onManage}
              className="mt-8 flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
              <span className="material-icons-round" style={{ fontSize: 16 }}>settings</span>
              จัดการคลังสินค้า
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WAREHOUSE MANAGE MODAL
// ════════════════════════════════════════════════════════════════════════════
function WarehouseManageModal({
  warehouses, onClose, onRefresh,
}: { warehouses: Warehouse[]; onClose: () => void; onRefresh: () => void }) {
  const emptyForm = { name: '', pin: '', pinConfirm: '', color: WH_COLORS[0].color, bg: WH_COLORS[0].bg, icon: WH_ICONS[0], desc: '', imageUrl: '' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  // delete confirm
  const [deletingWh, setDeletingWh] = useState<Warehouse | null>(null)
  const [deletePin, setDeletePin] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  function selectColor(c: typeof WH_COLORS[0]) { setForm(f => ({ ...f, color: c.color, bg: c.bg })) }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) { setError('รูปภาพต้องไม่เกิน 500 KB'); return }
    const reader = new FileReader()
    reader.onload = () => setForm(f => ({ ...f, imageUrl: reader.result as string, icon: '' }))
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('กรุณากรอกชื่อคลัง'); return }
    if (!editingId) {
      if (!form.pin) { setError('กรุณาตั้ง PIN'); return }
      if (form.pin.length < 4) { setError('PIN ต้องมีอย่างน้อย 4 ตัว'); return }
      if (form.pin !== form.pinConfirm) { setError('PIN ยืนยันไม่ตรงกัน'); return }
    }
    setSaving(true); setError('')
    try {
      const payload = editingId
        ? { name: form.name, color: form.color, bg: form.bg, icon: form.icon, desc: form.desc, imageUrl: form.imageUrl }
        : { name: form.name, pin: form.pin, color: form.color, bg: form.bg, icon: form.icon, desc: form.desc, imageUrl: form.imageUrl }
      const res = editingId
        ? await warehouseApi.updateWarehouse(editingId, payload) as { success: boolean; message?: string }
        : await warehouseApi.createWarehouse(payload) as { success: boolean; message?: string }
      if (res.success) {
        setSuccess(editingId ? 'อัปเดตคลังสำเร็จ' : 'สร้างคลังสำเร็จ')
        setEditingId(null); setForm(emptyForm); onRefresh()
        setTimeout(() => setSuccess(''), 2500)
      } else setError(res.message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deletingWh || !deletePin) { setDeleteError('กรุณาใส่ PIN'); return }
    setDeleting(true); setDeleteError('')
    try {
      // ตรวจ PIN ก่อน
      const verify = await warehouseApi.verifyPin(deletingWh.id, deletePin) as { success: boolean; message?: string }
      if (!verify.success) { setDeleteError('PIN ไม่ถูกต้อง'); return }
      const res = await warehouseApi.deleteWarehouse(deletingWh.id) as { success: boolean; message?: string }
      if (res.success) {
        setSuccess('ลบคลังสำเร็จ'); setDeletingWh(null); setDeletePin(''); onRefresh()
        setTimeout(() => setSuccess(''), 2500)
      } else setDeleteError(res.message || 'เกิดข้อผิดพลาด')
    } finally { setDeleting(false) }
  }

  function startEdit(wh: Warehouse) {
    setEditingId(wh.id)
    setForm({ name: wh.name, pin: '', pinConfirm: '', color: wh.color, bg: wh.bg, icon: wh.icon, desc: wh.desc, imageUrl: (wh as Warehouse & { imageUrl?: string }).imageUrl || '' })
    setError('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="material-icons-round text-blue-600" style={{ fontSize: 20 }}>settings</span>
            จัดการคลังสินค้า
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <span className="material-icons-round" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && <div className="p-3 rounded-xl text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>}
          {success && <div className="p-3 rounded-xl text-sm text-green-700" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>{success}</div>}

          {/* Form */}
          <div className="p-4 rounded-xl space-y-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h4 className="font-semibold text-slate-700 text-sm">{editingId ? 'แก้ไขคลัง' : 'สร้างคลังใหม่'}</h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">ชื่อคลัง *</label>
                <input className="form-input" placeholder="เช่น คลังวัตถุดิบ A"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">คำอธิบาย</label>
                <input className="form-input" placeholder="เช่น คลังเก็บวัตถุดิบหลัก"
                  value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
              </div>
              {!editingId && (
                <>
                  <div>
                    <label className="form-label">PIN *</label>
                    <input type="password" className="form-input" placeholder="ความยาวขั้นต่ำ 4 ตัว"
                      value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">ยืนยัน PIN *</label>
                    <input type="password" className="form-input" placeholder="กรอก PIN อีกครั้ง"
                      value={form.pinConfirm} onChange={e => setForm(f => ({ ...f, pinConfirm: e.target.value }))} />
                  </div>
                </>
              )}
            </div>

            {/* Image upload */}
            <div>
              <label className="form-label">โลโก้ / รูปภาพ (ไม่บังคับ, ≤500 KB)</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
                  <span className="material-icons-round" style={{ fontSize: 16 }}>upload</span>
                  เลือกรูป
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
                </label>
                {form.imageUrl && (
                  <>
                    <img src={form.imageUrl} alt="preview" className="w-10 h-10 rounded-xl object-cover border" />
                    <button onClick={() => setForm(f => ({ ...f, imageUrl: '', icon: WH_ICONS[0] }))}
                      className="text-xs text-red-400 hover:text-red-600">ลบรูป</button>
                  </>
                )}
              </div>
            </div>

            {/* Icon (ถ้าไม่มีรูป) */}
            {!form.imageUrl && (
              <div>
                <label className="form-label">ไอคอน</label>
                <div className="flex flex-wrap gap-2">
                  {WH_ICONS.map(icon => (
                    <button key={icon} onClick={() => setForm(f => ({ ...f, icon }))}
                      className="w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all"
                      style={form.icon === icon ? { borderColor: form.color, background: form.bg } : { borderColor: '#e2e8f0' }}>
                      <span className="material-icons-round" style={{ fontSize: 18, color: form.icon === icon ? form.color : '#64748b' }}>{icon}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Colors */}
            <div>
              <label className="form-label">ธีมสี</label>
              <div className="flex flex-wrap gap-2">
                {WH_COLORS.map(c => (
                  <button key={c.color} onClick={() => selectColor(c)} title={c.label}
                    className="w-8 h-8 rounded-full border-4 transition-all"
                    style={{ background: c.color, borderColor: form.color === c.color ? '#0f172a' : 'transparent' }} />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: form.bg }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: form.imageUrl ? 'transparent' : form.color }}>
                {form.imageUrl
                  ? <img src={form.imageUrl} alt="logo" className="w-full h-full object-cover rounded-xl" />
                  : <span className="material-icons-round text-white" style={{ fontSize: 20 }}>{form.icon}</span>}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: form.color }}>{form.name || 'ชื่อคลัง'}</p>
                <p className="text-xs text-slate-500">{form.desc || 'คำอธิบาย'}</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              {editingId && (
                <button onClick={() => { setEditingId(null); setForm(emptyForm); setError('') }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
              )}
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? 'กำลังบันทึก...' : editingId ? 'อัปเดต' : 'สร้างคลัง'}
              </button>
            </div>
          </div>

          {/* List */}
          <div>
            <h4 className="font-semibold text-slate-700 text-sm mb-3">คลังสินค้าทั้งหมด ({warehouses.length})</h4>
            <div className="space-y-2">
              {warehouses.map(wh => {
                const imgUrl = (wh as Warehouse & { imageUrl?: string }).imageUrl
                return (
                  <div key={wh.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: imgUrl ? 'transparent' : wh.color }}>
                      {imgUrl
                        ? <img src={imgUrl} alt={wh.name} className="w-full h-full object-cover rounded-xl" />
                        : <span className="material-icons-round text-white" style={{ fontSize: 18 }}>{wh.icon}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800">{wh.name}</p>
                      <p className="text-xs text-slate-400">{wh.desc || '-'}</p>
                    </div>
                    <button onClick={() => startEdit(wh)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500">
                      <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button onClick={() => { setDeletingWh(wh); setDeletePin(''); setDeleteError('') }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                      <span className="material-icons-round" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      {deletingWh && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#fee2e2' }}>
                <span className="material-icons-round text-red-500" style={{ fontSize: 22 }}>warning</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-800">ยืนยันการลบคลัง</h3>
                <p className="text-sm text-slate-500">"{deletingWh.name}"</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              ⚠️ คลังต้องไม่มีสินค้าค้างอยู่ และต้องใส่ PIN คลังเพื่อยืนยัน
            </p>
            {deleteError && <p className="text-sm text-red-600 font-medium">{deleteError}</p>}
            <div>
              <label className="form-label">PIN ของคลัง "{deletingWh.name}"</label>
              <input type="password" className="form-input" placeholder="กรอก PIN เพื่อยืนยันการลบ"
                value={deletePin} onChange={e => setDeletePin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmDelete()} autoFocus />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeletingWh(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
              <button onClick={confirmDelete} disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#dc2626', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: PIN Entry Modal
// ════════════════════════════════════════════════════════════════════════════
function PINModal({
  warehouse, onSuccess, onCancel,
}: { warehouse: Warehouse; onSuccess: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function verify() {
    if (pin.length < 4) { setError('กรุณากรอก PIN อย่างน้อย 4 หลัก'); return }
    setLoading(true); setError('')
    try {
      const res = await warehouseApi.verifyPin(warehouse.id, pin) as { success: boolean; message?: string }
      if (res.success) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: warehouse.id, name: warehouse.name, color: warehouse.color, bg: warehouse.bg, icon: warehouse.icon, desc: warehouse.desc }))
        onSuccess()
      } else {
        setError(res.message || 'PIN ไม่ถูกต้อง')
        setPin('')
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) { if (e.key === 'Enter') verify() }

  // Numpad keys
  function pressNum(n: string) {
    if (pin.length < 8) setPin(p => p + n)
  }
  function pressBack() { setPin(p => p.slice(0, -1)) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center" style={{ background: warehouse.bg }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: warehouse.color }}>
            <span className="material-icons-round text-white" style={{ fontSize: 28 }}>{warehouse.icon}</span>
          </div>
          <h2 className="font-bold text-lg" style={{ color: warehouse.color }}>{warehouse.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">กรอกรหัส PIN เพื่อเข้าสู่ระบบ</p>
        </div>

        <div className="p-5">
          {/* PIN dots */}
          <div className="flex justify-center gap-3 mb-4">
            {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
              <div key={i} className="w-4 h-4 rounded-full transition-colors"
                style={{ background: i < pin.length ? warehouse.color : '#e2e8f0' }} />
            ))}
          </div>

          {error && (
            <p className="text-center text-sm text-red-600 mb-3 font-medium">{error}</p>
          )}

          {/* Hidden real input for keyboard support */}
          <input
            type="password" inputMode="numeric" pattern="[0-9]*"
            className="sr-only" value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={handleKey} autoFocus
          />

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
              <button key={i} disabled={k === ''}
                onClick={() => k === '⌫' ? pressBack() : k !== '' ? pressNum(k) : undefined}
                className="h-12 rounded-xl text-lg font-semibold transition-colors"
                style={k === '' ? { visibility: 'hidden' } :
                  k === '⌫' ? { background: '#fee2e2', color: '#dc2626' } :
                  { background: '#f8fafc', color: '#1e293b' }}>
                {k}
              </button>
            ))}
          </div>

          <button onClick={verify} disabled={loading || pin.length < 4}
            className="w-full py-3 rounded-xl font-bold text-white transition-opacity"
            style={{ background: warehouse.color, opacity: pin.length < 4 ? 0.5 : 1 }}>
            {loading
              ? <span className="material-icons-round spin" style={{ fontSize: 18 }}>refresh</span>
              : 'เข้าสู่คลังสินค้า'}
          </button>

          <button onClick={onCancel}
            className="w-full mt-2 py-2 text-sm text-slate-400 hover:text-slate-600">
            เปลี่ยนคลัง
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: Main Inventory Dashboard
// ════════════════════════════════════════════════════════════════════════════
function MainInventory({ warehouse, user, onExit }: {
  warehouse: Warehouse; user: User; onExit: () => void
}) {
  const [tab, setTab] = useState<MainTab>('overview')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [loading, setLoading] = useState(true)

  // items tab
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // movements tab
  const [txSearch, setTxSearch] = useState('')
  const [txTypeFilter, setTxTypeFilter] = useState('')

  // item modal
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [itemForm, setItemForm] = useState<Partial<InventoryItem>>({})
  const [itemSaving, setItemSaving] = useState(false)
  const [itemError, setItemError] = useState('')

  // stock movement modal
  const [showTxModal, setShowTxModal] = useState(false)
  const [txModalType, setTxModalType] = useState<TxType>('receive')
  const [txItem, setTxItem] = useState<InventoryItem | null>(null)
  const [txForm, setTxForm] = useState({ quantity: 0, unitCost: 0, reference: '', note: '' })
  const [txSaving, setTxSaving] = useState(false)
  const [txError, setTxError] = useState('')

  // edit transaction modal
  const [editingTx, setEditingTx] = useState<InventoryTransaction | null>(null)
  const [editTxForm, setEditTxForm] = useState({ type: 'receive' as TxType, quantity: 0, unitCost: 0, reference: '', note: '' })
  const [editTxSaving, setEditTxSaving] = useState(false)
  const [editTxError, setEditTxError] = useState('')

  // custom unit
  const [customUnit, setCustomUnit] = useState('')

  // inline quick-form (รับเข้า / เบิก-จ่าย tabs)
  const [qItemId, setQItemId] = useState('')
  const [qQty, setQQty] = useState('')
  const [qRef, setQRef] = useState('')
  const [qNote, setQNote] = useState('')
  const [qCost, setQCost] = useState('')
  const [qSaving, setQSaving] = useState(false)
  const [qError, setQError] = useState('')
  const [qSuccess, setQSuccess] = useState('')

  const canEdit = user.role === 'admin' || user.role === 'accountant'

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [ir, tr, sr] = await Promise.all([
        inventoryApi.getItems(warehouse.id) as Promise<{ success: boolean; items: InventoryItem[] }>,
        inventoryApi.getTransactions(warehouse.id) as Promise<{ success: boolean; transactions: InventoryTransaction[] }>,
        inventoryApi.getSummary(warehouse.id) as Promise<{ success: boolean; summary: InventorySummary }>,
      ])
      if (ir.success) setItems(ir.items)
      if (tr.success) setTransactions(tr.transactions)
      if (sr.success) setSummary(sr.summary)
    } finally { setLoading(false) }
  }, [warehouse.id])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── Filtered items ──────────────────────────────────────────
  const filteredItems = items.filter(i => {
    if (search && !i.code.toLowerCase().includes(search.toLowerCase()) &&
        !i.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCat && i.category !== filterCat) return false
    const st = stockStatus(i)
    if (filterStatus === 'ok' && st !== 'ok') return false
    if (filterStatus === 'low' && st !== 'low') return false
    if (filterStatus === 'out' && st !== 'out') return false
    return true
  })

  const filteredTx = transactions.filter(t => {
    if (txSearch && !t.itemCode.toLowerCase().includes(txSearch.toLowerCase()) &&
        !t.itemName.toLowerCase().includes(txSearch.toLowerCase()) &&
        !t.reference.toLowerCase().includes(txSearch.toLowerCase())) return false
    if (txTypeFilter && t.type !== txTypeFilter) return false
    return true
  })

  // ─── Select helpers ──────────────────────────────────────────
  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length
  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filteredItems.map(i => i.id)))
  }
  function toggleOne(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ─── Export ──────────────────────────────────────────────────
  function getExportItems() {
    return selectedIds.size > 0 ? items.filter(i => selectedIds.has(i.id)) : filteredItems
  }
  function handleExportPDF() { exportPDF(getExportItems(), warehouse.name, selectedIds.size > 0 ? `รายการที่เลือก (${selectedIds.size})` : 'รายการทั้งหมด') }
  function handleExportExcel() { exportExcel(getExportItems(), warehouse.name) }

  // ─── Item CRUD ────────────────────────────────────────────────
  function openAdd() {
    setEditingItem(null)
    setItemForm({ category: CATEGORIES[0], unit: PRESET_UNITS[0], currentStock: 0, minStock: 0, unitCost: 0, location: '', note: '' })
    setItemError(''); setShowItemModal(true)
  }
  function openEdit(item: InventoryItem) {
    setEditingItem(item); setItemForm({ ...item }); setItemError(''); setShowItemModal(true)
  }
  async function saveItem() {
    if (!itemForm.code?.trim()) { setItemError('กรุณากรอกรหัสสินค้า'); return }
    if (!itemForm.name?.trim()) { setItemError('กรุณากรอกชื่อสินค้า'); return }
    setItemSaving(true); setItemError('')
    try {
      const res = editingItem
        ? await inventoryApi.updateItem(editingItem.id, { ...itemForm, username: user.username }) as { success: boolean; message?: string }
        : await inventoryApi.createItem({ ...itemForm, warehouseId: warehouse.id, username: user.username }) as { success: boolean; message?: string }
      if (res.success) { setShowItemModal(false); await loadAll() }
      else setItemError(res.message || 'เกิดข้อผิดพลาด')
    } catch (e: unknown) { setItemError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด') }
    finally { setItemSaving(false) }
  }
  async function deleteItem(item: InventoryItem) {
    if (!confirm(`ลบ "${item.name}" ออกจากระบบ?\nประวัติการเคลื่อนไหวจะถูกลบด้วย`)) return
    await inventoryApi.deleteItem(item.id); await loadAll()
  }

  // ─── Edit / Delete transaction ────────────────────────────────
  function openEditTx(tx: InventoryTransaction) {
    setEditingTx(tx)
    setEditTxForm({ type: tx.type, quantity: tx.quantity, unitCost: tx.unitCost, reference: tx.reference, note: tx.note })
    setEditTxError('')
  }
  async function saveEditTx() {
    if (!editingTx) return
    if (editTxForm.quantity <= 0) { setEditTxError('จำนวนต้องมากกว่า 0'); return }
    setEditTxSaving(true); setEditTxError('')
    try {
      const res = await inventoryApi.editTransaction(editingTx.id, { ...editTxForm, username: user.username }) as { success: boolean; message?: string }
      if (res.success) { setEditingTx(null); await loadAll() }
      else setEditTxError(res.message || 'เกิดข้อผิดพลาด')
    } catch (e: unknown) { setEditTxError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด') }
    finally { setEditTxSaving(false) }
  }
  async function handleDeleteTx(tx: InventoryTransaction) {
    if (!confirm(`ลบรายการ "${TX_INFO[tx.type].label}" ${tx.quantity} ${tx.itemName}?\nสต็อกจะถูก reverse กลับอัตโนมัติ`)) return
    const res = await inventoryApi.deleteTransaction(tx.id) as { success: boolean; message?: string }
    if (res.success) await loadAll()
    else alert(res.message || 'เกิดข้อผิดพลาด')
  }

  // ─── Stock movement (from items table) ───────────────────────
  function openTxModal(item: InventoryItem, type: TxType) {
    setTxItem(item); setTxModalType(type)
    setTxForm({ quantity: 0, unitCost: item.unitCost, reference: '', note: '' })
    setTxError(''); setShowTxModal(true)
  }
  async function saveTxModal() {
    if (!txItem) return
    if (txForm.quantity <= 0) { setTxError('จำนวนต้องมากกว่า 0'); return }
    setTxSaving(true); setTxError('')
    try {
      const res = await inventoryApi.createTransaction({
        itemId: txItem.id, type: txModalType, ...txForm, username: user.username,
      }) as { success: boolean; message?: string }
      if (res.success) { setShowTxModal(false); await loadAll() }
      else setTxError(res.message || 'เกิดข้อผิดพลาด')
    } catch (e: unknown) { setTxError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด') }
    finally { setTxSaving(false) }
  }

  // ─── Quick form (รับเข้า / เบิก-จ่าย tabs) ─────────────────
  async function submitQuick(type: TxType) {
    if (!qItemId) { setQError('กรุณาเลือกสินค้า'); return }
    const qty = parseFloat(qQty)
    if (!qty || qty <= 0) { setQError('จำนวนต้องมากกว่า 0'); return }
    setQSaving(true); setQError(''); setQSuccess('')
    try {
      const res = await inventoryApi.createTransaction({
        itemId: qItemId, type,
        quantity: qty,
        unitCost: parseFloat(qCost) || 0,
        reference: qRef, note: qNote,
        username: user.username,
      }) as { success: boolean; message?: string }
      if (res.success) {
        setQSuccess('บันทึกสำเร็จ'); setQItemId(''); setQQty(''); setQRef(''); setQNote(''); setQCost('')
        await loadAll()
        setTimeout(() => setQSuccess(''), 3000)
      } else setQError(res.message || 'เกิดข้อผิดพลาด')
    } catch (e: unknown) { setQError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด') }
    finally { setQSaving(false) }
  }

  // ─── Status badge ─────────────────────────────────────────────
  function StockBadge({ item }: { item: InventoryItem }) {
    const st = stockStatus(item)
    const styles = { out: ['#fee2e2','#dc2626','หมด'], low: ['#fef3c7','#d97706','ใกล้หมด'], ok: ['#d1fae5','#059669','ปกติ'] }
    const [bg, color, label] = styles[st]
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: bg, color }}>{label}</span>
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <span className="material-icons-round spin text-blue-500" style={{ fontSize: 40 }}>refresh</span>
    </div>
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: warehouse.color }}>
            <span className="material-icons-round text-white" style={{ fontSize: 20 }}>{warehouse.icon}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{warehouse.name}</h1>
            <p className="text-xs text-slate-500">{warehouse.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button className="btn-primary" onClick={openAdd}>
              <span className="material-icons-round" style={{ fontSize: 16 }}>add</span>เพิ่มสินค้า
            </button>
          )}
          <button onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
            <span className="material-icons-round" style={{ fontSize: 16 }}>swap_horiz</span>เปลี่ยนคลัง
          </button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
        {([
          { key: 'overview', label: 'ภาพรวม',      icon: 'dashboard' },
          { key: 'items',    label: 'รายการสินค้า', icon: 'inventory_2' },
          { key: 'receive',  label: 'รับเข้า',      icon: 'add_circle' },
          { key: 'issue',    label: 'เบิก-จ่าย',   icon: 'remove_circle' },
          { key: 'history',  label: 'ประวัติ',      icon: 'history' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={tab === t.key
              ? { background: '#fff', color: warehouse.color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: '#64748b' }}>
            <span className="material-icons-round" style={{ fontSize: 15 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB: ภาพรวม
      ══════════════════════════════════════════════════════════ */}
      {tab === 'overview' && summary && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {[
              { icon: 'inventory_2',        label: 'รายการสินค้าทั้งหมด', value: `${summary.totalItems} รายการ`,  color: warehouse.color, bg: warehouse.bg },
              { icon: 'account_balance',    label: 'มูลค่าคลังรวม',       value: `฿${fmtNum(summary.totalValue)}`, color: '#059669', bg: '#d1fae5' },
              { icon: 'warning',            label: 'สินค้าใกล้หมด',       value: `${summary.lowStockCount} รายการ`, color: '#d97706', bg: '#fef3c7' },
              { icon: 'remove_shopping_cart', label: 'หมดสต็อก',          value: `${summary.outOfStockCount} รายการ`, color: '#dc2626', bg: '#fee2e2' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
                  <span className="material-icons-round" style={{ fontSize: 22, color: c.color }}>{c.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 truncate">{c.label}</p>
                  <p className="font-bold text-slate-800 truncate">{c.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* สินค้าใกล้หมด */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="material-icons-round text-amber-500" style={{ fontSize: 18 }}>warning</span>
                สินค้าที่ต้องสั่งซื้อ
              </h3>
              {summary.lowStockItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">ไม่มีสินค้าใกล้หมด</p>
              ) : summary.lowStockItems.map(i => (
                <div key={i.id} className="flex justify-between items-center p-2.5 rounded-xl mb-2"
                  style={{ background: '#fafafa', border: '1px solid #f1f5f9' }}>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{i.name}</p>
                    <p className="text-xs text-slate-400">{i.code} · {i.location || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: i.currentStock === 0 ? '#dc2626' : '#d97706' }}>
                      {fmtNum(i.currentStock, 0)} {i.unit}
                    </p>
                    <p className="text-xs text-slate-400">ต่ำสุด: {fmtNum(i.minStock, 0)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* สรุปตามหมวดหมู่ */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="material-icons-round" style={{ fontSize: 18, color: warehouse.color }}>category</span>
                สรุปตามหมวดหมู่
              </h3>
              {Object.keys(summary.byCategory).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">ยังไม่มีข้อมูล</p>
              ) : (() => {
                const maxVal = Math.max(...Object.values(summary.byCategory).map(c => c.value), 1)
                return Object.entries(summary.byCategory).sort((a,b) => b[1].value - a[1].value).map(([cat, d]) => (
                  <div key={cat} className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{cat}</span>
                      <span className="text-slate-500">{d.count} รายการ · ฿{fmtNum(d.value, 0)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full transition-all"
                        style={{ width: `${(d.value / maxVal) * 100}%`, background: warehouse.color }} />
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Top 5 */}
          {summary.topValueItems && summary.topValueItems.length > 0 && (
            <div className="mt-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="material-icons-round text-yellow-500" style={{ fontSize: 18 }}>workspace_premium</span>
                Top 5 สินค้ามูลค่าสูงสุด
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['#','รหัส','ชื่อสินค้า','คงเหลือ','ราคา/หน่วย','มูลค่า'].map(h => (
                      <th key={h} className="p-2 text-left text-xs font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {summary.topValueItems.map((item, i) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td className="p-2 font-bold" style={{ color: warehouse.color }}>#{i+1}</td>
                        <td className="p-2 font-mono text-xs text-blue-700">{item.code}</td>
                        <td className="p-2 font-medium text-slate-800">{item.name}</td>
                        <td className="p-2 text-slate-600">{fmtNum(item.currentStock,0)} {item.unit}</td>
                        <td className="p-2 text-slate-600">฿{fmtNum(item.unitCost)}</td>
                        <td className="p-2 font-bold text-slate-800">฿{fmtNum(item.currentStock * item.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: รายการสินค้า
      ══════════════════════════════════════════════════════════ */}
      {tab === 'items' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2 flex-1">
              <div className="relative">
                <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 15 }}>search</span>
                <input type="text" placeholder="ค้นหารหัส / ชื่อ" className="form-input pl-9 py-2 text-sm w-52"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="form-input py-2 text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="">หมวดหมู่ทั้งหมด</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <select className="form-input py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">สถานะทั้งหมด</option>
                <option value="ok">ปกติ</option>
                <option value="low">ใกล้หมด</option>
                <option value="out">หมดสต็อก</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors hover:bg-slate-50"
                style={{ borderColor: '#e2e8f0', color: '#dc2626' }}>
                <span className="material-icons-round" style={{ fontSize: 15 }}>picture_as_pdf</span>
                {selectedIds.size > 0 ? `PDF (${selectedIds.size})` : 'PDF'}
              </button>
              <button onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors hover:bg-slate-50"
                style={{ borderColor: '#e2e8f0', color: '#059669' }}>
                <span className="material-icons-round" style={{ fontSize: 15 }}>table_chart</span>
                {selectedIds.size > 0 ? `Excel (${selectedIds.size})` : 'Excel'}
              </button>
            </div>
          </div>
          {selectedIds.size === 0 && (
            <p className="px-4 py-1.5 text-xs text-slate-400 bg-slate-50 border-b border-slate-100">
              เลือก checkbox เพื่อส่งออกเฉพาะรายการ หรือกดปุ่มเพื่อส่งออกทั้งหมดที่แสดง
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th className="p-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-blue-600" />
                </th>
                {['รหัส','ชื่อสินค้า','หมวด','คงเหลือ','จุดสั่งซื้อ','ราคา/หน่วย','มูลค่า','ที่เก็บ','สถานะ',canEdit?'จัดการ':''].filter(Boolean).map(h => (
                  <th key={h} className="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={canEdit ? 11 : 10} className="text-center text-slate-400 py-14">
                    <span className="material-icons-round block mx-auto mb-2" style={{ fontSize: 36 }}>inventory_2</span>
                    ไม่พบรายการสินค้า
                  </td></tr>
                ) : filteredItems.map((item, idx) => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50"
                    style={idx % 2 ? { background: '#fafbfc' } : {}}>
                    <td className="p-3">
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} className="w-4 h-4 accent-blue-600" />
                    </td>
                    <td className="p-3 font-mono text-xs font-bold text-blue-700">{item.code}</td>
                    <td className="p-3 font-medium text-slate-800">
                      {item.name}
                      {item.note && <p className="text-xs text-slate-400">{item.note}</p>}
                    </td>
                    <td className="p-3 text-slate-500 text-xs">{item.category}</td>
                    <td className="p-3 text-right font-semibold text-slate-800">
                      {fmtNum(item.currentStock, 0)} <span className="text-xs text-slate-400 font-normal">{item.unit}</span>
                    </td>
                    <td className="p-3 text-right text-slate-500">{fmtNum(item.minStock, 0)}</td>
                    <td className="p-3 text-right text-slate-600">฿{fmtNum(item.unitCost)}</td>
                    <td className="p-3 text-right font-semibold text-slate-800">฿{fmtNum(item.currentStock * item.unitCost)}</td>
                    <td className="p-3 text-xs text-slate-400">{item.location || '-'}</td>
                    <td className="p-3"><StockBadge item={item} /></td>
                    {canEdit && (
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button title="รับเข้า" onClick={() => openTxModal(item, 'receive')}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"><span className="material-icons-round" style={{ fontSize: 15 }}>add_circle</span></button>
                          <button title="เบิกออก" onClick={() => openTxModal(item, 'issue')}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><span className="material-icons-round" style={{ fontSize: 15 }}>remove_circle</span></button>
                          <button title="แก้ไข" onClick={() => openEdit(item)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"><span className="material-icons-round" style={{ fontSize: 15 }}>edit</span></button>
                          <button title="ลบ" onClick={() => deleteItem(item)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><span className="material-icons-round" style={{ fontSize: 15 }}>delete</span></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot><tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={canEdit ? 7 : 6} className="p-3 text-right text-sm font-semibold text-slate-600">
                    รวมมูลค่า ({filteredItems.length} รายการ)
                  </td>
                  <td className="p-3 text-right font-bold" style={{ color: warehouse.color }}>
                    ฿{fmtNum(filteredItems.reduce((s, i) => s + i.currentStock * i.unitCost, 0))}
                  </td>
                  <td colSpan={canEdit ? 3 : 2} />
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: รับเข้า / เบิก-จ่าย (shared UI)
      ══════════════════════════════════════════════════════════ */}
      {(tab === 'receive' || tab === 'issue') && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Quick form */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="material-icons-round" style={{ fontSize: 20, color: tab === 'receive' ? '#059669' : '#dc2626' }}>
                  {tab === 'receive' ? 'add_circle' : 'remove_circle'}
                </span>
                {tab === 'receive' ? 'บันทึกรับสินค้าเข้า' : 'บันทึกเบิก-จ่ายสินค้า'}
              </h3>

              {qError && <p className="mb-3 p-3 rounded-xl text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{qError}</p>}
              {qSuccess && <p className="mb-3 p-3 rounded-xl text-sm font-semibold text-green-700" style={{ background: '#d1fae5', border: '1px solid #6ee7b7' }}>{qSuccess}</p>}

              <div className="space-y-3">
                <div>
                  <label className="form-label">สินค้า *</label>
                  <select className="form-input" value={qItemId} onChange={e => { setQItemId(e.target.value); const it = items.find(i => i.id === e.target.value); if (it) setQCost(String(it.unitCost)) }}>
                    <option value="">-- เลือกสินค้า --</option>
                    {items.map(i => (
                      <option key={i.id} value={i.id}>{i.code} — {i.name} (คงเหลือ: {fmtNum(i.currentStock,0)} {i.unit})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">จำนวน *</label>
                    <input type="number" min="0" step="0.01" className="form-input" placeholder="0"
                      value={qQty} onChange={e => setQQty(e.target.value)} />
                  </div>
                  {tab === 'receive' && (
                    <div>
                      <label className="form-label">ราคา/หน่วย (฿)</label>
                      <input type="number" min="0" step="0.01" className="form-input" placeholder="0.00"
                        value={qCost} onChange={e => setQCost(e.target.value)} />
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">เลขที่เอกสาร</label>
                  <input className="form-input" placeholder="เช่น PO-2024-001" value={qRef} onChange={e => setQRef(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">หมายเหตุ</label>
                  <input className="form-input" placeholder="หมายเหตุ (ถ้ามี)" value={qNote} onChange={e => setQNote(e.target.value)} />
                </div>

                {/* Preview */}
                {qItemId && parseFloat(qQty) > 0 && (() => {
                  const it = items.find(i => i.id === qItemId)
                  if (!it) return null
                  const after = tab === 'receive' ? it.currentStock + parseFloat(qQty) : it.currentStock - parseFloat(qQty)
                  return (
                    <div className="p-3 rounded-xl text-sm" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                      <span className="text-slate-500">หลังดำเนินการ: </span>
                      <span className="font-bold" style={{ color: after < 0 ? '#dc2626' : warehouse.color }}>
                        {fmtNum(after, 0)} {it.unit}
                      </span>
                      {after < 0 && <span className="text-red-600 text-xs ml-2">⚠ สต็อกไม่เพียงพอ</span>}
                    </div>
                  )
                })()}

                <button onClick={() => submitQuick(tab === 'receive' ? 'receive' : 'issue')}
                  disabled={qSaving}
                  className="w-full py-2.5 rounded-xl font-bold text-white text-sm transition-opacity"
                  style={{ background: tab === 'receive' ? '#059669' : '#dc2626', opacity: qSaving ? 0.6 : 1 }}>
                  {qSaving
                    ? <><span className="material-icons-round spin" style={{ fontSize: 15 }}>refresh</span> กำลังบันทึก...</>
                    : tab === 'receive' ? 'บันทึกรับเข้า' : 'บันทึกเบิกออก'}
                </button>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-700 mb-3">รายการล่าสุด (50 รายการ)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['วันที่', 'เลขที่เอกสาร', 'สินค้า', 'จำนวน', 'ก่อน→หลัง', 'ผู้บันทึก'].map(h => (
                      <th key={h} className="p-2 text-left text-xs font-semibold text-slate-400">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {transactions
                      .filter(t => t.type === (tab === 'receive' ? 'receive' : 'issue'))
                      .slice(0, 50)
                      .map((t, idx) => (
                        <tr key={t.id} style={idx % 2 ? { background: '#fafbfc' } : {}}>
                          <td className="p-2 text-xs text-slate-500 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                          <td className="p-2 font-mono text-xs text-blue-600">{t.reference || '-'}</td>
                          <td className="p-2 text-slate-700">{t.itemName}<br /><span className="text-xs text-slate-400">{t.itemCode}</span></td>
                          <td className="p-2 font-bold" style={{ color: tab === 'receive' ? '#059669' : '#dc2626' }}>
                            {tab === 'receive' ? '+' : '-'}{fmtNum(t.quantity, 0)}
                          </td>
                          <td className="p-2 text-xs text-slate-500">{fmtNum(t.quantityBefore, 0)} → <span className="font-semibold text-slate-700">{fmtNum(t.quantityAfter, 0)}</span></td>
                          <td className="p-2 text-xs text-slate-400">{t.recorder}</td>
                        </tr>
                      ))}
                    {transactions.filter(t => t.type === (tab === 'receive' ? 'receive' : 'issue')).length === 0 && (
                      <tr><td colSpan={6} className="text-center text-slate-400 py-10">ยังไม่มีรายการ</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: ประวัติ
      ══════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 15 }}>search</span>
                <input type="text" placeholder="ค้นหารหัส / ชื่อ / เลขที่เอกสาร"
                  className="form-input pl-9 py-2 text-sm w-60"
                  value={txSearch} onChange={e => setTxSearch(e.target.value)} />
              </div>
              <select className="form-input py-2 text-sm" value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value)}>
                <option value="">ประเภททั้งหมด</option>
                <option value="receive">รับเข้า</option>
                <option value="issue">เบิกออก</option>
                <option value="adjust">ปรับยอด</option>
              </select>
            </div>
            <span className="text-xs text-slate-400">{filteredTx.length} รายการ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['วันที่/เวลา','เลขที่เอกสาร','รหัส','ชื่อสินค้า','ประเภท','จำนวน','ก่อน','หลัง','ผู้บันทึก','หมายเหตุ',''].map(h => (
                  <th key={h} className="p-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filteredTx.length === 0 ? (
                  <tr><td colSpan={11} className="text-center text-slate-400 py-14">
                    <span className="material-icons-round block mx-auto mb-2" style={{ fontSize: 36 }}>history</span>
                    ไม่พบประวัติการเคลื่อนไหว
                  </td></tr>
                ) : filteredTx.map((t, idx) => {
                  const info = TX_INFO[t.type]
                  return (
                    <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50"
                      style={idx % 2 ? { background: '#fafbfc' } : {}}>
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                      <td className="p-3 font-mono text-xs text-blue-600">{t.reference || '-'}</td>
                      <td className="p-3 font-mono text-xs font-bold text-slate-700">{t.itemCode}</td>
                      <td className="p-3 text-slate-800">{t.itemName}</td>
                      <td className="p-3">
                        <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
                          style={{ background: info.bg, color: info.color }}>
                          <span className="material-icons-round" style={{ fontSize: 12 }}>{info.icon}</span>
                          {info.label}
                        </span>
                      </td>
                      <td className="p-3 font-semibold" style={{ color: info.color }}>
                        {t.type === 'issue' ? '-' : '+'}{fmtNum(t.quantity, 0)}
                      </td>
                      <td className="p-3 text-slate-400">{fmtNum(t.quantityBefore, 0)}</td>
                      <td className="p-3 font-semibold text-slate-800">{fmtNum(t.quantityAfter, 0)}</td>
                      <td className="p-3 text-xs text-slate-400">{t.recorder}</td>
                      <td className="p-3 text-xs text-slate-400">{t.note || '-'}</td>
                      {canEdit && (
                        <td className="p-3 whitespace-nowrap">
                          <button onClick={() => openEditTx(t)} className="p-1 rounded hover:bg-blue-50 text-blue-400 mr-1">
                            <span className="material-icons-round" style={{ fontSize: 15 }}>edit</span>
                          </button>
                          <button onClick={() => handleDeleteTx(t)} className="p-1 rounded hover:bg-red-50 text-red-400">
                            <span className="material-icons-round" style={{ fontSize: 15 }}>delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ Modal: เพิ่ม/แก้ไขสินค้า ══════════════════════════════ */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{editingItem ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
              <button onClick={() => setShowItemModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {itemError && <div className="p-3 rounded-xl text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{itemError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">รหัสสินค้า *</label>
                  <input className="form-input" disabled={!!editingItem} placeholder="เช่น RM-001"
                    value={itemForm.code || ''} onChange={e => setItemForm(f => ({ ...f, code: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">หมวดหมู่ *</label>
                  <select className="form-input" value={itemForm.category || CATEGORIES[0]}
                    onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">ชื่อสินค้า *</label>
                <input className="form-input" placeholder="ชื่อสินค้าหรือวัตถุดิบ"
                  value={itemForm.name || ''} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">หน่วยนับ *</label>
                  <select className="form-input" value={PRESET_UNITS.includes(itemForm.unit || '') ? itemForm.unit : 'อื่นๆ'}
                    onChange={e => {
                      if (e.target.value === 'อื่นๆ') { setCustomUnit(''); setItemForm(f => ({ ...f, unit: '' })) }
                      else { setCustomUnit(''); setItemForm(f => ({ ...f, unit: e.target.value })) }
                    }}>
                    {PRESET_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                  {(!PRESET_UNITS.includes(itemForm.unit || '') || itemForm.unit === 'อื่นๆ' || (PRESET_UNITS.includes(itemForm.unit || '') && itemForm.unit === 'อื่นๆ')) && (
                    <input className="form-input mt-1" placeholder="ระบุหน่วยนับ เช่น ซอง, ลัง"
                      value={customUnit || (PRESET_UNITS.includes(itemForm.unit || '') ? '' : itemForm.unit || '')}
                      onChange={e => { setCustomUnit(e.target.value); setItemForm(f => ({ ...f, unit: e.target.value })) }} />
                  )}
                </div>
                <div>
                  <label className="form-label">สถานที่เก็บ</label>
                  <input className="form-input" placeholder="เช่น โกดัง A ชั้น 2"
                    value={itemForm.location || ''} onChange={e => setItemForm(f => ({ ...f, location: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {!editingItem && (
                  <div>
                    <label className="form-label">ยอดเริ่มต้น</label>
                    <input type="number" min="0" className="form-input"
                      value={itemForm.currentStock ?? 0} onChange={e => setItemForm(f => ({ ...f, currentStock: +e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className="form-label">จุดสั่งซื้อ</label>
                  <input type="number" min="0" className="form-input"
                    value={itemForm.minStock ?? 0} onChange={e => setItemForm(f => ({ ...f, minStock: +e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">ราคา/หน่วย (฿)</label>
                  <input type="number" min="0" step="0.01" className="form-input"
                    value={itemForm.unitCost ?? 0} onChange={e => setItemForm(f => ({ ...f, unitCost: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <input className="form-input" placeholder="หมายเหตุ (ถ้ามี)"
                  value={itemForm.note || ''} onChange={e => setItemForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowItemModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={saveItem} disabled={itemSaving} className="btn-primary">
                {itemSaving ? <><span className="material-icons-round spin" style={{ fontSize: 15 }}>refresh</span> บันทึก...</> : <><span className="material-icons-round" style={{ fontSize: 15 }}>save</span> บันทึก</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: แก้ไขรายการประวัติ ══════════════════════════════ */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">แก้ไขรายการ</h3>
                <p className="text-xs text-slate-500">{editingTx.itemCode} · {editingTx.itemName}</p>
              </div>
              <button onClick={() => setEditingTx(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editTxError && <p className="p-3 rounded-xl text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{editTxError}</p>}
              <div className="grid grid-cols-3 gap-2">
                {(['receive','issue','adjust'] as TxType[]).map(t => {
                  const info = TX_INFO[t]; const active = editTxForm.type === t
                  return (
                    <button key={t} onClick={() => setEditTxForm(f => ({ ...f, type: t }))}
                      className="flex flex-col items-center py-2 rounded-xl border-2 text-xs font-semibold transition-all"
                      style={active ? { borderColor: info.color, background: info.bg, color: info.color } : { borderColor: '#e2e8f0', color: '#64748b' }}>
                      <span className="material-icons-round mb-0.5" style={{ fontSize: 18 }}>{info.icon}</span>
                      {info.label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">จำนวน</label>
                  <input type="number" min="0" step="0.01" className="form-input"
                    value={editTxForm.quantity} onChange={e => setEditTxForm(f => ({ ...f, quantity: +e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">ราคา/หน่วย (฿)</label>
                  <input type="number" min="0" step="0.01" className="form-input"
                    value={editTxForm.unitCost} onChange={e => setEditTxForm(f => ({ ...f, unitCost: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">เลขที่เอกสาร</label>
                <input className="form-input" value={editTxForm.reference} onChange={e => setEditTxForm(f => ({ ...f, reference: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <input className="form-input" value={editTxForm.note} onChange={e => setEditTxForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setEditingTx(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={saveEditTx} disabled={editTxSaving} className="btn-primary">
                {editTxSaving ? 'บันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: รับ/เบิก/ปรับยอด ════════════════════════════════ */}
      {showTxModal && txItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">{TX_INFO[txModalType].label}</h3>
                <p className="text-xs text-slate-500">{txItem.code} · {txItem.name}</p>
              </div>
              <button onClick={() => setShowTxModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 rounded-xl flex justify-between" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <span className="text-sm text-slate-500">สต็อกปัจจุบัน</span>
                <span className="font-bold text-slate-800">{fmtNum(txItem.currentStock, 0)} {txItem.unit}</span>
              </div>
              {txError && <p className="p-3 rounded-xl text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{txError}</p>}

              {/* Type tabs */}
              <div className="grid grid-cols-3 gap-2">
                {(['receive','issue','adjust'] as TxType[]).map(t => {
                  const info = TX_INFO[t]; const active = txModalType === t
                  return (
                    <button key={t} onClick={() => setTxModalType(t)}
                      className="flex flex-col items-center py-2 rounded-xl border-2 text-xs font-semibold transition-all"
                      style={active ? { borderColor: info.color, background: info.bg, color: info.color } : { borderColor: '#e2e8f0', color: '#64748b' }}>
                      <span className="material-icons-round mb-0.5" style={{ fontSize: 18 }}>{info.icon}</span>
                      {info.label}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{txModalType === 'adjust' ? 'ยอดใหม่' : 'จำนวน'} ({txItem.unit})</label>
                  <input type="number" min="0" step="0.01" className="form-input" placeholder="0"
                    value={txForm.quantity || ''} onChange={e => setTxForm(f => ({ ...f, quantity: +e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">ราคา/หน่วย (฿)</label>
                  <input type="number" min="0" step="0.01" className="form-input"
                    value={txForm.unitCost || ''} onChange={e => setTxForm(f => ({ ...f, unitCost: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">เลขที่เอกสาร</label>
                <input className="form-input" placeholder="เช่น PO-001 (ถ้ามี)"
                  value={txForm.reference} onChange={e => setTxForm(f => ({ ...f, reference: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">หมายเหตุ</label>
                <input className="form-input" value={txForm.note}
                  onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              {txForm.quantity > 0 && (() => {
                const after = txModalType === 'receive' ? txItem.currentStock + txForm.quantity
                  : txModalType === 'issue' ? txItem.currentStock - txForm.quantity
                  : txForm.quantity
                return (
                  <div className="p-3 rounded-xl text-sm" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <span className="text-slate-500">หลังดำเนินการ: </span>
                    <span className="font-bold" style={{ color: after < 0 ? '#dc2626' : warehouse.color }}>{fmtNum(after, 0)} {txItem.unit}</span>
                  </div>
                )
              })()}
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowTxModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={saveTxModal} disabled={txSaving} className="btn-primary">
                {txSaving ? <><span className="material-icons-round spin" style={{ fontSize: 15 }}>refresh</span> บันทึก...</> : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT PAGE — orchestrates 3 phases
// ════════════════════════════════════════════════════════════════════════════
export default function InventoryPage() {
  const [user, setUser] = useState<User | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loadingWH, setLoadingWH] = useState(true)
  const [phase, setPhase] = useState<'select' | 'pin' | 'main'>('select')
  const [selectedWH, setSelectedWH] = useState<Warehouse | null>(null)
  const [showManage, setShowManage] = useState(false)

  const loadWarehouses = useCallback(() => {
    setLoadingWH(true)
    warehouseApi.getWarehouses()
      .then(r => { const res = r as { success: boolean; warehouses: Warehouse[] }; if (res.success) setWarehouses(res.warehouses) })
      .finally(() => setLoadingWH(false))
  }, [])

  useEffect(() => {
    const u = getSession(); setUser(u)
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) { setSelectedWH(JSON.parse(saved)); setPhase('main') }
    } catch {}
    loadWarehouses()
  }, [loadWarehouses])

  function handleSelectWH(wh: Warehouse) { setSelectedWH(wh); setPhase('pin') }
  function handlePINSuccess() { setPhase('main') }
  function handleExit() { sessionStorage.removeItem(SESSION_KEY); setPhase('select'); setSelectedWH(null) }

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <span className="material-icons-round spin text-blue-500" style={{ fontSize: 36 }}>refresh</span>
    </div>
  )

  return (
    <>
      {phase === 'select' && (
        <WarehouseSelect warehouses={warehouses} loading={loadingWH} onSelect={handleSelectWH}
          isAdmin={user.role === 'admin'} onManage={() => setShowManage(true)} />
      )}
      {phase === 'pin' && selectedWH && (
        <>
          <WarehouseSelect warehouses={warehouses} loading={loadingWH} onSelect={handleSelectWH}
            isAdmin={user.role === 'admin'} onManage={() => setShowManage(true)} />
          <PINModal warehouse={selectedWH} onSuccess={handlePINSuccess} onCancel={() => setPhase('select')} />
        </>
      )}
      {phase === 'main' && selectedWH && (
        <MainInventory warehouse={selectedWH} user={user} onExit={handleExit} />
      )}
      {showManage && (
        <WarehouseManageModal warehouses={warehouses} onClose={() => setShowManage(false)} onRefresh={loadWarehouses} />
      )}
    </>
  )
}
