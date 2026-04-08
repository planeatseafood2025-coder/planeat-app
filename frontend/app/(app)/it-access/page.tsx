'use client'
import { useState, useEffect, useCallback } from 'react'
import { usersApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import type { UserRecord, Role, UserStatus } from '@/types'
import { ROLE_LABELS, ROLE_COLORS, ADMIN_ROLES } from '@/types'

const ALL_ROLES: Role[] = [
  'super_admin', 'it_manager', 'it_support',
  'accounting_manager', 'accountant',
  'hr_manager', 'hr',
  'warehouse_manager', 'warehouse_staff',
  'production_manager', 'production_staff',
  'marketing_manager', 'marketing_staff',
  'engineering_manager', 'engineering_staff',
  'general_user',
]

const STATUS_LABELS: Record<UserStatus, string> = {
  active:    'ใช้งาน',
  pending:   'รอการอนุมัติ',
  suspended: 'ระงับ',
}
const STATUS_COLORS: Record<UserStatus, { bg: string; color: string }> = {
  active:    { bg: '#d1fae5', color: '#065f46' },
  pending:   { bg: '#fef9c3', color: '#a16207' },
  suspended: { bg: '#fee2e2', color: '#dc2626' },
}

const PER_PAGE = 20

export default function ITAccessPage() {
  const session = getSession()
  const myRole = session?.role ?? ''
  const canManage = ADMIN_ROLES.includes(myRole as Role)

  const [users, setUsers] = useState<UserRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit state
  const [editUser, setEditUser] = useState<UserRecord | null>(null)
  const [editRole, setEditRole] = useState<Role>('general_user')
  const [editStatus, setEditStatus] = useState<UserStatus>('active')
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const totalPages = Math.ceil(total / PER_PAGE)

  const loadUsers = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await usersApi.getUsers({ search, page, perPage: PER_PAGE }) as {
        success: boolean; users: UserRecord[]; total: number
      }
      setUsers(res.users || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally { setLoading(false) }
  }, [search, page])

  useEffect(() => { loadUsers() }, [loadUsers])

  function openEdit(u: UserRecord) {
    setEditUser(u); setEditRole(u.role); setEditStatus(u.status)
  }

  async function handleSave() {
    if (!editUser) return
    setSaving(true)
    try {
      await usersApi.updateUser(editUser.username, { role: editRole, status: editStatus })
      setEditUser(null); loadUsers()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  async function handleDelete(username: string) {
    setDeleting(true)
    try {
      await usersApi.deleteUser(username)
      setDeleteTarget(null); loadUsers()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally { setDeleting(false) }
  }

  function handleSearch() { setPage(1); setSearch(searchInput) }

  return (
    <div className="page-wrapper">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Access Control</h1>
          <p className="text-sm text-slate-500 mt-1">จัดการสิทธิ์และสถานะผู้ใช้งานทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="material-icons-round" style={{ fontSize: 16 }}>people</span>
          ทั้งหมด {total} คน
        </div>
      </div>

      {/* Search bar */}
      <div className="card mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            className="form-input flex-1"
            placeholder="ค้นหาชื่อ, username, เบอร์โทร..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn-primary" onClick={handleSearch}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>search</span>
            ค้นหา
          </button>
          {search && (
            <button className="btn-secondary" onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}>
              <span className="material-icons-round" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>
      )}

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['#', 'Username', 'ชื่อ-นามสกุล', 'ชื่อเล่น', 'เบอร์โทร', 'ตำแหน่ง', 'Role', 'สถานะ', 'จัดการ'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                  <span className="material-icons-round spin" style={{ fontSize: 24 }}>refresh</span>
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>ไม่พบผู้ใช้งาน</td></tr>
              ) : users.map((u, i) => {
                const rc = ROLE_COLORS[u.role] ?? { bg: '#f1f5f9', color: '#64748b' }
                const sc = STATUS_COLORS[u.status] ?? STATUS_COLORS.active
                return (
                  <tr key={u.username} style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{(page - 1) * PER_PAGE + i + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{u.username}</td>
                    <td style={{ padding: '10px 12px' }}>{u.firstName || ''} {u.lastName || ''}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{u.nickname || '-'}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{u.phone || '-'}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{u.jobTitle || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...rc, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...sc, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {STATUS_LABELS[u.status] ?? u.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {canManage && (
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(u)}
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                            <span className="material-icons-round align-middle" style={{ fontSize: 14 }}>edit</span>
                          </button>
                          <button onClick={() => setDeleteTarget(u.username)}
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                            <span className="material-icons-round align-middle" style={{ fontSize: 14 }}>delete</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-sm text-slate-500">หน้า {page} / {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: page === 1 ? '#f8fafc' : 'white', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>chevron_left</span>
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const n = start + i
                return (
                  <button key={n} onClick={() => setPage(n)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontWeight: n === page ? 700 : 400, background: n === page ? '#2563eb' : 'white', color: n === page ? 'white' : '#374151', cursor: 'pointer' }}>
                    {n}
                  </button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 className="text-base font-bold text-slate-800 mb-4">แก้ไขสิทธิ์ — {editUser.username}</h3>

            <div className="mb-4">
              <label className="form-label">Role</label>
              <select className="form-input" value={editRole} onChange={e => setEditRole(e.target.value as Role)}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
              </select>
            </div>

            <div className="mb-5">
              <label className="form-label">สถานะบัญชี</label>
              <select className="form-input" value={editStatus} onChange={e => setEditStatus(e.target.value as UserStatus)}>
                <option value="active">ใช้งาน</option>
                <option value="pending">รอการอนุมัติ</option>
                <option value="suspended">ระงับ</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center" onClick={handleSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button className="btn-secondary flex-1 justify-center" onClick={() => setEditUser(null)} disabled={saving}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="material-icons-round" style={{ fontSize: 20, color: '#dc2626' }}>warning</span>
              </div>
              <h3 className="text-base font-bold text-slate-800">ยืนยันการลบ</h3>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              ต้องการลบผู้ใช้ <strong>{deleteTarget}</strong> ออกจากระบบ?<br />
              <span className="text-red-500">การดำเนินการนี้ไม่สามารถเรียกคืนได้</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(deleteTarget)} disabled={deleting}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#dc2626', color: 'white', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#f1f5f9', color: '#374151', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
