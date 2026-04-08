'use client'
import { useState, useEffect, useCallback } from 'react'
import { usersApi, settingsApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import type { UserRecord, Role, UserStatus, SystemSettings, LineOASetting, MainLineOA, ModuleConnections } from '@/types'
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

const DEFAULT_SETTINGS: SystemSettings = {
  mainLineOa: null,
  lineOaConfigs: [],
  moduleConnections: { expense: '', expenseName: '', inventory: '', inventoryName: '', crm: '', crmName: '', access: '', accessName: '' },
  smtpEmail: '',
  smtpPassword: '',
  smtpServer: 'smtp.gmail.com',
  smtpPort: 587,
  budgetReminderEnabled: true,
  budgetReminderMessageDay30: '📋 เดือนหน้าใกล้มาแล้ว กรุณาระบุงบประมาณประจำเดือน [เดือน] ในระบบ PlaNeat',
  budgetReminderMessageDay4: '⚠️ ยังไม่พบการระบุงบประมาณเดือน [เดือน] กรุณาดำเนินการในระบบ PlaNeat',
}

const MODULE_LABELS: { key: 'expense'|'inventory'|'crm'|'access'; nameKey: 'expenseName'|'inventoryName'|'crmName'|'accessName'; label: string; icon: string }[] = [
  { key: 'expense',   nameKey: 'expenseName',   label: 'ระบบควบคุมค่าใช้จ่าย', icon: 'receipt_long' },
  { key: 'inventory', nameKey: 'inventoryName', label: 'ระบบจัดการคลัง',        icon: 'inventory_2' },
  { key: 'crm',       nameKey: 'crmName',       label: 'ระบบลูกค้า (CRM)',       icon: 'people' },
  { key: 'access',    nameKey: 'accessName',    label: 'ระบบ Access Control',    icon: 'admin_panel_settings' },
]

export default function ITAccessPage() {
  const session = getSession()
  const myRole = session?.role ?? ''
  const canManage = ADMIN_ROLES.includes(myRole as Role)

  const [activeTab, setActiveTab] = useState<'users' | 'connections'>('users')

  // ── Users Tab ────────────────────────────────────────────
  const [users, setUsers] = useState<UserRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit User state
  const [editUser, setEditUser] = useState<UserRecord | null>(null)
  const [editNickname, setEditNickname] = useState('')
  const [editRole, setEditRole] = useState<Role>('general_user')
  const [editStatus, setEditStatus] = useState<UserStatus>('active')
  const [editPassword, setEditPassword] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete User confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const totalPages = Math.ceil(total / PER_PAGE)

  // ── Connections Tab ──────────────────────────────────────
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')
  const [settingsMsgType, setSettingsMsgType] = useState<'ok' | 'err'>('ok')
  const [showSmtpPass, setShowSmtpPass] = useState(false)

  // ── Main LINE state ──
  const [showMainToken, setShowMainToken] = useState(false)
  const [showMainSecret, setShowMainSecret] = useState(false)

  // ── Advanced LINE Configs State ──
  const [editLineMode, setEditLineMode] = useState<false | 'add' | 'edit'>(false)
  const [editLineConfig, setEditLineConfig] = useState<LineOASetting | null>(null)
  const [showLineToken, setShowLineToken] = useState(false)
  const [showLineSecret, setShowLineSecret] = useState(false)

  // ── Load users ───────────────────────────────────────────
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

  useEffect(() => {
    if (activeTab === 'users') loadUsers()
  }, [activeTab, loadUsers])

  // ── Load settings ────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await settingsApi.get() as { success: boolean; settings: SystemSettings }
      if (res.settings) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...res.settings,
        })
      }
    } catch { /* ignore */ }
    finally { setSettingsLoading(false) }
  }, [])

  useEffect(() => {
    if (activeTab === 'connections') loadSettings()
  }, [activeTab, loadSettings])

  // ── Handlers ─────────────────────────────────────────────
  function openEdit(u: UserRecord) {
    setEditUser(u)
    setEditNickname(u.nickname || '')
    setEditRole(u.role)
    setEditStatus(u.status)
    setEditPassword('')
  }

  async function handleSave() {
    if (!editUser) return
    setSaving(true)
    try {
      const payload: any = { role: editRole, status: editStatus, nickname: editNickname }
      if (editPassword) payload.password = editPassword
      await usersApi.updateUser(editUser.username, payload)
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

  // Settings Handlers
  async function handleSaveSettings() {
    setSettingsSaving(true); setSettingsMsg('')
    try {
      await settingsApi.update(settings)
      setSettingsMsg('บันทึกการตั้งค่าสำเร็จ')
      setSettingsMsgType('ok')
    } catch (e: unknown) {
      setSettingsMsg(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
      setSettingsMsgType('err')
    } finally { setSettingsSaving(false) }
  }

  // ── LINE Configs Handlers ──
  function openAddLine() {
    setEditLineMode('add')
    setEditLineConfig({
      id: crypto.randomUUID().split('-')[0],
      category: 'expense-control', // default
      name: '',
      token: '',
      channelId: '',
      channelSecret: '',
      mode: 'send',
      targetId: '',
    })
  }

  function openEditLine(c: LineOASetting) {
    setEditLineMode('edit')
    setEditLineConfig({ ...c })
  }

  function handleSaveLineConfig() {
    if (!editLineConfig) return
    if (!editLineConfig.name || !editLineConfig.token) {
      alert('กรุณากรอกชื่อ Note และ Token')
      return
    }

    setSettings(s => {
      const isNew = editLineMode === 'add'
      const configs = isNew 
        ? [...s.lineOaConfigs, editLineConfig]
        : s.lineOaConfigs.map(c => c.id === editLineConfig.id ? editLineConfig : c)
      return { ...s, lineOaConfigs: configs }
    })
    setEditLineMode(false)
  }

  function handleDeleteLineConfig(id: string) {
    if (!confirm('ยืนยันการลบ LINE Connection Note นี้? (คุณต้องกดบันทึกการตั้งค่าทั้งหมดถึงจะมีผลเปลี่ยนในระบบ)')) return
    setSettings(s => ({
      ...s,
      lineOaConfigs: s.lineOaConfigs.filter(c => c.id !== id)
    }))
  }

  // ─────────── Render ──────────────────────────────────────
  return (
    <div className="page-wrapper">
      {/* Page Header */}
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
        {[
          { key: 'users',       label: 'ผู้ใช้งาน',    icon: 'manage_accounts' },
          { key: 'connections', label: 'การเชื่อมต่อ',  icon: 'cable' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'users' | 'connections')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: activeTab === tab.key ? 'white' : 'transparent',
              color: activeTab === tab.key ? '#2563eb' : '#64748b',
              boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
            }}
          >
            <span className="material-icons-round" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: users ══════════ */}
      {activeTab === 'users' && (
        <>
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
        </>
      )}

      {/* ══════════ TAB: connections ══════════ */}
      {activeTab === 'connections' && (
        <div style={{ maxWidth: 860 }}>
          {settingsLoading ? (
            <div className="card flex items-center justify-center" style={{ padding: 48 }}>
              <span className="material-icons-round spin text-blue-400" style={{ fontSize: 28 }}>refresh</span>
            </div>
          ) : (
            <>
              {/* ══════════════════════════════════════════════════
                  1. การเชื่อมต่อหลัก — LINE เดียว
                  ใช้สำหรับ: OTP + แจ้งเตือนอนุมัติค่าใช้จ่าย
              ══════════════════════════════════════════════════ */}
              <div className="card mb-5">
                <div className="flex items-center gap-3 mb-1">
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 22, color: '#16a34a' }}>hub</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>การเชื่อมต่อหลัก</p>
                    <p className="text-xs text-slate-400 mt-0.5">LINE OA หลักของระบบ — ใช้ตัวเดียวสำหรับทุกการแจ้งเตือนพื้นฐาน</p>
                  </div>
                  {settings.mainLineOa?.token ? (
                    <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 600 }}>
                      เชื่อมต่อแล้ว
                    </span>
                  ) : (
                    <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8', fontSize: 12 }}>
                      ยังไม่ได้ตั้งค่า
                    </span>
                  )}
                </div>

                {/* ใช้สำหรับอะไร */}
                <div className="flex gap-2 mb-4 mt-3 flex-wrap">
                  {[
                    { icon: 'verified_user', label: 'รับ OTP บันทึกตัวตน (Access Control)' },
                    { icon: 'task_alt',      label: 'แจ้งเตือนอนุมัติค่าใช้จ่ายใน LINE' },
                  ].map(b => (
                    <div key={b.icon} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <span className="material-icons-round" style={{ fontSize: 15, color: '#16a34a' }}>{b.icon}</span>
                      <span style={{ fontSize: 12, color: '#166534' }}>{b.label}</span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                    <label className="form-label">Channel Access Token <span className="text-red-500">*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showMainToken ? 'text' : 'password'}
                        className="form-input"
                        placeholder="Bearer Token..."
                        value={settings.mainLineOa?.token ?? ''}
                        onChange={e => setSettings(s => ({ ...s, mainLineOa: { ...(s.mainLineOa ?? { channelId: '', channelSecret: '', targetId: '' }), token: e.target.value } }))}
                        style={{ paddingRight: 40 }}
                      />
                      <button type="button" onClick={() => setShowMainToken(v => !v)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        <span className="material-icons-round" style={{ fontSize: 18 }}>{showMainToken ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <label className="form-label">Channel Secret</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showMainSecret ? 'text' : 'password'}
                        className="form-input"
                        placeholder="Secret..."
                        value={settings.mainLineOa?.channelSecret ?? ''}
                        onChange={e => setSettings(s => ({ ...s, mainLineOa: { ...(s.mainLineOa ?? { token: '', channelId: '', targetId: '' }), channelSecret: e.target.value } }))}
                        style={{ paddingRight: 40 }}
                      />
                      <button type="button" onClick={() => setShowMainSecret(v => !v)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        <span className="material-icons-round" style={{ fontSize: 18 }}>{showMainSecret ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Channel ID</label>
                    <input className="form-input" placeholder="Channel ID..."
                      value={settings.mainLineOa?.channelId ?? ''}
                      onChange={e => setSettings(s => ({ ...s, mainLineOa: { ...(s.mainLineOa ?? { token: '', channelSecret: '', targetId: '' }), channelId: e.target.value } }))} />
                  </div>
                  <div>
                    <label className="form-label">Target ID (Group/User)</label>
                    <input className="form-input" placeholder="Group ID หรือ User ID..."
                      value={settings.mainLineOa?.targetId ?? ''}
                      onChange={e => setSettings(s => ({ ...s, mainLineOa: { ...(s.mainLineOa ?? { token: '', channelId: '', channelSecret: '' }), targetId: e.target.value } }))} />
                    <p className="text-[11px] text-slate-400 mt-1">ปล่อยว่าง = Broadcast ให้ทุกคนที่แอดบอท</p>
                  </div>

                  {/* Webhook URL */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Webhook URL <span className="text-slate-400 font-normal text-[11px]">(คัดลอกไปวางใน LINE Developer Console)</span></label>
                    <div className="flex items-center gap-2">
                      <code style={{ flex: 1, fontSize: 12, color: '#475569', background: '#f1f5f9', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all', border: '1px solid #e2e8f0' }}>
                        {(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001').replace(/\/$/, '')}/api/line/webhook/main
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001').replace(/\/$/, '')}/api/line/webhook/main`
                          navigator.clipboard.writeText(url)
                          alert('คัดลอก Webhook URL แล้ว!')
                        }}
                        style={{ padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', cursor: 'pointer', flexShrink: 0 }}>
                        <span className="material-icons-round" style={{ fontSize: 16 }}>content_copy</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">ใช้ config_id = <code className="bg-slate-100 px-1 rounded">main</code> สำหรับการเชื่อมต่อหลัก</p>
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════
                  2. ตั้งค่าการแจ้งเตือนแต่ละโมดูล
              ══════════════════════════════════════════════════ */}
              <div className="card mb-5">
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 22, color: '#2563eb' }}>notifications</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>ตั้งค่าการแจ้งเตือนแต่ละโมดูล</p>
                    <p className="text-xs text-slate-400 mt-0.5">กำหนด LINE Group ID ที่จะรับการแจ้งเตือนของแต่ละระบบ (ใช้ Token จากการเชื่อมต่อหลัก)</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {MODULE_LABELS.map(m => {
                    const groupId   = settings.moduleConnections?.[m.key]      ?? ''
                    const groupName = settings.moduleConnections?.[m.nameKey]   ?? ''
                    const mc = settings.moduleConnections ?? { expense: '', expenseName: '', inventory: '', inventoryName: '', crm: '', crmName: '', access: '', accessName: '' }
                    return (
                      <div key={m.key} className="p-3 rounded-xl" style={{ background: '#f8fafc', border: `1px solid ${groupId ? '#bbf7d0' : '#e2e8f0'}` }}>
                        {/* หัวแถว — ไอคอน + ชื่อโมดูล + สถานะ */}
                        <div className="flex items-center gap-2 mb-2">
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-icons-round" style={{ fontSize: 17, color: '#2563eb' }}>{m.icon}</span>
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1 }}>{m.label}</p>
                          {groupId ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 20 }}>เชื่อมต่อแล้ว</span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 20 }}>ยังไม่ได้ตั้งค่า</span>
                          )}
                        </div>
                        {/* fields */}
                        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                          <div>
                            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 3 }}>ชื่อกลุ่ม (เพื่อความจำ)</label>
                            <input
                              className="form-input"
                              style={{ padding: '4px 10px', fontSize: 12, height: 32 }}
                              placeholder="เช่น กลุ่มบัญชี, กลุ่มคลัง"
                              value={groupName}
                              onChange={e => setSettings(s => ({ ...s, moduleConnections: { ...mc, [m.nameKey]: e.target.value } }))}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 3 }}>LINE Group ID</label>
                            <input
                              className="form-input"
                              style={{ padding: '4px 10px', fontSize: 12, height: 32, fontFamily: 'monospace' }}
                              placeholder="C1234567890abcdef"
                              value={groupId}
                              onChange={e => setSettings(s => ({ ...s, moduleConnections: { ...mc, [m.key]: e.target.value } }))}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-3 p-3 rounded-lg" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <p className="text-xs text-blue-700 font-medium mb-1">วิธีหา LINE Group ID</p>
                  <p className="text-[11px] text-blue-600">เพิ่มบอท LINE OA เข้ากลุ่ม → ให้ใครพิมพ์ข้อความในกลุ่ม → ดู Group ID จาก Backend Logs</p>
                  <code className="text-[11px] text-blue-800 mt-1 block">docker-compose logs backend -f</code>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════
                  3. การเชื่อมต่อเมล
              ══════════════════════════════════════════════════ */}
              <div className="card mb-5">
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 22, color: '#2563eb' }}>email</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>การเชื่อมต่อเมล</p>
                    <p className="text-xs text-slate-400 mt-0.5">SMTP สำหรับส่ง OTP และการแจ้งเตือนทางอีเมล</p>
                  </div>
                  {!settings.smtpEmail && (
                    <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fef9c3', color: '#a16207', fontSize: 12 }}>
                      ยังไม่มีการแจ้งเตือนใด
                    </span>
                  )}
                </div>

                <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">อีเมลผู้ส่ง (SMTP Username)</label>
                    <input type="email" className="form-input" placeholder="your-email@gmail.com"
                      value={settings.smtpEmail ?? ''}
                      onChange={e => setSettings(s => ({ ...s, smtpEmail: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                    <label className="form-label">App Password</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showSmtpPass ? 'text' : 'password'} className="form-input"
                        placeholder="App password สำหรับ Gmail"
                        value={settings.smtpPassword ?? ''}
                        onChange={e => setSettings(s => ({ ...s, smtpPassword: e.target.value }))}
                        style={{ paddingRight: 40 }} />
                      <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        <span className="material-icons-round" style={{ fontSize: 18 }}>{showSmtpPass ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">SMTP Server</label>
                    <input type="text" className="form-input" placeholder="smtp.gmail.com"
                      value={settings.smtpServer ?? ''}
                      onChange={e => setSettings(s => ({ ...s, smtpServer: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">SMTP Port</label>
                    <input type="number" className="form-input" placeholder="587"
                      value={settings.smtpPort ?? 587}
                      onChange={e => setSettings(s => ({ ...s, smtpPort: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════
                  Budget Reminder (LINE Notify)
              ══════════════════════════════════════════════════ */}
              <div className="card mb-5">
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 22, color: '#ca8a04' }}>notifications_active</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>การแจ้งเตือนตั้งงบประมาณ</p>
                    <p className="text-xs text-slate-400 mt-0.5">ส่งข้อความ LINE ส่วนตัวไปยัง accounting_manager วันที่ 30 และวันที่ 4 ของเดือน</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">เปิดใช้</span>
                    <button type="button"
                      onClick={() => setSettings(s => ({ ...s, budgetReminderEnabled: !s.budgetReminderEnabled }))}
                      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: settings.budgetReminderEnabled ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background 0.2s' }}>
                      <span style={{ position: 'absolute', top: 3, left: settings.budgetReminderEnabled ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </button>
                  </div>
                </div>

                {settings.budgetReminderEnabled && (
                  <div className="grid gap-4">
                    <div>
                      <label className="form-label">ข้อความวันที่ 30 <span className="ml-1 text-slate-400 font-normal">ใช้ [เดือน] แทนชื่อเดือน</span></label>
                      <input type="text" className="form-input"
                        value={settings.budgetReminderMessageDay30 ?? ''}
                        onChange={e => setSettings(s => ({ ...s, budgetReminderMessageDay30: e.target.value }))}
                        placeholder="📋 เดือนหน้าใกล้มาแล้ว กรุณาระบุงบประมาณประจำเดือน [เดือน]" />
                      <p className="text-[11px] text-slate-400 mt-1">ส่งทุกวันที่ 30 เวลา 08:00 น.</p>
                    </div>
                    <div>
                      <label className="form-label">ข้อความวันที่ 4 <span className="ml-1 text-slate-400 font-normal">ใช้ [เดือน] แทนชื่อเดือน</span></label>
                      <input type="text" className="form-input"
                        value={settings.budgetReminderMessageDay4 ?? ''}
                        onChange={e => setSettings(s => ({ ...s, budgetReminderMessageDay4: e.target.value }))}
                        placeholder="⚠️ ยังไม่พบการระบุงบประมาณเดือน [เดือน]" />
                      <p className="text-[11px] text-slate-400 mt-1">ส่งวันที่ 4 เวลา 09:00 น. — เฉพาะกรณียังไม่ได้ตั้งงบ</p>
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                      <p className="text-xs text-amber-700 font-medium mb-1">ต้องการ LINE Notify Token</p>
                      <p className="text-[11px] text-amber-600">ผู้จัดการบัญชีต้องเชื่อมต่อ LINE Notify Token ในหน้าโปรไฟล์ก่อน</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Save */}
              {settingsMsg && (
                <div className="mb-4 p-3 rounded-xl text-sm"
                  style={{ background: settingsMsgType === 'ok' ? '#f0fdf4' : '#fef2f2', color: settingsMsgType === 'ok' ? '#15803d' : '#dc2626', border: `1px solid ${settingsMsgType === 'ok' ? '#bbf7d0' : '#fecaca'}` }}>
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round" style={{ fontSize: 18 }}>{settingsMsgType === 'ok' ? 'check_circle' : 'error'}</span>
                    <span className="font-medium">{settingsMsg}</span>
                  </div>
                </div>
              )}

              {canManage && (
                <button className="btn-primary" onClick={handleSaveSettings} disabled={settingsSaving}
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, borderRadius: 12 }}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>save</span>
                  {settingsSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าทั้งหมด'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── LINE Config Modal ── */}
      {editLineMode && editLineConfig && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 className="text-base font-bold text-slate-800 mb-4">{editLineMode === 'add' ? 'เพิ่ม LINE Connection Note' : 'แก้ไข LINE Connection Note'}</h3>

            <div className="mb-4">
              <label className="form-label">ชื่อ Note <span className="text-red-500">*</span></label>
              <input type="text" className="form-input w-full" placeholder="เช่น แจ้งเตือนฝ่ายบัญชี" 
                value={editLineConfig.name} onChange={e => setEditLineConfig(c => c ? { ...c, name: e.target.value } : null)} />
            </div>

            <div className="mb-4 relative">
              <label className="form-label">Channel Access Token <span className="text-red-500">*</span></label>
              <div style={{ position: 'relative' }}>
                <input type={showLineToken ? 'text' : 'password'} className="form-input w-full" placeholder="Bearer Token..."
                  value={editLineConfig.token} onChange={e => setEditLineConfig(c => c ? { ...c, token: e.target.value } : null)}
                  style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowLineToken(!showLineToken)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>{showLineToken ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            <div className="mb-4 relative">
              <label className="form-label">Channel Secret (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input type={showLineSecret ? 'text' : 'password'} className="form-input w-full" placeholder="Secret..."
                  value={editLineConfig.channelSecret} onChange={e => setEditLineConfig(c => c ? { ...c, channelSecret: e.target.value } : null)}
                  style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowLineSecret(!showLineSecret)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>{showLineSecret ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="form-label">Channel ID (Optional)</label>
                <input type="text" className="form-input w-full" placeholder="ID..." 
                  value={editLineConfig.channelId} onChange={e => setEditLineConfig(c => c ? { ...c, channelId: e.target.value } : null)} />
              </div>
              <div>
                <label className="form-label">Target ID (สำหรับ Push)</label>
                <input type="text" className="form-input w-full" placeholder="Group ID / User ID" 
                  value={editLineConfig.targetId} onChange={e => setEditLineConfig(c => c ? { ...c, targetId: e.target.value } : null)} />
                <p className="text-[10px] text-slate-400 mt-1">ปล่อยว่าง = Broadcast ให้ทุกคนที่แอดบอท</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="form-label">ระบบสามารถใช้การเชื่อมต่อนี้ทำอะไรได้บ้าง</label>
              <select className="form-input w-full" 
                value={editLineConfig.mode} onChange={e => setEditLineConfig(c => c ? { ...c, mode: e.target.value as any } : null)}>
                <option value="send">ส่งการแจ้งเตือนและการรายงาน (Push/Broadcast)</option>
                <option value="receive">รับข้อมูลอย่างเดียว</option>
                <option value="both">รองรับทั้งรับและส่ง</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center" onClick={handleSaveLineConfig}>
                เพิ่ม/อัปเดต Note <span className="text-xs ml-1">(อย่าลืมกด Save ใหญ่ด้านนอก)</span>
              </button>
              <button className="btn-secondary" onClick={() => setEditLineMode(false)}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 className="text-base font-bold text-slate-800 mb-4">แก้ไขสิทธิ์ — {editUser.username}</h3>

            <div className="mb-4">
              <label className="form-label">ชื่อเล่น</label>
              <input type="text" className="form-input" value={editNickname} onChange={e => setEditNickname(e.target.value)} />
            </div>

            <div className="mb-4">
              <label className="form-label">Role</label>
              <select className="form-input" value={editRole} onChange={e => setEditRole(e.target.value as Role)}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <label className="form-label">สถานะบัญชี</label>
              <select className="form-input" value={editStatus} onChange={e => setEditStatus(e.target.value as UserStatus)}>
                <option value="active">ใช้งาน</option>
                <option value="pending">รอการอนุมัติ</option>
                <option value="suspended">ระงับ</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="form-label">เปลี่ยนรหัสผ่าน (เว้นว่างไว้เพื่อไม่เปลี่ยน)</label>
              <input type="text" className="form-input" placeholder="ระบุรหัสผ่านใหม่..." value={editPassword} onChange={e => setEditPassword(e.target.value)} />
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

      {/* ── Delete User Confirm Modal ── */}
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
