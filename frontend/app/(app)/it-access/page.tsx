'use client'
import { useState, useEffect, useCallback } from 'react'
import { usersApi, settingsApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import type { UserRecord, Role, UserStatus, SystemSettings } from '@/types'
import { ADMIN_ROLES } from '@/types'
import Modal from '@/components/ui/Modal'
import UserTable from './UserTable'
import UserDetailModal from './UserDetailModal'
import ConnectionsTab from './ConnectionsTab'
import { PER_PAGE, DEFAULT_SETTINGS } from './_constants'

export default function ITAccessPage() {
  const session = getSession()
  const myRole = session?.role ?? ''
  const canManage = ADMIN_ROLES.includes(myRole as Role)

  const [activeTab, setActiveTab] = useState<'users' | 'connections'>('users')

  // ── Users state ──
  const [users, setUsers] = useState<UserRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [detailUser, setDetailUser] = useState<UserRecord | null>(null)
  const [detailEditMode, setDetailEditMode] = useState(false)

  const [editUser, setEditUser] = useState<UserRecord | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRoles, setEditRoles] = useState<Role[]>(['general_user'])
  const [editStatus, setEditStatus] = useState<UserStatus>('active')
  const [editPassword, setEditPassword] = useState('')
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({ labor: false, raw: false, chem: false, repair: false })
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Settings state ──
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')
  const [settingsMsgType, setSettingsMsgType] = useState<'ok' | 'err'>('ok')

  // ── Load ──
  const loadUsers = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await usersApi.getUsers({ search, page, perPage: PER_PAGE }) as { success: boolean; users: UserRecord[]; total: number }
      setUsers(res.users || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally { setLoading(false) }
  }, [search, page])

  useEffect(() => { if (activeTab === 'users') loadUsers() }, [activeTab, loadUsers])

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await settingsApi.get() as { success: boolean; settings: SystemSettings }
      if (res.settings) setSettings({ ...DEFAULT_SETTINGS, ...res.settings })
    } catch { /* ignore */ }
    finally { setSettingsLoading(false) }
  }, [])

  useEffect(() => { if (activeTab === 'connections') loadSettings() }, [activeTab, loadSettings])

  // ── Handlers ──
  function openEdit(u: UserRecord) {
    setEditUser(u)
    setEditFirstName((u as any).firstName || '')
    setEditLastName((u as any).lastName || '')
    setEditPhone((u as any).phone || '')
    setEditNickname(u.nickname || '')
    setEditJobTitle((u as any).jobTitle || '')
    setEditEmail((u as any).email || '')
    setEditRoles(u.roles?.length ? u.roles : [u.role])
    setEditStatus(u.status)
    setEditPassword('')
    setEditPerms({ labor: !!(u.permissions?.labor), raw: !!(u.permissions?.raw), chem: !!(u.permissions?.chem), repair: !!(u.permissions?.repair) })
  }

  function toggleRole(r: Role) {
    setEditRoles(prev => prev.includes(r) ? (prev.length > 1 ? prev.filter(x => x !== r) : prev) : [...prev, r])
  }

  async function handleSave() {
    if (!editUser) return
    setSaving(true)
    try {
      const payload: any = {
        role: editRoles[0], roles: editRoles, status: editStatus,
        firstName: editFirstName, lastName: editLastName, phone: editPhone,
        nickname: editNickname, jobTitle: editJobTitle, email: editEmail,
        permissions: editPerms,
      }
      if (editPassword) payload.password = editPassword
      await usersApi.updateUser(editUser.username, payload)
      setEditUser(null); setDetailEditMode(false); setDetailUser(null)
      loadUsers()
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

  async function handleSaveSettings() {
    setSettingsSaving(true); setSettingsMsg('')
    try {
      await settingsApi.update(settings)
      setSettingsMsg('บันทึกการตั้งค่าสำเร็จ'); setSettingsMsgType('ok')
    } catch (e: unknown) {
      setSettingsMsg(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); setSettingsMsgType('err')
    } finally { setSettingsSaving(false) }
  }

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Access Control</h1>
          <p className="text-sm text-slate-500 mt-1">จัดการสิทธิ์และสถานะผู้ใช้งานทั้งหมด</p>
        </div>
        {activeTab === 'users' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="material-icons-round" style={{ fontSize: 16 }}>people</span>
            ทั้งหมด {total} คน
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: '#f1f5f9', width: 'fit-content' }}>
        {[{ key: 'users', label: 'ผู้ใช้งาน', icon: 'manage_accounts' }, { key: 'connections', label: 'การเชื่อมต่อ', icon: 'cable' }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as 'users' | 'connections')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: activeTab === tab.key ? 'white' : 'transparent', color: activeTab === tab.key ? '#2563eb' : '#64748b',
              boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none' }}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: users */}
      {activeTab === 'users' && (
        <UserTable
          users={users} total={total} page={page} loading={loading} error={error}
          searchInput={searchInput} search={search} canManage={canManage}
          onSearchInputChange={setSearchInput}
          onSearch={() => { setPage(1); setSearch(searchInput) }}
          onClearSearch={() => { setSearchInput(''); setSearch(''); setPage(1) }}
          onPageChange={setPage}
          onRowClick={u => setDetailUser(u)}
          onEdit={u => { setDetailUser(u); openEdit(u); setDetailEditMode(true) }}
          onDelete={username => setDeleteTarget(username)}
        />
      )}

      {/* Tab: connections */}
      {activeTab === 'connections' && (
        <ConnectionsTab
          settings={settings} loading={settingsLoading} saving={settingsSaving}
          msg={settingsMsg} msgType={settingsMsgType} canManage={canManage}
          onSettingsChange={setSettings} onSave={handleSaveSettings}
        />
      )}

      {/* User Detail Modal */}
      <UserDetailModal
        user={detailUser} editMode={detailEditMode} canManage={canManage}
        editFirstName={editFirstName} editLastName={editLastName} editPhone={editPhone}
        editNickname={editNickname} editJobTitle={editJobTitle} editEmail={editEmail}
        editRoles={editRoles} editStatus={editStatus} editPassword={editPassword}
        editPerms={editPerms} saving={saving}
        onClose={() => setDetailUser(null)}
        onEnterEdit={() => { openEdit(detailUser!); setDetailEditMode(true) }}
        onCancelEdit={() => setDetailEditMode(false)}
        onSave={handleSave}
        onRequestDelete={username => { setDetailUser(null); setDeleteTarget(username) }}
        onToggleRole={toggleRole}
        setEditFirstName={setEditFirstName} setEditLastName={setEditLastName}
        setEditPhone={setEditPhone} setEditNickname={setEditNickname}
        setEditJobTitle={setEditJobTitle} setEditEmail={setEditEmail}
        setEditStatus={setEditStatus} setEditPassword={setEditPassword}
        setEditPerms={setEditPerms}
      />

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} width={360}>
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
          <button onClick={() => deleteTarget && handleDelete(deleteTarget)} disabled={deleting}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#dc2626', color: 'white', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
            {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
          </button>
          <button onClick={() => setDeleteTarget(null)} disabled={deleting}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#f1f5f9', color: '#374151', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            ยกเลิก
          </button>
        </div>
      </Modal>
    </div>
  )
}
