'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { customerApi, workspaceApi } from '@/lib/api'
import type { Customer } from '@/types'
import ActivityTimeline from '@/components/crm/ActivityTimeline'

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading]   = useState(true)
  const [newTag, setNewTag]     = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [wsId, setWsId] = useState('')

  async function load() {
    setLoading(true)
    try {
      // Find workspace that owns this customer (Workaround since wsId is not in URL)
      // Usually, we'd pass wsId in state or URL query
      let targetWsId = ''
      const wsRes = await workspaceApi.getAll() as any
      const workspaces = wsRes.workspaces || []
      
      for (const ws of workspaces) {
        try {
          const res = await customerApi.get(ws.id, id) as { customer: Customer }
          if (res.customer) {
            targetWsId = ws.id
            setCustomer(res.customer)
            setWsId(ws.id)
            break
          }
        } catch (e) {
          // ignore 404
        }
      }
      
      if (!targetWsId) throw new Error('Not found')
      
    } catch { 
      router.push('/customers') 
    }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  async function handleAddTag() {
    if (!newTag.trim() || !customer || !wsId) return
    setAddingTag(true)
    try {
      await customerApi.addTag(wsId, customer.id, newTag.trim())
      setNewTag('')
      load()
    } catch { /* ignore */ } finally { setAddingTag(false) }
  }

  async function handleRemoveTag(tag: string) {
    if (!customer || !wsId) return
    try {
      await customerApi.removeTag(wsId, customer.id, tag)
      load()
    } catch { /* ignore */ }
  }

  async function handleToggleStatus() {
    if (!customer || !wsId) return
    try {
      await customerApi.update(wsId, customer.id, { status: customer.status === 'active' ? 'inactive' : 'active' })
      load()
    } catch { /* ignore */ }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
  if (!customer) return null

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/customers')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <span className="material-icons-round">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800 truncate">{customer.name}</h1>
          {customer.company && <p className="text-sm text-gray-500">{customer.company}</p>}
        </div>
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${customer.type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {customer.type}
        </span>
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${customer.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {customer.status === 'active' ? 'ใช้งาน' : 'ไม่ใช้งาน'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Contact Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="material-icons-round text-purple-500" style={{ fontSize: 18 }}>contact_phone</span>
              ข้อมูลติดต่อ
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">อีเมล</p>
                <p className="text-gray-700">{customer.email || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">เบอร์โทร</p>
                <p className="text-gray-700">{customer.phone || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">LINE Display Name</p>
                <p className="text-gray-700">{customer.lineDisplayName || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">LINE UID</p>
                <p className="text-gray-700 text-xs font-mono">{customer.lineUid || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">ที่อยู่</p>
                <p className="text-gray-700">{customer.address || '-'}</p>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="material-icons-round text-purple-500" style={{ fontSize: 18 }}>label</span>
              Tags
            </h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {customer.tags.length === 0 && <p className="text-sm text-gray-400">ยังไม่มี tag</p>}
              {customer.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 ml-0.5">
                    <span className="material-icons-round" style={{ fontSize: 13 }}>close</span>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                placeholder="เพิ่ม tag ใหม่..."
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
              />
              <button
                onClick={handleAddTag}
                disabled={addingTag || !newTag.trim()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--primary, #7c3aed)' }}
              >เพิ่ม</button>
            </div>
          </div>

          {/* Contacts (B2B) */}
          {customer.contacts && customer.contacts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <span className="material-icons-round text-purple-500" style={{ fontSize: 18 }}>people</span>
                ผู้ติดต่อ ({customer.contacts.length})
              </h2>
              <div className="space-y-3">
                {customer.contacts.map((cp, i) => (
                  <div key={i} className="p-3 rounded-lg bg-gray-50 text-sm">
                    <p className="font-medium text-gray-800">{cp.name}</p>
                    {cp.position && <p className="text-xs text-gray-500">{cp.position}</p>}
                    <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                      {cp.phone && <span>{cp.phone}</span>}
                      {cp.email && <span>{cp.email}</span>}
                      {cp.lineId && <span>LINE: {cp.lineId}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          {customer.note && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="material-icons-round text-purple-500" style={{ fontSize: 18 }}>notes</span>
                หมายเหตุ
              </h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{customer.note}</p>
            </div>
          )}

          {/* Meta */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">สร้างโดย</p>
                <p className="text-gray-700">{customer.createdBy}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">วันที่สร้าง</p>
                <p className="text-gray-700">{customer.createdAt?.slice(0, 10)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">อัปเดตล่าสุด</p>
                <p className="text-gray-700">{customer.updatedAt?.slice(0, 10)}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Column - Activities & Deals */}
        <div className="space-y-4">
          <ActivityTimeline targetId={customer.id} targetType="customer" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleToggleStatus}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border ${customer.status === 'active' ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
        >
          {customer.status === 'active' ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'}
        </button>
        <button
          onClick={() => router.push('/customers')}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          กลับรายการ
        </button>
      </div>
    </div>
  )
}
