'use client'
import { useState, useEffect } from 'react'
import { usersApi } from '@/lib/api'
import type { UserRecord, Role } from '@/types'
import { ROLE_LABELS, ROLE_COLORS, PAGE_ACCESS } from '@/types'

const ALL_PAGES = [
  { key: 'overview',   label: 'ภาพรวม' },
  { key: 'expense',    label: 'บันทึกรายจ่าย' },
  { key: 'budget',     label: 'งบประมาณ' },
  { key: 'employees',  label: 'ข้อมูลพนักงาน' },
  { key: 'inventory',  label: 'คลังสินค้า' },
  { key: 'documents',  label: 'เอกสาร' },
  { key: 'it-access',  label: 'Access Control' },
]

const ALL_ROLES: Role[] = ['admin', 'accountant', 'recorder', 'viewer']

export default function ITAccessPage() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    usersApi.getUsers().then((res: unknown) => {
      const r = res as { success: boolean; users: UserRecord[] }
      setUsers(r.users || [])
      setLoading(false)
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <span className="material-icons-round spin text-blue-400" style={{ fontSize: 40 }}>refresh</span>
    </div>
  )

  if (error) return (
    <div className="text-center py-12"><p className="text-red-500">{error}</p></div>
  )

  return (
    <div className="page-section active space-y-6">
      {/* User table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span className="material-icons-round text-blue-500" style={{ fontSize: 18 }}>group</span>
            รายชื่อผู้ใช้งาน ({users.length} คน)
          </h3>
        </div>
        <div className="overflow-x-auto">
          {users.length === 0 ? (
            <div className="py-10 text-center">
              <span className="material-icons-round text-slate-300" style={{ fontSize: 36 }}>group</span>
              <p className="text-sm text-slate-400 mt-1">ไม่มีผู้ใช้งาน</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">ชื่อ / Username</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">แรงงาน</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">วัตถุดิบ</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">เคมี/หีบห่อ</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">ซ่อมแซม</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const rc = ROLE_COLORS[u.role] || { bg: '#f1f5f9', color: '#64748b' }
                  const isAdminAcc = u.role === 'admin' || u.role === 'accountant'
                  return (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 text-sm">{u.name}</p>
                        <p className="text-xs text-slate-400">@{u.username}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: rc.bg, color: rc.color }}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      {(['labor','raw','chem','repair'] as const).map((cat) => {
                        const allowed = isAdminAcc || u[cat]
                        return (
                          <td key={cat} className="px-4 py-3 text-center">
                            <span className="material-icons-round" style={{ fontSize: 18, color: allowed ? '#10b981' : '#cbd5e1' }}>
                              {allowed ? 'check_circle' : 'remove_circle_outline'}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Access Matrix */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span className="material-icons-round text-blue-500" style={{ fontSize: 18 }}>admin_panel_settings</span>
            ตารางสิทธิ์การเข้าถึง (Role Matrix)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">หน้า</th>
                {ALL_ROLES.map((role) => {
                  const rc = ROLE_COLORS[role]
                  return (
                    <th key={role} className="px-4 py-3 text-center text-xs font-bold uppercase" style={{ color: rc.color }}>
                      {ROLE_LABELS[role]}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {ALL_PAGES.map((page, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{page.label}</td>
                  {ALL_ROLES.map((role) => {
                    const allowed = (PAGE_ACCESS[page.key] || ['admin']).includes(role)
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <span className="material-icons-round" style={{ fontSize: 18, color: allowed ? '#10b981' : '#cbd5e1' }}>
                          {allowed ? 'check_circle' : 'remove_circle_outline'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
