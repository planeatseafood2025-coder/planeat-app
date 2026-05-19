'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crmB2bApi } from '@/lib/api'

type Contact = {
  _id: string
  accountId: string
  accountName?: string
  firstName: string
  lastName: string
  position: string
  department: string
  email: string
  phone: string
  isPrimary: boolean
  preferredLanguage: string
  notes?: string
}

type AccountLite = { _id: string; name: string }

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

export default function ContactsPage() {
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<AccountLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [filterCompany, setFilterCompany] = useState('all')
  const [filterCompanyText, setFilterCompanyText] = useState('')
  const [filterCompanyOpen, setFilterCompanyOpen] = useState(false)

  const [page, setPage] = useState(1)
  const [perPage] = useState(12)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [modal, setModal] = useState<{ open: boolean; data: Partial<Contact> }>({ open: false, data: {} })
  const [saving, setSaving] = useState(false)
  const [pickerText, setPickerText] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [cr, ar] = await Promise.all([
        crmB2bApi.getContacts(filterCompany !== 'all' ? filterCompany : undefined, page, perPage) as any,
        crmB2bApi.getAccounts({ page: 1, perPage: 1000 }) as any,
      ])
      const accs: AccountLite[] = ar.accounts || []
      const accMap = Object.fromEntries(accs.map(a => [a._id, a.name]))
      const list = (cr.contacts || []).map((c: any) => ({ ...c, accountName: accMap[c.accountId] || c.accountId }))
      setContacts(list)
      setAccounts(accs)
      const t = Number(cr.total ?? list.length)
      setTotal(t)
      setTotalPages(Math.max(1, Number(cr.totalPages ?? Math.ceil(t / perPage))))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [page, perPage, filterCompany])

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter(c => (`${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.position || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.accountName || '').toLowerCase().includes(q)))
  }, [contacts, search])

  const filterCompanyItems = useMemo(() => accounts.filter(a => a.name.toLowerCase().includes(filterCompanyText.toLowerCase())).slice(0, 80), [accounts, filterCompanyText])
  const pickerItems = useMemo(() => accounts.filter(a => a.name.toLowerCase().includes(pickerText.toLowerCase())).slice(0, 80), [accounts, pickerText])

  async function handleSave() {
    setSaving(true)
    try {
      if (modal.data._id) await crmB2bApi.updateContact(modal.data._id, modal.data)
      else await crmB2bApi.createContact(modal.data)
      setModal({ open: false, data: {} })
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบผู้ติดต่อนี้?')) return
    await crmB2bApi.deleteContact(id)
    await load()
  }

  function setField(k: string, v: any) {
    setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))
  }

  const from = total === 0 ? 0 : Math.min((page - 1) * perPage + 1, total)
  const to = Math.min(page * perPage, total)

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Contacts</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>กำลังแสดง {from}-{to} / ทั้งหมด {total} รายการ</p>
        </div>
        <button onClick={() => { setModal({ open: true, data: { isPrimary: false, preferredLanguage: 'en' } }); setPickerText('') }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          <span className='material-icons-round' style={{ fontSize: 18 }}>person_add</span>เพิ่มผู้ติดต่อ
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span className='material-icons-round' style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 18 }}>search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder='ค้นหาผู้ติดต่อ...' style={{ ...inputStyle, paddingLeft: 38, background: '#fff' }} />
        </div>
        <div style={{ width: 280, position: 'relative' }}>
          <input value={filterCompanyText} onChange={e => { setFilterCompanyText(e.target.value); setFilterCompanyOpen(true) }} onFocus={() => setFilterCompanyOpen(true)} placeholder='พิมพ์ค้นหาบริษัท (filter)' style={{ ...inputStyle, background: '#fff' }} />
          {filterCompanyOpen && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 40, maxHeight: 240, overflowY: 'auto', zIndex: 30, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <button onClick={() => { setFilterCompany('all'); setFilterCompanyText(''); setFilterCompanyOpen(false); setPage(1) }} style={{ width: '100%', textAlign: 'left', border: 'none', background: '#fff', padding: '8px 10px', cursor: 'pointer' }}>ทุกบริษัท</button>
              {filterCompanyItems.map(a => <button key={a._id} onClick={() => { setFilterCompany(a._id); setFilterCompanyText(a.name); setFilterCompanyOpen(false); setPage(1) }} style={{ width: '100%', textAlign: 'left', border: 'none', background: '#fff', padding: '8px 10px', cursor: 'pointer' }}>{a.name}</button>)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#2563eb', fontWeight: 600, fontSize: 14 }}>หน้า {page}/{totalPages}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setPage(1)} disabled={page <= 1}>{'«'}</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>{'‹'}</button>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{'›'}</button>
          <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}>{'»'}</button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>กำลังโหลด...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filteredContacts.map(c => (
            <div key={c._id} onClick={() => router.push('/crm-b2b/contacts/' + c._id)} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, cursor: 'pointer' }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.firstName} {c.lastName} {c.isPrimary && <span style={{ fontSize: 10, color: '#1d4ed8' }}>primary</span>}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{c.position}{c.department ? ` · ${c.department}` : ''}</div>
              <button onClick={(e) => { e.stopPropagation(); router.push(`/crm-b2b/accounts/${c.accountId}`) }} style={{ marginTop: 3, background: 'none', border: 'none', color: '#2563eb', padding: 0, cursor: 'pointer', fontSize: 12 }}>{c.accountName}</button>
              <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>{c.email || '-'}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>{c.phone || '-'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); setModal({ open: true, data: { ...c } }); setPickerText(c.accountName || '') }} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}>แก้ไข</button>
                <button onClick={(e) => { e.stopPropagation(); void handleDelete(c._id) }} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>ลบ</button>
              </div>
            </div>
          ))}
          {!filteredContacts.length && <div style={{ color: '#94a3b8' }}>ไม่พบผู้ติดต่อ</div>}
        </div>
      )}

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(540px,100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{modal.data._id ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ'}</h3>
              <button onClick={() => setModal({ open: false, data: {} })}>ปิด</button>
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บริษัท *</label>
                <input value={pickerText || (accounts.find(a => a._id === modal.data.accountId)?.name || '')} onChange={e => { setPickerText(e.target.value); setPickerOpen(true); if (!e.target.value) setField('accountId', '') }} onFocus={() => setPickerOpen(true)} placeholder='พิมพ์ชื่อบริษัทเพื่อเลือก' style={inputStyle} />
                {pickerOpen && <div style={{ position: 'absolute', left: 0, right: 0, top: 64, zIndex: 60, maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>{pickerItems.map(a => <button key={a._id} onClick={() => { setField('accountId', a._id); setPickerText(a.name); setPickerOpen(false) }} style={{ width: '100%', textAlign: 'left', border: 'none', background: '#fff', padding: '8px 10px', cursor: 'pointer' }}>{a.name}</button>)}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input placeholder='ชื่อ *' value={modal.data.firstName || ''} onChange={e => setField('firstName', e.target.value)} style={inputStyle} />
                <input placeholder='นามสกุล' value={modal.data.lastName || ''} onChange={e => setField('lastName', e.target.value)} style={inputStyle} />
                <input placeholder='ตำแหน่ง' value={modal.data.position || ''} onChange={e => setField('position', e.target.value)} style={inputStyle} />
                <input placeholder='แผนก' value={modal.data.department || ''} onChange={e => setField('department', e.target.value)} style={inputStyle} />
              </div>
              <input type='email' placeholder='อีเมล' value={modal.data.email || ''} onChange={e => setField('email', e.target.value)} style={inputStyle} />
              <input placeholder='เบอร์โทร' value={modal.data.phone || ''} onChange={e => setField('phone', e.target.value)} style={inputStyle} />
              <textarea placeholder='หมายเหตุ' rows={2} value={modal.data.notes || ''} onChange={e => setField('notes', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal({ open: false, data: {} })}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px' }}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
