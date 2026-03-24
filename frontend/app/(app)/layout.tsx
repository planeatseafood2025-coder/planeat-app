'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, clearSession } from '@/lib/auth'
import { invalidateCache } from '@/lib/cache'
import Sidebar from '@/components/layout/Sidebar'
import type { User } from '@/types'
import { thaiLongDate } from '@/lib/utils'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateStr, setDateStr] = useState('')
  const router = useRouter()

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    setUser(session)
    setDateStr(thaiLongDate())
    setLoading(false)
  }, [router])

  function handleLogout() {
    if (typeof window === 'undefined') return
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ef4444',
      }).then((r) => {
        if (r.isConfirmed) {
          clearSession()
          invalidateCache('*')
          router.push('/login')
        }
      })
    })
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f7fa' }}>
        <div className="text-center">
          <span className="material-icons-round spin text-blue-500" style={{ fontSize: 40 }}>refresh</span>
          <p className="mt-2 text-sm text-slate-500">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return (
    <div id="main-app" className="flex min-h-screen">
      <Sidebar user={user} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const sb = document.getElementById('sidebar')
                if (!sb) return
                if (window.innerWidth <= 768) sb.classList.toggle('mobile-open')
                else sb.classList.toggle('collapsed')
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <span className="material-icons-round" style={{ fontSize: 22 }}>menu</span>
            </button>
            <div>
              <div className="font-semibold text-slate-800 text-sm" id="page-title">ภาพรวม</div>
              <div className="text-xs text-slate-400 hidden sm:block">{dateStr}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-700">{user.name}</p>
              <p className="text-xs text-slate-400">
                {user.role === 'admin' ? 'ผู้ดูแลระบบ IT' :
                 user.role === 'accountant' ? 'ผู้จัดการฝ่ายบัญชี' :
                 user.role === 'recorder' ? 'พนักงานกรอกข้อมูล' : 'ผู้ตรวจสอบ'}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: '#eff6ff' }}
            >
              <span className="material-icons-round text-blue-600" style={{ fontSize: 18 }}>person</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
