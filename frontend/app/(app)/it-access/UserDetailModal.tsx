'use client'
import type { UserRecord, Role, UserStatus } from '@/types'
import { ROLE_LABELS, ROLE_COLORS } from '@/types'
import Modal from '@/components/ui/Modal'
import { ALL_ROLES, STATUS_LABELS, STATUS_COLORS } from './_constants'

interface Props {
  user: UserRecord | null
  editMode: boolean
  canManage: boolean
  // edit field values
  editFirstName: string
  editLastName: string
  editPhone: string
  editNickname: string
  editJobTitle: string
  editEmail: string
  editRoles: Role[]
  editStatus: UserStatus
  editPassword: string
  editPerms: Record<string, boolean>
  saving: boolean
  // callbacks
  onClose: () => void
  onEnterEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onRequestDelete: (username: string) => void
  onToggleRole: (r: Role) => void
  setEditFirstName: (v: string) => void
  setEditLastName: (v: string) => void
  setEditPhone: (v: string) => void
  setEditNickname: (v: string) => void
  setEditJobTitle: (v: string) => void
  setEditEmail: (v: string) => void
  setEditStatus: (v: UserStatus) => void
  setEditPassword: (v: string) => void
  setEditPerms: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void
}

export default function UserDetailModal({
  user, editMode, canManage,
  editFirstName, editLastName, editPhone, editNickname, editJobTitle, editEmail,
  editRoles, editStatus, editPassword, editPerms, saving,
  onClose, onEnterEdit, onCancelEdit, onSave, onRequestDelete, onToggleRole,
  setEditFirstName, setEditLastName, setEditPhone, setEditNickname,
  setEditJobTitle, setEditEmail, setEditStatus, setEditPassword, setEditPerms,
}: Props) {
  if (!user) return null

  return (
    <Modal open={!!user} onClose={() => { if (!editMode) onClose() }} width={480}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        {user.linePictureUrl ? (
          <img src={user.linePictureUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-icons-round" style={{ fontSize: 22, color: '#94a3b8' }}>person</span>
          </div>
        )}
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
            {user.firstName} {user.lastName}
            {user.nickname ? <span style={{ fontWeight: 400, color: '#64748b', fontSize: 13 }}> ({user.nickname})</span> : ''}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>{user.username}</p>
        </div>
      </div>

      {/* View mode */}
      {!editMode && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, overflowY: 'auto' }}>
          {[
            { label: 'ตำแหน่ง',      value: (user as any).jobTitle || '-' },
            { label: 'ชื่อเล่น',      value: user.nickname || '-' },
            { label: 'เบอร์โทร',      value: user.phone || '-' },
            { label: 'อีเมล',         value: (user as any).email || '-' },
            { label: 'LINE Display',  value: user.lineDisplayName || '-' },
            { label: 'LINE UID',      value: user.lineUid || '-', mono: true },
            { label: 'วันที่สมัคร',   value: user.createdAt ? new Date(user.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-' },
            { label: 'Login ผ่าน',    value: (user as any).loginType === 'line' ? 'LINE' : 'Username/Password' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#94a3b8', minWidth: 100, flexShrink: 0 }}>{row.label}</span>
              <span style={{ color: '#1e293b', fontFamily: (row as any).mono ? 'monospace' : undefined, fontSize: (row as any).mono ? 11 : 13, wordBreak: 'break-all' }}>{row.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: '#94a3b8', minWidth: 100, flexShrink: 0 }}>Role</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(user.roles?.length ? user.roles : [user.role]).map(r => {
                const rc = ROLE_COLORS[r as Role] ?? { bg: '#f1f5f9', color: '#64748b' }
                return <span key={r} style={{ ...rc, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{ROLE_LABELS[r as Role] ?? r}</span>
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', minWidth: 100, flexShrink: 0 }}>สถานะ</span>
            {(() => { const sc = STATUS_COLORS[user.status] ?? STATUS_COLORS.active; return <span style={{ ...sc, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{STATUS_LABELS[user.status] ?? user.status}</span> })()}
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editMode && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', fontSize: 13 }}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">ชื่อ</label><input className="form-input" value={editFirstName} onChange={e => setEditFirstName(e.target.value)} placeholder="ชื่อจริง" /></div>
            <div><label className="form-label">นามสกุล</label><input className="form-input" value={editLastName} onChange={e => setEditLastName(e.target.value)} placeholder="นามสกุล" /></div>
            <div><label className="form-label">ชื่อเล่น</label><input className="form-input" value={editNickname} onChange={e => setEditNickname(e.target.value)} placeholder="ชื่อเล่น" /></div>
            <div><label className="form-label">เบอร์โทร</label><input className="form-input" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="0812345678" /></div>
            <div><label className="form-label">ตำแหน่งงาน</label><input className="form-input" value={editJobTitle} onChange={e => setEditJobTitle(e.target.value)} placeholder="เช่น บัญชี, ฝ่ายขาย" /></div>
            <div><label className="form-label">อีเมล</label><input type="email" className="form-input" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="example@email.com" /></div>
          </div>

          <div>
            <label className="form-label">Role <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>(เลือกได้หลาย role)</span></label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {ALL_ROLES.map(r => {
                const active = editRoles.includes(r)
                const rc = ROLE_COLORS[r] ?? { bg: '#f1f5f9', color: '#64748b' }
                return (
                  <button key={r} type="button" onClick={() => onToggleRole(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8,
                      border: `1.5px solid ${active ? rc.color : '#e2e8f0'}`,
                      background: active ? rc.bg : '#f8fafc', cursor: 'pointer',
                      fontSize: 12, fontWeight: active ? 600 : 400, color: active ? rc.color : '#64748b', textAlign: 'left' }}>
                    <span className="material-icons-round" style={{ fontSize: 14, color: active ? rc.color : '#cbd5e1' }}>
                      {active ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    {ROLE_LABELS[r] ?? r}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="form-label">สิทธิ์ดูข้อมูลหมวดหมู่</label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {([['labor','ค่าแรง'],['raw','วัตถุดิบ'],['chem','เคมี/หีบห่อ'],['repair','ซ่อมบำรุง']] as [string,string][]).map(([key, label]) => {
                const on = editPerms[key]
                return (
                  <button key={key} type="button" onClick={() => setEditPerms(p => ({ ...p, [key]: !p[key] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8,
                      border: `1.5px solid ${on ? '#2563eb' : '#e2e8f0'}`,
                      background: on ? '#eff6ff' : '#f8fafc', cursor: 'pointer',
                      fontSize: 12, fontWeight: on ? 600 : 400, color: on ? '#2563eb' : '#64748b', textAlign: 'left' }}>
                    <span className="material-icons-round" style={{ fontSize: 14, color: on ? '#2563eb' : '#cbd5e1' }}>
                      {on ? 'toggle_on' : 'toggle_off'}
                    </span>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="form-label">สถานะบัญชี</label>
            <select className="form-input" value={editStatus} onChange={e => setEditStatus(e.target.value as UserStatus)}>
              <option value="active">ใช้งาน</option>
              <option value="pending">รอการอนุมัติ</option>
              <option value="suspended">ระงับ</option>
            </select>
          </div>

          <div>
            <label className="form-label">เปลี่ยนรหัสผ่าน <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>(เว้นว่างถ้าไม่เปลี่ยน)</span></label>
            <input type="text" className="form-input" placeholder="รหัสผ่านใหม่..." value={editPassword} onChange={e => setEditPassword(e.target.value)} />
          </div>
        </div>
      )}

      {/* Footer */}
      {canManage && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
          {!editMode ? (
            <>
              <button onClick={onEnterEdit}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#eff6ff', color: '#2563eb', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <span className="material-icons-round align-middle" style={{ fontSize: 14, marginRight: 4 }}>edit</span>แก้ไข
              </button>
              <button onClick={() => onRequestDelete(user.username)}
                style={{ padding: '8px 16px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <span className="material-icons-round align-middle" style={{ fontSize: 14 }}>delete</span>
              </button>
            </>
          ) : (
            <>
              <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancelEdit} disabled={saving}>
                ยกเลิก
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
