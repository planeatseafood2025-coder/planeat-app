'use client'
import type { UserRecord, Role } from '@/types'
import { ROLE_LABELS, ROLE_COLORS } from '@/types'
import { STATUS_LABELS, STATUS_COLORS, PER_PAGE } from './_constants'

interface Props {
  users: UserRecord[]
  total: number
  page: number
  loading: boolean
  error: string
  searchInput: string
  search: string
  canManage: boolean
  onSearchInputChange: (v: string) => void
  onSearch: () => void
  onClearSearch: () => void
  onPageChange: (p: number) => void
  onRowClick: (u: UserRecord) => void
  onEdit: (u: UserRecord) => void
  onDelete: (username: string) => void
}

export default function UserTable({
  users, total, page, loading, error,
  searchInput, search, canManage,
  onSearchInputChange, onSearch, onClearSearch, onPageChange,
  onRowClick, onEdit, onDelete,
}: Props) {
  const totalPages = Math.ceil(total / PER_PAGE)

  function handleExportCSV() {
    const header = ['Username','ชื่อ','นามสกุล','ชื่อเล่น','ตำแหน่ง','เบอร์โทร','อีเมล','Role','สถานะ','LINE UID','วันที่สมัคร']
    const rows = users.map(u => [
      u.username,
      (u as any).firstName || '',
      (u as any).lastName || '',
      u.nickname || '',
      (u as any).jobTitle || '',
      (u as any).phone || '',
      (u as any).email || '',
      (u.roles?.length ? u.roles : [u.role]).join(';'),
      u.status,
      u.lineUid || '',
      u.createdAt ? new Date(u.createdAt).toLocaleDateString('th-TH') : '',
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `planeat_users_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Search bar */}
      <div className="card mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            className="form-input flex-1"
            placeholder="ค้นหา Username / ชื่อ-นามสกุล / ชื่อเล่น / เบอร์โทร..."
            value={searchInput}
            onChange={e => onSearchInputChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
          />
          <button className="btn-primary" onClick={onSearch}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>search</span>
            ค้นหา
          </button>
          {search && (
            <button className="btn-secondary" onClick={onClearSearch}>
              <span className="material-icons-round" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
          <button className="btn-secondary" title="ดาวน์โหลดข้อมูลผู้ใช้ทั้งหมด (CSV)" onClick={handleExportCSV}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>download</span>
            Export
          </button>
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
                  <tr key={u.username} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onClick={() => onRowClick(u)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{(page - 1) * PER_PAGE + i + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{u.username}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(u as any).linePictureUrl ? (
                          <img src={(u as any).linePictureUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-icons-round" style={{ fontSize: 15, color: '#94a3b8' }}>person</span>
                          </div>
                        )}
                        <span>{u.firstName || ''} {u.lastName || ''}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{u.nickname || '-'}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{u.phone || '-'}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{u.jobTitle || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span style={{ ...rc, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                        {(u.roles?.length ?? 0) > 1 && (
                          <span title={u.roles!.slice(1).map(r => ROLE_LABELS[r] ?? r).join(', ')}
                            style={{ padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#e2e8f0', color: '#475569', cursor: 'default' }}>
                            +{u.roles!.length - 1}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...sc, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {STATUS_LABELS[u.status] ?? u.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                      {canManage && (
                        <div className="flex gap-1">
                          <button onClick={() => onEdit(u)}
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                            <span className="material-icons-round align-middle" style={{ fontSize: 14 }}>edit</span>
                          </button>
                          <button onClick={() => onDelete(u.username)}
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
              <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: page === 1 ? '#f8fafc' : 'white', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>chevron_left</span>
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const n = start + i
                return (
                  <button key={n} onClick={() => onPageChange(n)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontWeight: n === page ? 700 : 400, background: n === page ? '#2563eb' : 'white', color: n === page ? 'white' : '#374151', cursor: 'pointer' }}>
                    {n}
                  </button>
                )
              })}
              <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
